/**
 * Good / better / best options on an estimate the assistant drafts (competitor gap #6, assistant side).
 * Pure TypeScript (only imports from this folder): the edge function, the browser and the QA script share it.
 *
 * MODEL OUTPUT (flat on purpose: inside a RUN_PLAN step a nested option → lines → line object would make the Gemini
 * schema deeper than 6 levels):
 *   estimate_options   [{ name, description?, recommended? }]          2–4 options
 *   line_items[].option   the name of the option the line belongs to (its letter or number also works);
 *                         "ALL" (or no option) = a line included in every option ("shared line")
 *
 * DRAFT (prefill keys, the SAVED format of lib/estimateOptions.ts packOptionsForSave, so the form opens it the way it
 * opens a saved estimate and every save path stays client-safe):
 *   estimateOptions          { version 1, kind 'estimate', options [{ id, name, description?, lineItems }], sharedLineItems,
 *                            recommendedId? }; its lines are { id, description, quantity, rate } only (the client sees them)
 *   estimateOptionsInternal  { [lineId]: { unitCost } }: internal costs the user stated (the key contains "internal", so
 *                            the database never sends it to a client page)
 *   lineItems                the option that counts (the Recommended one: the model's pick, else the second option, as the
 *                            form's "Good / better / best" button does) + the shared lines, like every saved options
 *                            estimate (older readers of an estimate keep working)
 *
 * Fewer than 2 options with lines of their own → null: the caller keeps the normal single-total estimate, exactly as
 * before options existed.
 */
import { normalizeLineItems, toPlainText, type NormalizedLineItem } from './documentSchema.ts';

export const DRAFT_OPTION_MIN = 2;
export const DRAFT_OPTION_MAX = 4;
/** Same limits as lib/estimateOptions.ts (OPTION_NAME_MAX / OPTION_DESCRIPTION_MAX). */
export const DRAFT_OPTION_NAME_MAX = 40;
export const DRAFT_OPTION_DESCRIPTION_MAX = 240;
const DEFAULT_NAMES = ['Good', 'Better', 'Best', 'Premium'] as const;

/** One option as the model returns it. */
export interface ModelEstimateOption {
    name?: string | null;
    description?: string | null;
    recommended?: boolean | null;
}

/** A client-safe option line (what the client pages may show). */
export interface DraftOptionLine { id: string; description: string; quantity: number; rate: number }

export interface DraftOptionSet {
    version: 1;
    kind: 'estimate';
    options: Array<{ id: string; name: string; description?: string; lineItems: DraftOptionLine[] }>;
    sharedLineItems: DraftOptionLine[];
    recommendedId?: string;
}

export interface EstimateOptionsDraft {
    estimateOptions: DraftOptionSet;
    estimateOptionsInternal: Record<string, { unitCost: number }>;
    /** mirror of the option that counts + shared lines (with unitCost) */
    lineItems: NormalizedLineItem[];
    /** what was left out (shown to the user) */
    notes: string[];
}

type Row = Record<string, unknown>;
const rec = (v: unknown): Row | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Row : null);
const oneLine = (v: unknown, max: number): string => toPlainText(typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/\s+/g, ' ').trim().slice(0, max);
/** lowercase, no accents, single spaces */
const fold = (s: string): string => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
/** Words around an option name that do not change which option is meant ("Better option", "Option B", "Paquete premium"). */
const FILLER = /\b(?:the|option|options|opcion|opciones|opcao|opcoes|choice|package|paquete|pacote|tier|level|nivel|niveau|plan|version|formule|forfait|paket|stufe|pacchetto|livello|variante)\b/g;
const keyOf = (s: string): string => fold(s).replace(FILLER, ' ').replace(/[^\p{L}\p{N}]+/gu, '');

/** "ALL", "all options", "in every option", "todas", "toutes les options", "alle", "全部": a line in every option. */
const SHARED_RE = /^(?:in |en |dans |em |im |nel |в )?(?:all|any|every|each|both|shared|common|included|always|everything|todas?|todos|ambas|ambos|comun|compartid[ao]s?|toutes|tous|commun(?:es)?|partagee?s?|alle|allen|jede|gemeinsam|tutte|tutti|comuni|compartilhad[ao]s?|все|общ)\b|^(?:全部|所有|共通|共享|すべて|全て|모두|공통)/;
export const isSharedTag = (tag: string): boolean => SHARED_RE.test(fold(tag));

/** Text that would tell the client the contractor's costs or margin: never kept in an option description. */
const COST_TALK_RE = /\b(?:margin|markup|mark-up|profit|our cost|my cost|internal cost|unit cost|cost price|wholesale|margen|beneficio|coste interno|costo interno|marge|benefice|cout interne|gewinn|einkaufspreis|margine|custo interno|lucro)\b/;

