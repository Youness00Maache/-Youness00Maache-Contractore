/**
 * The user's price book and the AI assistant, browser side (server side: supabase/functions/ai-assistant/shared/priceBook.ts).
 *
 *  1. priceBookForRequest: for a DRAFTING request (estimate / invoice / change order, good / better / best options, or
 *     completing such a draft) the request carries a slice of the signed-in user's own saved items, ranked by keyword
 *     overlap with the message and by recent use, capped at 40 items and ~7 KB: id, name, sell price, unit, a short
 *     description and a kit's parts. Never the unit cost, markup or margin. Nothing for questions, other chat or an
 *     empty price book.
 *  2. linkDraftToPriceBook: the draft lines the server linked to an item (`priceBookItemId`) become exactly the line the
 *     user gets by picking that item in the line editor (components/forms/LineItemsEditor.tsx applySaved):
 *     itemSource 'pricebook', the item's unit cost (from the device, never sent), its kit parts; the price is the one the
 *     server settled (the item's price, or the price the user typed). The link id itself is always removed.
 *
 * Pure (no React, no network): scripts/document-ai-flow-qa.ts checks it under Node.
 */
import {
    foldText, PRICE_BOOK_LIMITS, wantsPriceBook, type ContextPriceBookItem,
} from '../../supabase/functions/ai-assistant/shared/priceBook.ts';
import type { DocKey } from '../../supabase/functions/ai-assistant/shared/documentSchema.ts';

/** A saved item as the app loads it (types.ts SavedItem; `unit` when the database has it). */
export interface PriceBookSource {
    id: string;
    name: string;
    description?: string | null;
    rate?: number | string | null;
    unit?: string | null;
    unit_cost?: number | string | null;
    cost?: number | string | null;
    category?: string | null;
    type?: string | null;
    is_assembly?: boolean | null;
    assembly_items?: unknown;
    is_favorite?: boolean | null;
    use_count?: number | null;
    last_used_at?: string | null;
}

/** What the browser sends (inside the server's limits: 40 items, 8000 characters). */
export const PRICE_BOOK_SLICE = { items: PRICE_BOOK_LIMITS.items, chars: 7000 } as const;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
};
const oneLine = (v: unknown, max: number): string => (typeof v === 'string' ? v : '')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const parts = (v: unknown): Rec[] => {
    let list = v;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
    return Array.isArray(list) ? list.filter(isRec) : [];
};

// ───────────────────────────── ranking ─────────────────────────────

const STOP = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those', 'into', 'onto', 'your', 'our', 'my', 'new', 'add', 'make',
    'create', 'draft', 'write', 'prepare', 'estimate', 'invoice', 'quote', 'bid', 'proposal', 'change', 'order', 'job', 'client', 'please',
    'need', 'needs', 'want', 'some', 'all', 'each', 'per', 'option', 'good', 'better', 'best', 'price', 'book', 'use', 'using',
    'can', 'you', 'will', 'would', 'about', 'also', 'plus', 'total', 'include', 'includes', 'request', 'list', 'check', 'site', 'keep',
    'para', 'con', 'los', 'las', 'del', 'une', 'des', 'pour', 'avec', 'les', 'und', 'mit', 'der', 'die', 'das', 'fur', 'per', 'con',
]);
/** "sheets" → "sheet", "boxes" → "box", "batteries" → "battery". */
const stem = (w: string): string => {
    if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
    if (w.length > 4 && /(?:ch|sh|x|z|ss)es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    return w;
};
const tokens = (text: string): string[] => Array.from(new Set(
    foldText(text).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !STOP.has(w)).map(stem).filter(w => !STOP.has(w)),
));
const DAY = 86_400_000;

export interface RankOptions {
    /** items already on the draft being completed: always sent first */
    pinIds?: Iterable<string>;
    now?: Date;
}

/**
 * The price book in the order it is worth sending: pinned items, then by keyword overlap with the message (the
 * item's name counts most, a full name in the message most of all; description, category, type and kit parts count
 * once each), then by use (favorite, times used, last used), then by name.
 */
