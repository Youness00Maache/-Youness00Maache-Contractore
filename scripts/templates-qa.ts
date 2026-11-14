/**
 * Template QA: renders every template × every document type with realistic data and edge cases, checks the
 * output, then (when Chrome is available) paginates and screenshots documents in a real browser and runs the
 * real PDF pipeline end to end.
 *
 *   npx tsx scripts/templates-qa.ts                       # static checks + browser checks + screenshots
 *   npx tsx scripts/templates-qa.ts --no-browser          # static checks only (fast, no Chrome needed)
 *   npx tsx scripts/templates-qa.ts --templates=classic,bold --kinds=invoice,dailyReport
 *   npx tsx scripts/templates-qa.ts --pdfdiff             # also compare every design's preview with its PDF drawing
 *                                                         # (fails on a visible blob of differences, >1.5% scattered noise,
 *                                                         # or when the page fell back to html2canvas)
 *                                                         # (png/../pdfdiff/<id>/<kind>-<variant>.png: preview | PDF | diff)
 *   npx tsx scripts/templates-qa.ts --shots=review        # screenshots of every kind's sample + long variants and the
 *                                                         # good/better/best estimates (default --shots=sample; --shots=all;
 *                                                         # --shots=gaps: the totals-at-page-break invoices)
 *   npx tsx scripts/templates-qa.ts --no-emptyboxes       # skip the empty-box check on sparse documents
 *   npx tsx scripts/templates-qa.ts --pdf                 # also generate real PDFs through services/pdfGenerator.ts
 *                                                         # (and check their invisible text layer is searchable)
 *   npx tsx scripts/templates-qa.ts --textlayer           # also write png/<id>/<kind>-textlayer.png: the PDF text layer
 *                                                         # drawn in red over the page, to eyeball that it lines up
 *   npx tsx scripts/templates-qa.ts --previews            # also write public/templates/previews/<id>.webp (marketing
 *                                                         # Templates page, content/templatePreviews.ts); --kinds=invoice is enough
 *   npx tsx scripts/templates-qa.ts --out=C:/tmp/cd-qa    # output folder (default: <os tmp>/contractordocs-templates-qa)
 *
 * Exit code 1 when any check fails.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FormType } from '../types.ts';
import { computeDocumentTotals, formatMoney } from '../utils/money.ts';
import { esc, safeUrl, sanitizeRichText } from '../utils/escapeHtml.ts';
import {
  DOC_KINDS, KIND_TO_FORM_TYPE, LEGACY_TEMPLATE_MAP, SAMPLE_DOCUMENTS, SAMPLE_JOB, SAMPLE_PROFILE, TEMPLATES,
  renderDocument, resolveTemplateId, type DocKind,
} from '../utils/templates/index.ts';
import * as LegacyA from '../utils/templates/documentHtmlTemplates.ts';
import * as LegacyB from '../utils/templates/allNewTemplates.ts';
import { adaptTemplateForContentDocument } from '../utils/templates/templateAdapters.ts';
import {
  ALL_TEMPLATE_IDS, BASIC_TEMPLATE_IDS, PREMIUM_TEMPLATE_IDS, RETIRED_TEMPLATE_MAP, getTemplateMeta,
} from '../utils/templates/registry.ts';
import { THEMES } from '../utils/templates/themes.ts';
import { TEMPLATE_PREVIEWS } from '../content/templatePreviews.ts';
import { modelFieldChecks, renderFieldChecks } from './templates-fields.ts';
import { optionsEstimate, visualStage } from './templates-visual.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, '').split('=');
  return [k, v.length ? v.join('=') : 'true'] as [string, string];
}));
const OUT = resolve(args.get('out') || join(tmpdir(), 'contractordocs-templates-qa'));
const ONLY_TEMPLATES = args.get('templates')?.split(',').filter(Boolean);
const ONLY_KINDS = args.get('kinds')?.split(',').filter(Boolean) as DocKind[] | undefined;
const templates = TEMPLATES.map((t) => t.id).filter((id) => !ONLY_TEMPLATES || ONLY_TEMPLATES.includes(id));
const kinds = DOC_KINDS.filter((k) => !ONLY_KINDS || ONLY_KINDS.includes(k));

const failures: string[] = [];
const warnings: string[] = [];
let checks = 0;
const check = (ok: unknown, msg: string) => {
  checks++;
  if (!ok) failures.push(msg);
};

const XSS = `"><img src=x onerror=alert(1)><script>alert('x')</script><svg/onload=alert(2)>`;
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const visibleText = (html: string) => decode(html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const money = (v: number) => formatMoney(v, 'USD');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------
// variants
// ---------------------------------------------------------------------------
const LONG_TEXT = 'Remove and dispose of the existing finishes, verify substrate flatness within 3/16" over 10 ft, install crack-isolation membrane per manufacturer instructions and protect adjacent finished surfaces throughout the work.';

const longVariant = (kind: DocKind, base: any) => {
  const d = clone(base);
  const items = Array.from({ length: 46 }, (_, i) => ({
    id: `x${i}`,
    description: i % 7 === 3 ? `Item ${i + 1}: ${LONG_TEXT} ${LONG_TEXT}` : `Item ${i + 1}: ${['Framing labor', 'Drywall 1/2"', 'Paint, 2 coats', 'Trim carpentry', 'Electrical device', 'Plumbing fixture'][i % 6]}`,
    quantity: (i % 5) + 1,
    rate: 37.5 + i * 11.25,
  }));
  if ('lineItems' in d || ['invoice', 'estimate', 'changeOrder', 'purchaseOrder', 'expenseLog'].includes(kind)) d.lineItems = items;
  if (kind === 'materialLog') d.items = items.map((it) => ({ id: it.id, name: it.description, supplier: 'Blue Ridge Lumber', quantity: it.quantity, unitCost: it.rate }));
  if (kind === 'profitReport') d.items = items.map((it) => ({ id: it.id, description: it.description, cost: it.rate, charge: it.rate * 1.4 }));
  if (kind === 'dailyReport' || kind === 'note') {
    const para = `<h3>Section</h3><p>${LONG_TEXT} ${LONG_TEXT}</p><ul>${Array.from({ length: 6 }, (_, i) => `<li>Checklist line ${i + 1}: ${LONG_TEXT}</li>`).join('')}</ul>`;
    d.content = Array.from({ length: 7 }, () => para).join('') + '<p>LAST_CONTENT_MARKER</p>';
  }
  if (kind === 'warranty') { d.coverage = Array.from({ length: 10 }, () => LONG_TEXT).join('\n'); d.conditions = Array.from({ length: 10 }, () => LONG_TEXT).join(' '); }
  if (kind === 'workOrder') d.description = Array.from({ length: 30 }, (_, i) => `${i + 1}. ${LONG_TEXT}`).join('\n');
  if (kind === 'timeSheet') d.notes = Array.from({ length: 50 }, (_, i) => `${i + 1}. ${LONG_TEXT}`).join('\n');
  if (kind === 'invoice' || kind === 'estimate') d.notes = Array.from({ length: 12 }, () => LONG_TEXT).join('\n');
  return d;
};

const deepMapStrings = (v: any, fn: (s: string, key: string) => string, key = ''): any => {
  if (typeof v === 'string') return fn(v, key);
  if (Array.isArray(v)) return v.map((x) => deepMapStrings(x, fn, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMapStrings(x, fn, k)]));
  return v;
};

const xssVariant = (base: any) => {
  const d = deepMapStrings(clone(base), (s, key) => {
    if (/url$|signature/i.test(key)) return `javascript:alert(1)`;
    if (/date|At$/i.test(key) || key === 'templateId' || key === 'status') return s;
    return `${s} ${XSS}`;
  });
  d.paypalLink = 'javascript:alert(document.cookie)';
  d.themeColors = { primary: 'red;}</style><script>alert(1)</script>', secondary: 'url(javascript:alert(1))' };
  return d;
};

const unicodeVariant = (base: any) => deepMapStrings(clone(base), (s, key) =>
  (/url$|signature|date|At$|templateId|status|Number$/i.test(key) ? s : `${s} — Crème brûlée façade, Ñandú, Zürich, 東京 ✓`));

/** good/better/best estimate variants (null = not for this kind) */
const isOptionsVariant = (id: string) => id.startsWith('options');

