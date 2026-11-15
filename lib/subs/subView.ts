/**
 * The words and small display rules of the Subs screens (roadmap D7, phase B): pure, no React, no Supabase.
 * Data + rules live in lib/subs/subLogic.ts and quoteCompare.ts; this file only decides what the screens SAY.
 *
 *   money / dates   moneyText(n) "$1,200" / "$1,200.50" / "-$250"      dayLabel(ymd, today) "Nov 14" / "Nov 14, 2025"
 *   commitments     commitmentTone(status)  actionLabel(action)  dueInfo(c, today)  acceptanceLine(c)  sentNote(c)
 *                   headlineParts(summary)  paymentLine(p)  ACTION_CONFIRM  EDIT_RESET_WARNING  CORRECTION_HELP
 *                   payPreview(c, input)    live check of the "Record a payment" form (error, correction, notes)
 *   quotes          quoteTone(status)  flagChips(row)  flagWarnings(row)  quoteHighlights(rows)  groupLine(group)
 *   crew screen     MEMBER_FILTERS  memberFilterMatches(filter, kind)  memberSubLine(m)  KIND_LABEL
 *   sub link        subInviteText(name, company, url)
 */
import { roundMoney } from '../../utils/money.ts';
import {
    commitmentMoney, scheduleInfo, statusLabel, todayISO, validatePayment,
    type CommitmentMoney, type CommitmentSummary, type OwnerAction, type OwnerActionId, type PaymentInput,
} from './subLogic.ts';
import type { QuoteComparisonRow, QuoteFlag, QuoteGroup } from './quoteCompare.ts';
import type { CommitmentStatus, CrewKind, QuoteStatus, SubCommitment, SubPayment } from './subTypes.ts';

export type SubTone = 'primary' | 'warning' | 'success' | 'danger' | 'muted';

export const SUBS_PREMIUM_REASON = 'Subcontractors and quote comparison are part of Premium.';

