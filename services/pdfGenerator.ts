/**
 * PDF generation for every document type: ONE pipeline.
 *
 *   data ──renderDocument()──▶ print HTML (same HTML as the template gallery / previews)
 *        ──sandboxed iframe──▶ fonts + images loaded ──paginateDocument()──▶ fixed-size pages
 *        ──html2canvas (per page)──▶ jsPDF (one image per page + clickable link annotations)
 *
 * jsPDF and html2canvas are loaded lazily (dynamic import) so they are not part of the initial bundle.
 * Every generator keeps its historical signature; the extra trailing `options` argument is optional.
 */
import type {
  ChangeOrderData, DailyJobReportData, EstimateData, ExpenseLogData, InvoiceData, Job, MaterialLogData, NoteData,
  ProfitReportData, PurchaseOrderData, ReceiptData, TimeSheetData, UserProfile, WarrantyData, WorkOrderData,
} from '../types.ts';
import { FormType } from '../types.ts';
import { paginateDocument } from '../utils/templates/paginate.ts';
import { renderDocument, type RenderOptions, type RenderResult } from '../utils/templates/render.ts';
import { PAPER } from '../utils/templates/registry.ts';

export interface PdfOptions {
  /** FormData.createdAt (used e.g. as the date of a Note). */
  createdAt?: string;
  /** Force a paper size (default: the document's choice, then US Letter). */
  paper?: 'letter' | 'a4';
  /** Override the download file name. */
  fileName?: string;
  /** Loads the full document data when `data` is only a lightweight list row (see DOC-016). */
  loadFull?: () => Promise<any>;
  /** Render scale (default 2 = sharp print quality). */
  scale?: number;
}

type AnyProfile = Partial<UserProfile> | null | undefined;
type AnyJob = Partial<Job> | null | undefined;

// ---------------------------------------------------------------------------
// lazy libraries
// ---------------------------------------------------------------------------
let libsPromise: Promise<{ JsPDF: any; html2canvas: any }> | null = null;
const loadLibs = () => {
  if (!libsPromise) {
    libsPromise = Promise.all([import('jspdf'), import('html2canvas')])
      .then(([jspdfMod, h2cMod]: any[]) => ({
        JsPDF: jspdfMod.jsPDF || jspdfMod.default?.jsPDF || jspdfMod.default,
        html2canvas: h2cMod.default || h2cMod,
      }))
      .catch((err) => {
        libsPromise = null;
        throw err;
      });
  }
  return libsPromise;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, sleep(ms).then(() => undefined)]);

const injectedFontLinks = new Set<string>();
/** html2canvas measures/draws text with the host document's fonts, so the template fonts are loaded there too. */
const ensureHostFonts = async (href: string) => {
  if (!href || typeof document === 'undefined') return;
  if (!injectedFontLinks.has(href)) {
    injectedFontLinks.add(href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute('data-cd-fonts', '1');
    const loaded = new Promise<void>((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); });
    document.head.appendChild(link);
    await withTimeout(loaded, 4000);
  }
  const fonts = (document as any).fonts;
  if (fonts?.ready) await withTimeout(fonts.ready, 3000);
};

const waitForImages = async (doc: Document, timeoutMs = 8000) => {
  const imgs = Array.from(doc.images);
  for (const img of imgs) {
    const src = img.getAttribute('src') || '';
    if (/^https?:/i.test(src) && img.crossOrigin !== 'anonymous') {
      img.crossOrigin = 'anonymous';
      img.src = src; // reload with CORS so html2canvas can draw it
    }
  }
  await withTimeout(Promise.all(imgs.map((img) => (img.complete && img.naturalWidth > 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => {
        img.style.visibility = 'hidden'; // a broken image must not print a broken-image icon
        resolve();
      }, { once: true });
    })))), timeoutMs);
};

const waitForDocument = async (doc: Document, timeoutMs = 6000) => {
  const start = Date.now();
  while (doc.readyState !== 'complete' && Date.now() - start < timeoutMs) await sleep(25);
  const fonts = (doc as any).fonts;
  if (fonts?.ready) await withTimeout(fonts.ready, 5000);
};

