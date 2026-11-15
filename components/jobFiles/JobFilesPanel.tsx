/**
 * Job page › Files (Premium): the plans, permits, contracts, specs and receipts of this job, and links to anything that
 * lives elsewhere (a shared folder, a 3D walkthrough).
 *  - grouped by category, with a category filter, tag chips and a search
 *  - tap a row to open it; ⋯ for details (name, category, tags, note), versions, "Show in client portal" and delete
 *  - "Add file" (PDF / images up to 15 MB), "Take photo", "Add link"; several files at once are added as they are
 *  - a new version of a document keeps its name, category and tags; the older versions fold away
 * Every change needs a connection (it says so); the list is read again when the connection is back.
 * Data: lib/jobFiles (logic + view words in jobFileLogic.ts / jobFileView.ts, Supabase calls in jobFilesApi.ts).
 */
import React, { useMemo, useRef, useState } from 'react';
import type { Job } from '../../types.ts';
import { isPaidTier } from '../../lib/plans.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError, planLimitMessage } from '../../lib/account.ts';
import { addJobFile, addJobFileVersion, deleteJobFileVersions, isPlanLimitError, setJobFileShared } from '../../lib/jobFiles/jobFilesApi.ts';
import { allTags, groupVersions } from '../../lib/jobFiles/jobFileLogic.ts';
import { JOB_FILE_LIMITS, type JobFile, type JobFileCategory, type JobFileGroup } from '../../lib/jobFiles/jobFileTypes.ts';
import {
    FILES_NEED_CONNECTION, FILES_PREMIUM_REASON, FILE_ACCEPT, addedMessage, categoryChips, checkPickedFiles, filesSummary, filterGroups,
    groupByCategory, rowMeta, shareInfo, stampOf, versionBadge,
} from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { CameraIcon, LinkIcon, PlusIcon, SearchIcon, StarIcon } from '../Icons.tsx';
import HelpButton from '../help/HelpButton.tsx';
import AddFileModal from './AddFileModal.tsx';
import JobFileDetail from './JobFileDetail.tsx';
import { TypeStamp } from './ui.tsx';
import { openJobFile } from './openJobFile.ts';
import { useJobFiles } from './useJobFiles.ts';

export interface JobFilesPanelProps {
    job: Job;
    userId: string;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason?: string) => void;
}

const EMPTY: JobFile[] = [];

