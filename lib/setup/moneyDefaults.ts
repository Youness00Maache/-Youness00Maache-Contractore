/**
 * "Tax and terms" (setup assistant, roadmap N8): the defaults a NEW estimate or invoice starts with. The app had no
 * account-level place for them (tax rate 0, due in 30 days, fixed wording), so they live in public.user_settings
 * 'documents.money' (the table that already holds the default design) and are applied when a new document opens
 * (components/forms/useDocumentForm.ts). A field left empty changes nothing: the document starts exactly as before.
 * Documents already saved are never touched, and every default stays editable on each document. Pure.
 *
 * There is no currency here: documents are in dollars everywhere in the app, so the wizard does not ask for one.
 */
export const MONEY_DEFAULTS_SETTING = 'documents.money';

export const MONEY_LIMITS = { maxTaxRate: 30, maxDueDays: 365, text: 1500 } as const;

/** Due-in choices offered in the wizard (days; 0 = due on receipt). */
export const DUE_DAY_CHOICES: ReadonlyArray<{ days: number; label: string }> = [
    { days: 0, label: 'On receipt' },
    { days: 7, label: '7 days' },
    { days: 14, label: '14 days' },
    { days: 15, label: '15 days' },
    { days: 30, label: '30 days' },
    { days: 45, label: '45 days' },
    { days: 60, label: '60 days' },
];

export interface MoneyDefaults {
    /** sales tax, percent (8.25); null = not set */
    taxRate: number | null;
    /** invoices are due this many days after the issue date; null = not set (the app's 30 days) */
    dueDays: number | null;
    /** wording for the estimate's terms (deposit, schedule); '' = not set */
    estimateTerms: string;
    /** note printed on invoices (thank you, late-fee wording); '' = not set */
    invoiceNote: string;
    updatedAt: string | null;
}

export const emptyMoneyDefaults = (): MoneyDefaults => ({ taxRate: null, dueDays: null, estimateTerms: '', invoiceNote: '', updatedAt: null });

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, MONEY_LIMITS.text) : '');

/** A value read from storage or typed in the wizard, made safe. Out-of-range numbers become "not set". */
export function normalizeMoneyDefaults(raw: unknown): MoneyDefaults {
    const base = emptyMoneyDefaults();
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Record<string, unknown>;
    const tax = num(r.taxRate);
    const due = num(r.dueDays);
    return {
        taxRate: tax !== null && tax >= 0 && tax <= MONEY_LIMITS.maxTaxRate ? Math.round(tax * 1000) / 1000 : null,
        dueDays: due !== null && due >= 0 && due <= MONEY_LIMITS.maxDueDays ? Math.round(due) : null,
        estimateTerms: text(r.estimateTerms),
        invoiceNote: text(r.invoiceNote),
        updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    };
}

/** Is anything set? (A record with nothing in it is the same as none.) */
export const hasMoneyDefaults = (d: MoneyDefaults | null | undefined): boolean =>
    !!d && (d.taxRate !== null || d.dueDays !== null || d.estimateTerms !== '' || d.invoiceNote !== '');

/** What typing in the wizard problems are: a message, or null when the entries are fine. */
export function moneyEntryProblem(input: { taxRate: string; dueDays: string }): string | null {
    const tax = input.taxRate.trim();
    if (tax !== '') {
        const n = num(tax);
        if (n === null || n < 0 || n > MONEY_LIMITS.maxTaxRate) return `Sales tax should be a percent between 0 and ${MONEY_LIMITS.maxTaxRate}, like 8.25.`;
    }
    const due = input.dueDays.trim();
    if (due !== '') {
        const n = num(due);
        if (n === null || n < 0 || n > MONEY_LIMITS.maxDueDays) return `Days until an invoice is due should be between 0 and ${MONEY_LIMITS.maxDueDays}.`;
    }
    return null;
}

const addDays = (iso: string, days: number): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * The first values of a NEW document of `formType` ('Estimate' / 'Invoice'). Only the fields the person set are
 * changed; any other document type, or no defaults, returns `base` as it is.
 */
export function applyMoneyDefaults<T extends object>(formType: string, base: T, defaults: MoneyDefaults | null | undefined): T {
    if (!defaults || !hasMoneyDefaults(defaults)) return base;
    const b = base as Record<string, unknown>;
    if (formType !== 'Estimate' && formType !== 'Invoice') return base;
    const out: Record<string, unknown> = { ...b };
    if (defaults.taxRate !== null) out.taxRate = defaults.taxRate;
    if (formType === 'Invoice') {
        if (defaults.dueDays !== null && typeof b.issueDate === 'string') out.dueDate = addDays(b.issueDate, defaults.dueDays);
        if (defaults.invoiceNote) out.notes = defaults.invoiceNote;
    } else if (defaults.estimateTerms) {
        out.terms = defaults.estimateTerms;
    }
    return out as T;
}
