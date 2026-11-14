/**
 * PDF generation for every document type: ONE pipeline.
 *
 *   data ──renderDocument()──▶ print HTML (same HTML as the template gallery / previews)
 *        ──sandboxed iframe──▶ fonts + images loaded ──paginateDocument()──▶ fixed-size pages
 *        ──page → image (per page)──▶ jsPDF (one image per page + clickable link annotations
 *                                    + an invisible text layer, so the PDF text can be searched, selected and copied)
 *
 * Page → image: the browser draws the page itself (the page's HTML + CSS + embedded fonts and images inside an
 * SVG <foreignObject>, drawn onto a canvas), so the PDF is pixel-for-pixel what the preview shows: double
 * rules, shadows, transforms, gradients, blend modes, every design detail. If the browser refuses (very old
 * Safari taints such canvases) the page is drawn with html2canvas instead, which approximates some CSS.
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
  /** Invisible text layer over each page image (default true): makes the text searchable/selectable. */
  textLayer?: boolean;
  /** 'auto' (default): the browser draws each page (falls back to html2canvas); 'html2canvas': always html2canvas. */
  renderer?: 'auto' | 'html2canvas';
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

// ---------------------------------------------------------------------------
// invisible text layer
// ---------------------------------------------------------------------------
/**
 * The page is a picture (html2canvas), so the exact look of every design is kept. On top of it the text is
 * written again with PDF text rendering mode 3 ("invisible"): viewers draw nothing, but search, selection,
 * copy/paste and screen readers use it. Each run (a line of one text node) is placed at the position the
 * browser laid it out and horizontally scaled to the same width, so selections line up with the picture.
 * The standard Helvetica font is used (no font embedding); characters outside its Windows-1252 set are
 * transliterated where possible (− → -, → → ->) and otherwise replaced by '?', and runs that are mostly such
 * characters (e.g. CJK) are left out instead of producing noise. Rotated/skewed text and SVG text are skipped.
 */
const WINANSI_HIGH = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
const TRANSLIT: Record<string, string> = {
  '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2043': '-', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u2007': ' ',
  '\u2192': '->', '\u2190': '<-', '\u2713': 'v', '\u2714': 'v', '\u2715': 'x', '\u2716': 'x', '\u2605': '*', '\u2606': '*', '\u25cf': '•',
  '\u2026': '…', '\u2264': '<=', '\u2265': '>=', '\u00d7': '×', '\u2116': 'No.', '\u2022': '•', '\u25aa': '•', '\u25a0': '•',
};
const toWinAnsi = (text: string): { out: string; unknown: number } => {
  let out = '';
  let unknown = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) || 0;
    if (TRANSLIT[ch] !== undefined) { out += TRANSLIT[ch]; continue; }
    if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff) || WINANSI_HIGH.has(ch)) { out += ch; continue; }
    const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (base && base !== ch && [...base].every((c) => (c.codePointAt(0) || 0) < 0x100)) { out += base; continue; }
    if (/[\u200b-\u200d\ufe0f\ufeff]/.test(ch)) continue; // zero-width characters, emoji variation selectors
    out += '?';
    unknown++;
  }
  return { out, unknown };
};

interface TextRun { text: string; left: number; top: number; right: number; bottom: number; fontPx: number }

