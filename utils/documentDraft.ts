/**
 * Turns a router proposal into the exact prefill a form receives.
 *
 * PREFILL CONTRACT (forms / hooks/useDocumentDraftPrefill.ts):
 *   prefillData = Partial<TypeData for that FormType>   // keys are exactly the types.ts field names
 *               & { __draftId: string;                    // unique per opened draft: apply once
 *                   __autoSave?: boolean }                // true = save immediately (user pressed Save)
 *   - line items: { id, description, quantity, rate, unitCost? }; material log items: { id, name, supplier, quantity, unitCost }
 *   - numbers are numbers, dates are local YYYY-MM-DD, plain-text fields never contain HTML,
 *     only Daily Job Report / Note `content` is (sanitized) HTML.
 *   - no control keys besides __draftId/__autoSave (no ai_open_mode, auto_submit, rawInput, document_metadata …).
 *   - estimates may carry good / better / best options: estimateOptions (+ estimateOptionsInternal, the internal costs),
 *     in the saved format of lib/estimateOptions.ts; lineItems then mirror the Recommended option.
 */
import { FormType } from '../types.ts';
import type { Client, Job, UserProfile } from '../types.ts';
import {
    DOC_LABELS, getSchema, normalizePrefill, resolveDocKey, toLocalYmd, type DocKey,
} from '../src/config/documentFieldRequirements.ts';
import { DOC_TYPE_TO_FORM_TYPE } from '../src/config/docTypeMap.ts';
import { inferTemplateIdFromIntent } from '../src/utils/aiTemplateUtils.ts';
import { detectDocTypeFromText } from '../supabase/functions/ai-assistant/shared/mockModel.ts';
import type { MasterDocumentType } from '../src/config/docTypeMap.ts';

export { flattenPayloadWithMetadata, splitDraftToStructuredPayload, type DocumentMetadata } from './documentMetadata.ts';
export { FORM_TYPE_TO_DOC_TYPE } from '../src/config/docTypeMap.ts';

/** What a form receives in `prefillData`. */
export type DocumentDraftPrefill = Record<string, unknown> & {
    __draftId?: string;
    __autoSave?: boolean;
};

export interface DraftContext {
    job?: Job | null;
    client?: Client | null;
    clients?: Client[];
    profile?: UserProfile | null;
    today?: string;
    /** everything the user typed (fact guards for daily reports) */
    userText?: string;
}

/**
 * Normalizes the AI fields and fills the boxes that come from the app (job, client, company),
 * only when the AI/user did not give a value. Returns Partial<TypeData> without control keys.
 */
export function finalizeDraft(docType: DocKey, rawPrefill: Record<string, unknown> | null | undefined, ctx: DraftContext = {}): Record<string, unknown> {
    const schema = getSchema(docType);
    const prefill = normalizePrefill(docType, rawPrefill || {}, {
        today: ctx.today || toLocalYmd(),
        resolveTemplate: inferTemplateIdFromIntent,
        userText: ctx.userText,
    });
    const job = ctx.job || null;
    const client = ctx.client
        || (job && ctx.clients ? ctx.clients.find(c => c.name.trim().toLowerCase() === (job.clientName || '').trim().toLowerCase()) : undefined)
        || null;
    const fromContext: Record<string, unknown> = {
        clientName: client?.name || job?.clientName,
        clientAddress: client?.address || job?.clientAddress,
        projectName: job?.name,
        projectAddress: job?.clientAddress || client?.address,
        companyName: ctx.profile?.companyName,
        companyAddress: ctx.profile?.address,
        companyPhone: ctx.profile?.phone,
        companyWebsite: ctx.profile?.website,
    };
    const contextual = normalizePrefill(docType, Object.fromEntries(
        Object.entries(fromContext).filter(([key, value]) => schema[key]?.source && value && prefill[key] === undefined),
    ), { today: ctx.today });
    return { ...contextual, ...prefill, ...estimateOptionKeys(docType, rawPrefill) };
}

/**
 * Good / better / best options of an estimate draft (not AI "fields": the assistant builds them, see
 * supabase/functions/ai-assistant/shared/estimateOptionsDraft.ts). Passed on as they are; the form merge
 * (hooks/useDocumentDraftPrefill.ts) validates them and opens them like a saved estimate.
 */
function estimateOptionKeys(docType: DocKey, raw: Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (docType !== 'ESTIMATE' || !raw) return {};
    const isObject = (v: unknown) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    if (!isObject(raw.estimateOptions)) return {};
    return {
        estimateOptions: raw.estimateOptions,
        ...(isObject(raw.estimateOptionsInternal) ? { estimateOptionsInternal: raw.estimateOptionsInternal } : {}),
    };
}

/** Adds the one-shot draft id (and auto-save flag) the forms use to apply a prefill exactly once. */
export function toFormPrefill(prefill: Record<string, unknown>, options: { autoSave?: boolean; draftId?: string } = {}): DocumentDraftPrefill {
    const id = options.draftId || (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return { ...prefill, __draftId: id, ...(options.autoSave ? { __autoSave: true } : {}) };
}

export function formTypeForDoc(docType: DocKey): FormType {
    return DOC_TYPE_TO_FORM_TYPE[docType];
}

export function docLabel(docType: DocKey): string {
    return DOC_LABELS[docType];
}

/**
 * Compatibility wrapper used by older in-form AI handlers: returns a normalized, context-filled
 * prefill for the given type. Unknown types return the input unchanged.
 */
export function normalizeDocumentDraft(
    raw: Record<string, unknown> | null | undefined,
    documentType: MasterDocumentType | string | null,
    ctx: { job?: Job; clients?: Client[]; profile?: UserProfile | null },
    userPrompt?: string,
): DocumentDraftPrefill {
    const docType = resolveDocKey(documentType);
    if (!docType) return { ...(raw || {}) };
    return finalizeDraft(docType, raw || {}, { job: ctx.job, clients: ctx.clients, profile: ctx.profile, userText: userPrompt });
}

/** Document type named in free text (used only for UI hints, never to force an action). */
export function detectDocumentTypeFromText(text: string): MasterDocumentType {
    return detectDocTypeFromText(text);
}