const VARIANTS: Array<{ id: string; make: (kind: DocKind, base: any) => any }> = [
  { id: 'sample', make: (_k, b) => clone(b) },
  { id: 'long', make: (k, b) => longVariant(k, b) },
  { id: 'xss', make: (_k, b) => xssVariant(b) },
  { id: 'unicode', make: (_k, b) => unicodeVariant(b) },
  { id: 'empty', make: () => ({}) },
  { id: 'legacy-colors', make: (_k, b) => ({ ...clone(b), themeColors: { primary: '#000000', secondary: '#666666' }, templateId: 'standard' }) },
  { id: 'options', make: (k, b) => (k === 'estimate' ? optionsEstimate(clone(b)) : null) },
  { id: 'options-chosen', make: (k, b) => (k === 'estimate' ? optionsEstimate(clone(b), { chosen: true }) : null) },
  { id: 'options-long', make: (k, b) => (k === 'estimate' ? optionsEstimate(clone(b), { long: true }) : null) },
];

const REQUIRED_TEXT: Record<DocKind, (d: any) => string[]> = {
  invoice: (d) => [d.invoiceNumber, d.clientName, d.notes?.split('\n')[0], d.terms, 'Pay now'],
  estimate: (d) => [d.estimateNumber, d.clientName, d.terms, d.notes, d.clientSignedBy],
  workOrder: (d) => [d.workOrderNumber, d.description?.split('\n')[0], d.materialsUsed, d.terms, d.status],
  dailyReport: (d) => [d.reportNumber, d.weather, d.temperature, d.projectName, d.projectAddress, ...(d.tags || []), 'Materials Delivered'],
  timeSheet: (d) => [d.workerName, d.notes, d.status],
  materialLog: (d) => [...(d.items || []).map((i: any) => i.name), ...(d.items || []).map((i: any) => i.supplier)],
  expenseLog: (d) => [d.vendor, d.category, d.notes, ...(d.lineItems || []).map((l: any) => l.description)],
  warranty: (d) => [d.warrantyNumber, d.clientName, d.coverage, d.conditions, d.duration],
  note: (d) => [d.title, 'Follow-up', ...(d.tags || [])],
  receipt: (d) => [d.receiptNumber, d.paymentMethod, d.description, d.clientName],
  changeOrder: (d) => [d.changeOrderNumber, d.reason, d.description, d.terms],
  purchaseOrder: (d) => [d.poNumber, d.vendorName, d.vendorEmail, d.shipToName, d.deliveryInstructions, d.notes],
  profitReport: (d) => [d.reportNumber, ...(d.items || []).map((i: any) => i.description)],
};

const expectedGrand = (kind: DocKind, d: any): string | null => {
  switch (kind) {
    case 'invoice': case 'estimate': case 'purchaseOrder': return money(computeDocumentTotals(d).total);
    case 'changeOrder': return money(Number(d.currentContractSum || 0) + computeDocumentTotals({ lineItems: d.lineItems }).total);
    case 'materialLog': return money((d.items || []).reduce((a: number, i: any) => a + Math.round(i.quantity * i.unitCost * 100) / 100, 0));
    case 'receipt': return money(d.amount);
    default: return null;
  }
};

