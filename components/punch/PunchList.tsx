/**
 * Job page › Punch list: what is left to finish on the job, checked off on a phone.
 *  - one-line quick add ("Kitchen: touch up paint @Mike"; the room sticks for the next items)
 *  - tap the ring to check an item off; ⋯ for verify / reopen / edit / before & after photo / delete
 *  - progress rail (open · done · verified), filter, grouped by room
 *  - "Show in client portal": the client sees the list and answers "Looks good" / "Needs work"
 *  - PDF through the app's Note document (same header and footer as every document), or saved on the job as a Note
 * Offline: adding, checking off and editing save on this device (offline outbox) and sync later; photos, delete,
 * sharing and the PDF need a connection. Free on every plan.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormType, type Client, type Job, type UserProfile } from '../../types.ts';
import type { OutboxItem } from '../../lib/offline/outboxModel.ts';
import { applyEntityOverlay } from '../../lib/offline/outboxModel.ts';
import {
    PUNCH_SYNCED_EVENT, applyPunchStatus, buildPunchListHtml, filterPunchItems, groupByArea, knownAreas, mapPunchRow, nextPosition, parseQuickAdd,
    progressLabel, punchProgress, punchRowOf, punchStatusLabel, sortPunchItems, toggleTarget,
    type PunchFilter, type PunchItem, type PunchProgress, type PunchStatus,
} from '../../lib/punchList.ts';
import { loadPunchList, rememberPunchList, savePunchItem, deletePunchItems, setPunchShared } from './punchApi.ts';
import { ActionMenu, ConfirmDialog, Field, Modal } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { describeError } from '../../lib/account.ts';
import { DocSyncChip } from '../offline/OfflineContext.tsx';
import { CameraIcon, CheckIcon, DownloadIcon, PlusIcon, ShieldCheckIcon, XCircleIcon } from '../Icons.tsx';
import { todayYMD, formatYMD } from '../../utils/localDates.ts';
import HelpButton from '../help/HelpButton.tsx';
import { PunchRail } from './PunchRail.tsx';

export interface PunchListProps {
    job: Job & { clientId?: string | null };
    userId: string;
    profile: Partial<UserProfile> | null;
    client?: Client | null;
    isOnline: boolean;
    /** the offline outbox (items waiting to sync are shown on top of the account's list) */
    outboxItems: readonly OutboxItem[];
    onUpgrade: (reason: string) => void;
    /** progress changed (job page tab label, pipeline) */
    onProgress?: (jobId: string, progress: PunchProgress) => void;
    /** a Note was saved on the job */
    onDocumentsChanged?: () => void;
}

const newId = (): string => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

const FILTERS: { value: PunchFilter; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' },
    { value: 'verified', label: 'Verified' },
    { value: 'all', label: 'All' },
];

