/**
 * Good / better / best options on estimates (competitor gap #6): the "option engine". Pure (no React, no network), so
 * the form, the PDF model, the client pages, job money and scripts/estimate-options-check.ts share ONE set of rules.
 *
 * Data (all inside documents.data, no table change):
 *   estimateOptions          OptionSet: 2–4 named options with their own lines, shared lines (in every option), the
 *                            Recommended one, a choice the contractor recorded, and the option applied with "Apply".
 *                            Its lines are stored CLIENT-SAFE (no unit cost / inventory links): the client pages get
 *                            this key as is (the database strips private fields only from the top-level lineItems).
 *   estimateOptionsInternal  { [lineId]: private line fields } of every option line (unit cost, inventory links…).
 *                            The key contains "internal", so the database never sends it to a client page.
 *   clientOptionChoice       the client's pick, written by the database when the client signs with an option
 *                            (supabase/migrations/20261114000100_estimate_options_choice.sql, NOT applied yet). Until that SQL is applied
 *                            the client pages put the pick in the signer's name instead: "Jane Doe (chose B: Better)".
 *   lineItems                always mirrors the effective option (its lines + the shared lines), so every older reader
 *                            of an estimate (emails, lists, stock, exports, the AI) keeps working unchanged.
 *
 * THE RULE (money of an options estimate everywhere: invoice-from-estimate, contract value, job costing budget,
 * pipeline, Insights): the applied option, else the client's choice (or the one the contractor recorded), else the
 * Recommended option, else the option with the lowest total (the first one on a tie).
 *
 * Reuse for selections & allowances (#19, not built): an OptionSet is a generic "pick one of 2–4 priced alternatives"
 * group. #19 will attach OptionSets with kind 'selection' to allowance lines; the totals, choice, payload and storage
 * helpers below take the set as an argument for that reason.
 */
import type { LineItem } from '../types.ts';
import { computeDocumentTotals, roundMoney, toNumber, type DocumentTotals, type MoneyLineItem } from '../utils/money.ts';
import { newId } from '../components/forms/formUtils.ts';

export const OPTION_MIN = 2;
export const OPTION_MAX = 4;
export const DEFAULT_OPTION_NAMES = ['Good', 'Better', 'Best', 'Premium'] as const;
export const OPTION_NAME_MAX = 40;
export const OPTION_DESCRIPTION_MAX = 240;
/** the database cleans signer names to 200 characters */
export const SIGNER_NAME_MAX = 200;

export interface DocOption {
    id: string;
    name: string;
    /** short description shown under the name (what is different in this option) */
    description?: string;
    lineItems: LineItem[];
}

export interface OptionChoice {
    optionId: string;
    /** name of the option when it was chosen (kept if the option is renamed later) */
    optionName?: string;
    by: 'client' | 'contractor';
    /** ISO timestamp */
    at?: string;
    /** who chose (the client's signer name) */
    name?: string;
}

export interface OptionSet {
    version: 1;
    /** 'estimate' = good/better/best for the whole estimate (#6); 'selection' is reserved for allowances (#19) */
    kind: 'estimate';
    options: DocOption[];
    /** lines included in every option */
    sharedLineItems: LineItem[];
    recommendedId?: string;
    /** the client's pick recorded by the contractor ("Client chose this": phone, email, in person) */
    choice?: OptionChoice;
    /** "Apply chosen option": the estimate became this option (lineItems = its lines + shared lines) */
    appliedId?: string;
    appliedAt?: string;
}

/** Private line fields: never stored inside estimateOptions (same list as public._client_safe_doc_data). */
export const PRIVATE_LINE_KEYS = [
    'unitCost', 'unit_cost', 'currentStock', 'inventoryItemId', 'item_id', 'track_inventory', 'itemSource', 'costPrice',
    'cost_price', 'markup', 'supplier',
] as const;
const PRIVATE_KEY_RE = /(internal|private|profit|margin|markup|unitcost|costprice)/i;
const isPrivateKey = (k: string) => (PRIVATE_LINE_KEYS as readonly string[]).includes(k) || PRIVATE_KEY_RE.test(k);

