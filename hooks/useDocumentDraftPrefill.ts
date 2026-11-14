/**
 * AI draft prefill → document form.
 *
 * CONTRACT (shared with the AI engineer)
 * - A form receives `prefillData` = Partial<XxxData from types.ts> using the EXACT field names from types.ts,
 *   plus optional meta keys:
 *     __draftId  string   unique id of this draft (the draft is applied exactly once per id)
 *     __autoSave boolean  save automatically after applying (legacy `auto_submit: true` is also accepted)
 * - Legacy/generic names (date, description_html, items, vendor, ...) are still accepted as aliases (see
 *   components/forms/documentFields.ts) but only when the exact field is absent.
 * - Unknown keys and control keys (rawInput, ai_open_mode, document_metadata, auto_submit, ...) are dropped,
 *   so they are never saved inside the document. `deductInventory` and client signatures are never taken from AI.
 * - Values are coerced: numbers never NaN, dates local YYYY-MM-DD, enums matched case-insensitively,
 *   HTML converted to plain text for plain-text fields and sanitized for rich fields, line items get ids.
 * - Blank values never overwrite existing values. `signatureRequested: false` clears the signature.
 * - Estimate `estimateOptions` (the assistant's good / better / best draft, saved format of lib/estimateOptions.ts):
 *   opened like a saved estimate (unpackOptionsForEdit): option lines get their internal costs back from
 *   `estimateOptionsInternal` (never from the option lines themselves), lineItems mirror the option that counts. An AI
 *   draft never carries the client's choice or an applied option.
 */
import { useEffect, useRef, useState } from 'react';
import { FormType, type LineItem } from '../types.ts';
import { roundMoney } from '../utils/money.ts';
import { resolveTemplateId as resolveStyleDescription } from '../src/utils/aiTemplateUtils.ts';
import { isTemplateId, LEGACY_TEMPLATE_MAP, TEMPLATE_KEYWORDS, resolveTemplateId as resolveDesignId } from '../utils/templates/registry.ts';
import {
    clamp, hashValue, htmlToPlainText, looksLikeHtml, matchOption, normalizeDateValue, normalizeHexColor,
    normalizeImageUrl, normalizeLineItem, normalizeLineItems, normalizeLinkUrl, normalizeMaterialItems, plainTextToHtml,
    sanitizeEditorHtml, toBool, toNumberOrNull, toSingleLine,
} from '../components/forms/formUtils.ts';
import { getAliases, getFieldSpecs, RECURRENCE_FREQUENCIES, type FieldSpec } from '../components/forms/documentFields.ts';
import { isDraftConsumed as isStoredDraftConsumed, markDraftConsumed as markStoredDraftConsumed } from '../src/ai/draftStore.ts';
import {
    OPTION_DESCRIPTION_MAX, OPTION_MAX, OPTION_MIN, OPTION_NAME_MAX, defaultOptionName, readOptionSet, unpackOptionsForEdit, type OptionSet,
} from '../lib/estimateOptions.ts';

/** Meta / control keys that are never copied into document data. */
const CONTROL_KEYS = new Set([
    '__draftId', '__autoSave', 'auto_submit', 'ai_open_mode', 'start_page', 'rawInput', 'document_metadata',
    'isAiDrafted', 'isAiGenerated', 'jobId', 'job_id', 'template_style', 'templateDescription', 'primary_color',
    'secondary_color', 'signatureRequested', 'deductInventory', 'inventoryDeductedAt', 'showPaymentLink',
    'paymentLinkRequested', 'document_type', 'documentType', 'formType', 'missing_fields', 'partial_draft',
    'clientSignatureUrl', 'clientSignedAt', 'clientSignedBy', 'clientSignerName', 'public_token', 'id',
    'createdAt', 'created_at', 'viewedByProvider', '__lightweight', 'clientOptionChoice', 'estimateOptionsInternal',
]);

