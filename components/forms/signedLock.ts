/**
 * Signed estimates / change orders (QA 0b.1). Pure helpers (no React, no Supabase) shared by the forms and the QA script.
 *
 * Once the client signed (clientSignatureUrl / clientSignedAt, set by the approval link), what the client agreed to
 * (lines, money, terms) is locked: the form opens read-only, and a save that changes it is refused unless the
 * document goes back to Draft with the signature cleared ("Revise" → "Unlock this one"). "Revise" → "New revision"
 * copies it into a new Draft document instead, so the signed one stays as the record.
 */
import { computeDocumentTotals, roundMoney, toNumber } from '../../utils/money.ts';
import { formatDate } from '../../utils/templates/format.ts';
import { addDaysISO } from './formUtils.ts';
import { effectiveEstimateLines, optionsForCopy, readOptionSet } from '../../lib/estimateOptions.ts';

export type SignableKind = 'estimate' | 'changeOrder';

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
const rec = (d: unknown): Record<string, any> => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, any>) : {});

/** Signature / decision keys written by the approval link (never typed in a form, never taken from AI). */
export const CLIENT_SIGNATURE_KEYS = ['clientSignatureUrl', 'clientSignedAt', 'clientSignerName', 'clientSignedBy'] as const;

/** True once the client signed online (a status typed by the contractor alone does not lock the document). */
export const isClientSigned = (d: unknown): boolean => {
    const r = rec(d);
    return Boolean(s(r.clientSignatureUrl) || s(r.clientSignedAt));
};

export const signerOf = (d: unknown): string => {
    const r = rec(d);
    return s(r.clientSignedBy) || s(r.clientSignerName) || s(r.clientName) || 'the client';
};

/** "Nov 13, 2026" (same format as the documents), '' when unknown. */
export const signedOnLabel = (d: unknown): string => {
    const at = s(rec(d).clientSignedAt);
    return at ? formatDate(at, { locale: 'en-US' }) : '';
};

export const docLabelOf = (kind: SignableKind) => (kind === 'estimate' ? 'estimate' : 'change order');

/** What the client agreed to: lines, money and terms (never internal costs, the status or the design). */
export const signedContent = (d: unknown, kind: SignableKind) => {
    const r = rec(d);
    // an estimate with good/better/best options: the option that counts (lib/estimateOptions.ts) + every option offered
    const items = kind === 'estimate' ? effectiveEstimateLines(r) : Array.isArray(r.lineItems) ? r.lineItems : [];
    const lineKey = (list: unknown[]) => list.map((li: any) => [s(li?.description), toNumber(li?.quantity), roundMoney(toNumber(li?.rate)), toNumber(li?.percentComplete)]);
    const lines = lineKey(items);
    const totals = computeDocumentTotals(kind === 'changeOrder' ? { lineItems: items } : { ...r, lineItems: items });
    const base = {
        lines,
        subtotal: totals.subtotal, discount: totals.discount, taxRate: totals.taxRate, tax: totals.tax, total: totals.total,
        terms: s(r.terms),
    };
    const set = kind === 'estimate' ? readOptionSet(r) : null;
    const offered = set
        ? { options: set.options.map(o => [s(o.name), s(o.description), lineKey(o.lineItems)]), shared: lineKey(set.sharedLineItems) }
        : {};
    return kind === 'estimate'
        ? { ...base, notes: s(r.notes), ...offered }
        : { ...base, currentContractSum: roundMoney(toNumber(r.currentContractSum)), description: s(r.description), reason: s(r.reason) };
};

/**
 * Save guard: refuses a save that changes what the client signed. Allowed: anything when the last saved version
 * was not signed, design/template changes of a signed one, and unlocking (signature cleared + status Draft).
 */
export const signedChangeProblem = (lastSaved: unknown, next: unknown, kind: SignableKind): string | null => {
    if (!isClientSigned(lastSaved)) return null;
    const label = docLabelOf(kind);
    if (!isClientSigned(next)) {
        return s(rec(next).status) === 'Draft'
            ? null
            : `The client’s signature can only be removed with “Revise”, which sets this ${label} back to Draft.`;
    }
    if (JSON.stringify(signedContent(lastSaved, kind)) === JSON.stringify(signedContent(next, kind))) return null;
    const on = signedOnLabel(lastSaved);
    return `This ${label} was signed by ${signerOf(lastSaved)}${on ? ` on ${on}` : ''}, so its lines, totals and terms can’t change. Use “Revise” to make a new version for the client to sign.`;
};

