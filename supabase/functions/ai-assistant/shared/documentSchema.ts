import { inferTemplateIdFromIntent, TEMPLATE_STYLE_MAP } from './templates.ts';

/**
 * ONE schema for every AI-fillable document field.
 *
 * Pure TypeScript (only imports from this folder), so the same file runs in three places:
 *   - the Deno edge function (prompt field list, Gemini responseSchema, validation),
 *   - the browser (setup card, draft finalisation, form prefill),
 *   - the QA script (`npx tsx scripts/document-ai-flow-qa.ts`).
 *
 * Keys are EXACTLY the field names of the matching interface in `types.ts`
 * (enforced at compile time in `src/config/documentFieldRequirements.ts`).
 * Fields the AI must never write (logoUrl, signatureUrl, client signatures, ai_visual_data,
 * recurrence, ...) are intentionally absent.
 */

export const DOC_TYPES = [
    'INVOICE', 'ESTIMATE', 'WORK_ORDER', 'DAILY_REPORT', 'TIME_SHEET', 'MATERIAL_LOG',
    'EXPENSE_LOG', 'WARRANTY', 'NOTE', 'RECEIPT', 'CHANGE_ORDER', 'PURCHASE_ORDER',
] as const;
export type DocKey = typeof DOC_TYPES[number];

/** Same strings as the `FormType` enum values in types.ts. */
export const DOC_LABELS: Record<DocKey, string> = {
    INVOICE: 'Invoice',
    ESTIMATE: 'Estimate',
    WORK_ORDER: 'Work Order',
    DAILY_REPORT: 'Daily Job Report',
    TIME_SHEET: 'Time Sheet',
    MATERIAL_LOG: 'Material Log',
    EXPENSE_LOG: 'Expense Log',
    WARRANTY: 'Warranty',
    NOTE: 'Note',
    RECEIPT: 'Receipt',
    CHANGE_ORDER: 'Change Order',
    PURCHASE_ORDER: 'Purchase Order',
};

export type FieldKind =
    | 'text'          // single line plain text
    | 'longtext'      // multi-line plain text (textarea)
    | 'richtext'      // sanitized HTML (only Daily Report / Note body)
    | 'number'
    | 'money'
    | 'percent'
    | 'date'          // YYYY-MM-DD
    | 'enum'
    | 'lineItems'     // LineItem[] {id, description, quantity, rate, unitCost?}
    | 'materialItems' // MaterialLogItem[] {id, name, supplier, quantity, unitCost}
    | 'tags'          // string[]
    | 'colors'        // { primary, secondary }
    | 'template'      // template id
    | 'url'
    | 'email'
    | 'phone';

export interface FieldSpec {
    kind: FieldKind;
    label: string;
    /** Extra guidance for the model (kept short). */
    hint?: string;
    values?: readonly string[];
    /** Ask the user for it when still empty (setup card). Only facts the AI cannot derive. */
    ask?: boolean;
    /** Filled from the app context, never invented by the model. */
    source?: 'job' | 'profile';
    placeholder?: string;
}

const COMPANY = {
    companyName: { kind: 'text', label: 'Company name', source: 'profile' },
    companyAddress: { kind: 'text', label: 'Company address', source: 'profile' },
    companyPhone: { kind: 'phone', label: 'Company phone', source: 'profile' },
    companyWebsite: { kind: 'url', label: 'Company website', source: 'profile' },
} as const;

const STYLE = {
    templateId: { kind: 'template', label: 'Template', hint: 'only when the user asks for a design/style' },
    themeColors: { kind: 'colors', label: 'Brand colors', hint: 'only when the user names colors, e.g. "red and blue"' },
} as const;

const TITLE = { title: { kind: 'text', label: 'Document title' } } as const;

