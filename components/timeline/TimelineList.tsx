/**
 * Job timeline: the rail. One section per day with a sticky day header; each entry has its time in the left gutter, a
 * small mark on the rail and its sentence. An entry with more to tell (a note, a day's hours and materials, photos, the
 * document itself) opens in place. Nothing here talks to the network: the panel hands in the events and the signed
 * photo addresses.
 */
import React from 'react';
import { dayLabel, shortDate, stamp, timeLabel } from '../../lib/timeline/timelineFormat.ts';
import { moneyText } from '../../lib/timeline/timelineHelpers.ts';
import type { TimelineDay, TimelineEvent, TimelineLink } from '../../lib/timeline/timelineTypes.ts';
import { ChevronDownIcon } from '../Icons.tsx';
import { ACTOR_WORD, GroupMark } from './timelineUi.tsx';

const LINK_WORD: Record<string, string> = {
    photos: 'Open photos', tasks: 'Open tasks', files: 'Open files', questions: 'Open questions', selections: 'Open selections', subs: 'Open subcontractors', punch: 'Open punch list', crew: 'Open crew',
};

const openWord = (link: TimelineLink): string => (link.type === 'tab' ? LINK_WORD[link.tab] || 'Open' : `Open ${link.formType.toLowerCase()}`);

const Thumbs: React.FC<{ event: TimelineEvent; urls: Readonly<Record<string, string>>; big: boolean; onOpen: (l: TimelineLink) => void }> = ({ event, urls, big, onOpen }) => {
    const photos = (event.photos || []).slice(0, big ? 6 : 4);
    if (!photos.length) return null;
    const more = (event.photoCount || photos.length) - photos.length;
    const size = big ? 'h-[72px] w-[72px]' : 'h-10 w-10';
    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            {photos.map(p => (
                <button key={p.id} type="button" onClick={() => onOpen({ type: 'tab', tab: 'photos' })} className={`${size} shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border transition hover:ring-primary`} aria-label={p.caption ? `Photo: ${p.caption}` : 'Open photos'}>
                    {urls[p.thumbPath] ? <img src={urls[p.thumbPath]} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
                </button>
            ))}
            {more > 0 && (
                <button type="button" onClick={() => onOpen({ type: 'tab', tab: 'photos' })} className={`${size} shrink-0 rounded-md bg-muted text-xs font-semibold text-muted-foreground ring-1 ring-border transition hover:text-foreground`}>
                    +{more}
                </button>
            )}
        </div>
    );
};

