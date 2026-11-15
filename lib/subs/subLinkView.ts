/**
 * "My subcontract" on the crew link (/clock/<token>), roadmap D7 phase B: the words (English + Spanish) and the small rules
 * components/crew/CrewMySubcontract.tsx uses. Pure: no React, no Supabase. Data: lib/subs/subPublicApi.ts.
 *
 *   SUB_WORDS[lang]              every sentence of the section (en and es have exactly the same keys)
 *   visibleSubView(view)         the view when the section should show at all, else null: the functions exist, the member is a
 *                                subcontractor and has at least one commitment (workers and missing functions: nothing new)
 *   splitSubCommitments(list)    { open, finished }  open = sent / accepted / in progress, finished = completed + cancelled
 *   subStatusWord(status, lang)  subMoney(n, lang)  subDay(ymd, lang, today)  subDates(c, lang, today)
 *   subRetainageLine(c, lang)    '' without retainage      subPaidParts(c)   { paid, left, pct }
 *   subProgressLine(c, lang)     '' without tasks          subAcceptedLine(c, lang)
 */
import { roundMoney } from '../../utils/money.ts';
import { canSubAccept, commitmentMoney, subLinkProgress, todayISO } from './subLogic.ts';
import type { CommitmentStatus, SubLinkCommitment, SubLinkView } from './subTypes.ts';

export type SubLang = 'en' | 'es';

