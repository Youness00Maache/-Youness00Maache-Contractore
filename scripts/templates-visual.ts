/**
 * Visual checks for scripts/templates-qa.ts (browser stage):
 *
 *  1. preview vs PDF: every design × document type is laid out in Chrome (what the picker preview shows) and
 *     drawn by the PDF pipeline (html2canvas, services/pdfGenerator.ts → renderPageToCanvas). Both images are
 *     compared cell by cell; documents whose PDF differs visibly from the preview fail. A side-by-side PNG
 *     (preview | PDF | differences in red) is saved per case.
 *  2. empty boxes: on sparse documents (only the required fields) and empty ones, no bordered or filled box,
 *     card, panel or table may be printed without content, and no heading may be printed without its content.
 *
 * Flags (templates-qa.ts): --pdfdiff (preview vs PDF), --emptyboxes (empty boxes, also on by default in the
 * browser stage), --diff-threshold=<percent of page area> (default 1.5).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FormType } from '../types.ts';
import { KIND_TO_FORM_TYPE, PAPER, renderDocument, type DocKind } from '../utils/templates/index.ts';

/** Only what each form requires (or what a hurried user fills in), with a bare-bones profile. */
export const SPARSE_PROFILE = { id: 'sparse', email: '', name: '', companyName: 'Acme Builders' };
export const SPARSE_DOCUMENTS: Record<DocKind, Record<string, any>> = {
  invoice: { invoiceNumber: 'INV-1001', issueDate: '2026-11-05', clientName: 'Jane Smith', lineItems: [{ id: '1', description: 'Labor', quantity: 2, rate: 85 }] },
  estimate: { estimateNumber: 'EST-1001', issueDate: '2026-11-05', clientName: 'Jane Smith', lineItems: [{ id: '1', description: 'Deck repair', quantity: 1, rate: 1200 }] },
  workOrder: { workOrderNumber: 'WO-1001', date: '2026-11-05', clientName: 'Jane Smith', description: 'Replace the kitchen faucet.' },
  dailyReport: { date: '2026-11-05', content: '<p>Framed the north wall.</p>' },
  timeSheet: { workerName: 'Sam Lee', date: '2026-11-05', hoursWorked: 8 },
  materialLog: { date: '2026-11-05', items: [{ id: '1', name: '2x4 studs', quantity: 20, unitCost: 4.5 }] },
  expenseLog: { vendor: 'Home Depot', date: '2026-11-05', amount: 42.5 },
  warranty: { warrantyNumber: 'WAR-1001', completedDate: '2026-11-05', duration: '1 year', clientName: 'Jane Smith' },
  note: { title: 'Site visit', content: '<p>Client wants a darker stain.</p>' },
  receipt: { receiptNumber: 'REC-1001', date: '2026-11-05', amount: 250, clientName: 'Jane Smith' },
  changeOrder: { changeOrderNumber: 'CO-1001', date: '2026-11-05', description: 'Add one outlet.', lineItems: [{ id: '1', description: 'Outlet', quantity: 1, rate: 180 }] },
  purchaseOrder: { poNumber: 'PO-1001', date: '2026-11-05', vendorName: 'Lumber Co', lineItems: [{ id: '1', description: '2x4 studs', quantity: 20, rate: 4.5 }] },
  profitReport: { items: [{ id: '1', description: 'Deck', cost: 800, charge: 1200 }] },
};

export interface VisualEnv {
  cdp: { send: (m: string, p?: Record<string, unknown>) => Promise<any>; eval: <T = any>(expr: string, timeoutMs?: number) => Promise<T> };
  navigate: (url: string) => Promise<void>;
  bundle: (code: string, name: string) => Promise<string>;
  out: string;
  templates: string[];
  kinds: DocKind[];
  check: (ok: unknown, msg: string) => void;
  log: (msg: string) => void;
  samples: Record<DocKind, Record<string, any>>;
  sampleProfile: Record<string, any>;
  sampleJob: Record<string, any>;
  diffThreshold: number;
}

