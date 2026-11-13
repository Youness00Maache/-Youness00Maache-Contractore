/**
 * Receipt OCR (Tesseract.js, loaded lazily) + pure text parsers.
 * The parsers are exported so they can be unit tested without running OCR.
 *
 * Results describe the RECEIPT: `vendor`, `vendorAddress`, `vendorPhone` are the store's details and must never be
 * written into the contractor's own company fields.
 */
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

const getWorker = (): Promise<Worker> => {
    if (!workerPromise) {
        workerPromise = import('tesseract.js')
            .then(mod => mod.createWorker('eng'))
            .catch(err => {
                workerPromise = null;
                throw err;
            });
    }
    return workerPromise;
};

/** Free the ~10 MB OCR worker (call when the expense form unmounts). */
export const terminateOCRWorker = async (): Promise<void> => {
    const pending = workerPromise;
    workerPromise = null;
    if (!pending) return;
    try {
        const worker = await pending;
        await worker.terminate();
    } catch {
        /* already gone */
    }
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const isoIfValid = (y: number, m: number, d: number): string | null => {
    if (y < 100) y += 2000;
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
};

/** True when the user's locale writes dates day-first (most of the world except the US). */
export const prefersDayFirst = (): boolean => {
    const lang = typeof navigator !== 'undefined' ? navigator.language || '' : '';
    return !!lang && !/^en-(us|ph)$/i.test(lang) && !/^en$/i.test(lang);
};

const parseMoney = (s: string): number | null => {
    const n = parseFloat(s.replace(/[,\s]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// ---------------------------------------------------------------------------
// parsers
// ---------------------------------------------------------------------------

/** Returns a local YYYY-MM-DD (no timezone conversion) or null. */
export const parseDate = (text: string, dayFirst = prefersDayFirst()): string | null => {
    // YYYY-MM-DD / YYYY/MM/DD
    for (const m of text.matchAll(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/g)) {
        const iso = isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]));
        if (iso) return iso;
    }
    // 12 Jan 2024 / Jan 12, 2024
    for (const m of text.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{2,4})\b/gi)) {
        const iso = isoIfValid(Number(m[3]), MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, Number(m[1]));
        if (iso) return iso;
    }
    for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})\b/gi)) {
        const iso = isoIfValid(Number(m[3]), MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, Number(m[2]));
        if (iso) return iso;
    }
    // a/b/yyyy: day-first when a > 12, month-first when b > 12, otherwise the user's locale decides
    for (const m of text.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g)) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const y = Number(m[3]);
        const dayFirstHere = a > 12 ? true : b > 12 ? false : dayFirst;
        const iso = dayFirstHere ? isoIfValid(y, b, a) : isoIfValid(y, a, b);
        if (iso) return iso;
    }
    return null;
};

const TOTAL_LINE = /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total\s*amount|amount\s*paid|total)\b/i;
const NOT_TOTAL_LINE = /\b(sub\s*-?\s*total|total\s*tax|tax\s*total|total\s*savings|you\s*saved|total\s*items?|items?\s*total|change|tendered|cash\b)/i;
const MONEY_AT_END = /(-?\$?\s*[\d,]+\.\d{2})\s*[A-Z]?\s*$/;

/** The receipt total: the last "total / amount due" line, else the largest amount that isn't cash tendered/change. */
export const parseAmount = (text: string): number | null => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let fromTotalLine: number | null = null;
    for (const line of lines) {
        if (!TOTAL_LINE.test(line) || NOT_TOTAL_LINE.test(line)) continue;
        const m = line.match(MONEY_AT_END);
        const n = m ? parseMoney(m[1].replace('$', '')) : null;
        if (n !== null && n > 0) fromTotalLine = n; // keep the LAST one (grand total is usually lowest on the receipt)
    }
    if (fromTotalLine !== null) return fromTotalLine;

    let max: number | null = null;
    for (const line of lines) {
        if (/\b(cash|change|tendered|visa|mastercard|amex|debit|credit)\b/i.test(line)) continue;
        for (const m of line.matchAll(/\$?\s*([\d,]+\.\d{2})\b/g)) {
            const n = parseMoney(m[1]);
            if (n !== null && n > 0 && (max === null || n > max)) max = n;
        }
    }
    return max;
};

/** Sales tax amount as a number. */
export const parseTax = (text: string): number | null => {
    const lines = text.split('\n').map(l => l.trim());
    for (const line of lines) {
        if (!/^(?:total\s*)?(?:sales\s*)?(tax|hst|gst|pst|vat)\b/i.test(line)) continue;
        const m = line.match(MONEY_AT_END);
        const n = m ? parseMoney(m[1].replace('$', '')) : null;
        if (n !== null && n > 0 && n < 100000) return n;
    }
    const m = text.match(/\b(?:sales\s*tax|tax|hst|gst|vat)\b[^\n\d]{0,20}\$?\s*([\d,]+\.\d{2})/i);
    const n = m ? parseMoney(m[1]) : null;
    return n !== null && n > 0 && n < 100000 ? n : null;
};

