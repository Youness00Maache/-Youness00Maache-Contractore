// Checks every chapter script against STORYBOARD_FORMAT.md and CHAPTERS.md.
//   node scripts/validate-chapters.mjs            (from docs/work/tutorial-video)
// Exit code 1 on any error. Warnings (word count off target) do not fail.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const chaptersDir = path.join(root, 'chapters');
const helpFile = path.join(root, '..', '..', '..', 'components', 'help', 'helpContent.ts');

const ACTS = {
  goto: ['route'], click: ['target'], type: ['target', 'text'], select: ['target', 'option'], hover: ['target'], scroll: [],
  key: ['key'], wait: ['s'], highlight: ['target'], zoom: [], caption: ['text'], state: ['note'],
};
const FORBIDDEN = [/kelviq/i, /merchant of record/i];
const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);
const words = (s) => (String(s).trim().match(/\S+/g) || []).length;

const helpIds = fs.existsSync(helpFile)
  ? [...fs.readFileSync(helpFile, 'utf8').matchAll(/^ {4}id: '([a-z-]+)',/gm)].map((m) => m[1])
  : [];
const covered = new Map();
let totalWords = 0, totalMinutes = 0, scenes = 0, chapters = 0;

const files = fs.existsSync(chaptersDir) ? fs.readdirSync(chaptersDir).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort() : [];
for (const file of files) {
  let ch;
  try { ch = (await import(pathToFileURL(path.join(chaptersDir, file)).href)).default; } catch (e) { err(file, 'cannot load: ' + e.message); continue; }
  chapters++;
  const m = file.match(/^(\d\d)-(.+)\.mjs$/);
  if (!ch || typeof ch !== 'object') { err(file, 'no default export'); continue; }
  if (ch.id !== m[2]) err(file, `id "${ch.id}" must equal the file name part "${m[2]}"`);
  if (ch.number !== Number(m[1])) err(file, `number ${ch.number} must equal ${Number(m[1])}`);
  for (const k of ['title', 'summary']) if (typeof ch[k] !== 'string' || !ch[k].trim()) err(file, `missing ${k}`);
  if (typeof ch.minutes !== 'number') err(file, 'minutes must be a number');
  if (!Array.isArray(ch.covers)) err(file, 'covers must be an array of help guide ids'); else for (const c of ch.covers) {
    if (helpIds.length && !helpIds.includes(c)) warn(file, `covers "${c}" is not a help guide id (fine only for features without a guide)`);
    if (covered.has(c) && covered.get(c) !== file) err(file, `"${c}" is already covered by ${covered.get(c)}`); else covered.set(c, file);
  }
  if (!Array.isArray(ch.scenes) || !ch.scenes.length) { err(file, 'no scenes'); continue; }
  const ids = new Set();
  let chWords = 0;
  ch.scenes.forEach((s, si) => {
    scenes++;
    const where = `${file} scene ${s && s.id || si}`;
    if (!s.id || ids.has(s.id)) err(where, 'scene id missing or duplicated'); ids.add(s.id);
    if (!['app', 'motion'].includes(s.kind)) err(where, 'kind must be "app" or "motion"');
    if (s.device && !['desktop', 'phone'].includes(s.device)) err(where, 'device must be desktop or phone');
    if (si === 0 && s.kind === 'app' && !s.route) err(where, 'first scene of a chapter needs a route');
    if (s.kind === 'motion' && !(typeof s.visual === 'string' && s.visual.length > 30)) err(where, 'motion scene needs a "visual" description');
    if (!Array.isArray(s.say) || !s.say.length) { err(where, 'say must be a non-empty array of sentences'); return; }
    s.say.forEach((t, i) => {
      if (typeof t !== 'string') return err(where, `say[${i}] is not a string`);
      const w = words(t); chWords += w;
      if (w < 3 || w > 32) warn(where, `say[${i}] has ${w} words (aim 8-24): "${t.slice(0, 50)}"`);
      for (const re of FORBIDDEN) if (re.test(t)) err(where, `say[${i}] contains a forbidden word`);
    });
    for (const [ai, a] of (s.do || []).entries()) {
      const aw = `${where} do[${ai}]`;
      if (!ACTS[a.act]) { err(aw, `unknown act "${a.act}"`); continue; }
      for (const need of ACTS[a.act]) if (a[need] === undefined || a[need] === '') err(aw, `${a.act} needs "${need}"`);
      if (a.act === 'scroll' && a.by === undefined && !a.to) err(aw, 'scroll needs "by" or "to"');
      if (a.act === 'zoom' && !a.target && !a.out) err(aw, 'zoom needs "target" or "out: true"');
      if (typeof a.with !== 'number' || a.with < 0 || a.with >= s.say.length) err(aw, `"with" must be a sentence index 0..${s.say.length - 1}`);
      if (s.kind === 'motion' && !['caption', 'wait', 'state'].includes(a.act)) warn(aw, 'motion scenes normally only use caption/wait/state');
    }
    const blob = JSON.stringify(s);
    for (const re of FORBIDDEN) if (re.test(blob)) err(where, 'forbidden word somewhere in the scene');
  });
  totalWords += chWords; totalMinutes += ch.minutes || 0;
  const target = (ch.minutes || 0) * 150;
  if (target && (chWords < target * 0.8 || chWords > target * 1.2)) warn(file, `${chWords} words for ${ch.minutes} min (target about ${target})`);
}

const missing = helpIds.filter((id) => !covered.has(id));
if (files.length && missing.length) warn('coverage', `help guides not covered yet: ${missing.join(', ')}`);
console.log(`${chapters} chapters, ${scenes} scenes, ${totalWords} words (~${(totalWords / 150).toFixed(1)} min spoken), target ${totalMinutes} min`);
for (const w of warns) console.log('warn  ' + w);
for (const e of errors) console.log('ERROR ' + e);
process.exit(errors.length ? 1 : 0);
