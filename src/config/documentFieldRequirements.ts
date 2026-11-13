/**
 * Browser entry point for the single document field schema.
 * The schema itself lives in the edge function's shared folder so the server prompt, the
 * server validation and the browser (setup card, prefill) can never drift apart.
 */
import type {
    ChangeOrderData, DailyJobReportData, EstimateData, ExpenseLogData, InvoiceData, MaterialLogData,
    NoteData, PurchaseOrderData, ReceiptData, TimeSheetData, WarrantyData, WorkOrderData,
} from '../../types.ts';
import {
    DOCUMENT_SCHEMAS, getSchema, type DocKey, type FieldKind, type SchemaFieldKey,
} from '../../supabase/functions/ai-assistant/shared/documentSchema.ts';

export * from '../../supabase/functions/ai-assistant/shared/documentSchema.ts';

// ── Compile-time alignment with types.ts: every schema key must be a real field of that type. ──
type Assert<T extends true> = T;
type IsSubset<A, B> = [A] extends [B] ? true : false;
export type SchemaAlignment = [
    Assert<IsSubset<SchemaFieldKey<'INVOICE'>, keyof InvoiceData>>,
    Assert<IsSubset<SchemaFieldKey<'ESTIMATE'>, keyof EstimateData>>,
    Assert<IsSubset<SchemaFieldKey<'WORK_ORDER'>, keyof WorkOrderData>>,
    Assert<IsSubset<SchemaFieldKey<'DAILY_REPORT'>, keyof DailyJobReportData>>,
    Assert<IsSubset<SchemaFieldKey<'TIME_SHEET'>, keyof TimeSheetData>>,
    Assert<IsSubset<SchemaFieldKey<'MATERIAL_LOG'>, keyof MaterialLogData>>,
    Assert<IsSubset<SchemaFieldKey<'EXPENSE_LOG'>, keyof ExpenseLogData>>,
    Assert<IsSubset<SchemaFieldKey<'WARRANTY'>, keyof WarrantyData>>,
    Assert<IsSubset<SchemaFieldKey<'NOTE'>, keyof NoteData>>,
    Assert<IsSubset<SchemaFieldKey<'RECEIPT'>, keyof ReceiptData>>,
    Assert<IsSubset<SchemaFieldKey<'CHANGE_ORDER'>, keyof ChangeOrderData>>,
    Assert<IsSubset<SchemaFieldKey<'PURCHASE_ORDER'>, keyof PurchaseOrderData>>,
];

/** Prefill type per document (what the forms receive). */
export interface PrefillByDocType {
    INVOICE: Partial<InvoiceData>;
    ESTIMATE: Partial<EstimateData>;
    WORK_ORDER: Partial<WorkOrderData>;
    DAILY_REPORT: Partial<DailyJobReportData>;
    TIME_SHEET: Partial<TimeSheetData>;
    MATERIAL_LOG: Partial<MaterialLogData>;
    EXPENSE_LOG: Partial<ExpenseLogData>;
    WARRANTY: Partial<WarrantyData>;
    NOTE: Partial<NoteData>;
    RECEIPT: Partial<ReceiptData>;
    CHANGE_ORDER: Partial<ChangeOrderData>;
    PURCHASE_ORDER: Partial<PurchaseOrderData>;
}

/** What the setup ("a few details are missing") card renders for one field. */
export interface SetupFieldSpec {
    key: string;
    label: string;
    placeholder: string;
    kind: 'text' | 'longtext' | 'date' | 'number' | 'items' | 'enum';
    values?: readonly string[];
}

const SETUP_KIND: Partial<Record<FieldKind, SetupFieldSpec['kind']>> = {
    longtext: 'longtext', richtext: 'longtext', date: 'date', number: 'number', money: 'number', percent: 'number',
    lineItems: 'items', materialItems: 'items', enum: 'enum',
};

export function getSetupFields(docType: DocKey, keys: string[]): SetupFieldSpec[] {
    const schema = getSchema(docType);
    return keys
        .filter(key => schema[key])
        .map(key => {
            const spec = schema[key];
            return {
                key,
                label: spec.label,
                placeholder: spec.placeholder || '',
                kind: SETUP_KIND[spec.kind] || 'text',
                ...(spec.values ? { values: spec.values } : {}),
            };
        });
}

/** Keys the AI may fill for a type (for UI summaries). */
export function getFieldKeys(docType: DocKey): string[] {
    return Object.keys(DOCUMENT_SCHEMAS[docType]);
}
