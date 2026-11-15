// Narration for every scene of every chapter, one language per run. Cached (re-running only does what is missing).
//
//   node tts/narrate.mjs <lang> [--chapters 01,03] [--voice elevenlabs_xxx] [--speed 1.0] [--concurrency 3] [--dry] [--mock]
//
//   <lang>   en es fr de it pt zh ja ko ru   (en = the scripts in chapters/, others = translations/<lang>.json)
//   --dry    list the work and the number of characters (cost), call nothing
//   --mock   NO AI33 call: silent placeholder audio with a realistic length (for testing the rest of the pipeline)
//
// Output per scene: cache/audio/<lang>/<chapter>/<scene>.mp3 (loudness-normalised) + <scene>.json
//   { duration, sentences: [{ start, end }], text, voice, mock }
// The AI33 key is read from AI33_API_KEY or docs/work/tutorial-video/.env.local by tts/ai33.mjs and is never printed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { speak, credits } from './ai33.mjs';
import { CACHE } from '../config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
export const DEFAULT_VOICE = 'elevenlabs_TZCbdntnleSl53jkcRsm'; // "Mark - The Podcaster" (best in Framitor's measured audition)

const args = process.argv.slice(2);
const lang = args[0];
const flag = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

export async function loadChapters(only) {
  const dir = path.join(root, 'chapters');
  const files = fs.readdirSync(dir).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    if (only && !only.includes(f.slice(0, 2))) continue;
    out.push((await import(pathToFileURL(path.join(dir, f)).href)).default);
  }
  return out;
}
/** translations/<lang>/NN-id.json files merged (key "<chapter>.<scene>.<sentence>" -> text); {} for English / missing. */
export function loadTranslations(language) {
  const out = {};
  if (language === 'en') return out;
  const dir = path.join(root, 'translations', language);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) Object.assign(out, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  return out;
}
export function sentencesOf(chapter, scene, language, translations) {
  if (language === 'en') return scene.say;
  return scene.say.map((_, i) => translations[`${chapter.id}.${scene.id}.${i}`]);
}
const words = (s) => (String(s).match(/\S+/g) || []).length;
const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr.slice(0, 300)}`); return r.stdout; };
const probe = (file) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]));

function parseSrt(text) {
  const cues = [];
  const t = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(String(ms).padEnd(3, '0')) / 1000;
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const m = block.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\s*\n([\s\S]*)/);
    if (m) cues.push({ start: t(m[1], m[2], m[3], m[4]), end: t(m[5], m[6], m[7], m[8]), text: m[9].replace(/\s+/g, ' ').trim() });
  }
  return cues;
}
/** Sentence start/end times inside one narration file: proportional to characters, snapped to the SRT cue ends. */
export function alignSentences(sentences, cues, duration) {
  const weight = sentences.map((s) => Math.max(1, String(s).replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = weight.reduce((a, b) => a + b, 0);
  const s0 = cues.length ? cues[0].start : 0, s1 = cues.length ? cues[cues.length - 1].end : duration;
  let acc = 0;
  const bounds = [0];
  for (let i = 0; i < sentences.length - 1; i++) {
    acc += weight[i];
    let t = s0 + (acc / total) * (s1 - s0);
    const near = cues.map((c) => c.end).filter((e) => Math.abs(e - t) < 0.5).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
    if (near !== undefined) t = near;
    bounds.push(Math.max(bounds[bounds.length - 1] + 0.2, t));
  }
  bounds.push(duration);
  return sentences.map((_, i) => ({ start: +bounds[i].toFixed(3), end: +bounds[i + 1].toFixed(3) }));
}

async function narrateScene({ lang, chapter, scene, sentences, voice, speed, mock }) {
  const dir = path.join(CACHE, 'audio', lang, chapter.id);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, scene.id);
  const text = sentences.join(' ');
  const hash = crypto.createHash('sha1').update([lang, mock ? 'mock' : voice, speed, text].join('|')).digest('hex');
  try { const m = JSON.parse(fs.readFileSync(base + '.json', 'utf8')); if (m.hash === hash || (mock && !m.mock && m.text === text)) return m; /* a mock run never overwrites real narration of the same text */ } catch { /* not cached */ }
  let duration, cues = [];
  const file = base + (mock ? '.wav' : '.mp3');
  if (mock) {
    duration = +(sentences.reduce((a, s) => a + words(s) / 2.5 + 0.35, 0) + 0.4).toFixed(2); // ~150 wpm + pauses
    run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `anullsrc=r=24000:cl=mono`, '-t', String(duration), file]);
  } else {
    const { mp3, srt } = await speak(text, voice, { speed, fileName: `${chapter.id}-${scene.id}.mp3` });
    const raw = base + '.raw.mp3';
    fs.writeFileSync(raw, mp3);
    run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=7', '-ar', '44100', '-ac', '1', '-b:a', '96k', file]);
    fs.rmSync(raw, { force: true });
    duration = +probe(file).toFixed(3);
    if (srt) cues = parseSrt(srt); // no transcript -> proportional timing
  }
  const meta = { hash, lang, chapter: chapter.id, scene: scene.id, voice: mock ? null : voice, mock: !!mock, text, duration, sentences: alignSentences(sentences, cues, duration), file: path.basename(file) };
  fs.writeFileSync(base + '.json', JSON.stringify(meta, null, 1));
  return meta;
}

async function main() {
  if (!lang || lang.startsWith('--')) { console.log('usage: node tts/narrate.mjs <lang> [--chapters 01,03] [--voice id] [--speed 1.0] [--concurrency 3] [--dry] [--mock]'); process.exit(1); }
  const only = flag('chapters', '') ? String(flag('chapters')).split(',').map((x) => x.padStart(2, '0')) : null;
  const voice = String(flag('voice', process.env.TUTORIAL_VOICE || DEFAULT_VOICE));
  const speed = Number(flag('speed', 1.0));
  const mock = !!flag('mock', false), dry = !!flag('dry', false);
  const conc = Math.max(1, Number(flag('concurrency', 3)));
  const translations = loadTranslations(lang);
  if (lang !== 'en' && !Object.keys(translations).length) { console.error(`No translations for "${lang}" yet (translations/${lang}/NN-id.json).`); process.exit(1); }
  const chapters = await loadChapters(only);
  const jobs = [];
  for (const chapter of chapters) for (const scene of chapter.scenes) {
    const sentences = sentencesOf(chapter, scene, lang, translations);
    if (sentences.some((s) => typeof s !== 'string' || !s.trim())) { console.log(`skip ${chapter.id}.${scene.id}: missing ${lang} translation`); continue; }
    jobs.push({ lang, chapter, scene, sentences, voice, speed, mock });
  }
  const chars = jobs.reduce((a, j) => a + j.sentences.join(' ').length, 0);
  console.log(`${lang}: ${jobs.length} scenes, ${chars} characters${mock ? ' (mock: no AI33 calls)' : ''}`);
  if (dry) return;
  if (!mock) { try { const c = await credits(); console.log('AI33 credits:', JSON.stringify(c).slice(0, 120)); } catch (e) { console.error(e.message); process.exit(1); } }
  let next = 0, done = 0, failed = 0;
  await Promise.all(Array.from({ length: conc }, async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      try { const m = await narrateScene(j); done++; console.log(`  ${String(done + failed).padStart(3)}/${jobs.length} ${j.chapter.id}.${j.scene.id} ${m.duration.toFixed(1)}s`); }
      catch (e) { failed++; console.error(`  FAILED ${j.chapter.id}.${j.scene.id}: ${e.message}`); }
    }
  }));
  console.log(`done ${done}, failed ${failed}`);
  if (failed) process.exit(2);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
