/**
 * Job page › Subs › Quotes › "Choose this quote": shows the draft subcontract the choice would make (who, scope, amount, what the
 * sub will read, retainage, dates) BEFORE anything is saved. "Choose and draft the subcontract" marks the quote chosen (a quote
 * chosen earlier for the same scope goes back to the shortlist) and saves the draft; nothing is sent to the sub until you press
 * Send to sub. "Only mark it chosen" is for a quote you will not turn into a subcontract (a supplier's material price, say).
 * Data: lib/subs/subsApi.ts (chooseQuoteAsCommitment, chooseQuote); the draft: lib/subs/quoteCompare.ts commitmentDraftFromQuote.
 */
import React, { useMemo, useState } from 'react';
import { planLimitMessage } from '../../lib/account.ts';
import { isPlanLimitError } from '../../lib/jobFiles/jobFilesApi.ts';
import { NEEDS_CONNECTION } from '../../lib/offline/connection.ts';
import { commitmentDraftFromQuote } from '../../lib/subs/quoteCompare.ts';
import { chooseQuote, chooseQuoteAsCommitment } from '../../lib/subs/subsApi.ts';
import { parseRetainage, validateCommitmentDraft } from '../../lib/subs/subLogic.ts';
import { moneyText } from '../../lib/subs/subView.ts';
import type { JobQuote, SubCommitment, SubMember } from '../../lib/subs/subTypes.ts';
import { Modal } from '../viewKit.tsx';

export interface ChooseQuoteProps {
    quote: JobQuote;
    /** all the job's quotes (to see which one was chosen before) */
    quotes: readonly JobQuote[];
    /** the job's subcontracts (to warn when this quote already made one) */
    commitments: readonly SubCommitment[];
    member: Pick<SubMember, 'id' | 'kind' | 'name' | 'company'> | null;
    userId: string;
    isOnline: boolean;
    onClose: () => void;
    /** the quote list changed on the server: read it again; `commitment` is the new draft (null = only marked chosen) */
    onDone: (commitment: SubCommitment | null) => void;
    /** a step failed half way (the quote may be chosen already): read the lists again */
    onStale: () => void;
    onUpgrade: (reason?: string) => void;
}

const ChooseQuoteDialog: React.FC<ChooseQuoteProps> = ({ quote, quotes, commitments, member, userId, isOnline, onClose, onDone, onStale, onUpgrade }) => {
    const [retainage, setRetainage] = useState('0');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [busy, setBusy] = useState<'draft' | 'only' | null>(null);
    const [err, setErr] = useState('');

    const pct = parseRetainage(retainage);
    const draft = useMemo(
        () => commitmentDraftFromQuote(quote, member, { retainagePct: pct ?? 0, startDate: startDate || null, dueDate: dueDate || null }),
        [quote, member, pct, startDate, dueDate],
    );
    const previous = quotes.find(x => x.id !== quote.id && x.scopeKey === quote.scopeKey && x.status === 'chosen') || null;
    const existing = commitments.find(c => c.quoteId === quote.id) || null;

    const go = async (mode: 'draft' | 'only') => {
        setErr('');
        if (!isOnline) { setErr(NEEDS_CONNECTION); return; }
        if (mode === 'draft') {
            if (pct === null) { setErr('Retainage is between 0 and 50%.'); return; }
            const problem = validateCommitmentDraft(draft);
            if (problem) { setErr(problem); return; }
        }
        setBusy(mode);
        try {
            if (mode === 'draft') {
                const out = await chooseQuoteAsCommitment(userId, quotes, quote.id, member, { retainagePct: pct ?? 0, startDate: startDate || null, dueDate: dueDate || null });
                onDone(out.commitment);
            } else {
                await chooseQuote(quotes, quote.id);
                onDone(null);
            }
            onClose();
        } catch (e) {
            onStale();
            if (isPlanLimitError(e)) { onClose(); onUpgrade(planLimitMessage(e)); return; }
            setErr((e as Error)?.message || 'The quote could not be chosen.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            busy={busy !== null}
            size="lg"
            title={`Choose ${quote.vendorName || 'this quote'}?`}
            description={`For “${quote.scope}” at ${moneyText(quote.amount)}. This is the subcontract it would make.`}
            footer={(
                <>
                    <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy !== null}>Cancel</button>
                    <button type="button" className="btn btn-outline" onClick={() => void go('only')} disabled={busy !== null || !isOnline}>{busy === 'only' ? 'Saving…' : 'Only mark it chosen'}</button>
                    <button type="button" className="btn btn-primary" onClick={() => void go('draft')} disabled={busy !== null || !isOnline}>{busy === 'draft' ? 'Saving…' : 'Choose and draft the subcontract'}</button>
                </>
            )}
        >
            <div className="space-y-4">
                {!isOnline && <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm" role="status">{NEEDS_CONNECTION}</p>}
                {previous && <p className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm">{previous.vendorName || 'The quote chosen before'} was chosen for this scope. It goes back to the shortlist: only one quote is chosen for each scope.</p>}
                {existing && <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium">A subcontract was already made from this quote ({existing.status === 'draft' ? 'a draft' : 'sent'}). Another draft is rarely what you want: you can choose &ldquo;Only mark it chosen&rdquo;.</p>}

                <dl className="divide-y divide-border/70 border-y border-border/70 text-sm">
                    <div className="flex items-baseline justify-between gap-4 py-2"><dt className="shrink-0 text-muted-foreground">Who</dt><dd className="min-w-0 text-right font-semibold">{draft.subName || '—'}{draft.crewMemberId ? <span className="block text-xs font-normal text-muted-foreground">has a crew link to accept on</span> : <span className="block text-xs font-normal text-muted-foreground">no link: typed in by name</span>}</dd></div>
                    <div className="flex items-baseline justify-between gap-4 py-2"><dt className="shrink-0 text-muted-foreground">Scope</dt><dd className="min-w-0 text-right font-semibold">{draft.title}</dd></div>
                    <div className="flex items-baseline justify-between gap-4 py-2"><dt className="shrink-0 text-muted-foreground">Agreed amount</dt><dd className="font-bold tabular-nums">{moneyText(draft.amount)}</dd></div>
                    <div className="py-2"><dt className="text-muted-foreground">What the sub will read</dt><dd className="mt-1 whitespace-pre-wrap break-words">{draft.description || <span className="text-muted-foreground">Nothing yet: the quote lists no inclusions or exclusions. You can add a description when you edit the draft.</span>}</dd></div>
                </dl>

                <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                        <span className="label">Retainage</span>
                        <span className="relative block">
                            <input className="input pr-8 tabular-nums" inputMode="decimal" value={retainage} onChange={e => setRetainage(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} disabled={busy !== null} />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                        </span>
                    </label>
                    <label className="block">
                        <span className="label">Start <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={busy !== null} />
                    </label>
                    <label className="block">
                        <span className="label">Due <span className="font-normal text-muted-foreground">(optional)</span></span>
                        <input className="input" type="date" value={dueDate} min={startDate || undefined} onChange={e => setDueDate(e.target.value)} disabled={busy !== null} />
                    </label>
                </div>

                <p className="text-xs text-muted-foreground">It is saved as a draft on the Subcontracts list. Nothing goes to the sub until you press Send to sub.</p>
                {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
        </Modal>
    );
};

export default ChooseQuoteDialog;