/** Text runs of one laid-out page, in page CSS pixels (relative to the page's top-left corner). */
const collectTextRuns = (pageEl: HTMLElement, win: Window): TextRun[] => {
  const doc = pageEl.ownerDocument;
  const pageRect = pageEl.getBoundingClientRect();
  const skipCache = new Map<Element, boolean>();
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let cs = styleCache.get(el);
    if (!cs) { cs = win.getComputedStyle(el); styleCache.set(el, cs); }
    return cs;
  };
  /** true when text in `el` is not drawn as plain horizontal text (hidden, transparent, rotated, SVG). */
  const skipped = (el: Element | null): boolean => {
    if (!el || el === pageEl) return false;
    const hit = skipCache.get(el);
    if (hit !== undefined) return hit;
    const cs = style(el);
    const tag = el.tagName.toLowerCase();
    const result = tag === 'svg' || tag === 'style' || tag === 'script' || el instanceof (win as any).SVGElement
      || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0
      || (cs.transform !== 'none' && !/^matrix\(1, 0, 0, 1,/.test(cs.transform))
      || skipped(el.parentElement);
    skipCache.set(el, result);
    return result;
  };
  const runs: TextRun[] = [];
  const range = doc.createRange();
  const walker = doc.createTreeWalker(pageEl, 4 /* NodeFilter.SHOW_TEXT */);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue || '';
    if (!text.trim()) continue;
    const parent = (node as Text).parentElement;
    if (!parent || skipped(parent)) continue;
    const cs = style(parent);
    const color = cs.color || '';
    if (/rgba\([^)]*,\s*0\)$/.test(color) || color === 'transparent') continue;
    const transform = cs.textTransform;
    const fontPx = parseFloat(cs.fontSize) || 12;
    let run: TextRun | null = null;
    const flush = () => { if (run && run.text.trim()) runs.push(run); run = null; };
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) continue;
      // a word broken over two lines (hyphenation, overflow-wrap) yields several rects: one run per rect
      const pieces = rects.length === 1 ? [{ r: rects[0], w: m[0] }] : rects.map((r, i) => ({ r, w: i === 0 ? m![0] : '' }));
      for (const { r, w } of pieces) {
        const box = { left: r.left - pageRect.left, top: r.top - pageRect.top, right: r.right - pageRect.left, bottom: r.bottom - pageRect.top };
        if (box.right < 0 || box.bottom < 0 || box.left > pageRect.width || box.top > pageRect.height) continue;
        let word = w;
        if (transform === 'uppercase') word = word.toUpperCase();
        else if (transform === 'lowercase') word = word.toLowerCase();
        else if (transform === 'capitalize') word = word.charAt(0).toUpperCase() + word.slice(1);
        const cur = run as TextRun | null;
        const sameLine = cur && Math.abs(box.top - cur.top) < Math.max(2, fontPx * 0.3) && box.left >= cur.right - 1 && box.left - cur.right < fontPx * 1.2;
        if (cur && sameLine) {
          cur.text += ` ${word}`;
          cur.right = box.right;
          cur.bottom = Math.max(cur.bottom, box.bottom);
        } else {
          flush();
          run = { text: word, ...box, fontPx };
        }
      }
    }
    flush();
  }
  range.detach?.();
  return runs;
};

/** Exposed for QA (scripts/templates-qa.ts overlays the runs on the page to check they line up). */
export const __collectTextRuns = (pageEl: HTMLElement) => collectTextRuns(pageEl, pageEl.ownerDocument.defaultView || window);

/** Writes the page's text runs as invisible PDF text (Tr 3) at their laid-out positions. */
const addTextLayer = (pdf: any, pageEl: HTMLElement, win: Window, sx: number, sy: number) => {
  const runs = collectTextRuns(pageEl, win);
  if (!runs.length) return;
  pdf.setFont('helvetica', 'normal');
  for (const r of runs) {
    const { out, unknown } = toWinAnsi(r.text);
    if (!out.trim() || unknown > out.length / 2) continue;
    const size = Math.max(1, r.fontPx * sy);
    pdf.setFontSize(size);
    const natural = pdf.getTextWidth(out);
    const target = (r.right - r.left) * sx;
    if (!(natural > 0) || !(target > 0)) continue;
    const scale = Math.min(4, Math.max(0.25, target / natural));
    // baseline: line boxes are ~1.2em tall with the alphabetic baseline ~22% above the box bottom
    const h = r.bottom - r.top;
    const baseline = (r.bottom - Math.max(0, (h - r.fontPx * 1.2) / 2) - r.fontPx * 0.26) * sy;
    try {
      pdf.text(out, r.left * sx, baseline, { renderingMode: 'invisible', horizontalScale: scale, baseline: 'alphabetic' });
    } catch {
      /* one bad run must never break the PDF */
    }
  }
};

// ---------------------------------------------------------------------------
// native page drawing (SVG foreignObject)
// ---------------------------------------------------------------------------
const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(r.error || new Error('read failed'));
  r.readAsDataURL(blob);
});

/** fetch() with a timeout and two retries (a dropped request on a weak connection must not change how the PDF looks). */
const fetchRetry = async (url: string, ms = 10000): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => ctrl?.abort(), ms);
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl?.signal });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(t);
    }
    await sleep(400 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error('fetch failed');
};

const fetchAsDataUrl = async (url: string): Promise<string> => blobToDataUrl(await (await fetchRetry(url)).blob());

const dataUrlCache = new Map<string, Promise<string>>();
const cachedDataUrl = (url: string) => {
  let p = dataUrlCache.get(url);
  if (!p) {
    p = fetchAsDataUrl(url);
    p.catch(() => dataUrlCache.delete(url));
    dataUrlCache.set(url, p);
  }
  return p;
};

