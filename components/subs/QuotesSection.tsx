/**
 * Job page › Subs › Quotes ("Compare quotes"): the prices you were given for the same scope of work, side by side. Quotes are
 * grouped by scope. Each group lists its quotes cheapest first with plain-word flags (lowest, within 10% of the lowest, best value,
 * expired, no inclusions listed...), opens a side-by-side table with "Compare", and lets you shortlist, reject or choose one.
 * Exactly one quote is chosen for each scope; choosing shows the draft subcontract first (components/subs/ChooseQuoteDialog.tsx).
 * Every change needs a connection and Premium (the list stays readable on Free).
 */
import React, { useMemo, useState } from 'react';
import { compareQuotes, groupQuotesByScope } from '../../lib/subs/quoteCompare.ts';
import { deleteQuote, setQuoteStatus } from '../../lib/subs/subsApi.ts';
import { todayISO } from '../../lib/subs/subLogic.ts';
import { QUOTE_STATUS_WORD, dayLabel, flagChips, groupLine, moneyText, quoteActionList, quoteTone, type SubTone } from '../../lib/subs/subView.ts';
import type { JobQuote, QuoteStatus, SubCommitment } from '../../lib/subs/subTypes.ts';
import type { SupplierRecord } from '../../lib/suppliers/types.ts';
import { cx } from '../commsKit.tsx';
import { ActionMenu, ConfirmDialog } from '../viewKit.tsx';
import { toast } from '../Toast.tsx';
import { PlusIcon } from '../Icons.tsx';
import { StatusChip, TypeStamp } from '../jobFiles/ui.tsx';
import ChooseQuoteDialog from './ChooseQuoteDialog.tsx';
import QuoteCompareTable from './QuoteCompareTable.tsx';
import QuoteEditorModal from './QuoteEditorModal.tsx';
import { openQuote } from './openQuote.ts';
import type { SubsGuards } from './subsShared.ts';
import type { JobListState, SubMembersState } from './useJobSubs.ts';

export interface QuotesSectionProps {
    jobId: string;
    userId: string;
    quotes: JobListState<JobQuote>;
    commitments: JobListState<SubCommitment>;
    members: SubMembersState;
    suppliers: readonly SupplierRecord[] | null;
    guards: SubsGuards;
    /** a draft subcontract was made from a quote: show the Subcontracts list */
    onShowSubcontracts: () => void;
}

const EMPTY: JobQuote[] = [];
const EMPTY_C: SubCommitment[] = [];

const BAR: Record<SubTone, string> = {
    primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', danger: 'bg-destructive', muted: 'bg-muted-foreground/30',
};
const CHIP_TEXT: Record<SubTone, string> = {
    primary: 'text-primary', warning: 'text-warning', success: 'text-success', danger: 'text-destructive', muted: 'text-muted-foreground',
};

