/**
 * Browser-only helpers for the rich text editor (components/forms/RichTextEditor.tsx).
 *
 * Everything here produces markup both sanitizers keep (`sanitizeEditorHtml` in formUtils.ts and
 * `sanitizeRichText` in utils/escapeHtml.ts used by the PDF templates): plain tags plus inline `style`
 * (text-align, margin-left, list-style-type, padding-left, width). No classes or data-* attributes are needed:
 * a checklist is a `<ul style="list-style-type:none">` whose items start with ☐ / ☑, so it prints as is.
 */

export const CHECK_OFF = '☐';
export const CHECK_ON = '☑';
const CHECK_RE = /^\s*[☐☑]/;
/** Box + non-breaking space (a plain space right after the box is collapsed by the browser while typing). */
const newBox = () => document.createTextNode(`${CHECK_OFF}\u00a0`);

const LEAF_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,div,blockquote,pre';
const ANY_BLOCK = `${LEAF_BLOCKS},ul,ol,table,li`;

export const closestIn = <T extends Element = HTMLElement>(node: Node | null | undefined, selector: string, root: HTMLElement): T | null => {
    const el = node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null;
    const found = el?.closest(selector);
    return found && found !== root && root.contains(found) ? (found as T) : null;
};

// ---------------------------------------------------------------------------
// selection <-> text offsets (used by the undo history)
// ---------------------------------------------------------------------------
export interface TextOffsets { start: number; end: number }

export const getSelectionOffsets = (root: HTMLElement): TextOffsets | null => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    return { start, end: start + range.toString().length };
};

const pointAt = (root: HTMLElement, offset: number): { node: Node; offset: number } => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let last: Node | null = null;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const len = (node.nodeValue || '').length;
        if (remaining <= len) return { node, offset: remaining };
        remaining -= len;
        last = node;
    }
    return last ? { node: last, offset: (last.nodeValue || '').length } : { node: root, offset: root.childNodes.length };
};

export const setSelectionOffsets = (root: HTMLElement, offsets: TextOffsets | null) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    try {
        if (!offsets) throw new Error('end');
        const a = pointAt(root, offsets.start);
        const b = offsets.end === offsets.start ? a : pointAt(root, offsets.end);
        range.setStart(a.node, a.offset);
        range.setEnd(b.node, b.offset);
    } catch {
        range.selectNodeContents(root);
        range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
};

export const placeCaretAtEnd = (el: Node) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
};

// ---------------------------------------------------------------------------
// checklists
// ---------------------------------------------------------------------------
/** First non-blank text of a list item itself (text of a nested item belongs to that item). */
const firstText = (li: Element): Text | null => {
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('li') !== li) return null;
        if ((node.nodeValue || '').trim()) return node as Text;
    }
    return null;
};

export const isChecklistItem = (li: Element): boolean => {
    const t = firstText(li);
    return Boolean(t && CHECK_RE.test(t.nodeValue || ''));
};

export const checklistItemAt = (node: Node | null | undefined, root: HTMLElement): HTMLLIElement | null => {
    const li = closestIn<HTMLLIElement>(node, 'li', root);
    return li && isChecklistItem(li) ? li : null;
};

const isChecklist = (list: Element) => Array.from(list.children).some(c => c.tagName === 'LI' && isChecklistItem(c));

/** Gives every checklist its look (no bullets) and a box to every item of it. */
export const normalizeChecklists = (root: HTMLElement) => {
    root.querySelectorAll('ul').forEach(ul => {
        if (!isChecklist(ul)) {
            // every box was deleted: give the list its bullets back
            if (ul.style.listStyleType === 'none' && ul.style.paddingLeft === '0.25em') {
                ul.style.removeProperty('list-style-type');
                ul.style.removeProperty('padding-left');
                if (!ul.getAttribute('style')) ul.removeAttribute('style');
            }
            return;
        }
        ul.style.listStyleType = 'none';
        ul.style.paddingLeft = '0.25em';
        Array.from(ul.children).forEach(li => {
            if (li.tagName === 'LI' && !isChecklistItem(li)) li.insertBefore(newBox(), li.firstChild);
        });
    });
};

const stripBox = (li: Element) => {
    const t = firstText(li);
    if (t && CHECK_RE.test(t.nodeValue || '')) t.nodeValue = (t.nodeValue || '').replace(/^\s*[☐☑]\s?/, '');
};

/** Checks / unchecks an item. */
export const toggleChecklistItem = (li: Element) => {
    const t = firstText(li);
    if (!t) return;
    t.nodeValue = (t.nodeValue || '').replace(/^(\s*)([☐☑])/, (_m, sp: string, box: string) => `${sp}${box === CHECK_ON ? CHECK_OFF : CHECK_ON}`);
};

