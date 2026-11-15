/**
 * A mood board as a gallery: pictures laid out like a pinned board (their own shapes, nothing cropped), colours as one
 * strip of paint chips, links as rows and notes as quotes. Tap a picture to see it large. Used for BOTH the owner's
 * "Client preview" and the client portal's "Ideas board", so what the owner previews is exactly what the client sees.
 * It only draws what it is given (lib/boards/boardView.ts GalleryItem): titles and captions, never the owner's board notes.
 */
import React, { useMemo, useState } from 'react';
import { galleryColumns, readableOn, type GalleryItem } from '../../lib/boards/boardView.ts';
import { linkHost } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { ExternalLinkIcon } from '../Icons.tsx';
import { ImageLightbox } from '../portal/PortalFiles.tsx';

const Caption: React.FC<{ item: GalleryItem; className?: string }> = ({ item, className }) => (
    item.title || item.caption ? (
        <figcaption className={cx('mt-1 px-0.5 text-xs leading-snug', className)}>
            {item.title && <span className="block font-semibold text-foreground">{item.title}</span>}
            {item.caption && <span className="block whitespace-pre-wrap text-muted-foreground">{item.caption}</span>}
        </figcaption>
    ) : null
);

const BoardGallery: React.FC<{ items: readonly GalleryItem[]; className?: string; emptyText?: string }> = ({ items, className, emptyText }) => {
    const [open, setOpen] = useState<GalleryItem | null>(null);
    // a picture that cannot be loaded (a pasted link that went away) is left out instead of showing a broken box
    const [broken, setBroken] = useState<Record<string, true>>({});
    const parts = useMemo(() => galleryColumns(items.filter(i => !broken[i.id])), [items, broken]);
    if (items.length === 0) {
        return emptyText ? <p className={cx('rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground', className)}>{emptyText}</p> : null;
    }
    return (
        <div className={cx('space-y-5', className)} data-testid="board-gallery">
            {parts.images.length > 0 && (
                <ul className="columns-2 gap-2.5 sm:columns-3 lg:columns-4 [&>li]:mb-2.5" aria-label="Pictures">
                    {parts.images.map(i => (
                        <li key={i.id} className="break-inside-avoid">
                            <figure>
                                <button type="button" onClick={() => setOpen(i)} className="group block w-full overflow-hidden rounded-lg bg-muted ring-1 ring-border" aria-label={`View ${i.title || i.caption || 'picture'} large`}>
                                    <img src={i.imageUrl!} alt={i.title || i.caption || ''} loading="lazy" className="block h-auto w-full transition group-hover:scale-[1.02]" onError={() => setBroken(b => ({ ...b, [i.id]: true }))} />
                                </button>
                                <Caption item={i} />
                            </figure>
                        </li>
                    ))}
                </ul>
            )}

            {parts.swatches.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Colours">
                    {parts.swatches.map(c => (
                        <li key={c.id} className="w-[88px] shrink-0">
                            <span className="flex h-[88px] items-end rounded-lg p-1.5 ring-1 ring-border" style={{ backgroundColor: c.color!, color: readableOn(c.color!) }}>
                                <span className="text-[11px] font-bold uppercase tracking-wide">{c.color}</span>
                            </span>
                            {(c.title || c.caption) && (
                                <span className="mt-1 block px-0.5 text-xs leading-snug">
                                    {c.title && <span className="block font-semibold">{c.title}</span>}
                                    {c.caption && <span className="block text-muted-foreground">{c.caption}</span>}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {parts.links.length > 0 && (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card" aria-label="Links">
                    {parts.links.map(l => (
                        <li key={l.id}>
                            <a href={l.url!} target="_blank" rel="noopener noreferrer" className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 transition hover:bg-muted/60">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold">{l.title || linkHost(l.url)}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{l.caption || linkHost(l.url)}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">Open <ExternalLinkIcon className="h-4 w-4" /></span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}

            {parts.notes.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2" aria-label="Notes">
                    {parts.notes.map(n => (
                        <li key={n.id} className="border-l-[3px] border-primary/50 pl-3">
                            {n.title && <p className="text-sm font-semibold">{n.title}</p>}
                            {n.caption && <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{n.caption}</p>}
                        </li>
                    ))}
                </ul>
            )}

            {open && open.imageUrl && <ImageLightbox src={open.imageUrl} title={open.title || open.caption || 'Picture'} onClose={() => setOpen(null)} />}
        </div>
    );
};

export default BoardGallery;
