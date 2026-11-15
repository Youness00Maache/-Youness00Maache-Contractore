/**
 * The richer public profile under the request form on /r/<slug> (roadmap D8): About, what we do (chips), where we work /
 * license / years, the photo gallery (tap to enlarge) and "What clients say" with the average stars and the approved
 * testimonials (first name + initial, stars, quote, month and year). Nothing is drawn for an empty field, and an empty
 * profile draws nothing at all (the page stays exactly as it was).
 * The same component is the live preview in Settings (components/profile/PublicProfileEditor.tsx), so what the owner sees
 * is what the client sees. Plain typography, no cards; theme tokens only (light and dark); no third-party scripts.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { PublicProfileExtras } from '../../lib/profile/profileTypes.ts';
import { lightboxStep, monthYear, profileSections, ratingLine } from '../../lib/profile/profileUi.ts';
import { averageRating } from '../../lib/feedback/feedbackLogic.ts';
import { StarsDisplay } from '../feedback/Stars.tsx';

const SHOWN_AT_FIRST = 4;

const Heading: React.FC<{ children: React.ReactNode; id?: string }> = ({ children, id }) => (
    <h2 id={id} className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
);

const Lightbox: React.FC<{ items: PublicProfileExtras['gallery']; index: number; company: string; onIndex: (i: number) => void; onClose: () => void }> = ({ items, index, company, onIndex, onClose }) => {
    const closeRef = useRef<HTMLButtonElement>(null);
    const touchX = useRef<number | null>(null);
    const item = items[index];
    const step = (key: string) => { const next = lightboxStep(index, items.length, key); if (next !== null) onIndex(next); };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            const next = lightboxStep(index, items.length, e.key);
            if (next !== null) { e.preventDefault(); onIndex(next); }
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [index, items.length, onClose, onIndex]);

    if (!item) return null;
    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col bg-black/95 text-white"
            role="dialog" aria-modal="true" aria-label={`${company} photos`}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
            onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                const end = e.changedTouches[0]?.clientX;
                if (start === null || end === undefined || Math.abs(end - start) < 50) return;
                step(end < start ? 'ArrowRight' : 'ArrowLeft');
            }}
        >
            <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p className="text-sm tabular-nums text-white/70">{index + 1} / {items.length}</p>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none hover:bg-white/10">×</button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <img src={item.url} alt={item.caption || `${company}, photo ${index + 1}`} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                {items.length > 1 && (
                    <>
                        <button type="button" onClick={() => step('ArrowLeft')} aria-label="Previous photo" className="absolute left-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-2xl hover:bg-black/60">‹</button>
                        <button type="button" onClick={() => step('ArrowRight')} aria-label="Next photo" className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-2xl hover:bg-black/60">›</button>
                    </>
                )}
            </div>
            <p className="min-h-[3.5rem] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-sm leading-snug text-white/85">{item.caption || ''}</p>
        </div>
    );
};

const PublicProfileView: React.FC<{ extras: PublicProfileExtras; company: string; className?: string }> = ({ extras, company, className = '' }) => {
    const sections = profileSections(extras);
    const [open, setOpen] = useState<number | null>(null);
    const [all, setAll] = useState(false);
    const opener = useRef<HTMLButtonElement | null>(null);
    if (!sections.any) return null;

    const facts: Array<[string, string]> = [];
    if (extras.serviceArea) facts.push(['Where we work', extras.serviceArea]);
    if (extras.licenseLine) facts.push(['License', extras.licenseLine]);
    if (extras.yearsLine) facts.push(['Experience', extras.yearsLine]);

    const average = extras.ratingAverage ?? averageRating(extras.testimonials.map(t => t.rating));
    const count = extras.ratingCount || extras.testimonials.length;
    const quotes = all ? extras.testimonials : extras.testimonials.slice(0, SHOWN_AT_FIRST);

    return (
        <section className={`space-y-10 border-t border-border pt-10 ${className}`} aria-label={`About ${company}`} data-testid="public-profile">
            {sections.about && (
                <div>
                    <Heading>About {company}</Heading>
                    <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-foreground/90">{extras.about}</p>
                </div>
            )}

            {sections.services && (
                <div>
                    <Heading>What we do</Heading>
                    <ul className="mt-3 flex flex-wrap gap-2">
                        {extras.services.map(s => <li key={s} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground">{s}</li>)}
                    </ul>
                </div>
            )}

            {sections.facts && (
                <dl className="divide-y divide-border border-y border-border text-sm">
                    {facts.map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
                            <dt className="shrink-0 font-semibold text-muted-foreground sm:w-36">{k}</dt>
                            <dd className="min-w-0 break-words text-foreground">{v}</dd>
                        </div>
                    ))}
                </dl>
            )}

            {sections.gallery && (
                <div>
                    <Heading>Our work</Heading>
                    <ul className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
                        {extras.gallery.map((g, i) => (
                            <li key={g.path} className="min-w-0">
                                <button
                                    type="button"
                                    className="group block w-full overflow-hidden rounded-xl bg-muted"
                                    aria-label={g.caption ? `Enlarge photo: ${g.caption}` : `Enlarge photo ${i + 1}`}
                                    onClick={(e) => { opener.current = e.currentTarget; setOpen(i); }}
                                >
                                    <img src={g.url} alt={g.caption || `${company}, photo ${i + 1}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
                                        className="aspect-[4/3] w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
                                </button>
                                {g.caption && <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground">{g.caption}</p>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {sections.reviews && (
                <div>
                    <Heading>What clients say</Heading>
                    {average !== null && count > 0 && (
                        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StarsDisplay value={average} size={22} />
                            <span className="text-sm font-semibold tabular-nums text-foreground">{ratingLine(average, count)}</span>
                        </p>
                    )}
                    <ul className="mt-5 space-y-6">
                        {quotes.map((t, i) => (
                            <li key={`${t.date}-${t.name}-${i}`}>
                                <figure className="border-l-2 border-primary/40 pl-4">
                                    <StarsDisplay value={t.rating} size={14} />
                                    {t.text && <blockquote className="mt-1.5 whitespace-pre-line break-words text-base leading-relaxed text-foreground">“{t.text}”</blockquote>}
                                    <figcaption className="mt-1.5 text-sm text-muted-foreground">
                                        <span className="font-semibold text-foreground/80">{t.name}</span>{monthYear(t.date) ? ` · ${monthYear(t.date)}` : ''}
                                    </figcaption>
                                </figure>
                            </li>
                        ))}
                    </ul>
                    {extras.testimonials.length > SHOWN_AT_FIRST && (
                        <button type="button" className="btn btn-ghost mt-3 min-h-[44px] px-0 text-primary" onClick={() => setAll(v => !v)}>
                            {all ? 'Show fewer' : `Show all ${extras.testimonials.length}`}
                        </button>
                    )}
                </div>
            )}

            {open !== null && (
                <Lightbox
                    items={extras.gallery} index={open} company={company} onIndex={setOpen}
                    onClose={() => { setOpen(null); window.setTimeout(() => opener.current?.focus(), 0); }}
                />
            )}
        </section>
    );
};

export default PublicProfileView;