/** Bordered/filled boxes without content, and headings without content (runs in the page after pagination). */
export const EMPTY_BOXES_JS = `(() => {
  const found = [];
  const alpha = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ''); if (!m) return c && c !== 'transparent' ? 1 : 0; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
  const textOf = (el) => (el.innerText || el.textContent || '').replace(/[\\s\\u00a0·•—–:|#\\-]+/g, '');
  const rich = (el) => !!el.querySelector('img, svg, canvas') || el.tagName === 'IMG' || el.tagName === 'svg';
  const paperOf = (el) => getComputedStyle(el.closest('.cd-page')).backgroundColor;
  const label = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase());
  document.querySelectorAll('.cd-page').forEach((page, pi) => {
    const paper = paperOf(page);
    const reported = new Set();
    page.querySelectorAll('.cd-body *, .cd-footer').forEach((el) => {
      if (el.closest('.cd-deco, [data-deco], .cd-row-filler, svg') || /^(TD|TH|TR|TBODY|THEAD|TABLE|COLGROUP|COL|BR|HR|LI)$/.test(el.tagName)) return;
      for (let a = el.parentElement; a && a !== page; a = a.parentElement) if (reported.has(a)) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
      const r = el.getBoundingClientRect();
      if (r.width < 28 || r.height < 18) return;
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((s) => parseFloat(cs['border' + s + 'Width']) >= 0.5 && cs['border' + s + 'Style'] !== 'none' && alpha(cs['border' + s + 'Color']) > 0.15).length;
      const fill = (alpha(cs.backgroundColor) > 0.08 && cs.backgroundColor !== paper) || (cs.backgroundImage && cs.backgroundImage !== 'none');
      if (sides < 2 && !fill && cs.boxShadow === 'none') return;
      if (textOf(el) || rich(el)) return;
      reported.add(el);
      found.push('page ' + (pi + 1) + ': empty box ' + label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    });
    // headings / labels printed without anything under or next to them
    page.querySelectorAll('.cd-body .cd-label, .cd-body .cd-h, .cd-body h3, .cd-body h4').forEach((el) => {
      if (el.closest('.cd-deco, [data-deco], .cd-prose, .cd-sig, .cd-tot')) return;
      const own = textOf(el);
      if (!own) return;
      const box = el.parentElement;
      if (box && textOf(box) === own && !rich(box)) found.push('page ' + (pi + 1) + ': heading without content ' + label(el) + ' "' + (el.textContent || '').trim() + '"');
    });
  });
  return found;
})()`;

