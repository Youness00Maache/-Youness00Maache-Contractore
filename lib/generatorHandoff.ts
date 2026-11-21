/**
 * Website document generators (/estimate-generator, /invoice-generator) → the app.
 *
 * The visitor fills the free generator, then clicks "Create it in ContractorDocs". We keep what they typed in
 * localStorage (`cd_generator_draft`, never in a URL), send them to sign up / log in, and once they are signed in
 * App.tsx creates a job (+ saved client) and opens the document in the real editor, filled with their data and saved
 * once as a draft. The dashboard tour / setup assistant run later, when they first open the dashboard.
 *
 * Pure + SSR-safe: every storage access is guarded, tests pass their own storage.
 */
import { FormType } from '../types.ts';

export const GENERATOR_DRAFT_KEY = 'cd_generator_draft';
/** Forget a hand-off that was never picked up after 7 days. */
export const GENERATOR_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type GeneratorDocKind = 'estimate' | 'invoice';

export interface GeneratorLine { description: string; quantity: number; rate: number }

export interface GeneratorDraft {
  v: 1;
  kind: GeneratorDocKind;
  /** ms epoch */
  createdAt: number;
  /** page it came from, e.g. "/estimate-generator" */
  source: string;
  company: string;
  client: string;
  jobName: string;
  jobAddress: string;
  /** document number typed by the visitor ('' = let the app number it) */
  number: string;
  /** YYYY-MM-DD ('' = today) */
  date: string;
  lines: GeneratorLine[];
  taxRate: number;
  /** invoice: deposit already received */
  deposit: number;
  /** estimate: valid for N days */
  validDays: number;
  notes: string;
}

/** What the generator form holds (strings, as typed). */
export interface GeneratorInput {
  kind: GeneratorDocKind;
  source?: string;
  company?: string;
  client?: string;
  jobName?: string;
  jobAddress?: string;
  number?: string;
  date?: string;
  lines?: Array<{ description?: string; quantity?: string | number; rate?: string | number }>;
  tax?: string | number;
  /** invoice: deposit received; estimate: valid days */
  extra?: string | number;
  notes?: string;
}

/** Sample values shown in the generator before the visitor types: never carried into the app as real data. */
export const GENERATOR_PLACEHOLDERS = {
  company: ['your company llc', 'your company', 'your business'],
  client: ['client name', 'client'],
  number: ['inv-1001', 'est-2001'],
};

const MAX_LINES = 60;
const MAX_TEXT = 300;
const MAX_NOTES = 4000;

interface StoreLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const defaultStore = (): StoreLike | null => {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const text = (v: unknown, max = MAX_TEXT): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longText = (v: unknown): string => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTES);
const num = (v: unknown, min: number, max: number, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 1000) / 1000));
};
const isYmd = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const isPlaceholder = (field: keyof typeof GENERATOR_PLACEHOLDERS, v: string): boolean =>
  GENERATOR_PLACEHOLDERS[field].includes(v.trim().toLowerCase());

/** Generator form → clean draft (placeholders dropped, numbers parsed, empty lines removed). */
export function buildGeneratorDraft(input: GeneratorInput, now = Date.now()): GeneratorDraft {
  const kind: GeneratorDocKind = input.kind === 'invoice' ? 'invoice' : 'estimate';
  const company = text(input.company);
  const client = text(input.client);
  const number = text(input.number, 40);
  const date = text(input.date, 10);
  const lines = (input.lines || [])
    .map((l) => ({ description: text(l?.description), quantity: num(l?.quantity, 0, 1_000_000, 1), rate: num(l?.rate, -10_000_000, 10_000_000, 0) }))
    .filter((l) => l.description || l.rate !== 0)
    .slice(0, MAX_LINES);
  const extra = num(input.extra, 0, kind === 'invoice' ? 10_000_000 : 365, kind === 'invoice' ? 0 : 30);
  return {
    v: 1,
    kind,
    createdAt: now,
    source: text(input.source, 120) || `/${kind}-generator`,
    company: isPlaceholder('company', company) ? '' : company,
    client: isPlaceholder('client', client) ? '' : client,
    jobName: text(input.jobName, 120),
    jobAddress: text(input.jobAddress),
    number: isPlaceholder('number', number) ? '' : number,
    date: isYmd(date) ? date : '',
    lines,
    taxRate: num(input.tax, 0, 100, 0),
    deposit: kind === 'invoice' ? extra : 0,
    validDays: kind === 'estimate' ? Math.round(extra) || 30 : 30,
    notes: longText(input.notes),
  };
}

