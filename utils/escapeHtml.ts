/**
 * HTML escaping helpers. Every value that comes from a user, a client, a document or the AI
 * MUST pass through `esc()` before it is concatenated into an HTML string (templates, emails, previews).
 *
 * `sanitizeRichText()` is a deterministic, DOM-free allow-list sanitizer: it works the same in the
 * browser, in Node (QA scripts) and in workers. Every tag it outputs is rebuilt from scratch with
 * validated attributes, every other `<` is escaped, and open tags are always balanced, so rich text
 * can never break out of the block it is placed in.
 */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export const esc = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => ENTITIES[ch]);
};

/** Escapes text and keeps line breaks as <br>. */
export const escMultiline = (value: unknown): string => esc(value).replace(/\r?\n/g, '<br>');

/** Decodes the few entities that matter for URL/attribute validation (named basics + numeric). */
const decodeEntities = (value: string): string =>
  value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => safeFromCodePoint(parseInt(dec, 10)))
    .replace(/&(quot|apos|lt|gt|amp|colon|tab|newline);/gi, (_, name: string) => {
      const map: Record<string, string> = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', colon: ':', tab: '\t', newline: '\n' };
      return map[name.toLowerCase()] ?? '';
    });

const safeFromCodePoint = (cp: number): string => {
  try {
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
  } catch {
    return '';
  }
};

/** Only allows http(s), mailto, tel and data:image URLs. Anything else becomes ''. */
export const safeUrl = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const v = value.trim();
  const probe = decodeEntities(v).replace(/[\u0000- \u007f-\u009f]/g, '');
  if (/^(https?:|mailto:|tel:)/i.test(probe)) return esc(v);
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(v)) return v.replace(/["'<>\s]/g, '');
  if (v.startsWith('/') && !v.startsWith('//')) return esc(v);
  return '';
};

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'navy', 'teal', 'orange', 'purple', 'gray', 'grey', 'maroon', 'olive',
  'gold', 'yellow', 'pink', 'brown', 'silver', 'lime', 'aqua', 'fuchsia', 'transparent', 'crimson', 'indigo',
  'darkblue', 'darkgreen', 'darkred', 'slategray', 'slategrey', 'royalblue', 'steelblue', 'tomato', 'coral',
]);

/** Returns a CSS-safe color (hex, rgb[a](), hsl[a]() or a basic named color) or the fallback. */
export const safeColor = (value: unknown, fallback = '#000000'): string => {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
  if (/^(rgb|hsl)a?\(\s*[\d.%\s,/+-]+\)$/i.test(v)) return v;
  if (NAMED_COLORS.has(v.toLowerCase())) return v.toLowerCase();
  return fallback;
};

// ---------------------------------------------------------------------------
// Rich text sanitizer
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'small', 'mark', 'br', 'p', 'ul', 'ol',
  'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'span', 'div', 'a', 'hr', 'table', 'thead',
  'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'img', 'figure', 'figcaption', 'font',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img', 'col']);
