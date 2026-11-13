/**
 * Client portal: the job photos the contractor chose to show ("Show in client portal"), grouped by job, with a
 * simple full-screen viewer. Reads get_portal_photos(portal key); renders nothing when there are none or when the
 * database doesn't have job photos yet.
 *
 * Mount (PortalView.tsx, owned by another area), e.g. under the document list:
 *   <PortalPhotos portalKey={key} />
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase.ts';
import { tagLabel } from './photoLogic.ts';
import { portalPhotoUrl } from './photosApi.ts';

interface PortalPhoto { id: string; jobId: string; jobName: string; tag: string; caption: string; takenAt: string; url: string }

const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const PortalPhotos: React.FC<{ portalKey: string; className?: string }> = ({ portalKey, className = '' }) => {
    const [photos, setPhotos] = useState<PortalPhoto[]>([]);
    const [open, setOpen] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase.rpc('get_portal_photos', { p_key: portalKey });
            if (cancelled || error || !Array.isArray(data)) return;
            setPhotos(data
                .filter((r: any) => r && typeof r.path === 'string' && r.path)
                .map((r: any) => ({
                    id: String(r.id), jobId: String(r.job_id || ''), jobName: String(r.job_name || 'Job'), tag: String(r.tag || ''),
                    caption: String(r.caption || ''), takenAt: String(r.taken_at || ''), url: portalPhotoUrl(r.path),
                })));
        })().catch(() => undefined);
        return () => { cancelled = true; };
    }, [portalKey]);

    const byJob = useMemo(() => {
        const map = new Map<string, { name: string; items: { photo: PortalPhoto; index: number }[] }>();
        photos.forEach((photo, index) => {
            const g = map.get(photo.jobId) || { name: photo.jobName, items: [] };
            g.items.push({ photo, index });
            map.set(photo.jobId, g);
        });
        return Array.from(map.values());
    }, [photos]);

    useEffect(() => {
        if (open === null) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(null);
            else if (e.key === 'ArrowRight') setOpen(i => (i !== null && i < photos.length - 1 ? i + 1 : i));
            else if (e.key === 'ArrowLeft') setOpen(i => (i !== null && i > 0 ? i - 1 : i));
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, photos.length]);

    if (!photos.length) return null;
    const current = open !== null ? photos[open] : null;

    return (
        <section aria-labelledby="portal-photos-heading" className={className}>
            <h2 id="portal-photos-heading" className="text-lg font-bold">Job photos</h2>
            <div className="mt-3 space-y-5">
                {byJob.map(g => (
                    <div key={g.name + g.items[0].photo.id}>
                        {byJob.length > 1 && <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{g.name}</h3>}
                        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2">
                            {g.items.map(({ photo, index }) => (
                                <button key={photo.id} type="button" onClick={() => setOpen(index)}
                                    className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                                    aria-label={`${tagLabel(photo.tag)} photo${photo.caption ? `: ${photo.caption}` : ''}`}>
                                    <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">{tagLabel(photo.tag)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {current && createPortal(
                <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label="Photo">
                    <div className="flex items-center justify-between px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                        <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={() => setOpen(null)}>Close</button>
                        <span className="text-sm tabular-nums text-white/70">{(open ?? 0) + 1} / {photos.length}</span>
                        <span className="w-16" />
                    </div>
                    <div className="relative flex min-h-0 flex-1 items-center justify-center">
                        <img src={current.url} alt={current.caption || `${tagLabel(current.tag)} photo`} className="max-h-full max-w-full object-contain" />
                        {open! > 0 && <button type="button" aria-label="Previous photo" onClick={() => setOpen(open! - 1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl">‹</button>}
                        {open! < photos.length - 1 && <button type="button" aria-label="Next photo" onClick={() => setOpen(open! + 1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl">›</button>}
                    </div>
                    <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-sm">
                        <p className="font-semibold">{tagLabel(current.tag)}{current.caption ? ` · ${current.caption}` : ''}</p>
                        <p className="text-white/60">{[current.jobName, fmtDate(current.takenAt)].filter(Boolean).join(' · ')}</p>
                    </div>
                </div>,
                document.body,
            )}
        </section>
    );
};

export default PortalPhotos;