/** Validates a stored value; expired, future-dated or malformed → null. */
export function parseGeneratorDraft(raw: string | null, now = Date.now()): GeneratorDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || v.v !== 1 || (v.kind !== 'estimate' && v.kind !== 'invoice')) return null;
    const createdAt = Number(v.createdAt);
    if (!Number.isFinite(createdAt) || createdAt > now + 60_000 || now - createdAt > GENERATOR_DRAFT_TTL_MS) return null;
    // re-clean everything: the value lives in the visitor's browser and may have been edited
    const clean = buildGeneratorDraft({
      kind: v.kind, source: v.source, company: v.company, client: v.client, jobName: v.jobName, jobAddress: v.jobAddress,
      number: v.number, date: v.date, lines: Array.isArray(v.lines) ? v.lines : [], tax: v.taxRate,
      extra: v.kind === 'invoice' ? v.deposit : v.validDays, notes: v.notes,
    }, createdAt);
    return clean;
  } catch {
    return null;
  }
}

export function saveGeneratorDraft(draft: GeneratorDraft, store: StoreLike | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(GENERATOR_DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function readGeneratorDraft(store: StoreLike | null = defaultStore(), now = Date.now()): GeneratorDraft | null {
  if (!store) return null;
  let raw: string | null = null;
  try { raw = store.getItem(GENERATOR_DRAFT_KEY); } catch { return null; }
  const draft = parseGeneratorDraft(raw, now);
  if (!draft && raw) clearGeneratorDraft(store); // expired / broken: drop it
  return draft;
}

export function clearGeneratorDraft(store: StoreLike | null = defaultStore()): void {
  try { store?.removeItem(GENERATOR_DRAFT_KEY); } catch { /* storage unavailable */ }
}

export const generatorDocLabel = (kind: GeneratorDocKind): string => (kind === 'invoice' ? 'invoice' : 'estimate');

export const generatorFormType = (kind: GeneratorDocKind): FormType => (kind === 'invoice' ? FormType.Invoice : FormType.Estimate);

/** The job created for the document: its name, client and site address. */
export function generatorJobValues(d: GeneratorDraft): { name: string; clientName: string; clientAddress: string } {
  const firstLine = d.lines.find((l) => l.description)?.description || '';
  const fallback = d.client
    ? `${d.kind === 'invoice' ? 'Invoice' : 'Estimate'} for ${d.client}`
    : firstLine || (d.kind === 'invoice' ? 'My first invoice' : 'My first estimate');
  return { name: (d.jobName || fallback).slice(0, 120), clientName: d.client, clientAddress: d.jobAddress };
}

const addDays = (ymd: string, days: number): string => {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

/**
 * The new document's data, opened in the editor as a "seed" (components/forms/useDocumentForm.ts): only the fields
 * the visitor filled are set, everything else keeps the app's defaults (profile, design, numbering, payment link).
 */
export function generatorDocumentSeed(d: GeneratorDraft, today: string, makeId: () => string): Record<string, unknown> {
  const issueDate = d.date || today;
  const lineItems = d.lines.map((l) => ({
    id: makeId(),
    description: l.description,
    quantity: l.quantity,
    rate: l.rate,
    ...(d.kind === 'estimate' ? { unitCost: 0 } : {}),
  }));
  const seed: Record<string, unknown> = {
    issueDate,
    taxRate: d.taxRate,
    ...(lineItems.length ? { lineItems } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.company ? { companyName: d.company } : {}),
    ...(d.client ? { clientName: d.client } : {}),
    ...(d.jobAddress ? { clientAddress: d.jobAddress } : {}),
  };
  if (d.jobName) seed.title = d.jobName;
  if (d.kind === 'invoice') {
    if (d.number) seed.invoiceNumber = d.number;
    seed.dueDate = addDays(issueDate, 30);
    if (d.deposit > 0) seed.amountPaid = d.deposit;
  } else {
    if (d.number) seed.estimateNumber = d.number;
    seed.expiryDate = addDays(issueDate, d.validDays);
    seed.terms = `This estimate is valid for ${d.validDays} days. Payment schedule: 50% deposit, 50% upon completion.`;
  }
  return seed;
}