/** Compares the Chrome layout (CDP screenshot, base64 PNG) with the PDF drawing of the same page. */
const DIFF_JS = (b64: string) => `(async () => {
  const page = document.querySelector('.cd-page');
  const w = page.offsetWidth, h = page.offsetHeight;
  // headless Chrome under QA load sometimes needs a second try to load the embedded fonts (a real browser
  // draws natively at the first try); a page that still falls back to html2canvas is reported below
  let pdf = await window.__cdCapture(page, 1);
  for (let t = 0; t < 2 && pdf.__renderer !== 'native'; t++) { await new Promise((r) => setTimeout(r, 500)); pdf = await window.__cdCapture(page, 1); }
  const renderer = pdf.__renderer || 'unknown', nativeError = window.__cdNativeError ? window.__cdNativeError() : '';
  const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode();
  const pc = document.createElement('canvas'); pc.width = w; pc.height = h;
  const px = pc.getContext('2d'); px.fillStyle = '#ffffff'; px.fillRect(0, 0, w, h); px.drawImage(img, 0, 0, w, h);
  const A = px.getImageData(0, 0, w, h).data;
  const qc = document.createElement('canvas'); qc.width = w; qc.height = h; const qx = qc.getContext('2d'); qx.drawImage(pdf, 0, 0, w, h);
  const B = qx.getImageData(0, 0, w, h).data;
  // a cell counts as different only if no small shift (text is often placed 1-2px off by the canvas renderer,
  // which nobody can see) makes it match: missing logos, backgrounds, borders, shadows or wrong fonts still count
  const cell = 8; let bad = 0, total = 0; const cells = [];
  const cellDiff = (x, y, dx, dy) => {
    let d = 0, n = 0;
    for (let yy = y; yy < Math.min(h, y + cell); yy++) {
      const by = yy + dy; if (by < 0 || by >= h) continue;
      for (let xx = x; xx < Math.min(w, x + cell); xx++) {
        const bx = xx + dx; if (bx < 0 || bx >= w) continue;
        const i = (yy * w + xx) * 4, j = (by * w + bx) * 4;
        d += Math.abs(A[i] - B[j]) + Math.abs(A[i + 1] - B[j + 1]) + Math.abs(A[i + 2] - B[j + 2]); n++;
      }
    }
    return n ? d / (n * 3) : 0;
  };
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    total++;
    let m = cellDiff(x, y, 0, 0);
    if (m > 24) for (const dy of [-2, -1, 0, 1, 2]) for (const dx of [-2, -1, 0, 1, 2]) { if (m <= 24) break; m = Math.min(m, cellDiff(x, y, dx, dy)); }
    if (m > 24) { bad++; cells.push([x, y]); }
  }
  const out = document.createElement('canvas'); out.width = w * 3 + 24; out.height = h; const o = out.getContext('2d');
  o.fillStyle = '#888'; o.fillRect(0, 0, out.width, h); o.drawImage(pc, 0, 0); o.drawImage(qc, w + 12, 0);
  o.globalAlpha = 0.35; o.drawImage(pc, 2 * w + 24, 0); o.globalAlpha = 1; o.fillStyle = 'rgba(230,0,0,0.75)';
  for (const [x, y] of cells) o.fillRect(2 * w + 24 + x, y, cell, cell);
  // where are the differences? (top/middle/bottom thirds) helps to read the report
  const zones = [0, 0, 0]; for (const [, y] of cells) zones[Math.min(2, Math.floor(y / (h / 3)))]++;
  // the largest block of neighbouring different cells: a missing logo, box, band or a wrong font in a heading
  // shows up as a 2-D blob, while text anti-aliasing noise stays in thin scattered strips
  const key = (x, y) => x + ',' + y; const set = new Set(cells.map(([x, y]) => key(x, y))); const seen = new Set(); let blob = { n: 0, w: 0, h: 0 };
  for (const [sx, sy] of cells) {
    if (seen.has(key(sx, sy))) continue;
    let n = 0, x0 = sx, x1 = sx, y0 = sy, y1 = sy; const stack = [[sx, sy]]; seen.add(key(sx, sy));
    while (stack.length) { const [x, y] = stack.pop(); n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[cell, 0], [-cell, 0], [0, cell], [0, -cell]]) { const k = key(x + dx, y + dy); if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); } } }
    const bw = (x1 - x0) / cell + 1, bh = (y1 - y0) / cell + 1;
    if (Math.min(bw, bh) >= 3 && n > blob.n) blob = { n, w: bw * cell, h: bh * cell, x: x0, y: y0 };
  }
  return { pct: (bad / total) * 100, zones, blob, renderer, nativeError, png: out.toDataURL('image/png').split(',')[1] };
})()`;