const KNOWN_STORES = [
    'The Home Depot', 'Home Depot', "Lowe's", 'Lowes', 'Menards', 'Ace Hardware', 'Harbor Freight', 'True Value',
    'Tractor Supply', 'Northern Tool', 'Grainger', 'Ferguson', 'HD Supply', 'Platt Electric', 'Gexpro', 'Rexel',
    'Sherwin-Williams', 'Sherwin Williams', 'Benjamin Moore', 'Costco', 'Walmart', 'Shell', 'Chevron', 'Exxon', 'BP',
];

/** Store / vendor name. */
export const parseVendor = (text: string): string | null => {
    const upper = text.toUpperCase();
    for (const store of KNOWN_STORES) if (upper.includes(store.toUpperCase())) return store.replace(/^The /, '');
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    for (const line of lines.slice(0, 5)) {
        if (/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(line)) continue; // phone
        if (/^\d/.test(line) || /\b(st|ave|rd|blvd|street|road|suite)\b/i.test(line)) continue; // address
        if (/receipt|invoice|welcome|thank/i.test(line)) continue;
        if (line.length <= 40 && /[a-z]{3,}/i.test(line)) return line.replace(/[^\w&'.,\- ]/g, '').trim() || null;
    }
    return null;
};

/** The vendor's phone and street address (NOT the contractor's). */
export const parseVendorContact = (text: string): { address: string | null; phone: string | null } => {
    const phoneMatch = text.match(/\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/);
    const phone = phoneMatch ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}` : null;
    const full = text.match(/(\d+\s+[^,\n]+,[^,\n]+,\s*[A-Z]{2}\s*\d{5})/i);
    let address = full ? full[1].trim() : null;
    if (!address) {
        for (const line of text.split('\n')) {
            if (/^\s*\d+\s+[a-z0-9 .]+\b(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|ct|way|hwy|pkwy|parkway|plaza)\b/i.test(line) && line.length < 70) {
                address = line.trim();
                break;
            }
        }
    }
    return { address, phone };
};

export interface OCRLineItem {
    description: string;
    price: number;
    quantity: number;
}

/** Line items between the header and the subtotal/total block. */
export const parseLineItems = (text: string): OCRLineItem[] => {
    const lines = text.split('\n');
    const items: OCRLineItem[] = [];
    const header = /^(?:description|desc|item|product|service|qty|quantity|price|amount|rate|cost)\b/i;
    const footer = /^(?:sub\s*-?total|total|tax|balance|amount due|payment|thank|change|cash)/i;
    const skip = /^(subtotal|total|tax|balance|change|cash|credit|debit|visa|mastercard|amex|date|time|auth|ref|term|inv|store|tel|phone)/i;
    const itemRe = /^(?:(\d+(?:\.\d+)?)\s*[xX@]?\s+)?(.+?)[\s$]+([\d,]+\.\d{2})\s*[A-Z]?\s*$/;
    let inSection = false;
    let seen = 0;
    for (const raw of lines) {
        const line = raw.trim();
        seen += 1;
        if (line.length < 3) continue;
        if (!inSection && header.test(line)) { inSection = true; continue; }
        if (footer.test(line)) { if (inSection || items.length) break; continue; }
        if (!(inSection || seen > 3) || skip.test(line)) continue;
        const m = line.match(itemRe);
        if (!m) continue;
        const quantity = m[1] ? parseFloat(m[1]) || 1 : 1;
        const description = m[2].trim();
        const price = parseMoney(m[3]);
        if (price === null || price <= 0 || price >= 100000 || description.length <= 2) continue;
        if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(description)) continue;
        items.push({ description, price, quantity });
    }
    return items;
};

/** Footer notes such as "Thank you for shopping". */
export const parseNotes = (text: string): string | null => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(-10);
    const notes = lines.filter(l => !/\$\d|\d+\.\d{2}/.test(l) && l.length < 100 && /thank you|thanks for|appreciate|visit us|come again|have a/i.test(l));
    return notes.length ? notes.join('\n') : null;
};

export interface OCRResult {
    vendor: string | null;
    vendorAddress: string | null;
    vendorPhone: string | null;
    date: string | null;
    amount: number | null;
    tax: number | null;
    lineItems: OCRLineItem[];
    notes: string | null;
    rawText: string;
    confidence: number;
}

/** Parses already-recognized receipt text (pure). */
export const parseReceiptText = (text: string, confidence = 0): OCRResult => {
    const { address, phone } = parseVendorContact(text);
    return {
        vendor: parseVendor(text),
        vendorAddress: address,
        vendorPhone: phone,
        date: parseDate(text),
        amount: parseAmount(text),
        tax: parseTax(text),
        lineItems: parseLineItems(text),
        notes: parseNotes(text),
        rawText: text,
        confidence,
    };
};

/** Runs OCR on a receipt photo. Throws when OCR could not run (e.g. offline while loading the OCR engine). */
export const processReceiptImage = async (image: File | Blob | string): Promise<OCRResult> => {
    const worker = await getWorker();
    const { data } = await worker.recognize(image as any);
    return parseReceiptText(data?.text || '', data?.confidence || 0);
};