/**
 * The Google Fonts stylesheet with every font file embedded (data: URLs), restricted to the Latin subsets
 * (all text the documents print). Throws when a font can't be embedded: the page must then be drawn by
 * html2canvas, which uses the fonts the frame already loaded, instead of silently changing the typeface.
 */
const fontCssCache = new Map<string, Promise<string>>();
const embeddedFontCss = (href: string): Promise<string> => {
  let p = fontCssCache.get(href);
  if (!p) {
    p = (async () => {
      const css = await (await fetchRetry(href)).text();
      const faces: string[] = [];
      const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const subset = (m[1] || 'latin').toLowerCase();
        if (subset !== 'latin' && subset !== 'latin-ext') continue;
        let face = m[2];
        const urls = Array.from(face.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)).map((u) => u[1]);
        for (const u of urls) face = face.split(u).join(await cachedDataUrl(u));
        faces.push(face);
      }
      return faces.join('\n');
    })();
    p.catch(() => fontCssCache.delete(href));
    fontCssCache.set(href, p);
  }
  return p;
};

let nativeUnavailable = false;

const loadSvgImage = (svg: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.decoding = 'sync';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('the page could not be drawn natively'));
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});

/** Cheap fingerprint of a canvas (every 7th pixel), to see when repeated draws stop changing. */
const canvasPrint = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const d = ctx.getImageData(0, 0, w, h).data;
  let a = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 28) { a = (a + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000000007; b = (b * 31 + a) % 1000000009; }
  return `${a}:${b}`;
};

