/**
 * Proposal builder (roadmap N4, contractor side). Pure logic: no React, no Supabase, so the forms, the PDF model,
 * the portal and scripts/proposal-check.ts share it.
 *
 * Everything lives in the estimate's `documents.data` (no database change):
 *   lineItems[].optional / .selected   optional add-ons. The money rule itself is in utils/money.ts
 *                                       (isExcludedOptionalLine / countedLineItems / lineItemAmount), used by EVERY
 *                                       total: forms, PDF, portal, costing, analytics, exports, invoices.
 *   proposal = {
 *     sections:   [{ id, kind, title, text, style }]   scope of work, inclusions, exclusions, assumptions, timeline
 *     milestones: [{ id, label, kind, mode, value, due }] deposit / progress / final, % of the total or fixed amounts
 *     images:     [{ id, url, caption, photoId? }]     public document images (same mechanism as the logo upload)
 *   }
 * Reusable proposal templates (scope + milestones + terms) are a user_settings value ('proposals.templates',
 * lib/userData.ts), parsed and size-checked here.
 */
import { countedLineItems, isExcludedOptionalLine, isOptionalLine, roundMoney, toNumber, type MoneyLineItem } from '../utils/money.ts';

// ------------------------------------------------------------------------------------------------ types
export type ScopeKind = 'scope' | 'inclusions' | 'exclusions' | 'assumptions' | 'timeline';
export type ScopeStyle = 'text' | 'bullets';
export interface ScopeSection { id: string; kind: ScopeKind; title: string; text: string; style: ScopeStyle }

export type MilestoneKind = 'deposit' | 'progress' | 'final';
export type MilestoneMode = 'percent' | 'amount';
export interface Milestone { id: string; label: string; kind: MilestoneKind; mode: MilestoneMode; value: number; due: string }

export interface ProposalImage { id: string; url: string; caption: string; photoId?: string }

export interface ProposalData {
    sections?: ScopeSection[];
    milestones?: Milestone[];
    images?: ProposalImage[];
}

export interface ProposalTemplate {
    id: string;
    name: string;
    sections: ScopeSection[];
    milestones: Milestone[];
    terms: string;
    updatedAt: string;
}

// ------------------------------------------------------------------------------------------------ limits
export const PROPOSAL_LIMITS = {
    sections: 10,
    sectionText: 4000,
    sectionTitle: 60,
    milestones: 8,
    milestoneLabel: 60,
    milestoneDue: 60,
    images: 8,
    /** size of a picked file before compression (the upload is compressed to ~300 KB by compressImage) */
    imageBytes: 15 * 1024 * 1024,
    caption: 140,
    templateName: 60,
    terms: 6000,
} as const;
/** Saved proposal templates per plan: Free keeps one, paid plans up to 20 (lib/plans.ts: volume = Premium). */
export const PROPOSAL_TEMPLATE_LIMITS = { free: 1, paid: 20 } as const;
/**
 * Max size of the serialized 'proposals.templates' value: public.user_settings.value is limited to 20,000 characters
 * of jsonb text (which adds a space after every ':' and ','), so JSON.stringify must stay well below that.
 */
export const PROPOSAL_TEMPLATES_MAX_CHARS = 16_000;
export const PROPOSAL_TEMPLATES_SETTING = 'proposals.templates';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const SCOPE_KINDS: ReadonlyArray<{ kind: ScopeKind; title: string; style: ScopeStyle; hint: string }> = [
    { kind: 'scope', title: 'Scope of work', style: 'text', hint: 'What you will do, in plain words.' },
    { kind: 'inclusions', title: 'Inclusions', style: 'bullets', hint: 'One item per line.' },
    { kind: 'exclusions', title: 'Exclusions', style: 'bullets', hint: 'What the price does not cover. One item per line.' },
    { kind: 'assumptions', title: 'Assumptions', style: 'bullets', hint: 'What the price relies on (access, condition, permits).' },
    { kind: 'timeline', title: 'Timeline / schedule', style: 'bullets', hint: 'Start, phases and finish. One step per line.' },
];
const KINDS = new Set<ScopeKind>(SCOPE_KINDS.map(k => k.kind));
export const scopeKindTitle = (kind: ScopeKind): string => SCOPE_KINDS.find(k => k.kind === kind)?.title || 'Scope of work';

export const MILESTONE_KIND_LABELS: Record<MilestoneKind, string> = { deposit: 'Deposit', progress: 'Progress payment', final: 'Final payment' };

