/**
 * Who may use which document design (owner decision 2026-11-14).
 *
 *  - Basic designs: every plan.
 *  - Premium designs (and their customization): paid plans (Premium, Premium + AI).
 *  - A document that already uses a Premium design keeps it on every plan ("grandfathered"): it renders and
 *    downloads with it, a Free user can keep it while editing, but can't switch it to another Premium design.
 *    The design a document had when it was opened (or the document it was made from: convert, revise) is its
 *    baseline.
 *  - New documents start with the user's default design (user_settings 'documents.design', lib/userData.ts);
 *    a Free user's Premium default falls back to Classic.
 *
 * Enforced where designs are chosen (picker), saved (useDocumentForm.save), used for new documents
 * (useDocumentForm defaults, AI plans) and saved as the default (Settings / picker). There is no database rule
 * (no schema change was allowed); the original app had no design gating at all.
 *
 * Pure (no network, no DOM except the upgrade event), so scripts/template-gating-check.ts can test it.
 */
import { isPaidTier, normalizeTier } from './plans.ts';
import { DEFAULT_TEMPLATE_ID, getTemplateMeta, isPremiumDesign, isTemplateId, resolveTemplateId } from '../utils/templates/registry.ts';
import { normalizeDesignOptions, sameDesignOptions } from '../utils/templates/designOptions.ts';
import { AI_UPGRADE_EVENT } from '../src/ai/events.ts';
import type { DocumentDesignOptions } from '../types.ts';

// ------------------------------------------------------------------------------------------- current plan
export { setDesignPlan, designPlan } from './designPlan.ts';

// ------------------------------------------------------------------------------------------------ rules
export const canUsePremiumDesigns = (plan: string | null | undefined): boolean => isPaidTier(normalizeTier(plan));

/** Can this plan choose this design for a document? */
export const canUseDesign = (plan: string | null | undefined, templateId: string | null | undefined): boolean =>
    !isPremiumDesign(templateId) || canUsePremiumDesigns(plan);

/** Do two stored ids show the same design (legacy ids and aliases included)? */
export const sameDesign = (a: string | null | undefined, b: string | null | undefined): boolean =>
    !!a && !!b && resolveTemplateId(a) === resolveTemplateId(b);

/** May a document whose baseline design is `baselineId` show `nextId` on this plan? */
export const designAllowedFor = (plan: string | null | undefined, nextId: string | null | undefined, baselineId: string | null | undefined): boolean =>
    canUseDesign(plan, nextId) || sameDesign(nextId, baselineId);

/** A document is "keeping" a Premium design the plan could not choose today. */
export const isGrandfathered = (plan: string | null | undefined, templateId: string | null | undefined): boolean =>
    !!templateId && isPremiumDesign(templateId) && !canUsePremiumDesigns(plan);

export interface DesignBaseline {
    templateId?: string | null;
    designOptions?: unknown;
}

export const baselineOf = (data: unknown): DesignBaseline | null => {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    return { templateId: typeof d.templateId === 'string' ? d.templateId : null, designOptions: d.designOptions };
};

export interface EnforcedDesign<T> {
    data: T;
    /** the design was replaced (the user picked a Premium design without a paid plan) */
    replaced: boolean;
    /** name of the design that was refused, for the message */
    refusedName?: string;
    /** name of the design used instead */
    usedName?: string;
}

/**
 * Applies the rules to a document about to be saved. Paid plans: unchanged. Free plan: a Premium design that is
 * not the document's baseline becomes `fallbackId` (a Basic design); a kept Premium design keeps its baseline
 * customization (customizing is part of the paid plans).
 */
