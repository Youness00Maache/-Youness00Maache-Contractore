/**
 * Template QA: renders every template × every document type with realistic data and edge cases, checks the
 * output, then (when Chrome is available) paginates and screenshots documents in a real browser and runs the
 * real PDF pipeline end to end.
 *
 *   npx tsx scripts/templates-qa.ts                       # static checks + browser checks + screenshots
 *   npx tsx scripts/templates-qa.ts --no-browser          # static checks only (fast, no Chrome needed)
 *   npx tsx scripts/templates-qa.ts --templates=classic,bold --kinds=invoice,dailyReport
 *   npx tsx scripts/templates-qa.ts --pdf                 # also generate real PDFs through services/pdfGenerator.ts
 *   npx tsx scripts/templates-qa.ts --previews            # also write public/templates/previews/<id>.png
 *   npx tsx scripts/templates-qa.ts --out=C:/tmp/cd-qa    # output folder (default: <os tmp>/contractordocs-templates-qa)
 *
 * Exit code 1 when any check fails.
 */
import { spawn, type ChildProcess } from 'node:child_process';
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

const VARIANTS: Array<{ id: string; make: (kind: DocKind, base: any) => any }> = [
  { id: 'sample', make: (_k, b) => clone(b) },
  { id: 'long', make: (k, b) => longVariant(k, b) },
  { id: 'xss', make: (_k, b) => xssVariant(b) },
  { id: 'unicode', make: (_k, b) => unicodeVariant(b) },
  { id: 'empty', make: () => ({}) },
  { id: 'legacy-colors', make: (_k, b) => ({ ...clone(b), themeColors: { primary: '#000000', secondary: '#666666' }, templateId: 'standard' }) },
];

const REQUIRED_TEXT: Record<DocKind, (d: any) => string[]> = {
  invoice: (d) => [d.invoiceNumber, d.clientName, d.notes?.split('\n')[0], d.terms, 'Pay online'],
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

  // backward compatibility
  for (const [legacy, mapped] of Object.entries(LEGACY_TEMPLATE_MAP)) {
    check(resolveTemplateId(legacy) === mapped, `legacy id ${legacy} must map to ${mapped}`);
    const r = renderDocument(FormType.Invoice, { ...SAMPLE_DOCUMENTS.invoice, templateId: legacy }, SAMPLE_PROFILE, SAMPLE_JOB);
    check(r.templateId === mapped, `legacy id ${legacy} renders with ${mapped}`);
  }
  check(resolveTemplateId(undefined) === 'classic' && resolveTemplateId('no-such-template') === 'classic', 'unknown ids fall back to classic');

  // legacy template functions (still imported by older code paths)
  const labels = { date: 'Date', dateValue: '2026-01-05', id: 'Invoice #', idValue: 'INV-1' };
  const legacyFns = [...Object.entries(LegacyA), ...Object.entries(LegacyB)].filter(([n, f]) => typeof f === 'function' && /^get.*HtmlTemplate$/.test(n) && n !== 'getProfitReportHtmlTemplate');
  check(legacyFns.length === 20, `expected 20 legacy template functions, found ${legacyFns.length}`);
  for (const [name, fn] of legacyFns) {
    const html = (fn as any)({ ...ref, invoiceNumber: 'INV-1', clientName: 'Bob', signatureUrl: SAMPLE_DOCUMENTS.invoice.signatureUrl }, SAMPLE_PROFILE, 'INVOICE', labels);
    check(typeof html === 'string' && html.includes('$203.00') && html.includes(SAMPLE_DOCUMENTS.invoice.signatureUrl), `legacy ${name} must render correct totals and the signature`);
    const report = adaptTemplateForContentDocument(fn as any, { reportNumber: 'DR-1', date: '2026-01-05', content: '<p>CONTENT_MARKER</p>', projectName: 'P' }, SAMPLE_PROFILE, 'DAILY REPORT', labels);
    check((report.match(/CONTENT_MARKER/g) || []).length === 1, `legacy adapter ${name} must render daily report content exactly once`);
  }
  check(typeof LegacyA.getAIVisualHtml({ metrics: [{ label: 'Done', value: '80%' }], progress_percentage: 80 }, '#123456') === 'string', 'getAIVisualHtml still exported');
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
        const data = { ...variant.make(kind, base) };
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
        if (variant.id === 'long' && (kind === 'dailyReport' || kind === 'note')) {
          check((html.match(/LAST_CONTENT_MARKER/g) || []).length === 1, `${tag} rich content must appear exactly once`);
        }
        if (variant.id === 'legacy-colors') check(html.includes(TEMPLATES.find((t) => t.id === template)!.accent), `${tag} legacy default colors must use the template palette`);
        const dir = join(OUT, 'html', template);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `${kind}-${variant.id}.html`);
        writeFileSync(file, html, 'utf8');
        rendered.push({ template, kind, variant: variant.id, file, expectPages: variant.id === 'long' ? 'many' : undefined });
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
      || (shotsMode === 'sample' && (r.variant === 'sample' || (r.variant === 'long' && (r.kind === 'invoice' || r.kind === 'dailyReport'))));
    const targets = rendered.filter((r) => r.variant !== 'xss' && (wantShot(r) || r.variant === 'long' || r.variant === 'unicode'));
    let shots = 0;
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
      if (args.has('previews') && r.kind === 'invoice' && r.variant === 'sample') {
        const previewDir = join(ROOT, 'public', 'templates', 'previews');
        mkdirSync(previewDir, { recursive: true });
        const f = info.first;
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: Math.min(info.height, 16000), deviceScaleFactor: 1, mobile: false });
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: f.x, y: f.y, width: f.w, height: f.h, scale: 900 / f.w } });
        writeFileSync(join(previewDir, `${r.template}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
    console.log(`browser: paginated ${targets.length} documents, ${shots} screenshots in ${shotDir}`);

    if (args.has('pdf')) {
      const pdfJs = await bundle(`import * as pdf from './services/pdfGenerator.ts'; (window as any).__cdPdf = pdf;`, 'qa-pdf');
      const blank = join(OUT, 'blank.html');
      writeFileSync(blank, '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
      const pdfDir = join(OUT, 'pdf');
      mkdirSync(pdfDir, { recursive: true });
      const pdfCases: Array<[string, DocKind, string]> = (ONLY_TEMPLATES || ['classic', 'construction', 'coastal', 'bold', 'executive']).flatMap((t) =>
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
    setTimeout(() => { try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ } }, 1500).unref();
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
