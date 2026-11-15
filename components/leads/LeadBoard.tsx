/**
 * The Leads board and the plain list (components/leads/LeadsView.tsx).
 *  - Board: one column per stage (New, Contacted, Appointment set, Quote sent, Won, Lost) with the lead count and the
 *    budget total on top. Computers show the columns side by side; phones show one column at a time with stage tabs.
 *  - Cards carry a coloured left edge when the follow-up is due (red late, amber today), so "who do I call" reads at a glance.
 *  - List: every lead in one list (the screen's sort), same card facts in a row.
 * Nothing here writes: tapping a card opens the lead (the screen owns the window).
 */
import React from 'react';
import { LEAD_STAGES, type Appointment, type Lead, type LeadStage } from '../../lib/leads/leadTypes.ts';
import { LEAD_STAGE_INFO, formatBudget, isOpenStage, leadPipelineSummary, needsFollowUp, originLabel } from '../../lib/leads/leadLogic.ts';
import { APPOINTMENT_KIND_LABELS } from '../../lib/leads/appointmentLogic.ts';
import { appointmentWhenLabel, followUpText, shortAge, sortBoardColumn } from '../../lib/leads/leadViewLogic.ts';
import { requestSnippet } from '../requests/requestLogic.ts';
import { compactMoney } from '../viewKit.tsx';
import { PlusIcon } from '../Icons.tsx';
import { FollowUpPill, LEAD_STAGE_STYLE, cx } from './leadUi.tsx';

const EMPTY_TEXT: Record<LeadStage, string> = {
    new: 'New requests from your link, and leads you add, land here.',
    contacted: 'Leads you have spoken to or written to.',
    appointment_set: 'A site visit or call is booked.',
    quote_sent: 'Waiting for their answer.',
    won: 'Leads that became a job.',
    lost: 'Leads that did not go ahead.',
};

const TOTAL_LABEL: Record<LeadStage, string> = { new: 'budget', contacted: 'budget', appointment_set: 'budget', quote_sent: 'quoted', won: 'won', lost: 'lost' };

/** First visible chunk of the Won / Lost columns (they only grow). */
const CLOSED_LIMIT = 8;

export interface LeadFacts {
    today: string;
    now: number;
    /** next scheduled appointment per lead id */
    nextAppointments: ReadonlyMap<string, Appointment>;
    /** leads that went quiet (Premium); empty for Free */
    quietIds: ReadonlySet<string>;
    locale?: string;
}