// ------------------------------------------------------------------------------------------------ helpers
const rec = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const line = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const block = (v: unknown, max: number): string => String(v ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max);
let seq = 0;
export const newProposalId = (prefix = 'p'): string => {
    const c = (globalThis as { crypto?: Crypto }).crypto;
    const r = c?.randomUUID ? c.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    seq = (seq + 1) % 1000;
    return `${prefix}-${r}${seq}`;
};
const idOf = (v: unknown, prefix: string): string => {
    const s = line(v, 40);
    return /^[A-Za-z0-9_-]+$/.test(s) ? s : newProposalId(prefix);
};

/** "- tile\n* grout\n• trim" → ["tile", "grout", "trim"] (blank lines dropped). */
export const bulletItems = (text: string): string[] =>
    String(text || '').split('\n').map(s => s.replace(/^\s*(?:[-*•‣▪◦]|\d+[.)])\s+/, '').trim()).filter(Boolean);

/** https links only (public images); everything else is refused. */
export const isHttpsUrl = (v: unknown): boolean => /^https:\/\/[^\s"'<>]+$/i.test(String(v ?? '').trim());

// ------------------------------------------------------------------------------------------------ parse
const parseSection = (raw: unknown): ScopeSection | null => {
    const r = rec(raw);
    const kind = (KINDS.has(r.kind) ? r.kind : 'scope') as ScopeKind;
    const text = block(r.text, PROPOSAL_LIMITS.sectionText);
    const title = line(r.title, PROPOSAL_LIMITS.sectionTitle) || scopeKindTitle(kind);
    return { id: idOf(r.id, 's'), kind, title, text, style: r.style === 'bullets' ? 'bullets' : 'text' };
};
const parseMilestone = (raw: unknown): Milestone | null => {
    const r = rec(raw);
    const kind = (r.kind === 'deposit' || r.kind === 'final' ? r.kind : 'progress') as MilestoneKind;
    const mode = (r.mode === 'amount' ? 'amount' : 'percent') as MilestoneMode;
    const value = Math.max(0, toNumber(r.value));
    return { id: idOf(r.id, 'm'), label: line(r.label, PROPOSAL_LIMITS.milestoneLabel) || MILESTONE_KIND_LABELS[kind], kind, mode, value, due: line(r.due, PROPOSAL_LIMITS.milestoneDue) };
};
const parseImage = (raw: unknown): ProposalImage | null => {
    const r = rec(raw);
    if (!isHttpsUrl(r.url)) return null;
    const img: ProposalImage = { id: idOf(r.id, 'i'), url: String(r.url).trim(), caption: line(r.caption, PROPOSAL_LIMITS.caption) };
    if (typeof r.photoId === 'string' && r.photoId) img.photoId = line(r.photoId, 64);
    return img;
};
const uniqueIds = <T extends { id: string }>(list: T[], prefix: string): T[] => {
    const seen = new Set<string>();
    return list.map(x => {
        const id = seen.has(x.id) ? newProposalId(prefix) : x.id;
        seen.add(id);
        return id === x.id ? x : { ...x, id };
    });
};

/** The proposal of an estimate's data, cleaned (empty lists when there is none). */
export const readProposal = (data: unknown): Required<ProposalData> => {
    const p = rec(rec(data).proposal);
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    return {
        sections: uniqueIds(arr(p.sections).map(parseSection).filter((x): x is ScopeSection => !!x).slice(0, PROPOSAL_LIMITS.sections), 's'),
        milestones: uniqueIds(arr(p.milestones).map(parseMilestone).filter((x): x is Milestone => !!x).slice(0, PROPOSAL_LIMITS.milestones), 'm'),
        images: uniqueIds(arr(p.images).map(parseImage).filter((x): x is ProposalImage => !!x).slice(0, PROPOSAL_LIMITS.images), 'i'),
    };
};

/** Sections that have something to print (title alone is not enough). */
export const filledSections = (p: ProposalData): ScopeSection[] =>
    (p.sections || []).filter(s => (s.style === 'bullets' ? bulletItems(s.text).length > 0 : s.text.trim() !== ''));

export const hasProposalContent = (data: unknown): boolean => {
    const p = readProposal(data);
    return filledSections(p).length > 0 || p.milestones.length > 0 || p.images.length > 0;
};

/** Writes the proposal back; an empty proposal removes the key (so the data stays as it was before). */
export const withProposal = <T extends Record<string, any>>(data: T, p: ProposalData): T => {
    const clean: ProposalData = {};
    if (p.sections?.length) clean.sections = p.sections;
    if (p.milestones?.length) clean.milestones = p.milestones;
    if (p.images?.length) clean.images = p.images;
    const next: Record<string, any> = { ...data };
    if (Object.keys(clean).length) next.proposal = clean; else delete next.proposal;
    return next as T;
};

// ------------------------------------------------------------------------------------------------ scope sections
export const newSection = (kind: ScopeKind): ScopeSection => {
    const def = SCOPE_KINDS.find(k => k.kind === kind) || SCOPE_KINDS[0];
    return { id: newProposalId('s'), kind: def.kind, title: def.title, text: '', style: def.style };
};
export const addSection = (list: ScopeSection[], kind: ScopeKind): ScopeSection[] =>
    list.length >= PROPOSAL_LIMITS.sections ? list : [...list, newSection(kind)];
export const updateSection = (list: ScopeSection[], id: string, patch: Partial<Omit<ScopeSection, 'id'>>): ScopeSection[] =>
    list.map(s => (s.id === id ? parseSection({ ...s, ...patch, id }) || s : s));
export const removeSection = (list: ScopeSection[], id: string): ScopeSection[] => list.filter(s => s.id !== id);
/** Moves a section up (-1) or down (+1); unchanged at the ends. */
export const moveSection = <T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] => {
    const i = list.findIndex(s => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return list;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
};

// ------------------------------------------------------------------------------------------------ optional add-ons
/** Optional add-on lines (selected or not), in their order. */
export const optionalLines = <T extends MoneyLineItem>(items: T[] | null | undefined): T[] => (Array.isArray(items) ? items.filter(li => isOptionalLine(li)) : []);
/** The regular (always counted) lines. */
export const regularLines = <T extends MoneyLineItem>(items: T[] | null | undefined): T[] => (Array.isArray(items) ? items.filter(li => !isOptionalLine(li)) : []);
/** Regular lines first, then the add-ons (each keeps its own order). Same array when there are no add-ons. */
export const mergeLines = <T extends MoneyLineItem>(regular: T[], optional: T[]): T[] => (optional.length ? [...regular, ...optional] : regular);
/** Marks a line as an optional add-on (not counted) or back to a normal line. */
export const setLineOptional = <T extends MoneyLineItem>(li: T, optional: boolean): T => {
    const next = { ...li } as Record<string, unknown>;
    if (optional) { next.optional = true; next.selected = false; } else { delete next.optional; delete next.selected; }
    return next as T;
};
export const setLineSelected = <T extends MoneyLineItem>(li: T, selected: boolean): T => ({ ...li, optional: true, selected });
export { countedLineItems, isExcludedOptionalLine, isOptionalLine };

// ------------------------------------------------------------------------------------------------ milestones
export const newMilestone = (kind: MilestoneKind, value = 0, mode: MilestoneMode = 'percent'): Milestone =>
    ({ id: newProposalId('m'), label: MILESTONE_KIND_LABELS[kind], kind, mode, value, due: kind === 'deposit' ? 'On signing' : kind === 'final' ? 'On completion' : '' });

/** Ready-made schedules (all in %). */
export const MILESTONE_PRESETS: ReadonlyArray<{ id: string; label: string; build: () => Milestone[] }> = [
    { id: '50-50', label: '50 / 50', build: () => [newMilestone('deposit', 50), newMilestone('final', 50)] },
    { id: '30-40-30', label: '30 / 40 / 30', build: () => [newMilestone('deposit', 30), { ...newMilestone('progress', 40), due: 'Halfway' }, newMilestone('final', 30)] },
    { id: '10-40-40-10', label: '10 / 40 / 40 / 10', build: () => [newMilestone('deposit', 10), { ...newMilestone('progress', 40), label: 'Rough-in' }, { ...newMilestone('progress', 40), label: 'Finishes' }, newMilestone('final', 10)] },
];

export interface MilestoneRow extends Milestone {
    /** money due for this milestone (cents; the last one absorbs the rounding remainder when the schedule is valid) */
    amount: number;
    /** share of the total, 0-100 */
    percent: number;
}
export interface MilestoneSchedule {
    rows: MilestoneRow[];
    /** plain-words problem, null when the schedule adds up to the total */
    error: string | null;
    /** what the stated values add up to (money) */
    sum: number;
    total: number;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Amounts of a payment schedule for an estimate total. Percent milestones are `total × % / 100`, fixed ones their
 * amount, rounded to cents; when the schedule adds up to the total the LAST milestone takes the rounding remainder,
 * so the amounts always sum to the total exactly. A schedule that does not add up gets an error (and plain amounts).
 */
export const computeMilestones = (milestones: Milestone[] | null | undefined, totalRaw: number): MilestoneSchedule => {
    const list = Array.isArray(milestones) ? milestones : [];
    const total = roundMoney(Math.max(0, toNumber(totalRaw)));
    const raw = list.map(m => (m.mode === 'amount' ? Math.max(0, toNumber(m.value)) : total * Math.max(0, toNumber(m.value)) / 100));
    const pctSum = list.reduce((a, m) => a + (m.mode === 'percent' ? Math.max(0, toNumber(m.value)) : 0), 0);
    const fixedSum = roundMoney(list.reduce((a, m) => a + (m.mode === 'amount' ? Math.max(0, toNumber(m.value)) : 0), 0));
    const sum = roundMoney(raw.reduce((a, b) => a + b, 0));
    let error: string | null = null;
    if (!list.length) error = null;
    else if (list.some(m => m.mode === 'percent' && toNumber(m.value) > 100)) error = 'A payment can’t be more than 100%.';
    else if (list.every(m => m.mode === 'percent')) {
        if (Math.abs(pctSum - 100) > 0.0001) error = `The payments add up to ${round4(pctSum)}%, not 100%.`;
    } else if (fixedSum > total + 0.005) error = `The fixed amounts (${fixedSum.toFixed(2)}) are more than the total (${total.toFixed(2)}).`;
    else if (Math.abs(sum - total) > 0.01) error = `The payments add up to ${sum.toFixed(2)}, not the total of ${total.toFixed(2)}.`;
    const amounts = raw.map(v => roundMoney(v));
    if (!error && amounts.length) {
        const others = roundMoney(amounts.slice(0, -1).reduce((a, b) => a + b, 0));
        amounts[amounts.length - 1] = roundMoney(total - others);
    }
    const rows = list.map((m, i) => ({ ...m, amount: amounts[i], percent: total > 0 ? round4((amounts[i] / total) * 100) : m.mode === 'percent' ? round4(toNumber(m.value)) : 0 }));
    return { rows, error, sum, total };
};

export const updateMilestone = (list: Milestone[], id: string, patch: Partial<Omit<Milestone, 'id'>>): Milestone[] =>
    list.map(m => (m.id === id ? parseMilestone({ ...m, ...patch, id }) || m : m));
export const addMilestone = (list: Milestone[]): Milestone[] => {
    if (list.length >= PROPOSAL_LIMITS.milestones) return list;
    const used = list.reduce((a, m) => a + (m.mode === 'percent' ? toNumber(m.value) : 0), 0);
    const allPct = list.every(m => m.mode === 'percent');
    const rest = allPct ? Math.max(0, round4(100 - used)) : 0;
    return [...list, newMilestone(list.length ? 'progress' : 'deposit', rest)];
};
export const removeMilestone = (list: Milestone[], id: string): Milestone[] => list.filter(m => m.id !== id);

/** Cumulative share (0-100) of the total billed once milestone `index` is paid. */
export const cumulativePercent = (schedule: MilestoneSchedule, index: number): number => {
    if (index < 0) return 0;
    if (index >= schedule.rows.length - 1 && !schedule.error) return 100;
    const paid = schedule.rows.slice(0, index + 1).reduce((a, r) => a + r.amount, 0);
    return schedule.total > 0 ? Math.min(100, round4((paid / schedule.total) * 100)) : 0;
};

// ------------------------------------------------------------------------------------------------ images
export interface ImageCandidate { type?: string | null; size?: number | null; name?: string | null }
/** Why a picked file can't be added ('' = fine). */
export const imageProblem = (file: ImageCandidate, currentCount: number): string => {
    if (currentCount >= PROPOSAL_LIMITS.images) return `Up to ${PROPOSAL_LIMITS.images} images per proposal.`;
    const type = String(file.type || '').toLowerCase();
    if (!(IMAGE_TYPES as readonly string[]).includes(type)) return 'Use a JPG, PNG or WebP photo.';
    if (toNumber(file.size) > PROPOSAL_LIMITS.imageBytes) return `This photo is larger than ${Math.round(PROPOSAL_LIMITS.imageBytes / 1024 / 1024)} MB.`;
    return '';
};
export const addImage = (list: ProposalImage[], img: { url: string; caption?: string; photoId?: string }): ProposalImage[] => {
    if (list.length >= PROPOSAL_LIMITS.images || !isHttpsUrl(img.url)) return list;
    const parsed = parseImage({ ...img, id: newProposalId('i') });
    return parsed ? [...list, parsed] : list;
};
export const updateImageCaption = (list: ProposalImage[], id: string, caption: string): ProposalImage[] =>
    list.map(i => (i.id === id ? { ...i, caption: line(caption, PROPOSAL_LIMITS.caption) } : i));
export const removeImage = (list: ProposalImage[], id: string): ProposalImage[] => list.filter(i => i.id !== id);

// ------------------------------------------------------------------------------------------------ templates
const parseTemplate = (raw: unknown): ProposalTemplate | null => {
    const r = rec(raw);
    const name = line(r.name, PROPOSAL_LIMITS.templateName);
    if (!name) return null;
    const p = readProposal({ proposal: { sections: r.sections, milestones: r.milestones } });
    return { id: idOf(r.id, 't'), name, sections: p.sections, milestones: p.milestones, terms: block(r.terms, PROPOSAL_LIMITS.terms), updatedAt: line(r.updatedAt, 40) };
};

/** Saved templates from the raw user_settings value ([] when none or unreadable). */
export const parseProposalTemplates = (raw: unknown): ProposalTemplate[] => {
    const list = Array.isArray(raw) ? raw : Array.isArray(rec(raw).templates) ? rec(raw).templates : [];
    return uniqueIds((list as unknown[]).map(parseTemplate).filter((x): x is ProposalTemplate => !!x).slice(0, PROPOSAL_TEMPLATE_LIMITS.paid), 't');
};

/** Value to store, or an error when it is too big. */
export const serializeProposalTemplates = (list: ProposalTemplate[]): { value: { version: 1; templates: ProposalTemplate[] } | null; error: string | null } => {
    const value = { version: 1 as const, templates: list.slice(0, PROPOSAL_TEMPLATE_LIMITS.paid) };
    return JSON.stringify(value).length > PROPOSAL_TEMPLATES_MAX_CHARS
        ? { value: null, error: 'These templates are too long to save. Shorten some sections or delete a template.' }
        : { value, error: null };
};

/** Template from the estimate being edited: its scope sections (exclusions included), milestones and terms. */
export const templateFromEstimate = (name: string, data: unknown, now = new Date().toISOString()): ProposalTemplate | null => {
    const p = readProposal(data);
    return parseTemplate({ id: newProposalId('t'), name, sections: p.sections, milestones: p.milestones, terms: rec(data).terms, updatedAt: now });
};

/** Free: one template (replacing it is fine); paid plans: up to 20. '' when allowed, else the reason. */
export const templateSaveProblem = (list: ProposalTemplate[], name: string, paid: boolean): string => {
    const replacing = list.some(t => t.name.toLowerCase() === line(name, PROPOSAL_LIMITS.templateName).toLowerCase());
    if (!line(name, PROPOSAL_LIMITS.templateName)) return 'Give the template a name.';
    if (replacing) return '';
    const max = paid ? PROPOSAL_TEMPLATE_LIMITS.paid : PROPOSAL_TEMPLATE_LIMITS.free;
    if (list.length >= max) return paid ? `You can keep up to ${max} templates. Delete one first.` : 'premium';
    return '';
};

/** Adds or replaces (same name) a template; newest first. */
export const upsertTemplate = (list: ProposalTemplate[], tpl: ProposalTemplate): ProposalTemplate[] => {
    const rest = list.filter(t => t.name.toLowerCase() !== tpl.name.toLowerCase());
    const old = list.find(t => t.name.toLowerCase() === tpl.name.toLowerCase());
    return [{ ...tpl, id: old?.id || tpl.id }, ...rest];
};

/**
 * Applies a template to an estimate: its scope sections and milestones replace the proposal's (fresh ids), its terms
 * replace the terms when it has some. Images, lines and everything else are kept.
 */
export const applyProposalTemplate = <T extends Record<string, any>>(data: T, tpl: ProposalTemplate): T => {
    const current = readProposal(data);
    const sections = tpl.sections.map(s => ({ ...s, id: newProposalId('s') }));
    const milestones = tpl.milestones.map(m => ({ ...m, id: newProposalId('m') }));
    const next = withProposal(data, { sections, milestones, images: current.images });
    return tpl.terms.trim() ? { ...next, terms: tpl.terms } : next;
};

// ------------------------------------------------------------------------------------------------ signed content
/** Part of what the client signs (components/forms/signedLock.ts): scope, schedule and images. Null when empty. */
export const proposalSignedKey = (data: unknown): unknown => {
    if (!hasProposalContent(data)) return null;
    const p = readProposal(data);
    return {
        sections: filledSections(p).map(s => [s.kind, s.title, s.style, s.text.trim()]),
        milestones: p.milestones.map(m => [m.label, m.kind, m.mode, roundMoney(m.value), m.due]),
        images: p.images.map(i => [i.url, i.caption]),
    };
};

/** Lines of an estimate that a milestone invoice bills (good/better/best already resolved by the caller). */
export const billableLines = <T extends MoneyLineItem>(lines: T[]): T[] => countedLineItems(lines);