// ------------------------------------------------------------------------------------------------ money + dates
/** "$1,200" (no cents for a whole amount), "$1,200.50", "-$250". */
export const moneyText = (n: number | null | undefined): string => {
    const v = roundMoney(Number(n) || 0);
    const whole = Math.abs(v - Math.round(v)) < 0.005;
    const abs = Math.abs(v);
    let s: string;
    try {
        s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(abs);
    } catch {
        s = `$${whole ? Math.round(abs) : abs.toFixed(2)}`;
    }
    return v < 0 ? `-${s}` : s;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "Nov 14" (this year) or "Nov 14, 2025"; '' for anything that is not YYYY-MM-DD. */
export const dayLabel = (ymd: string | null | undefined, today: string = todayISO()): string => {
    const s = String(ymd ?? '').slice(0, 10);
    if (!YMD.test(s)) return '';
    const month = MONTHS[Number(s.slice(5, 7)) - 1];
    if (!month) return '';
    const base = `${month} ${Number(s.slice(8, 10))}`;
    return s.slice(0, 4) === today.slice(0, 4) ? base : `${base}, ${s.slice(0, 4)}`;
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
/** "a", "a and b", "a, b and c" */
export const joinWords = (items: readonly string[]): string => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const firstWord = (name: string): string => String(name ?? '').trim().split(/\s+/)[0] || '';

// ------------------------------------------------------------------------------------------------ commitments
export const commitmentTone = (status: CommitmentStatus): SubTone => {
    switch (status) {
        case 'issued': return 'warning';
        case 'accepted': return 'primary';
        case 'in_progress': return 'primary';
        case 'completed': return 'success';
        default: return 'muted';
    }
};

/** The owner's button words (the spec's plain words for the two status buttons; the rest as ownerActions says). */
export const actionLabel = (a: Pick<OwnerAction, 'id' | 'label'>): string =>
    a.id === 'start' ? 'Mark in progress' : a.id === 'complete' ? 'Mark completed' : a.label;

export interface ActionConfirm {
    title: string;
    label: string;
    destructive?: boolean;
    message: (c: Pick<SubCommitment, 'title'>) => string;
}

/** Actions that ask first. 'issue' / 'start' / 'redraft' go straight through. */
export const ACTION_CONFIRM: Partial<Record<OwnerActionId | 'delete', ActionConfirm>> = {
    withdraw: {
        title: 'Take it back to a draft?',
        label: 'Back to draft',
        message: c => `"${c.title}" goes back to a draft. The sub stops seeing it on their link until you send it again.`,
    },
    cancel: {
        title: 'Cancel this subcontract?',
        label: 'Cancel it',
        destructive: true,
        message: c => `"${c.title}" shows as Cancelled and stops counting as committed. Payments you already recorded stay on the record.`,
    },
    complete: {
        title: 'Mark it completed?',
        label: 'Mark completed',
        message: c => `"${c.title}" is done. The retainage you held can be paid now. You can reopen it later.`,
    },
    reopen: {
        title: 'Reopen it?',
        label: 'Reopen',
        message: c => `"${c.title}" goes back to In progress.`,
    },
    delete: {
        title: 'Delete this subcontract?',
        label: 'Delete',
        destructive: true,
        message: c => `"${c.title}" is removed for good. A cancelled or draft subcontract with no payments is the only kind that can be deleted.`,
    },
};

export const EDIT_RESET_WARNING = 'The sub already accepted this. Changing the scope, amount, retainage or dates sends it back to Sent, and the sub has to accept again.';

export const CORRECTION_HELP = 'Made a mistake? Enter the fix as a negative amount (for example -250). The earlier payment stays in the list, so the history stays honest.';

export type DueTone = 'late' | 'soon' | 'normal' | 'none';
export interface DueInfo { text: string; tone: DueTone }

/** "3 days overdue", "Due tomorrow", "Due Nov 20", "Starts Nov 12 · Due Nov 20", "Completed Nov 3" ('' when there is no date). */
export const dueInfo = (c: Pick<SubCommitment, 'status' | 'startDate' | 'dueDate' | 'completedAt'>, today: string = todayISO()): DueInfo => {
    const s = scheduleInfo(c, today);
    if (s.state === 'done') return { text: c.completedAt ? `Completed ${dayLabel(c.completedAt.slice(0, 10), today)}` : 'Completed', tone: 'none' };
    if (s.state === 'cancelled') return { text: '', tone: 'none' };
    if (s.overdue) return { text: `${plural(s.daysLate, 'day')} overdue`, tone: 'late' };
    const parts: string[] = [];
    if (s.state === 'upcoming' && c.startDate) parts.push(`Starts ${dayLabel(c.startDate, today)}`);
    if (c.dueDate) {
        const left = s.daysLeft ?? 99;
        parts.push(left === 0 ? 'Due today' : left === 1 ? 'Due tomorrow' : `Due ${dayLabel(c.dueDate, today)}`);
        return { text: parts.join(' · '), tone: left <= 3 ? 'soon' : 'normal' };
    }
    return { text: parts.join(' · '), tone: parts.length ? 'normal' : 'none' };
};

/** "Accepted by Maria Lopez on Nov 14" / "Waiting for the sub to accept" / '' (drafts, cancelled). */
export const acceptanceLine = (c: Pick<SubCommitment, 'status' | 'acceptedAt' | 'acceptedBy'>, today: string = todayISO()): string => {
    if (c.acceptedAt || c.acceptedBy) {
        const day = c.acceptedAt ? dayLabel(c.acceptedAt.slice(0, 10), today) : '';
        return `Accepted by ${c.acceptedBy || 'the sub'}${day ? ` on ${day}` : ''}`;
    }
    if (c.status === 'issued') return 'Waiting for the sub to accept';
    return '';
};

/** What to tell the owner after "Send to sub". A sub without a ContractorDocs link cannot accept on a phone. */
export const sentNote = (c: Pick<SubCommitment, 'crewMemberId'>): string =>
    c.crewMemberId
        ? 'Sent. The sub sees it on their link: use Copy sub link to send it to them.'
        : 'Marked sent. This sub was typed in by name, so there is no link for them to accept on. Add them under Crew as a subcontractor to give them one.';

export interface HeadPart { text: string; tone?: 'strong' | 'late' }

/** The one-line summary under the list heading. */
export const headlineParts = (s: CommitmentSummary): HeadPart[] => {
    const out: HeadPart[] = [];
    if (!s.count) return out;
    if (s.awaitingAcceptance) out.push({ text: `${s.awaitingAcceptance} to accept`, tone: 'strong' });
    if (s.overdue) out.push({ text: `${s.overdue} overdue`, tone: 'late' });
    if (s.committed > 0) out.push({ text: `${moneyText(s.committed)} committed` });
    if (s.paid > 0) out.push({ text: `${moneyText(s.paid)} paid` });
    if (s.outstanding > 0) out.push({ text: `${moneyText(s.outstanding)} still to pay` });
    if (s.retainageHeld > 0) out.push({ text: `${moneyText(s.retainageHeld)} retainage held` });
    if (s.draftTotal > 0) out.push({ text: `${moneyText(s.draftTotal)} in drafts` });
    if (!out.length) out.push({ text: plural(s.count, 'subcontract') });
    return out;
};

/** "Nov 14 · $2,500" / "Nov 20 · -$250 correction" + the note. */
export const paymentLine = (p: Pick<SubPayment, 'at' | 'amount' | 'note'>, today: string = todayISO()): { when: string; amount: string; correction: boolean; note: string } => ({
    when: dayLabel(p.at, today) || '—',
    amount: moneyText(p.amount),
    correction: p.amount < 0,
    note: p.note || '',
});

export interface PayPreview {
    /** the form can be saved */
    ready: boolean;
    /** a readable problem, once the amount is typed */
    error: string | null;
    correction: boolean;
    amount: number | null;
    after: CommitmentMoney | null;
    notes: string[];
}

/** Live check for "Record a payment": what the totals will be, and why it cannot be saved yet. */
export const payPreview = (c: SubCommitment, input: PaymentInput): PayPreview => {
    const raw = String(input.amount ?? '').trim();
    const none: PayPreview = { ready: false, error: null, correction: false, amount: null, after: null, notes: [] };
    if (!raw || raw === '-') return none;
    const n = Number(raw.replace(/[\s$€£,]/g, ''));
    if (!Number.isFinite(n)) return { ...none, error: 'Enter the payment amount.' };
    const amount = roundMoney(n);
    const error = validatePayment(c, input);
    if (error) return { ...none, error, correction: amount < 0, amount };
    const after = commitmentMoney({ ...c, payments: [...c.payments, { id: 'preview', at: input.at || todayISO(), amount, note: null }] });
    const notes: string[] = [];
    if (amount < 0) notes.push(`A correction: it lowers the paid total by ${moneyText(-amount)}. The earlier payment stays in the list.`);
    if (after.intoRetainage) notes.push('This pays into the retainage you are holding until the work is complete.');
    return { ready: true, error: null, correction: amount < 0, amount, after, notes };
};

// ------------------------------------------------------------------------------------------------ quotes
export const quoteTone = (status: QuoteStatus): SubTone =>
    status === 'chosen' ? 'success' : status === 'shortlisted' ? 'primary' : status === 'rejected' ? 'muted' : 'muted';

export const QUOTE_STATUS_WORD: Record<QuoteStatus, string> = { received: 'Received', shortlisted: 'Shortlisted', rejected: 'Rejected', chosen: 'Chosen' };

export interface QuoteAction { to: QuoteStatus; label: string; primary?: boolean }

/** The status buttons for a quote, in order (every `to` passes canSetQuoteStatus). "Choose this quote" is the main one. */
export const quoteActionList = (status: QuoteStatus): QuoteAction[] => {
    switch (status) {
        case 'received': return [{ to: 'chosen', label: 'Choose this quote', primary: true }, { to: 'shortlisted', label: 'Shortlist' }, { to: 'rejected', label: 'Reject' }];
        case 'shortlisted': return [{ to: 'chosen', label: 'Choose this quote', primary: true }, { to: 'rejected', label: 'Reject' }, { to: 'received', label: 'Back to received' }];
        case 'chosen': return [{ to: 'shortlisted', label: 'Not this one: back to shortlist' }, { to: 'rejected', label: 'Reject' }];
        default: return [{ to: 'shortlisted', label: 'Bring back to shortlist' }, { to: 'received', label: 'Back to received' }];
    }
};

export interface FlagChip { key: QuoteFlag; tone: SubTone; text: string }

/** The good / neutral facts about a quote, in plain words (chips). */
export const flagChips = (row: QuoteComparisonRow, nearPct = 10): FlagChip[] => {
    const out: FlagChip[] = [];
    const f = row.flags;
    if (f.includes('chosen')) out.push({ key: 'chosen', tone: 'success', text: 'Chosen' });
    if (f.includes('rejected')) out.push({ key: 'rejected', tone: 'muted', text: 'Rejected' });
    if (f.includes('lowest')) out.push({ key: 'lowest', tone: 'success', text: 'Lowest price' });
    else if (f.includes('near_lowest')) {
        const diff = row.diffFromLowest !== null ? ` (${moneyText(row.diffFromLowest)} more)` : '';
        out.push({ key: 'near_lowest', tone: 'primary', text: `Within ${nearPct}% of the lowest${diff}` });
    }
    if (f.includes('best_value')) out.push({ key: 'best_value', tone: 'primary', text: 'Best value (suggested)' });
    if (f.includes('fastest')) out.push({ key: 'fastest', tone: 'primary', text: 'Fastest' });
    if (f.includes('expired')) out.push({ key: 'expired', tone: 'danger', text: 'Quote expired' });
    else if (f.includes('expiring_soon')) {
        const d = row.validDaysLeft ?? 0;
        out.push({ key: 'expiring_soon', tone: 'warning', text: d <= 0 ? 'Expires today' : `Expires in ${plural(d, 'day')}` });
    }
    return out;
};

/** "Lowest" / "+$180 (+3.8%)" next to the quote's amount ('' when there is no price to compare with). */
export const diffText = (row: Pick<QuoteComparisonRow, 'diffFromLowest' | 'pctAboveLowest'>): string => {
    if (row.diffFromLowest === null) return '';
    if (row.diffFromLowest === 0) return 'Lowest';
    return `${row.diffFromLowest > 0 ? '+' : '-'}${moneyText(Math.abs(row.diffFromLowest))}${row.pctAboveLowest !== null ? ` (${row.pctAboveLowest > 0 ? '+' : ''}${row.pctAboveLowest}%)` : ''}`;
};

/** What is missing or old on a quote: "check before you choose" lines. */
export const flagWarnings = (row: QuoteComparisonRow, staleDays = 60): string[] => {
    const out: string[] = [];
    const f = row.flags;
    if (f.includes('missing_inclusions')) out.push('No inclusions listed: ask what is covered.');
    if (f.includes('missing_exclusions')) out.push('No exclusions listed: ask what is not covered.');
    if (f.includes('no_document')) out.push('No file or link attached.');
    if (f.includes('stale')) out.push(`Received more than ${staleDays} days ago: the price may have changed.`);
    return out;
};

/** A few plain sentences about the quotes of one scope (the suggestion is never a rule). */
export const quoteHighlights = (rows: readonly QuoteComparisonRow[]): string[] => {
    const active = rows.filter(r => r.rank !== null);
    const out: string[] = [];
    if (!active.length) {
        if (rows.length) out.push('Every quote here is rejected or expired. Ask for a new price or bring one back.');
        return out;
    }
    const lowest = active.filter(r => r.flags.includes('lowest'));
    const low = lowest[0];
    if (low) out.push(`${low.quote.vendorName || 'One quote'} is the lowest at ${moneyText(low.quote.amount)}${lowest.length > 1 ? `, tied with ${plural(lowest.length - 1, 'other')}` : ''}.`);
    if (active.length >= 2) {
        const high = active[active.length - 1];
        if (high.pctAboveLowest !== null && high.diffFromLowest) out.push(`The highest is ${high.pctAboveLowest}% above the lowest (${moneyText(high.diffFromLowest)} more).`);
    }
    const best = active.find(r => r.flags.includes('best_value'));
    if (best && low) {
        if (best.quote.id === low.quote.id) {
            out.push(`${best.quote.vendorName || 'It'} is also the best value we can see: it is the lowest and nothing important is missing.`);
        } else {
            const why: string[] = [];
            if (low.flags.includes('missing_inclusions') && !best.flags.includes('missing_inclusions')) why.push('it lists what is included');
            if (low.flags.includes('missing_exclusions') && !best.flags.includes('missing_exclusions')) why.push('it lists what is not');
            if (low.flags.includes('no_document') && !best.flags.includes('no_document')) why.push('it has a file or link');
            const bl = best.quote.leadTimeDays;
            const ll = low.quote.leadTimeDays;
            if (bl !== null && (ll === null || bl < ll)) why.push('it can start sooner');
            if (why.length) out.push(`${best.quote.vendorName || 'One quote'} may be the better buy: ${moneyText(best.diffFromLowest)} more than the lowest, but ${joinWords(why)}. Only a suggestion.`);
        }
    }
    const expired = rows.filter(r => r.flags.includes('expired') && r.quote.status !== 'rejected').length;
    if (expired) out.push(`${plural(expired, 'quote')} expired: ask for a new price.`);
    return out;
};

export const groupLine = (g: Pick<QuoteGroup, 'quotes' | 'activeCount' | 'lowest' | 'highest'>): string => {
    const parts = [plural(g.quotes.length, 'quote')];
    if (g.lowest !== null && g.highest !== null) parts.push(g.lowest === g.highest ? moneyText(g.lowest) : `${moneyText(g.lowest)} to ${moneyText(g.highest)}`);
    const rejected = g.quotes.length - g.activeCount;
    if (rejected > 0) parts.push(`${rejected} rejected`);
    return parts.join(' · ');
};

// ------------------------------------------------------------------------------------------------ crew screen
export type MemberFilter = 'all' | 'workers' | 'subs';
export const MEMBER_FILTERS: ReadonlyArray<{ id: MemberFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'workers', label: 'Workers' },
    { id: 'subs', label: 'Subs' },
];
export const KIND_LABEL: Record<CrewKind, string> = { employee: 'Worker', subcontractor: 'Subcontractor' };

export const memberFilterMatches = (filter: MemberFilter, kind: CrewKind): boolean =>
    filter === 'all' || (filter === 'subs' ? kind === 'subcontractor' : kind === 'employee');

/** "ACME Electric · Electrical" under a subcontractor's name ('' when neither is set). */
export const memberSubLine = (m: { company?: string | null; trade?: string | null }): string =>
    [String(m.company ?? '').trim(), String(m.trade ?? '').trim()].filter(Boolean).join(' · ');

// ------------------------------------------------------------------------------------------------ sub link
/** The text copied with a sub's link (the link itself is the crew link: lib/crew/crewLogic.ts crewLinkUrl). */
export const subInviteText = (memberName: string, company: string, url: string): string => {
    const first = firstWord(memberName);
    const hi = first ? `Hi ${first}, ` : '';
    const who = String(company || '').trim() ? `${String(company).trim()} ` : '';
    return `${hi}here is your ${who}subcontract link: ${url}\nOpen it on your phone to see the scope, the price and the dates, and to accept the work. No app or password needed.`;
};