/** True when a click at (x, y) hit the box of a checklist item. */
export const hitsCheckbox = (li: Element, x: number, y: number): boolean => {
    const t = firstText(li);
    if (!t) return false;
    const idx = (t.nodeValue || '').search(/[☐☑]/);
    if (idx < 0) return false;
    const range = document.createRange();
    range.setStart(t, idx);
    range.setEnd(t, idx + 1);
    const r = range.getBoundingClientRect();
    return x >= r.left - 8 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6;
};

const TEXT_BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * Chrome builds a list started in an empty <p> *inside* that <p> (invalid HTML that later breaks headings,
 * pagination and the PDF). Moves such lists out, keeping the text before/after in their own paragraphs and the caret.
 */
export const liftListsOutOfParagraphs = (root: HTMLElement) => {
    const nested = Array.from(root.querySelectorAll<HTMLElement>(TEXT_BLOCKS.map(t => `${t} > ul, ${t} > ol`).join(',')));
    if (!nested.length) return;
    const caret = getSelectionOffsets(root);
    const hasContent = (el: Element) => Boolean((el.textContent || '').replace(/\u00a0/g, ' ').trim() || el.querySelector('img,table,hr'));
    for (const list of nested) {
        const block = list.parentElement;
        if (!block || !root.contains(block)) continue;
        const rest = document.createElement(block.tagName.toLowerCase());
        const style = block.getAttribute('style');
        if (style) rest.setAttribute('style', style);
        while (list.nextSibling) rest.appendChild(list.nextSibling);
        block.after(list);
        if (hasContent(rest)) list.after(rest);
        if (!hasContent(block)) block.remove();
    }
    if (caret) setSelectionOffsets(root, caret);
};

const INLINE_STYLED = ['span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'mark', 'sub', 'sup', 'code'].map(t => `${t}[style]`).join(',');
const INHERITABLE = ['color', 'font-size', 'font-family', 'line-height', 'font-weight', 'font-style', 'background-color'];

/**
 * Chrome "preserves" computed styles as <span style="color: rgb(…); font-size: 0.875rem"> (or on <b>, <i>, …) when it
 * merges, converts or pastes blocks. Drops every inline declaration that doesn't change how the element already looks,
 * and unwraps spans left without styles, so the saved HTML only keeps colors/sizes the user actually chose.
 */
export const dropRedundantSpanStyles = (root: HTMLElement) => {
    const spans = Array.from(root.querySelectorAll<HTMLElement>(INLINE_STYLED));
    if (!spans.length) return;
    const caret = getSelectionOffsets(root);
    let changed = false;
    for (const span of spans) {
        const parent = span.parentElement;
        if (!parent || !root.contains(parent)) continue;
        const own = getComputedStyle(span);
        const inherited = getComputedStyle(parent);
        for (const prop of INHERITABLE) {
            if (!span.style.getPropertyValue(prop)) continue;
            const same = prop === 'background-color'
                ? /^(transparent|rgba\(0, 0, 0, 0\))$/.test(own.getPropertyValue(prop))
                : own.getPropertyValue(prop) === inherited.getPropertyValue(prop);
            if (same) { span.style.removeProperty(prop); changed = true; }
        }
        if (!span.getAttribute('style')?.trim()) {
            if (span.tagName === 'SPAN') span.replaceWith(...Array.from(span.childNodes));
            else span.removeAttribute('style');
            changed = true;
        }
    }
    if (changed && caret) setSelectionOffsets(root, caret);
};

/** Turns a checklist back into a plain bulleted list (boxes removed). */
export const clearChecklist = (ul: HTMLElement) => {
    Array.from(ul.children).forEach(stripBox);
    ul.style.removeProperty('list-style-type');
    ul.style.removeProperty('padding-left');
    if (!ul.getAttribute('style')) ul.removeAttribute('style');
};

/** Turns the current paragraph(s) into a checklist, or the current checklist back into paragraphs. */
export const toggleChecklist = (root: HTMLElement) => {
    const sel = window.getSelection();
    const anchor = sel?.anchorNode;
    const item = checklistItemAt(anchor, root);
    if (item) {
        clearChecklist(item.parentElement as HTMLElement);
        document.execCommand('insertUnorderedList');
        return;
    }
    const list = closestIn(anchor, 'ul,ol', root);
    if (!list || list.tagName === 'OL') document.execCommand('insertUnorderedList');
    const ul = closestIn<HTMLUListElement>(window.getSelection()?.anchorNode, 'ul', root);
    if (!ul) return;
    Array.from(ul.children).forEach(li => {
        if (li.tagName === 'LI' && !isChecklistItem(li)) li.insertBefore(newBox(), li.firstChild);
    });
    normalizeChecklists(root);
    // an empty new item: put the caret after its box
    const li = closestIn<HTMLLIElement>(window.getSelection()?.anchorNode, 'li', root);
    if (li && !(li.textContent || '').replace(/[☐☑\s]/g, '')) placeCaretAfterBox(li);
};

export const placeCaretAfterBox = (li: Element) => {
    const t = firstText(li);
    const sel = window.getSelection();
    if (!t || !sel) return;
    const range = document.createRange();
    range.setStart(t, Math.min((t.nodeValue || '').length, (t.nodeValue || '').search(/[☐☑]/) + 2));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
};

/** Text of a checklist item without its box (empty item → ''). */
export const checklistItemText = (li: Element) => (li.textContent || '').replace(/^\s*[☐☑]\s?/, '').trim();

// ---------------------------------------------------------------------------
// indent / outdent outside lists: margin-left on the paragraph (printed by the PDF, unlike <blockquote> hacks)
// ---------------------------------------------------------------------------
const leafBlocksIn = (root: HTMLElement, range: Range): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(LEAF_BLOCKS)).filter(el => range.intersectsNode(el) && !el.querySelector(ANY_BLOCK));