export const DOCUMENT_SCHEMAS = {
    INVOICE: {
        ...TITLE,
        invoiceNumber: { kind: 'text', label: 'Invoice number' },
        issueDate: { kind: 'date', label: 'Issue date' },
        dueDate: { kind: 'date', label: 'Due date' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        lineItems: { kind: 'lineItems', label: 'Line items', ask: true, placeholder: 'e.g. 2 doors at 450; 6 hours labor at 75' },
        taxRate: { kind: 'percent', label: 'Tax rate (%)', hint: 'percentage number, 8.25 means 8.25%' },
        discount: { kind: 'money', label: 'Discount', hint: 'flat amount' },
        shipping: { kind: 'money', label: 'Shipping', hint: 'flat amount' },
        notes: { kind: 'longtext', label: 'Notes', placeholder: 'e.g. payment terms or a thank-you note' },
        paypalLink: { kind: 'url', label: 'Payment link' },
        status: { kind: 'enum', label: 'Status', values: ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'] },
        ...COMPANY,
        ...STYLE,
    },
    ESTIMATE: {
        ...TITLE,
        estimateNumber: { kind: 'text', label: 'Estimate number' },
        issueDate: { kind: 'date', label: 'Issue date' },
        expiryDate: { kind: 'date', label: 'Valid until' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        lineItems: { kind: 'lineItems', label: 'Line items / scope', ask: true, placeholder: 'e.g. demo and haul-away 1 at 1200; tile 120 sq ft at 14' },
        terms: { kind: 'longtext', label: 'Terms' },
        notes: { kind: 'longtext', label: 'Notes / scope description' },
        status: { kind: 'enum', label: 'Status', values: ['Draft', 'Sent', 'Accepted', 'Rejected'] },
        ...COMPANY,
        ...STYLE,
    },
    WORK_ORDER: {
        ...TITLE,
        workOrderNumber: { kind: 'text', label: 'Work order number' },
        date: { kind: 'date', label: 'Date' },
        status: { kind: 'enum', label: 'Status', values: ['Scheduled', 'In Progress', 'On Hold', 'Completed'] },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Service address', source: 'job' },
        description: { kind: 'longtext', label: 'Work description', ask: true, placeholder: 'e.g. replace the kitchen faucet and fix the leak under the sink' },
        materialsUsed: { kind: 'longtext', label: 'Materials used' },
        hours: { kind: 'number', label: 'Hours' },
        cost: { kind: 'money', label: 'Cost' },
        terms: { kind: 'longtext', label: 'Terms' },
        ...COMPANY,
        ...STYLE,
    },
    DAILY_REPORT: {
        ...TITLE,
        reportNumber: { kind: 'text', label: 'Report number' },
        date: { kind: 'date', label: 'Report date' },
        projectName: { kind: 'text', label: 'Project name', source: 'job' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        projectAddress: { kind: 'text', label: 'Site address', source: 'job' },
        weather: { kind: 'text', label: 'Weather', hint: 'only if the user stated it' },
        temperature: { kind: 'text', label: 'Temperature', hint: 'only if the user stated it, e.g. 72°F' },
        content: { kind: 'richtext', label: 'Work performed today', ask: true, placeholder: 'e.g. framed the east wall, 3 crew, inspection passed' },
        tags: { kind: 'tags', label: 'Tags' },
        ...COMPANY,
        ...STYLE,
    },
    TIME_SHEET: {
        ...TITLE,
        workerName: { kind: 'text', label: 'Worker name', ask: true, placeholder: 'e.g. Jordan Mitchell' },
        date: { kind: 'date', label: 'Date' },
        hoursWorked: { kind: 'number', label: 'Hours worked', ask: true, placeholder: 'e.g. 8' },
        overtimeHours: { kind: 'number', label: 'Overtime hours' },
        notes: { kind: 'longtext', label: 'Work performed / notes' },
        status: { kind: 'text', label: 'Status' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        ...COMPANY,
        ...STYLE,
    },
    MATERIAL_LOG: {
        ...TITLE,
        date: { kind: 'date', label: 'Date' },
        projectName: { kind: 'text', label: 'Project name', source: 'job' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        items: { kind: 'materialItems', label: 'Materials', ask: true, placeholder: 'e.g. 20 studs at 8 from City Supply' },
        ...COMPANY,
        ...STYLE,
    },
    EXPENSE_LOG: {
        ...TITLE,
        date: { kind: 'date', label: 'Date' },
        vendor: { kind: 'text', label: 'Vendor' },
        category: { kind: 'enum', label: 'Category', values: ['Fuel', 'Food', 'Material', 'Other'] },
        item: { kind: 'text', label: 'Item' },
        lineItems: { kind: 'lineItems', label: 'Expenses', ask: true, placeholder: 'e.g. gas 1 at 64.50' },
        amount: { kind: 'money', label: 'Total amount' },
        tax: { kind: 'money', label: 'Tax amount' },
        notes: { kind: 'longtext', label: 'Notes' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        ...COMPANY,
        ...STYLE,
    },
    WARRANTY: {
        ...TITLE,
        warrantyNumber: { kind: 'text', label: 'Warranty number' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        projectAddress: { kind: 'text', label: 'Project address', source: 'job' },
        completedDate: { kind: 'date', label: 'Completion date' },
        duration: { kind: 'text', label: 'Warranty duration', ask: true, placeholder: 'e.g. 2 years from completion' },
        coverage: { kind: 'longtext', label: 'Coverage', ask: true, placeholder: 'e.g. labor and installation defects' },
        conditions: { kind: 'longtext', label: 'Conditions / exclusions' },
        ...STYLE,
    },
    NOTE: {
        title: { kind: 'text', label: 'Note title' },
        content: { kind: 'richtext', label: 'Note', ask: true, placeholder: 'e.g. call the inspector Monday about the framing' },
        tags: { kind: 'tags', label: 'Tags' },
        ...STYLE,
    },
    RECEIPT: {
        ...TITLE,
        receiptNumber: { kind: 'text', label: 'Receipt number' },
        date: { kind: 'date', label: 'Date' },
        clientName: { kind: 'text', label: 'Received from', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        amount: { kind: 'money', label: 'Amount received', ask: true, placeholder: 'e.g. 975.00' },
        description: { kind: 'longtext', label: 'Description' },
        paymentMethod: { kind: 'text', label: 'Payment method', placeholder: 'e.g. Check, Card, Cash' },
        ...COMPANY,
        ...STYLE,
    },
    CHANGE_ORDER: {
        ...TITLE,
        changeOrderNumber: { kind: 'text', label: 'Change order number' },
        date: { kind: 'date', label: 'Date' },
        clientName: { kind: 'text', label: 'Client name', source: 'job' },
        clientAddress: { kind: 'text', label: 'Client address', source: 'job' },
        description: { kind: 'longtext', label: 'Description of change', ask: true, placeholder: 'e.g. add two exterior doors to the approved scope' },
        reason: { kind: 'text', label: 'Reason', placeholder: 'e.g. Client Request' },
        currentContractSum: { kind: 'money', label: 'Current contract sum' },
        lineItems: { kind: 'lineItems', label: 'Cost changes' },
        terms: { kind: 'longtext', label: 'Terms' },
        ...COMPANY,
        ...STYLE,
    },
    PURCHASE_ORDER: {
        ...TITLE,
        poNumber: { kind: 'text', label: 'PO number' },
        date: { kind: 'date', label: 'Order date' },
        deliveryDate: { kind: 'date', label: 'Delivery date' },
        status: { kind: 'enum', label: 'Status', values: ['Draft', 'Sent', 'Received', 'Cancelled'] },
        vendorName: { kind: 'text', label: 'Vendor', ask: true, placeholder: 'e.g. City Supply' },
        vendorAddress: { kind: 'text', label: 'Vendor address' },
        vendorPhone: { kind: 'phone', label: 'Vendor phone' },
        vendorEmail: { kind: 'email', label: 'Vendor email' },
        shipToType: { kind: 'enum', label: 'Ship to', values: ['Job Site', 'Company Office', 'Custom'] },
        shipToName: { kind: 'text', label: 'Ship-to name' },
        shipToAddress: { kind: 'text', label: 'Ship-to address' },
        shipToPhone: { kind: 'phone', label: 'Ship-to phone' },
        deliveryInstructions: { kind: 'longtext', label: 'Delivery instructions' },
        lineItems: { kind: 'lineItems', label: 'Items to order', ask: true, placeholder: 'e.g. 40 studs at 6.50' },
        notes: { kind: 'longtext', label: 'Notes' },
        ...COMPANY,
        ...STYLE,
    },
} as const satisfies Record<DocKey, Record<string, FieldSpec>>;

export type DocumentSchemas = typeof DOCUMENT_SCHEMAS;
export type SchemaFieldKey<K extends DocKey> = Extract<keyof DocumentSchemas[K], string>;

export function isDocKey(value: unknown): value is DocKey {
    return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value);
}

export function getSchema(docType: DocKey): Record<string, FieldSpec> {
    return DOCUMENT_SCHEMAS[docType] as unknown as Record<string, FieldSpec>;
}

/** Every key used by any document type (for the Gemini responseSchema enum). */
export const ALL_FIELD_KEYS: string[] = Array.from(new Set(DOC_TYPES.flatMap(t => Object.keys(DOCUMENT_SCHEMAS[t]))));

/** Fields that are line-item lists, per type. */
export function getItemsKey(docType: DocKey): 'lineItems' | 'items' | null {
    const schema = getSchema(docType);
    if (schema.items?.kind === 'materialItems') return 'items';
    if (schema.lineItems?.kind === 'lineItems') return 'lineItems';
    return null;
}

/** Doc types and labels the model can recognise, plus common synonyms. */
export function resolveDocKey(value: unknown): DocKey | null {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    if (isDocKey(raw)) return raw;
    const byLabel = DOC_TYPES.find(t => DOC_LABELS[t].toLowerCase() === raw.toLowerCase());
    if (byLabel) return byLabel;
    const k = raw.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    const aliases: Record<string, DocKey> = {
        invoice: 'INVOICE', bill: 'INVOICE',
        estimate: 'ESTIMATE', quote: 'ESTIMATE', proposal: 'ESTIMATE', bid: 'ESTIMATE',
        work_order: 'WORK_ORDER', workorder: 'WORK_ORDER', service_order: 'WORK_ORDER',
        daily_report: 'DAILY_REPORT', daily_job_report: 'DAILY_REPORT', dailyjobreport: 'DAILY_REPORT', site_report: 'DAILY_REPORT', field_report: 'DAILY_REPORT',
        time_sheet: 'TIME_SHEET', timesheet: 'TIME_SHEET', time_card: 'TIME_SHEET',
        material_log: 'MATERIAL_LOG', materiallog: 'MATERIAL_LOG', materials_log: 'MATERIAL_LOG',
        expense_log: 'EXPENSE_LOG', expenselog: 'EXPENSE_LOG', expense: 'EXPENSE_LOG', expense_report: 'EXPENSE_LOG',
        warranty: 'WARRANTY', guarantee: 'WARRANTY',
        note: 'NOTE', memo: 'NOTE', site_note: 'NOTE',
        receipt: 'RECEIPT', payment_receipt: 'RECEIPT',
        change_order: 'CHANGE_ORDER', changeorder: 'CHANGE_ORDER',
        purchase_order: 'PURCHASE_ORDER', purchaseorder: 'PURCHASE_ORDER', po: 'PURCHASE_ORDER',
    };
    return aliases[k] || null;
}

// ───────────────────────────── value helpers ─────────────────────────────

const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
    jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
    nov: 11, november: 11, dec: 12, december: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar date (never UTC) as YYYY-MM-DD. */
export function toLocalYmd(date: Date = new Date()): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function isValidYmd(y: number, m: number, d: number): boolean {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function shiftYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Parses common date spellings into YYYY-MM-DD. `today` is the user's local date. */
export function normalizeDate(value: unknown, today: string = toLocalYmd()): string | undefined {
    if (value == null) return undefined;
    const raw = String(value).trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, '$1');
    if (!raw) return undefined;
    if (raw === 'today' || raw === 'now') return today;
    if (raw === 'tomorrow') return shiftYmd(today, 1);
    if (raw === 'yesterday') return shiftYmd(today, -1);
    const inDays = raw.match(/^in\s+(\d{1,3})\s+days?$/);
    if (inDays) return shiftYmd(today, Number(inDays[1]));
    let m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/);
    if (m && isValidYmd(+m[1], +m[2], +m[3])) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
    m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (m) {
        // US order (MM/DD/YYYY) first, then DD/MM/YYYY when the month would be invalid.
        if (isValidYmd(+m[3], +m[1], +m[2])) return `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}`;
        if (isValidYmd(+m[3], +m[2], +m[1])) return `${m[3]}-${pad2(+m[2])}-${pad2(+m[1])}`;
    }
    m = raw.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m && MONTHS[m[1]] && isValidYmd(+m[3], MONTHS[m[1]], +m[2])) return `${m[3]}-${pad2(MONTHS[m[1]])}-${pad2(+m[2])}`;
    m = raw.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/);
    if (m && MONTHS[m[2]] && isValidYmd(+m[3], MONTHS[m[2]], +m[1])) return `${m[3]}-${pad2(MONTHS[m[2]])}-${pad2(+m[1])}`;
    m = raw.match(/^([a-z]+)\.?\s+(\d{1,2})$/);
    if (m && MONTHS[m[1]]) {
        const y = Number(today.slice(0, 4));
        if (isValidYmd(y, MONTHS[m[1]], +m[2])) return `${y}-${pad2(MONTHS[m[1]])}-${pad2(+m[2])}`;
    }
    return undefined;
}

/** "$1,250.50", "8 hrs", 12 → number. Returns undefined when there is no number. */
export function toNumberOrUndefined(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;
    const cleaned = value.replace(/,(?=\d{3}\b)/g, '').replace(/\s+/g, ' ');
    const m = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const ENTITY_MAP: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

export function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/** Any HTML or markdown-ish text → clean plain text (keeps line breaks). */
export function toPlainText(value: unknown): string {
    if (value == null) return '';
    let s = String(value);
    if (/<[a-z!/][^>]*>/i.test(s)) {
        s = s
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<li[^>]*>/gi, '• ')
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n')
            .replace(/<[^>]+>/g, '');
    }
    s = s.replace(/&(amp|lt|gt|quot|nbsp|#39|#x27);/g, m => ENTITY_MAP[m] ?? m);
    s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+/gm, '');
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const RICH_TAGS = new Set(['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'br', 'hr', 'blockquote']);

/** Plain text → simple escaped paragraphs / bullet list. */
export function textToRichHtml(text: string): string {
    const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return blocks.map(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1 && lines.every(l => /^([-*•]|\d+[.)])\s+/.test(l))) {
            return `<ul>${lines.map(l => `<li>${escapeHtml(l.replace(/^([-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
        }
        return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    }).join('');
}

/**
 * Allow-list sanitizer that works without a DOM (Deno/Node). Keeps only simple formatting tags
 * and drops every attribute, so nothing executable can survive.
 */
export function sanitizeRichHtml(value: unknown): string {
    if (value == null) return '';
    const input = String(value).trim();
    if (!input) return '';
    if (!/<[a-z!/][^>]*>/i.test(input)) return textToRichHtml(toPlainText(input));
    let s = input
        .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|select|button|form)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    const tokens: string[] = [];
    s = s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
        let t = tag.toLowerCase();
        if (t === 'h1') t = 'h2';
        if (t === 'h5' || t === 'h6') t = 'h4';
        if (!RICH_TAGS.has(t)) return '';
        const closing = match.startsWith('</');
        const out = (t === 'br' || t === 'hr') ? (closing ? '' : `<${t}>`) : (closing ? `</${t}>` : `<${t}>`);
        tokens.push(out);
        return `\u0000${tokens.length - 1}\u0000`;
    });
    s = s.replace(/[<>]/g, ch => (ch === '<' ? '&lt;' : '&gt;'));
    s = s.replace(/\u0000(\d+)\u0000/g, (_m, i) => tokens[Number(i)]);
    return s.replace(/(<p>\s*<\/p>)+/g, '').trim();
}

const COLOR_NAMES: Record<string, string> = {
    black: '#000000', white: '#ffffff', gray: '#6b7280', grey: '#6b7280', red: '#dc2626', blue: '#2563eb',
    green: '#16a34a', yellow: '#facc15', orange: '#f97316', purple: '#7c3aed', pink: '#ec4899', teal: '#0d9488',
    cyan: '#0891b2', navy: '#1e3a8a', gold: '#d97706', brown: '#92400e', slate: '#475569', lime: '#65a30d',
    indigo: '#4f46e5', maroon: '#7f1d1d', beige: '#d6c7a1', silver: '#9ca3af',
};

function toColor(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) return v;
    return COLOR_NAMES[v];
}

export function normalizeColors(value: unknown): { primary: string; secondary: string } | undefined {
    if (!value) return undefined;
    let parts: unknown[] = [];
    if (typeof value === 'object' && !Array.isArray(value)) {
        const o = value as Record<string, unknown>;
        parts = [o.primary, o.secondary];
    } else if (Array.isArray(value)) {
        parts = value;
    } else if (typeof value === 'string') {
        const hexes = value.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi);
        parts = hexes?.length ? hexes : value.split(/\s*(?:,|\/|\+|&|\band\b|\bwith\b)\s*/i);
    }
    const colors = parts.map(toColor).filter((c): c is string => Boolean(c));
    if (!colors.length) return undefined;
    return { primary: colors[0], secondary: colors[1] || '#475569' };
}

function normalizeTags(value: unknown): string[] | undefined {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : [];
    const tags = list.map(v => toPlainText(v).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10);
    return tags.length ? Array.from(new Set(tags)) : undefined;
}

export interface NormalizedLineItem {
    id: string;
    description: string;
    quantity: number;
    rate: number;
    unitCost?: number;
}

export interface NormalizedMaterialItem {
    id: string;
    name: string;
    supplier: string;
    quantity: number;
    unitCost: number;
}

/** "2 doors at 450; 6 hours labor at 75" → rows. */
export function parseLineItemsText(text: string): Array<{ description: string; quantity: number; rate: number; supplier?: string }> {
    return text
        .split(/\s*(?:;|\n|,(?=\s*\d))\s*/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const qty = part.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x\s+)?/i);
            const rate = part.match(/(?:\bat\b|@|\bfor\b|\beach\b)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/i) || part.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/);
            const supplier = part.match(/\bfrom\s+([A-Z][\w&'. -]{1,40})$/);
            const description = part
                .replace(/^\s*\d+(?:\.\d+)?\s*(?:x\s+)?/i, '')
                .replace(/(?:\bat\b|@|\bfor\b)\s*\$?\s*\d[\d,]*(?:\.\d+)?\s*(?:each|ea|per\s+\w+|\/\w+)?/i, '')
                .replace(/\$\s*\d[\d,]*(?:\.\d+)?\s*(?:each|ea)?/i, '')
                .replace(/\bfrom\s+[A-Z][\w&'. -]{1,40}$/, '')
                .replace(/^of\s+/i, '')
                .replace(/[.,;:]+$/g, '')
                .trim();
            return {
                description,
                quantity: qty ? Number(qty[1]) : 1,
                rate: rate ? Number(rate[1].replace(/,/g, '')) : 0,
                ...(supplier ? { supplier: supplier[1].trim() } : {}),
            };
        })
        .filter(row => row.description.length > 0);
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) {
        return value.flatMap(v => {
            if (typeof v === 'string') return parseLineItemsText(v) as Record<string, unknown>[];
            return v && typeof v === 'object' ? [v as Record<string, unknown>] : [];
        });
    }
    if (typeof value === 'string' && value.trim()) return parseLineItemsText(value) as Record<string, unknown>[];
    return [];
}

export function normalizeLineItems(value: unknown, newId: () => string): NormalizedLineItem[] | undefined {
    const items = rowsFrom(value).map(row => {
        const description = toPlainText(row.description ?? row.name ?? row.item ?? row.title ?? '').replace(/\s+/g, ' ').slice(0, 300);
        const quantity = toNumberOrUndefined(row.quantity ?? row.qty);
        const rate = toNumberOrUndefined(row.rate ?? row.price ?? row.unitPrice ?? row.unit_price ?? row.amount);
        const unitCost = toNumberOrUndefined(row.unitCost ?? row.unit_cost ?? row.cost);
        const item: NormalizedLineItem = {
            id: newId(),
            description,
            quantity: quantity !== undefined && quantity > 0 ? round2(quantity) : 1,
            rate: rate !== undefined && rate >= 0 ? round2(rate) : 0,
        };
        if (unitCost !== undefined && unitCost >= 0) item.unitCost = round2(unitCost);
        return item;
    }).filter(item => item.description.length > 0).slice(0, 50);
    return items.length ? items : undefined;
}

export function normalizeMaterialItems(value: unknown, newId: () => string): NormalizedMaterialItem[] | undefined {
    const items = rowsFrom(value).map(row => {
        const name = toPlainText(row.name ?? row.description ?? row.item ?? '').replace(/\s+/g, ' ').slice(0, 200);
        const quantity = toNumberOrUndefined(row.quantity ?? row.qty);
        const unitCost = toNumberOrUndefined(row.unitCost ?? row.unit_cost ?? row.rate ?? row.cost ?? row.price);
        return {
            id: newId(),
            name,
            supplier: toPlainText(row.supplier ?? row.vendor ?? '').replace(/\s+/g, ' ').slice(0, 120),
            quantity: quantity !== undefined && quantity > 0 ? round2(quantity) : 1,
            unitCost: unitCost !== undefined && unitCost >= 0 ? round2(unitCost) : 0,
        };
    }).filter(item => item.name.length > 0).slice(0, 50);
    return items.length ? items : undefined;
}

// ───────────────────────────── aliases ─────────────────────────────

/** Legacy / model-drift key names → schema key, per type ('*' = every type). */
const KEY_ALIASES: Record<DocKey | '*', Record<string, string>> = {
    '*': { template: 'templateId', template_style: 'templateId', colors: 'themeColors', theme_colors: 'themeColors', client: 'clientName', client_name: 'clientName', client_address: 'clientAddress' },
    INVOICE: { date: 'issueDate', invoiceDate: 'issueDate', items: 'lineItems', line_items: 'lineItems', description_html: 'notes', description: 'notes', number: 'invoiceNumber', tax: 'taxRate', paymentLink: 'paypalLink' },
    ESTIMATE: { date: 'issueDate', validUntil: 'expiryDate', expirationDate: 'expiryDate', dueDate: 'expiryDate', items: 'lineItems', line_items: 'lineItems', description_html: 'notes', description: 'notes', number: 'estimateNumber', scope: 'notes' },
    WORK_ORDER: { description_html: 'description', content: 'description', materials: 'materialsUsed', number: 'workOrderNumber', projectAddress: 'clientAddress' },
    DAILY_REPORT: { body: 'content', description: 'content', description_html: 'content', notes: 'content', summary: 'content', siteAddress: 'projectAddress', number: 'reportNumber', clientAddress: 'projectAddress' },
    TIME_SHEET: { worker: 'workerName', employee: 'workerName', hours: 'hoursWorked', overtime: 'overtimeHours', description: 'notes', description_html: 'notes', content: 'notes' },
    MATERIAL_LOG: { lineItems: 'items', line_items: 'items', materials: 'items' },
    EXPENSE_LOG: { vendorName: 'vendor', total: 'amount', items: 'lineItems', line_items: 'lineItems', description: 'notes', description_html: 'notes' },
    WARRANTY: { date: 'completedDate', completionDate: 'completedDate', clientAddress: 'projectAddress', number: 'warrantyNumber', description: 'coverage', description_html: 'coverage', exclusions: 'conditions' },
    NOTE: { body: 'content', description: 'content', description_html: 'content', notes: 'content' },
    RECEIPT: { total: 'amount', method: 'paymentMethod', description_html: 'description', notes: 'description', number: 'receiptNumber' },
    CHANGE_ORDER: { description_html: 'description', contractSum: 'currentContractSum', items: 'lineItems', line_items: 'lineItems', number: 'changeOrderNumber' },
    PURCHASE_ORDER: { vendor: 'vendorName', purchaseOrderNumber: 'poNumber', number: 'poNumber', items: 'lineItems', line_items: 'lineItems', description_html: 'notes', description: 'notes' },
};

export interface NormalizeOptions {
    /** User's local date (YYYY-MM-DD) used for "today"/"tomorrow". */
    today?: string;
    newId?: () => string;
    /** Maps a free-text style description to a template id (browser passes the full resolver). */
    resolveTemplate?: (value: string) => string | undefined;
    /** Everything the user typed in this conversation; used by the fact guards. */
    userText?: string;
}

const defaultId = () => (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

export const TEMPLATE_IDS = [
    'standard', 'professional', 'elegant', 'warm', 'retro', 'modern_blue', 'tech', 'industrial', 'minimal', 'bold',
    'template_html', 'template_html_2', 'template_html_2_new', 'template_html_3', 'template_html_4', 'template_neon',
    'template_luxury', 'template_nature', 'template_geometric', 'template_pastel', 'template_vintage', 'template_blueprint',
    'template_memphis', 'template_crimson', 'template_watercolor', 'template_swiss', 'template_space', 'template_retro',
    'template_pop', 'template_serif',
] as const;

function normalizeTemplate(value: unknown, resolve?: (v: string) => string | undefined): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const v = value.trim();
    if ((TEMPLATE_IDS as readonly string[]).includes(v)) return v;
    const lower = v.toLowerCase().replace(/[\s-]+/g, '_');
    if ((TEMPLATE_IDS as readonly string[]).includes(lower)) return lower;
    const mapped = TEMPLATE_STYLE_MAP[v.toLowerCase().trim()];
    const resolved = mapped || (resolve || inferTemplateIdFromIntent)(v);
    return resolved && (TEMPLATE_IDS as readonly string[]).includes(resolved) ? resolved : undefined;
}

function normalizeEnum(value: unknown, values: readonly string[]): string | undefined {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    return values.find(opt => opt.toLowerCase() === v)
        || values.find(opt => v && (opt.toLowerCase().startsWith(v) || v.startsWith(opt.toLowerCase())));
}

function normalizeValue(spec: FieldSpec, value: unknown, opts: Required<Pick<NormalizeOptions, 'today' | 'newId'>> & NormalizeOptions): unknown {
    switch (spec.kind) {
        case 'text': {
            const t = toPlainText(value).replace(/\s*\n+\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
            return t ? t.slice(0, 300) : undefined;
        }
        case 'longtext': {
            const t = toPlainText(value);
            return t ? t.slice(0, 5000) : undefined;
        }
        case 'richtext': {
            const html = sanitizeRichHtml(value);
            return toPlainText(html) ? html.slice(0, 30000) : undefined;
        }
        case 'number': {
            const n = toNumberOrUndefined(value);
            return n !== undefined && n >= 0 ? round2(n) : undefined;
        }
        case 'money': {
            const n = toNumberOrUndefined(value);
            return n !== undefined && n >= 0 ? round2(n) : undefined;
        }
        case 'percent': {
            const n = toNumberOrUndefined(value);
            if (n === undefined || n < 0) return undefined;
            const hadPercentSign = typeof value === 'string' && value.includes('%');
            const pct = !hadPercentSign && n > 0 && n < 1 ? n * 100 : n;
            return pct <= 100 ? round2(pct) : undefined;
        }
        case 'date':
            return normalizeDate(value, opts.today);
        case 'enum':
            return normalizeEnum(value, spec.values || []);
        case 'lineItems':
            return normalizeLineItems(value, opts.newId);
        case 'materialItems':
            return normalizeMaterialItems(value, opts.newId);
        case 'tags':
            return normalizeTags(value);
        case 'colors':
            return normalizeColors(value);
        case 'template':
            return normalizeTemplate(value, opts.resolveTemplate);
        case 'url': {
            const t = toPlainText(value).trim();
            if (!t) return undefined;
            const withScheme = /^https?:\/\//i.test(t) ? t : (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : '');
            return withScheme && /^https?:\/\/[^\s<>"']+$/i.test(withScheme) ? withScheme.slice(0, 500) : undefined;
        }
        case 'email': {
            const t = toPlainText(value).trim();
            return /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(t) ? t.toLowerCase() : undefined;
        }
        case 'phone': {
            const t = toPlainText(value).replace(/\s+/g, ' ').trim();
            return /\d{3}/.test(t) && t.length <= 40 ? t : undefined;
        }
        default:
            return undefined;
    }
}

function isEmptyValue(value: unknown): boolean {
    if (value == null || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * Turns any loose object (model output, legacy payload, setup card values) into
 * `Partial<TypeData>` for the given type: only schema keys, correct value types, no empties.
 */
export function normalizePrefill(docType: DocKey, raw: unknown, options: NormalizeOptions = {}): Record<string, unknown> {
    const opts = { today: options.today || toLocalYmd(), newId: options.newId || defaultId, ...options };
    const schema = getSchema(docType);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const source = raw as Record<string, unknown>;
    const aliases = { ...KEY_ALIASES['*'], ...KEY_ALIASES[docType] };
    const merged: Record<string, unknown> = {};
    // Real keys win over aliases.
    for (const [key, value] of Object.entries(source)) {
        const target = schema[key] ? key : aliases[key];
        if (!target || !schema[target]) continue;
        if (key !== target && merged[target] !== undefined && !isEmptyValue(merged[target])) continue;
        if (key !== target && !isEmptyValue(source[target])) continue;
        merged[target] = value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(merged)) {
        const normalized = normalizeValue(schema[key], value, opts);
        if (!isEmptyValue(normalized)) out[key] = normalized;
    }
    if (docType === 'DAILY_REPORT' && opts.userText !== undefined) {
        return guardDailyReportFacts(out, opts.userText);
    }
    return out;
}

/** Keys the user still has to provide (setup card), in schema order. */
export function getMissingAskFields(docType: DocKey, prefill: Record<string, unknown>): string[] {
    const schema = getSchema(docType);
    return Object.entries(schema)
        .filter(([key, spec]) => spec.ask && isEmptyValue(prefill[key]))
        .map(([key]) => key);
}

export function fieldLabel(docType: DocKey, key: string): string {
    return getSchema(docType)[key]?.label || key;
}

// ───────────────────────────── fact guards (AI-009) ─────────────────────────────

const INJURY_RE = /\b(injur(?:y|ies|ed)|hurt|cut (?:his|her|their|my|a|the)\b|cut\b[^.]{0,30}\b(?:hand|finger|arm|leg|head|foot)|incident|accident|first[- ]aid|hospital|ambulance|bleed(?:ing)?|burn(?:ed|t)\b|fell\b|slipped|tripped|near[- ]miss|recordable)/i;
const NO_INCIDENT_CLAIM_RE = /\b(?:no|zero|without(?:\s+any)?|nil)\s+(?:\w+\s+){0,2}(?:incidents?|injur(?:y|ies)|accidents?|recordables?|safety (?:issues|concerns|events))\b|\b(?:incident|injury|accident)[- ]free\b|\bsafe(?:ly)? (?:day|shift)\b|\bwith no (?:issues|problems)\b/i;
const WEATHER_WORD_RE = /\b(sunny|sun|clear(?:\s+skies?)?|cloudy|clouds?|overcast|rain(?:y|ing|ed)?|drizzle|showers?|storm(?:y|s)?|thunder\w*|snow(?:y|ing|ed)?|sleet|hail|fog(?:gy)?|windy|winds|wind gusts?|gusts?|hot|cold|humid(?:ity)?|freezing|heat(?:wave)?|weather|mild|chilly)\b/i;
const TEMPERATURE_RE = /-?\d+(?:\.\d+)?\s*(?:°|º|degrees?\b|deg\b)\s*(?:[cf]\b|celsius|fahrenheit)?|-?\d+(?:\.\d+)?\s*(?:celsius|fahrenheit)\b/i;

function sentencesOf(text: string): string[] {
    return text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Daily reports are site records: drop statements the user never made.
 * - weather / temperature only when the user mentioned them;
 * - "no incidents" style claims only when the user said so AND reported no injury;
 * - a reported injury is always present in the body.
 */
export function guardDailyReportFacts(prefill: Record<string, unknown>, userText: string): Record<string, unknown> {
    const out = { ...prefill };
    const text = userText || '';
    if (out.weather && !WEATHER_WORD_RE.test(text)) delete out.weather;
    if (out.temperature && !TEMPERATURE_RE.test(text)) delete out.temperature;
    const injury = INJURY_RE.test(text.replace(new RegExp(NO_INCIDENT_CLAIM_RE.source, 'gi'), ' '));
    const userClaimsNoIncident = NO_INCIDENT_CLAIM_RE.test(text) && !injury;
    if (typeof out.content === 'string' && out.content) {
        let html = out.content as string;
        if (!userClaimsNoIncident) {
            html = html.replace(/<(p|li)>([\s\S]*?)<\/\1>/g, (_m, tag: string, inner: string) => {
                const kept = inner.split(/(?<=[.!?])\s+/).filter(sentence => !NO_INCIDENT_CLAIM_RE.test(toPlainText(sentence)));
                const joined = kept.join(' ').trim();
                return joined ? `<${tag}>${joined}</${tag}>` : '';
            });
            html = html.replace(/<(ul|ol)>\s*<\/\1>/g, '');
        }
        if (injury && !INJURY_RE.test(toPlainText(html))) {
            const reported = sentencesOf(text)
                .filter(s => INJURY_RE.test(s.replace(new RegExp(NO_INCIDENT_CLAIM_RE.source, 'gi'), ' ')))
                .slice(0, 3);
            if (reported.length) html += `<h3>Safety</h3><p>${reported.map(escapeHtml).join(' ')}</p>`;
        }
        if (toPlainText(html)) out.content = html; else delete out.content;
    }
    return out;
}