const QuotesSection: React.FC<QuotesSectionProps> = ({ jobId, userId, quotes, commitments, members, suppliers, guards, onShowSubcontracts }) => {
    const today = todayISO();
    const list = Array.isArray(quotes.items) ? quotes.items : EMPTY;
    const commitList = Array.isArray(commitments.items) ? commitments.items : EMPTY_C;
    const groups = useMemo(() => groupQuotesByScope(list), [list]);
    const rowsByGroup = useMemo(() => new Map(groups.map(g => [g.scopeKey, compareQuotes(g.quotes, { today })])), [groups, today]);
    const [editor, setEditor] = useState<{ quote?: JobQuote; presetScope?: string } | null>(null);
    const [compareKey, setCompareKey] = useState<string | null>(null);
    const [choose, setChoose] = useState<JobQuote | null>(null);
    const [deleting, setDeleting] = useState<JobQuote | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const startNew = (presetScope?: string) => { if (guards.needPremium() && guards.needOnline()) setEditor({ presetScope }); };

    const setStatus = async (q: JobQuote, to: QuoteStatus) => {
        if (busyId) return;
        if (!guards.needPremium()) return;
        if (!guards.needOnline()) return;
        if (to === 'chosen') { setChoose(q); return; }
        setBusyId(q.id);
        try {
            quotes.upsert(await setQuoteStatus(q.id, to));
            toast.success(to === 'rejected' ? 'Rejected.' : to === 'shortlisted' ? 'On the shortlist.' : 'Back to received.');
        } catch (e) {
            guards.fail(e, 'The change could not be saved.');
        } finally {
            setBusyId(null);
        }
    };

    const open = async (q: JobQuote, which: 'file' | 'link' | 'any' = 'any') => {
        const ok = await openQuote(q, which);
        if (!ok) toast.error(which === 'link' ? 'This quote has no link.' : 'The file could not be opened. Check your connection and try again.');
    };

    const doDelete = async () => {
        const q = deleting;
        if (!q || !guards.needOnline()) return;
        setBusyId(q.id);
        try {
            await deleteQuote(q);
            quotes.remove(q.id);
            setDeleting(null);
            toast.success('Deleted.');
        } catch (e) {
            guards.fail(e, 'It could not be deleted.');
        } finally {
            setBusyId(null);
        }
    };

    const quoteRow = (q: JobQuote) => {
        const row = rowsByGroup.get(q.scopeKey)?.find(r => r.quote.id === q.id);
        const chips = row ? flagChips(row).filter(c => c.key !== 'chosen' && c.key !== 'rejected') : [];
        const tone = quoteTone(q.status);
        const acts = quoteActionList(q.status);
        const member = q.crewMemberId ? members.byId.get(q.crewMemberId) : undefined;
        const meta = [
            member?.trade || '',
            q.leadTimeDays !== null ? `${q.leadTimeDays} day${q.leadTimeDays === 1 ? '' : 's'} lead time` : '',
            q.validUntil ? `valid to ${dayLabel(q.validUntil, today)}` : '',
        ].filter(Boolean);
        return (
            <li key={q.id} className={cx('relative flex items-center gap-1 pl-4 pr-1', busyId === q.id && 'opacity-60', q.status === 'rejected' && 'opacity-70')}>
                <span aria-hidden className={cx('absolute inset-y-2 left-0 w-[3px] rounded-r', BAR[tone])} />
                <button type="button" onClick={() => { if (guards.needPremium() && guards.needOnline()) setEditor({ quote: q }); }} className="min-w-0 flex-1 py-2.5 pr-1 text-left">
                    <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-semibold leading-5">{q.vendorName || 'Unnamed'}</span>
                        <span className={cx('shrink-0 text-base font-bold tabular-nums', q.status === 'rejected' && 'line-through decoration-muted-foreground/50')}>{moneyText(q.amount)}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        {q.status !== 'received' && <StatusChip tone={tone}>{QUOTE_STATUS_WORD[q.status]}</StatusChip>}
                        {chips.map(c => <span key={c.key} className={cx('font-semibold', CHIP_TEXT[c.tone])}>{c.text}</span>)}
                        {meta.map(m => <span key={m} className="text-muted-foreground">{m}</span>)}
                    </span>
                </button>
                {(q.filePath || q.url) && (
                    <button type="button" className="shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { void open(q); }} aria-label={q.filePath ? `Open the file of ${q.vendorName}` : `Open the link of ${q.vendorName}`}>
                        <TypeStamp text={q.filePath ? ((q.fileName || '').split('.').pop() || 'FILE').slice(0, 4).toUpperCase() : 'LINK'} className="h-8 w-10" />
                    </button>
                )}
                <span className="shrink-0">
                    <ActionMenu
                        label={`More for the quote from ${q.vendorName}`}
                        items={[
                            ...acts.map(a => ({ label: a.label, onSelect: () => { void setStatus(q, a.to); } })),
                            { label: 'Edit', onSelect: () => { if (guards.needPremium() && guards.needOnline()) setEditor({ quote: q }); } },
                            q.filePath ? { label: 'Open the file', onSelect: () => { void open(q, 'file'); } } : null,
                            q.url ? { label: 'Open the link', onSelect: () => { void open(q, 'link'); } } : null,
                            { label: 'Delete', destructive: true, onSelect: () => { if (guards.needPremium()) setDeleting(q); } },
                        ]}
                    />
                </span>
            </li>
        );
    };

    const scopes = groups.map(g => g.scope);
    const chosenMember = choose?.crewMemberId ? members.byId.get(choose.crewMemberId) || null : null;

    return (
        <div className="space-y-4" data-testid="subs-quotes">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 text-sm text-muted-foreground">
                    {groups.length === 0 ? 'No quotes yet.' : `${groups.length} scope${groups.length === 1 ? '' : 's'} · ${list.length} quote${list.length === 1 ? '' : 's'}${groups.filter(g => g.chosen).length ? ` · ${groups.filter(g => g.chosen).length} chosen` : ''}`}
                </p>
                <button type="button" className="btn btn-primary h-11 w-full shrink-0 px-3.5 sm:h-10 sm:w-auto" onClick={() => startNew()}><PlusIcon className="h-4 w-4" /> Add a quote</button>
            </div>

            {groups.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    Got prices from two or three subs or suppliers for the same work? Add each one with <span className="font-semibold text-foreground">Add a quote</span> using the same scope, for example &ldquo;Electrical rough-in&rdquo;. They line up side by side with what is lowest, what is missing and what has expired. Choose one and it becomes a draft subcontract.
                </p>
            ) : (
                <div className="space-y-5">
                    {groups.map(g => (
                        <section key={g.scopeKey} aria-label={g.scope}>
                            <div className="mb-1 flex items-start justify-between gap-3 px-1">
                                <div className="min-w-0">
                                    <h3 className="break-words text-sm font-bold leading-5">{g.scope}</h3>
                                    <p className="text-xs text-muted-foreground">
                                        {groupLine(g)}
                                        {g.chosen && <span className="font-semibold text-success"> · chosen: {g.chosen.vendorName}</span>}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    {g.quotes.length >= 2 && (
                                        <button type="button" className={cx('btn btn-sm min-h-[40px]', compareKey === g.scopeKey ? 'btn-primary' : 'btn-outline')} aria-expanded={compareKey === g.scopeKey} onClick={() => setCompareKey(k => (k === g.scopeKey ? null : g.scopeKey))}>
                                            {compareKey === g.scopeKey ? 'Hide table' : 'Compare'}
                                        </button>
                                    )}
                                    <button type="button" className="btn btn-ghost btn-sm min-h-[40px] px-2.5" onClick={() => startNew(g.scope)} aria-label={`Add another quote for ${g.scope}`}><PlusIcon className="h-4 w-4" /> Quote</button>
                                </div>
                            </div>
                            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">{g.quotes.map(quoteRow)}</ul>
                            {compareKey === g.scopeKey && g.quotes.length >= 2 && (
                                <div className="mt-3">
                                    <QuoteCompareTable quotes={g.quotes} today={today} busyId={busyId} onSetStatus={(q, to) => { void setStatus(q, to); }} onOpenFile={q => { void open(q); }} />
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

            {editor && (
                <QuoteEditorModal
                    quote={editor.quote}
                    presetScope={editor.presetScope}
                    jobId={jobId}
                    userId={userId}
                    scopes={scopes}
                    subs={members.subs}
                    suppliers={suppliers}
                    isOnline={guards.isOnline}
                    onClose={() => setEditor(null)}
                    onSaved={saved => { quotes.upsert(saved); toast.success(editor.quote ? 'Saved.' : 'Quote added.'); }}
                    onUpgrade={guards.onUpgrade}
                />
            )}

            {choose && (
                <ChooseQuoteDialog
                    quote={choose}
                    quotes={list}
                    commitments={commitList}
                    member={chosenMember}
                    userId={userId}
                    isOnline={guards.isOnline}
                    onClose={() => setChoose(null)}
                    onStale={() => { void quotes.reload(); void commitments.reload(); }}
                    onDone={commitment => {
                        void quotes.reload();
                        if (commitment) {
                            commitments.upsert(commitment);
                            toast.success('Chosen. A draft subcontract is on your Subcontracts list.');
                            onShowSubcontracts();
                        } else {
                            toast.success('Chosen.');
                        }
                    }}
                    onUpgrade={guards.onUpgrade}
                />
            )}

            <ConfirmDialog
                open={!!deleting}
                title="Delete this quote?"
                message={deleting ? <>The quote from {deleting.vendorName || 'this vendor'} for “{deleting.scope}” is removed{deleting.filePath ? ' with its file' : ''}. To keep the record, reject it instead.</> : undefined}
                confirmLabel="Delete"
                destructive
                busy={!!deleting && busyId === deleting.id}
                onConfirm={() => { void doDelete(); }}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default QuotesSection;
