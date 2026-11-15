/**
 * Settings › Public profile › Gallery: up to 12 photos from your job photo library that show on your public request page.
 * Add (pick from the library), caption, move left / right, remove. Each change is saved at once through
 * lib/profile/profileApi.ts (addGalleryPhoto / saveGallery / removeGalleryPhoto) and needs a connection.
 * Said plainly on screen: a gallery photo is COPIED to a public folder and shown to anyone with your link; captions are
 * public too. Removing it here deletes that public copy only; the photo on the job stays.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { addGalleryPhoto, galleryPublicUrl, removeGalleryPhoto, saveGallery } from '../../lib/profile/profileApi.ts';
import { canAddToGallery, moveGalleryItem, setGalleryCaption } from '../../lib/profile/profileLogic.ts';
import { PROFILE_LIMITS, type GalleryItem, type MyRequestProfile } from '../../lib/profile/profileTypes.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { toast } from '../Toast.tsx';
import { ConfirmDialog, Modal, Notice, Spinner } from '../commsKit.tsx';
import { PlusIcon, TrashIcon } from '../Icons.tsx';
import { loadPhotoLibrary, type LibraryPhoto } from './galleryLibrary.ts';

const ALL_JOBS = '';

const Picker: React.FC<{
    gallery: GalleryItem[];
    busy: boolean;
    onPick: (photo: LibraryPhoto) => Promise<void>;
    onClose: () => void;
}> = ({ gallery, busy, onPick, onClose }) => {
    const [photos, setPhotos] = useState<LibraryPhoto[] | null>(null);
    const [error, setError] = useState('');
    const [job, setJob] = useState(ALL_JOBS);

    useEffect(() => {
        let alive = true;
        loadPhotoLibrary().then(list => { if (alive) setPhotos(list); }).catch(e => { if (alive) setError(describeError(e, 'Your photos could not be loaded.')); });
        return () => { alive = false; };
    }, []);

    const jobs = useMemo(() => {
        const seen = new Map<string, string>();
        for (const p of photos || []) if (!seen.has(p.jobId)) seen.set(p.jobId, p.jobName);
        return Array.from(seen, ([id, name]) => ({ id, name }));
    }, [photos]);
    const shown = (photos || []).filter(p => !job || p.jobId === job);
    const inGallery = new Set(gallery.map(g => g.photoId).filter(Boolean));
    const full = !canAddToGallery(gallery);

    return (
        <Modal open onClose={onClose} size="lg" title="Pick photos for your page" description={`${gallery.length} of ${PROFILE_LIMITS.gallery} in your gallery. The finished work (After photos) comes first.`}>
            {error ? (
                <Notice tone="danger">{error}</Notice>
            ) : photos === null ? (
                <div className="grid grid-cols-3 gap-2" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton aspect-square" />)}</div>
            ) : photos.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">You have no job photos yet. Add photos on a job page (Photos tab), then pick them here.</p>
            ) : (
                <>
                    {jobs.length > 1 && (
                        <div className="mb-3">
                            <label className="sr-only" htmlFor="gallery-job">Job</label>
                            <select id="gallery-job" className="input" value={job} onChange={(e) => setJob(e.target.value)}>
                                <option value={ALL_JOBS}>All jobs</option>
                                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                            </select>
                        </div>
                    )}
                    {full && <p className="mb-3 text-sm font-medium text-warning">The gallery is full. Remove a photo to add another.</p>}
                    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {shown.map(p => {
                            const added = inGallery.has(p.id);
                            return (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        disabled={busy || added || full}
                                        onClick={() => void onPick(p)}
                                        className={`relative block aspect-square w-full overflow-hidden rounded-xl border bg-muted text-left ${added ? 'border-success' : 'border-border hover:border-primary'} disabled:cursor-not-allowed`}
                                        aria-label={added ? `Already in your gallery: ${p.jobName}` : `Add photo from ${p.jobName}`}
                                    >
                                        {p.thumbUrl ? <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover ${added ? 'opacity-60' : ''}`} /> : null}
                                        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white">{added ? 'In your gallery' : p.jobName}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </Modal>
    );
};

const GalleryManager: React.FC<{
    userId: string;
    gallery: GalleryItem[];
    isOnline: boolean;
    onSaved: (profile: MyRequestProfile) => void;
}> = ({ userId, gallery, isOnline, onSaved }) => {
    const [busy, setBusy] = useState(false);
    const [picking, setPicking] = useState(false);
    const [removing, setRemoving] = useState<GalleryItem | null>(null);
    const [captions, setCaptions] = useState<Record<string, string>>({});
    useEffect(() => { setCaptions(Object.fromEntries(gallery.map(g => [g.path, g.caption || '']))); }, [gallery]);

    const run = async (work: () => Promise<MyRequestProfile>, ok?: string): Promise<boolean> => {
        if (!isOnline) { toast.error(NEEDS_CONNECTION); return false; }
        setBusy(true);
        try {
            onSaved(await work());
            if (ok) toast.success(ok);
            return true;
        } catch (e) {
            toast.error(describeError(e, 'The gallery could not be saved.'));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const saveCaption = (g: GalleryItem) => {
        const next = (captions[g.path] ?? '').trim();
        if (next === (g.caption || '')) return;
        void run(() => saveGallery(setGalleryCaption(gallery, g.path, next || null)));
    };

    return (
        <div>
            <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-bold text-foreground">Photo gallery</h4>
                <span className="text-xs tabular-nums text-muted-foreground">{gallery.length} of {PROFILE_LIMITS.gallery}</span>
            </div>
            <p className="mt-1 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3 text-sm leading-relaxed text-foreground">
                <strong>These photos are public.</strong> Each one is copied to a public folder and shown on your request page to anyone who has your link, and so are the captions. Keep faces, house numbers and anything private out of them. Removing a photo here deletes the public copy; the photo on your job stays.
            </p>

            {gallery.length > 0 && (
                <ul className="mt-4 space-y-3">
                    {gallery.map((g, i) => (
                        <li key={g.path} className="flex gap-3">
                            <img src={galleryPublicUrl(g.path)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-20 w-24 shrink-0 rounded-lg bg-muted object-cover" />
                            <div className="min-w-0 flex-1">
                                <label className="sr-only" htmlFor={`cap-${i}`}>Caption for photo {i + 1} (public)</label>
                                <input
                                    id={`cap-${i}`}
                                    className="input"
                                    value={captions[g.path] ?? ''}
                                    maxLength={PROFILE_LIMITS.caption}
                                    placeholder="Caption (public), for example: Kitchen remodel, 2026"
                                    disabled={busy}
                                    onChange={(e) => setCaptions(c => ({ ...c, [g.path]: e.target.value }))}
                                    onBlur={() => saveCaption(g)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                />
                                <div className="mt-1.5 flex items-center gap-1">
                                    <button type="button" className="btn btn-outline btn-sm min-h-[36px]" disabled={busy || i === 0} aria-label={`Move photo ${i + 1} earlier`}
                                        onClick={() => void run(() => saveGallery(moveGalleryItem(gallery, g.path, -1)))}>←</button>
                                    <button type="button" className="btn btn-outline btn-sm min-h-[36px]" disabled={busy || i === gallery.length - 1} aria-label={`Move photo ${i + 1} later`}
                                        onClick={() => void run(() => saveGallery(moveGalleryItem(gallery, g.path, 1)))}>→</button>
                                    <button type="button" className="btn btn-ghost btn-sm ml-auto min-h-[36px] text-destructive" disabled={busy} onClick={() => setRemoving(g)}>
                                        <TrashIcon className="h-3.5 w-3.5" /> Remove
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-4">
                <button type="button" className="btn btn-outline min-h-[44px]" onClick={() => setPicking(true)} disabled={busy || !canAddToGallery(gallery)}>
                    {busy ? <Spinner label="Saving…" /> : <><PlusIcon className="h-4 w-4" /> {gallery.length ? 'Add more photos' : 'Pick photos from your jobs'}</>}
                </button>
                {!canAddToGallery(gallery) && <p className="mt-1.5 text-xs text-muted-foreground">The gallery holds up to {PROFILE_LIMITS.gallery} photos.</p>}
            </div>

            {picking && (
                <Picker
                    gallery={gallery}
                    busy={busy}
                    onClose={() => setPicking(false)}
                    onPick={async (p) => { await run(() => addGalleryPhoto(userId, { id: p.id, storagePath: p.storagePath }, null, gallery), 'Added to your public gallery.'); }}
                />
            )}
            <ConfirmDialog
                open={!!removing}
                title="Remove this photo from your page?"
                message={<p>It disappears from your public page and the public copy is deleted. The photo on your job stays.</p>}
                confirmLabel="Remove"
                destructive
                busy={busy}
                onCancel={() => setRemoving(null)}
                onConfirm={async () => { if (removing && await run(() => removeGalleryPhoto(removing.path, gallery), 'Removed.')) setRemoving(null); }}
            />
        </div>
    );
};

export default GalleryManager;