/** JSON paths a light (JSON-path) select needs so the rule above works without the full document. */
export const OPTION_SELECT_PATHS = [
    'estimateOptions:data->estimateOptions',
    'clientOptionChoice:data->clientOptionChoice',
    'clientSignedBy:data->>clientSignedBy',
] as const;

// ---------------------------------------------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------------------------------------------
type Rec = Record<string, any>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim());
const jsonish = (v: unknown): unknown => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
};
const linesOf = (v: unknown): LineItem[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') as LineItem[] : []);

export const optionLetter = (index: number): string => String.fromCharCode(65 + Math.max(0, Math.min(25, index)));
export const defaultOptionName = (index: number): string => DEFAULT_OPTION_NAMES[index] || `Option ${optionLetter(index)}`;
/** The name to show: as typed, trimmed; "Good" / "Better" / … when it is empty. */
export const optionName = (option: { name?: string } | null | undefined, index: number): string => str(option?.name) || defaultOptionName(index);

/** Signed online (the same test as components/forms/signedLock.ts isClientSigned). */
const isSigned = (d: Rec) => Boolean(str(d.clientSignatureUrl) || str(d.clientSignedAt));

// ---------------------------------------------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------------------------------------------
/** The option set of a document (JSON string from a select accepted), or null when it has fewer than 2 options. */
export const readOptionSet = (d: unknown): OptionSet | null => {
    const raw = rec(jsonish(rec(d).estimateOptions));
    const list = Array.isArray(raw.options) ? raw.options : [];
    const seen = new Set<string>();
    const options: DocOption[] = [];
    for (const o of list) {
        const r = rec(o);
        const id = str(r.id);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        options.push({
            id,
            // kept as typed (spaces, empty while retyping); trimmed when saved (packOptionsForSave), shown with optionName()
            name: typeof r.name === 'string' ? r.name.slice(0, OPTION_NAME_MAX) : str(r.name),
            ...(typeof r.description === 'string' && r.description !== '' ? { description: r.description.slice(0, OPTION_DESCRIPTION_MAX) } : {}),
            lineItems: linesOf(r.lineItems),
        });
    }
    if (options.length < OPTION_MIN) return null;
    const ids = new Set(options.map(o => o.id));
    const choice = rec(raw.choice);
    return {
        version: 1,
        kind: 'estimate',
        options,
        sharedLineItems: linesOf(raw.sharedLineItems),
        ...(ids.has(str(raw.recommendedId)) ? { recommendedId: str(raw.recommendedId) } : {}),
        ...(ids.has(str(choice.optionId)) ? { choice: normalizeChoice(choice) } : {}),
        ...(ids.has(str(raw.appliedId)) ? { appliedId: str(raw.appliedId), ...(str(raw.appliedAt) ? { appliedAt: str(raw.appliedAt) } : {}) } : {}),
    };
};

const normalizeChoice = (c: Rec): OptionChoice => ({
    optionId: str(c.optionId),
    ...(str(c.optionName) ? { optionName: str(c.optionName) } : {}),
    by: c.by === 'client' ? 'client' : 'contractor',
    ...(str(c.at) ? { at: str(c.at) } : {}),
    ...(str(c.name) ? { name: str(c.name) } : {}),
});

/** Options are shown and priced separately (an applied estimate is a normal one-total estimate again). */
export const optionsActive = (d: unknown): boolean => {
    const set = readOptionSet(d);
    return !!set && !set.appliedId;
};

/** private fields per line id (estimateOptionsInternal) */
const internalOf = (d: unknown): Record<string, Rec> => {
    const raw = rec(jsonish(rec(d).estimateOptionsInternal));
    const out: Record<string, Rec> = {};
    for (const [k, v] of Object.entries(raw)) if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v as Rec;
    return out;
};

const withInternal = (lines: LineItem[], internal: Record<string, Rec>): LineItem[] =>
    lines.map(li => {
        const extra = internal[str((li as Rec).id)];
        return extra ? ({ ...extra, ...li } as LineItem) : li;
    });

export const findOption = (set: OptionSet | null | undefined, id: unknown): DocOption | null =>
    (set && set.options.find(o => o.id === str(id))) || null;

/** An option's lines followed by the shared lines (what the client gets with that option). */
export const optionLines = (set: OptionSet, optionId: string, internal: Record<string, Rec> = {}): LineItem[] => {
    const opt = findOption(set, optionId);
    return withInternal([...(opt ? opt.lineItems : []), ...set.sharedLineItems], internal);
};

/** Totals of one option: its lines + shared lines, with the estimate's tax rate and (flat) discount. */
export const optionTotals = (d: unknown, set: OptionSet, optionId: string): DocumentTotals => {
    const r = rec(d);
    return computeDocumentTotals({ lineItems: optionLines(set, optionId) as MoneyLineItem[], taxRate: r.taxRate, discount: r.discount });
};

// ---------------------------------------------------------------------------------------------------------------
// the client's choice
// ---------------------------------------------------------------------------------------------------------------
const CHOICE_TAG_RE = /\s*\(chose ([A-Z]): ([^()]*)\)\s*$/;

/** "Jane Doe" + option B "Better" → "Jane Doe (chose B: Better)" (≤ 200 characters, the name is shortened first). */
export const signerNameWithChoice = (name: string, set: OptionSet, optionId: string): string => {
    const index = set.options.findIndex(o => o.id === optionId);
    const base = str(name).replace(CHOICE_TAG_RE, '');
    if (index < 0) return base.slice(0, SIGNER_NAME_MAX);
    const optName = optionName(set.options[index], index).replace(/[()]/g, '').slice(0, OPTION_NAME_MAX).trim();
    const tag = ` (chose ${optionLetter(index)}: ${optName})`;
    return `${base.slice(0, Math.max(2, SIGNER_NAME_MAX - tag.length)).trim()}${tag}`;
};

/** The pick written in a signer name, or null. */
export const parseSignerChoice = (signer: unknown): { letter: string; name: string; signer: string } | null => {
    const s = str(signer);
    const m = CHOICE_TAG_RE.exec(s);
    if (!m) return null;
    return { letter: m[1], name: m[2].trim(), signer: s.slice(0, m.index).trim() };
};

/** The signer's name without the "(chose …)" tag. */
export const plainSignerName = (signer: unknown): string => str(signer).replace(CHOICE_TAG_RE, '').trim();

/** Option matched by a signer tag: by name when exactly one option has it, else by letter. */
const optionFromTag = (set: OptionSet, tag: { letter: string; name: string }): DocOption | null => {
    const byName = set.options.filter((o, i) => optionName(o, i).replace(/[()]/g, '').trim().toLowerCase() === tag.name.toLowerCase());
    if (byName.length === 1) return byName[0];
    return set.options[tag.letter.charCodeAt(0) - 65] || null;
};

/**
 * The client's own pick (only on a signed estimate): what the database stored (clientOptionChoice, after the draft
 * SQL), else the pick in the signer's name (today).
 */
export const clientChoiceOf = (d: unknown, set: OptionSet | null = readOptionSet(d)): OptionChoice | null => {
    const r = rec(d);
    if (!set || !isSigned(r)) return null;
    const stored = rec(jsonish(r.clientOptionChoice));
    const storedOpt = findOption(set, stored.optionId);
    if (storedOpt) return { ...normalizeChoice(stored), by: 'client', optionName: str(stored.optionName) || optionName(storedOpt, set.options.indexOf(storedOpt)) };
    const tag = parseSignerChoice(r.clientSignedBy);
    const tagged = tag ? optionFromTag(set, tag) : null;
    if (tagged) return { optionId: tagged.id, optionName: tag!.name || tagged.name, by: 'client', ...(str(r.clientSignedAt) ? { at: str(r.clientSignedAt) } : {}), ...(tag!.signer ? { name: tag!.signer } : {}) };
    return null;
};

/** The pick that counts: the client's (signed) pick, else the one the contractor recorded. */
export const choiceOf = (d: unknown, set: OptionSet | null = readOptionSet(d)): OptionChoice | null =>
    clientChoiceOf(d, set) || (set?.choice && findOption(set, set.choice.optionId) ? set.choice : null);

/** Option with the lowest total (first on a tie). */
export const lowestOptionId = (d: unknown, set: OptionSet): string => {
    let best = set.options[0].id;
    let bestTotal = Infinity;
    for (const o of set.options) {
        const t = optionTotals(d, set, o.id).total;
        if (t < bestTotal - 0.0001) { best = o.id; bestTotal = t; }
    }
    return best;
};

export type EffectiveReason = 'applied' | 'chosen' | 'recommended' | 'lowest';

/** THE RULE: applied → chosen → Recommended → lowest total. */
export const effectiveOption = (d: unknown, set: OptionSet | null = readOptionSet(d)): { id: string; reason: EffectiveReason } | null => {
    if (!set) return null;
    if (set.appliedId && findOption(set, set.appliedId)) return { id: set.appliedId, reason: 'applied' };
    const choice = choiceOf(d, set);
    if (choice) return { id: choice.optionId, reason: 'chosen' };
    if (set.recommendedId && findOption(set, set.recommendedId)) return { id: set.recommendedId, reason: 'recommended' };
    return { id: lowestOptionId(d, set), reason: 'lowest' };
};

/**
 * Lines the money of this estimate comes from. For an estimate with active options: the effective option's lines +
 * shared lines (private fields restored); otherwise (no options, or applied) its own lineItems, untouched.
 */
export const effectiveEstimateLines = (d: unknown): LineItem[] => {
    const r = rec(d);
    const raw = jsonish(r.lineItems);
    const own = linesOf(raw);
    const set = readOptionSet(r);
    if (!set || set.appliedId) return own;
    const eff = effectiveOption(r, set)!;
    return optionLines(set, eff.id, internalOf(r));
};

/** The same document with lineItems = effective lines (the object is returned as is when nothing changes). */
export const withEffectiveLines = <T,>(d: T): T => {
    const r = rec(d);
    if (!r.estimateOptions) return d;
    const set = readOptionSet(r);
    if (!set || set.appliedId) return d;
    return { ...(d as any), lineItems: effectiveEstimateLines(r) };
};

/** Every option with its totals and flags (form, PDF, client pages). */
export interface OptionSummary {
    option: DocOption;
    index: number;
    letter: string;
    totals: DocumentTotals;
    recommended: boolean;
    chosen: boolean;
    effective: boolean;
}

export const summarizeOptions = (d: unknown, set: OptionSet | null = readOptionSet(d)): OptionSummary[] => {
    if (!set) return [];
    const eff = effectiveOption(d, set);
    const choice = choiceOf(d, set);
    return set.options.map((option, index) => ({
        option,
        index,
        letter: optionLetter(index),
        totals: optionTotals(d, set, option.id),
        recommended: set.recommendedId === option.id,
        chosen: choice?.optionId === option.id,
        effective: eff?.id === option.id,
    }));
};

/** "3 options, $9,800.00–$18,400.00" style facts for lists and emails. */
export const optionRange = (d: unknown): { count: number; min: number; max: number } | null => {
    const set = readOptionSet(d);
    if (!set || set.appliedId) return null;
    const totals = set.options.map(o => optionTotals(d, set, o.id).total);
    return { count: totals.length, min: roundMoney(Math.min(...totals)), max: roundMoney(Math.max(...totals)) };
};

// ---------------------------------------------------------------------------------------------------------------
// storage (form ⇄ database)
// ---------------------------------------------------------------------------------------------------------------
const splitLine = (li: LineItem): { safe: LineItem; priv: Rec | null } => {
    const safe: Rec = {};
    const priv: Rec = {};
    for (const [k, v] of Object.entries(li as Rec)) {
        if (v === undefined) continue;
        if (isPrivateKey(k)) priv[k] = v; else safe[k] = v;
    }
    return { safe: safe as LineItem, priv: Object.keys(priv).length ? priv : null };
};

/**
 * What is saved: option lines without private fields (moved to estimateOptionsInternal) and lineItems mirroring the
 * effective option. A document without options is returned unchanged (same object).
 */
export const packOptionsForSave = <T extends Rec>(d: T): T => {
    if (!d || !d.estimateOptions) return d;
    const set = readOptionSet(d);
    if (!set) {
        // fewer than two options left: a normal estimate again
        const { estimateOptions: _o, estimateOptionsInternal: _i, ...rest } = d as Rec;
        return rest as T;
    }
    const internal: Record<string, Rec> = {};
    const clean = (lines: LineItem[]) => lines.map(li => {
        const { safe, priv } = splitLine(li);
        if (priv && str((li as Rec).id)) internal[str((li as Rec).id)] = priv;
        return safe;
    });
    const stored: OptionSet = {
        ...set,
        options: set.options.map((o, i) => {
            const { description: _d, ...rest } = o;
            return { ...rest, name: optionName(o, i), ...(str(o.description) ? { description: str(o.description) } : {}), lineItems: clean(o.lineItems) };
        }),
        sharedLineItems: clean(set.sharedLineItems),
    };
    const next: Rec = { ...d, estimateOptions: stored, estimateOptionsInternal: internal };
    if (!set.appliedId) next.lineItems = optionLines(stored, effectiveOption(next, stored)!.id, internal);
    return next as T;
};

/** What the form edits: option lines with their private fields back, lineItems synced to the effective option. */
export const unpackOptionsForEdit = <T extends Rec>(d: T, normalize: (lines: unknown) => LineItem[] = linesOf): T => {
    if (!d || !d.estimateOptions) return d;
    const set = readOptionSet(d);
    if (!set) return d;
    const internal = internalOf(d);
    const open: OptionSet = {
        ...set,
        options: set.options.map(o => ({ ...o, lineItems: normalize(withInternal(o.lineItems, internal)) })),
        sharedLineItems: normalize(withInternal(set.sharedLineItems, internal)),
    };
    const { estimateOptionsInternal: _i, ...rest } = d as Rec;
    const next: Rec = { ...rest, estimateOptions: open };
    if (!open.appliedId) next.lineItems = optionLines(open, effectiveOption(next, open)!.id);
    return next as T;
};

/** In the form: lineItems follow the options after every option edit. */
export const syncMirror = <T extends Rec>(d: T): T => {
    const set = readOptionSet(d);
    if (!set || set.appliedId) return d;
    return { ...d, lineItems: optionLines(set, effectiveOption(d, set)!.id) };
};

// ---------------------------------------------------------------------------------------------------------------
// editing
// ---------------------------------------------------------------------------------------------------------------
/** Copies of lines with new ids (an id is never shared by two options). */
export const copyLines = (lines: LineItem[]): LineItem[] => lines.map(li => ({ ...li, id: newId() }));

/**
 * Turns options on: every option starts with a copy of the current lines (named Good / Better / Best), Better is
 * Recommended. The current lines stay as they are until an option changes.
 */
export const createOptionSet = (lines: LineItem[], count = 3): OptionSet => {
    const n = Math.max(OPTION_MIN, Math.min(OPTION_MAX, count));
    const meaningful = lines.filter(li => str(li.description) || toNumber(li.rate));
    const options: DocOption[] = Array.from({ length: n }, (_, i) => ({
        id: `opt-${newId()}`,
        name: defaultOptionName(i),
        lineItems: copyLines(meaningful.length ? meaningful : [{ id: '', description: '', quantity: 1, rate: 0 }]),
    }));
    return { version: 1, kind: 'estimate', options, sharedLineItems: [], recommendedId: options[Math.min(1, n - 1)].id };
};

export const addOption = (set: OptionSet, startFromId?: string): OptionSet => {
    if (set.options.length >= OPTION_MAX) return set;
    const from = findOption(set, startFromId);
    const index = set.options.length;
    const usedNames = new Set(set.options.map(o => o.name.toLowerCase()));
    let name = defaultOptionName(index);
    for (let i = 0; usedNames.has(name.toLowerCase()) && i < 26; i++) name = `Option ${optionLetter(index + i)}`;
    return {
        ...set,
        options: [...set.options, { id: `opt-${newId()}`, name, lineItems: from ? copyLines(from.lineItems) : [{ id: newId(), description: '', quantity: 1, rate: 0 }] }],
    };
};

export const removeOption = (set: OptionSet, id: string): OptionSet => {
    if (set.options.length <= OPTION_MIN || !findOption(set, id)) return set;
    const options = set.options.filter(o => o.id !== id);
    const next: OptionSet = { ...set, options };
    if (next.recommendedId === id) delete next.recommendedId;
    if (next.choice?.optionId === id) delete next.choice;
    if (next.appliedId === id) { delete next.appliedId; delete next.appliedAt; }
    return next;
};

export const updateOption = (set: OptionSet, id: string, patch: Partial<Omit<DocOption, 'id'>>): OptionSet => ({
    ...set,
    options: set.options.map(o => (o.id === id ? {
        ...o,
        ...patch,
        ...(patch.name !== undefined ? { name: patch.name.slice(0, OPTION_NAME_MAX) } : {}),
        ...(patch.description !== undefined ? { description: patch.description.slice(0, OPTION_DESCRIPTION_MAX) } : {}),
    } : o)),
});

/** "Start from option X": replace (or append to) an option's lines with copies of X's lines. */
export const copyOptionLines = (set: OptionSet, fromId: string, toId: string, mode: 'replace' | 'append' = 'replace'): OptionSet => {
    const from = findOption(set, fromId);
    const to = findOption(set, toId);
    if (!from || !to || from.id === to.id) return set;
    const copies = copyLines(from.lineItems);
    return updateOption(set, toId, { lineItems: mode === 'replace' ? copies : [...to.lineItems, ...copies] });
};

/** Copies one line into other options (or into the shared lines with 'shared'). */
export const copyLineTo = (set: OptionSet, line: LineItem, targetIds: string[]): OptionSet => {
    let next = set;
    for (const id of targetIds) {
        if (id === 'shared') next = { ...next, sharedLineItems: [...next.sharedLineItems, { ...line, id: newId() }] };
        else if (findOption(next, id)) next = updateOption(next, id, { lineItems: [...findOption(next, id)!.lineItems, { ...line, id: newId() }] });
    }
    return next;
};

export const setRecommended = (set: OptionSet, id: string | null): OptionSet => {
    const next = { ...set };
    if (id && findOption(set, id)) next.recommendedId = id; else delete next.recommendedId;
    return next;
};

/** The contractor records the client's pick (phone, email, in person); null clears it. */
export const recordContractorChoice = (set: OptionSet, id: string | null, at = new Date().toISOString()): OptionSet => {
    const next = { ...set };
    const opt = findOption(set, id);
    if (opt) next.choice = { optionId: opt.id, optionName: optionName(opt, set.options.indexOf(opt)), by: 'contractor', at }; else delete next.choice;
    return next;
};

/**
 * "Apply chosen option": the estimate becomes the chosen option (lineItems = its lines + shared lines, private fields
 * kept); the options stay in the document as the record of what was offered. Null when nothing is chosen.
 */
export const applyChosenOption = <T extends Rec>(d: T, at = new Date().toISOString()): T | null => {
    const set = readOptionSet(d);
    if (!set || set.appliedId) return null;
    const choice = choiceOf(d, set);
    if (!choice) return null;
    const lines = optionLines(set, choice.optionId, internalOf(d));
    return { ...d, lineItems: lines.map(li => ({ ...li })), estimateOptions: { ...set, appliedId: choice.optionId, appliedAt: at } };
};

/** Back to options, allowed while the lines are still exactly the applied option's lines (nothing edited since). */
export const canUndoApply = (d: unknown): boolean => {
    const r = rec(d);
    const set = readOptionSet(r);
    if (!set?.appliedId) return false;
    const key = (lines: LineItem[]) => JSON.stringify(lines.map(li => [str(li.description), toNumber(li.quantity), toNumber(li.rate)]));
    return key(linesOf(r.lineItems)) === key(optionLines(set, set.appliedId));
};

export const undoApply = <T extends Rec>(d: T): T => {
    const set = readOptionSet(d);
    if (!set?.appliedId) return d;
    const { appliedId: _a, appliedAt: _at, ...rest } = set;
    return syncMirror({ ...d, estimateOptions: rest });
};

/**
 * Lines written into lineItems by something that doesn't know about options (the AI "Fill" on an estimate with
 * options): they become the lines of the option that counts; the shared lines stay. Unchanged lines: same object.
 */
export const adoptLineItemsIntoOption = <T extends Rec>(d: T, previousLines: unknown): T => {
    const set = readOptionSet(d);
    if (!set || set.appliedId) return d;
    const now = linesOf(d.lineItems);
    if (JSON.stringify(now) === JSON.stringify(linesOf(previousLines))) return d;
    const eff = effectiveOption(d, set)!;
    const sharedIds = new Set(set.sharedLineItems.map(li => str((li as Rec).id)));
    const own = now.filter(li => !sharedIds.has(str((li as Rec).id)));
    return syncMirror({ ...d, estimateOptions: updateOption(set, eff.id, { lineItems: own }) });
};

/** Turns options off: the estimate keeps the effective option's lines + shared lines. */
export const removeOptions = <T extends Rec>(d: T): T => {
    const lines = effectiveEstimateLines(d);
    const { estimateOptions: _o, estimateOptionsInternal: _i, ...rest } = d as Rec;
    return { ...rest, lineItems: lines.map(li => ({ ...li })) } as unknown as T;
};

/**
 * Options of a NEW revision / duplicate: same offer, no choice and nothing applied (the client chooses again).
 * Returns the keys to spread into the new document's data ({} without options).
 */
export const optionsForCopy = (d: unknown): Rec => {
    const r = rec(d);
    const set = readOptionSet(r);
    if (!set) return {};
    const { choice: _c, appliedId: _a, appliedAt: _at, ...fresh } = set;
    const internal = r.estimateOptionsInternal && typeof r.estimateOptionsInternal === 'object' ? { estimateOptionsInternal: JSON.parse(JSON.stringify(r.estimateOptionsInternal)) } : {};
    // an applied estimate is copied as the option it became: a normal estimate with its own lines
    if (set.appliedId) return {};
    return { estimateOptions: JSON.parse(JSON.stringify(fresh)), ...internal };
};

// ---------------------------------------------------------------------------------------------------------------
// client pages: the signing call
// ---------------------------------------------------------------------------------------------------------------
export interface ChoiceSigningPlan {
    /** new functions of the draft SQL (tried first) */
    rpc: { name: 'sign_document_option_via_portal' | 'approve_document_option_by_token'; args: Rec };
    /** existing functions (today): the pick goes in the signer's name */
    fallback: { name: 'sign_document_via_portal' | 'approve_document_by_token'; args: Rec; signerName: string };
}

/**
 * The call a client page makes to sign an options estimate with the chosen option: the draft-SQL function when the
 * database has it, else the existing signing function with the pick in the signer's name.
 */
export const planChoiceSigning = (
    target: { portalKey: string; documentId: string } | { token: string },
    set: OptionSet,
    optionId: string,
    signerName: string,
    signature: string,
): ChoiceSigningPlan => {
    const opt = findOption(set, optionId);
    if (!opt) throw new Error('Choose one of the options first.');
    const fallbackName = signerNameWithChoice(signerName, set, opt.id);
    if ('token' in target) {
        return {
            rpc: { name: 'approve_document_option_by_token', args: { doc_token: target.token, p_option_id: opt.id, p_signature: signature, p_signer_name: str(signerName) } },
            fallback: { name: 'approve_document_by_token', args: { doc_token: target.token, p_signature: signature }, signerName: fallbackName },
        };
    }
    return {
        rpc: { name: 'sign_document_option_via_portal', args: { p_key: target.portalKey, p_doc_id: target.documentId, p_option_id: opt.id, p_signature: signature, p_signer_name: str(signerName) } },
        fallback: { name: 'sign_document_via_portal', args: { p_key: target.portalKey, p_doc_id: target.documentId, p_signature: signature }, signerName: fallbackName },
    };
};
