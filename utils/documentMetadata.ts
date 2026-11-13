/**
 * Small helpers around legacy AI payload shapes ({ document_metadata, description_html, ... }).
 * The router now returns flat, schema-normalized `prefill` objects; these helpers stay so older
 * callers (in-form AI handlers) keep working.
 */
import { stripSetupMetadataFromHtml } from './parseDocumentSetup.ts';

/** Header/setup fields — never duplicated in the WYSIWYG body. */
export interface DocumentMetadata {
    [key: string]: unknown;
}

const METADATA_KEYS = new Set([
    'clientName', 'clientAddress', 'companyName', 'companyAddress', 'companyPhone', 'companyWebsite',
    'projectName', 'projectAddress', 'reportNumber', 'invoiceNumber', 'estimateNumber', 'date',
    'templateId', 'themeColors', 'weather', 'temperature', 'title',
]);

export function extractMetadataFromDraft(draft: Record<string, unknown>): DocumentMetadata {
    const meta: DocumentMetadata = {};
    for (const key of METADATA_KEYS) {
        if (draft[key] != null && draft[key] !== '') meta[key] = draft[key];
    }
    return meta;
}

/** { document_metadata: {...}, description_html } → one flat object (metadata keys win). */
export function flattenPayloadWithMetadata(payload: Record<string, unknown>): Record<string, unknown> {
    if (!payload || typeof payload !== 'object') return {};
    const meta = payload.document_metadata && typeof payload.document_metadata === 'object'
        ? payload.document_metadata as Record<string, unknown>
        : {};
    const { document_metadata: _dm, ...rest } = payload;
    const flat: Record<string, unknown> = { ...rest };
    for (const [k, v] of Object.entries(meta)) if (v != null && v !== '') flat[k] = v;
    const body = flat.content ?? flat.description_html;
    if (typeof body === 'string' && body) {
        const clean = stripSetupMetadataFromHtml(body);
        if (flat.content !== undefined) flat.content = clean;
        if (flat.description_html !== undefined) flat.description_html = clean;
    }
    return flat;
}

export function splitDraftToStructuredPayload(
    draft: Record<string, unknown>
): { document_metadata: DocumentMetadata; description_html: string; content: string } {
    const body = stripSetupMetadataFromHtml(String(draft.content || draft.description_html || ''));
    return { document_metadata: extractMetadataFromDraft(draft), description_html: body, content: body };
}

/**
 * The user wants to continue without the missing details. Accepts the natural ways people say it;
 * the setup card also has a Skip button, so nobody has to type a magic phrase (AI-014).
 */
export function userAllowsEmptyOrProceed(text: string): boolean {
    return /\b(skip(?:\s+(?:it|this|that|them|those|missing))?|leave\s+(?:it|them|those|that|it all)?\s*(?:empty|blank)|leave\s+.*\s+(?:empty|blank)|go\s+ahead|proceed|continue(?:\s+anyway)?|just\s+(?:create|make|draft|do)\s+it|create\s+it(?:\s+(?:anyway|now))?|make\s+it|draft\s+it|create\s+(?:the\s+)?(?:report|document|draft)|use\s+(?:what\s+i\s+gave|defaults?|job\s+defaults)|with(?:out)?\s+(?:those|that|what\s+i\s+have)|don'?t\s+(?:have|know)(?:\s+(?:it|that|them))?|not\s+sure|no\s+idea|that'?s\s+all|nothing\s+else)\b/i.test(text);
}

/** Assistant text for a gather step. Never asks the user to type a special phrase. */
export function buildGatherInfoReply(missingLabels: string[], _autoFilledCount = 0, documentLabel = 'document'): string {
    if (!missingLabels.length) return '';
    const label = String(documentLabel || 'document').replace(/_/g, ' ').toLowerCase();
    return `I started your ${label}. Still missing: ${missingLabels.join(', ')}. Fill in what you know below, or skip and I'll leave those boxes empty.`;
}
