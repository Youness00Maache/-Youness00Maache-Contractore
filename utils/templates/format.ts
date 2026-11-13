/**
 * Display formatting for documents. Never returns "undefined", "NaN" or "Invalid Date".
 * Date-only strings (YYYY-MM-DD) are treated as LOCAL calendar dates (no UTC shift).
 */
import { formatMoney, roundMoney, toNumber } from '../money.ts';

export const isBlank = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (typeof v === 'number' && !Number.isFinite(v));

/** Plain string for display, '' for null/undefined/NaN/objects. */
export const str = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'string') return v.trim() === 'undefined' || v.trim() === 'null' || v.trim() === 'NaN' ? '' : v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return '';
};

export const parseLocalDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  // Last resort for things like "Nov 12, 2026"; refuse ambiguous numeric formats.
  if (/[a-z]/i.test(s)) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
};

export interface FormatOptions { locale?: string; currency?: string }

/** "Nov 12, 2026". Unparseable non-empty input is returned as written (caller escapes it). */
export const formatDate = (value: unknown, opts: FormatOptions = {}): string => {
  const d = parseLocalDate(value);
  if (!d) return typeof value === 'string' ? str(value).trim() : '';
  try {
    return new Intl.DateTimeFormat(opts.locale || 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return d.toDateString();
  }
};

export const formatDateTime = (value: unknown, opts: FormatOptions = {}): string => {
  const d = parseLocalDate(value);
  if (!d) return typeof value === 'string' ? str(value).trim() : '';
  const hasTime = typeof value !== 'string' || /T\d{2}:\d{2}/.test(value);
  try {
    return new Intl.DateTimeFormat(opts.locale || 'en-US', hasTime
      ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return d.toLocaleString();
  }
};

/** Adds a duration like "2 years", "18 months", "90 days" to a date; null if it can't be understood. */
export const addDuration = (start: unknown, duration: unknown): Date | null => {
  const base = parseLocalDate(start);
  if (!base || typeof duration !== 'string') return null;
  const m = /(\d+(?:\.\d+)?)\s*(year|yr|month|mo|week|wk|day)s?\b/i.exec(duration);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const d = new Date(base.getTime());
  if (unit.startsWith('y')) d.setFullYear(d.getFullYear() + Math.round(n));
  else if (unit.startsWith('mo')) d.setMonth(d.getMonth() + Math.round(n));
  else if (unit.startsWith('w')) d.setDate(d.getDate() + Math.round(n * 7));
  else d.setDate(d.getDate() + Math.round(n));
  return d;
};

export const money = (value: unknown, opts: FormatOptions = {}): string => formatMoney(value, opts.currency || 'USD', opts.locale || 'en-US');

/** Signed money: "−$20.00" for discounts and credits. */
export const negMoney = (value: unknown, opts: FormatOptions = {}): string => `−${money(Math.abs(toNumber(value)), opts)}`;

export const formatNumber = (value: unknown, maxFractionDigits = 2, locale = 'en-US'): string => {
  const n = toNumber(value);
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: maxFractionDigits }).format(n);
  } catch {
    return String(roundMoney(n));
  }
};

export const formatPercent = (value: unknown, maxFractionDigits = 2): string => `${formatNumber(value, maxFractionDigits)}%`;

export const titleCase = (s: string): string => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/** "PhaseTimeline" / "labor_shift_log" → "Phase Timeline" / "Labor Shift Log" */
export const humanize = (key: string): string =>
  titleCase(String(key || '').replace(/[_-]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim());

export const initials = (name: string): string => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Safe file-name segment: ASCII letters, digits, dot, dash, underscore. */
export const fileSafe = (value: unknown, max = 60): string =>
  str(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max);
