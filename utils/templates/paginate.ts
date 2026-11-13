/**
 * Splits a rendered document (render.ts output, laid out in a real browser document) into fixed-size pages.
 *
 * - `.cd-block` elements are kept whole unless they declare `data-split`:
 *     rows      → table rows are distributed over pages, the header row is repeated on every page;
 *     children  → rich content (`.cd-split`) is split between paragraphs/list items/rows, and long
 *                 paragraphs are split between words (Range based, inline formatting preserved).
 * - Section titles and rich-text headings are never left alone at the bottom of a page.
 * - The totals block pulls the last table rows with it instead of landing alone on a new page.
 * - Blocks marked data-optional="1" (decorative bands) are dropped instead of opening a new page.
 * - Continuation pages are clones of the first page's shell (chrome + footer + running header).
 * - Footers get "Page X of N" when there is more than one page.
 *
 * Pure DOM code without imports, so it can run in the PDF iframe, a preview iframe or a QA browser.
 */
export interface PaginateResult { pages: HTMLElement[] }

const BLOCK_TAGS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'SECTION']);

export function paginateDocument(doc: Document, opts: { pageHeight?: number } = {}): PaginateResult {
  const win = doc.defaultView || window;
  const root = doc.querySelector('.cd-root') as HTMLElement | null;
  const firstPage = root ? (root.querySelector('.cd-page') as HTMLElement | null) : null;
  const firstBody = firstPage ? (firstPage.querySelector('.cd-body') as HTMLElement | null) : null;
  if (!root || !firstPage || !firstBody) return { pages: [] };
  if (root.classList.contains('cd-paged')) return { pages: Array.from(root.querySelectorAll('.cd-page')) as HTMLElement[] };

  const pageH = opts.pageHeight || parseFloat(root.getAttribute('data-page-height') || '') || 1056;
  root.classList.add('cd-paged');

  const blocks = (Array.from(firstBody.children) as HTMLElement[]).filter((el) => el.classList.contains('cd-block'));
  blocks.forEach((b) => b.remove());
  const shell = firstPage.cloneNode(true) as HTMLElement;
  shell.classList.remove('cd-first', 'cd-last');
  shell.classList.add('cd-cont');
  firstPage.classList.remove('cd-last');

  const pages: HTMLElement[] = [firstPage];
  let page: HTMLElement = firstPage;
  let body: HTMLElement = firstBody;

  const css = (el: Element) => win.getComputedStyle(el);
  const px = (v: string | null) => parseFloat(v || '0') || 0;
  const limit = () => page.getBoundingClientRect().top + pageH - px(css(body).paddingBottom);
  const contentTop = () => {
    const runhead = body.querySelector(':scope > .cd-runhead') as HTMLElement | null;
    if (runhead && css(runhead).display !== 'none') {
      return runhead.getBoundingClientRect().bottom + px(css(runhead).marginBottom);
    }
    return body.getBoundingClientRect().top + px(css(body).paddingTop);
  };
  const fullHeight = () => limit() - contentTop();
  const bottomOf = (el: Element) => el.getBoundingClientRect().bottom + Math.min(0, px(css(el).marginBottom));
  const fits = (el: Element) => bottomOf(el) <= limit() + 0.5;
  const blocksOnPage = () => (Array.from(body.children) as HTMLElement[]).filter((c) => c.classList.contains('cd-block'));
  const newPage = () => {
    const p = shell.cloneNode(true) as HTMLElement;
    root.appendChild(p);
    pages.push(p);
    page = p;
    body = p.querySelector('.cd-body') as HTMLElement;
  };
  const moveToNewPage = (block: HTMLElement) => {
    block.remove();
    newPage();
    body.appendChild(block);
  };

  // --- table rows -----------------------------------------------------------
  const continuationTable = (block: HTMLElement, table: HTMLTableElement) => {
    const next = block.cloneNode(false) as HTMLElement;
    next.setAttribute('data-cont', '1');
    const t = table.cloneNode(false) as HTMLTableElement;
    const colgroup = table.querySelector('colgroup');
    if (colgroup) t.appendChild(colgroup.cloneNode(true));
    if (table.tHead) t.appendChild(table.tHead.cloneNode(true));
    const tb = doc.createElement('tbody');
    t.appendChild(tb);
    next.appendChild(t);
    return { next, table: t, tbody: tb };
  };

  const splitRows = (startBlock: HTMLElement) => {
    let block = startBlock;
    let table = block.querySelector('table') as HTMLTableElement | null;
    if (!table || !table.tBodies[0]) {
      if (blocksOnPage().length > 1) moveToNewPage(block);
      return;
    }
    let tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    rows.forEach((r) => r.remove());
    let i = 0;
    while (i < rows.length) {
      tbody.appendChild(rows[i]);
      if (fits(block)) { i++; continue; }
      tbody.removeChild(rows[i]);
      if (tbody.rows.length === 0) {
        if (blocksOnPage().length > 1) { moveToNewPage(block); continue; }
        tbody.appendChild(rows[i]); // a single row taller than a page: keep it rather than loop forever
        i++;
        if (i >= rows.length) break;
      }
      const c = continuationTable(block, table);
      newPage();
      body.appendChild(c.next);
      block = c.next;
      table = c.table;
      tbody = c.tbody;
    }
  };

  // --- rich content -----------------------------------------------------------
  const isInlineOnly = (el: Element) => !Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName));

  /** Wrap loose text/inline nodes into line divs (split at <br>) so they can be distributed over pages. */
  const normalizeFlow = (flow: HTMLElement) => {
    const nodes = Array.from(flow.childNodes);
    let group: Node[] = [];
    const out: Node[] = [];
    const flush = (force = false) => {
      const meaningful = group.some((n) => n.nodeType !== 3 || (n.textContent || '').trim());
      if (meaningful || force) {
        const div = doc.createElement('div');
        div.className = 'cd-line';
        if (meaningful) group.forEach((n) => div.appendChild(n)); else div.innerHTML = '&nbsp;';
        out.push(div);
      }
      group = [];
    };
    for (const n of nodes) {
      if (n.nodeType === 1 && (n as Element).tagName === 'BR') {
        const blank = !group.some((g) => g.nodeType !== 3 || (g.textContent || '').trim());
        flush(blank);
        continue;
      }
      if (n.nodeType === 1 && (BLOCK_TAGS.has((n as Element).tagName) || (n as Element).tagName === 'IMG')) {
        flush();
        out.push(n);
        continue;
      }
      if (n.nodeType === 3 || n.nodeType === 1) group.push(n);
    }
    flush();
    while (flow.firstChild) flow.removeChild(flow.firstChild);
    out.forEach((n) => flow.appendChild(n));
  };

  /** Split an inline-only element between words; leaves the head in place and returns the tail. */
  const splitWords = (el: HTMLElement): HTMLElement | null => {
    const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    const positions: Array<{ node: Text; offset: number }> = [];
    let t: Node | null;
    while ((t = walker.nextNode())) {
      const text = t.textContent || '';
      for (let k = 1; k < text.length; k++) if (/\s/.test(text[k]) && !/\s/.test(text[k - 1])) positions.push({ node: t as Text, offset: k });
    }
    if (!positions.length) return null;
    // safety margin: line boxes, list markers and collapsing margins are a few px taller than the text rects
    const lim = limit() - 12;
    const range = doc.createRange();
    range.setStart(el, 0);
    const bottomAt = (idx: number) => {
      range.setEnd(positions[idx].node, positions[idx].offset);
      const rects = Array.from(range.getClientRects());
      return rects.length ? Math.max(...rects.map((r) => r.bottom)) : 0;
    };
    let lo = 0;
    let hi = positions.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bottomAt(mid) <= lim) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (best < 0) return null;
    const tail = doc.createRange();
    tail.setStart(positions[best].node, positions[best].offset);
    tail.setEnd(el, el.childNodes.length);
    const frag = tail.extractContents();
    const rest = el.cloneNode(false) as HTMLElement;
    rest.appendChild(frag);
    if (rest.firstChild && rest.firstChild.nodeType === 3) rest.firstChild.textContent = (rest.firstChild.textContent || '').replace(/^\s+/, '');
    rest.setAttribute('data-cont', '1');
    return rest;
  };

  /** Split a list/table/container unit by its children; head stays (appended to `flow`), tail returned. */
  const splitContainer = (unit: HTMLElement, flow: HTMLElement, chunk: HTMLElement): HTMLElement | null => {
    const tag = unit.tagName;
    if (tag === 'TABLE') {
      const tb = (unit as HTMLTableElement).tBodies[0];
      if (!tb || tb.rows.length < 2) return null;
      const rows = Array.from(tb.rows);
      const head = unit.cloneNode(false) as HTMLTableElement;
      if ((unit as HTMLTableElement).tHead) head.appendChild((unit as HTMLTableElement).tHead!.cloneNode(true));
      const hb = doc.createElement('tbody');
      head.appendChild(hb);
      flow.appendChild(head);
      let n = 0;
      for (const r of rows) {
        hb.appendChild(r);
        if (!fits(chunk)) { hb.removeChild(r); break; }
        n++;
      }
      if (n === 0) { head.remove(); rows.forEach((r) => tb.appendChild(r)); return null; }
      const tail = unit.cloneNode(false) as HTMLTableElement;
      if ((unit as HTMLTableElement).tHead) tail.appendChild((unit as HTMLTableElement).tHead!.cloneNode(true));
      const tbb = doc.createElement('tbody');
      rows.slice(n).forEach((r) => tbb.appendChild(r));
      tail.appendChild(tbb);
      return tail;
    }
    const kids = Array.from(unit.children) as HTMLElement[];
    if (kids.length < 1) return null;
    const head = unit.cloneNode(false) as HTMLElement;
    flow.appendChild(head);
    let n = 0;
    let tailFirst: HTMLElement | null = null;
    for (const k of kids) {
      head.appendChild(k);
      if (fits(chunk)) { n++; continue; }
      head.removeChild(k);
      if (isInlineOnly(k)) {
        head.appendChild(k);
        const rest = splitWords(k);
        if (rest) { n++; tailFirst = rest; } else head.removeChild(k);
      }
      break;
    }
    if (n === 0) { head.remove(); kids.forEach((k) => unit.appendChild(k)); return null; }
    const tail = unit.cloneNode(false) as HTMLElement;
    if (tailFirst) tail.appendChild(tailFirst);
    kids.slice(n).forEach((k) => { if (k.parentNode !== head) tail.appendChild(k); });
    if (tag === 'OL') {
      const start = parseInt(unit.getAttribute('start') || '1', 10) || 1;
      const moved = Array.from(head.children).filter((c) => c.tagName === 'LI').length - (tailFirst ? 1 : 0);
      tail.setAttribute('start', String(start + Math.max(0, moved)));
    }
    if (tag === 'UL' || tag === 'OL') tail.setAttribute('data-cont', '1');
    return tail.childNodes.length ? tail : null;
  };

  const constrainImages = (unit: HTMLElement) => {
    const max = Math.max(120, fullHeight() - 24);
    const imgs = unit.tagName === 'IMG' ? [unit] : (Array.from(unit.querySelectorAll('img')) as HTMLElement[]);
    imgs.forEach((img) => { img.style.maxHeight = `${max}px`; img.style.width = 'auto'; img.style.height = 'auto'; img.style.maxWidth = '100%'; });
  };

  const splitChildren = (startBlock: HTMLElement) => {
    let chunk = startBlock;
    let flow = chunk.querySelector('.cd-split') as HTMLElement | null;
    if (!flow) {
      if (blocksOnPage().length > 1) moveToNewPage(chunk);
      return;
    }
    normalizeFlow(flow);
    const units = Array.from(flow.children) as HTMLElement[];
    units.forEach((u) => u.remove());
    let placed = 0;
    let idx = 0;
    let guard = 0;
    while (idx < units.length && guard++ < 5000) {
      const u = units[idx];
      flow.appendChild(u);
      if (fits(chunk)) { placed++; idx++; continue; }
      flow.removeChild(u);
      let tail: HTMLElement | null = null;
      if (isInlineOnly(u) && u.tagName !== 'IMG') {
        flow.appendChild(u);
        tail = splitWords(u);
        if (!tail) flow.removeChild(u);
      } else if (['UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'DIV', 'SECTION', 'FIGURE'].includes(u.tagName)) {
        tail = splitContainer(u, flow, chunk);
      }
      if (tail) {
        placed++;
        units[idx] = tail;
      } else if (placed === 0) {
        if (blocksOnPage().length > 1) { moveToNewPage(chunk); continue; }
        constrainImages(u);
        flow.appendChild(u);
        placed++;
        idx++;
        continue;
      }
      // keep a heading with the content that follows it
      const last = flow.lastElementChild as HTMLElement | null;
      if (last && /^H[1-6]$/.test(last.tagName) && flow.children.length > 1) {
        last.remove();
        units.splice(idx, 0, last);
      }
      const next = chunk.cloneNode(false) as HTMLElement;
      next.setAttribute('data-cont', '1');
      const nf = flow.cloneNode(false) as HTMLElement;
      next.appendChild(nf);
      newPage();
      body.appendChild(next);
      chunk = next;
      flow = nf;
      placed = 0;
    }
  };

  // --- keep the totals with the end of the items table ------------------------------
  const pullRowsWith = (block: HTMLElement): boolean => {
    const prev = block.previousElementSibling as HTMLElement | null;
    if (!prev || !prev.classList.contains('cd-items')) return false;
    const table = prev.querySelector('table') as HTMLTableElement | null;
    const tb = table?.tBodies[0];
    if (!table || !tb || tb.rows.length < 4) return false;
    const moving = [tb.rows[tb.rows.length - 2], tb.rows[tb.rows.length - 1]];
    moving.forEach((r) => r.remove());
    block.remove();
    const c = continuationTable(prev, table);
    moving.forEach((r) => c.tbody.appendChild(r));
    newPage();
    body.appendChild(c.next);
    body.appendChild(block);
    return true;
  };

  // --- main loop ----------------------------------------------------------------
  for (const block of blocks) {
    body.appendChild(block);
    if (fits(block)) continue;
    // purely decorative blocks never open a new page on their own
    if (block.getAttribute('data-optional') === '1') { block.remove(); continue; }
    const split = block.getAttribute('data-split');
    if (split === 'rows') { splitRows(block); continue; }
    if (split === 'children') { splitChildren(block); continue; }
    if (blocksOnPage().length > 1) {
      if (!(block.classList.contains('cd-summary') && pullRowsWith(block))) moveToNewPage(block);
    }
    if (!fits(block)) constrainImages(block);
  }

  const n = pages.length;
  pages.forEach((p, i) => {
    p.classList.toggle('cd-first', i === 0);
    p.classList.toggle('cd-cont', i > 0);
    p.classList.toggle('cd-last', i === n - 1);
    const no = p.querySelector('.cd-pageno');
    if (no) no.textContent = n > 1 ? `Page ${i + 1} of ${n}` : '';
  });
  return { pages };
}