export const enforceDocumentDesign = <T extends object>(
    data: T,
    plan: string | null | undefined,
    baseline: DesignBaseline | null,
    fallbackId: string = DEFAULT_TEMPLATE_ID,
): EnforcedDesign<T> => {
    if (canUsePremiumDesigns(plan)) return { data, replaced: false };
    const d = data as Record<string, unknown>;
    const id = typeof d.templateId === 'string' && d.templateId.trim() ? d.templateId : null;
    if (!id || !isPremiumDesign(id)) return { data, replaced: false };
    if (!sameDesign(id, baseline?.templateId)) {
        const fallback = isPremiumDesign(fallbackId) ? DEFAULT_TEMPLATE_ID : resolveTemplateId(fallbackId);
        const { designOptions: _drop, ...rest } = d;
        return {
            data: { ...rest, templateId: fallback } as T,
            replaced: true,
            refusedName: getTemplateMeta(id).name,
            usedName: getTemplateMeta(fallback).name,
        };
    }
    // the kept Premium design: its customization stays as it was
    if (!sameDesignOptions(d.designOptions, baseline?.designOptions)) {
        const kept = normalizeDesignOptions(baseline?.designOptions);
        const { designOptions: _drop, ...rest } = d;
        return { data: (kept ? { ...rest, designOptions: kept } : rest) as T, replaced: false };
    }
    return { data, replaced: false };
};

/** The message shown when a save replaced a Premium design. */
export const replacedDesignMessage = (r: EnforcedDesign<unknown>): string =>
    `${r.refusedName || 'That design'} is a Premium design, so this document was saved with ${r.usedName || 'Classic'}. Upgrade to Premium to use it.`;

// ------------------------------------------------------------------------------------ the default design
/** public.user_settings key of the user's default design for new documents. */
export const DESIGN_DEFAULT_SETTING = 'documents.design';

export interface DesignDefault {
    templateId: string;
    themeColors?: { primary: string; secondary: string; custom?: boolean; font?: string; paper?: string };
    fontFamily?: string;
    paperSize?: 'letter' | 'a4';
    designOptions?: DocumentDesignOptions;
    updatedAt?: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Validates a stored default (anything unexpected is dropped; null when there is no usable design). */
export const normalizeDesignDefault = (raw: unknown): DesignDefault | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const id = typeof r.templateId === 'string' ? r.templateId.trim() : '';
    if (!id) return null;
    const templateId = resolveTemplateId(id);
    if (!isTemplateId(templateId)) return null;
    const out: DesignDefault = { templateId };
    const tc = r.themeColors && typeof r.themeColors === 'object' ? (r.themeColors as Record<string, unknown>) : null;
    if (tc) {
        const primary = typeof tc.primary === 'string' && HEX.test(tc.primary) ? tc.primary : '';
        const secondary = typeof tc.secondary === 'string' && HEX.test(tc.secondary) ? tc.secondary : '';
        const colors: NonNullable<DesignDefault['themeColors']> = { primary, secondary };
        if (tc.custom === true && primary) colors.custom = true;
        if (typeof tc.font === 'string' && tc.font.length <= 40) colors.font = tc.font;
        if (tc.paper === 'a4' || tc.paper === 'letter') colors.paper = tc.paper;
        if (colors.primary || colors.font || colors.paper) out.themeColors = colors;
    }
    if (typeof r.fontFamily === 'string' && r.fontFamily.length <= 40) out.fontFamily = r.fontFamily;
    if (r.paperSize === 'a4' || r.paperSize === 'letter') out.paperSize = r.paperSize;
    const opts = normalizeDesignOptions(r.designOptions);
    if (opts) out.designOptions = opts;
    if (typeof r.updatedAt === 'string') out.updatedAt = r.updatedAt;
    return out;
};

/** The default as this plan may use it: a Premium default becomes Classic on Free (colors, font, paper kept). */
export const designDefaultFor = (def: DesignDefault | null, plan: string | null | undefined): DesignDefault => {
    if (!def) return { templateId: DEFAULT_TEMPLATE_ID };
    if (canUseDesign(plan, def.templateId)) return def;
    const { designOptions: _drop, ...rest } = def;
    return { ...rest, templateId: DEFAULT_TEMPLATE_ID };
};

/** The Basic design a refused Premium choice falls back to: the user's default when it is Basic, else Classic. */
export const basicFallbackId = (def: DesignDefault | null): string =>
    def && !isPremiumDesign(def.templateId) ? resolveTemplateId(def.templateId) : DEFAULT_TEMPLATE_ID;