const VOLATILE_KEYS = new Set(['ai_open_mode', 'auto_submit', 'start_page', '__autoSave']);

export interface DraftMergeResult<T> {
    data: T;
    /** canonical (types.ts) keys that were written */
    appliedKeys: string[];
    /** keys present in the prefill that were not used (unknown, invalid or blank) */
    ignoredKeys: string[];
    autoSave: boolean;
    draftKey: string | null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

const isBlankValue = (v: unknown) =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Stable identity of a draft: its __draftId, or a hash of its content. Null when there is nothing to apply. */
export const getDraftKey = (formType: FormType, prefill: unknown): string | null => {
    if (!isPlainObject(prefill)) return null;
    const id = prefill.__draftId;
    if (typeof id === 'string' && id.trim()) return `id:${id.trim()}`;
    const content: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(prefill)) if (!VOLATILE_KEYS.has(k)) content[k] = v;
    if (Object.keys(content).length === 0) return null;
    return `h:${hashValue({ formType, content })}`;
};

export const isAutoSaveDraft = (prefill: unknown): boolean =>
    isPlainObject(prefill) && (prefill.__autoSave === true || prefill.auto_submit === true);

/**
 * The assistant's options (Estimate): 2–4 options with lines, Recommended kept when valid. Lines keep only what the
 * client may see (id, description, quantity, rate, unit, a price-book kit's parts); internal costs come separately
 * (estimateOptionsInternal).
 * The client's choice and an applied option are never taken from an AI draft.
 */
const coerceOptionSet = (value: unknown): OptionSet | undefined => {
    const set = readOptionSet({ estimateOptions: value });
    if (!set) return undefined;
    const usedIds = new Set<string>();
    const clean = (lines: LineItem[]): LineItem[] => lines.map(li => {
        const r = li as unknown as Record<string, unknown>;
        const pick = (keys: string[]) => keys.map(k => r[k]).find(v => v !== undefined && v !== null && v !== '');
        const row: Record<string, unknown> = {
            id: r.id,
            description: pick(['description', 'name', 'item', 'title']),
            quantity: pick(['quantity', 'qty']),
            rate: pick(['rate', 'price', 'unitPrice', 'unit_price', 'amount']),
        };
        if (typeof r.unit === 'string') row.unit = r.unit;
        // a price-book kit the assistant put on an option (src/ai/priceBookContext.ts): its parts, as when picked by hand
        if (r.isAssembly === true && Array.isArray(r.assemblyComponents)) {
            row.isAssembly = true;
            row.assemblyComponents = r.assemblyComponents;
            if (typeof r.hideComponentsOnPdf === 'boolean') row.hideComponentsOnPdf = r.hideComponentsOnPdf;
        }
        return normalizeLineItem(row, usedIds);
    }).filter((x): x is LineItem => Boolean(x && x.description));
    const options = set.options
        .map((o, i) => ({ id: o.id, name: toSingleLine(o.name).slice(0, OPTION_NAME_MAX) || defaultOptionName(i), ...(toSingleLine(o.description ?? '') ? { description: toSingleLine(o.description ?? '').slice(0, OPTION_DESCRIPTION_MAX) } : {}), lineItems: clean(o.lineItems) }))
        .filter(o => o.lineItems.length)
        .slice(0, OPTION_MAX);
    if (options.length < OPTION_MIN) return undefined;
    return {
        version: 1,
        kind: 'estimate',
        options,
        sharedLineItems: clean(set.sharedLineItems),
        ...(options.some(o => o.id === set.recommendedId) ? { recommendedId: set.recommendedId } : {}),
    };
};

/**
 * { [lineId]: { unitCost } } from an AI draft: only non-negative numeric costs, plus itemSource 'pricebook' on a line
 * the assistant took from the user's price book (src/ai/priceBookContext.ts; the same mark as a line picked by hand).
 */
