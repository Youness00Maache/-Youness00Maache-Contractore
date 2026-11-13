// RFC 5322 / 2045 / 2047 / 2231 message builder for Gmail sending.
// Output is pure 7-bit ASCII with CRLF line endings: every non-ASCII header is an RFC 2047
// encoded-word, every body part and attachment is base64 (wrapped at 76 chars).
// Header injection: recipients must be plain addresses (CR/LF rejected), every other header value
// has control characters removed, so user/AI input can never start a new header line.
// Pure Web APIs only: runs in Deno (edge runtime) and Node (scripts/comms-mime-check.ts).

import { bytesToBase64, randomHex, te, utf8ToBase64 } from './encoding.ts';

export const MIME_LIMITS = {
  maxRecipients: 50,
  maxSubjectChars: 900,
  maxBodyChars: 2_000_000,
  maxAttachments: 10,
  /** decoded bytes, all attachments together (Gmail's hard limit is 25 MB for the whole message) */
  maxAttachmentBytes: 18 * 1024 * 1024,
  maxFilenameChars: 60,
} as const;

export class MimeError extends Error {
  code: string;
  constructor(message: string, code = 'INVALID_MESSAGE') {
    super(message);
    this.name = 'MimeError';
    this.code = code;
  }
}

export interface MimeAddress {
  email: string;
  name?: string | null;
}

export interface MimeAttachmentInput {
  filename: string;
  mimeType?: string | null;
  /** Base64 (optionally a `data:<type>;base64,` URI). */
  contentBase64: string;
}

export interface MimeMessageInput {
  from: MimeAddress;
  to: string | string[];
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
  replyTo?: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: MimeAttachmentInput[] | null;
  date?: Date;
  /** Test hook for deterministic boundaries. */
  boundary?: (index: number) => string;
}

export interface BuiltMimeMessage {
  raw: string;
  recipients: string[];
  attachmentBytes: number;
}

const CRLF = '\r\n';
// Local part: RFC 5322 atext + dots. Domain: LDH labels. ASCII only on purpose.
export const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
// deno-lint-ignore no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
// deno-lint-ignore no-control-regex
const LINE_BREAKS = /[\r\n\u0000]/;
const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

