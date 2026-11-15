// Checks translations/<lang>/NN-id.json against the English chapter scripts.
//   node scripts/validate-translations.mjs <lang> [NN ...]       (from docs/work/tutorial-video)
// For every chapter that has a translation file: all keys present, no extra keys, no empty text, sane length ratio,
// balanced quotation marks, no forbidden words. Chapters without a file are only counted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChapters } from '../tts/narrate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const [lang, ...only] = process.argv.slice(2);
if (!lang) { console.log('usage: node scripts/validate-translations.mjs <lang> [NN ...]'); process.exit(1); }
const FORBIDDEN = [/kelviq/i, /merchant of record/i];
const errors = [], warns = [];
let done = 0, missing = 0, sentences = 0;
for (const ch of await loadChapters(only.length ? only.map((x) => x.padStart(2, '0')) : null)) {
  const file = path.join(root, 'translations', lang, `${String(ch.number).padStart(2, '0')}-${ch.id}.json`);
  if (!fs.existsSync(file)) { missing++; continue; }
  let tr;
  try { tr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { errors.push(`${file}: invalid JSON (${e.message})`); continue; }
  done++;
  const want = new Set();
  for (const s of ch.scenes) s.say.forEach((en, i) => {
    const key = `${ch.id}.${s.id}.${i}`; want.add(key); sentences++;
    const t = tr[key];
    if (typeof t !== 'string' || !t.trim()) return errors.push(`${ch.id}: missing ${key}`);
    const ratio = t.length / Math.max(1, en.length);
    if (ratio < 0.5 || ratio > 2.6) warns.push(`${key}: length ratio ${ratio.toFixed(2)}`);
    if ((t.match(/“/g) || []).length !== (t.match(/”/g) || []).length) errors.push(`${key}: unbalanced quotation marks`);
    for (const re of FORBIDDEN) if (re.test(t)) errors.push(`${key}: forbidden word`);
  });
  for (const k of Object.keys(tr)) if (!want.has(k)) errors.push(`${ch.id}: unknown key ${k}`);
}
console.log(`${lang}: ${done} chapter file(s) checked (${sentences} sentences), ${missing} chapter(s) without a file`);
for (const w of warns) console.log('warn  ' + w);
for (const e of errors) console.log('ERROR ' + e);
process.exit(errors.length ? 1 : 0);