const coerceOptionCosts = (value: unknown): Record<string, Record<string, unknown>> => {
    const out: Record<string, Record<string, unknown>> = {};
    if (!isPlainObject(value)) return out;
    for (const [id, v] of Object.entries(value)) {
        const cost = isPlainObject(v) ? toNumberOrNull(v.unitCost ?? v.unit_cost) : null;
        const entry: Record<string, unknown> = {};
        if (cost !== null && cost >= 0) entry.unitCost = roundMoney(cost);
        if (isPlainObject(v) && v.itemSource === 'pricebook') entry.itemSource = 'pricebook';
        if (id && Object.keys(entry).length) out[id] = entry;
    }
    return out;
};

const coerceTags = (v: unknown): string[] | null => {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
    if (!list) return null;
    const tags = list.map(t => toSingleLine(t)).filter(Boolean);
    return tags.length ? Array.from(new Set(tags)) : null;
};

/** Coerces one value for a field. Returns undefined when the value is unusable. */
const coerceField = (spec: FieldSpec, value: unknown, prev: Record<string, unknown>, key: string): unknown => {
    switch (spec.kind) {
        case 'text': {
            if (typeof value === 'number' && Number.isFinite(value)) return String(value);
            if (typeof value !== 'string') return undefined;
            const s = toSingleLine(value);
            return s || undefined;
        }
        case 'multiline': {
            if (typeof value !== 'string') return undefined;
            const s = htmlToPlainText(value);
            return s || undefined;
        }
        case 'rich': {
            if (typeof value !== 'string' || !value.trim()) return undefined;
            const html = looksLikeHtml(value) ? sanitizeEditorHtml(value) : plainTextToHtml(value.trim());
            return html.trim() || undefined;
        }
        case 'number': {
            const n = toNumberOrNull(value);
            return n === null ? undefined : Math.round(Math.max(0, n) * 100) / 100;
        }
        case 'money': {
            const n = toNumberOrNull(value);
            return n === null ? undefined : roundMoney(Math.max(0, n));
        }
        case 'percent': {
            const n = toNumberOrNull(value);
            return n === null ? undefined : clamp(Math.round(n * 1000) / 1000, 0, 100);
        }
        case 'date':
            return normalizeDateValue(value) ?? undefined;
        case 'bool': {
            const b = toBool(value);
            return b === null ? undefined : b;
        }
        case 'enum':
            return matchOption(value, spec.options || []) ?? undefined;
        case 'lineItems': {
            const items = normalizeLineItems(value);
            return items.length ? items : undefined;
        }
        case 'materialItems': {
            const items = normalizeMaterialItems(value);
            return items.length ? items : undefined;
        }
        case 'colors': {
            if (!isPlainObject(value)) return undefined;
            const primary = normalizeHexColor(value.primary);
            if (!primary) return undefined;
            const prevColors = isPlainObject(prev[key]) ? (prev[key] as Record<string, unknown>) : {};
            const secondary = normalizeHexColor(value.secondary) || normalizeHexColor(prevColors.secondary) || '#666666';
            return { primary, secondary };
        }
        case 'url':
            return normalizeLinkUrl(value) ?? undefined;
        case 'image':
            return normalizeImageUrl(value) ?? undefined;
        case 'template': {
            // current design ids, legacy ids and single style keywords map through the template registry;
            // free-text descriptions ("modern clean, premium") go through the AI style resolver first
            if (typeof value !== 'string' || !value.trim()) return undefined;
            const raw = value.trim();
            const lower = raw.toLowerCase();
            if (isTemplateId(raw) || isTemplateId(lower) || LEGACY_TEMPLATE_MAP[lower] || TEMPLATE_KEYWORDS[lower]) return resolveDesignId(raw);
            const legacy = resolveStyleDescription(raw);
            return legacy && legacy !== 'standard' ? resolveDesignId(legacy) : undefined;
        }
        case 'visual':
            return isPlainObject(value) && Object.keys(value).length ? value : undefined;
        case 'tags':
            return coerceTags(value) ?? undefined;
        case 'estimateOptions':
            return coerceOptionSet(value);
        case 'recurrence': {
            if (!isPlainObject(value)) return undefined;
            const prevRec = isPlainObject(prev[key]) ? (prev[key] as Record<string, unknown>) : {};
            const enabled = toBool(value.enabled);
            const frequency = matchOption(value.frequency, RECURRENCE_FREQUENCIES);
            const nextRunDate = normalizeDateValue(value.nextRunDate);
            if (enabled === null && !frequency && !nextRunDate) return undefined;
            return {
                ...prevRec,
                enabled: enabled ?? Boolean(prevRec.enabled),
                frequency: frequency || (prevRec.frequency as string) || 'Monthly',
                ...(nextRunDate ? { nextRunDate } : {}),
            };
        }
        default:
            return undefined;
    }
};

