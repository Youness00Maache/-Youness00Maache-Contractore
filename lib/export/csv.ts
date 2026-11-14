/**
 * CSV writing for "Export everything" and the bookkeeper CSV (pure, no DOM / network: scripts/export-check.ts tests it).
 *
 * Format (RFC 4180, what Excel, Google Sheets, Numbers, QuickBooks and Xero all read):
 *   - UTF-8 with a byte-order mark (Excel otherwise opens accented names as "Ã©")
 *   - comma separated, CRLF line endings, a header row
 *   - a cell is quoted when it holds a comma, quote, line break or leading/trailing space; quotes are doubled
 *   - text that a spreadsheet would run as a formula (=, +, -, @, tab, CR at the start) gets a leading apostrophe,
 *     so a client named "=HYPERLINK(...)" can't run anything when the file is opened (CSV injection). Plain numbers
 *     written as text ("-12.50", "+3") are left alone.
 *   - money is always written with 2 decimals and no currency sign or thousands separator ("1234.50")
 *   - dates are ISO ("2026-03-04"; timestamps "2026-03-04T15:20:00.000Z")
 */
import { roundMoney, toNumber } from '../../utils/money.ts';

export const CSV_BOM = '﻿';
export const CSV_EOL = '\r\n';

export type CsvValue = string | number | boolean | null | undefined | Date;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?(\d+([.,]\d+)*|\.\d+)$/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/** One cell, escaped. */
export const csvCell = (value: CsvValue): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    let s = value instanceof Date ? (Number.isNaN(value.getTime()) ? '' : value.toISOString()) : String(value);
    // lone surrogates / NUL would make an invalid file for some readers
    s = s.replace(/\u0000/g, '');
    if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s.trim()) && !/^-+$/.test(s)) s = `'${s}`;
    return NEEDS_QUOTES.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line (with its CRLF). */
export const csvLine = (values: readonly CsvValue[]): string => values.map(csvCell).join(',') + CSV_EOL;

/** A whole file: BOM + header + rows. */
export const toCsv = (header: readonly string[], rows: readonly (readonly CsvValue[])[], opts: { bom?: boolean } = {}): string =>
    (opts.bom === false ? '' : CSV_BOM) + csvLine(header) + rows.map(csvLine).join('');

/** Money cell: "1234.50" (always 2 decimals, half-up like the app). Empty input stays empty when `blankIfEmpty`. */
export const money = (value: unknown, blankIfEmpty = false): string => {
    if (blankIfEmpty && (value === null || value === undefined || value === '')) return '';
    return roundMoney(toNumber(value)).toFixed(2);
};

/** Quantity / hours: up to 3 decimals, no trailing zeros ("2.5", "10", "0.125"). */
export const qty = (value: unknown, blankIfEmpty = false): string => {
    if (blankIfEmpty && (value === null || value === undefined || value === '')) return '';
    const n = toNumber(value);
    return String(Math.round(n * 1000) / 1000);
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/**
 * Rich text (notes, daily report content) → readable plain text for a CSV cell: block ends become line breaks,
 * list items get a bullet ("•", not "-", which a spreadsheet would read as a formula), tags are dropped and the
 * common entities decoded. Capped at `max` characters.
 */
export const plainText = (value: unknown, max = 5000): string => {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (/<[a-z!/][^>]*>/i.test(s)) {
        s = s
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n• ')
            .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|ul|ol|table)>/gi, '\n')
            .replace(/<[^>]+>/g, '');
    }
    s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
        const c = code.toLowerCase();
        if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16) || 32);
        if (c.startsWith('#')) return c === '#39' ? "'" : String.fromCodePoint(parseInt(c.slice(1), 10) || 32);
        return ENTITIES[c] ?? m;
    });
    s = s.replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
