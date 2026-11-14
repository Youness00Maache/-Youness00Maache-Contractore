/**
 * Job page → Photos tab: the job's photo timeline.
 *  - take / upload photos (compressed on the device), tagged Before / During / After / Issue
 *  - grouped by day, filter by stage or "In portal"
 *  - viewer with caption, stage, markup (arrows / circles / text / draw, saved as a new photo), download, delete
 *  - select photos → before/after PDF report, show / hide in the client portal, delete
 *  - Free plan photo cap (per job + total MB), checked before uploading and enforced by the database
 *  - Premium + AI: "Write client update" and "AI walkthrough" from the photos (PhotoAIModal.tsx)
 *  - offline: photos taken / picked are kept on this device and upload when the connection is back; stage, caption,
 *    portal and markup changes wait too; the list and previews are the device's last copy
 *    (lib/offline/offlineJobPhotos.ts, lib/offline/deviceCache.ts)
 * Shows a short notice instead when the database doesn't have job photos yet (migration 20261113000400).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client, Job, UserProfile } from '../../types.ts';
import { toast } from '../Toast.tsx';
import { Segmented } from '../viewKit.tsx';
import { CameraIcon, CheckIcon, FileTextIcon, SparklesIcon, UploadImageIcon } from '../Icons.tsx';
import { describeError, isPlanLimitError, planLimitMessage } from '../../lib/account.ts';
import { describeImageError } from '../../utils/imageCompression.ts';
import { flushStorageCleanup } from '../requests/requestsApi.ts';
import {
    PHOTO_TAGS, checkPhotoQuota, countByFilter, defaultTagForNewPhotos, filterPhotos, formatBytes, groupByDay, sortPhotos, tagLabel,
    type JobPhoto, type PhotoFilter, type PhotoTag, type PhotoUsage,
} from './photoLogic.ts';
import {
    addJobPhoto, currentUserId, deleteJobPhotos, downloadPhoto, fetchPhotoUsage, listJobPhotos, preparePhoto, setPhotoShared,
    signedPhotoUrls, updateJobPhoto,
} from './photosApi.ts';
import PhotoViewer from './PhotoViewer.tsx';
import HelpButton from '../help/HelpButton.tsx';
import {
    AI_PHOTOS_UPGRADE_REASON, canUseAiPhotos, capPhotos, pickUpdatePhotos, pickWalkthroughPhotos, updateHint, type SentUpdate,
} from './photoUpdates.ts';
import { loadSentUpdates } from './photoUpdatesApi.ts';
import type { PhotoAIMode } from './PhotoAIModal.tsx';
import {
    applyPhotoOverlay, isOfflinePath, offlineMainPath, offlinePhotoRoom, offlinePhotoUsage, offlineThumbPath, pendingPhotoStats,
    PHOTO_FILE_MAIN, PHOTO_FILE_THUMB, type OfflinePhotoApi,
} from '../../lib/offline/offlineJobPhotos.ts';
import { hasPhotoThumb, isOfflineFailure, NEEDS_CONNECTION, readListCopy, readPhotoThumbs, saveListCopy, savePhotoThumb } from '../../lib/offline/deviceCache.ts';

const PhotoMarkupEditor = React.lazy(() => import('./PhotoMarkupEditor.tsx'));
const PhotoAIModal = React.lazy(() => import('./PhotoAIModal.tsx'));

export interface JobPhotosProps {
    job: Job & { clientId?: string | null };
    profile: Partial<UserProfile> | null;
    plan: string;
    isOnline: boolean;
    onUpgrade: (reason: string) => void;
    /** the job's client (email / phone / portal link for client updates) */
    client?: Client | null;
    clients?: Client[];
    /** uploads a photo for a document body (the assistant's report photos) and returns its URL */
    uploadImage?: (file: File) => Promise<string>;
    onEmailSent?: () => void;
    /** a document was added to the job (the record of a sent client update) */
    onDocumentsChanged?: () => void;
    /** the app's offline outbox for photos (null: photos need a connection, as before) */
    offline?: OfflinePhotoApi | null;
}

/** Rough size of one compressed photo + preview, for the pre-upload check. */
const EST_PHOTO_BYTES = 340 * 1024;
/** Previews kept on this device per job (so the tab shows pictures offline). */
const THUMBS_KEPT_PER_JOB = 120;