/**
 * Puts the user's default design on a NEW document's defaults. Only documents still on the built-in default
 * (Classic with the template colors) are changed, so a design passed in by the caller always wins.
 */
export const applyDesignDefault = <T extends object>(base: T, def: DesignDefault | null, plan: string | null | undefined): T => {
    if (!def) return base;
    const b = base as Record<string, unknown>;
    const current = typeof b.templateId === 'string' ? b.templateId : '';
    if (current && resolveTemplateId(current) !== DEFAULT_TEMPLATE_ID) return base;
    const use = designDefaultFor(def, plan);
    const out: Record<string, unknown> = { ...b, templateId: use.templateId };
    if (use.themeColors) {
        const prev = b.themeColors && typeof b.themeColors === 'object' ? (b.themeColors as Record<string, unknown>) : {};
        out.themeColors = {
            ...prev,
            ...(use.themeColors.custom && use.themeColors.primary ? { primary: use.themeColors.primary, secondary: use.themeColors.secondary || '', custom: true } : {}),
            ...(use.themeColors.font ? { font: use.themeColors.font } : {}),
            ...(use.themeColors.paper ? { paper: use.themeColors.paper } : {}),
        };
    }
    if (use.fontFamily) out.fontFamily = use.fontFamily;
    if (use.paperSize) out.paperSize = use.paperSize;
    if (use.designOptions) out.designOptions = { ...use.designOptions };
    return out as T;
};

/** The design fields of a document, as a default to save ("Use for new documents"). */
export const designDefaultFromDocument = (data: unknown): DesignDefault | null => {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    return normalizeDesignDefault({
        templateId: d.templateId || DEFAULT_TEMPLATE_ID,
        themeColors: d.themeColors,
        fontFamily: d.fontFamily,
        paperSize: d.paperSize,
        designOptions: d.designOptions,
        updatedAt: new Date().toISOString(),
    });
};

// ------------------------------------------------------------------------- default design: storage glue
/** Storage functions of lib/userData.ts (injected, so this module stays pure and testable). */
export interface DesignDefaultStore {
    readLocal: () => unknown;
    load: () => Promise<unknown>;
    save: (value: unknown) => Promise<'account' | 'device' | 'failed' | string>;
}

/** The user's default design from this device's copy (synchronous; new documents use it). */
export const readUserDesignDefault = (store: Pick<DesignDefaultStore, 'readLocal'>): DesignDefault | null => {
    try { return normalizeDesignDefault(store.readLocal()); } catch { return null; }
};

/**
 * Saves the default design for new documents (null = back to Classic). A Premium design is refused on the Free
 * plan ('locked'): the caller opens the upgrade window.
 */
export const saveUserDesignDefault = async (store: Pick<DesignDefaultStore, 'save'>, value: DesignDefault | null, plan: string | null | undefined): Promise<string> => {
    const clean = normalizeDesignDefault({ ...(value || { templateId: DEFAULT_TEMPLATE_ID }), updatedAt: new Date().toISOString() });
    if (!clean) return 'failed';
    if (!canUseDesign(plan, clean.templateId)) return 'locked';
    return store.save(clean);
};

// ----------------------------------------------------------------------------------------- upgrade window
export const PREMIUM_DESIGN_UPGRADE_MESSAGE = 'Premium designs and design customization are included in the Premium and Premium + AI plans.';

/** Opens the app's upgrade window (App listens to this event, see src/ai/events.ts). */
export const requestDesignUpgrade = (designName?: string): void => {
    const message = designName
        ? `${designName} is a Premium design. ${PREMIUM_DESIGN_UPGRADE_MESSAGE}`
        : PREMIUM_DESIGN_UPGRADE_MESSAGE;
    try {
        window.dispatchEvent(new CustomEvent(AI_UPGRADE_EVENT, { detail: { feature: 'designs', message } }));
    } catch { /* non-browser environment */ }
};