const isLightweight = (data: any) => !data || typeof data !== 'object' || data.__lightweight === true;

/** Renders the print HTML in a hidden, script-less iframe, paginates it and returns a jsPDF document. */
const htmlToPdf = async (render: RenderResult, opts: PdfOptions = {}) => {
  if (typeof document === 'undefined') throw new Error('PDF generation needs a browser.');
  const { JsPDF, html2canvas } = await loadLibs();
  await ensureHostFonts(render.fontHref);

  const { width, height } = render.page;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  frame.style.cssText = `position:fixed;left:-${width + 400}px;top:0;width:${width}px;height:${height}px;border:0;opacity:0;pointer-events:none;z-index:-1;`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not create the PDF render frame.');
    doc.open();
    doc.write(render.html);
    doc.close();
    await waitForDocument(doc);
    await waitForImages(doc);

    const { pages } = paginateDocument(doc, { pageHeight: height });
    if (!pages.length) throw new Error('Nothing to render.');
    const root = doc.querySelector('.cd-root') as HTMLElement;
    frame.style.height = `${Math.ceil(root.getBoundingClientRect().height + 40)}px`;
    await sleep(30);

    const format = PAPER[render.paper].pdfFormat;
    const pdf = new JsPDF({ unit: 'pt', format, orientation: 'portrait', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const scale = opts.scale || 2;
    const winH = Math.ceil(root.getBoundingClientRect().height + 40);
    pdf.setProperties({ title: render.fileName.replace(/\.pdf$/i, ''), creator: 'ContractorDocs', subject: render.model.title });

    for (let i = 0; i < pages.length; i++) {
      const pageEl = pages[i];
      const canvas = doc.createElement('canvas');
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      const rect = pageEl.getBoundingClientRect();
      await html2canvas(pageEl, {
        canvas,
        scale,
        width,
        height,
        // html2canvas adds x/y to the element's own position, so they must stay 0
        x: 0,
        y: 0,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: width,
        windowHeight: winH,
        scrollX: 0,
        scrollY: 0,
      });
      if (i > 0) pdf.addPage(format, 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');

      // clickable links (payment link, emails, websites in rich text)
      const sx = pw / width;
      const sy = ph / height;
      pageEl.querySelectorAll('a[href]').forEach((a) => {
        const href = (a as HTMLAnchorElement).getAttribute('href') || '';
        if (!/^(https?:|mailto:|tel:)/i.test(href)) return;
        Array.from(a.getClientRects()).forEach((r) => {
          const x = (r.left - rect.left) * sx;
          const y = (r.top - rect.top) * sy;
          if (y < 0 || y > ph) return;
          try { pdf.link(x, y, r.width * sx, r.height * sy, { url: href }); } catch { /* ignore */ }
        });
      });
    }
    return pdf;
  } finally {
    frame.remove();
  }
};

const resolveData = async (data: any, opts: PdfOptions) => {
  if (!isLightweight(data)) return data;
  if (opts.loadFull) {
    const full = await opts.loadFull();
    if (full && typeof full === 'object' && !isLightweight(full)) return full;
  }
  throw new Error('This document is not fully loaded yet. Open it once and try again.');
};

/**
 * Generic entry point. Returns a data URI ("data:application/pdf;...") when `getBlob` is true,
 * otherwise downloads the file and returns ''.
 */
export const generateDocumentPDF = async (
  type: FormType | string,
  rawData: any,
  profile: AnyProfile,
  job: AnyJob,
  templateId?: string | null,
  getBlob = false,
  options: PdfOptions = {},
): Promise<string> => {
  const data = await resolveData(rawData, options);
  const renderOpts: RenderOptions = { templateId: templateId || data?.templateId, bare: true, createdAt: options.createdAt, paper: options.paper };
  const render = renderDocument(type, data, profile, job, renderOpts);
  const pdf = await htmlToPdf(render, options);
  if (getBlob) return pdf.output('datauristring');
  pdf.save(options.fileName || render.fileName);
  return '';
};

/** Same HTML the PDF is made from, for live previews (preview iframes should use sandbox=""). */
export const renderDocumentPreviewHtml = (
  type: FormType | string,
  data: any,
  profile: AnyProfile,
  job?: AnyJob,
  templateId?: string | null,
  options: Pick<PdfOptions, 'createdAt' | 'paper'> = {},
): string => renderDocument(type, data, profile, job, { templateId: templateId ?? data?.templateId, createdAt: options.createdAt, paper: options.paper }).html;

/** Suggested download/attachment name, e.g. "Invoice-INV-1001-Jane-Smith.pdf". */
export const getDocumentFileName = (type: FormType | string, data: any, profile?: AnyProfile, job?: AnyJob): string =>
  renderDocument(type, data, profile, job, { noFontLink: true }).fileName;

// ---------------------------------------------------------------------------
// historical per-type generators (signatures kept for the forms, portal and email code)
// ---------------------------------------------------------------------------
export const generateInvoicePDF = (profile: UserProfile, job: Job, invoice: InvoiceData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.Invoice, invoice, profile, job, templateId, getBlob, options);

export const generateEstimatePDF = (profile: UserProfile, job: Job, data: EstimateData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.Estimate, data, profile, job, templateId, getBlob, options);

export const generatePurchaseOrderPDF = (profile: UserProfile, job: Job, data: PurchaseOrderData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.PurchaseOrder, data, profile, job, templateId, getBlob, options);

export const generateWorkOrderPDF = (profile: UserProfile, job: Job, data: WorkOrderData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.WorkOrder, data, profile, job, templateId, getBlob, options);

export const generateDailyJobReportPDF = (profile: UserProfile, data: DailyJobReportData, templateId: string, getBlob = false, options?: PdfOptions & { job?: AnyJob }) =>
  generateDocumentPDF(FormType.DailyJobReport, data, profile, options?.job ?? null, templateId, getBlob, options);

export const generateTimeSheetPDF = (profile: UserProfile, job: Job, data: TimeSheetData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.TimeSheet, data, profile, job, templateId, getBlob, options);

export const generateMaterialLogPDF = (profile: UserProfile, job: Job, data: MaterialLogData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.MaterialLog, data, profile, job, templateId, getBlob, options);

export const generateExpenseLogPDF = (profile: UserProfile, job: Job, data: ExpenseLogData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.ExpenseLog, data, profile, job, templateId, getBlob, options);

export const generateWarrantyPDF = (profile: UserProfile, job: Job, data: WarrantyData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.Warranty, data, profile, job, templateId, getBlob, options);

export const generateNotePDF = (profile: UserProfile, job: Job, data: NoteData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.Note, data, profile, job, templateId, getBlob, options);

export const generateReceiptPDF = (profile: UserProfile, job: Job, data: ReceiptData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.Receipt, data, profile, job, templateId, getBlob, options);

export const generateChangeOrderPDF = (profile: UserProfile, job: Job, data: ChangeOrderData, templateId: string, getBlob = false, options?: PdfOptions) =>
  generateDocumentPDF(FormType.ChangeOrder, data, profile, job, templateId, getBlob, options);

export const generateProfitReportPDF = (profile: UserProfile, data: ProfitReportData, getBlob = false, options?: PdfOptions & { templateId?: string }) =>
  generateDocumentPDF(FormType.ProfitReport, data, profile, null, options?.templateId ?? data?.templateId ?? 'classic', getBlob, options);

/** Base64 data URI of any document (email attachments, batch email, profit calculator). */
export const generateDocumentBase64 = async (type: string, data: any, profile: UserProfile, job: Job | null, options: PdfOptions = {}): Promise<string> => {
  const known = Object.values(FormType) as string[];
  if (!known.includes(type)) return '';
  return generateDocumentPDF(type, data, profile, job, data?.templateId, true, options);
};
