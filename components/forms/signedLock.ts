/**
 * Signed estimates / change orders (QA 0b.1). Pure helpers (no React, no Supabase) shared by the forms and the QA script.
 *
 * Once the client signed (clientSignatureUrl / clientSignedAt, set by the approval link), what the client agreed to
 * (lines, money, terms) is locked: the form opens read-only, and a save that changes it is refused unless the
 * document goes back to Draft with the signature cleared ("Revise" → "Unlock this one"). "Revise" → "New revision"
 * copies it into a new Draft document instead, so the signed one stays as the record.
 */
import { computeDocumentTotals, countedLineItems, isExcludedOptionalLine, isOptionalLine, lineItemScheduledValue, roundMoney, toNumber } from '../../utils/money.ts';
import { computeMilestones, cumulativePercent, proposalSignedKey, readProposal } from '../../lib/proposal.ts';
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
    // an optional add-on (lib/proposal.ts) also locks its Optional / included state; other lines keep the old key
    const lineKey = (list: unknown[]) => list.map((li: any) => {
        const key: unknown[] = [s(li?.description), toNumber(li?.quantity), roundMoney(toNumber(li?.rate)), toNumber(li?.percentComplete)];
        if (isOptionalLine(li)) key.push(isExcludedOptionalLine(li) ? 'optional' : 'optional-included');
        return key;
    });
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
    // proposal scope / payment schedule / images are part of what the client signs (only when there are some)
    const proposal = kind === 'estimate' ? proposalSignedKey(r) : null;
    return kind === 'estimate'
        ? { ...base, notes: s(r.notes), ...offered, ...(proposal ? { proposal } : {}) }
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
            ...pick(r, ['notes', 'taxRate', 'discount', 'proposal']),
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
        // an estimate with options: the option that counts (applied / chosen / Recommended / lowest);
        // optional add-ons the client didn't take are left out, included ones become normal lines
        lineItems: invoiceLines(effectiveEstimateLines(r)),
        taxRate: toNumber(r.taxRate),
        discount: toNumber(r.discount),
        ...(deposit > 0 ? { amountPaid: deposit } : {}),
        status: 'Draft',
        isProgressBilling: false,
        ...(sourceId ? { sourceEstimateId: sourceId } : {}),
        ...(s(r.estimateNumber) ? { sourceEstimateNumber: s(r.estimateNumber) } : {}),
    };
};

/** Lines an invoice made from an estimate bills: unselected optional add-ons dropped, included ones made normal. */
const invoiceLines = (lines: unknown[]): Array<Record<string, any>> => {
    const counted = countedLineItems(lines as any[]);
    return copyLines(counted).map(li => {
        if (!isOptionalLine(li)) return li;
        const { optional: _o, selected: _s, ...rest } = li;
        return rest;
    });
};

/**
 * Invoice for ONE payment milestone of an estimate's schedule (lib/proposal.ts), built on the "Convert to invoice"
 * seed and the app's existing progress billing:
 *   - a deposit (first milestone, kind 'deposit'): one line for the exact milestone amount (tax already included,
 *     so no tax / discount on this invoice);
 *   - any other milestone: a PROGRESS BILLING invoice with the estimate's lines, % complete = the share billed once
 *     this milestone is paid, previously billed = the share of the earlier milestones (each line), and the
 *     discount spread the same way; the last milestone bills whatever is left.
 * Null when the schedule doesn't add up or the milestone doesn't exist.
 */
export const buildMilestoneInvoiceSeed = (est: unknown, sourceId: string | undefined, milestoneId: string): Record<string, unknown> | null => {
    const r = rec(est);
    const base = buildInvoiceSeedFromEstimate(est, sourceId);
    const lines = base.lineItems as Array<Record<string, any>>;
    const total = computeDocumentTotals({ ...r, lineItems: effectiveEstimateLines(r) as any[] }).total;
    const schedule = computeMilestones(readProposal(r).milestones, total);
    const index = schedule.rows.findIndex(m => m.id === milestoneId);
    if (schedule.error || index < 0 || !(total > 0)) return null;
    const m = schedule.rows[index];
    const of = s(r.estimateNumber) ? ` of estimate ${s(r.estimateNumber)}` : '';
    const tag = { proposalMilestone: { id: m.id, label: m.label, index: index + 1, count: schedule.rows.length, amount: m.amount } };
    if (index === 0 && m.kind === 'deposit') {
        return {
            ...base,
            ...tag,
            lineItems: [{ id: `ms-${m.id}`, description: `${m.label}: ${roundMoney(m.percent)}%${of}`, quantity: 1, rate: m.amount }],
            taxRate: 0,
            discount: 0,
        };
    }
    const before = cumulativePercent(schedule, index - 1);
    const after = cumulativePercent(schedule, index);
    const discount = roundMoney(toNumber(r.discount));
    const discountBefore = roundMoney(discount * before / 100);
    const discountNow = after >= 100 ? roundMoney(discount - discountBefore) : roundMoney(discount * after / 100 - discountBefore);
    return {
        ...base,
        ...tag,
        isProgressBilling: true,
        lineItems: lines.map(li => ({ ...li, percentComplete: after, previouslyBilled: roundMoney(lineItemScheduledValue(li) * before / 100) })),
        discount: Math.max(0, discountNow),
    };
};
