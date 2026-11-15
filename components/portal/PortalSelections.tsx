/**
 * Client portal › Project › "Your selections": what the contractor asks the client to choose (tile, paint, fixtures...).
 * Each waiting selection shows the job, the date to choose by, the message, the allowance and the options as a picture picker:
 * photo, name, description, product link, the total and what it adds or saves against the allowance ("+$120 upgrade",
 * "-$40 credit", "Included"). The client picks ONE, may add a comment, types their name and taps "Send my choice".
 * After sending, the card shows the choice and where it stands (waiting for the contractor, approved, ordered). Chosen,
 * approved and ordered items fold under "Decided". Renders NOTHING while there is nothing to show.
 * Rules and words: lib/portal/selectionView.ts. Data: lib/portal/selectionsApi.ts (the choice is a public write).
 */
import React, { useMemo, useState } from 'react';
import {
    choosePortalSelection, type PortalChooseResult, type PortalSelection, type PortalSelectionOption,
} from '../../lib/portal/selectionsApi.ts';
import {
    PORTAL_COMMENT_MAX, PORTAL_NAME_MAX, allowanceLine, chosenPortalOption, optionQtyLine, portalDecisionNote, portalDifference, portalMoney,
    portalSelectionDue, portalSelectionHistory, portalSelectionStatus, splitPortalSelections, validatePortalChoice,
} from '../../lib/portal/selectionView.ts';
import { linkHost, shortDate } from '../../lib/jobFiles/jobFileView.ts';
import { cx } from '../commsKit.tsx';
import { CheckIcon, ChevronDownIcon, ExternalLinkIcon } from '../Icons.tsx';
import { ImageLightbox } from './PortalFiles.tsx';

export interface PortalSelectionsProps {
    portalKey: string;
    selections: PortalSelection[];
    company: string;
    /** the list changed (a choice was sent) */
    onChosen: (s: PortalSelection) => void;
    /** it was already chosen (the contractor has to ask again): read the list again */
    onStale: () => void;
    className?: string;
}

const Diff: React.FC<{ difference: number | null; className?: string }> = ({ difference, className }) => {
    const d = portalDifference(difference);
    if (!d.text) return null;
    return (
        <span className={cx('text-xs font-bold', d.tone === 'down' ? 'text-success' : d.tone === 'same' ? 'text-muted-foreground' : 'text-foreground', className)}>{d.text}</span>
    );
};