/** Removes CR, LF, TAB and every other control char, collapses whitespace. */
export const cleanHeaderText = (value: unknown): string =>
  String(value ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();

export const isValidEmail = (email: string): boolean => email.length <= 254 && EMAIL_RE.test(email);

/** Parses "a@x.com, b@y.com; c@z.com" (or an array) into validated, de-duplicated addresses. */
export function parseAddressList(input: string | string[] | null | undefined, field = 'To'): string[] {
  if (input === null || input === undefined) return [];
  const parts = Array.isArray(input) ? input : [input];
  const out: string[] = [];
  for (const part of parts) {
    const s = String(part ?? '');
    if (LINE_BREAKS.test(s)) throw new MimeError(`${field} contains a line break. Enter plain email addresses only.`, 'INVALID_RECIPIENT');
    for (const raw of s.split(/[,;\s]+/)) {
      let addr = raw.trim();
      if (!addr) continue;
      // Accept "<a@b.com>" but not display names (the UI only sends bare addresses).
      if (addr.startsWith('<') && addr.endsWith('>')) addr = addr.slice(1, -1);
      if (!isValidEmail(addr)) throw new MimeError(`${field} has an invalid email address: ${cleanHeaderText(addr).slice(0, 80)}`, 'INVALID_RECIPIENT');
      if (!out.some((a) => a.toLowerCase() === addr.toLowerCase())) out.push(addr);
    }
  }
  return out;
}

/** Splits text into chunks of at most `maxBytes` UTF-8 bytes without cutting a character. */
function utf8Chunks(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of text) {
    const n = te.encode(ch).length;
    if (currentBytes + n > maxBytes && current) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += n;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * RFC 2047: ASCII text is returned unchanged; anything else becomes `=?UTF-8?B?...?=` words
 * (each at most 75 chars) separated by folding whitespace.
 */
export function encodeHeaderWords(value: string): string {
  const clean = cleanHeaderText(value);
  if (ASCII_PRINTABLE.test(clean) && !/=\?/.test(clean)) return clean;
  // 45 bytes -> 60 base64 chars -> 72-char encoded word.
  return utf8Chunks(clean, 45)
    .map((chunk) => `=?UTF-8?B?${utf8ToBase64(chunk)}?=`)
    .join(`${CRLF} `);
}

/** `"Name" <email>` / `=?UTF-8?B?...?= <email>` / `email`. */
export function formatMailbox(addr: MimeAddress): string {
  const email = String(addr.email || '').trim();
  if (LINE_BREAKS.test(email) || !isValidEmail(email)) throw new MimeError('The sender address is invalid.', 'INVALID_SENDER');
  const name = cleanHeaderText(addr.name).slice(0, 100);
  if (!name) return email;
  if (ASCII_PRINTABLE.test(name) && !/=\?/.test(name)) {
    return `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <${email}>`;
  }
  return `${encodeHeaderWords(name)} <${email}>`;
}

/** Folds an address list so no header line gets longer than ~78 chars. */
function foldAddressHeader(name: string, addresses: string[]): string {
  let line = `${name}: `;
  const lines: string[] = [];
  addresses.forEach((addr, i) => {
    const piece = addr + (i < addresses.length - 1 ? ',' : '');
    if (line.length + piece.length > 76 && line.trim() !== `${name}:`) {
      lines.push(line.trimEnd());
      line = ' ';
    }
    line += piece + ' ';
  });
  lines.push(line.trimEnd());
  return lines.join(CRLF);
}

const wrap76 = (b64: string): string => {
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
  return out.join(CRLF);
};

const normalizeNewlines = (s: string): string => s.replace(/\r\n|\r|\n/g, CRLF);

/** RFC 5322 date, e.g. "Thu, 12 Nov 2026 22:19:46 +0000". */
export const formatDate = (d: Date): string => d.toUTCString().replace(/GMT$/, '+0000');

/** Plain-text fallback for an HTML body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style|head)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr|table|blockquote)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** RFC 5987 attr-char percent-encoding (stricter than encodeURIComponent). */
const encodeRfc5987 = (s: string): string =>
  encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function sanitizeFilename(input: string): { utf8: string; ascii: string } {
  let name = cleanHeaderText(input).replace(/[\\/]/g, '-').replace(/^\.+/, '');
  if (!name) name = 'attachment';
  const chars = Array.from(name);
  if (chars.length > MIME_LIMITS.maxFilenameChars) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : '';
    name = Array.from(name.slice(0, name.length - ext.length)).slice(0, MIME_LIMITS.maxFilenameChars - ext.length).join('') + ext;
  }
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return { utf8: name, ascii };
}

const MIME_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

function normalizeAttachment(a: MimeAttachmentInput, index: number) {
  const { utf8, ascii } = sanitizeFilename(a?.filename || `attachment-${index + 1}`);
  let content = String(a?.contentBase64 ?? '');
  const dataUri = /^data:([^;,]*)(;[^,]*)?,/i.exec(content.slice(0, 200));
  let mimeType = String(a?.mimeType || '').trim().toLowerCase();
  if (dataUri) {
    if (!/;base64/i.test(dataUri[2] || '')) throw new MimeError(`Attachment "${utf8}" must be base64 encoded.`, 'INVALID_ATTACHMENT');
    if (!mimeType && dataUri[1]) mimeType = dataUri[1].toLowerCase();
    content = content.slice(dataUri[0].length);
  }
  content = content.replace(/\s+/g, '');
  if (!content || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
    throw new MimeError(`Attachment "${utf8}" is not valid base64 data.`, 'INVALID_ATTACHMENT');
  }
  if (!MIME_TYPE_RE.test(mimeType)) mimeType = /\.pdf$/i.test(utf8) ? 'application/pdf' : 'application/octet-stream';
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
  const bytes = (content.length / 4) * 3 - padding;
  return { utf8, ascii, mimeType, content, bytes };
}

const defaultBoundary = () => `=_cd_${randomHex(12)}`;

function textPart(type: 'plain' | 'html', content: string): string {
  return [
    `Content-Type: text/${type}; charset="UTF-8"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8ToBase64(normalizeNewlines(content))),
  ].join(CRLF);
}

function wrapHtmlDocument(html: string): string {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
}

export function buildMimeMessage(input: MimeMessageInput): BuiltMimeMessage {
  const to = parseAddressList(input.to, 'To');
  const cc = parseAddressList(input.cc, 'Cc');
  const bcc = parseAddressList(input.bcc, 'Bcc');
  const replyTo = parseAddressList(input.replyTo, 'Reply-To').slice(0, 1);
  const recipients = [...to, ...cc, ...bcc];
  if (to.length === 0) throw new MimeError('Add at least one recipient.', 'INVALID_RECIPIENT');
  if (recipients.length > MIME_LIMITS.maxRecipients) throw new MimeError(`Too many recipients (max ${MIME_LIMITS.maxRecipients}).`, 'INVALID_RECIPIENT');

  const subject = cleanHeaderText(input.subject);
  if (!subject) throw new MimeError('Add a subject.', 'INVALID_SUBJECT');
  if (subject.length > MIME_LIMITS.maxSubjectChars) throw new MimeError(`The subject is too long (max ${MIME_LIMITS.maxSubjectChars} characters).`, 'INVALID_SUBJECT');

  const html = input.html ? String(input.html) : '';
  let text = input.text ? String(input.text) : '';
  if (!text && html) text = htmlToText(html);
  if (!text && !html) throw new MimeError('The message is empty.', 'INVALID_BODY');
  if (text.length > MIME_LIMITS.maxBodyChars || html.length > MIME_LIMITS.maxBodyChars) {
    throw new MimeError('The message body is too long.', 'INVALID_BODY');
  }

  const rawAttachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (rawAttachments.length > MIME_LIMITS.maxAttachments) {
    throw new MimeError(`Too many attachments (max ${MIME_LIMITS.maxAttachments}).`, 'INVALID_ATTACHMENT');
  }
  const attachments = rawAttachments.map(normalizeAttachment);
  const attachmentBytes = attachments.reduce((n, a) => n + a.bytes, 0);
  if (attachmentBytes > MIME_LIMITS.maxAttachmentBytes) {
    throw new MimeError(`Attachments are too large (${(attachmentBytes / 1048576).toFixed(1)} MB). Gmail allows about ${Math.floor(MIME_LIMITS.maxAttachmentBytes / 1048576)} MB per email.`, 'ATTACHMENTS_TOO_LARGE');
  }

  const boundary = input.boundary ?? defaultBoundary;
  const headers: string[] = [
    `From: ${formatMailbox(input.from)}`,
    foldAddressHeader('To', to),
  ];
  if (cc.length) headers.push(foldAddressHeader('Cc', cc));
  if (bcc.length) headers.push(foldAddressHeader('Bcc', bcc));
  if (replyTo.length) headers.push(`Reply-To: ${replyTo[0]}`);
  headers.push(`Subject: ${encodeHeaderWords(subject)}`);
  headers.push(`Date: ${formatDate(input.date ?? new Date())}`);
  headers.push('MIME-Version: 1.0');

  // Body: text only, or multipart/alternative (text + html).
  let bodyEntity: string;
  if (html) {
    const alt = boundary(1);
    bodyEntity = [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      '',
      `--${alt}`,
      textPart('plain', text),
      `--${alt}`,
      textPart('html', wrapHtmlDocument(html)),
      `--${alt}--`,
    ].join(CRLF);
  } else {
    bodyEntity = textPart('plain', text);
  }

  let raw: string;
  if (attachments.length) {
    const mixed = boundary(0);
    const parts: string[] = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      '',
      'This is a multi-part message in MIME format.',
      `--${mixed}`,
      bodyEntity,
    ];
    for (const a of attachments) {
      const needsExtended = a.ascii !== a.utf8;
      const disposition = needsExtended
        ? `Content-Disposition: attachment;${CRLF} filename="${a.ascii}";${CRLF} filename*=UTF-8''${encodeRfc5987(a.utf8)}`
        : `Content-Disposition: attachment; filename="${a.ascii}"`;
      parts.push(
        `--${mixed}`,
        `Content-Type: ${a.mimeType}; name="${a.ascii}"`,
        disposition,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(a.content),
      );
    }
    parts.push(`--${mixed}--`, '');
    raw = parts.join(CRLF);
  } else {
    raw = [...headers, bodyEntity, ''].join(CRLF);
  }

  return { raw, recipients, attachmentBytes };
}

/** Base64url of the whole message, for the Gmail JSON `raw` field (small messages). */
export const toGmailRaw = (raw: string): string =>
  bytesToBase64(te.encode(raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
