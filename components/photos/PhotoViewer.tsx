/**
 * Full-screen photo viewer for the job timeline: swipe / arrow keys between photos, stage, caption,
 * "Show in client portal", mark up (saved as a new photo), download and delete.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadIcon, PenIcon, TrashIcon } from '../Icons.tsx';
import { PHOTO_TAGS, type JobPhoto, type PhotoTag } from './photoLogic.ts';

interface Props {
    photos: JobPhoto[];
    index: number;
    urls: Record<string, string>;
    /** Loads a signed URL for a path that isn't in `urls` yet. */
    ensureUrl: (path: string) => void;
    busy?: boolean;
    paused?: boolean;
    hasClient: boolean;
    onIndex: (i: number) => void;
    onClose: () => void;
    onTag: (photo: JobPhoto, tag: PhotoTag) => void;
    onCaption: (photo: JobPhoto, caption: string) => void;
    onShare: (photo: JobPhoto, shared: boolean) => void;
    onMarkup: (photo: JobPhoto) => void;
    onDownload: (photo: JobPhoto) => void;
    onDelete: (photo: JobPhoto) => void;
}

const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const PhotoViewer: React.FC<Props> = ({
    photos, index, urls, ensureUrl, busy, paused, hasClient, onIndex, onClose, onTag, onCaption, onShare, onMarkup, onDownload, onDelete,
}) => {
    const photo = photos[index];
    const [caption, setCaption] = useState(photo?.caption || '');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const touch = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => { setCaption(photo?.caption || ''); setConfirmDelete(false); }, [photo?.id]);
    useEffect(() => {
        if (!photo) return;
        if (!urls[photo.storagePath]) ensureUrl(photo.storagePath);
        const next = photos[index + 1];
        if (next && !urls[next.storagePath]) ensureUrl(next.storagePath);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photo?.id]);

    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    useEffect(() => {
        if (paused) return;
        const onKey = (e: KeyboardEvent) => {
            const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
            if (e.key === 'Escape') onClose();
            else if (!typing && e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
            else if (!typing && e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [paused, index, photos.length, onClose, onIndex]);

    if (!photo) return null;
    const src = urls[photo.storagePath] || (photo.thumbPath ? urls[photo.thumbPath] : '') || '';
    const saveCaption = () => { if (caption.trim() !== photo.caption.trim()) onCaption(photo, caption); };

    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label="Photo">
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={onClose}>Close</button>
                <p className="text-sm tabular-nums text-white/70">{index + 1} / {photos.length}</p>
                <div className="flex gap-1">
                    <button type="button" className="btn btn-ghost min-h-[44px] px-3 text-white hover:bg-white/10" onClick={() => onDownload(photo)} aria-label="Download photo"><DownloadIcon className="h-5 w-5" /></button>
                    <button type="button" className="btn btn-ghost min-h-[44px] px-3 text-red-300 hover:bg-white/10" onClick={() => setConfirmDelete(true)} aria-label="Delete photo" disabled={busy}><TrashIcon className="h-5 w-5" /></button>
                </div>
            </div>

            <div
                className="relative flex min-h-0 flex-1 select-none items-center justify-center"
                onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
                onTouchEnd={(e) => {
                    const t = touch.current;
                    touch.current = null;
                    if (!t) return;
                    const dx = e.changedTouches[0].clientX - t.x;
                    const dy = e.changedTouches[0].clientY - t.y;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                        if (dx < 0 && index < photos.length - 1) onIndex(index + 1);
                        if (dx > 0 && index > 0) onIndex(index - 1);
                    }
                }}
            >
                {src ? (
                    <img key={src} src={src} alt={photo.caption || `${photo.tag} photo`} className="max-h-full max-w-full object-contain" draggable={false} />
                ) : (
                    <span aria-hidden className="h-8 w-8 animate-spin rounded-full border-2 border-white border-r-transparent" />
                )}
                {index > 0 && (
                    <button type="button" onClick={() => onIndex(index - 1)} aria-label="Previous photo"
                        className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl hover:bg-black/70 sm:flex">‹</button>
                )}
                {index < photos.length - 1 && (
                    <button type="button" onClick={() => onIndex(index + 1)} aria-label="Next photo"
                        className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl hover:bg-black/70 sm:flex">›</button>
                )}
            </div>

            <div className="space-y-3 bg-neutral-900 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                {confirmDelete ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm">Delete this photo{photo.sharedInPortal ? ' (it is also removed from the client portal)' : ''}? This can’t be undone.</p>
                        <div className="flex gap-2">
                            <button type="button" className="btn btn-outline min-h-[44px] flex-1 border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setConfirmDelete(false)}>Cancel</button>
                            <button type="button" className="btn btn-danger min-h-[44px] flex-1" onClick={() => onDelete(photo)} disabled={busy}>Delete</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-1 overflow-x-auto rounded-xl bg-white/10 p-1" role="radiogroup" aria-label="Stage">
                            {PHOTO_TAGS.map(t => (
                                <button key={t.value} type="button" role="radio" aria-checked={photo.tag === t.value}
                                    onClick={() => onTag(photo, t.value)} disabled={busy}
                                    className={`min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold transition ${photo.tag === t.value ? 'bg-white text-neutral-950' : 'text-white/80 hover:bg-white/10'}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <input
                            className="input min-h-[44px] border-white/15 bg-neutral-800 text-white placeholder:text-white/40"
                            placeholder="Add a caption"
                            value={caption}
                            maxLength={500}
                            onChange={(e) => setCaption(e.target.value)}
                            onBlur={saveCaption}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                            aria-label="Caption"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm">
                                <input type="checkbox" className="h-5 w-5 accent-primary" checked={photo.sharedInPortal} disabled={busy}
                                    onChange={(e) => onShare(photo, e.target.checked)} />
                                <span>
                                    Show in client portal
                                    {!hasClient && <span className="block text-xs text-white/50">This job has no client yet, so no portal shows it.</span>}
                                </span>
                            </label>
                            <button type="button" className="btn min-h-[44px] bg-white text-neutral-950 hover:bg-white/90" onClick={() => onMarkup(photo)} disabled={busy}>
                                <PenIcon className="h-4 w-4" /> Mark up
                            </button>
                        </div>
                        <p className="text-xs text-white/50">
                            {fmtWhen(photo.takenAt)}{photo.sourcePhotoId ? ' · Marked-up copy' : ''}{photo.requestId ? ' · From the quote request' : ''}
                        </p>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
};

export default PhotoViewer;
