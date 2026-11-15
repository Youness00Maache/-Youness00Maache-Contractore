/**
 * "Read with AI" (Premium + AI): the browser side of the ai-assistant task 'read_document'
 * (supabase/functions/ai-assistant/shared/documentReading.ts). Photos (1-4) and/or one PDF of a receipt, supplier invoice,
 * quote or delivery note go in; the printed facts come back. Nothing is saved here: the Expense Log shows a review screen
 * (components/expenses/ReadDocumentAI.tsx) and saves ONE expense through its normal save.
 *
 *   const files = await prepareDocumentFiles(fileList);          // photos downscaled with compressImage, PDF size-checked
 *   const result = await runReadDocument({ files, categories: [...EXPENSE_CATEGORIES], today });
 *   errors: ReadDocumentError with code PLAN_REQUIRED (not Premium + AI) / PLAN_LIMIT / CREDITS_EMPTY / AI_BUSY /
 *           AI_BAD_OUTPUT / TOO_LARGE / UNSUPPORTED_FILE / BAD_REQUEST …, message ready to show (offline: OFFLINE).
 *
 * Privacy: the files go only to the ai-assistant function (like the photo tasks) and are not stored by it.
 */
import { supabase } from '../../lib/supabase.ts';
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import { assertUsableImage, compressImage, describeImageError } from '../../utils/imageCompression.ts';
import {
    CONFIDENCE_GROUPS, CONFIDENCE_LEVELS, DOCUMENT_KINDS, READ_DOCUMENT_LIMITS, READ_DOCUMENT_TASK,
    type ConfidenceGroup, type ConfidenceLevel, type DocumentKind, type ReadDocumentResult, type ReadLineItem, type ReadWarning,
} from '../../supabase/functions/ai-assistant/shared/documentReading.ts';
import { readFunctionError } from '../hooks/useMasterAIRouter.ts';

export class ReadDocumentError extends Error {
    constructor(message: string, public code: string) { super(message); }
}

/** One file ready for the request (base64 without the data: prefix) plus a local preview URL for the review screen. */
export interface PreparedDocFile {
    kind: 'image' | 'pdf';
    mimeType: string;
    data: string;
    name: string;
    /** object URL of what was sent (revoke with releasePreparedFiles) */
    previewUrl: string;
    /** the compressed photo (kept so it can be attached to the expense if the user wants) */
    file: File;
}

export const isPdfFile = (f: { type?: string; name?: string }): boolean => f.type === 'application/pdf' || (!f.type && /\.pdf$/i.test(f.name || ''));

/** Which files can be read together (pure; exported for tests). Returns an error message or null. */
export function checkDocumentSelection(files: ReadonlyArray<{ type?: string; name?: string; size: number }>): string | null {
    if (!files.length) return 'Pick a photo or a PDF of the receipt or invoice.';
    const pdfs = files.filter(isPdfFile);
    const images = files.filter(f => !isPdfFile(f));
    if (pdfs.length > 1) return 'Read one PDF at a time.';
    if (images.length > READ_DOCUMENT_LIMITS.images) return `Pick up to ${READ_DOCUMENT_LIMITS.images} photos (one receipt or invoice, one photo per page).`;
    const pdf = pdfs[0];
    if (pdf && pdf.size > READ_DOCUMENT_LIMITS.pdfBytes) return `That PDF is ${(pdf.size / 1024 / 1024).toFixed(1)} MB. Use one under 4 MB, or take photos of the pages.`;
    for (const img of images) if (img.type && !img.type.startsWith('image/')) return 'Use JPG, PNG or WebP photos, or one PDF.';
    return null;
}

const toBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const s = String(reader.result || ''); resolve(s.slice(s.indexOf(',') + 1)); };
    reader.onerror = () => reject(new ReadDocumentError('The file could not be read.', 'BAD_REQUEST'));
    reader.readAsDataURL(blob);
});

/**
 * Photos: checked and downscaled with the app's compressImage (<= 1600 px JPEG); PDF: size and header checked, sent as
 * is. Throws ReadDocumentError with a message to show.
 */
export async function prepareDocumentFiles(input: readonly File[]): Promise<PreparedDocFile[]> {
    const problem = checkDocumentSelection(input);
    if (problem) throw new ReadDocumentError(problem, 'BAD_REQUEST');
    const out: PreparedDocFile[] = [];
    let total = 0;
    for (const f of input) {
        if (isPdfFile(f)) {
            const data = await toBase64(f);
            if (!data.startsWith('JVBERi')) throw new ReadDocumentError('That file is not a PDF.', 'UNSUPPORTED_FILE');
            total += data.length;
            out.push({ kind: 'pdf', mimeType: 'application/pdf', data, name: f.name || 'document.pdf', previewUrl: URL.createObjectURL(f), file: f });
            continue;
        }
        let small: File;
        try {
            assertUsableImage(f);
            small = await compressImage(f);
        } catch (e) {
            throw new ReadDocumentError(describeImageError(e), 'UNSUPPORTED_FILE');
        }
        const mimeType = /^image\/(jpeg|png|webp)$/.test(small.type) ? small.type : 'image/jpeg';
        const data = await toBase64(small);
        if (data.length > READ_DOCUMENT_LIMITS.imageBase64Chars) throw new ReadDocumentError('One of the photos is too large. Try a smaller photo.', 'TOO_LARGE');
        total += data.length;
        out.push({ kind: 'image', mimeType, data, name: small.name, previewUrl: URL.createObjectURL(small), file: small });
    }
    if (total > READ_DOCUMENT_LIMITS.totalBase64Chars) throw new ReadDocumentError('Those files are too large together. Read fewer pages at a time.', 'TOO_LARGE');
    return out;
}

