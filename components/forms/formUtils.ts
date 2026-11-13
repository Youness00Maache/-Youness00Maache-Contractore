/**
 * Pure helpers shared by the 12 document forms (no React, no DOM required, safe to unit test under Node).
 * Money math lives in utils/money.ts; this file only handles dates, numbering, text/HTML cleanup,
 * colors and line-item normalization.
 */
import type { LineItem, MaterialLogItem } from '../../types.ts';
import { FormType } from '../../types.ts';
import { toNumber, roundMoney } from '../../utils/money.ts';

// ---------------------------------------------------------------------------
// ids
// ---------------------------------------------------------------------------
export const newId = (): string => {
    const c: any = (globalThis as any).crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

// ---------------------------------------------------------------------------
// dates (always LOCAL calendar dates, never UTC; computed when called, never at module load)
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');

export const localISODate = (d: Date = new Date()): string =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayISO = (): string => localISODate(new Date());

export const isISODate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

export const parseISODateLocal = (value: string): Date | null => {
    if (!isISODate(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
};

export const addDaysISO = (days: number, from?: string): string => {
    const base = (from && parseISODateLocal(from)) || new Date();
    return localISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
};

export const addMonthsISO = (months: number, from?: string): string => {
    const base = (from && parseISODateLocal(from)) || new Date();
    const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(base.getDate(), lastDay));
    return localISODate(target);
};

/**
 * Accepts YYYY-MM-DD, an ISO date-time (date part is kept as written), YYYY/MM/DD,
 * D/M/YYYY or M/D/YYYY (day-first when the first part is > 12, otherwise month-first),
 * "Nov 12, 2026" and Date objects. Returns a local YYYY-MM-DD or null.
 */
export const normalizeDateValue = (value: unknown): string | null => {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : localISODate(value);
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    const isoPrefix = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/);
    if (isoPrefix) {
        const iso = `${isoPrefix[1]}-${pad2(Number(isoPrefix[2]))}-${pad2(Number(isoPrefix[3]))}`;
        return isISODate(iso) ? iso : null;
    }
    const dmy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (dmy) {
        let a = Number(dmy[1]);
        let b = Number(dmy[2]);
        let y = Number(dmy[3]);
        if (y < 100) y += 2000;
        // a > 12 → day-first; otherwise month-first (US default for ambiguous dates)
        const [month, day] = a > 12 ? [b, a] : [a, b];
        const iso = `${y}-${pad2(month)}-${pad2(day)}`;
        return isISODate(iso) ? iso : null;
    }
    if (/[a-z]/i.test(v)) {
        const t = Date.parse(v);
        if (!Number.isNaN(t)) return localISODate(new Date(t));
    }
    return null;
};

export const formatDisplayDate = (iso?: string | null): string => {
    const d = iso ? parseISODateLocal(iso) : null;
    if (!d) return iso || '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// ---------------------------------------------------------------------------
// document numbers
// ---------------------------------------------------------------------------
export const DOC_NUMBER_CONFIG: Partial<Record<FormType, { field: string; prefix: string }>> = {
    [FormType.Invoice]: { field: 'invoiceNumber', prefix: 'INV' },
    [FormType.Estimate]: { field: 'estimateNumber', prefix: 'EST' },
    [FormType.WorkOrder]: { field: 'workOrderNumber', prefix: 'WO' },
    [FormType.DailyJobReport]: { field: 'reportNumber', prefix: 'DR' },
    [FormType.Warranty]: { field: 'warrantyNumber', prefix: 'WAR' },
    [FormType.Receipt]: { field: 'receiptNumber', prefix: 'REC' },
    [FormType.ChangeOrder]: { field: 'changeOrderNumber', prefix: 'CO' },
    [FormType.PurchaseOrder]: { field: 'poNumber', prefix: 'PO' },
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Next number in the `PREFIX-YYYY-MM-NNN` series, unique against every existing number.
 * Sequence restarts each month (matches the numbers already stored by older versions of the app).
 */
export const nextDocumentNumber = (
    prefix: string,
    existing: Iterable<string | null | undefined> = [],
    date: Date = new Date(),
): string => {
    const ym = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    const re = new RegExp(`^${escapeRegExp(prefix)}-${ym}-(\\d+)$`, 'i');
    const taken = new Set<string>();
    let max = 0;
    for (const raw of existing) {
        if (typeof raw !== 'string') continue;
        const s = raw.trim();
        if (!s) continue;
        taken.add(s.toUpperCase());
        const m = re.exec(s);
        if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    }
    let seq = max + 1;
    let candidate = '';
    do {
        candidate = `${prefix}-${ym}-${String(seq).padStart(3, '0')}`;
        seq += 1;
    } while (taken.has(candidate.toUpperCase()));
    return candidate;
};

// ---------------------------------------------------------------------------
// text / html
// ---------------------------------------------------------------------------
export const looksLikeHtml = (value: string): boolean => /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(value);

const decodeEntities = (s: string): string =>
    s
        .replace(/&nbsp;/gi, ' ')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&amp;/gi, '&');

/** Converts AI/rich HTML to readable plain text for textareas and plain-text PDF fields. */
export const htmlToPlainText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const input = String(value);
    if (!looksLikeHtml(input)) return decodeEntities(input).replace(/\r\n/g, '\n').trim();
    const text = input
        .replace(/<(script|style|head)[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n• ')
        .replace(/<\/li\s*>/gi, '')
        .replace(/<\/(p|div|h[1-6]|tr|blockquote|ul|ol|table|section|article)\s*>/gi, '\n')
        .replace(/<\/t[dh]\s*>/gi, '  ')
        .replace(/<hr[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '');
    return decodeEntities(text)
        .split('\n')
        .map(line => line.replace(/[ \t ]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/** Single-line text (inputs). */
export const toSingleLine = (value: unknown): string => htmlToPlainText(value).replace(/\s*\n+\s*/g, ', ').trim();

/** Regex sanitizer used when no DOM is available (unit tests, SSR). */
export const basicSanitizeHtml = (html: string): string =>
    html
        .replace(/<(script|style|iframe|object|embed|form|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<\/?(script|style|iframe|object|embed|link|meta|form|input|button|base|template|noscript|svg|math)\b[^>]*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|vbscript|data:text)[^"']*\2/gi, ' $1="#"')
        .replace(/\sstyle\s*=\s*("[^"]*(url\s*\(|expression\s*\()[^"]*"|'[^']*(url\s*\(|expression\s*\()[^']*')/gi, '');

const FONT_SIZES: Record<string, string> = { '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px' };

/** execCommand still produces <font>; convert it to styled spans so colors/sizes survive sanitizing. */
const convertFontTags = (html: string) =>
    html
        .replace(/<font\b([^>]*)>/gi, (_m, attrs: string) => {
            const styles: string[] = [];
            const color = (attrs.match(/color\s*=\s*["']?(#[0-9a-f]{3,8}|[a-z]+)/i) || [])[1];
            const size = (attrs.match(/size\s*=\s*["']?([1-7])/i) || [])[1];
            const face = (attrs.match(/face\s*=\s*["']([^"']+)["']/i) || [])[1];
            if (color) styles.push(`color:${color}`);
            if (size && FONT_SIZES[size]) styles.push(`font-size:${FONT_SIZES[size]}`);
            if (face && /^[\w\s,-]+$/.test(face)) styles.push(`font-family:${face}`);
            return styles.length ? `<span style="${styles.join(';')}">` : '<span>';
        })
        .replace(/<\/font>/gi, '</span>');

const RICH_TAGS = new Set([
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'sub', 'sup', 'br', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'span', 'div', 'a', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img', 'code', 'pre', 'mark',
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'noscript', 'base', 'frame', 'frameset']);

const domSanitize = (html: string): string => {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild as HTMLElement | null;
    if (!root) return '';
    const walk = (node: Element) => {
        for (const child of Array.from(node.children)) {
            const tag = child.tagName.toLowerCase();
            if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
            if (!RICH_TAGS.has(tag)) { walk(child); child.replaceWith(...Array.from(child.childNodes)); continue; }
            for (const a of Array.from(child.attributes)) {
                const name = a.name.toLowerCase();
                const v = a.value.trim();
                const keep =
                    (name === 'href' && tag === 'a' && /^(https?:|mailto:|tel:)/i.test(v)) ||
                    (name === 'src' && tag === 'img' && (/^https?:\/\//i.test(v) || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v))) ||
                    ['alt', 'title', 'colspan', 'rowspan', 'width', 'height', 'align'].includes(name) ||
                    (name === 'style' && !/url\s*\(|expression\s*\(|javascript:|behavior\s*:|@import/i.test(v));
                if (!keep) child.removeAttribute(a.name);
            }
            if (tag === 'a') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
            walk(child);
        }
    };
    walk(root);
    return root.innerHTML;
};

/**
 * Sanitizes rich editor HTML (Daily Report / Note content) with an allow-list: no scripts, event handlers,
 * javascript: links or url() styles. Keeps inline styles (colors, table borders, image sizes).
 */
export const sanitizeEditorHtml = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const html = convertFontTags(String(value));
    const hasDom = typeof window !== 'undefined' && typeof DOMParser !== 'undefined';
    return hasDom ? domSanitize(html) : basicSanitizeHtml(html);
};

/** Plain text → minimal safe HTML for the rich editors. */
export const plainTextToHtml = (value: string): string =>
    value
        .split(/\n{2,}/)
        .map(p => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
        .join('');

// ---------------------------------------------------------------------------
// colors / urls
// ---------------------------------------------------------------------------
const NAMED_COLORS: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#dc2626', blue: '#2563eb', navy: '#1e3a8a', green: '#16a34a',
    gray: '#6b7280', grey: '#6b7280', orange: '#ea580c', purple: '#7c3aed', gold: '#b8860b', teal: '#0d9488',
    yellow: '#ca8a04', pink: '#db2777', brown: '#78350f', slate: '#334155', indigo: '#4f46e5', cyan: '#0891b2',
};

export const normalizeHexColor = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const raw = value.trim().toLowerCase();
    if (NAMED_COLORS[raw]) return NAMED_COLORS[raw];
    const s = raw.startsWith('#') ? raw : `#${raw}`;
    if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    return null;
};

/** Images we accept for logos/signatures: https/http URLs, root-relative paths, or base64 raster data URIs. */
export const normalizeImageUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(v)) return v.replace(/\s+/g, '');
    if (v.startsWith('/') && !v.startsWith('//')) return v;
    return null;
};

export const normalizeLinkUrl = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v)) return `https://${v}`;
    return null;
};

// ---------------------------------------------------------------------------
// numbers
// ---------------------------------------------------------------------------
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Number or null when the value is blank / not numeric. Never NaN. */
export const toNumberOrNull = (v: unknown): number | null => {
    if (isBlank(v)) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && !/\d/.test(v)) return null;
    return toNumber(v);
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const toBool = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        if (['true', 'yes', 'y', '1', 'on'].includes(s)) return true;
        if (['false', 'no', 'n', '0', 'off'].includes(s)) return false;
    }
    return null;
};

/** Case/spacing-insensitive match against an option list ("in_progress" → "In Progress"). */
export const matchOption = (value: unknown, options: readonly string[]): string | null => {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
    return options.find(o => o.toLowerCase().replace(/[\s_-]+/g, ' ') === key) ?? null;
};

// ---------------------------------------------------------------------------
// line items
// ---------------------------------------------------------------------------
const firstDefined = (obj: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && !(typeof obj[k] === 'string' && (obj[k] as string).trim() === '')) return obj[k];
    }
    return undefined;
};

export const blankLineItem = (): LineItem => ({ id: newId(), description: '', quantity: 1, rate: 0 });

/** Normalizes any line-item-like object (AI, legacy, saved) into a LineItem with numeric fields and an id. */
/** `cleanText: false` keeps saved descriptions exactly as typed (used when loading saved documents). */
export const normalizeLineItem = (raw: unknown, usedIds?: Set<string>, cleanText = true): LineItem | null => {
    const text = (v: unknown) => (cleanText ? toSingleLine(v ?? '') : v === null || v === undefined ? '' : String(v));
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const description = text(firstDefined(r, ['description', 'name', 'item', 'title', 'label']));
    const qtyRaw = firstDefined(r, ['quantity', 'qty', 'units', 'count']);
    const rateRaw = firstDefined(r, ['rate', 'unitPrice', 'unit_price', 'price', 'amount', 'cost_each']);
    const quantity = qtyRaw === undefined ? 1 : Math.round(Math.max(0, toNumber(qtyRaw)) * 1000) / 1000;
    const rate = rateRaw === undefined ? 0 : roundMoney(toNumber(rateRaw));
    if (!description && !rate && qtyRaw === undefined) return null;

    let id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
    if (!id || (usedIds && usedIds.has(id))) id = newId();
    usedIds?.add(id);

    const item: LineItem = { id, description, quantity, rate };
    const unitCost = firstDefined(r, ['unitCost', 'unit_cost', 'cost']);
    if (unitCost !== undefined) item.unitCost = roundMoney(Math.max(0, toNumber(unitCost)));
    const pct = firstDefined(r, ['percentComplete', 'percent_complete', 'progressPercentage', 'percent', 'progress']);
    if (pct !== undefined) item.percentComplete = clamp(toNumber(pct), 0, 100);
    if (r.previouslyBilled !== undefined && r.previouslyBilled !== null) item.previouslyBilled = roundMoney(Math.max(0, toNumber(r.previouslyBilled)));
    const invId = firstDefined(r, ['inventoryItemId', 'item_id']);
    if (typeof invId === 'string') {
        item.inventoryItemId = typeof r.inventoryItemId === 'string' && r.inventoryItemId ? r.inventoryItemId : undefined;
        item.item_id = typeof r.item_id === 'string' && r.item_id ? r.item_id : undefined;
        if (!item.inventoryItemId && !item.item_id) item.inventoryItemId = invId;
    }
    if (r.itemSource === 'pricebook' || r.itemSource === 'inventory') item.itemSource = r.itemSource;
    if (typeof r.track_inventory === 'boolean') item.track_inventory = r.track_inventory;
    if (r.currentStock !== undefined && r.currentStock !== null) item.currentStock = toNumber(r.currentStock);
    if (r.isAssembly) item.isAssembly = true;
    if (typeof r.hideComponentsOnPdf === 'boolean') item.hideComponentsOnPdf = r.hideComponentsOnPdf;
    if (Array.isArray(r.assemblyComponents)) {
        item.assemblyComponents = (r.assemblyComponents as any[])
            .filter(c => c && typeof c === 'object')
            .map(c => ({
                item_id: String(c.item_id ?? ''),
                name: toSingleLine(c.name ?? ''),
                quantity: toNumber(c.quantity),
                rate: roundMoney(toNumber(c.rate)),
            }));
    }
    return item;
};

export const normalizeLineItems = (raw: unknown, cleanText = true): LineItem[] => {
    if (!Array.isArray(raw)) return [];
    const used = new Set<string>();
    return raw.map(r => normalizeLineItem(r, used, cleanText)).filter((x): x is LineItem => Boolean(x));
};

export const blankMaterialItem = (): MaterialLogItem => ({ id: newId(), name: '', supplier: '', quantity: 1, unitCost: 0 });

export const normalizeMaterialItem = (raw: unknown, usedIds?: Set<string>, cleanText = true): MaterialLogItem | null => {
    const text = (v: unknown) => (cleanText ? toSingleLine(v ?? '') : v === null || v === undefined ? '' : String(v));
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const name = text(firstDefined(r, ['name', 'description', 'item', 'material']));
    const supplier = text(firstDefined(r, ['supplier', 'vendor', 'store']));
    const qtyRaw = firstDefined(r, ['quantity', 'qty', 'units']);
    const costRaw = firstDefined(r, ['unitCost', 'unit_cost', 'cost', 'rate', 'price']);
    const quantity = qtyRaw === undefined ? 1 : Math.max(0, toNumber(qtyRaw));
    const unitCost = costRaw === undefined ? 0 : roundMoney(Math.max(0, toNumber(costRaw)));
    if (!name && !unitCost && qtyRaw === undefined) return null;
    let id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : '';
    if (!id || (usedIds && usedIds.has(id))) id = newId();
    usedIds?.add(id);
    const item: MaterialLogItem = { id, name, supplier, quantity, unitCost };
    const inv = firstDefined(r, ['inventoryItemId', 'item_id']);
    if (typeof inv === 'string') item.inventoryItemId = inv;
    return item;
};

export const normalizeMaterialItems = (raw: unknown, cleanText = true): MaterialLogItem[] => {
    if (!Array.isArray(raw)) return [];
    const used = new Set<string>();
    return raw.map(r => normalizeMaterialItem(r, used, cleanText)).filter((x): x is MaterialLogItem => Boolean(x));
};

// ---------------------------------------------------------------------------
// hashing (stable key for drafts without __draftId)
// ---------------------------------------------------------------------------
const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const keys = Object.keys(value as object).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`).join(',')}}`;
};

export const hashValue = (value: unknown): string => {
    const s = stableStringify(value);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36) + s.length.toString(36);
};

/** Friendly message for anything thrown by a save/download. */
export const errorMessage = (error: unknown, fallback = 'Something went wrong. Please try again.'): string => {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : (error as any)?.message;
    if (!raw || typeof raw !== 'string') return fallback;
    if (raw.startsWith('PLAN_LIMIT:')) return raw.replace(/^PLAN_LIMIT:\s*/, '') || 'You have reached your plan limit.';
    if (/failed to fetch|networkerror|load failed/i.test(raw)) return 'You appear to be offline. Check your connection and try again; your changes are still on this screen.';
    if (/insufficient stock|not enough stock/i.test(raw)) return 'Not enough stock for one or more inventory-linked items. Reduce the quantity and try again.';
    return raw;
};