export const changeIndent = (root: HTMLElement, direction: 1 | -1) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    if (closestIn(sel.anchorNode, 'li', root)) {
        document.execCommand(direction > 0 ? 'indent' : 'outdent');
        return;
    }
    let blocks = leafBlocksIn(root, sel.getRangeAt(0));
    if (!blocks.length) {
        document.execCommand('formatBlock', false, 'p');
        const again = window.getSelection();
        blocks = again && again.rangeCount ? leafBlocksIn(root, again.getRangeAt(0)) : [];
    }
    for (const b of blocks) {
        const current = parseFloat(b.style.marginLeft) || 0;
        const next = Math.max(0, Math.min(240, current + direction * 40));
        if (next) b.style.marginLeft = `${next}px`;
        else {
            b.style.removeProperty('margin-left');
            if (!b.getAttribute('style')) b.removeAttribute('style');
        }
    }
};

// ---------------------------------------------------------------------------
// links
// ---------------------------------------------------------------------------
/** Normalizes what the user typed into a safe link (https, mailto or tel) or null. */
export const toSafeLink = (raw: string): string | null => {
    let url = (raw || '').trim();
    if (!url) return null;
    if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(url)) url = `mailto:${url}`;
    else if (/^\+?[\d\s().-]{7,}$/.test(url)) url = `tel:${url.replace(/[^\d+]/g, '')}`;
    else if (!/^(https?:|mailto:|tel:)/i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
    return /^(https?:\/\/[^\s<>"]+\.[^\s<>"]+|https?:\/\/localhost[^\s<>"]*|mailto:[^\s<>"]+@[^\s<>"]+|tel:\+?\d{3,})$/i.test(url) ? url : null;
};

/** Opens a document link in a new tab without giving the page access to this app. */
export const openLinkSafely = (href: string | null | undefined): boolean => {
    const url = toSafeLink(href || '');
    if (!url) return false;
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
    return true;
};

export const unwrapElement = (el: Element) => el.replaceWith(...Array.from(el.childNodes));

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------
export const tableAddRow = (table: HTMLTableElement) => {
    const rows = table.rows;
    const last = rows[rows.length - 1];
    if (!last) return;
    const row = document.createElement('tr');
    Array.from(last.cells).forEach(cell => {
        const td = document.createElement('td');
        const style = cell.getAttribute('style');
        if (style) td.setAttribute('style', style.replace(/font-weight\s*:\s*bold;?/i, ''));
        if (cell.colSpan > 1) td.colSpan = cell.colSpan;
        td.appendChild(document.createElement('br'));
        row.appendChild(td);
    });
    (last.parentElement || table).appendChild(row);
};

export const tableAddColumn = (table: HTMLTableElement) => {
    Array.from(table.rows).forEach(row => {
        const ref = row.cells[row.cells.length - 1];
        const cell = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td');
        const style = ref?.getAttribute('style');
        if (style) cell.setAttribute('style', style);
        cell.appendChild(document.createElement('br'));
        row.appendChild(cell);
    });
};

export const tableDeleteRow = (table: HTMLTableElement, cell: Element | null) => {
    const row = cell?.closest('tr');
    if (!row || !table.contains(row) || table.rows.length <= 1) return false;
    row.remove();
    return true;
};

// ---------------------------------------------------------------------------
// text stats
// ---------------------------------------------------------------------------
const STAT_BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,td,th,div,blockquote,pre';

export const textStats = (root: HTMLElement) => {
    // words in different paragraphs / list items / cells, or around a <br>, never run together
    const parts: string[] = [];
    let lastBlock: Element | null = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if ((node as Element).tagName === 'BR') parts.push(' ');
            continue;
        }
        const block = node.parentElement?.closest(STAT_BLOCKS) || null;
        if (block !== lastBlock) parts.push(' ');
        lastBlock = block;
        parts.push(node.nodeValue || '');
    }
    const text = parts.join('').replace(/[☐☑]/g, ' ').replace(/\u00a0/g, ' ');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return { words, chars: text.replace(/\s+/g, ' ').trim().length };
};