// ---------------------------------------------------------------------------
// 1. unit checks
// ---------------------------------------------------------------------------
const unitChecks = () => {
  const dirty = `<p onclick="x()">Hi <b>there</b><script>alert(1)</script><img src="x" onerror="alert(1)"><img src="https://cdn.example.com/a.png" onload=alert(1)><a href="javascript:alert(1)">bad</a><a href="https://ok.example">ok</a><iframe src="//evil"></iframe><style>body{}</style><div style="position:fixed;top:0;color:red;background:url(x)">t</div><font color="#ff0000" size="5">f</font><table><tr><td>open`;
  const clean = sanitizeRichText(dirty);
  check(!/<script|onerror|onclick|onload|javascript:|<iframe|<style|position:\s*fixed|url\(/i.test(clean), `sanitizeRichText left unsafe markup: ${clean}`);
  check(clean.includes('<b>there</b>') && clean.includes('href="https://ok.example"') && clean.includes('src="https://cdn.example.com/a.png"'), `sanitizeRichText dropped safe markup: ${clean}`);
  check(/<span style="color: #ff0000; font-size: 21px">f<\/span>/.test(clean), `sanitizeRichText <font> conversion: ${clean}`);
  check(clean.endsWith('</td></tr></table></p>'), `sanitizeRichText must balance tags: ${clean}`);
  check(!/<img/i.test(sanitizeRichText('<img src=x onerror=alert(1)//')), 'unterminated tag must not survive');
  check(safeUrl('javascript:alert(1)') === '' && safeUrl(' jav&#x09;ascript:alert(1)') === '' && safeUrl('https://x.y') === 'https://x.y', 'safeUrl');
  check(esc('<a href="x">') === '&lt;a href=&quot;x&quot;&gt;', 'esc');

  // money: the audit's reference invoice (DOC-001) and progress billing (DOC-030)
  const ref = { lineItems: [{ id: '1', description: 'A', quantity: 2, rate: 100 }], discount: 20, taxRate: 10, shipping: 5 };
  const progress = { isProgressBilling: true, lineItems: [{ id: '1', description: 'Phase 1', quantity: 1, rate: 10000, percentComplete: 50 }] };
  const progress2 = { isProgressBilling: true, lineItems: [{ id: '1', description: 'Phase 1', quantity: 1, rate: 10000, percentComplete: 60, previouslyBilled: 3000 }] };
  for (const id of templates) {
    const r = renderDocument(FormType.Invoice, { ...ref, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.html.includes('$203.00'), `[${id}] reference invoice must total $203.00`);
    const p = renderDocument(FormType.Invoice, { ...progress, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(p.model.totals.find((t) => t.kind === 'grand')?.value === '$5,000.00' && p.html.includes('$5,000.00'), `[${id}] progress invoice 50% of $10,000 must bill $5,000.00`);
    const p2 = renderDocument(FormType.Invoice, { ...progress2, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(p2.model.totals.find((t) => t.kind === 'grand')?.value === '$3,000.00', `[${id}] progress invoice 60% minus $3,000 previously billed must bill $3,000.00`);
  }
  const paid = renderDocument(FormType.Invoice, { ...ref, status: 'Paid' }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(paid.model.totals.some((t) => t.kind === 'balance' && t.value === '$0.00'), 'paid invoice must show a $0.00 balance');

  // every design is registered, has a theme, a tier and renders as itself (Basic: Classic + the 10 original Standard designs)
  const registered = new Set<string>(TEMPLATES.map((t) => t.id));
  check(TEMPLATES.length === ALL_TEMPLATE_IDS.length, `expected ${ALL_TEMPLATE_IDS.length} registered designs, found ${TEMPLATES.length}`);
  check(new Set(TEMPLATES.map((t) => t.name.toLowerCase())).size === TEMPLATES.length, 'design names must be unique');
  check(PREMIUM_TEMPLATE_IDS.length >= 14 && BASIC_TEMPLATE_IDS.length === 11, `11 Basic and at least 14 Premium designs (${BASIC_TEMPLATE_IDS.length} / ${PREMIUM_TEMPLATE_IDS.length})`);
  for (const id of ALL_TEMPLATE_IDS) {
    check(registered.has(id), `design ${id} is not registered`);
    check(THEMES[id]?.id === id, `design ${id} has no theme`);
    check(resolveTemplateId(id) === id, `id ${id} must resolve to itself`);
    const meta = getTemplateMeta(id);
    const want = (BASIC_TEMPLATE_IDS as readonly string[]).includes(id) ? 'basic' : 'premium';
    check(meta.tier === want, `design ${id} must be ${want} (is ${meta.tier})`);
    check(want === 'basic' || (!!THEMES[id]?.layout && !!meta.descriptor), `Premium design ${id} must be customizable and have a picker descriptor`);
    check(want === 'premium' || !THEMES[id]?.layout, `Basic design ${id} must not take customization (its look stays unchanged)`);
    const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.templateId === id && r.html.includes(`cd-t-${id} `), `documents saved with ${id} must render the ${id} design (got ${r.templateId})`);
  }
  // marketing Templates page (content/templatePreviews.ts): every current design once, Premium marked, image present
  const previewIds = TEMPLATE_PREVIEWS.map((p) => p.id);
  check(previewIds.length === ALL_TEMPLATE_IDS.length && ALL_TEMPLATE_IDS.every((id) => previewIds.includes(id)), `Templates page previews must list every design once (missing: ${ALL_TEMPLATE_IDS.filter((id) => !previewIds.includes(id)).join(', ') || '-'}; extra: ${previewIds.filter((id) => !(ALL_TEMPLATE_IDS as readonly string[]).includes(id)).join(', ') || '-'})`);
  for (const p of TEMPLATE_PREVIEWS) {
    if (!(ALL_TEMPLATE_IDS as readonly string[]).includes(p.id)) continue;
    const meta = getTemplateMeta(p.id);
    check(p.premium === (meta.tier === 'premium') && p.name === meta.name, `Templates page preview ${p.id}: name "${p.name}" / Premium ${p.premium} must match the registry ("${meta.name}", ${meta.tier})`);
    check(existsSync(join(ROOT, 'public', p.src)), `Templates page preview image missing: public${p.src} (npx tsx scripts/templates-qa.ts --kinds=invoice --previews)`);
  }

  // backward compatibility: every retired design id renders with its replacement (a Premium design)
  for (const [old, mapped] of Object.entries(RETIRED_TEMPLATE_MAP)) {
    check((PREMIUM_TEMPLATE_IDS as readonly string[]).includes(mapped), `retired ${old} must map to a Premium design (maps to ${mapped})`);
    const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, templateId: old }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.templateId === mapped && r.html.includes(`cd-t-${mapped} `), `documents saved with retired ${old} must render ${mapped} (got ${r.templateId})`);
  }
  // backward compatibility: aliases (display names, spellings) still resolve
  for (const [legacy, mapped] of Object.entries(LEGACY_TEMPLATE_MAP)) {
    check(resolveTemplateId(legacy) === mapped, `legacy id ${legacy} must map to ${mapped}`);
    const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, templateId: legacy }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.templateId === mapped, `legacy id ${legacy} renders with ${mapped}`);
  }
  check(resolveTemplateId(undefined) === 'classic' && resolveTemplateId('no-such-template') === 'classic', 'unknown ids fall back to classic');
  check(resolveTemplateId('Template_Neon') === 'slate' && resolveTemplateId('modern-blue') === 'modern_blue' && resolveTemplateId('Neon Cyberpunk') === 'slate' && resolveTemplateId('Classic Trade') === 'classic_trade', 'ids match case- and spacing-insensitively');

  // legacy template functions (still imported by older code paths)
  const labels = { date: 'Date', dateValue: '2026-01-05', id: 'Invoice #', idValue: 'INV-1' };
  const legacyFns = [...Object.entries(LegacyA), ...Object.entries(LegacyB)].filter(([n, f]) => typeof f === 'function' && /^get.*HtmlTemplate$/.test(n) && n !== 'getProfitReportHtmlTemplate');
  check(legacyFns.length === 20, `expected 20 legacy template functions, found ${legacyFns.length}`);
  const LEGACY_FN_IDS: Record<string, string> = {
    getAdvancedHtmlTemplate: 'template_html', getHighEndHtmlTemplate: 'template_html_2', getGlassmorphismModernHtmlTemplate: 'template_html_2_new',
    getPremiumMinimalistHtmlTemplate: 'template_html_3', getGradientBorderPremiumHtmlTemplate: 'template_html_4', getNeonCyberpunkHtmlTemplate: 'template_neon',
    getLuxuryGoldNavyHtmlTemplate: 'template_luxury', getOrganicNatureHtmlTemplate: 'template_nature', getGeometricBoldHtmlTemplate: 'template_geometric',
    getPastelSoftHtmlTemplate: 'template_pastel', getVintageCraftHtmlTemplate: 'template_vintage', getBlueprintTechHtmlTemplate: 'template_blueprint',
    getAbstractMemphisHtmlTemplate: 'template_memphis', getCrimsonNoirHtmlTemplate: 'template_crimson', getWatercolorArtisticHtmlTemplate: 'template_watercolor',
    getSwissGridHtmlTemplate: 'template_swiss', getSpaceOdysseyHtmlTemplate: 'template_space', getRetroTerminalHtmlTemplate: 'template_retro',
    getPlayfulPopHtmlTemplate: 'template_pop', getElegantSerifHtmlTemplate: 'template_serif',
  };
  for (const [name, fn] of legacyFns) {
    const html = (fn as any)({ ...ref, invoiceNumber: 'INV-1', clientName: 'Bob', signatureUrl: SAMPLE_DOCUMENTS.invoice.signatureUrl }, SAMPLE_PROFILE, 'INVOICE', labels);
    check(typeof html === 'string' && html.includes('$203.00') && html.includes(SAMPLE_DOCUMENTS.invoice.signatureUrl), `legacy ${name} must render correct totals and the signature`);
    const now = resolveTemplateId(LEGACY_FN_IDS[name]);
    check(LEGACY_FN_IDS[name] && html.includes(`cd-t-${now} `), `legacy ${name} must render the design that replaced ${LEGACY_FN_IDS[name]} (${now})`);
    const report = adaptTemplateForContentDocument(fn as any, { reportNumber: 'DR-1', date: '2026-01-05', content: '<p>CONTENT_MARKER</p>', projectName: 'P' }, SAMPLE_PROFILE, 'DAILY REPORT', labels);
    check((report.match(/CONTENT_MARKER/g) || []).length === 1, `legacy adapter ${name} must render daily report content exactly once`);
  }
  check(typeof LegacyA.getAIVisualHtml({ metrics: [{ label: 'Done', value: '80%' }], progress_percentage: 80 }, '#123456') === 'string', 'getAIVisualHtml still exported');

  // "get paid": Scan-to-pay QR (https links, every design), amount filled into PayPal.me, hidden once paid; financing note
  const payInv = { ...ref, invoiceNumber: 'INV-QR', status: 'Sent', paypalLink: 'https://paypal.me/acme', payLinkLabel: 'PayPal' };
  const finEst = { ...ref, estimateNumber: 'EST-FIN', status: 'Sent', financingLink: 'https://apply.lender.example/acme', financingMinAmount: 100 };
  for (const id of templates) {
    const r = renderDocument(FormType.Invoice, { ...payInv, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.html.includes('class="cd-pay-qr"') && /<svg[^>]*viewBox="0 0 \d+ \d+"/.test(r.html) && r.html.includes('Scan to pay'), `[${id}] invoice with an https pay link must show the "Scan to pay" QR`);
    check(r.html.includes('https://paypal.me/acme/203.00') && r.html.includes('Pay now with PayPal'), `[${id}] pay button must carry the amount due (PayPal.me) and the service name`);
    const e = renderDocument(FormType.Estimate, { ...finEst, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(e.html.includes('Financing available') && e.html.includes('https://apply.lender.example/acme'), `[${id}] estimate at/above the financing amount must show "Financing available"`);
  }
  const paidInv = renderDocument(FormType.Invoice, { ...payInv, status: 'Paid' }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(!paidInv.model.paymentLink && !paidInv.html.includes('class="cd-pay-qr"'), 'paid invoice: no pay button and no QR');
  const partInv = renderDocument(FormType.Invoice, { ...payInv, amountPaid: 103 }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(partInv.html.includes('https://paypal.me/acme/100.00'), 'part-paid invoice: the pay link asks for the balance due ($100.00)');
  const httpInv = renderDocument(FormType.Invoice, { ...payInv, paypalLink: 'http://pay.example.com/x' }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(!!httpInv.model.paymentLink && !httpInv.model.paymentLink.qr, 'plain http pay link: button kept (as before), no QR');
  const lowEst = renderDocument(FormType.Estimate, { ...finEst, financingMinAmount: 5000 }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(!lowEst.html.includes('Financing available'), 'estimate below the financing amount: no financing note');
  const badFin = renderDocument(FormType.Estimate, { ...finEst, financingLink: 'javascript:alert(1)' }, SAMPLE_PROFILE, SAMPLE_JOB);
  check(!badFin.html.includes('Financing available') && !/javascript:/i.test(badFin.html), 'unsafe financing link is ignored');
  check(!renderDocument(FormType.Invoice, { ...finEst }, SAMPLE_PROFILE, SAMPLE_JOB).html.includes('Financing available'), 'financing is only for estimates');

  // the line unit (Quick measure) is printed after the quantity in every design; lines without one are unchanged
  const unitLines = [
    { id: 'u1', description: 'Tile floor', quantity: 42, rate: 12, unit: 'sq ft' },
    { id: 'u2', description: 'Baseboard', quantity: 120, rate: 3, unit: 'lf' },
    { id: 'u3', description: 'Thinset', quantity: 3, rate: 28, unit: 'box' },
    { id: 'u4', description: 'Grout', quantity: 1, rate: 30, unit: 'box' },
    { id: 'u5', description: 'Labor', quantity: 6, rate: 85 },
  ];
  for (const id of templates) {
    for (const type of [FormType.Invoice, FormType.Estimate, FormType.ChangeOrder, FormType.PurchaseOrder]) {
      const r = renderDocument(type, { lineItems: unitLines, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
      const text = visibleText(r.html);
      check(['42 sq ft', '120 lf', '3 boxes', '1 box'].every((s) => text.includes(s)) && (r.html.match(/class="cd-unit"/g) || []).length === 4, `[${id}/${type}] line units must print after the quantity (42 sq ft, 120 lf, 3 boxes, 1 box)`);
      check(/<td class="cd-r cd-col-1 cd-c-qty cd-num">6<\/td>/.test(r.html), `[${id}/${type}] a line without a unit prints its quantity alone`);
    }
    const plainDoc = renderDocument(FormType.Invoice, { lineItems: unitLines.map(({ unit: _u, ...l }) => l), templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(!plainDoc.html.includes('class="cd-unit"') && !/class="[^"]*\bcd-c-qty\b/.test(plainDoc.html) && plainDoc.html.includes('<col style="width:10%">'), `[${id}] documents without units keep the original Qty column`);
  }

  // short plain notes sit beside the signatures; notes with an image, a table or a heading get the full width
  const signed = { ...ref, invoiceNumber: 'INV-SIG', signatureUrl: SAMPLE_DOCUMENTS.invoice.signatureUrl };
  const richNotes = {
    image: '<p>Before photo:</p><p><img src="https://cdn.example.com/before.jpg"></p>',
    table: '<table><tr><td>Room</td><td>Area</td></tr><tr><td>Kitchen</td><td>180</td></tr></table>',
    heading: '<h3>Access</h3><p>Gate code 1234.</p>',
  };
  for (const id of templates) {
    const plain = renderDocument(FormType.Invoice, { ...signed, notes: 'Thank you for your business.', templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
    const signoff = (html: string) => html.includes('<section class="cd-block cd-signoff"');
    check(signoff(plain.html), `[${id}] short plain notes must sit beside the signature`);
    for (const [what, notes] of Object.entries(richNotes)) {
      const r = renderDocument(FormType.Invoice, { ...signed, notes, templateId: id }, SAMPLE_PROFILE, SAMPLE_JOB);
      check(!signoff(r.html) && r.html.includes('cd-sec-notes'), `[${id}] notes with ${what === 'image' ? 'an' : 'a'} ${what} must not be squeezed beside the signature`);
    }
  }

  // field placement: every value a form collects lands in the right box, in every design (scripts/templates-fields.ts)
  modelFieldChecks(check);
  renderFieldChecks(templates, check);
};

// ---------------------------------------------------------------------------
// 2. render matrix
// ---------------------------------------------------------------------------
interface Rendered { template: string; kind: DocKind; variant: string; file: string; expectPages?: 'many' }
const rendered: Rendered[] = [];

const renderMatrix = () => {
  for (const template of templates) {
    for (const kind of kinds) {
      for (const variant of VARIANTS) {
        const base = SAMPLE_DOCUMENTS[kind];
        const made = variant.make(kind, base);
        if (made === null) continue;
        const data = { ...made };
        if (variant.id !== 'legacy-colors') data.templateId = template;
        const type = KIND_TO_FORM_TYPE[kind];
        const tag = `[${template}/${kind}/${variant.id}]`;
        let r;
        try {
          r = renderDocument(type, data, variant.id === 'empty' ? {} : SAMPLE_PROFILE, variant.id === 'empty' ? null : SAMPLE_JOB, variant.id === 'legacy-colors' ? { templateId: template } : {});
        } catch (e: any) {
          check(false, `${tag} threw: ${e?.stack || e}`);
          continue;
        }
        const html = r.html;
        const text = visibleText(html);
        check(!/\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]/.test(text), `${tag} prints undefined/NaN/Invalid Date: …${(text.match(/.{0,40}(\bundefined\b|\bNaN\b|Invalid Date|\[object Object\]).{0,40}/) || [''])[0]}…`);
        check(r.templateId === template, `${tag} rendered with ${r.templateId}`);
        if (variant.id === 'xss') {
          // escaped payload text is harmless; only real tags/attributes or unsafe URLs count as a leak
          const bad = html.match(/<script|<img src=x|<svg\/onload|"><img src=x|javascript:|<\/style>\s*<script|<[a-z][^<>]*\son(error|load)=/i);
          check(!bad, `${tag} XSS payload leaked into HTML: ${bad?.[0]}`);
        }
        if (variant.id === 'sample' || variant.id === 'long' || variant.id === 'unicode' || variant.id === 'legacy-colors') {
          const grand = expectedGrand(kind, data);
          if (grand) check(html.includes(grand), `${tag} total ${grand} missing`);
          if (data.signatureUrl) check(html.includes(data.signatureUrl), `${tag} contractor signature missing`);
          if (data.clientSignatureUrl) check(html.includes(data.clientSignatureUrl), `${tag} client signature missing`);
          if (data.logoUrl) check(html.includes(data.logoUrl), `${tag} logo missing`);
          for (const value of variant.id === 'long' ? [] : REQUIRED_TEXT[kind](data).filter(Boolean)) {
            const probe = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
            check(text.includes(probe), `${tag} missing field text "${probe}"`);
          }
        }
        if (isOptionsVariant(variant.id)) {
          // good/better/best: every option with its name and total, the shared lines once, one to choose
          const cards = r.model.choices?.cards || [];
          check(cards.length === 3 && !r.model.items && !r.model.totals.length, `${tag} options model (3 cards, no single table)`);
          check(html.includes('class="cd-opts-list"') && (html.match(/<section class="cd-block[^"]*\bcd-opt-sum\b/g) || []).length === 3, `${tag} options blocks missing`);
          for (const c of cards) {
            check(text.includes(decode(c.name)) && html.includes(c.total), `${tag} option ${c.letter} name / total ${c.total} missing`);
            check(cards.filter((x) => x.recommended).length === 1, `${tag} exactly one Recommended option`);
          }
          check(text.includes('Included in every option') && text.includes('Site protection'), `${tag} shared lines missing`);
          const chosen = variant.id === 'options-chosen';
          check(chosen ? text.includes('Your options') && text.includes('Chosen') && text.includes('(chose B: Better)') : text.includes('Choose one option') && text.includes('Recommended'), `${tag} choice wording`);
          for (const value of REQUIRED_TEXT[kind](data).filter(Boolean)) {
            const probe = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
            check(text.includes(probe), `${tag} missing field text "${probe}"`);
          }
          if (data.signatureUrl) check(html.includes(data.signatureUrl), `${tag} contractor signature missing`);
          if (data.clientSignatureUrl) check(html.includes(data.clientSignatureUrl), `${tag} client signature missing`);
        }
        if (variant.id === 'long' && (kind === 'dailyReport' || kind === 'note')) {
          check((html.match(/LAST_CONTENT_MARKER/g) || []).length === 1, `${tag} rich content must appear exactly once`);
        }
        if (variant.id === 'legacy-colors') check(html.includes(TEMPLATES.find((t) => t.id === template)!.accent), `${tag} legacy default colors must use the template palette`);
        const dir = join(OUT, 'html', template);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${kind}-${variant.id}.html`);
        writeFileSync(file, html, 'utf8');
        rendered.push({ template, kind, variant: variant.id, file, expectPages: variant.id === 'long' || variant.id === 'options-long' ? 'many' : undefined });
      }
    }
  }
};

// ---------------------------------------------------------------------------
// 3. browser stage (Chrome DevTools Protocol, no extra dependencies)
// ---------------------------------------------------------------------------
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean) as string[];

class Cdp {
  private id = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: any) => void }>();
  private listeners: Array<(m: any) => void> = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener('message', (ev: any) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.rej(new Error(msg.error.message)); else p.res(msg.result);
      } else if (msg.method) this.listeners.forEach((l) => l(msg));
    });
  }
  static connect(url: string) {
    return new Promise<Cdp>((res, rej) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => res(new Cdp(ws)));
      ws.addEventListener('error', (e) => rej(e));
    });
  }
  send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise<any>((res, rej) => this.pending.set(id, { res, rej }));
  }
  once(method: string, timeoutMs = 30000) {
    return new Promise<any>((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout waiting for ${method}`)), timeoutMs);
      const l = (m: any) => {
        if (m.method === method) {
          clearTimeout(t);
          this.listeners = this.listeners.filter((x) => x !== l);
          res(m.params);
        }
      };
      this.listeners.push(l);
    });
  }
  async eval<T = any>(expression: string, timeoutMs = 60000): Promise<T> {
    const r = await Promise.race([
      this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout')), timeoutMs)),
    ]) as any;
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value as T;
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const launchChrome = async (): Promise<{ proc: ChildProcess; cdp: Cdp; profileDir: string } | null> => {
  const exe = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!exe) return null;
  const profileDir = mkdtempSync(join(tmpdir(), 'cd-qa-chrome-'));
  const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, '--allow-file-access-from-files', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const port = await new Promise<number>((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('Chrome did not start')), 20000);
    proc.stderr!.on('data', (d) => {
      buf += String(d);
      const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(buf);
      if (m) { clearTimeout(t); res(Number(m[1])); }
    });
  });
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as any[];
  const page = targets.find((t) => t.type === 'page');
  const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  return { proc, cdp, profileDir };
};

const bundle = async (code: string, name: string) => {
  const esbuild = await import('esbuild');
  const outfile = join(OUT, `${name}.js`);
  await esbuild.build({
    stdin: { contents: code, resolveDir: ROOT, sourcefile: `${name}.entry.ts`, loader: 'ts' },
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  });
  return readFileSync(outfile, 'utf8');
};

/** Text drawn with Tj/TJ in a jsPDF file (content streams inflated), PDF string escapes resolved. */
const pdfText = (bytes: Buffer): { text: string; invisibleRuns: number } => {
  const raw = bytes.toString('latin1');
  let content = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const chunk = bytes.subarray(start, end);
    try { content += `${inflateSync(chunk).toString('latin1')}
`; } catch { /* image or other binary stream */ }
    re.lastIndex = end + 'endstream'.length;
  }
  const strings = Array.from(content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)).map((x) => x[1].replace(/\\([()\\])/g, '$1'));
  return { text: strings.join(' '), invisibleRuns: (content.match(/\b3 Tr\b/g) || []).length };
};

const navigate = async (cdp: Cdp, url: string) => {
  const loaded = cdp.once('Page.loadEventFired', 30000);
  await cdp.send('Page.navigate', { url });
  await loaded;
};

const CHECK_PAGES_JS = `(() => {
  const root = document.querySelector('.cd-root');
  const pageH = parseFloat(root.getAttribute('data-page-height'));
  const pages = Array.from(document.querySelectorAll('.cd-page'));
  const problems = [];
  pages.forEach((p, i) => {
    const pr = p.getBoundingClientRect();
    const body = p.querySelector('.cd-body');
    const pb = parseFloat(getComputedStyle(body).paddingBottom) || 0;
    const lim = pr.top + pageH - pb + 1.5;
    body.querySelectorAll(':scope > .cd-block').forEach((b) => {
      const r = b.getBoundingClientRect();
      const mb = Math.min(0, parseFloat(getComputedStyle(b).marginBottom) || 0);
      if (r.bottom + mb > lim) problems.push('page ' + (i + 1) + ': ' + b.className + ' overflows by ' + Math.round(r.bottom + mb - lim) + 'px');
      if (r.right > pr.right + 1) problems.push('page ' + (i + 1) + ': ' + b.className + ' wider than the page');
    });
    if (!body.querySelector(':scope > .cd-block')) problems.push('page ' + (i + 1) + ' is empty');
  });
  const broken = Array.from(document.images).filter((im) => im.complete && im.naturalWidth === 0).map((im) => (im.getAttribute('src') || '').slice(0, 60));
  return { pages: pages.length, problems, broken, height: Math.ceil(document.documentElement.scrollHeight), width: Math.ceil(document.documentElement.scrollWidth),
    first: (() => { const r = pages[0].getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; })() };
})()`;

/** Where the totals landed after pagination: page, lines above them, "Continued" note, gap at the bottom of the page before. */
const TOTALS_GAP_JS = `() => {
  const root = document.querySelector('.cd-root'); const pageH = parseFloat(root.getAttribute('data-page-height'));
  const pages = Array.from(document.querySelectorAll('.cd-page'));
  const sum = document.querySelector('.cd-summary'); if (!sum) return null;
  const page = sum.closest('.cd-page'); const pi = pages.indexOf(page);
  const blocks = Array.from(page.querySelectorAll('.cd-body > .cd-block'));
  const before = blocks.slice(0, blocks.indexOf(sum));
  const note = before.some((b) => b.classList.contains('cd-cont-note'));
  const rowsAbove = before.filter((b) => b.classList.contains('cd-items')).reduce((a, b) => a + b.querySelectorAll('tbody tr').length, 0);
  // the totals opened this page (alone, or with rows carried from the table of the page before)
  const opened = pi > 0 && before.every((b) => b.classList.contains('cd-cont-note') || (b.classList.contains('cd-items') && b.getAttribute('data-cont') === '1'));
  let gap = 0, bodyH = 0;
  if (opened) {
    const prev = pages[pi - 1]; const pr = prev.getBoundingClientRect(); const cs = getComputedStyle(prev.querySelector('.cd-body'));
    const lim = pr.top + pageH - parseFloat(cs.paddingBottom);
    const last = Array.from(prev.querySelectorAll('.cd-body > .cd-block')).pop();
    gap = lim - last.getBoundingClientRect().bottom;
    const rh = prev.querySelector('.cd-body > .cd-runhead');
    const top = rh && getComputedStyle(rh).display !== 'none' ? rh.getBoundingClientRect().bottom + parseFloat(getComputedStyle(rh).marginBottom) : pr.top + parseFloat(cs.paddingTop);
    bodyH = lim - top;
  }
  return { pi, note, rowsAbove, carried: opened && !note && rowsAbove > 0, gap: Math.round(gap), bodyH: Math.round(bodyH),
    sumH: Math.round(sum.getBoundingClientRect().height), problems: ${CHECK_PAGES_JS}.problems };
}`;

const browserStage = async () => {
  const chrome = await launchChrome();
  if (!chrome) {
    warnings.push('Chrome not found: browser checks, screenshots and PDF tests skipped (set CHROME_PATH).');
    return;
  }
  const { cdp, proc, profileDir } = chrome;
  try {
    const paginateJs = await bundle(`import { paginateDocument } from './utils/templates/paginate.ts'; (window as any).__cdPaginate = paginateDocument;`, 'qa-paginate');
    const shotsMode = args.get('shots') || 'sample';
    const shotDir = join(OUT, 'png');
    mkdirSync(shotDir, { recursive: true });
    const wantShot = (r: Rendered) => shotsMode === 'all'
      || (shotsMode === 'sample' && (r.variant === 'sample' || r.variant === 'options' || (r.variant === 'long' && (r.kind === 'invoice' || r.kind === 'dailyReport'))))
      // design review: every kind's sample and long (page breaks) variants + the good/better/best estimates
      || (shotsMode === 'review' && (r.variant === 'sample' || r.variant === 'long' || isOptionsVariant(r.variant)));
    const targets = rendered.filter((r) => r.variant !== 'xss' && (wantShot(r) || r.variant === 'long' || r.variant === 'unicode' || isOptionsVariant(r.variant)));
    let shots = 0;
    let textLayerJs = '';
    for (const r of targets) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
      await navigate(cdp, pathToFileURL(r.file).href);
      await cdp.eval(paginateJs + ';0');
      const info = await cdp.eval<any>(`(async () => { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 6000))]); await new Promise(r => setTimeout(r, 60)); window.__cdPaginate(document); return ${CHECK_PAGES_JS}; })()`);
      const tag = `[${r.template}/${r.kind}/${r.variant}]`;
      for (const p of info.problems) failures.push(`${tag} ${p}`);
      if (args.has('heights') && r.variant === 'sample') {
        const hs = await cdp.eval<string>(`Array.from(document.querySelectorAll('.cd-page')).map((p, i) => 'p' + (i + 1) + ': ' + Array.from(p.querySelectorAll('.cd-body > .cd-block')).map((b) => b.className.replace('cd-block ', '').split(' ')[0] + '=' + Math.round(b.getBoundingClientRect().height)).join(' ')).join(' | ')`);
        console.log(`${tag} ${info.pages}p  ${hs}`);
      }
      if (info.broken.length) failures.push(`${tag} broken images: ${info.broken.join(', ')}`);
      if (info.width > 901) failures.push(`${tag} horizontal overflow (${info.width}px)`);
      if (r.expectPages === 'many' && ['invoice', 'estimate', 'purchaseOrder', 'dailyReport', 'note', 'materialLog', 'timeSheet'].includes(r.kind)) {
        check(info.pages > 1, `${tag} long document should paginate (got ${info.pages} page)`);
      }
      checks++;
      if (wantShot(r)) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: Math.min(info.height, 16000), deviceScaleFactor: 1, mobile: false });
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 900, height: Math.min(info.height, 16000), scale: 1 } });
        const dir = join(shotDir, r.template);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${r.kind}-${r.variant}.png`), Buffer.from(shot.data, 'base64'));
        shots++;
      }
      if (args.has('textlayer') && r.variant === 'sample') {
        if (!textLayerJs) textLayerJs = await bundle(`import { __collectTextRuns } from './services/pdfGenerator.ts'; (window as any).__cdRuns = __collectTextRuns;`, 'qa-textlayer');
        await cdp.eval(textLayerJs + ';0');
        const n = await cdp.eval<number>(`(() => {
          const page = document.querySelector('.cd-page'); const pr = page.getBoundingClientRect();
          const runs = window.__cdRuns(page); const c = document.createElement('canvas').getContext('2d');
          for (const r of runs) {
            const h = r.bottom - r.top; const base = r.bottom - Math.max(0, (h - r.fontPx * 1.2) / 2) - r.fontPx * 0.26;
            c.font = r.fontPx + 'px Helvetica, Arial, sans-serif'; const nat = c.measureText(r.text).width || 1;
            const s = document.createElement('span'); s.textContent = r.text;
            s.style.cssText = 'position:absolute;white-space:pre;z-index:99;color:rgba(230,0,0,.6);font:' + r.fontPx + 'px Helvetica, Arial, sans-serif;line-height:1;transform-origin:0 0;transform:scaleX(' + ((r.right - r.left) / nat) + ');left:' + (pr.left + scrollX + r.left) + 'px;top:' + (pr.top + scrollY + base - r.fontPx * 0.85) + 'px';
            document.body.appendChild(s);
          }
          return runs.length; })()`);
        check(n > 10, `[${r.template}/${r.kind}] text layer found only ${n} runs`);
        const f = info.first;
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: f.x, y: f.y, width: f.w, height: f.h, scale: 1 } });
        const dir = join(shotDir, r.template);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${r.kind}-textlayer.png`), Buffer.from(shot.data, 'base64'));
      }
      if (args.has('previews') && r.kind === 'invoice' && r.variant === 'sample') {
        const previewDir = join(ROOT, 'public', 'templates', 'previews');
        mkdirSync(previewDir, { recursive: true });
        const f = info.first;
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: Math.min(info.height, 16000), deviceScaleFactor: 1, mobile: false });
        // WebP, 640 px wide: the page shows them at most ~300 px wide (2× for sharp screens), ~35 KB each
        const shot = await cdp.send('Page.captureScreenshot', { format: 'webp', quality: 80, captureBeyondViewport: true, clip: { x: f.x, y: f.y, width: f.w, height: f.h, scale: 640 / f.w } });
        writeFileSync(join(previewDir, `${r.template}.webp`), Buffer.from(shot.data, 'base64'));
      }
    }
    console.log(`browser: paginated ${targets.length} documents, ${shots} screenshots in ${shotDir}`);

    // totals at a page break: invoices with 8…30 lines put the totals at every possible spot of the page end. The totals
    // never start a page silently cut off from every line, and they never leave a big gap at the bottom of a page:
    // either the last row came along (gap ≤ 20% of the page body) or "Continued from page N" (gap < totals height).
    if (!args.has('no-gapsweep') && (!ONLY_KINDS || ONLY_KINDS.includes('invoice'))) {
      const descs = ['Framing labor', 'Drywall hang and finish, level 4', 'Interior paint, two coats', 'Trim carpentry', LONG_TEXT, 'Electrical device'];
      let swept = 0;
      for (const template of templates) {
        for (let n = 8; n <= 30; n++) {
          const lineItems = Array.from({ length: n }, (_, i) => ({ id: `g${i}`, description: `${i + 1}. ${descs[i % descs.length]}`, quantity: (i % 4) + 1, rate: 45 + i * 7.5, ...(i % 3 === 0 ? { unit: 'sq ft' } : {}) }));
          const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, lineItems, templateId: template }, SAMPLE_PROFILE, SAMPLE_JOB);
          const dir = join(OUT, 'html', template);
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `gap-${n}.html`);
          writeFileSync(file, r.html, 'utf8');
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false });
          await navigate(cdp, pathToFileURL(file).href);
          await cdp.eval(paginateJs + ';0');
          const g = await cdp.eval<any>(`(async () => { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 6000))]); window.__cdPaginate(document); return (${TOTALS_GAP_JS})(); })()`);
          const tag = `[${template}/invoice/gap-${n}]`;
          swept++;
          if (!g) { check(false, `${tag} totals missing`); continue; }
          for (const p of g.problems) failures.push(`${tag} ${p}`);
          check(g.rowsAbove > 0 || g.note, `${tag} totals start page ${g.pi + 1} without any line above them and without "Continued from page"`);
          if (g.carried) check(g.gap <= g.bodyH * 0.2 + 2, `${tag} carrying rows left a ${g.gap}px gap at the bottom of page ${g.pi} (max ${Math.round(g.bodyH * 0.2)}px)`);
          if (g.note) check(g.gap < g.sumH + 40, `${tag} totals moved under "Continued from page" although they fitted (gap ${g.gap}px, totals ${g.sumH}px)`);
          if (shotsMode === 'gaps' && g.pi > 0) {
            const h = await cdp.eval<number>('Math.ceil(document.documentElement.scrollHeight)');
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: Math.min(h, 16000), deviceScaleFactor: 1, mobile: false });
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: 900, height: Math.min(h, 16000), scale: 1 } });
            mkdirSync(join(shotDir, template), { recursive: true });
            writeFileSync(join(shotDir, template, `gap-${n}${g.note ? '-note' : g.carried ? '-carried' : ''}.png`), Buffer.from(shot.data, 'base64'));
          }
        }
      }
      console.log(`browser: totals-at-page-break sweep, ${swept} invoices`);
    }

    // empty boxes on sparse documents (always) and preview-vs-PDF pixel comparison (--pdfdiff); see templates-visual.ts
    if (!args.has('no-emptyboxes') || args.has('pdfdiff')) {
      await visualStage({
        cdp, navigate: (url) => navigate(cdp, url), bundle, out: OUT, templates, kinds, check, log: (m) => console.log(m),
        samples: SAMPLE_DOCUMENTS, sampleProfile: SAMPLE_PROFILE, sampleJob: SAMPLE_JOB,
        diffThreshold: Number(args.get('diff-threshold') || 1.5),
        // good/better/best estimate: no empty boxes, and the PDF matches the preview (--pdfdiff)
        extraCases: (kind) => (kind === 'estimate' ? [{ variant: 'options', data: optionsEstimate(clone(SAMPLE_DOCUMENTS.estimate)) }] : []),
      }, { pdfDiff: args.has('pdfdiff'), emptyBoxes: !args.has('no-emptyboxes') });
    }

    if (args.has('pdf')) {
      const pdfJs = await bundle(`import * as pdf from './services/pdfGenerator.ts'; (window as any).__cdPdf = pdf;`, 'qa-pdf');
      const blank = join(OUT, 'blank.html');
      writeFileSync(blank, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      const pdfDir = join(OUT, 'pdf');
      mkdirSync(pdfDir, { recursive: true });
      const pdfCases: Array<[string, DocKind, string]> = (ONLY_TEMPLATES || ['classic', 'bold', 'modern_contractor', 'corporate', 'heritage']).flatMap((t) =>
        (ONLY_KINDS || ['invoice', 'dailyReport']).map((k) => [t, k, 'long'] as [string, DocKind, string]));
      for (const [template, kind, variant] of pdfCases) {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
        await navigate(cdp, pathToFileURL(blank).href);
        await cdp.eval(pdfJs + ';0');
        const v = VARIANTS.find((x) => x.id === variant)!;
        const data = { ...v.make(kind, SAMPLE_DOCUMENTS[kind]), templateId: template };
        const tag = `[pdf ${template}/${kind}/${variant}]`;
        try {
          const uri = await cdp.eval<string>(`window.__cdPdf.generateDocumentPDF(${JSON.stringify(KIND_TO_FORM_TYPE[kind])}, ${JSON.stringify(data)}, ${JSON.stringify(SAMPLE_PROFILE)}, ${JSON.stringify(SAMPLE_JOB)}, ${JSON.stringify(template)}, true)`, 120000);
          const b64 = String(uri).split('base64,')[1] || '';
          const bytes = Buffer.from(b64, 'base64');
          const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
          check(bytes.length > 10000 && bytes.toString('latin1', 0, 5) === '%PDF-', `${tag} produced an invalid PDF`);
          check(pages > 1, `${tag} long document should have several PDF pages (got ${pages})`);
          // searchable text: the invisible text layer holds the document's own words
          const layer = pdfText(bytes);
          check(layer.invisibleRuns > 0, `${tag} PDF has no invisible text layer`);
          const probes = [data.invoiceNumber || data.reportNumber, data.clientName || data.projectName, 'Page 2 of'].filter(Boolean).map(String);
          for (const probe of probes) check(layer.text.includes(probe), `${tag} PDF text layer is missing "${probe}"`);
          const file = join(pdfDir, `${template}-${kind}-${variant}.pdf`);
          writeFileSync(file, bytes);
          console.log(`pdf: ${file} (${pages} pages, ${(bytes.length / 1024).toFixed(0)} KB)`);
        } catch (e: any) {
          check(false, `${tag} PDF generation failed: ${e?.message || e}`);
        }
      }
    }
  } finally {
    cdp.close();
    proc.kill();
    // remove the throw-away Chrome profile (tens of MB each) once Chrome let go of its files; a timer that the exiting
    // process never ran left one profile per run in the temp folder
    await new Promise((r) => { proc.once('exit', r); setTimeout(r, 4000); });
    try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); } catch { /* still locked: leave it */ }
  }
};

// ---------------------------------------------------------------------------
(async () => {
  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  unitChecks();
  renderMatrix();
  console.log(`static: ${rendered.length} documents rendered (${templates.length} templates × ${kinds.length} types × ${VARIANTS.length} variants) → ${join(OUT, 'html')}`);
  if (!args.has('no-browser')) await browserStage();
  for (const w of warnings) console.log(`WARN  ${w}`);
  const shown = failures.slice(0, 80);
  for (const f of shown) console.log(`FAIL  ${f}`);
  if (failures.length > shown.length) console.log(`… and ${failures.length - shown.length} more failures`);
  console.log(`\n${failures.length ? 'FAILED' : 'PASSED'}: ${checks} checks, ${failures.length} failures (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(failures.length ? 1 : 0);
})();
