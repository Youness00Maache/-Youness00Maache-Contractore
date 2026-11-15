/**
 * Job page › Files: one document in a window. Name, category, tags and note (editable), open / download, "Show in client
 * portal" (images and links; a PDF says why not and suggests a link), versions ("Upload new version", the older ones
 * folded away, delete one version or the whole document, both after a question).
 * Every change needs a connection and a Premium plan; the window says so instead of failing quietly.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import {
    addJobFileVersion, deleteJobFile, deleteJobFileVersions, isPlanLimitError, setJobFileShared, updateJobFile,
} from '../../lib/jobFiles/jobFilesApi.ts';
import { formatBytes, normalizeTags, validateFile, validateLink } from '../../lib/jobFiles/jobFileLogic.ts';
import type { JobFile, JobFileGroup } from '../../lib/jobFiles/jobFileTypes.ts';
import { FILES_PREMIUM_REASON, FILE_ACCEPT, linkHost, shareInfo, shortDate, stampOf, versionBadge } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { ConfirmDialog, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { ChevronDownIcon, DownloadIcon, ExternalLinkIcon, StarIcon, TrashIcon } from '../Icons.tsx';
import { FileFields, type FileFieldsValue } from './AddFileModal.tsx';
import { SwitchRow, TypeStamp } from './ui.tsx';
import { openJobFile } from './openJobFile.ts';

const initial = (f: JobFile): FileFieldsValue => ({ title: f.title, category: f.category, tags: f.tags.join(', '), notes: f.notes || '', url: f.url || '' });

type Pending = { kind: 'version'; file: JobFile } | { kind: 'all' } | null;

const JobFileDetail: React.FC<{
    group: JobFileGroup;
    userId: string;
    isOnline: boolean;
    /** Premium: Free accounts can look but not change */
    canEdit: boolean;
    onClose: () => void;
    onUpsert: (...saved: JobFile[]) => void;
    onRemoved: (...ids: string[]) => void;
    onUpgrade: (reason?: string) => void;
}> = ({ group, userId, isOnline, canEdit, onClose, onUpsert, onRemoved, onUpgrade }) => {
    const latest = group.latest;
    const isLink = latest.kind === 'link';
    const [v, setV] = useState<FileFieldsValue>(() => initial(latest));
    const [saving, setSaving] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [pending, setPending] = useState<Pending>(null);
    const [urlError, setUrlError] = useState('');
    const versionInput = useRef<HTMLInputElement>(null);

    // a different version became the newest (a new upload): start the form from it
    useEffect(() => { setV(initial(latest)); setUrlError(''); }, [latest.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const dirty = useMemo(() => {
        const a = initial(latest);
        return v.title.trim() !== a.title || v.category !== a.category || v.notes.trim() !== a.notes.trim()
            || normalizeTags(v.tags).join(',') !== latest.tags.join(',') || (isLink && v.url.trim() !== a.url);
    }, [v, latest, isLink]);

    const share = shareInfo(latest);
    const olderShared = group.versions.find(x => x.id !== latest.id && x.sharedInPortal);
    const clientSeesOlder = !latest.sharedInPortal && !!olderShared;

    // ------------------------------------------------------------------------------ guards
    const needPremium = (): boolean => {
        if (canEdit) return true;
        onUpgrade(FILES_PREMIUM_REASON);
        return false;
    };
    const needOnline = (): boolean => {
        if (isOnline) return true;
        toast.error(NEEDS_CONNECTION);
        return false;
    };
    const fail = (e: unknown, fallback: string) => {
        if (isPlanLimitError(e)) onUpgrade(planLimitMessage(e));
        else toast.error(describeError(e, fallback));
    };

    // ------------------------------------------------------------------------------ actions
    const save = async () => {
        if (!needPremium() || !needOnline() || saving) return;
        if (isLink) {
            const c = validateLink(v.url);
            if (!c.ok) { setUrlError(c.error); return; }
        }
        setSaving(true);
        try {
            const saved = await updateJobFile(latest.id, {
                title: v.title, category: v.category, notes: v.notes, tags: normalizeTags(v.tags), ...(isLink ? { url: v.url } : {}),
            });
            onUpsert(saved);
            toast.success('Saved.');
        } catch (e) {
            fail(e, 'The changes could not be saved.');
        } finally {
            setSaving(false);
        }
    };

    const open = async (f: JobFile, download: boolean) => {
        if (!needOnline()) return;
        setBusy(`${download ? 'dl' : 'open'}-${f.id}`);
        try {
            if (!(await openJobFile(f, { download }))) toast.error('The file could not be opened. Try again.');
        } finally {
            setBusy(null);
        }
    };

    const setShared = async (f: JobFile, next: boolean) => {
        if (!needPremium() || !needOnline()) return;
        setBusy(`share-${f.id}`);
        try {
            const saved = await setJobFileShared(f, next, userId);
            onUpsert(saved);
            // the client always sees the newest shown version: when it is switched on, the older shown copies can go
            if (next) {
                const olds = group.versions.filter(x => x.id !== f.id && x.sharedInPortal && x.version < f.version);
                for (const o of olds) { try { onUpsert(await setJobFileShared(o, false, userId)); } catch { /* the newest is shown; keep going */ } }
            }
        } catch (e) {
            fail(e, 'The change could not be saved.');
        } finally {
            setBusy(null);
        }
    };

    const uploadVersion = async (file: File | undefined) => {
        if (versionInput.current) versionInput.current.value = '';
        if (!file || !needPremium() || !needOnline()) return;
        const problem = validateFile(file);
        if (problem) { toast.error(problem); return; }
        setBusy('version');
        try {
            const saved = await addJobFileVersion(userId, latest, { file, fileName: file.name });
            onUpsert(saved);
            toast.success(`Added v${saved.version} of “${saved.title}”.`);
        } catch (e) {
            fail(e, 'The new version could not be added.');
        } finally {
            setBusy(null);
        }
    };

    const confirmDelete = async () => {
        if (!pending || !needPremium() || !needOnline()) return;
        setBusy('delete');
        try {
            if (pending.kind === 'all') {
                await deleteJobFileVersions(group.versions);
                onRemoved(...group.versions.map(x => x.id));
                toast.success('Deleted.');
            } else {
                await deleteJobFile(pending.file);
                onRemoved(pending.file.id);
                toast.success(`Deleted v${pending.file.version}.`);
            }
            setPending(null);
        } catch (e) {
            fail(e, 'The file could not be deleted.');
        } finally {
            setBusy(null);
        }
    };

    // ------------------------------------------------------------------------------ pieces
    // a plain function (not a component): a component defined in here would remount its rows on each render
    const versionLine = (f: JobFile, current = false) => (
        <li key={f.id} className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5', !current && 'bg-muted/30')}>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                    <span className="tabular-nums">v{f.version}</span>
                    {current && <span className="ml-1.5 text-xs font-medium text-muted-foreground">current</span>}
                    {f.sharedInPortal && <span className="ml-1.5 text-xs font-medium text-primary">shown to client</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{[shortDate(f.createdAt), f.sizeBytes ? formatBytes(f.sizeBytes) : '', f.fileName || ''].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex shrink-0 items-center">
                <button type="button" className="btn btn-ghost h-10 px-2.5 text-sm" onClick={() => { void open(f, false); }} disabled={busy !== null} aria-label={`Open v${f.version}`}><ExternalLinkIcon className="h-4 w-4" /> Open</button>
                <button type="button" className="btn btn-ghost h-10 w-10 p-0" onClick={() => { void open(f, true); }} disabled={busy !== null} aria-label={`Download v${f.version}`}><DownloadIcon className="h-4 w-4" /></button>
                {!current && f.sharedInPortal && canEdit && <button type="button" className="btn btn-ghost h-10 px-2 text-xs" onClick={() => { void setShared(f, false); }} disabled={busy !== null}>Hide</button>}
                {canEdit && <button type="button" className="btn btn-ghost h-10 w-10 p-0 text-destructive" onClick={() => setPending({ kind: 'version', file: f })} disabled={busy !== null} aria-label={`Delete v${f.version}`}><TrashIcon className="h-4 w-4" /></button>}
            </div>
        </li>
    );

    const older = group.versions.filter(x => x.id !== latest.id);

    return (
        <>
            <Modal
                open
                onClose={onClose}
                busy={saving || busy !== null}
                size="md"
                title={latest.title}
                description={(
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <TypeStamp text={stampOf(latest)} className="h-6 w-9 text-[9px]" />
                        {!isLink && <span className="font-semibold tabular-nums text-foreground">{versionBadge(latest)}</span>}
                        <span>{isLink ? linkHost(latest.url) : [latest.sizeBytes ? formatBytes(latest.sizeBytes) : '', shortDate(latest.createdAt)].filter(Boolean).join(' · ')}</span>
                    </span>
                )}
                footer={(
                    <>
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Close</button>
                        <button type="button" className="btn btn-primary" onClick={() => { void save(); }} disabled={!dirty || saving || (canEdit && !v.title.trim())}>{saving ? 'Saving…' : 'Save changes'}</button>
                    </>
                )}
            >
                <div className="space-y-5">
                    {!canEdit && (
                        <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">
                            Changing files is part of Premium. <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(FILES_PREMIUM_REASON)}><StarIcon className="mr-1 inline h-3.5 w-3.5" />Upgrade</button>
                        </p>
                    )}

                    {/* the client */}
                    <div>
                        <SwitchRow
                            checked={latest.sharedInPortal}
                            onChange={(next) => { void setShared(latest, next); }}
                            label="Show in client portal"
                            disabled={!share.can || !canEdit}
                            busy={busy === `share-${latest.id}`}
                            hint={share.can ? 'Your client sees it on their project page.' : share.reason}
                        />
                        {clientSeesOlder && share.can && canEdit && (
                            <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs">
                                Your client still sees v{olderShared!.version}. <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { void setShared(latest, true); }} disabled={busy !== null}>Show v{latest.version} instead</button>
                            </p>
                        )}
                        {clientSeesOlder && !share.can && (
                            <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-xs">Your client still sees v{olderShared!.version}. <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { void setShared(olderShared!, false); }} disabled={busy !== null || !canEdit}>Hide it</button></p>
                        )}
                    </div>

                    <FileFields value={v} onChange={setV} link={isLink} disabled={!canEdit || saving} urlError={urlError} />

                    {/* open */}
                    {isLink ? (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn btn-outline" onClick={() => { void open(latest, false); }}><ExternalLinkIcon className="h-4 w-4" /> Open link</button>
                        </div>
                    ) : (
                        <section aria-label="Versions">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-bold">{group.count > 1 ? `Versions (${group.count})` : 'Version'}</h3>
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => { if (needPremium() && needOnline()) versionInput.current?.click(); }} disabled={busy !== null}>
                                    {busy === 'version' ? 'Uploading…' : `Upload new version (v${latest.version + 1})`}
                                </button>
                                <input ref={versionInput} type="file" accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => { void uploadVersion(e.target.files?.[0]); }} />
                            </div>
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                {versionLine(latest, true)}
                            </ul>
                            {older.length > 0 && (
                                <details className="group mt-2">
                                    <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
                                        <ChevronDownIcon className="h-4 w-4 transition group-open:rotate-180" />
                                        <span className="group-open:hidden">Older versions ({older.length})</span>
                                        <span className="hidden group-open:inline">Hide older versions</span>
                                    </summary>
                                    <ul className="mt-1 divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                        {older.map(f => versionLine(f))}
                                    </ul>
                                </details>
                            )}
                        </section>
                    )}

                    {canEdit && (
                        <div className="border-t border-border/70 pt-3">
                            <button type="button" className="inline-flex h-10 items-center gap-1.5 text-sm font-semibold text-destructive" onClick={() => setPending({ kind: 'all' })} disabled={busy !== null}>
                                <TrashIcon className="h-4 w-4" /> {isLink ? 'Delete this link' : group.count > 1 ? `Delete the whole document (${group.count} versions)` : 'Delete this file'}
                            </button>
                        </div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog
                open={!!pending}
                title={pending?.kind === 'version' ? `Delete v${pending.file.version}?` : isLink ? 'Delete this link?' : 'Delete this document?'}
                message={pending?.kind === 'version'
                    ? <>v{pending.file.version} of “{latest.title}” is removed for good{pending.file.sharedInPortal ? ' and your client stops seeing it' : ''}. The other versions stay.</>
                    : <>“{latest.title}”{group.count > 1 ? ` and all ${group.count} versions` : ''} are removed for good{group.versions.some(x => x.sharedInPortal) ? ', and your client stops seeing them' : ''}. Questions that attached it lose that attachment.</>}
                confirmLabel="Delete"
                destructive
                busy={busy === 'delete'}
                onConfirm={() => { void confirmDelete(); }}
                onCancel={() => setPending(null)}
            />
        </>
    );
};

export default JobFileDetail;