const JobFilesPanel: React.FC<JobFilesPanelProps> = ({ job, userId, plan, isOnline, onUpgrade }) => {
    const paid = isPaidTier(plan);
    const { files: loaded, error: loadError, ready, reload, upsert, remove } = useJobFiles(job.id, isOnline);
    const files = Array.isArray(loaded) ? loaded : EMPTY;

    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<JobFileCategory | 'all'>('all');
    const [tag, setTag] = useState<string | null>(null);
    const [adding, setAdding] = useState<{ file: File | null } | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<JobFileGroup | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [versionFor, setVersionFor] = useState<JobFileGroup | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const versionRef = useRef<HTMLInputElement>(null);

    const groups = useMemo(() => groupVersions(files), [files]);
    const tags = useMemo(() => allTags(files), [files]);
    const chips = useMemo(() => categoryChips(groups), [groups]);
    const shown = useMemo(() => filterGroups(groups, { category, tag, search: query }), [groups, category, tag, query]);
    const sections = useMemo(() => groupByCategory(shown), [shown]);
    const detail = openId ? groups.find(g => g.versionGroup === openId) || null : null;
    const filtering = category !== 'all' || !!tag || !!query.trim();

    // ------------------------------------------------------------------------------ guards
    const needPremium = (): boolean => {
        if (paid) return true;
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

    // ------------------------------------------------------------------------------ adding
    const uploadMany = async (list: File[]) => {
        const saved: JobFile[] = [];
        setProgress({ done: 0, total: list.length });
        try {
            for (const f of list) {
                try {
                    saved.push(await addJobFile(userId, job.id, { file: f, fileName: f.name }));
                } catch (e) {
                    fail(e, `${f.name} could not be added.`);
                    if (isPlanLimitError(e)) break;
                }
                setProgress(p => (p ? { ...p, done: p.done + 1 } : p));
            }
        } finally {
            if (saved.length) { upsert(...saved); toast.success(addedMessage(saved.length)); }
            setProgress(null);
        }
    };

    const onPick = (picked: FileList | null, input: HTMLInputElement | null) => {
        const list = Array.from(picked || []);
        if (input) input.value = '';
        if (!list.length || !needPremium() || !needOnline()) return;
        const { ok, problems } = checkPickedFiles(list, Math.max(0, JOB_FILE_LIMITS.perJob - files.length));
        problems.slice(0, 3).forEach(p => toast.error(p));
        if (ok.length === 1) setAdding({ file: ok[0] });
        else if (ok.length > 1) void uploadMany(ok);
    };

    const startAdd = (kind: 'file' | 'camera' | 'link') => {
        if (!needPremium() || !needOnline()) return;
        if (kind === 'link') setAdding({ file: null });
        else (kind === 'camera' ? cameraRef : fileRef).current?.click();
    };

    const onVersionPicked = async (picked: FileList | null) => {
        const target = versionFor;
        const file = picked?.[0];
        if (versionRef.current) versionRef.current.value = '';
        setVersionFor(null);
        if (!target || !file || !needPremium() || !needOnline()) return;
        const { ok, problems } = checkPickedFiles([file]);
        if (!ok.length) { toast.error(problems[0] || 'This file cannot be added.'); return; }
        setProgress({ done: 0, total: 1 });
        try {
            const saved = await addJobFileVersion(userId, target.latest, { file, fileName: file.name });
            upsert(saved);
            toast.success(addedMessage(1, saved.title, saved.version));
        } catch (e) {
            fail(e, 'The new version could not be added.');
        } finally {
            setProgress(null);
        }
    };

    // ------------------------------------------------------------------------------ changes
    const open = async (f: JobFile, download = false) => {
        if (!needOnline()) return;
        setOpeningId(f.id);
        try {
            if (!(await openJobFile(f, { download }))) toast.error('The file could not be opened. Try again.');
        } finally {
            setOpeningId(null);
        }
    };

    const toggleShared = async (g: JobFileGroup) => {
        if (!needPremium() || !needOnline()) return;
        const f = g.latest;
        try {
            const saved = await setJobFileShared(f, !f.sharedInPortal, userId);
            upsert(saved);
            toast.success(saved.sharedInPortal ? 'Your client can see it now.' : 'Hidden from your client.');
        } catch (e) {
            fail(e, 'The change could not be saved.');
        }
    };

    const removeGroup = async (g: JobFileGroup) => {
        if (!needPremium() || !needOnline()) return;
        setDeleting(true);
        try {
            await deleteJobFileVersions(g.versions);
            remove(...g.versions.map(v => v.id));
            toast.success('Deleted.');
            setConfirmDelete(null);
        } catch (e) {
            fail(e, 'The file could not be deleted.');
        } finally {
            setDeleting(false);
        }
    };

    // ------------------------------------------------------------------------------ rows
    // a plain function (not a component): a component defined in here would remount every row on each render
    const renderRow = (g: JobFileGroup) => {
        const f = g.latest;
        const share = shareInfo(f);
        const anyShared = g.versions.some(v => v.sharedInPortal);
        const meta = rowMeta(f);
        return (
            <li key={g.versionGroup} className={cx('flex items-center gap-1 pl-3 pr-1', openingId === f.id && 'opacity-60')}>
                <button type="button" onClick={() => { void open(f); }} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left" aria-label={`Open ${f.title}`}>
                    <TypeStamp text={stampOf(f)} />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-semibold leading-5">{f.title}</span>
                            {versionBadge(f) && <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">{versionBadge(f)}</span>}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {meta.map((m, i) => <span key={i}>{m}</span>)}
                            {f.tags.slice(0, 3).map(t => <span key={t} className="font-medium">#{t}</span>)}
                            {f.tags.length > 3 && <span>+{f.tags.length - 3}</span>}
                            {anyShared && <span className="inline-flex items-center gap-1 font-semibold text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />Client sees this</span>}
                        </span>
                    </span>
                </button>
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for ${f.title}`}
                        items={[
                            { label: 'Details and versions', onSelect: () => setOpenId(g.versionGroup) },
                            { label: f.kind === 'link' ? 'Open link' : 'Open', onSelect: () => { void open(f); } },
                            f.kind === 'file' ? { label: 'Download', onSelect: () => { void open(f, true); } } : null,
                            f.kind === 'file' ? { label: 'Upload new version', onSelect: () => { if (needPremium() && needOnline()) { setVersionFor(g); versionRef.current?.click(); } } } : null,
                            share.can ? { label: f.sharedInPortal ? 'Hide from client' : 'Show to client', onSelect: () => { void toggleShared(g); } } : null,
                            { label: g.count > 1 ? `Delete (${g.count} versions)` : 'Delete', onSelect: () => setConfirmDelete(g), destructive: true },
                        ]}
                    />
                </span>
            </li>
        );
    };

    // ------------------------------------------------------------------------------ render
    if (loaded === undefined) return <div className="skeleton h-40 w-full rounded-2xl" aria-busy="true" />;
    if (loaded === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Job files are being switched on for your account. Check back soon.
            </div>
        );
    }
    if (!ready && loadError) {
        return (
            <div className="rounded-2xl border border-border bg-card p-5 text-sm" role="alert">
                <p className="font-semibold">{isOnline ? loadError : FILES_NEED_CONNECTION}</p>
                <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => { void reload(); }} disabled={!isOnline}>Try again</button>
            </div>
        );
    }
    if (!paid && files.length === 0) {
        return (
            <section className="rounded-2xl border border-primary/30 bg-card p-5" aria-labelledby="files-premium">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Premium</p>
                <h3 id="files-premium" className="mt-1 text-lg font-bold">Keep every plan, permit and contract with the job</h3>
                <p className="mt-1 text-sm text-muted-foreground">Upload PDFs and photos, or paste a link to a shared folder. Sort them into plans, permits, contracts and specs, tag them, and keep each new revision as a version. Show the ones your client should see on their project page.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={() => onUpgrade(FILES_PREMIUM_REASON)}><StarIcon className="h-4 w-4" /> Upgrade to Premium</button>
            </section>
        );
    }

    const summary = filesSummary(groups);
    const busy = progress !== null;

    return (
        <section aria-labelledby="files-heading" className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="files-heading" className="text-base font-bold leading-tight">Files</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">{summary || 'Nothing added yet.'}</p>
                    </div>
                    <HelpButton topic="job-files" />
                </div>
                <div className="mt-3 flex gap-2">
                    <button type="button" className="btn btn-primary h-10 shrink-0 px-3.5" onClick={() => startAdd('file')} disabled={busy}><PlusIcon className="h-4 w-4" /> Add file</button>
                    <button type="button" className="btn btn-outline h-10 shrink-0 px-3" onClick={() => startAdd('camera')} disabled={busy} aria-label="Take photo"><CameraIcon className="h-4 w-4" /> <span className="sm:hidden">Photo</span><span className="hidden sm:inline">Take photo</span></button>
                    <button type="button" className="btn btn-outline h-10 shrink-0 px-3" onClick={() => startAdd('link')} disabled={busy} aria-label="Add link"><LinkIcon className="h-4 w-4" /> <span className="sm:hidden">Link</span><span className="hidden sm:inline">Add link</span></button>
                </div>
                <input ref={fileRef} type="file" accept={FILE_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={e => onPick(e.target.files, e.currentTarget)} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={e => onPick(e.target.files, e.currentTarget)} />
                <input ref={versionRef} type="file" accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={e => { void onVersionPicked(e.target.files); }} />
                {progress && (
                    <p className="mt-3 text-sm font-medium text-muted-foreground" role="status">
                        {progress.total > 1 ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : 'Uploading…'}
                    </p>
                )}
            </div>

            {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm" role="status">{FILES_NEED_CONNECTION}</p>}
            {!paid && <p className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5 text-sm">Job files are part of Premium. You can still open these; <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onUpgrade(FILES_PREMIUM_REASON)}>upgrade</button> to add and change them.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void reload(); }}>Try again</button></p>}

            {groups.length > 0 && (
                <div className="space-y-2.5">
                    {groups.length >= 3 && (
                        <div className="relative">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search names, tags and notes" className="input h-11 pl-10" aria-label="Search files" />
                        </div>
                    )}
                    {chips.length > 2 && (
                        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Filter by category">
                            {chips.map(c => (
                                <button key={c.id} type="button" role="radio" aria-checked={category === c.id} onClick={() => setCategory(c.id)}
                                    className={cx('min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-semibold transition', category === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground')}>
                                    {c.label} <span className="tabular-nums opacity-70">{c.count}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    {tags.length > 0 && (
                        <div className="-mx-4 flex gap-x-3 gap-y-1 overflow-x-auto px-4 text-xs font-medium sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by tag">
                            {tags.slice(0, 16).map(t => (
                                <button key={t} type="button" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}
                                    className={cx('min-h-[32px] shrink-0 underline-offset-4', tag === t ? 'font-bold text-primary underline' : 'text-muted-foreground hover:text-foreground')}>
                                    #{t}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {groups.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Add the plans, permits, contracts and spec sheets for this job. A PDF or a photo, or a link to a shared folder. Sort them into categories and tag them so you can find them later.
                </p>
            ) : sections.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                    Nothing matches. <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => { setQuery(''); setCategory('all'); setTag(null); }}>Clear the filters</button>
                </p>
            ) : (
                <div className="space-y-4">
                    {sections.map(s => (
                        <div key={s.category}>
                            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>{s.label}</span>
                                <span className="tabular-nums normal-case tracking-normal">{s.groups.length}</span>
                            </h3>
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                {s.groups.map(renderRow)}
                            </ul>
                        </div>
                    ))}
                    {filtering && <p className="px-1 text-xs text-muted-foreground">Showing {shown.length} of {groups.length}.</p>}
                </div>
            )}

            {adding && (
                <AddFileModal
                    file={adding.file}
                    userId={userId}
                    jobId={job.id}
                    isOnline={isOnline}
                    onClose={() => setAdding(null)}
                    onAdded={saved => upsert(saved)}
                    onUpgrade={onUpgrade}
                />
            )}

            {detail && (
                <JobFileDetail
                    key={detail.versionGroup}
                    group={detail}
                    userId={userId}
                    isOnline={isOnline}
                    canEdit={paid}
                    onClose={() => setOpenId(null)}
                    onUpsert={upsert}
                    onRemoved={(...ids) => { remove(...ids); }}
                    onUpgrade={onUpgrade}
                />
            )}

            <ConfirmDialog
                open={!!confirmDelete}
                title={confirmDelete && confirmDelete.latest.kind === 'link' ? 'Delete this link?' : 'Delete this document?'}
                message={confirmDelete ? <>“{confirmDelete.latest.title}”{confirmDelete.count > 1 ? ` and all ${confirmDelete.count} versions` : ''} {confirmDelete.count > 1 ? 'are' : 'is'} removed for good{confirmDelete.versions.some(v => v.sharedInPortal) ? ', and your client stops seeing it' : ''}.</> : undefined}
                confirmLabel="Delete"
                destructive
                busy={deleting}
                onConfirm={() => { if (confirmDelete) void removeGroup(confirmDelete); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </section>
    );
};

export default JobFilesPanel;