export function rankPriceBook(items: readonly PriceBookSource[] | null | undefined, text: string, opts: RankOptions = {}): PriceBookSource[] {
    const list = (items || []).filter(i => i && typeof i.id === 'string' && i.id && typeof i.name === 'string' && i.name.trim());
    const pinned = new Set(opts.pinIds || []);
    const words = new Set(tokens(text));
    const folded = foldText(text);
    const spaced = ` ${folded.replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
    const byId = new Map(list.map(i => [i.id, i]));
    const now = (opts.now || new Date()).getTime();
    const scored = list.map(item => {
        const name = foldText(item.name);
        const nameWords = tokens(item.name);
        const kitNames = parts(item.assembly_items).map(p => oneLine(p.custom_name, 80) || byId.get(String(p.item_id || ''))?.name || '').join(' ');
        const other = tokens([item.description, item.category, item.type, kitNames].filter(Boolean).join(' ')).filter(w => !nameWords.includes(w));
        const phrase = name.length >= 3 && (spaced.includes(` ${name.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `) || (/[^\x00-\x7f]/.test(name) && folded.includes(name)));
        const relevance = (phrase ? 6 : 0) + 3 * nameWords.filter(w => words.has(w)).length + Math.min(3, other.filter(w => words.has(w)).length);
        const used = Date.parse(String(item.last_used_at || ''));
        const age = Number.isFinite(used) ? (now - used) / DAY : Infinity;
        const usage = (item.is_favorite ? 1 : 0) + Math.min(2, Math.log10(1 + Math.max(0, num(item.use_count)))) + (age <= 30 ? 1 : age <= 90 ? 0.5 : 0);
        return { item, pin: pinned.has(item.id) ? 1 : 0, relevance, usage };
    });
    scored.sort((a, b) => (b.pin - a.pin) || (b.relevance - a.relevance) || (b.usage - a.usage) || a.item.name.localeCompare(b.item.name));
    return scored.map(s => s.item);
}

/** "2 x Exhaust fan, 1 x Duct kit" (names and quantities only). */
function kitSummary(item: PriceBookSource, byId: Map<string, PriceBookSource>): string {
    if (!item.is_assembly) return '';
    const text = parts(item.assembly_items).map(p => {
        const name = oneLine(p.custom_name, 60) || oneLine(byId.get(String(p.item_id || ''))?.name, 60);
        if (!name) return '';
        const qty = num(p.quantity);
        return `${qty > 0 ? Math.round(qty * 100) / 100 : 1} x ${name}`;
    }).filter(Boolean).join(', ');
    if (text.length <= PRICE_BOOK_LIMITS.kit) return text;
    const cut = text.slice(0, PRICE_BOOK_LIMITS.kit - 2);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(','), 20))}, …`;
}

/** One item as the request carries it: sell side only. */
export function toContextItem(item: PriceBookSource, byId: Map<string, PriceBookSource> = new Map()): ContextPriceBookItem | null {
    const name = oneLine(item.name, PRICE_BOOK_LIMITS.name);
    const price = Math.round(num(item.rate) * 100) / 100;
    if (!item.id || !name || !(price > 0)) return null;
    const out: ContextPriceBookItem = { id: item.id, name, price };
    const unit = oneLine(item.unit, PRICE_BOOK_LIMITS.unit);
    if (unit) out.unit = unit;
    const desc = oneLine(item.description, PRICE_BOOK_LIMITS.desc);
    if (desc && foldText(desc) !== foldText(name)) out.desc = desc;
    const kit = kitSummary(item, byId);
    if (kit) out.kit = kit;
    return out;
}

/** The ranked slice: at most 40 priced items and ~7000 characters of JSON (an item that does not fit is skipped). */
export function buildPriceBookSlice(items: readonly PriceBookSource[] | null | undefined, text: string, opts: RankOptions = {}): ContextPriceBookItem[] {
    const byId = new Map((items || []).filter(i => i?.id).map(i => [i.id, i]));
    const out: ContextPriceBookItem[] = [];
    let size = 2;
    for (const item of rankPriceBook(items, text, opts)) {
        if (out.length >= PRICE_BOOK_SLICE.items) break;
        const row = toContextItem(item, byId);
        if (!row) continue;
        const len = JSON.stringify(row).length + 1;
        if (size + len > PRICE_BOOK_SLICE.chars) continue;
        size += len;
        out.push(row);
    }
    return out;
}

/** Price-book items already linked on a draft (its lines and its options' private fields). */
export function linkedPriceBookIds(prefill: unknown): string[] {
    if (!isRec(prefill)) return [];
    const ids = new Set<string>();
    for (const line of Array.isArray(prefill.lineItems) ? prefill.lineItems : []) {
        if (isRec(line) && typeof line.priceBookItemId === 'string') ids.add(line.priceBookItemId);
    }
    const internal = isRec(prefill.estimateOptionsInternal) ? prefill.estimateOptionsInternal : {};
    for (const entry of Object.values(internal)) if (isRec(entry) && typeof entry.priceBookItemId === 'string') ids.add(entry.priceBookItemId);
    return [...ids];
}

/**
 * The `price_book` of a request, or undefined (non-drafting message, empty price book). `pending` is the draft the
 * user is completing (its type counts as drafting; its linked items are always sent).
 */
export function priceBookForRequest(
    items: readonly PriceBookSource[] | null | undefined,
    text: string,
    pending?: { document_type?: DocKey | string | null; prefill?: unknown } | null,
    now?: Date,
): ContextPriceBookItem[] | undefined {
    if (!items?.length) return undefined;
    const pendingType = typeof pending?.document_type === 'string' ? pending.document_type as DocKey : null;
    if (!wantsPriceBook(text, pendingType)) return undefined;
    const slice = buildPriceBookSlice(items, text, { pinIds: linkedPriceBookIds(pending?.prefill), now });
    return slice.length ? slice : undefined;
}

// ───────────────────────────── linking the draft ─────────────────────────────

/** The fields a line gets when the item is picked by hand (LineItemsEditor applySaved); `unitCost` stays the user's own. */
function pickedFields(item: PriceBookSource, line: Rec, byId: Map<string, PriceBookSource>): Rec {
    const name = String(item.name || '').trim();
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const typed = typeof line.description === 'string' ? line.description.trim() : '';
    const n = foldText(name);
    const t = foldText(typed);
    // A description that already starts with the item's name and says more ("Drywall sheet - master bedroom") is kept.
    const text = t.startsWith(n) && t !== n ? typed : name + (description && description !== name ? ` - ${description}` : '');
    const out: Rec = {
        description: text,
        unitCost: typeof line.unitCost === 'number' ? line.unitCost : num(item.unit_cost ?? item.cost),
        itemSource: 'pricebook',
        track_inventory: false,
    };
    const unit = typeof line.unit === 'string' && line.unit.trim() ? line.unit : oneLine(item.unit, 24);
    if (unit) out.unit = unit;
    if (item.is_assembly) {
        out.isAssembly = true;
        out.hideComponentsOnPdf = true;
        out.assemblyComponents = parts(item.assembly_items).map(c => {
            const def = byId.get(String(c.item_id || ''));
            const override = c.override_price;
            return {
                item_id: String(c.item_id ?? ''),
                name: String(c.custom_name || def?.name || 'Component'),
                quantity: num(c.quantity),
                rate: override !== null && override !== undefined ? num(override) : num(def?.rate),
            };
        });
    }
    return out;
}

const hasLink = (prefill: Rec): boolean =>
    (Array.isArray(prefill.lineItems) && prefill.lineItems.some(l => isRec(l) && 'priceBookItemId' in l))
    || (isRec(prefill.estimateOptionsInternal) && Object.values(prefill.estimateOptionsInternal).some(e => isRec(e) && 'priceBookItemId' in e));

/**
 * The draft with every linked line turned into the hand-picked price-book line, and no `priceBookItemId` left
 * (a link to an item that is not in `items` is just removed). A draft without links is returned as it is.
 */
export function linkDraftToPriceBook<T extends Rec>(prefill: T, items: readonly PriceBookSource[] | null | undefined): T {
    if (!isRec(prefill) || !hasLink(prefill)) return prefill;
    const byId = new Map((items || []).filter(i => i?.id).map(i => [i.id, i]));
    const out: Rec = { ...prefill };
    if (Array.isArray(prefill.lineItems)) {
        out.lineItems = prefill.lineItems.map(line => {
            if (!isRec(line) || !('priceBookItemId' in line)) return line;
            const { priceBookItemId, ...rest } = line;
            const item = typeof priceBookItemId === 'string' ? byId.get(priceBookItemId) : undefined;
            return item ? { ...rest, ...pickedFields(item, rest, byId) } : rest;
        });
    }
    const internal = isRec(prefill.estimateOptionsInternal) ? prefill.estimateOptionsInternal : null;
    if (internal) {
        const nextInternal: Rec = {};
        const itemOfLine = new Map<string, PriceBookSource>();
        for (const [lineId, entry] of Object.entries(internal)) {
            if (!isRec(entry) || !('priceBookItemId' in entry)) { nextInternal[lineId] = entry; continue; }
            const { priceBookItemId, ...rest } = entry;
            const item = typeof priceBookItemId === 'string' ? byId.get(priceBookItemId) : undefined;
            if (item) itemOfLine.set(lineId, item);
            // option lines: the cost and the price-book source are private (estimateOptionsInternal), like a saved estimate
            const priv: Rec = item ? { ...rest, unitCost: typeof rest.unitCost === 'number' ? rest.unitCost : num(item.unit_cost ?? item.cost), itemSource: 'pricebook' } : rest;
            if (Object.keys(priv).length) nextInternal[lineId] = priv;
        }
        if (Object.keys(nextInternal).length) out.estimateOptionsInternal = nextInternal;
        else delete out.estimateOptionsInternal;
        const set = isRec(prefill.estimateOptions) ? prefill.estimateOptions : null;
        if (set && itemOfLine.size) {
            // client-safe side of an option line: description, unit and kit parts (never the cost)
            const relink = (lines: unknown) => (Array.isArray(lines) ? lines.map(line => {
                const item = isRec(line) ? itemOfLine.get(String(line.id)) : undefined;
                if (!item || !isRec(line)) return line;
                const { unitCost: _c, itemSource: _s, track_inventory: _t, ...safe } = pickedFields(item, line, byId);
                return { ...line, ...safe };
            }) : lines);
            out.estimateOptions = {
                ...set,
                ...(Array.isArray(set.options) ? { options: set.options.map(o => (isRec(o) ? { ...o, lineItems: relink(o.lineItems) } : o)) } : {}),
                ...(Array.isArray(set.sharedLineItems) ? { sharedLineItems: relink(set.sharedLineItems) } : {}),
            };
        }
    }
    return out as T;
}
