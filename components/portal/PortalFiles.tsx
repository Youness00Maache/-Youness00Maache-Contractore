/**
 * Client portal › Project › "Files": the links and images the contractor chose to show, by category (plans, permits...).
 * Images open large (tap, then Close); links open in a new tab. PDFs are never listed (they cannot be shown here yet).
 * Renders NOTHING when there is nothing to show, so a portal without shared files looks exactly like before.
 * Also exports ImageLightbox (used by the question attachments).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../commsKit.tsx';
import { ExternalLinkIcon } from '../Icons.tsx';
import { isImageFile, portalFileSections } from '../../lib/portal/questionView.ts';
import { linkHost } from '../../lib/jobFiles/jobFileView.ts';
import type { PortalJobFile } from '../../lib/portal/questionsApi.ts';

/** Full-screen picture with a Close button (Escape closes it too). */
export const ImageLightbox: React.FC<{ src: string; title: string; onClose: () => void }> = ({ src, title, onClose }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950 text-white" role="dialog" aria-modal="true" aria-label={title}>
            <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <button type="button" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10" onClick={onClose}>Close</button>
                <span className="min-w-0 truncate text-sm text-white/70">{title}</span>
                <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-ghost min-h-[44px] text-white hover:bg-white/10">Open</a>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-2" onClick={onClose}>
                <img src={src} alt={title} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            </div>
        </div>,
        document.body,
    );
};

const PortalFiles: React.FC<{ files: PortalJobFile[]; jobId: string | null; className?: string }> = ({ files, jobId, className }) => {
    const [open, setOpen] = useState<PortalJobFile | null>(null);
    const sections = useMemo(() => portalFileSections(files, jobId), [files, jobId]);
    if (sections.length === 0) return null;
    return (
        <section aria-labelledby="portal-files-heading" className={cx(className)} data-testid="portal-files">
            <h2 id="portal-files-heading" className="text-lg font-bold">Files</h2>
            <div className="mt-3 space-y-5">
                {sections.map(s => {
                    const images = s.files.filter(isImageFile);
                    const links = s.files.filter(f => !isImageFile(f));
                    return (
                        <div key={s.category}>
                            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</h3>
                            {images.length > 0 && (
                                <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                    {images.map(f => (
                                        <li key={f.id}>
                                            <button type="button" onClick={() => setOpen(f)} className="group block w-full text-left" aria-label={`View ${f.title}`}>
                                                <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
                                                    <img src={f.href!} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
                                                </span>
                                                <span className="mt-1 block truncate text-xs font-medium">{f.title}{f.version > 1 ? <span className="text-muted-foreground"> · v{f.version}</span> : null}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {links.length > 0 && (
                                <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card">
                                    {links.map(f => (
                                        <li key={f.id}>
                                            <a href={f.href!} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 transition hover:bg-muted/60">
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold">{f.title}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">{linkHost(f.href)}</span>
                                                </span>
                                                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">Open <ExternalLinkIcon className="h-4 w-4" /></span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
            {open && open.href && <ImageLightbox src={open.href} title={open.title} onClose={() => setOpen(null)} />}
        </section>
    );
};

export default PortalFiles;