const Entry: React.FC<{
    event: TimelineEvent; tz: string; first: boolean; last: boolean; open: boolean;
    onToggle: (id: string) => void; urls: Readonly<Record<string, string>>; onOpen: (l: TimelineLink) => void;
}> = ({ event: e, tz, first, last, open, onToggle, urls, onOpen }) => {
    // an entry opens in place when it has more to tell; one that only points at a document / tab gets a plain "Open" link
    const expandable = Boolean(e.body || e.rows?.length || (e.photos && e.photos.length));
    const actor = e.actor ? ACTOR_WORD[e.actor] : undefined;
    const meta = [actor, e.pending ? 'Waiting to sync' : ''].filter(Boolean);
    const line = first && last ? 'hidden' : first ? 'top-3 bottom-0' : last ? 'top-0 h-3.5' : 'top-0 bottom-0';
    const head = (
        <>
            <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{e.title}</span>
                {e.amount !== undefined && <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{moneyText(e.amount, e.currency)}</span>}
            </span>
            {(meta.length > 0 || e.detail) && (
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                    {meta.length > 0 && <span className={`font-semibold ${e.pending ? 'text-warning' : ''}`}>{meta.join(' · ')}</span>}
                    {meta.length > 0 && e.detail ? ' · ' : ''}
                    {e.detail}
                </span>
            )}
        </>
    );
    return (
        <li className="relative grid grid-cols-[3.4rem_1.25rem_minmax(0,1fr)] gap-x-2">
            <time dateTime={e.at} title={stamp(e.at, tz)} className="pt-1 text-right text-[11px] font-medium tabular-nums leading-5 text-muted-foreground">
                {e.dayOnly ? '' : timeLabel(e.at, tz)}
            </time>
            <div className="relative flex justify-center" aria-hidden="true">
                <span className={`absolute left-1/2 w-px -translate-x-1/2 bg-border ${line}`} />
                <span className="relative mt-[7px] flex h-3 w-3 items-center justify-center rounded-full bg-background"><GroupMark group={e.group} /></span>
            </div>
            <div className="min-w-0 pb-4">
                {expandable ? (
                    <button type="button" onClick={() => onToggle(e.id)} aria-expanded={open} className="group -mx-1.5 -mt-0.5 block w-[calc(100%+0.75rem)] rounded-lg px-1.5 py-0.5 text-left transition hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        {head}
                        <span className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary">
                            {open ? 'Less' : e.photos?.length ? `${e.photoCount || e.photos.length} photos` : 'Details'}
                            <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </span>
                    </button>
                ) : (
                    <div>
                        {head}
                        {e.link && <button type="button" onClick={() => onOpen(e.link as TimelineLink)} className="mt-0.5 text-[11px] font-semibold text-primary underline-offset-2 hover:underline">{openWord(e.link)}</button>}
                    </div>
                )}
                {e.photos && e.photos.length > 0 && <Thumbs event={e} urls={urls} big={open} onOpen={onOpen} />}
                {open && (
                    <div className="mt-2 space-y-2 text-sm">
                        {e.body && <p className="whitespace-pre-line border-l-2 border-border pl-3 text-foreground/90 [overflow-wrap:anywhere]">{e.body}</p>}
                        {e.rows && e.rows.length > 0 && (
                            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                                {e.rows.map((r, i) => (
                                    <React.Fragment key={`${r.label}-${i}`}>
                                        <dt className="text-muted-foreground">{r.label}</dt>
                                        <dd className="font-medium text-foreground [overflow-wrap:anywhere]">{r.value}</dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        )}
                        {e.link && <button type="button" className="btn btn-sm btn-outline" onClick={() => onOpen(e.link as TimelineLink)}>{openWord(e.link)}</button>}
                    </div>
                )}
            </div>
        </li>
    );
};

export interface TimelineListProps {
    days: readonly TimelineDay[];
    tz: string;
    /** local today (YYYY-MM-DD) for "Today" / "Yesterday" */
    today: string;
    expanded: ReadonlySet<string>;
    onToggle: (id: string) => void;
    urls: Readonly<Record<string, string>>;
    onOpen: (link: TimelineLink) => void;
}

const TimelineList: React.FC<TimelineListProps> = ({ days, tz, today, expanded, onToggle, urls, onOpen }) => (
    <div>
        {days.map(({ day, events }) => {
            const label = dayLabel(day, today);
            const full = shortDate(day, Number(today.slice(0, 4)) || undefined);
            return (
                <section key={day} aria-label={full}>
                    <h3 className="sticky top-14 z-10 -mx-4 flex items-baseline gap-2 bg-background/95 px-4 py-1.5 text-xs backdrop-blur sm:mx-0 sm:px-0 md:top-16">
                        <span className="font-bold uppercase tracking-wide text-foreground">{label}</span>
                        {label !== full && <span className="text-muted-foreground">{full}</span>}
                        <span className="ml-auto tabular-nums text-muted-foreground">{events.length}</span>
                    </h3>
                    <ol className="mb-1 mt-1.5">
                        {events.map((e, i) => (
                            <Entry key={e.id} event={e} tz={tz} first={i === 0} last={i === events.length - 1} open={expanded.has(e.id)} onToggle={onToggle} urls={urls} onOpen={onOpen} />
                        ))}
                    </ol>
                </section>
            );
        })}
    </div>
);

export default TimelineList;
