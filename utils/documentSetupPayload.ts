/**
 * Values typed into the AI setup card ("a few details are missing") → schema-normalized prefill.
 * Every value lands in the exact form box named by the schema key; nothing is re-parsed from text.
 */
import {
    fieldLabel, getSchema, getSetupFields, normalizePrefill, resolveDocKey, textToRichHtml, toLocalYmd,
    type DocKey, type SetupFieldSpec,
} from '../src/config/documentFieldRequirements.ts';
import { inferTemplateIdFromIntent } from '../src/utils/aiTemplateUtils.ts';

export type { SetupFieldSpec };

type LooseRecord = Record<string, unknown>;

const CONTROL_KEYS = new Set(['document_type', 'auto_submit', 'ai_open_mode', 'start_page', '__draftId', '__autoSave']);

function hasRealValue(values: LooseRecord): boolean {
    return Object.entries(values).some(([k, v]) => !CONTROL_KEYS.has(k) && v != null && !(typeof v === 'string' && !v.trim())
        && !(Array.isArray(v) && v.length === 0));
}

/**
 * Normalizes setup-card values for a document type. An empty card stays EMPTY ({}), it never
 * gains a document_type (AI-004: that used to force every message into "create a document").
 */
export function normalizeDocumentSetupPayload(
    values: LooseRecord | null | undefined,
    documentType?: string | null,
    options: { today?: string } = {},
): LooseRecord {
    if (!values || typeof values !== 'object' || !hasRealValue(values)) return {};
    const docType = resolveDocKey(documentType ?? values.document_type);
    if (!docType) return {};
    const schema = getSchema(docType);
    const prepared: LooseRecord = {};
    for (const [key, value] of Object.entries(values)) {
        if (CONTROL_KEYS.has(key)) continue;
        // Plain text typed into a rich-text box becomes simple escaped paragraphs.
        if (schema[key]?.kind === 'richtext' && typeof value === 'string' && !/<[a-z][^>]*>/i.test(value)) {
            prepared[key] = textToRichHtml(value.trim());
        } else {
            prepared[key] = value;
        }
    }
    return normalizePrefill(docType, prepared, { today: options.today || toLocalYmd(), resolveTemplate: inferTemplateIdFromIntent });
}

/** Short human summary of submitted setup values (shown as the user's chat message). */
export function buildSetupSubmissionText(values: LooseRecord, documentType?: string | null): string {
    const docType = resolveDocKey(documentType ?? values.document_type);
    if (!docType) return 'Continue';
    const normalized = normalizeDocumentSetupPayload(values, docType);
    const parts = Object.entries(normalized).map(([key, value]) => {
        let shown: string;
        if (Array.isArray(value)) {
            shown = value.map(v => (v && typeof v === 'object'
                ? `${(v as LooseRecord).quantity ?? 1} × ${(v as LooseRecord).description ?? (v as LooseRecord).name}${(v as LooseRecord).rate ? ` @ ${(v as LooseRecord).rate}` : ''}`
                : String(v))).join('; ');
        } else if (value && typeof value === 'object') {
            shown = Object.values(value as LooseRecord).join(', ');
        } else {
            shown = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return `${fieldLabel(docType, key)}: ${shown.length > 80 ? `${shown.slice(0, 77)}…` : shown}`;
    });
    return parts.length ? parts.join(' · ') : 'Continue';
}

/** Setup-card fields for the missing keys (or every "ask" field when none are given). */
export function getSetupFieldSpecsForDocument(documentType: string | null | undefined, missingKeys?: string[]): SetupFieldSpec[] {
    const docType: DocKey | null = resolveDocKey(documentType);
    if (!docType) return [];
    const schema = getSchema(docType);
    const keys = missingKeys?.length
        ? missingKeys.filter(k => schema[k])
        : Object.entries(schema).filter(([, s]) => s.ask).map(([k]) => k);
    return getSetupFields(docType, keys);
}

/** A plain chat reply while exactly one field is missing goes into that field. */
export function inferSingleMissingFieldSetup(
    input: string,
    documentType: string | null | undefined,
    missingKeys: string[],
): LooseRecord {
    if (missingKeys.length !== 1 || !input.trim()) return {};
    const fields = getSetupFieldSpecsForDocument(documentType, missingKeys);
    if (fields.length !== 1) return {};
    return normalizeDocumentSetupPayload({ [fields[0].key]: input.trim() }, documentType);
}