/**
 * Clears the client's signature (values set to '' rather than removed: the database keeps signature keys a save
 * leaves out, so a stale form can never erase a signature by accident) and goes back to Draft.
 */
export const unsignedPatch = (): Record<string, string> => ({
    clientSignatureUrl: '', clientSignedAt: '', clientSignerName: '', clientSignedBy: '', status: 'Draft',
});

/** "EST-2026-11-004" → "EST-2026-11-004-R2"; "…-R2" → "…-R3". */
export const revisionNumber = (number: unknown): string => {
    const n = s(number);
    if (!n) return '';
    const m = /^(.*?)-R(\d+)$/i.exec(n);
    return m ? `${m[1]}-R${Number(m[2]) + 1}` : `${n}-R2`;
};

const pick = (r: Record<string, any>, keys: readonly string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (r[k] !== undefined && r[k] !== null) out[k] = r[k];
    return out;
};

const copyLines = (raw: unknown) => (Array.isArray(raw) ? raw.map(li => ({ ...rec(li) })) : []);

const BRANDING_KEYS = ['companyName', 'companyAddress', 'companyPhone', 'companyWebsite', 'logoUrl', 'templateId', 'themeColors', 'fontFamily', 'paperSize'] as const;
const CLIENT_KEYS = ['clientId', 'clientName', 'clientAddress'] as const;

/**
 * Data of a NEW Draft revision of a signed estimate / change order: same content, revision number, today's date,
 * no client signature, linked with `revisionOf`.
 */
export const buildRevisionSeed = (d: unknown, kind: SignableKind, sourceId: string | undefined, today: string): Record<string, unknown> => {
    const r = rec(d);
    const common = {
        ...pick(r, BRANDING_KEYS), ...pick(r, CLIENT_KEYS),
        ...pick(r, ['title', 'terms', 'signatureUrl', 'ai_visual_data']),
        lineItems: copyLines(r.lineItems),
        status: 'Draft',
        ...(sourceId ? { revisionOf: sourceId } : {}),
    };
    if (kind === 'estimate') {
        const validDays = (() => {
            const a = Date.parse(s(r.issueDate)); const b = Date.parse(s(r.expiryDate));
            return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86_400_000) : 30;
        })();
        return {
            ...common,
            ...pick(r, ['notes', 'taxRate', 'discount']),
            // good/better/best options are offered again (no choice yet); an applied estimate stays its chosen option
            ...optionsForCopy(r),
            estimateNumber: revisionNumber(r.estimateNumber),
            issueDate: today,
            expiryDate: addDaysISO(validDays, today),
        };
    }
    return {
        ...common,
        ...pick(r, ['description', 'reason', 'currentContractSum']),
        changeOrderNumber: revisionNumber(r.changeOrderNumber),
        date: today,
    };
};

/**
 * Data of a NEW invoice made from an accepted estimate ("Convert to invoice"): client, lines (internal costs and
 * inventory links kept), tax, discount, a deposit already received, design and a link back to the estimate.
 * Number, dates and notes come from the invoice form's own defaults.
 */
export const buildInvoiceSeedFromEstimate = (est: unknown, sourceId: string | undefined, opts: { deposit?: number } = {}): Record<string, unknown> => {
    const r = rec(est);
    const deposit = roundMoney(Math.max(0, toNumber(opts.deposit)));
    return {
        ...pick(r, BRANDING_KEYS), ...pick(r, CLIENT_KEYS),
        ...(s(r.title) ? { title: s(r.title) } : {}),
        // an estimate with options: the option that counts (applied / chosen / Recommended / lowest)
        lineItems: copyLines(effectiveEstimateLines(r)),
        taxRate: toNumber(r.taxRate),
        discount: toNumber(r.discount),
        ...(deposit > 0 ? { amountPaid: deposit } : {}),
        status: 'Draft',
        isProgressBilling: false,
        ...(sourceId ? { sourceEstimateId: sourceId } : {}),
        ...(s(r.estimateNumber) ? { sourceEstimateNumber: s(r.estimateNumber) } : {}),
    };
};
