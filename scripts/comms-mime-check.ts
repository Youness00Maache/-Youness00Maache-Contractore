/**
 * Checks for the gmail-auth MIME builder and token crypto (pure logic, no network).
 * Run: npx tsx scripts/comms-mime-check.ts
 */
import {
  buildMimeMessage,
  encodeHeaderWords,
  htmlToText,
  MimeError,
  parseAddressList,
  sanitizeFilename,
} from '../supabase/functions/gmail-auth/mime.ts';
import { decryptString, encryptString, importKeys, signState, verifyState } from '../supabase/functions/gmail-auth/crypto.ts';
import { base64ToBytes, bytesToBase64, td, te } from '../supabase/functions/gmail-auth/encoding.ts';

let failures = 0;
let passes = 0;
const ok = (cond: unknown, label: string) => {
  if (cond) passes++;
  else {
    failures++;
    console.error(`FAIL  ${label}`);
  }
};
const throwsCode = (fn: () => unknown, code: string, label: string) => {
  try {
    fn();
    ok(false, `${label} (did not throw)`);
  } catch (e) {
    ok(e instanceof MimeError && e.code === code, `${label} (got ${(e as Error).name}:${(e as MimeError).code ?? ''} ${(e as Error).message})`);
  }
};

const decodeWords = (header: string) =>
  header
    .replace(/\r\n /g, '')
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_, b64) => `\u0000${td.decode(base64ToBytes(b64))}\u0000`)
    .replace(/\u0000\s*\u0000/g, '')
    .replace(/\u0000/g, '');

