/**
 * Backward compatibility for code written against the pre-2026-11 template functions
 * (`getXxxHtmlTemplate(data, profile, title, labels)`). Each old function now renders its
 * restored original design through the shared engine, so totals, escaping, signatures and
 * content are always correct. New code should call `renderDocument()` from './index.ts'.
 */
import { FormType } from '../../types.ts';
import { renderDocument } from './render.ts';

export interface LegacyLabels { date?: string; id?: string; idValue?: string; dateValue?: string }

const NUMBER_FIELD: Partial<Record<FormType, string>> = {
  [FormType.Invoice]: 'invoiceNumber', [FormType.Estimate]: 'estimateNumber', [FormType.WorkOrder]: 'workOrderNumber',
  [FormType.DailyJobReport]: 'reportNumber', [FormType.ChangeOrder]: 'changeOrderNumber', [FormType.PurchaseOrder]: 'poNumber',
  [FormType.Receipt]: 'receiptNumber', [FormType.Warranty]: 'warrantyNumber', [FormType.ProfitReport]: 'reportNumber',
};
const DATE_FIELD: Partial<Record<FormType, string>> = {
  [FormType.Invoice]: 'issueDate', [FormType.Estimate]: 'issueDate', [FormType.Warranty]: 'completedDate',
};

/** Guesses the document type from the legacy title argument, then from the data's fields. */
export const inferLegacyType = (data: any, title?: string): FormType => {
  const t = String(title || '').toUpperCase();
  if (/DAILY|REPORT/.test(t) && !/PROFIT/.test(t)) return FormType.DailyJobReport;
  if (/PROFIT/.test(t)) return FormType.ProfitReport;
  if (/\bNOTE\b/.test(t)) return FormType.Note;
  if (/ESTIMATE|QUOTE/.test(t)) return FormType.Estimate;
  if (/WORK ORDER/.test(t)) return FormType.WorkOrder;
  if (/CHANGE ORDER/.test(t)) return FormType.ChangeOrder;
  if (/PURCHASE ORDER/.test(t)) return FormType.PurchaseOrder;
  if (/RECEIPT/.test(t)) return FormType.Receipt;
  if (/WARRANTY/.test(t)) return FormType.Warranty;
  if (/TIME ?SHEET/.test(t)) return FormType.TimeSheet;
  if (/MATERIAL/.test(t)) return FormType.MaterialLog;
  if (/EXPENSE/.test(t)) return FormType.ExpenseLog;
  if (/INVOICE/.test(t)) return FormType.Invoice;
  const d = data || {};
  if (d.estimateNumber) return FormType.Estimate;
  if (d.changeOrderNumber) return FormType.ChangeOrder;
  if (d.poNumber) return FormType.PurchaseOrder;
  if (d.workOrderNumber) return FormType.WorkOrder;
  if (d.receiptNumber) return FormType.Receipt;
  if (d.warrantyNumber) return FormType.Warranty;
  if (d.content && d.reportNumber) return FormType.DailyJobReport;
  if (d.content) return FormType.Note;
  return FormType.Invoice;
};

export const renderLegacy = (legacyId: string, data: any, profile: any, title?: string, labels?: LegacyLabels): string => {
  const type = inferLegacyType(data, title);
  const d: any = { ...(data || {}) };
  const numberField = NUMBER_FIELD[type];
  if (numberField && !d[numberField] && labels?.idValue) d[numberField] = labels.idValue;
  const dateField = DATE_FIELD[type] || 'date';
  if (!d[dateField] && labels?.dateValue) d[dateField] = labels.dateValue;
  if (!d.signatureUrl && typeof d.signature === 'string') d.signatureUrl = d.signature;
  return renderDocument(type, d, profile, null, { templateId: legacyId, fragment: true }).html;
};

export type LegacyTemplateFn = (data: any, profile: any, title: string, labels: LegacyLabels) => string;

export const legacyTemplate = (legacyId: string): LegacyTemplateFn =>
  (data, profile, title, labels) => renderLegacy(legacyId, data, profile, title, labels);