interface FontFace { family: string; weight: string; style: string }
const fontFacesOf = (fontCss: string): FontFace[] => {
  const seen = new Set<string>();
  return Array.from(fontCss.matchAll(/@font-face\s*\{([^}]*)\}/g)).map((f) => {
    const get = (prop: string) => (new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(f[1]) || [])[1] || '';
    return { family: get('font-family').trim(), weight: (get('font-weight') || '400').trim().split(/\s+/)[0], style: (get('font-style') || 'normal').trim() };
  }).filter((f) => {
    const k = `${f.family}|${f.weight}|${f.style}`;
    if (!f.family || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

const unquote = (family: string) => family.trim().replace(/^['"]|['"]$/g, '').toLowerCase();

/**
 * Only the embedded faces the page really uses (family + nearest weight + style of every element that has text),
 * so the SVG stays small and the font probe waits only for faces that matter.
 */
const usedFontCss = (fontCss: string, pageEl: HTMLElement): string => {
  const win = pageEl.ownerDocument.defaultView || window;
  const used = new Map<string, Set<string>>();
  const els = [pageEl, ...Array.from(pageEl.querySelectorAll('*'))];
  for (const el of els) {
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.nodeValue || '').trim())) continue;
    const cs = win.getComputedStyle(el);
    const fam = unquote(cs.fontFamily.split(',')[0] || '');
    const style = /italic|oblique/.test(cs.fontStyle) ? 'italic' : 'normal';
    if (!used.has(fam)) used.set(fam, new Set());
    used.get(fam)!.add(`${parseInt(cs.fontWeight, 10) || 400}|${style}`);
  }
  const blocks = Array.from(fontCss.matchAll(/@font-face\s*\{[^}]*\}/g)).map((m) => m[0]);
  const info = blocks.map((b) => {
    const get = (prop: string) => (new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(b) || [])[1] || '';
    return { css: b, family: unquote(get('font-family')), weight: parseInt(get('font-weight'), 10) || 400, style: /italic|oblique/.test(get('font-style')) ? 'italic' : 'normal' };
  });
  const keep = new Set<string>();
  for (const [fam, combos] of used) {
    for (const combo of combos) {
      const [w, st] = combo.split('|');
      const want = Number(w);
      const cands = info.filter((f) => f.family === fam && f.style === st);
      if (!cands.length) continue;
      // CSS font matching, simplified: the nearest available weight (lighter first up to 500, heavier above)
      const best = cands.reduce((a, f) => {
        const da = Math.abs(a.weight - want);
        const df = Math.abs(f.weight - want);
        if (df !== da) return df < da ? f : a;
        return (want <= 500 ? f.weight < a.weight : f.weight > a.weight) ? f : a;
      });
      cands.filter((f) => f.weight === best.weight).forEach((f) => keep.add(f.css));
    }
  }
  return blocks.filter((b) => keep.has(b)).join('\n');
};

/** Last reason the browser could not draw a page itself (QA shows it when a page fell back to html2canvas). */
export let lastNativeError = '';

/**
 * Draws a laid-out page with the browser's own renderer (identical to the preview). Throws if it can't.
 *
 * Fonts embedded in an SVG image are decoded asynchronously, so a first drawing can still use a fallback font.
 * The SVG therefore carries, below the page, a font probe: every embedded face written twice, once with a
 * monospace and once with a serif fallback. While the two copies differ a face is not ready; the page is drawn
 * only once they match (or after 10 s, then the PDF is drawn with html2canvas instead of with a wrong font).
 */
const nativeCapture = async (pageEl: HTMLElement, o: { width: number; height: number; scale: number }): Promise<HTMLCanvasElement> => {
  if (nativeUnavailable) throw new Error('native page drawing unavailable in this browser');
  const doc = pageEl.ownerDocument;
  const root = pageEl.closest('.cd-root') as HTMLElement | null;
  const fontLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.getAttribute('href') || '')
    .filter((h) => /^https:\/\/fonts\.googleapis\.com\//.test(h));
  const fontCss = usedFontCss((await Promise.all(fontLinks.map(embeddedFontCss))).join('\n'), pageEl);
  const css = Array.from(doc.querySelectorAll('style')).map((st) => st.textContent || '').join('\n');

  const page = pageEl.cloneNode(true) as HTMLElement;
  await Promise.all(Array.from(page.querySelectorAll('img')).map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (!src || /^data:/i.test(src)) return;
    try {
      img.setAttribute('src', await cachedDataUrl(src));
    } catch {
      img.setAttribute('style', `${img.getAttribute('style') || ''};visibility:hidden`); // like before: no broken-image icon
    }
    img.removeAttribute('crossorigin');
  }));
  page.style.margin = '0';
  const wrap = doc.createElement('div');
  if (root) for (const a of Array.from(root.attributes)) wrap.setAttribute(a.name, a.value);
  wrap.style.width = `${o.width}px`;
  wrap.style.margin = '0';
  wrap.appendChild(page);
  const xhtml = new XMLSerializer().serializeToString(wrap);

  const faces = fontFacesOf(fontCss);
  const PW = Math.floor(o.width / 2);
  const ROW = 16;
  const probeH = faces.length ? faces.length * ROW : 0;
  const probeCol = (fallback: string, left: number) => `<div style="position:absolute;left:${left}px;top:0;width:${PW}px">${faces.map((f) =>
    `<div style="height:${ROW}px;overflow:hidden;white-space:nowrap;font-family:${f.family}, ${fallback};font-weight:${f.weight};font-style:${f.style};font-size:13px;line-height:${ROW}px;color:#000">Hamburgefonstiv 0123 $</div>`).join('')}</div>`;
  const probe = faces.length
    ? `<div style="position:absolute;left:0;top:${o.height}px;width:${o.width}px;height:${probeH}px;background:#fff">${probeCol('monospace', 0)}${probeCol('serif', PW)}</div>`
    : '';
  const H = o.height + probeH;
  const styles = `${fontCss}\n${css}`.replace(/]]>/g, ']] >');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${H}" viewBox="0 0 ${o.width} ${H}">`
    + `<foreignObject x="0" y="0" width="${o.width}" height="${H}">`
    + `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${o.width}px;height:${H}px;margin:0;padding:0;background:#ffffff">`
    + `<style><![CDATA[${styles}]]></style>`
    + `<div style="position:absolute;left:0;top:0;width:${o.width}px;height:${o.height}px;overflow:hidden">${xhtml}</div>${probe}</div></foreignObject></svg>`;

  let img = await loadSvgImage(svg);
  try { await img.decode(); } catch { /* onload already fired */ }

  // wait until every embedded face is really used (both probe columns identical)
  if (faces.length) {
    const pc = doc.createElement('canvas');
    pc.width = o.width;
    pc.height = probeH;
    const px = pc.getContext('2d');
    const start = Date.now();
    let imgStart = start;
    let attempt = 0;
    let ready = false;
    let pending: FontFace[] = faces;
    while (px && !ready && Date.now() - start < 10000) {
      px.fillStyle = '#ffffff';
      px.fillRect(0, 0, pc.width, pc.height);
      px.drawImage(img, 0, o.height, o.width, probeH, 0, 0, o.width, probeH);
      const a = px.getImageData(0, 0, PW, probeH).data;
      const b = px.getImageData(PW, 0, PW, probeH).data;
      // a face is ready when both copies have the same glyphs; anti-aliasing can differ by a few pixels, a
      // fallback font differs everywhere (other widths and shapes)
      pending = faces.filter((_, r) => {
        let n = 0;
        for (let i = r * ROW * PW * 4; i < (r + 1) * ROW * PW * 4; i += 4) if (Math.abs(a[i] - b[i]) > 96 && ++n > 30) return true;
        return false;
      });
      ready = pending.length === 0;
      if (!ready) {
        await sleep(60);
        // an SVG image can keep painting its first (fallback-font) frame: after a while, a fresh copy picks up
        // the fonts the browser has decoded meanwhile (each copy gets time to load them)
        if (Date.now() - imgStart > 1500) {
          // a different URL (comment) so the browser builds a new image instead of reusing the cached one
          img = await loadSvgImage(`${svg}<!--${++attempt}-->`);
          try { await img.decode(); } catch { /* onload already fired */ }
          imgStart = Date.now();
        }
      }
    }
    if (!ready) throw new Error(`the document fonts did not load in time (${pending.map((f) => `${f.family} ${f.weight} ${f.style}`).join(', ')})`);
  }

  const canvas = doc.createElement('canvas');
  canvas.width = Math.floor(o.width * o.scale);
  canvas.height = Math.floor(o.height * o.scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  const draw = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, o.width, o.height, 0, 0, canvas.width, canvas.height);
  };
  // redraw until two drawings match: embedded images can also arrive on a later draw
  draw();
  let last = canvasPrint(ctx, canvas.width, canvas.height);
  for (let i = 0; i < 8; i++) {
    await sleep(i === 0 ? 30 : 80);
    draw();
    const print = canvasPrint(ctx, canvas.width, canvas.height);
    if (print === last) break;
    last = print;
  }
  try {
    // a canvas the browser considers unsafe throws here (old Safari): use html2canvas for the rest of the session
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let first = -1;
    let uniform = true;
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (first < 0) first = v; else if (v !== first) { uniform = false; break; }
    }
    if (uniform) throw new Error('the native drawing came out blank');
  } catch (e) {
    nativeUnavailable = true;
    throw e;
  }
  return canvas;
};

