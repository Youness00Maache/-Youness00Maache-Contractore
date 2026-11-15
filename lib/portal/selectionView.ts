/**
 * Client portal: words and rules of "Your selections" and the "Ideas board" (roadmap D5 phase B). Pure, no React /
 * Supabase, tested by scripts/selections-check.ts. Data shapes: lib/portal/selectionsApi.ts.
 *
 *   splitPortalSelections(list)        { waiting, decided }   (waiting: soonest due first; decided: newest first)
 *   waitingSelections(list)            the badge count next to the Project tab
 *   portalSelectionStatus(s)           { label, tone } the words next to a selection
 *   portalSelectionDue(s, today)       "Please choose by Fri Nov 20" / "Was due Nov 10"
 *   portalDifference(difference)       { text, tone }   "+$120 upgrade" / "-$40 credit" / "Included"
 *   validatePortalChoice(input)        readable error or null (the same rules as choose_portal_selection)
 *   chosenPortalOption(s)              the option the client chose
 *   portalSelectionHistory(s, company) the history from the client's side, oldest first
 *   boardsForJob(list, jobId)          the boards of the job on screen (every board without a job match is kept out)
 */
import { shortDay } from '../tasks/taskView.ts';
import { todayYmd } from '../tasks/taskLogic.ts';
import { shortDate } from '../jobFiles/jobFileView.ts';
import { differenceText, differenceTone, moneyText } from '../selections/selectionView.ts';
import type { PortalBoard, PortalSelection, PortalSelectionOption } from './selectionsApi.ts';

export const PORTAL_COMMENT_MAX = 2000;
export const PORTAL_NAME_MAX = 120;