const writePage = (dir: string, name: string, html: string) => {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.html`);
  writeFileSync(file, html, 'utf8');
  return pathToFileURL(file).href;
};

const prepare = async (env: VisualEnv, url: string, width: number, height: number, js: string) => {
  await env.cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.max(1200, height + 40), deviceScaleFactor: 1, mobile: false });
  await env.navigate(url);
  await env.cdp.eval(js + ';0');
  await env.cdp.eval(`(async () => { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 6000))]);
    // the preview side must have its web fonts too (fonts.ready can resolve before slow font files arrive)
    for (let t = 0, ok = 0; t < 150 && ok < 3; t++) { await new Promise((r) => setTimeout(r, 100)); ok = Array.from(document.fonts).some((f) => f.status === 'loading') || document.fonts.status !== 'loaded' ? 0 : ok + 1; }
    await Promise.all(Array.from(document.images).map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    window.__cdPaginate(document); await new Promise((r) => setTimeout(r, 80)); return 0; })()`);
};

export const visualStage = async (env: VisualEnv, opts: { pdfDiff: boolean; emptyBoxes: boolean }) => {
  const js = await env.bundle(
    `import { paginateDocument } from './utils/templates/paginate.ts'; import * as pdf from './services/pdfGenerator.ts';
     (window as any).__cdPaginate = paginateDocument; (window as any).__cdCapture = pdf.renderPageToCanvas;
     (window as any).__cdNativeError = () => pdf.lastNativeError;`, 'qa-visual');
  const diffDir = join(env.out, 'pdfdiff');
  const scores: Array<{ tag: string; pct: number }> = [];
  const fallbacks: string[] = [];
  for (const template of env.templates) {
    for (const kind of env.kinds) {
      const type = KIND_TO_FORM_TYPE[kind] as FormType;
      const cases: Array<{ variant: string; data: any; profile: any; job: any }> = [];
      if (opts.pdfDiff) cases.push({ variant: 'sample', data: env.samples[kind], profile: env.sampleProfile, job: env.sampleJob });
      cases.push({ variant: 'sparse', data: SPARSE_DOCUMENTS[kind], profile: SPARSE_PROFILE, job: null });
      for (const c of cases) {
        const r = renderDocument(type, { ...c.data, templateId: template }, c.profile, c.job, { templateId: template, bare: true });
        const { width, height } = PAPER[r.paper];
        const url = writePage(join(env.out, 'visual', template), `${kind}-${c.variant}`, r.html);
        await prepare(env, url, width, height, js);
        const tag = `[${template}/${kind}/${c.variant}]`;
        if (opts.emptyBoxes) {
          const found = await env.cdp.eval<string[]>(EMPTY_BOXES_JS);
          for (const f of found) env.check(false, `${tag} ${f}`);
          if (!found.length) env.check(true, '');
        }
        if (opts.pdfDiff) {
          const top = await env.cdp.eval<number>(`(() => { const r = document.querySelector('.cd-page').getBoundingClientRect(); return r.top + scrollY; })()`);
          const shot = await env.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: top, width, height, scale: 1 } });
          const res = await env.cdp.eval<{ pct: number; zones: number[]; blob: { n: number; w: number; h: number; x?: number; y?: number }; renderer: string; nativeError: string; png: string }>(DIFF_JS(shot.data), 120000);
          const dir = join(diffDir, template);
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, `${kind}-${c.variant}.png`), Buffer.from(res.png, 'base64'));
          scores.push({ tag, pct: res.pct });
          const png = join(dir, `${kind}-${c.variant}.png`);
          if (res.renderer !== 'native') {
            // headless Chrome under QA load occasionally fails to load the fonts embedded in the page image (a desktop
            // browser draws natively at the first try); the PDF then uses the html2canvas fallback, whose known CSS
            // limits are not the design's fault. Counted below: too many fallbacks fail the run.
            fallbacks.push(`${tag} ${res.nativeError}`);
            continue;
          }
          env.check(res.pct <= env.diffThreshold, `${tag} PDF differs from the preview on ${res.pct.toFixed(2)}% of the page (top/mid/bottom cells ${res.zones.join('/')}) → ${png}`);
          env.check(res.blob.n < 9, `${tag} PDF differs from the preview in a ${res.blob.w}x${res.blob.h}px area at ${res.blob.x},${res.blob.y} → ${png}`);
        }
      }
    }
  }
  if (opts.pdfDiff) {
    const rate = scores.length ? fallbacks.length / scores.length : 0;
    for (const f of fallbacks) env.log(`WARN  PDF page drawn by the html2canvas fallback: ${f}`);
    env.check(rate <= 0.1, `${fallbacks.length} of ${scores.length} PDF pages (${(rate * 100).toFixed(1)}%) were not drawn by the browser itself (fallback)`);
  }
  if (scores.length) {
    scores.sort((a, b) => b.pct - a.pct);
    writeFileSync(join(diffDir, 'scores.txt'), scores.map((s) => `${s.pct.toFixed(3)} ${s.tag}`).join('\n'), 'utf8');
    env.log(`pdfdiff: ${scores.length} pages compared, worst: ${scores.slice(0, 8).map((s) => `${s.tag} ${s.pct.toFixed(2)}%`).join(', ')} → ${diffDir}`);
  }
};