export const releasePreparedFiles = (files: readonly PreparedDocFile[]): void => {
    for (const f of files) { try { URL.revokeObjectURL(f.previewUrl); } catch { /* ignore */ } }
};

export interface ReadDocumentInput {
    files: ReadonlyArray<Pick<PreparedDocFile, 'kind' | 'mimeType' | 'data'>>;
    /** the app's expense categories (the AI picks one of them, or none) */
    categories: readonly string[];
    today: string;
    language?: string;
}

/** The request body (exported for tests). */
export function buildReadDocumentBody(input: ReadDocumentInput): Record<string, unknown> {
    const pdf = input.files.find(f => f.kind === 'pdf');
    return {
        task: READ_DOCUMENT_TASK,
        images: input.files.filter(f => f.kind === 'image').slice(0, READ_DOCUMENT_LIMITS.images).map(f => ({ mime_type: f.mimeType, data: f.data })),
        ...(pdf ? { pdf: { mime_type: 'application/pdf', data: pdf.data } } : {}),
        context: { today: input.today, language: input.language, categories: [...input.categories] },
    };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, max) : null);
const ymd = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * The function's answer -> ReadDocumentResult (checked again here: category from the list only, card digits cut to 4,
 * known kinds / levels only). Throws on an answer that is not a read_document answer.
 */
export function parseReadDocumentResponse(data: unknown, categories: readonly string[]): ReadDocumentResult {
    const o = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    const d = o && o.ok === true && o.task === READ_DOCUMENT_TASK && o.document && typeof o.document === 'object' ? o.document as Record<string, unknown> : null;
    if (!d) throw new Error('The assistant sent an answer the app could not read. Please try again.');
    const conf = (d.confidence && typeof d.confidence === 'object' ? d.confidence : {}) as Record<string, unknown>;
    const confidence = Object.fromEntries(CONFIDENCE_GROUPS.map(g => [g, (CONFIDENCE_LEVELS as readonly string[]).includes(String(conf[g])) ? conf[g] : 'low'])) as Record<ConfidenceGroup, ConfidenceLevel>;
    const lines: ReadLineItem[] = (Array.isArray(d.lineItems) ? d.lineItems : []).slice(0, READ_DOCUMENT_LIMITS.lineItems).map((raw) => {
        const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        return {
            description: text(r.description, READ_DOCUMENT_LIMITS.descriptionChars) || '',
            quantity: typeof r.quantity === 'number' && Number.isFinite(r.quantity) ? r.quantity : null,
            unit: text(r.unit, READ_DOCUMENT_LIMITS.unitChars),
            unitPrice: num(r.unitPrice),
            amount: num(r.amount),
        };
    });
    const warnings: ReadWarning[] = (Array.isArray(d.warnings) ? d.warnings : []).slice(0, READ_DOCUMENT_LIMITS.warnings)
        .map((w) => (w && typeof w === 'object' ? w as Record<string, unknown> : {}))
        .filter(w => typeof w.code === 'string' && typeof w.message === 'string')
        .map(w => ({ code: w.code as ReadWarning['code'], message: String(w.message).slice(0, READ_DOCUMENT_LIMITS.warningChars) }));
    const cat = typeof d.suggestedCategory === 'string' ? categories.find(c => c === d.suggestedCategory) || null : null;
    const last4 = typeof d.cardLast4 === 'string' ? d.cardLast4.replace(/\D/g, '').slice(-4) : '';
    return {
        kind: (DOCUMENT_KINDS as readonly string[]).includes(String(d.kind)) ? d.kind as DocumentKind : 'other',
        isCreditNote: d.isCreditNote === true,
        vendor: text(d.vendor, READ_DOCUMENT_LIMITS.vendorChars),
        documentNumber: text(d.documentNumber, READ_DOCUMENT_LIMITS.numberChars),
        documentDate: ymd(d.documentDate),
        dueDate: ymd(d.dueDate),
        currency: typeof d.currency === 'string' && /^[A-Z]{3}$/.test(d.currency) ? d.currency : null,
        jobReference: text(d.jobReference, READ_DOCUMENT_LIMITS.referenceChars),
        lineItems: lines,
        subtotal: num(d.subtotal),
        tax: num(d.tax),
        total: num(d.total),
        paymentMethod: text(d.paymentMethod, READ_DOCUMENT_LIMITS.paymentChars),
        cardLast4: last4.length === 4 ? last4 : null,
        suggestedCategory: cat,
        confidence,
        warnings,
        summary: text(d.summary, READ_DOCUMENT_LIMITS.summaryChars) || '',
        pageCount: typeof d.pageCount === 'number' && d.pageCount > 0 ? Math.round(d.pageCount) : null,
    };
}

/** Calls the ai-assistant 'read_document' task. Throws ReadDocumentError. */
export async function runReadDocument(input: ReadDocumentInput, signal?: AbortSignal): Promise<ReadDocumentResult> {
    if (isBrowserOffline()) throw new ReadDocumentError(NEEDS_CONNECTION, 'OFFLINE');
    if (!input.files.length) throw new ReadDocumentError('Pick a photo or a PDF of the receipt or invoice.', 'BAD_REQUEST');
    const { data, error } = await supabase.functions.invoke('ai-assistant', { body: buildReadDocumentBody(input), signal, timeout: 130_000 });
    if (error) {
        const info = await readFunctionError(error);
        throw new ReadDocumentError(info.message.replace(/^PLAN_REQUIRED:\s*/, ''), info.code);
    }
    try {
        return parseReadDocumentResponse(data, input.categories);
    } catch (e) {
        throw new ReadDocumentError((e as Error).message, 'AI_BAD_OUTPUT');
    }
}