/** The ring at the start of a row: hollow (open), blue check (done), green shield (verified). */
const StatusRing: React.FC<{ status: PunchStatus; byClient: boolean }> = ({ status, byClient }) => {
    if (status === 'open') return <span className="block h-[22px] w-[22px] rounded-full border-2 border-warning/70 bg-background" />;
    if (status === 'done') return <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-primary-foreground"><CheckIcon className="h-3.5 w-3.5" /></span>;
    return <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full ${byClient ? 'bg-success' : 'bg-success/85'} text-white`}><ShieldCheckIcon className="h-3.5 w-3.5" /></span>;
};

interface PhotoRef { id: string; storagePath: string; thumbPath: string | null; sharedInPortal: boolean; portalPath: string | null }

const PunchList: React.FC<PunchListProps> = ({ job, userId, profile, client, isOnline, outboxItems, onUpgrade, onProgress, onDocumentsChanged }) => {
    /** undefined = loading, null = feature not in the database yet */
    const [server, setServer] = useState<PunchItem[] | null | undefined>(undefined);
    const [shared, setShared] = useState(false);
    const [fromDevice, setFromDevice] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [filter, setFilter] = useState<PunchFilter>('open');
    const [draft, setDraft] = useState('');
    const [stickyArea, setStickyArea] = useState('');
    const [editing, setEditing] = useState<PunchItem | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<PunchItem[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [photos, setPhotos] = useState<Record<string, PhotoRef>>({});
    const [thumbs, setThumbs] = useState<Record<string, string>>({});
    const [report, setReport] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const today = todayYMD();

    const load = useCallback(async () => {
        setLoadError('');
        try {
            const data = await loadPunchList(userId, job.id);
            if (!data) { setServer(null); return; }
            setServer(data.items);
            setShared(data.shared);
            setFromDevice(data.fromDevice);
        } catch (e) {
            setLoadError(describeError(e, 'The punch list could not be loaded.'));
            setServer(s => (s === undefined ? [] : s));
        }
    }, [userId, job.id]);

    useEffect(() => { void load(); }, [load]);
    // an item saved offline reached the account, or the connection is back: read the account copy again
    useEffect(() => {
        const onSynced = (e: Event) => { if ((e as CustomEvent).detail?.jobId === job.id) void load(); };
        window.addEventListener(PUNCH_SYNCED_EVENT, onSynced);
        return () => window.removeEventListener(PUNCH_SYNCED_EVENT, onSynced);
    }, [job.id, load]);
    const wasOnline = useRef(isOnline);
    useEffect(() => { if (isOnline && !wasOnline.current) void load(); wasOnline.current = isOnline; }, [isOnline, load]);

    /** what the screen shows: the account's items with the ones waiting in the outbox on top */
    const items = useMemo(() => {
        if (!server) return [] as PunchItem[];
        const merged = applyEntityOverlay(server, outboxItems, userId, 'punch_item', (row, prev) => mapPunchRow(prev
            ? { ...punchRowOf(prev, userId), created_at: prev.createdAt, updated_at: prev.updatedAt, client_note: prev.clientNote || null, client_note_at: prev.clientNoteAt, ...row }
            : { created_at: new Date().toISOString(), ...row }));
        return merged.filter(i => i.jobId === job.id);
    }, [server, outboxItems, userId, job.id]);

    const progress = useMemo(() => punchProgress(items, today), [items, today]);
    useEffect(() => { if (server) onProgress?.(job.id, progress); }, [progress, server, job.id, onProgress]);
    useEffect(() => { if (server && !fromDevice) rememberPunchList(userId, job.id, items, shared); }, [items, shared, server, fromDevice, userId, job.id]);

    const counts = useMemo(() => ({ open: progress.open, done: progress.done, verified: progress.verified, all: progress.total }), [progress]);
    const shown = useMemo(() => sortPunchItems(filterPunchItems(items, filter), today), [items, filter, today]);
    const groups = useMemo(() => groupByArea(shown), [shown]);
    const areas = useMemo(() => knownAreas(items), [items]);

    // ---------------------------------------------------------------- photos (rows of job_photos)
    const photoIds = useMemo(() => Array.from(new Set(items.flatMap(i => [i.beforePhotoId, i.afterPhotoId]).filter(Boolean) as string[])), [items]);
    useEffect(() => {
        const missing = photoIds.filter(id => !photos[id]);
        if (!missing.length || !isOnline) return;
        let cancelled = false;
        (async () => {
            const { supabase } = await import('../../lib/supabase.ts');
            const { signedPhotoUrls } = await import('../photos/photosApi.ts');
            const { data } = await supabase.from('job_photos').select('id, storage_path, thumb_path, shared_in_portal, portal_path').in('id', missing);
            if (cancelled || !data) return;
            const refs: Record<string, PhotoRef> = {};
            for (const r of data as any[]) refs[r.id] = { id: r.id, storagePath: r.storage_path, thumbPath: r.thumb_path, sharedInPortal: !!r.shared_in_portal, portalPath: r.portal_path };
            setPhotos(prev => ({ ...prev, ...refs }));
            const urls = await signedPhotoUrls(Object.values(refs).map(p => p.thumbPath || p.storagePath));
            if (!cancelled) setThumbs(prev => ({ ...prev, ...urls }));
        })().catch(() => undefined);
        return () => { cancelled = true; };
    }, [photoIds, photos, isOnline]);
    const thumbOf = (id: string | null) => {
        const p = id ? photos[id] : null;
        return p ? thumbs[p.thumbPath || p.storagePath] || '' : '';
    };

    // ---------------------------------------------------------------- saving
    const persist = async (item: PunchItem, kind: 'create' | 'edit', patch?: Record<string, unknown>) => {
        const where = await savePunchItem(userId, item, kind, patch);
        if (where === 'account') {
            setServer(prev => {
                const list = prev || [];
                return list.some(i => i.id === item.id) ? list.map(i => (i.id === item.id ? item : i)) : [...list, item];
            });
        }
        return where;
    };

    const addFromDraft = async () => {
        const parsed = parseQuickAdd(draft, stickyArea);
        if (!parsed) return;
        const now = new Date().toISOString();
        const item: PunchItem = {
            id: newId(), jobId: job.id, title: parsed.title, area: parsed.area, assignee: parsed.assignee, dueOn: '', status: 'open',
            position: nextPosition(items), notes: '', beforePhotoId: null, afterPhotoId: null, doneAt: null, verifiedAt: null, verifiedBy: null,
            clientNote: '', clientNoteAt: null, createdAt: now, updatedAt: now,
        };
        setDraft('');
        setStickyArea(parsed.area);
        if (filter !== 'open' && filter !== 'all') setFilter('open');
        try {
            await persist(item, 'create');
        } catch (e) {
            setDraft(d => d || draft);
            toast.error(describeError(e, 'The item could not be added.'));
        }
        inputRef.current?.focus();
    };

    const changeStatus = async (item: PunchItem, to: PunchStatus) => {
        let next: PunchItem;
        try { next = applyPunchStatus(item, to, 'contractor', new Date().toISOString()); } catch (e) { toast.error((e as Error).message); return; }
        setBusy(item.id);
        try {
            await persist(next, 'edit', { status: next.status, done_at: next.doneAt, verified_at: next.verifiedAt, verified_by: next.verifiedBy });
        } catch (e) {
            toast.error(describeError(e, 'The item could not be updated.'));
        } finally {
            setBusy(null);
        }
    };

    const saveEdit = async (item: PunchItem, original: PunchItem) => {
        let next = item;
        if (item.status !== original.status) {
            try { next = { ...applyPunchStatus(original, item.status, 'contractor', new Date().toISOString()), title: item.title, area: item.area, assignee: item.assignee, dueOn: item.dueOn, notes: item.notes, beforePhotoId: item.beforePhotoId, afterPhotoId: item.afterPhotoId, clientNote: item.clientNote }; } catch (e) { toast.error((e as Error).message); return false; }
        }
        const row = punchRowOf(next, userId);
        const patch: Record<string, unknown> = { ...row };
        delete patch.user_id;
        if (!next.clientNote && original.clientNote) patch.client_note = null; // "Clear client note"
        try {
            await persist(next, 'edit', patch);
            return true;
        } catch (e) {
            toast.error(describeError(e, 'The item could not be saved.'));
            return false;
        }
    };

    const removeItems = async (list: PunchItem[]) => {
        setBusy('delete');
        try {
            await deletePunchItems(list.map(i => i.id));
            const ids = new Set(list.map(i => i.id));
            setServer(prev => (prev || []).filter(i => !ids.has(i.id)));
            toast.success(list.length === 1 ? 'Item deleted.' : `${list.length} items deleted.`);
        } catch (e) {
            toast.error(describeError(e, 'Could not delete.'));
        } finally {
            setBusy(null);
            setConfirmDelete(null);
        }
    };

    const toggleShared = async () => {
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        const next = !shared;
        setBusy('share');
        try {
            await setPunchShared(userId, job.id, next);
            setShared(next);
            if (next) {
                // the item photos show in the portal too (public copies, like "Show in client portal" on a photo)
                const { setPhotoShared } = await import('../photos/photosApi.ts');
                for (const id of photoIds) {
                    const p = photos[id];
                    if (!p || p.sharedInPortal) continue;
                    try {
                        const r = await setPhotoShared({ id: p.id, storagePath: p.storagePath, sharedInPortal: false, portalPath: null } as any, true, userId);
                        setPhotos(prev => ({ ...prev, [id]: { ...p, sharedInPortal: r.sharedInPortal, portalPath: r.portalPath } }));
                    } catch { /* the item still shows, without its photo */ }
                }
            }
            toast.success(next
                ? (job.clientId || (job.clientName || '').trim() ? 'The punch list now shows in the client portal.' : 'Shared. Link this job to a client so it appears in their portal.')
                : 'The punch list is hidden from the client portal.');
        } catch (e) {
            toast.error(describeError(e, 'Could not change sharing.'));
        } finally {
            setBusy(null);
        }
    };

    // ---------------------------------------------------------------- photo on an item
    const attachPhoto = async (item: PunchItem, side: 'before' | 'after', file: File) => {
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        setBusy(item.id);
        try {
            const { preparePhoto, addJobPhoto } = await import('../photos/photosApi.ts');
            const prepared = await preparePhoto(file);
            const row = await addJobPhoto({ userId, jobId: job.id, photo: prepared, tag: side === 'before' ? 'issue' : 'after', caption: `Punch list: ${item.title}`.slice(0, 500) });
            setPhotos(prev => ({ ...prev, [row.id]: { id: row.id, storagePath: row.storagePath, thumbPath: row.thumbPath, sharedInPortal: false, portalPath: null } }));
            setThumbs(prev => ({ ...prev, [row.thumbPath || row.storagePath]: URL.createObjectURL(prepared.thumb) }));
            const next = { ...item, [side === 'before' ? 'beforePhotoId' : 'afterPhotoId']: row.id } as PunchItem;
            await persist(next, 'edit', side === 'before' ? { before_photo_id: row.id } : { after_photo_id: row.id });
            if (shared) {
                const { setPhotoShared } = await import('../photos/photosApi.ts');
                setPhotoShared(row, true, userId).then(r => setPhotos(prev => ({ ...prev, [row.id]: { ...prev[row.id], sharedInPortal: r.sharedInPortal, portalPath: r.portalPath } }))).catch(() => undefined);
            }
            if (editing?.id === item.id) setEditing(next);
        } catch (e) {
            const msg = describeError(e, 'The photo could not be added.');
            if (/PLAN_LIMIT/i.test(String((e as any)?.message || '')) || /Free plan|Upgrade/i.test(msg)) onUpgrade(msg.replace(/^PLAN_LIMIT:\s*/, ''));
            else toast.error(msg);
        } finally {
            setBusy(null);
        }
    };

    // ---------------------------------------------------------------- PDF / Note
    const download = async () => {
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        if (!items.length) { toast.info('Add items first.'); return; }
        setReport('Preparing…');
        try {
            const [{ downloadPhoto, blobToJpegDataUrl }, { generateDocumentPDF }] = await Promise.all([
                import('../photos/photosApi.ts'), import('../../services/pdfGenerator.ts'),
            ]);
            const pics: Record<string, { before?: string; after?: string }> = {};
            let done = 0;
            for (const i of items) {
                for (const side of ['before', 'after'] as const) {
                    const id = side === 'before' ? i.beforePhotoId : i.afterPhotoId;
                    const p = id ? photos[id] : null;
                    if (!p) continue;
                    try {
                        const src = await blobToJpegDataUrl(await downloadPhoto(p.storagePath), 700, 0.78);
                        pics[i.id] = { ...(pics[i.id] || {}), [side]: src };
                    } catch { /* left out */ }
                    setReport(`Photos ${++done}…`);
                }
            }
            const content = buildPunchListHtml({ items, photos: pics, today });
            await generateDocumentPDF(FormType.Note, { title: 'Punch list', date: today, projectName: job.name || '', clientName: job.clientName || '', content }, profile, job, null, false, {
                fileName: `Punch-list-${(job.name || 'job').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'job'}.pdf`,
            });
        } catch (e) {
            toast.error(describeError(e, 'The PDF could not be made.'));
        } finally {
            setReport(null);
        }
    };

    const saveAsNote = async () => {
        if (!isOnline) { toast.error("You're offline, this needs a connection."); return; }
        if (!items.length) { toast.info('Add items first.'); return; }
        setBusy('note');
        try {
            const { savePunchNote } = await import('./punchNote.ts');
            await savePunchNote({ userId, job, profile: (profile || null) as UserProfile | null, items, today });
            toast.success('Saved on the job as a Note (Documents tab). Share or email it like any document.');
            onDocumentsChanged?.();
        } catch (e) {
            toast.error(describeError(e, 'The Note could not be saved.'));
        } finally {
            setBusy(null);
        }
    };

    // ---------------------------------------------------------------- render
    if (server === undefined) return <div className="skeleton h-40 w-full" aria-busy="true" />;
    if (server === null) {
        return (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Punch lists are being switched on for your account. Check back soon.
            </div>
        );
    }

    const verifiedDone = items.filter(i => i.status === 'verified');
    const hasClient = Boolean(job.clientId || (job.clientName || '').trim() || client);

    return (
        <section aria-labelledby="punch-heading" className="space-y-4">
            {/* progress + sharing */}
            <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 id="punch-heading" className="text-base font-bold leading-tight">Punch list</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            <span className="font-semibold tabular-nums text-foreground">{progressLabel(progress)}</span>
                            {progress.total > 0 && <> · {progress.open} open{progress.overdue ? <span className="text-destructive"> · {progress.overdue} overdue</span> : null}{progress.sentBack ? <span className="text-warning"> · {progress.sentBack} sent back</span> : null}</>}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <HelpButton topic="punch-list" />
                        <ActionMenu
                            label="Punch list actions"
                            items={[
                                { label: report || 'Download PDF', onSelect: () => { void download(); }, icon: <DownloadIcon className="h-4 w-4" /> },
                                { label: 'Save as Note on the job', onSelect: () => { void saveAsNote(); } },
                                verifiedDone.length ? { label: `Delete ${verifiedDone.length} verified`, onSelect: () => setConfirmDelete(verifiedDone), destructive: true } : null,
                            ]}
                        />
                    </div>
                </div>
                <PunchRail progress={progress} className="mt-3" />
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm">
                    <span className="min-w-0">
                        <span className="font-medium">Show in client portal</span>
                        <span className="block text-xs text-muted-foreground">{hasClient ? 'Your client sees the list and can mark finished items “Looks good” or send them back.' : 'Link this job to a client to show it in their portal.'}</span>
                    </span>
                    <input type="checkbox" role="switch" className="peer sr-only" checked={shared} onChange={() => { void toggleShared(); }} disabled={busy === 'share'} aria-label="Show in client portal" />
                    <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${shared ? 'bg-primary' : 'bg-muted-foreground/30'} peer-focus-visible:ring-2 peer-focus-visible:ring-ring`} aria-hidden>
                        <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition ${shared ? 'left-[22px]' : 'left-0.5'}`} />
                    </span>
                </label>
            </div>

            {fromDevice && <p className="text-xs text-muted-foreground">Showing the copy saved on this device. Changes sync when you reconnect.</p>}
            {loadError && <p className="text-sm text-destructive" role="alert">{loadError} <button type="button" className="underline" onClick={() => { void load(); }}>Try again</button></p>}

            {/* quick add */}
            <form className="flex items-stretch gap-2" onSubmit={(e) => { e.preventDefault(); void addFromDraft(); }}>
                <div className="relative min-w-0 flex-1">
                    {stickyArea && (
                        <button type="button" onClick={() => setStickyArea('')} className="absolute left-2 top-1/2 inline-flex max-w-[40%] -translate-y-1/2 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground" title="Room for the next items (tap to clear)">
                            <span className="truncate">{stickyArea}</span><XCircleIcon className="h-3 w-3 shrink-0 opacity-60" />
                        </button>
                    )}
                    <input
                        ref={inputRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="input h-11"
                        style={stickyArea ? { paddingLeft: `${Math.min(14, stickyArea.length) * 0.5 + 2.6}rem` } : undefined}
                        placeholder={stickyArea ? 'Add an item…' : 'Add an item, e.g. Kitchen: touch up paint @Mike'}
                        aria-label="New punch list item"
                        enterKeyHint="done"
                        maxLength={340}
                    />
                </div>
                <button type="submit" className="btn btn-primary h-11 shrink-0 px-3.5" disabled={!draft.trim()} aria-label="Add item"><PlusIcon className="h-4 w-4" /><span className="hidden sm:inline">Add item</span></button>
            </form>
            {areas.length > 0 && !stickyArea && (
                <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Rooms">
                    {areas.slice(0, 8).map(a => (
                        <button key={a} type="button" onClick={() => { setStickyArea(a); inputRef.current?.focus(); }} className="h-8 shrink-0 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:text-foreground">{a}</button>
                    ))}
                </div>
            )}

            {/* filter */}
            {progress.total > 0 && (
                <div className="flex gap-4 border-b border-border" role="tablist" aria-label="Show">
                    {FILTERS.map(f => (
                        <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)}
                            className={`-mb-px min-h-[40px] border-b-2 px-0.5 text-sm font-semibold transition ${filter === f.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                            {f.label} <span className="font-medium tabular-nums opacity-70">{counts[f.value]}</span>
                        </button>
                    ))}
                </div>
            )}

            {progress.total === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Walk the job and type what is left, one line each. Start a line with the room (“Bath 2: caulk tub”) and it sticks for the next items.
                </p>
            ) : shown.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">{filter === 'open' ? 'Nothing open. Nice work.' : 'Nothing here.'}</p>
            ) : (
                <div className="space-y-4">
                    {groups.map(g => (
                        <div key={g.area}>
                            <h3 className="mb-1 flex items-baseline justify-between px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>{g.area}</span>
                                <span className="tabular-nums normal-case tracking-normal">{g.items.length}</span>
                            </h3>
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                                {g.items.map(item => {
                                    const target = toggleTarget(item);
                                    const overdue = item.status === 'open' && item.dueOn && item.dueOn < today;
                                    const before = thumbOf(item.beforePhotoId);
                                    const after = thumbOf(item.afterPhotoId);
                                    return (
                                        <li key={item.id} className={`flex items-start gap-2.5 px-2.5 py-2 ${busy === item.id ? 'opacity-60' : ''}`}>
                                            <button
                                                type="button"
                                                onClick={() => (target ? void changeStatus(item, target) : setEditing(item))}
                                                className="-m-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                                                aria-label={target === 'done' ? `Mark “${item.title}” done` : target === 'open' ? `Mark “${item.title}” not done` : `Open “${item.title}”`}
                                                disabled={busy === item.id}
                                            >
                                                <StatusRing status={item.status} byClient={item.verifiedBy === 'client'} />
                                            </button>
                                            <button type="button" onClick={() => setEditing(item)} className="min-w-0 flex-1 py-1 text-left">
                                                <span className={`block text-sm font-semibold leading-5 ${item.status === 'open' ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40'}`}>{item.title}</span>
                                                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                                    {item.assignee && <span>@{item.assignee}</span>}
                                                    {item.dueOn && <span className={overdue ? 'font-semibold text-destructive' : ''}>{overdue ? 'Overdue · ' : 'Due '}{formatYMD(item.dueOn, { month: 'short', day: 'numeric' })}</span>}
                                                    {item.status === 'verified' && <span className="font-semibold text-success">{item.verifiedBy === 'client' ? 'Client: looks good' : 'Verified'}</span>}
                                                    <DocSyncChip docId={item.id} />
                                                </span>
                                                {item.clientNote && <span className="mt-1 block rounded-md bg-warning/10 px-2 py-1 text-xs text-foreground"><span className="font-semibold text-warning">Client:</span> {item.clientNote}</span>}
                                            </button>
                                            {(before || after) && (
                                                <span className="flex shrink-0 gap-1 pt-1">
                                                    {before && <img src={before} alt="Before" className="h-9 w-9 rounded-md object-cover" />}
                                                    {after && <img src={after} alt="After" className="h-9 w-9 rounded-md object-cover ring-2 ring-success/60" />}
                                                </span>
                                            )}
                                            <span className="shrink-0 pt-0.5">
                                                <ActionMenu
                                                    label={`More for ${item.title}`}
                                                    items={[
                                                        item.status === 'done' ? { label: 'Mark verified', onSelect: () => { void changeStatus(item, 'verified'); } } : null,
                                                        item.status === 'verified' ? { label: 'Reopen', onSelect: () => { void changeStatus(item, 'open'); } } : null,
                                                        item.status === 'verified' ? { label: 'Back to done', onSelect: () => { void changeStatus(item, 'done'); } } : null,
                                                        { label: 'Edit', onSelect: () => setEditing(item) },
                                                        { label: 'Delete', onSelect: () => setConfirmDelete([item]), destructive: true },
                                                    ]}
                                                />
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            {editing && (
                <PunchItemSheet
                    item={editing}
                    areas={areas}
                    isOnline={isOnline}
                    beforeUrl={thumbOf(editing.beforePhotoId)}
                    afterUrl={thumbOf(editing.afterPhotoId)}
                    busy={busy === editing.id}
                    onPhoto={(side, file) => { void attachPhoto(editing, side, file); }}
                    onClose={() => setEditing(null)}
                    onSave={async (next) => { if (await saveEdit(next, editing)) setEditing(null); }}
                />
            )}
            <ConfirmDialog
                open={!!confirmDelete}
                title={confirmDelete && confirmDelete.length > 1 ? `Delete ${confirmDelete.length} items?` : 'Delete this item?'}
                message="It is removed from the punch list (and from the client portal). Photos stay in the job's photos."
                confirmLabel="Delete"
                destructive
                busy={busy === 'delete'}
                onConfirm={() => { if (confirmDelete) void removeItems(confirmDelete); }}
                onCancel={() => setConfirmDelete(null)}
            />
        </section>
    );
};

// ------------------------------------------------------------------------------------------------
// Edit sheet
// ------------------------------------------------------------------------------------------------
const PunchItemSheet: React.FC<{
    item: PunchItem;
    areas: string[];
    isOnline: boolean;
    beforeUrl: string;
    afterUrl: string;
    busy: boolean;
    onPhoto: (side: 'before' | 'after', file: File) => void;
    onClose: () => void;
    onSave: (item: PunchItem) => void | Promise<void>;
}> = ({ item, areas, isOnline, beforeUrl, afterUrl, busy, onPhoto, onClose, onSave }) => {
    const [v, setV] = useState<PunchItem>(item);
    useEffect(() => { setV(cur => ({ ...cur, beforePhotoId: item.beforePhotoId, afterPhotoId: item.afterPhotoId })); }, [item.beforePhotoId, item.afterPhotoId]);
    const set = <K extends keyof PunchItem>(k: K, val: PunchItem[K]) => setV(cur => ({ ...cur, [k]: val }));
    const beforeRef = useRef<HTMLInputElement>(null);
    const afterRef = useRef<HTMLInputElement>(null);
    const listId = `punch-areas-${item.id}`;
    const statuses: PunchStatus[] = item.status === 'open' ? ['open', 'done'] : ['open', 'done', 'verified'];

    const PhotoSlot: React.FC<{ side: 'before' | 'after'; url: string; inputRef: React.RefObject<HTMLInputElement> }> = ({ side, url, inputRef }) => (
        <div>
            <span className="label">{side === 'before' ? 'Before' : 'After'}</span>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!isOnline || busy}
                className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                {url ? <img src={url} alt={side === 'before' ? 'Before' : 'After'} className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1"><CameraIcon className="h-5 w-5" />{isOnline ? 'Add photo' : 'Needs a connection'}</span>}
            </button>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(side, f); }} />
        </div>
    );

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy}
            title="Punch item"
            footer={
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={() => { void onSave({ ...v, title: v.title.trim() || item.title }); }} disabled={busy || !v.title.trim()}>Save</button>
                </>
            }
        >
            <div className="space-y-3">
                <Field label="Item" htmlFor="punch-title">
                    <input id="punch-title" className="input" value={v.title} onChange={(e) => set('title', e.target.value)} maxLength={300} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Room / area" htmlFor="punch-area">
                        <input id="punch-area" className="input" list={listId} value={v.area} onChange={(e) => set('area', e.target.value)} maxLength={120} placeholder="General" />
                        <datalist id={listId}>{areas.map(a => <option key={a} value={a} />)}</datalist>
                    </Field>
                    <Field label="Assigned to" htmlFor="punch-assignee">
                        <input id="punch-assignee" className="input" value={v.assignee} onChange={(e) => set('assignee', e.target.value)} maxLength={120} placeholder="Name" />
                    </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Due" htmlFor="punch-due">
                        <input id="punch-due" type="date" className="input" value={v.dueOn} onChange={(e) => set('dueOn', e.target.value)} />
                    </Field>
                    <Field label="Status" htmlFor="punch-status">
                        <select id="punch-status" className="input" value={v.status} onChange={(e) => set('status', e.target.value as PunchStatus)}>
                            {statuses.map(s => <option key={s} value={s}>{punchStatusLabel(s)}</option>)}
                        </select>
                    </Field>
                </div>
                <Field label="Notes" htmlFor="punch-notes">
                    <textarea id="punch-notes" className="input min-h-[70px]" value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} />
                </Field>
                {v.clientNote && (
                    <div className="flex items-start justify-between gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm">
                        <span><span className="font-semibold text-warning">Client:</span> {v.clientNote}</span>
                        <button type="button" className="shrink-0 text-xs font-semibold text-muted-foreground underline" onClick={() => set('clientNote', '')}>Clear client note</button>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <PhotoSlot side="before" url={beforeUrl} inputRef={beforeRef} />
                    <PhotoSlot side="after" url={afterUrl} inputRef={afterRef} />
                </div>
                <p className="text-xs text-muted-foreground">Photos are also added to the job's photos (Before → “Issue”, After → “After”).</p>
            </div>
        </Modal>
    );
};

export default PunchList;