/** Tags removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'svg', 'math', 'head',
  'title', 'xmp', 'noembed', 'noframes', 'plaintext', 'frameset', 'frame', 'applet', 'audio', 'video', 'canvas',
]);

const ALLOWED_CSS_PROPS = new Set([
  'color', 'background-color', 'font-size', 'font-weight', 'font-style', 'font-family', 'font-variant', 'text-align',
  'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-transform', 'text-indent', 'line-height',
  'letter-spacing', 'white-space', 'vertical-align', 'list-style-type', 'list-style-position', 'width', 'height',
  'max-width', 'min-width', 'max-height', 'min-height', 'border', 'border-top', 'border-right', 'border-bottom',
  'border-left', 'border-color', 'border-style', 'border-width', 'border-radius', 'border-collapse', 'border-spacing',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'display', 'float', 'clear', 'word-break', 'overflow-wrap', 'table-layout',
  'caption-side',
]);
const SAFE_DISPLAY = new Set(['block', 'inline', 'inline-block', 'table', 'table-row', 'table-cell', 'list-item']);

/** Keeps only presentational declarations; drops url(), expressions, positioning and negative margins. */
export const sanitizeCss = (style: unknown): string => {
  if (typeof style !== 'string') return '';
  const decoded = decodeEntities(style);
  if (/[<>\\]|url\s*\(|expression\s*\(|javascript:|behaviou?r\s*:|-moz-binding|@import|var\s*\(/i.test(decoded)) return '';
  const out: string[] = [];
  for (const decl of decoded.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim().replace(/!important/gi, '').trim();
    if (!value || !ALLOWED_CSS_PROPS.has(prop)) continue;
    if (!/^[#\w\s,.%()'"+\-/]*$/.test(value)) continue;
    if (prop.startsWith('margin') && /-\s*\d/.test(value)) continue;
    if (prop === 'display' && !SAFE_DISPLAY.has(value.toLowerCase())) continue;
    if (prop === 'float' && !/^(left|right|none)$/i.test(value)) continue;
    out.push(`${prop}: ${value.replace(/["]/g, "'")}`);
  }
  return out.join('; ');
};

const FONT_SIZE_MAP: Record<string, string> = { '1': '10px', '2': '12px', '3': '14px', '4': '17px', '5': '21px', '6': '28px', '7': '36px' };

const TAG_RE = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[^>]*>?|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?|\s*\/(?!>))*)\s*(\/?)>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Escapes stray markup characters in text while keeping existing character references. */
const escapeTextSegment = (text: string): string =>
  text
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const isSafeHref = (raw: string): boolean => {
  const probe = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '');
  return /^(https?:|mailto:|tel:)/i.test(probe) || (/^[/#]/.test(probe) && !probe.startsWith('//'));
};

const isSafeImgSrc = (raw: string): boolean => {
  const probe = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '');
  return /^https?:/i.test(probe) || /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(probe) || (probe.startsWith('/') && !probe.startsWith('//'));
};

const buildAttributes = (tag: string, rawAttrs: string): { attrs: string; outTag: string } => {
  const kept: string[] = [];
  const styles: string[] = [];
  let outTag = tag;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(rawAttrs))) {
    const name = m[1].toLowerCase();
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
    if (name.startsWith('on') || name === 'srcset' || name === 'formaction' || name === 'xmlns') continue;
    switch (name) {
      case 'style': {
        const css = sanitizeCss(value);
        if (css) styles.push(css);
        break;
      }
      case 'href':
        if (tag === 'a' && isSafeHref(value)) kept.push(`href="${esc(value.trim())}"`);
        break;
      case 'src':
        if (tag === 'img' && isSafeImgSrc(value)) kept.push(`src="${esc(value.trim())}"`);
        break;
      case 'alt':
      case 'title':
        kept.push(`${name}="${esc(value)}"`);
        break;
      case 'colspan':
      case 'rowspan':
      case 'start':
      case 'span':
        if (/^\d{1,3}$/.test(value.trim())) kept.push(`${name}="${value.trim()}"`);
        break;
      case 'width':
      case 'height':
        if (/^\d{1,4}(\.\d+)?(%|px)?$/.test(value.trim())) kept.push(`${name}="${value.trim()}"`);
        break;
      case 'border':
      case 'cellpadding':
      case 'cellspacing':
        if (tag === 'table' && /^\d{1,2}$/.test(value.trim())) kept.push(`${name}="${value.trim()}"`);
        break;
      case 'align':
        if (/^(left|right|center|justify)$/i.test(value.trim())) styles.push(`text-align: ${value.trim().toLowerCase()}`);
        break;
      case 'type':
        if ((tag === 'ol' || tag === 'ul') && /^(1|a|A|i|I|disc|circle|square)$/.test(value.trim())) kept.push(`type="${value.trim()}"`);
        break;
      case 'color':
        if (tag === 'font') styles.push(`color: ${safeColor(value, 'inherit')}`);
        break;
      case 'size':
        if (tag === 'font' && FONT_SIZE_MAP[value.trim()]) styles.push(`font-size: ${FONT_SIZE_MAP[value.trim()]}`);
        break;
      case 'face':
        if (tag === 'font' && /^[\w\s,'-]{1,80}$/.test(value)) styles.push(`font-family: ${value.replace(/"/g, "'")}`);
        break;
      default:
        break; // class, id, data-*, and everything else are dropped on purpose
    }
  }
  if (tag === 'font') outTag = 'span';
  if (tag === 'a') kept.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
  if (styles.length) kept.push(`style="${esc(styles.join('; '))}"`);
  return { attrs: kept.length ? ' ' + kept.join(' ') : '', outTag };
};

/**
 * Allow-list sanitizer for rich text (editor content, AI summaries, notes, email bodies).
 * - Drops scripts/styles/iframes/svg (with their content), comments, event handlers, class/id attributes,
 *   javascript: and other unsafe URLs, url()/expression() CSS and positioning CSS.
 * - Converts legacy <font> tags into <span style>.
 * - Always returns balanced markup (unclosed tags are closed, stray closing tags are dropped).
 */
export const sanitizeRichText = (html: unknown): string => {
  if (html === null || html === undefined) return '';
  const input = String(html);
  if (!input) return '';
  const out: string[] = [];
  const stack: string[] = [];
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(input))) {
    if (m.index > last) out.push(escapeTextSegment(input.slice(last, m.index)));
    last = TAG_RE.lastIndex;
    const tagName = m[2]?.toLowerCase();
    if (!tagName) continue; // comment, doctype, CDATA, processing instruction
    const isClose = m[1] === '/';
    if (DROP_WITH_CONTENT.has(tagName)) {
      if (isClose) continue;
      const closeRe = new RegExp(`</${tagName}\\s*>`, 'ig');
      closeRe.lastIndex = TAG_RE.lastIndex;
      const close = closeRe.exec(input);
      last = close ? closeRe.lastIndex : input.length;
      TAG_RE.lastIndex = last;
      continue;
    }
    if (!ALLOWED_TAGS.has(tagName)) continue; // unknown tag: drop the tag, keep its text
    const outName = tagName === 'font' ? 'span' : tagName;
    if (isClose) {
      if (VOID_TAGS.has(tagName)) continue;
      const pos = stack.lastIndexOf(outName);
      if (pos === -1) continue;
      while (stack.length > pos) out.push(`</${stack.pop()}>`);
      continue;
    }
    const { attrs, outTag } = buildAttributes(tagName, m[3] || '');
    if (tagName === 'img' && !/\ssrc="/.test(attrs)) continue; // an image without a safe source is useless
    out.push(`<${outTag}${attrs}>`);
    if (!VOID_TAGS.has(tagName)) stack.push(outTag);
  }
  if (last < input.length) out.push(escapeTextSegment(input.slice(last)));
  while (stack.length) out.push(`</${stack.pop()}>`);
  return out.join('');
};

/** Plain text (textarea) or rich HTML → safe HTML. Plain text keeps its line breaks. */
export const textOrRichToHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (!s.trim()) return '';
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?\/?>/i.test(s) ? sanitizeRichText(s) : escMultiline(s);
};