/**
 * Pure merge of an AI draft into form data. `prev` is never mutated.
 * Field-by-field: only known fields of this document type are written, blank values never overwrite.
 */
export function mergeDraftIntoForm<T extends object>(formType: FormType, prev: T, prefill: unknown): DraftMergeResult<T> {
    const draftKey = getDraftKey(formType, prefill);
    if (!isPlainObject(prefill)) return { data: prev, appliedKeys: [], ignoredKeys: [], autoSave: false, draftKey };

    const specs = getFieldSpecs(formType);
    const aliases = getAliases(formType);
    const prevRecord = prev as unknown as Record<string, unknown>;

    // 1) canonical values: exact names first, then aliases (only when the exact name is absent/blank)
    const canonical: Record<string, unknown> = {};
    const sourceOf: Record<string, string> = {};
    const used = new Set<string>();
    const take = (target: string, source: string, value: unknown) => {
        canonical[target] = value;
        sourceOf[target] = source;
        used.add(source);
    };
    for (const [key, value] of Object.entries(prefill)) {
        if (specs[key] && !isBlankValue(value)) take(key, key, value);
    }
    for (const [key, value] of Object.entries(prefill)) {
        if (specs[key] || CONTROL_KEYS.has(key)) continue;
        const target = aliases[key];
        if (target && specs[target] && !(target in canonical) && !isBlankValue(value)) take(target, key, value);
    }
    // template style descriptions and flat colours
    if (specs.templateId && !('templateId' in canonical)) {
        const styleKey = typeof prefill.template_style === 'string' ? 'template_style' : 'templateDescription';
        const style = prefill[styleKey];
        if (typeof style === 'string' && style.trim()) take('templateId', styleKey, style);
    }
    if (specs.themeColors && !('themeColors' in canonical) && prefill.primary_color) {
        take('themeColors', 'primary_color', { primary: prefill.primary_color, secondary: prefill.secondary_color });
    }

    // 2) coerce + write
    const updates: Record<string, unknown> = {};
    const appliedKeys: string[] = [];
    for (const [key, value] of Object.entries(canonical)) {
        const coerced = coerceField(specs[key], value, prevRecord, key);
        if (coerced === undefined) { used.delete(sourceOf[key]); continue; }
        updates[key] = coerced;
        appliedKeys.push(key);
    }

    // 3) special cases
    if (specs.signatureUrl && !('signatureUrl' in updates)) {
        const requested = toBool(prefill.signatureRequested);
        if (requested === false) { updates.signatureUrl = ''; appliedKeys.push('signatureUrl'); used.add('signatureRequested'); }
    }
    if (updates.estimateOptions) {
        // opened like a saved options estimate: internal costs back on the lines, lineItems = the option that counts
        const opened = unpackOptionsForEdit(
            { ...prevRecord, ...updates, estimateOptionsInternal: coerceOptionCosts(prefill.estimateOptionsInternal) },
            lines => normalizeLineItems(lines),
        ) as Record<string, unknown>;
        updates.estimateOptions = opened.estimateOptions;
        updates.lineItems = opened.lineItems;
        if (!appliedKeys.includes('lineItems')) appliedKeys.push('lineItems');
    }
    if (formType === FormType.ExpenseLog && !('lineItems' in updates) && typeof prefill.item === 'string' && prefill.item.trim()) {
        const amount = (updates.amount as number | undefined) ?? 0;
        const tax = (updates.tax as number | undefined) ?? 0;
        updates.lineItems = normalizeLineItems([{ description: prefill.item, quantity: 1, rate: Math.max(0, roundMoney(amount - tax)) }]);
        appliedKeys.push('lineItems');
        used.add('item');
    }

    const ignoredKeys = Object.keys(prefill).filter(k => !used.has(k) && !CONTROL_KEYS.has(k));
    const data = (appliedKeys.length ? { ...prev, ...updates, isAiGenerated: true } : prev) as T;
    return { data, appliedKeys, ignoredKeys, autoSave: isAutoSaveDraft(prefill), draftKey };
}