const headerBlock = (raw: string) => raw.split('\r\n\r\n')[0];
/** Unfolds headers into `Name: value` strings. */
const headerLines = (raw: string) => headerBlock(raw).replace(/\r\n[ \t]/g, ' ').split('\r\n');
const getHeader = (raw: string, name: string) =>
  headerBlock(raw)
    .split(/\r\n(?![ \t])/)
    .find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`));

const wireSafe = (raw: string) => {
  // eslint-disable-next-line no-control-regex
  const asciiOnly = /^[\x00-\x7f]*$/.test(raw);
  const noBareLf = !/[^\r]\n/.test(raw) && !/\r(?!\n)/.test(raw);
  const shortLines = raw.split('\r\n').every((l) => l.length <= 998);
  return asciiOnly && noBareLf && shortLines;
};

const FIXED_DATE = new Date(Date.UTC(2026, 10, 12, 22, 19, 46));
const boundaries = (i: number) => (i === 0 ? '=_cd_mixed' : '=_cd_alt');

/* ---------------------------------------------------------------- 1. UTF-8 subject */
{
  const subject = 'Facture n° 42 — Café Müller ✓ 😀 ' + 'é'.repeat(60);
  const { raw } = buildMimeMessage({
    from: { email: 'owner@gmail.com', name: 'Société Générale & Fils' },
    to: 'client@example.com',
    subject,
    text: 'Bonjour,\nvoici la facture.\n',
    date: FIXED_DATE,
    boundary: boundaries,
  });
  ok(wireSafe(raw), 'utf8 subject: message is 7-bit ASCII with CRLF and short lines');
  const subj = getHeader(raw, 'Subject')!;
  ok(/=\?UTF-8\?B\?/.test(subj), 'utf8 subject: uses RFC 2047 encoded words');
  ok(decodeWords(subj.replace(/^Subject: /, '')) === subject, 'utf8 subject: decodes back to the original text');
  ok(subj.split('\r\n').every((l) => l.length <= 78 + 10), 'utf8 subject: folded into short lines');
  ok(subj.match(/=\?UTF-8\?B\?[^?]+\?=/g)!.every((w) => w.length <= 75), 'utf8 subject: every encoded word <= 75 chars');
  const from = getHeader(raw, 'From')!;
  ok(/<owner@gmail\.com>$/.test(from) && decodeWords(from.replace(/^From: /, '').replace(/ <owner@gmail\.com>$/, '')) === 'Société Générale & Fils', 'utf8 from name: encoded display name');
  ok(getHeader(raw, 'Date') === 'Date: Thu, 12 Nov 2026 22:19:46 +0000', 'date header is RFC 5322');
  ok(getHeader(raw, 'MIME-Version') === 'MIME-Version: 1.0', 'MIME-Version header present');
  ok(encodeHeaderWords('Plain ASCII subject') === 'Plain ASCII subject', 'ascii subject stays readable');
  ok(/=\?UTF-8\?B\?/.test(encodeHeaderWords('looks like =?utf-8?q?word?=')), 'ascii text containing "=?" is encoded');
  const body = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
  ok(td.decode(base64ToBytes(body.replace(/\r\n/g, ''))) === 'Bonjour,\r\nvoici la facture.\r\n', 'text body: base64 UTF-8 with CRLF line endings');
}

/* ---------------------------------------------------------------- 2. attachment */
{
  const pdfBytes = te.encode('%PDF-1.4\n' + 'x'.repeat(5000) + '\n%%EOF');
  const pdfB64 = bytesToBase64(pdfBytes);
  const { raw, attachmentBytes } = buildMimeMessage({
    from: { email: 'owner@gmail.com', name: 'Acme "Pro" Builders' },
    to: ['a@example.com', 'b@example.org'],
    cc: 'c@example.net',
    subject: 'Estimate 1042',
    text: 'See attached.',
    html: '<p>See <b>attached</b>.</p>',
    attachments: [
      { filename: 'Devis été 2026 – Müller.pdf', mimeType: 'application/pdf', contentBase64: `data:application/pdf;base64,${pdfB64}` },
      { filename: 'plain-name.pdf', contentBase64: pdfB64 },
    ],
    date: FIXED_DATE,
    boundary: boundaries,
  });
  ok(wireSafe(raw), 'attachment: message is wire safe');
  ok(attachmentBytes === pdfBytes.length * 2, 'attachment: decoded size computed');
  ok(/^Content-Type: multipart\/mixed; boundary="=_cd_mixed"$/m.test(raw), 'attachment: multipart/mixed');
  ok(/^Content-Type: multipart\/alternative; boundary="=_cd_alt"$/m.test(raw), 'attachment: text+html as multipart/alternative');
  ok(getHeader(raw, 'From') === 'From: "Acme \\"Pro\\" Builders" <owner@gmail.com>', 'ascii display name quoted and escaped');
  ok(getHeader(raw, 'To') === 'To: a@example.com, b@example.org', 'to header lists both recipients');
  ok(getHeader(raw, 'Cc') === 'Cc: c@example.net', 'cc header');
  const parts = raw.split('--=_cd_mixed');
  ok(parts.length === 5 && parts[4].startsWith('--'), 'attachment: 1 body + 2 attachments + closing boundary');
  const att = parts[2];
  ok(/Content-Type: application\/pdf; name="Devis _t_ 2026 _ M_ller\.pdf"/.test(att), 'attachment: ASCII fallback name');
  ok(/filename\*=UTF-8''Devis%20%C3%A9t%C3%A9%202026%20%E2%80%93%20M%C3%BCller\.pdf/.test(att), 'attachment: RFC 2231 UTF-8 filename');
  ok(/Content-Transfer-Encoding: base64/.test(att), 'attachment: base64 transfer encoding');
  const attBody = att.split('\r\n\r\n')[1].trim();
  ok(attBody.split('\r\n').every((l) => l.length <= 76), 'attachment: base64 wrapped at 76 chars');
  ok(td.decode(base64ToBytes(attBody.replace(/\r\n/g, ''))) === td.decode(pdfBytes), 'attachment: content round-trips');
  ok(/Content-Disposition: attachment; filename="plain-name\.pdf"/.test(parts[3]) && /application\/pdf/.test(parts[3]), 'plain filename: no extended param, pdf type inferred');
  const htmlPart = parts[1].split('--=_cd_alt')[2];
  const htmlDecoded = td.decode(base64ToBytes(htmlPart.split('\r\n\r\n')[1].replace(/\r\n/g, '')));
  ok(htmlDecoded.includes('<p>See <b>attached</b>.</p>') && htmlDecoded.startsWith('<!DOCTYPE html>'), 'html part: wrapped in a document, UTF-8 base64');
}

/* ---------------------------------------------------------------- 3. header injection */
{
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'victim@example.com\r\nBcc: attacker@evil.com', subject: 'x', text: 'x' }),
    'INVALID_RECIPIENT',
    'injection: CRLF in To is rejected',
  );
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'victim@example.com\nBcc: attacker@evil.com', subject: 'x', text: 'x' }),
    'INVALID_RECIPIENT',
    'injection: bare LF in To is rejected',
  );
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: ['ok@example.com', 'Bcc: attacker@evil.com'], subject: 'x', text: 'x' }),
    'INVALID_RECIPIENT',
    'injection: header-looking recipient is rejected',
  );
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@example.com', cc: 'x@y.com\r\nX-Evil: 1', subject: 'x', text: 'x' }),
    'INVALID_RECIPIENT',
    'injection: CRLF in Cc is rejected',
  );
  const { raw } = buildMimeMessage({
    from: { email: 'o@gmail.com', name: 'Evil\r\nBcc: attacker@evil.com' },
    to: 'victim@example.com',
    subject: 'Invoice\r\nBcc: attacker@evil.com\r\n\r\n<script>alert(1)</script>',
    text: 'Hello',
    attachments: [{ filename: 'a"b\r\nContent-Type: text/html\r\n.pdf', contentBase64: bytesToBase64(te.encode('pdf')) }],
    date: FIXED_DATE,
    boundary: boundaries,
  });
  const lines = headerLines(raw);
  ok(!lines.some((l) => /^bcc:/i.test(l)), 'injection: no Bcc header created from subject/from name');
  ok(lines.filter((l) => /^subject:/i.test(l)).length === 1, 'injection: exactly one Subject header');
  ok(getHeader(raw, 'Subject') === 'Subject: Invoice Bcc: attacker@evil.com <script>alert(1)</script>', 'injection: subject line breaks collapsed to spaces');
  ok(getHeader(raw, 'From') === 'From: "Evil Bcc: attacker@evil.com" <o@gmail.com>', 'injection: from name sanitized');
  ok(!/^Content-Type: text\/html$/m.test(raw), 'injection: filename cannot add a Content-Type header');
  ok(/filename="a_b Content-Type: text-html .pdf"/.test(raw), 'injection: filename quotes/newlines neutralised');
  ok(wireSafe(raw), 'injection: output still wire safe');
  throwsCode(() => buildMimeMessage({ from: { email: 'o@gmail.com\r\nBcc: x@y.com' }, to: 'a@example.com', subject: 'x', text: 'x' }), 'INVALID_SENDER', 'injection: CRLF in sender rejected');
}

/* ---------------------------------------------------------------- 4. validation */
{
  ok(JSON.stringify(parseAddressList('a@x.com; b@y.com, A@x.com  c@z.io')) === JSON.stringify(['a@x.com', 'b@y.com', 'c@z.io']), 'address list: split + dedupe (case-insensitive)');
  ok(parseAddressList('<a@x.com>')[0] === 'a@x.com', 'address list: angle brackets accepted');
  throwsCode(() => parseAddressList('not-an-email'), 'INVALID_RECIPIENT', 'address list: invalid address rejected');
  throwsCode(() => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: '', subject: 'x', text: 'x' }), 'INVALID_RECIPIENT', 'no recipient rejected');
  throwsCode(() => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@x.com', subject: '  ', text: 'x' }), 'INVALID_SUBJECT', 'empty subject rejected');
  throwsCode(() => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@x.com', subject: 's' }), 'INVALID_BODY', 'empty body rejected');
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@x.com', subject: 's', text: 't', attachments: [{ filename: 'x.pdf', contentBase64: 'not base64!!' }] }),
    'INVALID_ATTACHMENT',
    'invalid base64 attachment rejected',
  );
  const big = 'A'.repeat(19 * 1024 * 1024 * 4 / 3 - ((19 * 1024 * 1024 * 4 / 3) % 4));
  throwsCode(
    () => buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@x.com', subject: 's', text: 't', attachments: [{ filename: 'big.pdf', contentBase64: big }] }),
    'ATTACHMENTS_TOO_LARGE',
    'oversized attachments rejected',
  );
  const long = sanitizeFilename('Ä'.repeat(200) + '.pdf');
  ok(Array.from(long.utf8).length <= 60 && long.utf8.endsWith('.pdf'), 'long filenames truncated, extension kept');
  ok(htmlToText('<p>Hi &amp; welcome</p><ul><li>One</li></ul><script>x()</script>') === 'Hi & welcome\n• One', 'html to text fallback');
  const htmlOnly = buildMimeMessage({ from: { email: 'o@gmail.com' }, to: 'a@x.com', subject: 's', html: '<p>Hello</p>', date: FIXED_DATE, boundary: boundaries }).raw;
  ok(/multipart\/alternative/.test(htmlOnly) && /text\/plain/.test(htmlOnly), 'html-only message gets a text/plain alternative');
}

/* ---------------------------------------------------------------- 5. crypto + state */
async function cryptoChecks() {
  const keyB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const keys = await importKeys(keyB64);
  const blob = await encryptString(keys, '1//refresh-token-éè');
  ok(blob.startsWith('v1.') && !blob.includes('refresh'), 'encrypt: v1 blob, no plaintext');
  ok((await decryptString(keys, blob)) === '1//refresh-token-éè', 'decrypt: round trip');
  ok(blob !== (await encryptString(keys, '1//refresh-token-éè')), 'encrypt: random IV per message');
  const otherKeys = await importKeys(bytesToBase64(crypto.getRandomValues(new Uint8Array(32))));
  let wrongKeyFailed = false;
  try { await decryptString(otherKeys, blob); } catch { wrongKeyFailed = true; }
  ok(wrongKeyFailed, 'decrypt: wrong key fails (GCM auth)');
  const urlSafeKeys = await importKeys(keyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  ok((await decryptString(urlSafeKeys, blob)) === '1//refresh-token-éè', 'key: base64url form accepted');

  const state = await signState(keys, { u: 'user-1', r: 'http://localhost:3010/gmail-callback', t: '/communication', e: Date.now() + 60_000 });
  ok((await verifyState(keys, state, 'user-1'))?.t === '/communication', 'state: valid for the same user');
  ok((await verifyState(keys, state, 'user-2')) === null, 'state: rejected for another user (CSRF)');
  ok((await verifyState(keys, state, 'user-1', Date.now() + 120_000)) === null, 'state: rejected after expiry');
  const [p, s] = state.split('.');
  const tampered = `${Buffer.from(JSON.stringify({ u: 'user-1', r: 'https://evil.example/cb', t: '/', n: 'x', e: Date.now() + 60_000 })).toString('base64url')}.${s}`;
  ok((await verifyState(keys, tampered, 'user-1')) === null, 'state: tampered payload rejected');
  ok((await verifyState(keys, `${p}.AAAA`, 'user-1')) === null, 'state: bad signature rejected');
  ok((await verifyState(otherKeys, state, 'user-1')) === null, 'state: other key rejected');
  ok((await verifyState(keys, 'garbage', 'user-1')) === null && (await verifyState(keys, null, 'user-1')) === null, 'state: garbage rejected');
}

cryptoChecks()
  .catch((e) => {
    failures++;
    console.error('FAIL  crypto checks threw', e);
  })
  .finally(() => {
    console.log(`${passes} passed, ${failures} failed`);
    if (failures) process.exit(1);
  });
