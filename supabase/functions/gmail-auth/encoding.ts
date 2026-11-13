// Byte / base64 helpers shared by mime.ts and crypto.ts.
// Pure Web APIs only (TextEncoder, btoa/atob) so the same file runs in Deno (edge runtime) and Node (tests).

export const te = new TextEncoder();
export const td = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    bin += String.fromCharCode.apply(null, Array.from(slice));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const utf8ToBase64 = (s: string): string => bytesToBase64(te.encode(s));

export const toBase64Url = (b64: string): string => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const fromBase64Url = (s: string): string => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return p + '='.repeat((4 - (p.length % 4)) % 4);
};

export const bytesToBase64Url = (bytes: Uint8Array): string => toBase64Url(bytesToBase64(bytes));
export const base64UrlToBytes = (s: string): Uint8Array<ArrayBuffer> => base64ToBytes(fromBase64Url(s));

export function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