// ====================================================================================================== one option
const OptionCard: React.FC<{
    option: PortalSelectionOption;
    selected: boolean;
    disabled: boolean;
    onPick: () => void;
    onZoom: (o: PortalSelectionOption) => void;
}> = ({ option: o, selected, disabled, onPick, onZoom }) => {
    const qty = optionQtyLine(o);
    return (
        <div
            role="radio"
            aria-checked={selected}
            aria-label={`${o.name}, ${portalMoney(o.total)}`}
            tabIndex={disabled ? -1 : 0}
            onClick={() => { if (!disabled) onPick(); }}
            onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onPick(); } }}
            className={cx(
                'relative flex cursor-pointer gap-3 overflow-hidden rounded-xl border-2 bg-card p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-col sm:gap-0 sm:p-0',
                selected ? 'border-primary shadow-soft' : 'border-border hover:border-primary/40',
                disabled && 'cursor-default opacity-70',
            )}
        >
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted sm:aspect-[4/3] sm:h-auto sm:w-full sm:rounded-none">
                {o.imageUrl ? (
                    <>
                        <img src={o.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <button type="button" onClick={e => { e.stopPropagation(); onZoom(o); }} onKeyDown={e => e.stopPropagation()}
                            className="absolute bottom-1 right-1 min-h-[28px] rounded-full bg-background/90 px-2 text-[10px] font-bold text-foreground shadow ring-1 ring-border" aria-label={`View a larger photo of ${o.name}`}>
                            Zoom
                        </button>
                    </>
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">No photo</span>
                )}
            </div>
            <div className="min-w-0 flex-1 sm:p-3">
                <p className="pr-7 text-sm font-bold leading-snug">{o.name}</p>
                {o.description && <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{o.description}</p>}
                <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
                    <span className="text-base font-bold">{portalMoney(o.total)}</span>
                    <Diff difference={o.difference} />
                </p>
                {qty && <p className="text-[11px] tabular-nums text-muted-foreground">{qty}</p>}
                {o.url && (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-semibold text-primary">
                        {linkHost(o.url)} <ExternalLinkIcon className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
            {/* the tick: filled when this is the one */}
            <span aria-hidden className={cx('absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 sm:right-2.5 sm:top-2.5', selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/90')}>
                {selected && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
        </div>
    );
};

// ====================================================================================================== the client's choice (after sending / when folded)
const ChoiceSummary: React.FC<{ s: PortalSelection; company: string }> = ({ s, company }) => {
    const o = chosenPortalOption(s);
    const st = portalSelectionStatus(s);
    const [big, setBig] = useState<PortalSelectionOption | null>(null);
    return (
        <div className={cx('rounded-xl border px-3.5 py-3', st.tone === 'done' ? 'border-success/40 bg-success/5' : st.tone === 'warn' ? 'border-warning/40 bg-warning/5' : 'border-primary/30 bg-primary/5')}>
            <p className="text-sm font-bold">
                {st.label}
                {s.chosenBy ? <span className="font-normal text-muted-foreground"> · chosen by {s.chosenBy}</span> : null}
                {s.chosenAt ? <span className="font-normal text-muted-foreground"> · {shortDate(s.chosenAt)}</span> : null}
            </p>
            {o && (
                <div className="mt-2 flex items-center gap-3">
                    {o.imageUrl && (
                        <button type="button" onClick={() => setBig(o)} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border" aria-label={`View a larger photo of ${o.name}`}>
                            <img src={o.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug">{o.name}</p>
                        <p className="flex flex-wrap items-baseline gap-x-2 tabular-nums"><span className="text-sm font-bold">{portalMoney(o.total)}</span><Diff difference={o.difference} /></p>
                    </div>
                </div>
            )}
            {s.clientComment && <p className="mt-2 whitespace-pre-wrap text-sm italic leading-relaxed">“{s.clientComment}”</p>}
            {portalDecisionNote(s, company) && <p className="mt-2 text-xs text-muted-foreground">{portalDecisionNote(s, company)}</p>}
            {big?.imageUrl && <ImageLightbox src={big.imageUrl} title={big.name} onClose={() => setBig(null)} />}
        </div>
    );
};

const History: React.FC<{ s: PortalSelection; company: string }> = ({ s, company }) => {
    const rows = portalSelectionHistory(s, company);
    if (rows.length === 0) return null;
    return (
        <ol className="mt-3 space-y-1.5 border-t border-border/70 pt-3 text-xs text-muted-foreground" aria-label="History">
            {rows.map(r => (
                <li key={r.key}>
                    <span className="font-semibold text-foreground">{r.label}</span> · {r.when}
                    {r.note ? <span className="block whitespace-pre-wrap">“{r.note}”</span> : null}
                </li>
            ))}
        </ol>
    );
};

// ====================================================================================================== one waiting selection
type Say = { tone: 'danger' | 'info'; text: string } | null;

const SelectionCard: React.FC<{
    s: PortalSelection;
    portalKey: string;
    company: string;
    thanks: boolean;
    onChosen: (s: PortalSelection) => void;
    onStale: (id: string) => void;
}> = ({ s, portalKey, company, thanks, onChosen, onStale }) => {
    const [optionId, setOptionId] = useState<string | null>(null);
    const [comment, setComment] = useState('');
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [say, setSay] = useState<Say>(null);
    const [big, setBig] = useState<PortalSelectionOption | null>(null);
    const due = portalSelectionDue(s);
    const waiting = s.status === 'sent';
    const ids = `ps-${s.id}`;
    const allowance = allowanceLine(s.allowance);
    const meta = [s.room, s.category && s.category !== s.room ? s.category : null].filter(Boolean).join(' · ');

    const send = async () => {
        if (busy) return;
        const input = { optionId, comment, name };
        const problem = validatePortalChoice(s, input);
        if (problem) { setSay({ tone: 'danger', text: problem }); return; }
        setSay(null);
        setBusy(true);
        let res: PortalChooseResult;
        try {
            res = await choosePortalSelection(portalKey, s.id, { optionId: optionId!, comment: comment.trim() || null, name: name.trim() });
        } catch {
            res = { status: 'error', message: 'Your choice could not be sent. Please check your connection and try again.' };
        }
        setBusy(false);
        if (res.status === 'ready') onChosen(res.data);
        else if (res.status === 'already') { setSay({ tone: 'info', text: 'A choice was already made here, so we updated the page. Your choice was not sent.' }); onStale(s.id); }
        else if (res.status === 'invalid') setSay({ tone: 'danger', text: `This link no longer works. Please ask ${company} for a new one.` });
        else if (res.status === 'missing') setSay({ tone: 'danger', text: 'Choosing is not available right now. Please try again later.' });
        else setSay({ tone: 'danger', text: res.message });
    };

    return (
        <article className={cx('card overflow-hidden border-l-4 p-4 sm:p-5', waiting ? (due.tone === 'late' ? 'border-l-destructive' : 'border-l-warning') : 'border-l-success')} aria-labelledby={`${ids}-title`}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">{s.jobName || 'Your project'}</span>
                <span className="text-muted-foreground">{waiting ? 'Please choose one' : 'Your choice'}</span>
                {waiting && due.text && <span className={cx('font-semibold', due.tone === 'late' ? 'text-destructive' : 'text-foreground')}>{due.text}</span>}
            </p>
            <h3 id={`${ids}-title`} className="mt-1 text-lg font-bold leading-snug">{s.title}</h3>
            {(meta || allowance) && (
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                    {meta && <span>{meta}</span>}
                    {allowance && <span className="font-semibold text-foreground tabular-nums">{allowance}</span>}
                </p>
            )}
            {s.body && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{s.body}</p>}

            {waiting ? (
                <form className="mt-4 space-y-3 border-t border-border/70 pt-4" onSubmit={e => { e.preventDefault(); void send(); }}>
                    <div role="radiogroup" aria-label={`Options for ${s.title}`} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                        {s.options.map(o => (
                            <OptionCard key={o.id} option={o} selected={optionId === o.id} disabled={busy} onPick={() => { setOptionId(o.id); setSay(null); }} onZoom={setBig} />
                        ))}
                    </div>
                    {s.allowance !== null && <p className="text-xs text-muted-foreground">An upgrade is what you pay on top of your allowance. A credit is what you get back.</p>}
                    <div>
                        <label htmlFor={`${ids}-comment`} className="label">A comment for {company} (optional)</label>
                        <textarea id={`${ids}-comment`} className="input min-h-[72px]" rows={2} value={comment} onChange={e => setComment(e.target.value)} maxLength={PORTAL_COMMENT_MAX} disabled={busy} />
                    </div>
                    <div>
                        <label htmlFor={`${ids}-name`} className="label">Your name</label>
                        <input id={`${ids}-name`} className="input" value={name} onChange={e => setName(e.target.value)} maxLength={PORTAL_NAME_MAX} autoComplete="off" disabled={busy} placeholder="Type your full name" />
                        <p className="mt-1 text-xs text-muted-foreground">Typing your name confirms your choice.</p>
                    </div>
                    {say && <p className={cx('text-sm font-medium', say.tone === 'danger' ? 'text-destructive' : 'text-muted-foreground')} role={say.tone === 'danger' ? 'alert' : 'status'}>{say.text}</p>}
                    <button type="submit" className="btn btn-primary min-h-[48px] w-full sm:w-auto" disabled={busy}>
                        {busy ? 'Sending…' : 'Send my choice'}
                    </button>
                </form>
            ) : (
                <div className="mt-4 space-y-2">
                    {thanks && <p className="text-sm font-semibold text-success" role="status">Thank you. {company} has your choice.</p>}
                    {say && <p className="text-sm text-muted-foreground" role="status">{say.text}</p>}
                    <ChoiceSummary s={s} company={company} />
                    <History s={s} company={company} />
                </div>
            )}
            {big?.imageUrl && <ImageLightbox src={big.imageUrl} title={big.name} onClose={() => setBig(null)} />}
        </article>
    );
};

// ====================================================================================================== one decided item (folded)
const DecidedRow: React.FC<{ s: PortalSelection; company: string }> = ({ s, company }) => {
    const [open, setOpen] = useState(false);
    const st = portalSelectionStatus(s);
    const o = chosenPortalOption(s);
    return (
        <li className="border-b border-border/70 last:border-0">
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left">
                <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{s.title}</span>
                    <span className={cx('block truncate text-xs', st.tone === 'done' ? 'text-success' : st.tone === 'warn' ? 'text-warning' : 'text-muted-foreground')}>
                        {st.label}{o ? ` · ${o.name}` : ''}{s.jobName ? ` · ${s.jobName}` : ''}
                    </span>
                </span>
                <ChevronDownIcon className={cx('h-4 w-4 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
            </button>
            {open && (
                <div className="space-y-2 px-3.5 pb-3.5">
                    {s.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{s.body}</p>}
                    <ChoiceSummary s={s} company={company} />
                    <History s={s} company={company} />
                </div>
            )}
        </li>
    );
};

// ====================================================================================================== the section
const PortalSelections: React.FC<PortalSelectionsProps> = ({ portalKey, selections, company, onChosen, onStale, className }) => {
    // items chosen in this visit ('thanks'), or found already chosen ('stale'), stay up top until the page is opened again
    const [kept, setKept] = useState<Record<string, 'thanks' | 'stale'>>({});
    const [showDecided, setShowDecided] = useState(false);
    const { waiting, decided } = useMemo(() => splitPortalSelections(selections), [selections]);
    const top = useMemo(() => selections.filter(s => s.status === 'sent' || kept[s.id]).sort((a, b) => Number(b.status === 'sent') - Number(a.status === 'sent')), [selections, kept]);
    const older = decided.filter(s => !kept[s.id]);
    const recent = Object.keys(kept);
    if (top.length === 0 && older.length === 0) return null;
    return (
        <section aria-labelledby="portal-selections-heading" className={cx('max-w-3xl space-y-3', className)} data-testid="portal-selections">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="portal-selections-heading" className="text-lg font-bold">
                    Your selections
                    {waiting.length > 0 && <span className="ml-2 badge badge-warning align-middle">{waiting.length} to choose</span>}
                </h2>
            </div>
            {waiting.length === 0 && recent.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing is waiting for you to choose right now.</p>
            )}
            {top.map(s => (
                <SelectionCard
                    key={s.id}
                    s={s}
                    portalKey={portalKey}
                    company={company}
                    thanks={kept[s.id] === 'thanks'}
                    onChosen={(next) => { setKept(k => ({ ...k, [next.id]: 'thanks' })); onChosen(next); }}
                    onStale={(id) => { setKept(k => ({ ...k, [id]: 'stale' })); onStale(); }}
                />
            ))}
            {older.length > 0 && (
                <div>
                    <button type="button" onClick={() => setShowDecided(v => !v)} aria-expanded={showDecided} className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 text-left text-sm font-semibold">
                        <span>Decided <span className="font-normal text-muted-foreground">({older.length})</span></span>
                        <ChevronDownIcon className={cx('h-4 w-4 text-muted-foreground transition', showDecided && 'rotate-180')} />
                    </button>
                    {showDecided && <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-card">{older.map(s => <DecidedRow key={s.id} s={s} company={company} />)}</ul>}
                </div>
            )}
        </section>
    );
};

export default PortalSelections;