const newPhotoId = (): string => {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const listKey = (jobId: string) => `job_photos:${jobId}`;
const usageKey = (jobId: string) => `job_photo_usage:${jobId}`;

const FILTERS: { value: PhotoFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...PHOTO_TAGS,
    { value: 'shared', label: 'In portal' },
];

const isCoarsePointer = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const JobPhotos: React.FC<JobPhotosProps> = ({ job, profile, plan, isOnline, onUpgrade, client, clients, uploadImage, onEmailSent, onDocumentsChanged, offline }) => {
    /** undefined = loading, null = feature not in the database yet. The account's list (or the device copy). */
    const [photos, setPhotos] = useState<JobPhoto[] | null | undefined>(undefined);
    /** the list is the device copy (offline) */
    const [fromDevice, setFromDevice] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [usage, setUsage] = useState<PhotoUsage | null>(null);
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [filter, setFilter] = useState<PhotoFilter>('all');
    const [stage, setStage] = useState<PhotoTag | null>(null);
    const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [viewerId, setViewerId] = useState<string | null>(null);
    const [markup, setMarkup] = useState<{ photo: JobPhoto; blob: Blob } | null>(null);
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<{ done: number; total: number } | null>(null);
    const [aiMode, setAiMode] = useState<{ mode: PhotoAIMode; pick: JobPhoto[] } | null>(null);
    const [sentUpdates, setSentUpdates] = useState<SentUpdate[]>([]);
    const aiPlan = canUseAiPhotos(plan);
    const fileRef = useRef<HTMLInputElement>(null);
    const cameraRef = useRef<HTMLInputElement>(null);
    const objectUrls = useRef<string[]>([]);
    const requested = useRef<Set<string>>(new Set());
    const touch = useMemo(isCoarsePointer, []);
    const hasClient = Boolean(job.clientId || (job.clientName || '').trim());

    useEffect(() => () => { objectUrls.current.forEach(u => URL.revokeObjectURL(u)); }, []);

    const online = isOnline && (typeof navigator === 'undefined' || navigator.onLine !== false);
    const onlineRef = useRef(online);
    onlineRef.current = online;

    const objectUrlFor = (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        objectUrls.current.push(url);
        return url;
    };

    /** Keeps previews on this device (background, online): the tab shows pictures offline too. */
    const keepThumbs = useCallback(async (map: Record<string, string>, paths: string[]) => {
        if ((navigator as any).connection?.saveData) return;
        for (const path of paths.slice(0, THUMBS_KEPT_PER_JOB)) {
            const url = map[path];
            if (!url || !onlineRef.current || await hasPhotoThumb(path)) continue;
            try {
                const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
                if (res.ok) await savePhotoThumb(path, await res.blob());
            } catch { /* optional */ }
        }
    }, []);

    const loadUrls = useCallback(async (paths: string[]) => {
        // photos only on this device have their own URLs; offline nothing can be signed (asked again once online)
        if (!onlineRef.current) return {} as Record<string, string>;
        const todo = paths.filter(p => p && !isOfflinePath(p) && !requested.current.has(p));
        if (!todo.length) return {} as Record<string, string>;
        todo.forEach(p => requested.current.add(p));
        const map = await signedPhotoUrls(todo).catch(() => ({} as Record<string, string>));
        setUrls(prev => ({ ...prev, ...map }));
        return map;
    }, []);

    const ensureUrl = useCallback((path: string) => { void loadUrls([path]); }, [loadUrls]);

    /** Offline: the job's last list, usage and previews saved on this device. */
    const loadDeviceCopy = useCallback(async () => {
        const [copy, usageCopy] = await Promise.all([readListCopy<JobPhoto>(listKey(job.id)), readListCopy<PhotoUsage>(usageKey(job.id))]);
        const list = copy?.rows || [];
        setPhotos(list);
        setFromDevice(true);
        setStage(s => s ?? defaultTagForNewPhotos(list));
        if (usageCopy?.rows?.[0]) setUsage(prev => prev ?? usageCopy.rows[0]);
        const thumbs = await readPhotoThumbs(list.map(p => p.thumbPath || p.storagePath).filter(Boolean));
        const found: Record<string, string> = {};
        for (const [path, blob] of Object.entries(thumbs)) found[path] = objectUrlFor(blob);
        if (Object.keys(found).length) setUrls(prev => ({ ...found, ...prev }));
    }, [job.id]);

    const load = useCallback(async () => {
        setLoadError('');
        if (!onlineRef.current) { await loadDeviceCopy(); return; }
        try {
            const list = await listJobPhotos(job.id);
            setPhotos(list);
            setFromDevice(false);
            if (!list) return;
            void saveListCopy(listKey(job.id), list);
            setStage(s => s ?? defaultTagForNewPhotos(list));
            fetchPhotoUsage(job.id, plan).then(u => {
                if (!u) return;
                setUsage(u);
                void saveListCopy(usageKey(job.id), [u]);
            }).catch(() => undefined);
            const map = await loadUrls(list.map(p => p.thumbPath || p.storagePath));
            // previews that never uploaded: use the photo itself
            const missing = list.filter(p => p.thumbPath && !map[p.thumbPath]).map(p => p.storagePath);
            if (missing.length) void loadUrls(missing);
            void keepThumbs(map, list.map(p => p.thumbPath || p.storagePath));
        } catch (e) {
            if (isOfflineFailure(e)) { await loadDeviceCopy(); return; }
            setLoadError(describeError(e, 'Could not load the photos.'));
            setPhotos(prev => prev ?? []);
        }
    }, [job.id, plan, loadUrls, loadDeviceCopy, keepThumbs]);

    useEffect(() => {
        void load();
        const t = window.setTimeout(() => { if (onlineRef.current) flushStorageCleanup().catch(() => undefined); }, 3000);
        return () => window.clearTimeout(t);
    }, [load]);

    // back online: the account's list again (photos waiting on this device upload by themselves)
    const wasOnline = useRef(online);
    useEffect(() => {
        if (online && !wasOnline.current) { requested.current.clear(); void load(); }
        wasOnline.current = online;
    }, [online, load]);

    // ------------------------------------------------------------------------------- offline photos
    const offlineItems = offline?.items;
    const pendingItems = useMemo(() => (offlineItems ? offlineItems.filter(i => i.jobId === job.id) : []), [offlineItems, job.id]);
    const pendingIdsKey = pendingItems.filter(i => i.kind === 'create').map(i => i.docId).join(',');
    const pendingIds = useMemo(() => new Set(pendingItems.map(i => i.docId)), [pendingItems]);
    const isPendingCreate = useCallback((id: string) => pendingItems.some(i => i.docId === id && i.kind === 'create'), [pendingItems]);

    // the device copies of photos taken offline (object URLs from the stored files)
    const lastPending = useRef(new Map<string, Record<string, unknown>>());
    const deviceUrlIds = useRef(new Set<string>());
    const offlineRef = useRef(offline);
    offlineRef.current = offline;
    const pendingRef = useRef(pendingItems);
    pendingRef.current = pendingItems;
    useEffect(() => {
        const api = offlineRef.current;
        if (!api) return;
        let active = true;
        const creates = pendingRef.current.filter(i => i.kind === 'create');
        (async () => {
            const next: Record<string, string> = {};
            for (const item of creates) {
                const main = offlineMainPath(item.docId);
                if (deviceUrlIds.current.has(item.docId)) continue;
                const files = await api.filesOf(item.docId);
                if (!active || !files) continue;
                deviceUrlIds.current.add(item.docId);
                if (files[PHOTO_FILE_MAIN]) next[main] = objectUrlFor(files[PHOTO_FILE_MAIN]);
                if (files[PHOTO_FILE_THUMB]) next[offlineThumbPath(item.docId)] = objectUrlFor(files[PHOTO_FILE_THUMB]);
            }
            if (active && Object.keys(next).length) setUrls(prev => ({ ...prev, ...next }));
        })();
        // photos that just synced: their uploaded paths show the same pictures until the list reloads
        const nowIds = new Set(creates.map(i => i.docId));
        const synced: Record<string, string> = {};
        for (const [id, row] of lastPending.current) {
            if (nowIds.has(id)) continue;
            const ext = row.ext === 'png' || row.ext === 'webp' ? row.ext : 'jpg';
            const base = `${String(row.user_id)}/${String(row.job_id)}/${id}`;
            setUrls(prev => {
                const main = prev[offlineMainPath(id)];
                const thumb = prev[offlineThumbPath(id)];
                if (!main && !thumb) return prev;
                return { ...prev, ...(main ? { [`${base}.${ext}`]: main } : {}), ...(thumb ? { [`${base}_t.jpg`]: thumb } : {}) };
            });
            requested.current.add(`${base}.${ext}`);
            requested.current.add(`${base}_t.jpg`);
            synced[id] = id;
        }
        lastPending.current = new Map(creates.map(i => [i.docId, i.data]));
        if (Object.keys(synced).length && onlineRef.current) void load();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingIdsKey, Boolean(offline)]);

    // Client updates already sent (Notes tagged "Client update"): what "new since the last update" means.
    useEffect(() => {
        if (!aiPlan) return;
        let active = true;
        loadSentUpdates(job.id).then(list => { if (active) setSentUpdates(list); }).catch(() => undefined);
        return () => { active = false; };
    }, [aiPlan, job.id]);

    // the account's photos (or the device copy) with the ones taken / changed offline on top
    const list = useMemo(
        () => (offlineItems && offline ? applyPhotoOverlay(photos || [], offlineItems, offline.userId, job.id) : photos || []),
        [photos, offlineItems, offline?.userId, job.id], // eslint-disable-line react-hooks/exhaustive-deps
    );
    /** photos that are on the account (reports, AI and downloads use these) */
    const uploaded = useMemo(() => list.filter(p => !isOfflinePath(p.storagePath)), [list]);
    const counts = useMemo(() => countByFilter(list), [list]);
    const visible = useMemo(() => sortPhotos(filterPhotos(list, filter)), [list, filter]);
    const groups = useMemo(() => groupByDay(visible), [visible]);
    const viewerIndex = viewerId ? visible.findIndex(p => p.id === viewerId) : -1;
    const selectedPhotos = useMemo(() => list.filter(p => selected.has(p.id)), [list, selected]);

    useEffect(() => { if (viewerId && viewerIndex === -1 && photos) setViewerId(null); }, [viewerId, viewerIndex, photos]);

    const patchPhoto = (id: string, patch: Partial<JobPhoto>) =>
        setPhotos(prev => (prev ? prev.map(p => (p.id === id ? { ...p, ...patch } : p)) : prev));

    const limitReached = (reason: string, tier?: string) => {
        if ((tier || usage?.tier || plan) === 'ai') toast.error(reason);
        else onUpgrade(reason);
    };

    /** Photos are kept on this device (offline, or the job itself still waits to sync). */
    const deviceMode = Boolean(offline) && (!online || Boolean(offline?.jobWaiting));

    /** The plan check offline: the last known usage + the photos waiting on this device (the account checks again). */
    const deviceUsage = (): PhotoUsage => offlinePhotoUsage(usage, plan, (photos || []).length, pendingPhotoStats(offline?.items || [], offline?.userId, job.id));

    /** Keeps prepared photos on this device; returns how many were kept. */
    const keepOnDevice = async (todo: File[], tag: PhotoTag, extra?: { caption?: string; sourcePhotoId?: string; takenAt?: (prepared: string) => string }): Promise<{ added: number; ids: string[]; failed: number; lastError: string }> => {
        const api = offline!;
        let added = 0;
        let failed = 0;
        let lastError = '';
        const ids: string[] = [];
        for (let i = 0; i < todo.length; i++) {
            try {
                const prepared = await preparePhoto(todo[i]);
                const id = newPhotoId();
                await api.add({
                    userId: api.userId, jobId: job.id, id, tag, caption: extra?.caption ?? null, sourcePhotoId: extra?.sourcePhotoId ?? null,
                    takenAt: extra?.takenAt ? extra.takenAt(prepared.takenAt) : prepared.takenAt,
                    width: prepared.width, height: prepared.height, mainType: prepared.main.type || 'image/jpeg', mainSize: prepared.main.size, thumbSize: prepared.thumb.size,
                }, { main: prepared.main, thumb: prepared.thumb });
                // show it at once (the outbox reload gives the same URLs to the tile)
                deviceUrlIds.current.add(id);
                setUrls(prev => ({ ...prev, [offlineMainPath(id)]: objectUrlFor(prepared.main), [offlineThumbPath(id)]: objectUrlFor(prepared.thumb) }));
                ids.push(id);
                added++;
            } catch (e) {
                failed++;
                lastError = /quota|storage|cancelled/i.test(String((e as any)?.message || '')) ? "This device's storage is full. Free some space or reconnect to upload." : describeImageError(e);
            }
            setUploading({ done: i + 1, total: todo.length });
        }
        return { added, ids, failed, lastError };
    };

    // ------------------------------------------------------------------------------- add photos
    const addFiles = async (fileList: FileList | null) => {
        const files = Array.from(fileList || []).slice(0, 50);
        if (fileRef.current) fileRef.current.value = '';
        if (cameraRef.current) cameraRef.current.value = '';
        if (!files.length) return;
        if (deviceMode) {
            // offline: the same plan check with what this device knows, then the device's own room
            let todo = files;
            const q = checkPhotoQuota(deviceUsage(), todo.length, todo.length * EST_PHOTO_BYTES);
            if (!q.ok) {
                if (q.allowed <= 0) { limitReached(q.reason); return; }
                toast.info(`Only ${q.allowed} of ${todo.length} photos fit. ${q.reason}`, { duration: 8000 });
                todo = todo.slice(0, q.allowed);
            }
            const room = offlinePhotoRoom(await offline!.fileUsage(), todo.length, todo.length * EST_PHOTO_BYTES);
            if (!room.ok) {
                if (room.allowed <= 0) { toast.error(room.reason, { duration: 8000 }); return; }
                toast.info(`Only ${room.allowed} of ${todo.length} photos fit. ${room.reason}`, { duration: 8000 });
                todo = todo.slice(0, room.allowed);
            }
            const tag = stage || defaultTagForNewPhotos(list);
            setUploading({ done: 0, total: todo.length });
            const res = await keepOnDevice(todo, tag);
            setUploading(null);
            if (res.added) {
                toast.success(online
                    ? `${res.added} ${res.added === 1 ? 'photo' : 'photos'} saved as “${tagLabel(tag)}”. They upload once this job has synced.`
                    : `${res.added} ${res.added === 1 ? 'photo' : 'photos'} saved on this device as “${tagLabel(tag)}”. They upload when you’re back online.`);
            }
            if (res.failed && res.lastError) toast.error(`${res.failed} ${res.failed === 1 ? 'photo was' : 'photos were'} not added. ${res.lastError}`);
            return;
        }
        if (!online) {
            toast.error("You're offline. Reconnect to add photos.");
            return;
        }
        const userId = (await currentUserId()) || job.userId;
        if (!userId) { toast.error('Please sign in again.'); return; }
        let todo = files;
        const u = usage || (await fetchPhotoUsage(job.id, plan));
        if (u) {
            const q = checkPhotoQuota(u, todo.length, todo.length * EST_PHOTO_BYTES);
            if (!q.ok) {
                if (q.allowed <= 0) { limitReached(q.reason, u.tier); return; }
                toast.info(`Only ${q.allowed} of ${todo.length} photos fit. ${q.reason}`, { duration: 8000 });
                todo = todo.slice(0, q.allowed);
            }
        }
        const tag = stage || defaultTagForNewPhotos(list);
        let added = 0;
        let failed = 0;
        let lastError = '';
        setUploading({ done: 0, total: todo.length });
        for (let i = 0; i < todo.length; i++) {
            let prepared;
            try {
                prepared = await preparePhoto(todo[i]);
            } catch (e) {
                failed++;
                lastError = describeImageError(e);
                setUploading({ done: i + 1, total: todo.length });
                continue;
            }
            try {
                const photo = await addJobPhoto({ userId, jobId: job.id, photo: prepared, tag });
                const thumbUrl = URL.createObjectURL(prepared.thumb);
                const mainUrl = URL.createObjectURL(prepared.main);
                objectUrls.current.push(thumbUrl, mainUrl);
                if (photo.thumbPath) requested.current.add(photo.thumbPath);
                requested.current.add(photo.storagePath);
                setUrls(prev => ({ ...prev, ...(photo.thumbPath ? { [photo.thumbPath]: thumbUrl } : {}), [photo.storagePath]: mainUrl }));
                setPhotos(prev => [photo, ...(prev || [])]);
                setUsage(prev => (prev ? { ...prev, usedBytes: prev.usedBytes + photo.sizeBytes, usedCount: prev.usedCount + 1, jobCount: prev.jobCount + 1 } : prev));
                added++;
            } catch (e) {
                if (isPlanLimitError(e)) {
                    failed += todo.length - i;
                    limitReached(planLimitMessage(e));
                    lastError = '';
                    break;
                }
                if (offline && isOfflineFailure(e)) {
                    // the connection dropped: this photo and the rest wait on this device and upload later
                    const res = await keepOnDevice(todo.slice(i), tag);
                    if (res.added) toast.info(`The connection dropped: ${res.added} ${res.added === 1 ? 'photo is' : 'photos are'} saved on this device and upload when you’re back online.`, { duration: 8000 });
                    failed += res.failed;
                    lastError = res.lastError;
                    break;
                }
                failed++;
                lastError = describeError(e);
            }
            setUploading({ done: i + 1, total: todo.length });
        }
        setUploading(null);
        if (added) toast.success(`${added} ${added === 1 ? 'photo' : 'photos'} added as “${tagLabel(tag)}”.`);
        if (failed && lastError) toast.error(`${failed} ${failed === 1 ? 'photo was' : 'photos were'} not added. ${lastError}`);
        if (onlineRef.current) fetchPhotoUsage(job.id, plan).then(next => { if (next) { setUsage(next); void saveListCopy(usageKey(job.id), [next]); } }).catch(() => undefined);
    };

    // ------------------------------------------------------------------------------- edits
    /** This change waits in the outbox: offline, a photo only on this device, or one with changes already waiting. */
    const editsWait = (photo: JobPhoto) => Boolean(offline) && (!online || pendingIds.has(photo.id) || Boolean(offline?.jobWaiting));

    const queueEdit = async (photo: JobPhoto, patch: { tag?: PhotoTag; caption?: string; shared?: boolean }) => {
        try {
            await offline!.edit(photo.id, job.id, patch);
        } catch (e) {
            toast.error(`This change couldn't be kept on this device. ${describeError(e)}`);
        }
    };

    const changeTag = async (photo: JobPhoto, tag: PhotoTag) => {
        if (photo.tag === tag) return;
        if (editsWait(photo)) { await queueEdit(photo, { tag }); return; }
        patchPhoto(photo.id, { tag });
        try { await updateJobPhoto(photo.id, { tag }); } catch (e) {
            if (offline && isOfflineFailure(e)) { await queueEdit(photo, { tag }); return; }
            patchPhoto(photo.id, { tag: photo.tag }); toast.error(describeError(e));
        }
    };

    const changeCaption = async (photo: JobPhoto, caption: string) => {
        if (editsWait(photo)) { await queueEdit(photo, { caption }); return; }
        patchPhoto(photo.id, { caption: caption.trim() });
        try { await updateJobPhoto(photo.id, { caption }); } catch (e) {
            if (offline && isOfflineFailure(e)) { patchPhoto(photo.id, { caption: photo.caption }); await queueEdit(photo, { caption }); return; }
            patchPhoto(photo.id, { caption: photo.caption }); toast.error(describeError(e));
        }
    };

    const share = async (targets: JobPhoto[], shared: boolean) => {
        const todo = targets.filter(p => p.sharedInPortal !== shared);
        if (!todo.length) return;
        // offline (or photos only on this device): the portal change waits and is made when they sync
        const waiting = todo.filter(editsWait);
        if (waiting.length) {
            for (const p of waiting) await queueEdit(p, { shared });
            toast.success(shared
                ? `${waiting.length} ${waiting.length === 1 ? 'photo shows' : 'photos show'} in the client portal once ${waiting.length === 1 ? 'it has' : 'they have'} synced.`
                : `${waiting.length} ${waiting.length === 1 ? 'photo is' : 'photos are'} removed from the client portal once synced.`);
        }
        const direct = todo.filter(p => !editsWait(p));
        if (!direct.length) return;
        const userId = (await currentUserId()) || job.userId;
        setBusy(true);
        let done = 0;
        try {
            for (const p of direct) {
                const res = await setPhotoShared(p, shared, userId);
                patchPhoto(p.id, res);
                done++;
            }
            toast.success(shared
                ? `${done} ${done === 1 ? 'photo is' : 'photos are'} now in the client portal.${hasClient ? '' : ' Link this job to a client so a portal shows them.'}`
                : `${done} ${done === 1 ? 'photo was' : 'photos were'} removed from the client portal.`);
        } catch (e) {
            toast.error(`${done ? `${done} done, then: ` : ''}${describeError(e)}`);
        } finally {
            setBusy(false);
        }
    };

    const remove = async (allIds: string[]) => {
        if (!allIds.length) return;
        // photos only on this device: deleted here (no connection needed)
        const local = allIds.filter(isPendingCreate);
        for (const id of local) await offline?.discard(id).catch(() => undefined);
        const ids = allIds.filter(id => !isPendingCreate(id));
        if (!ids.length) {
            setSelected(new Set());
            toast.success(local.length === 1 ? 'Photo deleted.' : `${local.length} photos deleted.`);
            return;
        }
        if (!online) {
            toast.error(local.length
                ? `${local.length} ${local.length === 1 ? 'photo' : 'photos'} deleted from this device. ${NEEDS_CONNECTION.replace("You're offline. This needs", 'Deleting the uploaded ones needs')}`
                : NEEDS_CONNECTION);
            return;
        }
        setBusy(true);
        try {
            await deleteJobPhotos(ids);
            // changes still waiting for these photos go with them
            for (const id of ids) if (pendingIds.has(id)) await offline?.discard(id).catch(() => undefined);
            const gone = new Set(ids);
            const removed = list.filter(p => gone.has(p.id));
            setPhotos(prev => (prev ? prev.filter(p => !gone.has(p.id)) : prev));
            setSelected(new Set());
            setUsage(prev => (prev ? {
                ...prev,
                usedBytes: Math.max(0, prev.usedBytes - removed.reduce((a, p) => a + p.sizeBytes, 0)),
                usedCount: Math.max(0, prev.usedCount - removed.length),
                jobCount: Math.max(0, prev.jobCount - removed.length),
            } : prev));
            toast.success(allIds.length === 1 ? 'Photo deleted.' : `${allIds.length} photos deleted.`);
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy(false);
        }
    };

    /** The full photo: the device copy of a photo taken offline, else the account's file. */
    const photoBlob = async (photo: JobPhoto): Promise<Blob> => {
        if (isOfflinePath(photo.storagePath)) {
            const files = await offline?.filesOf(photo.id);
            const main = files?.[PHOTO_FILE_MAIN];
            if (!main) throw new Error('This photo is no longer on this device.');
            return main;
        }
        if (!online) throw new Error(NEEDS_CONNECTION);
        return downloadPhoto(photo.storagePath);
    };

    const download = async (photo: JobPhoto) => {
        try {
            const blob = await photoBlob(photo);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const ext = /\.(png|webp)$/i.exec(photo.storagePath)?.[1] || 'jpg';
            a.download = `${(job.name || 'job').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'job'}-${tagLabel(photo.tag).toLowerCase()}-${photo.id.slice(0, 6)}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        } catch (e) {
            toast.error(describeError(e));
        }
    };

    // ------------------------------------------------------------------------------- markup
    const openMarkup = async (photo: JobPhoto) => {
        if (!online && !isOfflinePath(photo.storagePath)) {
            toast.error(offline ? "You're offline. This photo isn't saved on this device; mark it up when you're back online (photos you take offline can be marked up now)." : "You're offline. Reconnect to mark up photos.");
            return;
        }
        setBusy(true);
        try {
            const blob = await photoBlob(photo);
            setMarkup({ photo, blob });
        } catch (e) {
            toast.error(describeError(e));
        } finally {
            setBusy(false);
        }
    };

    const saveMarkup = async (file: File) => {
        if (!markup) return;
        const original = markup.photo;
        // offline, or the original is only on this device: the marked-up copy waits on this device too
        if (offline && (deviceMode || isOfflinePath(original.storagePath))) {
            const q = checkPhotoQuota(deviceUsage(), 1, EST_PHOTO_BYTES);
            if (!q.ok) { setMarkup(null); limitReached(q.reason); return; }
            const room = offlinePhotoRoom(await offline.fileUsage(), 1, EST_PHOTO_BYTES);
            if (!room.ok) throw new Error(room.reason);
            const t = new Date(original.takenAt).getTime();
            const res = await keepOnDevice([file], original.tag, {
                caption: original.caption ? `${original.caption} (marked up)`.slice(0, 500) : 'Marked up',
                sourcePhotoId: original.id,
                takenAt: () => new Date((Number.isFinite(t) ? t : Date.now()) + 1000).toISOString(),
            });
            setUploading(null);
            if (!res.added) throw new Error(res.lastError || 'The marked-up copy could not be saved.');
            setMarkup(null);
            if (filter !== 'all' && filter !== original.tag) setFilter('all');
            setViewerId(res.ids[0] || null);
            toast.success(online ? 'Marked-up copy saved. The original is kept.' : 'Marked-up copy saved on this device. It uploads when you’re back online; the original is kept.');
            return;
        }
        const userId = (await currentUserId()) || job.userId;
        try {
            const prepared = await preparePhoto(file);
            // right next to the original in the timeline
            const t = new Date(original.takenAt).getTime();
            prepared.takenAt = new Date((Number.isFinite(t) ? t : Date.now()) + 1000).toISOString();
            const photo = await addJobPhoto({
                userId, jobId: job.id, photo: prepared, tag: original.tag,
                caption: original.caption ? `${original.caption} (marked up)`.slice(0, 500) : 'Marked up',
                sourcePhotoId: original.id,
            });
            const thumbUrl = URL.createObjectURL(prepared.thumb);
            const mainUrl = URL.createObjectURL(prepared.main);
            objectUrls.current.push(thumbUrl, mainUrl);
            if (photo.thumbPath) requested.current.add(photo.thumbPath);
            requested.current.add(photo.storagePath);
            setUrls(prev => ({ ...prev, ...(photo.thumbPath ? { [photo.thumbPath]: thumbUrl } : {}), [photo.storagePath]: mainUrl }));
            setPhotos(prev => [photo, ...(prev || [])]);
            setUsage(prev => (prev ? { ...prev, usedBytes: prev.usedBytes + photo.sizeBytes, usedCount: prev.usedCount + 1, jobCount: prev.jobCount + 1 } : prev));
            setMarkup(null);
            if (filter !== 'all' && filter !== photo.tag) setFilter('all');
            setViewerId(photo.id);
            toast.success('Marked-up copy saved. The original is kept.');
        } catch (e) {
            if (isPlanLimitError(e)) {
                setMarkup(null);
                limitReached(planLimitMessage(e));
                return;
            }
            throw new Error(describeError(e, 'The marked-up copy could not be saved.'));
        }
    };

    // ------------------------------------------------------------------------------- report
    const makeReport = async () => {
        // photos still on this device are added once they have synced
        const source = (selecting && selected.size ? selectedPhotos : list).filter(p => !isOfflinePath(p.storagePath));
        if (!online) { toast.error("You're offline. Reconnect to build the report."); return; }
        if (!source.length) { toast.info('These photos are still waiting to sync. Build the report once they have uploaded.'); return; }
        setReport({ done: 0, total: 1 });
        try {
            const { downloadPhotoReport } = await import('./photoReport.ts');
            const res = await downloadPhotoReport({
                photos: source,
                job,
                profile,
                includeOthers: selecting && selected.size > 0,
                onProgress: (done, total) => setReport({ done, total }),
            });
            toast.success(`Photo report downloaded (${res.photos} ${res.photos === 1 ? 'photo' : 'photos'}).`);
        } catch (e) {
            toast.error(describeError(e, 'The report could not be created.'));
        } finally {
            setReport(null);
        }
    };

    // ------------------------------------------------------------------------------- AI (Premium + AI)
    const lastUpdate = sentUpdates[0] || null;
    const openAi = (mode: PhotoAIMode) => {
        if (!aiPlan) { onUpgrade(AI_PHOTOS_UPGRADE_REASON); return; }
        if (!online) { toast.error("You're offline. Reconnect to use the AI."); return; }
        // A selection on the timeline wins; otherwise the default pick (since the last update / the latest day).
        const pick = selecting && selected.size
            ? capPhotos(selectedPhotos.filter(p => !isOfflinePath(p.storagePath)))
            : mode === 'update' ? pickUpdatePhotos(uploaded, lastUpdate?.sentAt) : pickWalkthroughPhotos(uploaded);
        if (selecting && selected.size > pick.length) toast.info(`The AI takes up to ${pick.length} photos at a time: the newest ${pick.length} of your selection are used.`);
        setAiMode({ mode, pick });
    };

    const toggleSelected = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    // ------------------------------------------------------------------------------- render
    if (photos === undefined) {
        return (
            <div aria-busy="true" aria-label="Loading photos">
                <div className="mb-4 flex gap-2"><div className="skeleton h-10 w-32" /><div className="skeleton h-10 w-40" /></div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-square" />)}
                </div>
            </div>
        );
    }

    if (photos === null) {
        return (
            <p className="rounded-xl border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                Job photos will be available after the next server update.
            </p>
        );
    }

    // with photos waiting on this device, the meter counts them too (they take their room when they sync)
    const pendingCount = pendingItems.filter(i => i.kind === 'create').length;
    const shownUsage = usage && pendingCount && offline ? deviceUsage() : usage;
    const usageText = shownUsage
        ? shownUsage.perJob !== null
            ? `${Math.min(shownUsage.jobCount, shownUsage.perJob)} of ${shownUsage.perJob} photos on this job · ${formatBytes(shownUsage.usedBytes)} of ${formatBytes(shownUsage.totalBytes)} used`
            : `${formatBytes(shownUsage.usedBytes)} of ${formatBytes(shownUsage.totalBytes)} photo storage used`
        : '';
    const pairsPossible = list.some(p => p.tag === 'before') || list.some(p => p.tag === 'after');
    const working = busy || !!uploading || !!report;
    const deviceNote = !online && offline
        ? `Offline: ${fromDevice ? 'the photos below are the copy saved on this device. ' : ''}New photos stay on this device and upload when you’re back online.`
        : pendingCount && offline?.jobWaiting
            ? 'This job hasn’t synced yet: its photos upload right after it.'
            : '';

    return (
        <section aria-label="Job photos" className="min-w-0">
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {touch && (
                        <button type="button" className="btn btn-primary min-h-[44px]" onClick={() => cameraRef.current?.click()} disabled={(!online && !offline) || !!uploading}>
                            <CameraIcon className="h-4 w-4" /> Take photo
                        </button>
                    )}
                    <button type="button" className={`btn min-h-[44px] ${touch ? 'btn-outline' : 'btn-primary'}`} onClick={() => fileRef.current?.click()} disabled={(!online && !offline) || !!uploading}>
                        <UploadImageIcon className="h-4 w-4" /> {touch ? 'Upload' : 'Add photos'}
                    </button>
                    {list.length > 0 && (
                        <button type="button" className="btn btn-outline min-h-[44px]" onClick={() => void makeReport()} disabled={working || (!selecting && !pairsPossible)}
                            title={!selecting && !pairsPossible ? 'Tag photos as Before or After first' : undefined}>
                            <FileTextIcon className="h-4 w-4" /> {selecting && selected.size ? `Report (${selected.size})` : 'Before/after report'}
                        </button>
                    )}
                    {list.length > 0 && (
                        <button type="button" className="btn btn-ghost min-h-[44px]" onClick={() => { setSelecting(s => !s); setSelected(new Set()); }} disabled={!!uploading}>
                            {selecting ? 'Done' : 'Select'}
                        </button>
                    )}
                    <HelpButton topic="photos" className="ml-auto" />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New photos</span>
                        <Segmented<PhotoTag> size="sm" ariaLabel="Stage for new photos" options={PHOTO_TAGS} value={stage || 'during'} onChange={(v) => setStage(v)} />
                    </div>
                    {usageText && <p className="text-xs text-muted-foreground sm:text-right">{usageText}</p>}
                </div>
                {deviceNote && <p className="text-xs text-muted-foreground" role="status">{deviceNote}</p>}
                {list.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                            {aiPlan
                                ? updateHint(list, lastUpdate)
                                : <>With <span className="font-semibold text-foreground">Premium + AI</span>, the assistant writes client updates and daily reports from these photos.</>}
                        </p>
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-outline btn-sm min-h-[40px] flex-1 sm:flex-none" onClick={() => openAi('update')} disabled={working}>
                                <SparklesIcon className="h-4 w-4" /> Write client update
                            </button>
                            <button type="button" className="btn btn-outline btn-sm min-h-[40px] flex-1 sm:flex-none" onClick={() => openAi('walkthrough')} disabled={working}>
                                <SparklesIcon className="h-4 w-4" /> AI walkthrough
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {(uploading || report) && (
                <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3" role="status" aria-live="polite">
                    <p className="text-sm font-medium">
                        {uploading
                            ? `${deviceMode ? 'Saving photos on this device' : 'Adding photos'} ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total}…`
                            : `Building the report ${report!.done} of ${report!.total}…`}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((uploading ? uploading.done : report!.done) / Math.max(1, uploading ? uploading.total : report!.total)) * 100)}%` }} />
                    </div>
                </div>
            )}

            {loadError && (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <span>{loadError}</span>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => void load()}>Try again</button>
                </div>
            )}

            {list.length > 0 && (
                <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Filter photos">
                    {FILTERS.filter(f => f.value === 'all' || counts[f.value] > 0 || filter === f.value).map(f => (
                        <button
                            key={f.value}
                            type="button"
                            role="radio"
                            aria-checked={filter === f.value}
                            onClick={() => setFilter(f.value)}
                            className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${filter === f.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                        >
                            {f.label} <span className="ml-1 opacity-70">{counts[f.value]}</span>
                        </button>
                    ))}
                </div>
            )}

            {list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
                    <p className="text-base font-semibold">No photos yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                        Take “Before” photos when you arrive and “After” photos when you finish: one tap turns them into a before/after report,
                        and you can show the ones you pick in the client portal.
                    </p>
                </div>
            ) : visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
                    No photos match this filter. <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setFilter('all')}>Show all</button>
                </div>
            ) : (
                <div className="space-y-5">
                    {groups.map(g => (
                        <div key={g.day}>
                            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{g.label} <span className="font-normal">· {g.photos.length}</span></h3>
                            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2 lg:grid-cols-6">
                                {g.photos.map(p => {
                                    const src = (p.thumbPath && urls[p.thumbPath]) || urls[p.storagePath] || '';
                                    const isSel = selected.has(p.id);
                                    const sync = pendingIds.has(p.id) ? offline?.stateOf(p.id) ?? null : null;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => (selecting ? toggleSelected(p.id) : setViewerId(p.id))}
                                            aria-pressed={selecting ? isSel : undefined}
                                            aria-label={`${tagLabel(p.tag)} photo${p.caption ? `: ${p.caption}` : ''}${sync ? ` (${sync.label})` : ''}`}
                                            className={`relative aspect-square overflow-hidden rounded-lg bg-muted outline-none transition focus-visible:ring-4 focus-visible:ring-primary/40 ${isSel ? 'ring-4 ring-primary' : ''}`}
                                        >
                                            {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} /> : <span className={`${online ? 'skeleton ' : ''}block h-full w-full`} />}
                                            {sync && (
                                                <span title={sync.reason} className="absolute right-1 top-1 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                                    <span className={`h-1.5 w-1.5 rounded-full ${sync.tone === 'error' ? 'bg-red-400' : sync.tone === 'syncing' ? 'animate-pulse bg-sky-300' : 'bg-amber-300'}`} aria-hidden />
                                                    {sync.tone === 'pending' ? 'Waiting' : sync.label}
                                                </span>
                                            )}
                                            <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{tagLabel(p.tag)}</span>
                                            {p.sharedInPortal && <span className="absolute bottom-1 right-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">Portal</span>}
                                            {selecting && (
                                                <span className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 ${isSel ? 'border-primary bg-primary text-primary-foreground' : 'border-white bg-black/30'}`}>
                                                    {isSel && <CheckIcon className="h-3.5 w-3.5" />}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selecting && (
                <div className="sticky bottom-24 z-20 mt-4 md:bottom-4">
                    <div className="card flex flex-wrap items-center gap-2 p-2 shadow-lift">
                        <span className="px-2 text-sm font-semibold tabular-nums">{selected.size} selected</span>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(visible.map(p => p.id)))}>All</button>
                        <span className="ml-auto" />
                        <button type="button" className="btn btn-sm btn-outline" disabled={!selected.size || working} onClick={() => void share(selectedPhotos, true)}>Show in portal</button>
                        <button type="button" className="btn btn-sm btn-outline" disabled={!selected.size || working} onClick={() => void share(selectedPhotos, false)}>Hide</button>
                        <button type="button" className="btn btn-sm btn-danger" disabled={!selected.size || working}
                            onClick={() => { if (window.confirm(`Delete ${selected.size} ${selected.size === 1 ? 'photo' : 'photos'}? This can’t be undone.`)) void remove(Array.from(selected)); }}>
                            Delete
                        </button>
                    </div>
                </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void addFiles(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void addFiles(e.target.files)} />

            {viewerIndex >= 0 && (
                <PhotoViewer
                    photos={visible}
                    index={viewerIndex}
                    urls={urls}
                    ensureUrl={ensureUrl}
                    busy={busy}
                    paused={!!markup}
                    hasClient={hasClient}
                    onIndex={(i) => setViewerId(visible[i]?.id ?? null)}
                    onClose={() => setViewerId(null)}
                    onTag={(p, t) => void changeTag(p, t)}
                    onCaption={(p, c) => void changeCaption(p, c)}
                    onShare={(p, s) => void share([p], s)}
                    onMarkup={(p) => void openMarkup(p)}
                    onDownload={(p) => void download(p)}
                    onDelete={(p) => {
                        const next = visible[viewerIndex + 1] || visible[viewerIndex - 1];
                        void remove([p.id]).then(() => setViewerId(next && next.id !== p.id ? next.id : null));
                    }}
                />
            )}

            {markup && (
                <React.Suspense fallback={null}>
                    <PhotoMarkupEditor source={markup.blob} onCancel={() => setMarkup(null)} onSave={saveMarkup} />
                </React.Suspense>
            )}

            {aiMode && (
                <React.Suspense fallback={null}>
                    <PhotoAIModal
                        mode={aiMode.mode}
                        job={job}
                        client={client}
                        clients={clients}
                        profile={profile}
                        plan={plan}
                        photos={uploaded}
                        urls={urls}
                        ensureUrl={ensureUrl}
                        initialPick={aiMode.pick}
                        lastUpdate={lastUpdate}
                        hasClient={hasClient}
                        onClose={() => setAiMode(null)}
                        onUpgrade={onUpgrade}
                        onSharePhotos={(targets) => share(targets, true)}
                        onRecorded={(u) => setSentUpdates(prev => [u, ...prev.filter(x => x.id !== u.id)])}
                        onEmailSent={onEmailSent}
                        onDocumentsChanged={onDocumentsChanged}
                        uploadImage={uploadImage}
                    />
                </React.Suspense>
            )}
        </section>
    );
};

export default JobPhotos;