const byDue = (a: PortalSelection, b: PortalSelection): number =>
    (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') || String(b.sentAt || '').localeCompare(String(a.sentAt || ''));
const byRecent = (a: PortalSelection, b: PortalSelection): number =>
    String(b.chosenAt || b.sentAt || '').localeCompare(String(a.chosenAt || a.sentAt || ''));

export const splitPortalSelections = (list: readonly PortalSelection[]): { waiting: PortalSelection[]; decided: PortalSelection[] } => ({
    waiting: list.filter(s => s.status === 'sent').sort(byDue),
    decided: list.filter(s => s.status !== 'sent').sort(byRecent),
});

export const waitingSelections = (list: readonly Pick<PortalSelection, 'status'>[]): number => list.filter(s => s.status === 'sent').length;

export type PortalTone = 'waiting' | 'done' | 'info' | 'warn';

/** The words next to a selection from the client's side. */
export const portalSelectionStatus = (s: Pick<PortalSelection, 'status'>): { label: string; tone: PortalTone } => {
    switch (s.status) {
        case 'sent': return { label: 'Waiting for your choice', tone: 'waiting' };
        case 'chosen': return { label: 'Waiting for your contractor', tone: 'info' };
        case 'approved': return { label: 'Approved', tone: 'done' };
        case 'ordered': return { label: 'Ordered', tone: 'done' };
        case 'changes_requested': return { label: 'Your contractor is updating the options', tone: 'warn' };
        default: return { label: '', tone: 'info' };
    }
};

/** One line that says where a decided selection stands. */
export const portalDecisionNote = (s: Pick<PortalSelection, 'status'>, company = 'your contractor'): string => {
    switch (s.status) {
        case 'chosen': return `${company} will check your choice and confirm it.`;
        case 'approved': return `${company} confirmed your choice.`;
        case 'ordered': return `${company} has ordered it.`;
        case 'changes_requested': return `${company} asked for a change. You will get the options again to choose from.`;
        default: return '';
    }
};

export type PortalDueTone = 'late' | 'today' | 'normal' | 'none';

/** "Please choose by Fri Nov 20" / "Was due Nov 10" (late) / "" with no date or once chosen. */
export const portalSelectionDue = (s: Pick<PortalSelection, 'status' | 'dueDate'>, today: string = todayYmd()): { text: string; tone: PortalDueTone } => {
    if (!s.dueDate || s.status !== 'sent') return { text: '', tone: 'none' };
    const year = Number(today.slice(0, 4));
    if (s.dueDate < today) return { text: `Was due ${shortDay(s.dueDate, 'en', year)}`, tone: 'late' };
    if (s.dueDate === today) return { text: 'Please choose by today', tone: 'today' };
    return { text: `Please choose by ${shortDay(s.dueDate, 'en', year)}`, tone: 'normal' };
};

/** "+$120 upgrade" / "-$40 credit" / "Included" (text '' without an allowance). */
export const portalDifference = (difference: number | null | undefined): { text: string; tone: 'up' | 'down' | 'same' | 'none' } =>
    ({ text: differenceText(difference), tone: differenceTone(difference) });

export const portalMoney = moneyText;

/** The line of what the allowance covers: "Your allowance: $1,000". '' without one. */
export const allowanceLine = (allowance: number | null | undefined): string =>
    allowance === null || allowance === undefined ? '' : `Your allowance: ${moneyText(allowance)}`;

/** "3 sq ft × $4.00" for an option with a quantity ('' for a single unit at the same price as the total). */
export const optionQtyLine = (o: Pick<PortalSelectionOption, 'qty' | 'unit' | 'unitPrice' | 'total'>): string => {
    if (!(o.qty > 0) || (o.qty === 1 && !o.unit)) return '';
    const q = Math.round(o.qty * 1000) / 1000;
    return `${q}${o.unit ? ` ${o.unit}` : ''} × ${moneyText(o.unitPrice)}`;
};

export interface PortalChoiceInput { optionId?: string | null; comment?: string | null; name?: string | null }

/** What is missing before the client can send (null = fine). The same rules as the database function. */
export const validatePortalChoice = (s: Pick<PortalSelection, 'options'>, input: PortalChoiceInput): string | null => {
    if (!input.optionId || !s.options.some(o => o.id === input.optionId)) return 'Please choose one of the options.';
    if (String(input.comment ?? '').length > PORTAL_COMMENT_MAX) return `Please keep your comment under ${PORTAL_COMMENT_MAX} characters.`;
    if (!String(input.name ?? '').trim()) return 'Please type your name.';
    return null;
};

export const chosenPortalOption = (s: Pick<PortalSelection, 'options' | 'chosenOptionId'>): PortalSelectionOption | null =>
    (s.chosenOptionId && s.options.find(o => o.id === s.chosenOptionId)) || null;

export interface PortalHistoryRow { key: string; when: string; label: string; note: string | null }

const whenOf = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${shortDate(iso)}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

/** The history from the client's side ("Sent by Acme", "You chose"), oldest first; the newest choice shows in the reply, not twice. */
export const portalSelectionHistory = (s: Pick<PortalSelection, 'history' | 'status'>, company = 'your contractor'): PortalHistoryRow[] => {
    const sorted = s.history.map((e, i) => ({ e, i, t: Date.parse(e.at) || 0 })).sort((a, b) => a.t - b.t || a.i - b.i);
    let lastChosen = -1;
    sorted.forEach((x, pos) => { if (x.e.action === 'chosen') lastChosen = pos; });
    return sorted.map(({ e, i }, pos) => {
        const label = (() => {
            switch (e.action) {
                case 'sent': return `Sent by ${company}`;
                case 'reopened': return `${company} asked you to choose again`;
                case 'chosen': return 'You made a choice';
                case 'approved': return `${company} approved your choice`;
                case 'changes_requested': return `${company} asked for changes`;
                case 'ordered': return `${company} ordered it`;
                default: return String(e.action);
            }
        })();
        const hide = e.action === 'chosen' && pos === lastChosen && s.status !== 'sent';
        return { key: `${i}-${e.at}`, when: whenOf(e.at), label, note: hide ? null : e.note };
    });
};

/** The boards of the job on screen (a board with no job id is kept: the database already limits them to this client). */
export const boardsForJob = (list: readonly PortalBoard[], jobId: string | null): PortalBoard[] =>
    list.filter(b => b.items.length > 0 && (!jobId || !b.jobId || b.jobId === jobId));