const LeadCard: React.FC<{ lead: Lead; facts: LeadFacts; onOpen: (id: string) => void; row?: boolean }> = ({ lead, facts, onOpen, row }) => {
    const follow = followUpText(lead, facts.today, facts.locale);
    const due = needsFollowUp(lead, facts.today);
    const appt = facts.nextAppointments.get(lead.id);
    const budget = formatBudget(lead);
    const quiet = facts.quietIds.has(lead.id);
    const open = isOpenStage(lead.stage);
    const edge = !due ? 'border-l-border' : follow.tone === 'overdue' ? 'border-l-destructive' : 'border-l-warning';
    const snippet = requestSnippet(lead.details, row ? 140 : 90);
    const meta = [originLabel(lead.origin, lead.source), lead.address ? lead.address.split(/\r?\n|,/)[0].trim() : ''].filter(Boolean).join(' · ');
    return (
        <button
            type="button"
            onClick={() => onOpen(lead.id)}
            className={cx('block w-full rounded-xl border border-l-[3px] border-border bg-card px-3 py-2.5 text-left shadow-soft transition hover:border-primary/40', edge)}
            aria-label={`Open lead ${lead.name}`}
        >
            <span className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                    {lead.status === 'new' && open && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                    <span className={cx('truncate text-[15px] text-foreground', lead.status === 'new' && open ? 'font-bold' : 'font-semibold')}>{lead.name}</span>
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={`Received ${lead.createdAt}`}>{shortAge(lead.createdAt, facts.now)}</span>
            </span>
            {snippet && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">{snippet}</span>}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                {budget && <span className="font-semibold tabular-nums text-foreground">{budget}</span>}
                {open && <FollowUpPill text={follow} />}
                {appt && (
                    <span className="truncate font-medium text-violet-700 dark:text-violet-300">
                        {APPOINTMENT_KIND_LABELS[appt.kind]} {appointmentWhenLabel(appt, facts.today, facts.locale).split(' · ')[0]}
                    </span>
                )}
                {quiet && <span className="font-medium text-warning">Gone quiet</span>}
                {lead.archived && lead.stage !== 'lost' && <span className="font-medium">Archived</span>}
                {row && <span className={cx('font-semibold', LEAD_STAGE_STYLE[lead.stage].text)}>{LEAD_STAGE_INFO[lead.stage].label}</span>}
            </span>
            {meta && <span className="mt-1 block truncate text-[11px] text-muted-foreground">{meta}</span>}
        </button>
    );
};

export const LeadBoard: React.FC<{
    /** leads in view (filters applied) */
    columns: Record<LeadStage, Lead[]>;
    facts: LeadFacts;
    filtered: boolean;
    activeStage: LeadStage;
    onPickStage: (s: LeadStage) => void;
    onOpen: (id: string) => void;
    onAdd: () => void;
    showAllClosed: boolean;
    onToggleClosed: () => void;
}> = ({ columns, facts, filtered, activeStage, onPickStage, onOpen, onAdd, showAllClosed, onToggleClosed }) => {
    const all = LEAD_STAGES.flatMap(s => columns[s]);
    const summary = leadPipelineSummary(all);
    const sorted = (s: LeadStage) => sortBoardColumn(s, columns[s], facts.today);
    return (
        <>
            {/* phones: one column at a time, stage tabs on top */}
            <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Stages">
                {LEAD_STAGES.map(s => {
                    const on = activeStage === s;
                    const due = isOpenStage(s) ? columns[s].filter(l => needsFollowUp(l, facts.today)).length : 0;
                    return (
                        <button
                            key={s}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => onPickStage(s)}
                            className={cx('relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition', on ? 'border-foreground/20 bg-card text-foreground shadow-soft' : 'border-transparent bg-muted/60 text-muted-foreground')}
                        >
                            <span className={cx('h-2 w-2 rounded-full', LEAD_STAGE_STYLE[s].bar)} aria-hidden />
                            {LEAD_STAGE_INFO[s].short}
                            <span className="tabular-nums opacity-70">{columns[s].length}</span>
                            {due > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-warning" aria-label={`${due} to follow up`} />}
                        </button>
                    );
                })}
            </div>

            <div className="flex items-stretch gap-3 md:overflow-x-auto md:pb-3 xl:gap-2" data-testid="lead-board">
                {LEAD_STAGES.map(stage => {
                    const list = sorted(stage);
                    const closed = !isOpenStage(stage);
                    const shown = closed && !showAllClosed ? list.slice(0, CLOSED_LIMIT) : list;
                    const info = summary.stages.find(x => x.stage === stage)!;
                    const due = isOpenStage(stage) ? list.filter(l => needsFollowUp(l, facts.today)).length : 0;
                    return (
                        <section
                            key={stage}
                            aria-labelledby={`lead-col-${stage}`}
                            className={cx('min-w-0 flex-1 flex-col md:min-w-[14rem] md:shrink-0 xl:min-w-[11rem] xl:shrink', activeStage === stage ? 'flex' : 'hidden md:flex')}
                        >
                            <span className={cx('h-[3px] rounded-full', LEAD_STAGE_STYLE[stage].bar)} aria-hidden />
                            <header className="flex flex-wrap items-baseline justify-between gap-x-2 px-1 pb-2 pt-2">
                                <h2 id={`lead-col-${stage}`} className="min-w-0 text-sm font-semibold text-foreground" title={LEAD_STAGE_INFO[stage].hint}>
                                    {LEAD_STAGE_INFO[stage].label} <span className="ml-0.5 font-medium tabular-nums text-muted-foreground">{list.length}</span>
                                </h2>
                                {info.budgetTotal > 0 && (
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" title={`${info.withBudget} of ${info.count} leads have a budget`}>
                                        {compactMoney(info.budgetTotal)} <span className="text-[11px] font-medium text-muted-foreground">{TOTAL_LABEL[stage]}</span>
                                    </span>
                                )}
                            </header>
                            {due > 0 && <p className="-mt-1 mb-2 px-1 text-xs font-medium text-warning">{due} to follow up</p>}
                            <div className="flex min-h-[7rem] flex-1 flex-col gap-2 rounded-2xl bg-muted/50 p-2 xl:p-1.5">
                                {list.length === 0 ? (
                                    <p className="m-auto max-w-[15rem] px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">
                                        {filtered ? 'Nothing matches here.' : EMPTY_TEXT[stage]}
                                    </p>
                                ) : shown.map(lead => <LeadCard key={lead.id} lead={lead} facts={facts} onOpen={onOpen} />)}
                                {closed && list.length > CLOSED_LIMIT && (
                                    <button type="button" onClick={onToggleClosed} className="rounded-lg px-2 py-2 text-xs font-semibold text-primary hover:bg-card">
                                        {showAllClosed ? `Show the latest ${CLOSED_LIMIT}` : `Show ${list.length - CLOSED_LIMIT} more`}
                                    </button>
                                )}
                                {stage === 'new' && (
                                    <button type="button" onClick={onAdd} className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary">
                                        <PlusIcon className="h-3.5 w-3.5" /> Add a lead
                                    </button>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>
        </>
    );
};

const PAGE = 40;

export const LeadList: React.FC<{ leads: Lead[]; facts: LeadFacts; filtered: boolean; onOpen: (id: string) => void; onAdd: () => void }> = ({ leads, facts, filtered, onOpen, onAdd }) => {
    const [limit, setLimit] = React.useState(PAGE);
    React.useEffect(() => { setLimit(PAGE); }, [leads.length]);
    if (!leads.length) {
        return (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 px-4 py-10 text-center">
                <p className="text-sm font-semibold text-foreground">{filtered ? 'No leads match.' : 'No leads yet.'}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                    {filtered ? 'Clear the search or the filters to see them all.' : 'Share your request link, or add the person who just called you.'}
                </p>
                {!filtered && <button type="button" className="btn btn-primary mt-4" onClick={onAdd}><PlusIcon className="h-4 w-4" /> Add a lead</button>}
            </div>
        );
    }
    return (
        <div>
            <ul className="grid gap-2 lg:grid-cols-2" data-testid="lead-list">
                {leads.slice(0, limit).map(lead => <li key={lead.id}><LeadCard lead={lead} facts={facts} onOpen={onOpen} row /></li>)}
            </ul>
            {leads.length > limit && (
                <button type="button" className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-primary hover:bg-muted/60" onClick={() => setLimit(l => l + PAGE)}>
                    Show {Math.min(PAGE, leads.length - limit)} more
                </button>
            )}
        </div>
    );
};