const defaultId = (): string => (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

interface Building { name: string; description: string; recommended: boolean; rows: Row[] }

/**
 * The options of an estimate draft from the model's answer (single action or plan step), or null when the answer is
 * not an options estimate (no options, or fewer than 2 with lines of their own). Never throws.
 */
export function draftEstimateOptions(
    source: { estimate_options?: unknown; line_items?: unknown; recommended_option?: unknown } | null | undefined,
    opts: { newId?: () => string } = {},
): EstimateOptionsDraft | null {
    const src = rec(source);
    if (!src) return null;
    const newId = opts.newId || defaultId;
    const list: Building[] = [];
    const byKey = new Map<string, Building>();
    const register = (b: Building) => {
        list.push(b);
        const k = keyOf(b.name);
        if (k && !byKey.has(k)) byKey.set(k, b);
    };

    // 1) the options the model listed (some models also nest each option's lines: accepted)
    for (const raw of (Array.isArray(src.estimate_options) ? src.estimate_options : []).slice(0, 12)) {
        const r = rec(raw) || (typeof raw === 'string' ? { name: raw } : null);
        if (!r) continue;
        const name = oneLine(r.name ?? r.title ?? r.label, DRAFT_OPTION_NAME_MAX);
        const description = oneLine(r.description ?? r.summary, DRAFT_OPTION_DESCRIPTION_MAX);
        const recommended = r.recommended === true || r.recommended === 'true' || r.is_recommended === true;
        let b = name ? byKey.get(keyOf(name)) : undefined;
        if (b) {
            if (!b.description) b.description = description;
            b.recommended = b.recommended || recommended;
        } else {
            b = { name, description, recommended, rows: [] };
            register(b);
        }
        const nested = Array.isArray(r.line_items) ? r.line_items : Array.isArray(r.lineItems) ? r.lineItems : [];
        for (const li of nested) { const row = rec(li); if (row) b.rows.push(row); }
    }

    // 2) every line goes to its option (or to the shared lines)
    const resolve = (tag: string): Building | 'shared' | null => {
        const k = keyOf(tag);
        // (a name longer than an option name may be is matched by its first characters, like the option itself)
        const exact = k ? byKey.get(k) || byKey.get(keyOf(tag.slice(0, DRAFT_OPTION_NAME_MAX))) : undefined;
        if (exact) return exact;
        if (!k || isSharedTag(tag)) return 'shared';
        if (/^[a-d]$/.test(k)) return list[k.charCodeAt(0) - 97] || null;
        if (/^[1-4]$/.test(k)) return list[Number(k) - 1] || null;
        return null;
    };
    const shared: Row[] = [];
    for (const li of Array.isArray(src.line_items) ? src.line_items : []) {
        const row = rec(li);
        if (!row) continue;
        const tag = oneLine(row.option ?? row.option_name ?? row.optionName, 60);
        let target = tag ? resolve(tag) : 'shared';
        if (target === null) {
            // an option the model only named on its lines
            target = { name: oneLine(tag, DRAFT_OPTION_NAME_MAX), description: '', recommended: false, rows: [] };
            register(target);
        }
        if (target === 'shared') shared.push(row); else target.rows.push(row);
    }
    if (list.length < DRAFT_OPTION_MIN) return null;

    // 3) normalized lines; options without lines of their own are left out, then the cap
    const norm = (rows: Row[]): NormalizedLineItem[] => normalizeLineItems(rows, newId) || [];
    const built = list.map(b => ({ ...b, lines: norm(b.rows) }));
    const withLines = built.filter(b => b.lines.length);
    const kept = withLines.slice(0, DRAFT_OPTION_MAX);
    if (kept.length < DRAFT_OPTION_MIN) return null;
    const label = (b: { name: string }, i: number) => b.name || `Option ${String.fromCharCode(65 + i)}`;
    const notes: string[] = [];
    const over = withLines.slice(DRAFT_OPTION_MAX);
    if (over.length) notes.push(`An estimate can have up to ${DRAFT_OPTION_MAX} options, so I left out ${over.map((b, i) => `"${label(b, DRAFT_OPTION_MAX + i)}"`).join(', ')}.`);
    const empty = built.filter(b => !b.lines.length && b.name);
    if (empty.length) notes.push(`${empty.map(b => `"${b.name}"`).join(', ')} had no lines, so I left ${empty.length === 1 ? 'it' : 'them'} out.`);

    // 4) names (empty → Good / Better / Best / Premium, never twice), client-safe lines, internal costs
    const used = new Set<string>();
    const internal: Record<string, { unitCost: number }> = {};
    const safe = (lines: NormalizedLineItem[]): DraftOptionLine[] => lines.map(l => {
        if (l.unitCost !== undefined) internal[l.id] = { unitCost: l.unitCost };
        return { id: l.id, description: l.description, quantity: l.quantity, rate: l.rate };
    });
    const sharedLines = norm(shared);
    const options = kept.map((b, i) => {
        let name = b.name;
        if (!name || used.has(name.toLowerCase())) {
            name = DEFAULT_NAMES[i] && !used.has(DEFAULT_NAMES[i].toLowerCase()) ? DEFAULT_NAMES[i] : `Option ${String.fromCharCode(65 + i)}`;
        }
        used.add(name.toLowerCase());
        const description = b.description && !COST_TALK_RE.test(fold(b.description)) ? b.description : '';
        return { id: `opt-${newId()}`, name, ...(description ? { description } : {}), lineItems: safe(b.lines), full: b.lines, recommended: b.recommended };
    });
    const sharedSafe = safe(sharedLines);

    // 5) Recommended: the model's pick, else the second option (what the form's "Good / better / best" button marks)
    let recommended = options.find(o => o.recommended);
    if (!recommended && typeof src.recommended_option === 'string' && src.recommended_option.trim()) {
        const k = keyOf(src.recommended_option);
        recommended = options.find(o => keyOf(o.name) === k)
            || (/^[a-d]$/.test(k) ? options[k.charCodeAt(0) - 97] : /^[1-4]$/.test(k) ? options[Number(k) - 1] : undefined);
    }
    const counting = recommended || options[Math.min(1, options.length - 1)];

    // 6) the mirror: the option that counts (THE RULE without a choice: the Recommended one) + the shared lines
    const lineItems = [...counting.full, ...sharedLines].map(l => ({ ...l }));

    return {
        estimateOptions: {
            version: 1,
            kind: 'estimate',
            options: options.map(({ full: _f, recommended: _r, ...o }) => o),
            sharedLineItems: sharedSafe,
            recommendedId: counting.id,
        },
        estimateOptionsInternal: internal,
        lineItems,
        notes,
    };
}
