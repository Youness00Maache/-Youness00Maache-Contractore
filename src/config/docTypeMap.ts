import { FormType } from '../../types.ts';
import { DOC_LABELS, resolveDocKey, type DocKey } from '../../supabase/functions/master-ai-router/shared/documentSchema.ts';

/** Router document type (DAILY_REPORT, INVOICE, ...) or null. */
export type MasterDocumentType = DocKey | null;

export const DOC_TYPE_TO_FORM_TYPE: Record<DocKey, FormType> = DOC_LABELS as Record<DocKey, FormType>;

export const FORM_TYPE_TO_DOC_TYPE: Record<string, DocKey> = Object.fromEntries(
    Object.entries(DOC_TYPE_TO_FORM_TYPE).map(([k, v]) => [v, k as DocKey])
);

/** "DAILY_REPORT", "Daily Job Report", "WorkOrder", "work order" → FormType. */
export function resolveFormType(documentType: string | null | undefined): FormType | null {
    if (!documentType) return null;
    if ((Object.values(FormType) as string[]).includes(documentType)) return documentType as FormType;
    const spaced = documentType.replace(/([a-z])([A-Z])/g, '$1 $2');
    const key = resolveDocKey(documentType) || resolveDocKey(spaced);
    return key ? DOC_TYPE_TO_FORM_TYPE[key] : null;
}

/** Resolves a router/form type string to the router document type. Text is NOT parsed for intent. */
export function resolveMasterDocumentType(documentType: string | null | undefined): MasterDocumentType {
    if (!documentType) return null;
    const spaced = documentType.replace(/([a-z])([A-Z])/g, '$1 $2');
    return resolveDocKey(documentType) || resolveDocKey(spaced);
}