// ---------------------------------------------------------------------------
// "consumed" drafts survive remounts (Back button, refresh) so an auto-save never runs twice.
// Shared with the AI layer (src/ai/draftStore.ts, cleared on logout); keyed by the raw __draftId.
// ---------------------------------------------------------------------------
const storeId = (draftKey: string | null | undefined) => (draftKey ? draftKey.replace(/^id:/, '') : null);

export const isDraftConsumed = (draftKey: string | null | undefined): boolean => isStoredDraftConsumed(storeId(draftKey));

export const markDraftConsumed = (draftKey: string | null | undefined): void => markStoredDraftConsumed(storeId(draftKey));

// ---------------------------------------------------------------------------
// hook
// ---------------------------------------------------------------------------
export interface DraftPrefillState {
    /** key of the draft currently applied to the form (null when none) */
    draftKey: string | null;
    appliedKeys: string[];
    /** the draft asked to be saved automatically and has not been saved before */
    autoSave: boolean;
    /** this draft was already saved earlier in this tab (e.g. user pressed Back after an auto-save) */
    alreadySaved: boolean;
    /** increments every time a new draft is applied */
    version: number;
}

export interface UseDocumentDraftPrefillParams<T extends object> {
    formType: FormType;
    prefillData: unknown;
    /** current form data (read when the draft is applied) */
    getData: () => T;
    /** replaces the form data */
    setData: (next: T) => void;
    /** fresh defaults; used as the base when a SECOND, different draft arrives in the same mounted form */
    makeBase: () => T;
}

/**
 * Applies a draft exactly once per draft key. Re-renders and new `prefillData` objects with the same
 * content never re-apply it; a different draft starts from fresh defaults so nothing leaks between drafts.
 */
export function useDocumentDraftPrefill<T extends object>({
    formType, prefillData, getData, setData, makeBase,
}: UseDocumentDraftPrefillParams<T>): DraftPrefillState {
    const appliedRef = useRef<string | null>(null);
    const fnRef = useRef({ getData, setData, makeBase });
    fnRef.current = { getData, setData, makeBase };
    const [state, setState] = useState<DraftPrefillState>({ draftKey: null, appliedKeys: [], autoSave: false, alreadySaved: false, version: 0 });

    useEffect(() => {
        const key = getDraftKey(formType, prefillData);
        if (!key || appliedRef.current === key) return;
        const isFirstDraft = appliedRef.current === null;
        appliedRef.current = key;
        const base = isFirstDraft ? fnRef.current.getData() : fnRef.current.makeBase();
        const result = mergeDraftIntoForm(formType, base, prefillData);
        fnRef.current.setData(result.data);
        const consumed = isDraftConsumed(key);
        setState(s => ({
            draftKey: key,
            appliedKeys: result.appliedKeys,
            autoSave: result.autoSave && !consumed,
            alreadySaved: consumed,
            version: s.version + 1,
        }));
    }, [formType, prefillData]);

    return state;
}