export const SUB_WORDS = {
    en: {
        title: 'My subcontract', titleMany: 'My subcontracts',
        scope: 'The work', price: 'Agreed price', paid: 'Paid', left: 'Still to pay',
        start: 'Starts', due: 'Due', noDates: 'No dates set yet',
        progress: 'Job progress', directions: 'Directions',
        accept: 'Accept this work', accepting: 'Accepting…', typeName: 'Type your full name', nameLabel: 'Your full name',
        acceptNote: 'Typing your name and tapping the button means you agree to this work, price and dates.',
        waiting: 'Waiting for your OK', thanks: 'Accepted. Thank you.',
        offline: "You're offline. Accepting needs a connection.",
        failed: 'That did not save. Try again.',
        already: 'This was already accepted. Showing the latest.',
        nameNeeded: 'Type your name to accept.',
        finished: (n: number) => `Finished or cancelled (${n})`, hide: 'Hide', show: 'Show',
        oldCopy: 'Showing the last copy this phone saw.',
        status: { draft: 'Draft', issued: 'Waiting for your OK', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' } as Record<CommitmentStatus, string>,
        retainage: (pct: number, amount: string) => `Retainage ${pct}% (${amount}) is held until the work is complete.`,
        acceptedBy: (name: string, day: string) => `Accepted by ${name}${day ? ` on ${day}` : ''}`,
        tasks: (done: number, total: number) => `${done} of ${total} job task${total === 1 ? '' : 's'} done`,
        paidPct: (pct: number) => `${pct}% paid`,
    },
    es: {
        title: 'Mi subcontrato', titleMany: 'Mis subcontratos',
        scope: 'El trabajo', price: 'Precio acordado', paid: 'Pagado', left: 'Por pagar',
        start: 'Empieza', due: 'Entrega', noDates: 'Aún sin fechas',
        progress: 'Avance de la obra', directions: 'Cómo llegar',
        accept: 'Aceptar este trabajo', accepting: 'Aceptando…', typeName: 'Escribe tu nombre completo', nameLabel: 'Tu nombre completo',
        acceptNote: 'Al escribir tu nombre y tocar el botón aceptas este trabajo, el precio y las fechas.',
        waiting: 'Esperando tu aceptación', thanks: 'Aceptado. Gracias.',
        offline: 'Sin conexión. Aceptar necesita conexión.',
        failed: 'No se guardó. Inténtalo de nuevo.',
        already: 'Esto ya estaba aceptado. Mostrando lo más reciente.',
        nameNeeded: 'Escribe tu nombre para aceptar.',
        finished: (n: number) => `Terminados o cancelados (${n})`, hide: 'Ocultar', show: 'Ver',
        oldCopy: 'Mostrando la última copia que vio este teléfono.',
        status: { draft: 'Borrador', issued: 'Esperando tu aceptación', accepted: 'Aceptado', in_progress: 'En curso', completed: 'Terminado', cancelled: 'Cancelado' } as Record<CommitmentStatus, string>,
        retainage: (pct: number, amount: string) => `Retención del ${pct}% (${amount}): se paga cuando el trabajo termina.`,
        acceptedBy: (name: string, day: string) => `Aceptado por ${name}${day ? ` el ${day}` : ''}`,
        tasks: (done: number, total: number) => `${done} de ${total} tarea${total === 1 ? '' : 's'} de la obra hecha${total === 1 ? '' : 's'}`,
        paidPct: (pct: number) => `${pct}% pagado`,
    },
} as const;

/** The view when the "My subcontract" section should show; null = show nothing (workers, functions missing, no commitments). */
export const visibleSubView = (view: SubLinkView | null | undefined): SubLinkView | null => {
    if (!view || !view.available || !view.member || !view.member.isSubcontractor) return null;
    const commitments = view.commitments.filter(c => c.status !== 'draft');
    return commitments.length ? { ...view, commitments } : null;
};

const OPEN: readonly CommitmentStatus[] = ['issued', 'accepted', 'in_progress'];

export const splitSubCommitments = (list: readonly SubLinkCommitment[]): { open: SubLinkCommitment[]; finished: SubLinkCommitment[] } => {
    const open = list.filter(c => OPEN.includes(c.status)).sort((a, b) => Number(b.status === 'issued') - Number(a.status === 'issued') || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
    const finished = list.filter(c => !OPEN.includes(c.status)).sort((a, b) => (b.completedAt || b.issuedAt || '').localeCompare(a.completedAt || a.issuedAt || ''));
    return { open, finished };
};

export const subStatusWord = (status: CommitmentStatus, lang: SubLang): string => SUB_WORDS[lang].status[status] ?? status;

export const subMoney = (n: number | null | undefined, lang: SubLang): string => {
    const v = roundMoney(Number(n) || 0);
    const whole = Math.abs(v - Math.round(v)) < 0.005;
    try {
        return new Intl.NumberFormat(lang === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(v);
    } catch {
        return `$${whole ? Math.round(v) : v.toFixed(2)}`;
    }
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "Nov 14" / "14 nov" (with the year when it is not this year). */
export const subDay = (ymd: string | null | undefined, lang: SubLang, today: string = todayISO()): string => {
    const s = String(ymd ?? '').slice(0, 10);
    if (!YMD.test(s)) return '';
    const d = new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    const sameYear = s.slice(0, 4) === today.slice(0, 4);
    try {
        return d.toLocaleDateString(lang === 'es' ? 'es' : 'en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return s;
    }
};

/** The start and due dates, each as a ready label ('' when not set). */
export const subDates = (c: Pick<SubLinkCommitment, 'startDate' | 'dueDate'>, lang: SubLang, today: string = todayISO()): { start: string; due: string } => ({
    start: subDay(c.startDate, lang, today),
    due: subDay(c.dueDate, lang, today),
});

export const subRetainageLine = (c: Pick<SubLinkCommitment, 'amount' | 'retainagePct'>, lang: SubLang): string => {
    if (!(c.retainagePct > 0)) return '';
    return SUB_WORDS[lang].retainage(c.retainagePct, subMoney(roundMoney((c.amount * c.retainagePct) / 100), lang));
};

/** Paid so far, still to pay, and how much of the price that is (0..100). */
export const subPaidParts = (c: Pick<SubLinkCommitment, 'amount' | 'paidTotal'>): { paid: number; left: number; pct: number } => {
    const m = commitmentMoney({ amount: c.amount, retainagePct: 0, paidTotal: c.paidTotal, payments: [], status: 'accepted' });
    return { paid: m.paid, left: m.remaining, pct: Math.max(0, Math.min(100, m.pctPaid)) };
};

export const subProgressLine = (c: Pick<SubLinkCommitment, 'tasksDone' | 'tasksTotal'>, lang: SubLang): string =>
    c.tasksTotal > 0 ? SUB_WORDS[lang].tasks(Math.min(c.tasksDone, c.tasksTotal), c.tasksTotal) : '';

export { subLinkProgress };

export const subAcceptedLine = (c: Pick<SubLinkCommitment, 'acceptedAt' | 'acceptedBy'>, lang: SubLang, today: string = todayISO()): string =>
    c.acceptedAt || c.acceptedBy
        ? SUB_WORDS[lang].acceptedBy(c.acceptedBy || '—', c.acceptedAt ? subDay(c.acceptedAt.slice(0, 10), lang, today) : '')
        : '';

/** May the Accept form show for this commitment? */
export const showAcceptForm = (c: Pick<SubLinkCommitment, 'status'>): boolean => canSubAccept(c);