/** One laid-out page → canvas with html2canvas (fallback; approximates some CSS). */
const html2canvasCapture = async (html2canvas: any, pageEl: HTMLElement, o: { width: number; height: number; scale: number; winH: number }) => {
  const doc = pageEl.ownerDocument;
  const canvas = doc.createElement('canvas');
  canvas.width = Math.floor(o.width * o.scale);
  canvas.height = Math.floor(o.height * o.scale);
  await html2canvas(pageEl, {
    canvas,
    scale: o.scale,
    width: o.width,
    height: o.height,
    // html2canvas adds x/y to the element's own position, so they must stay 0
    x: 0,
    y: 0,
    useCORS: true,
    allowTaint: false,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: o.width,
    windowHeight: o.winH,
    scrollX: 0,
    scrollY: 0,
  });
  return canvas as HTMLCanvasElement;
};

/** One laid-out page → canvas, exactly as the PDF draws it (shared with the preview-vs-PDF QA diff). */
const capturePage = async (
  html2canvas: any, pageEl: HTMLElement, o: { width: number; height: number; scale: number; winH: number }, renderer: 'auto' | 'html2canvas' = 'auto',
) => {
  if (renderer === 'auto') {
    try {
      const c = await nativeCapture(pageEl, o);
      (c as any).__renderer = 'native';
      return c;
    } catch (e) {
      lastNativeError = e instanceof Error ? e.message : String(e);
    }
  }
  const c = await html2canvasCapture(html2canvas, pageEl, o);
  (c as any).__renderer = 'html2canvas';
  return c;
};

/** QA: renders a laid-out page of a document (already paginated) the way the PDF does. */
export const renderPageToCanvas = async (pageEl: HTMLElement, scale = 1, renderer: 'auto' | 'html2canvas' = 'auto'): Promise<HTMLCanvasElement> => {
  const { html2canvas } = await loadLibs();
  const root = pageEl.closest('.cd-root') as HTMLElement;
  const width = parseFloat(root?.getAttribute('data-page-width') || '') || pageEl.offsetWidth;
  const height = parseFloat(root?.getAttribute('data-page-height') || '') || pageEl.offsetHeight;
  const winH = Math.ceil((root || pageEl).getBoundingClientRect().height + 40);
  return capturePage(html2canvas, pageEl, { width, height, scale, winH }, renderer);
};

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
      const rect = pageEl.getBoundingClientRect();
      const canvas = await capturePage(html2canvas, pageEl, { width, height, scale, winH }, opts.renderer || 'auto');
      if (i > 0) pdf.addPage(format, 'portrait');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.86), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');

      if (opts.textLayer !== false) {
        try { addTextLayer(pdf, pageEl, doc.defaultView || window, pw / width, ph / height); } catch { /* the image page is still complete */ }
      }

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
