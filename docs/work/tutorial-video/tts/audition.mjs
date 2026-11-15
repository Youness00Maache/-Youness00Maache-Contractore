// Voice audition: the same paragraph with several voices, measured (pace + word error rate through whisper).
//   node tts/audition.mjs <lang> <chapter-scene e.g. jobs.s02> <voiceId> [<voiceId> ...]
// Samples are written to <work dir>/audition/<lang>/ so a person can still listen before release.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { speak } from './ai33.mjs';
import { loadChapters, loadTranslations } from './narrate.mjs';
import { WORK } from '../config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const [lang, ref, ...voices] = process.argv.slice(2);
if (!lang || !ref || !voices.length) { console.log('usage: node tts/audition.mjs <lang> <chapterId.sceneId> <voiceId> [...]'); process.exit(1); }
const [chapterId, sceneId] = ref.split('.');
const chapter = (await loadChapters(null)).find((c) => c.id === chapterId);
const scene = chapter?.scenes.find((s) => s.id === sceneId);
if (!scene) throw new Error('unknown scene ' + ref);
const tr = loadTranslations(lang);
const text = scene.say.map((s, i) => (lang === 'en' ? s : tr[`${chapterId}.${sceneId}.${i}`])).join(' ');
const dir = path.join(WORK, 'audition', lang);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'text.txt'), text);
const wordsN = (text.match(/\S+/g) || []).length;
for (const voice of voices) {
  const out = path.join(dir, voice.replace(/[^A-Za-z0-9_-]/g, '_') + '.mp3');
  try {
    if (!fs.existsSync(out)) fs.writeFileSync(out, (await speak(text, voice, { speed: 1.0, fileName: 'audition.mp3' })).mp3);
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', out], { encoding: 'utf8' }).stdout);
    const w = spawnSync('python', ['-I', path.join(here, 'wer.py'), out, lang, path.join(dir, 'text.txt')], { encoding: 'utf8' });
    let m = {}; try { m = JSON.parse(w.stdout.trim().split('\n').pop()); } catch { m = { wer: '?', heard: (w.stderr || '').slice(-120) }; }
    console.log(`${voice} | ${dur.toFixed(1)}s | ${(wordsN / (dur / 60)).toFixed(0)} wpm | WER ${m.wer}`);
  } catch (e) { console.log(`${voice} | ERROR ${e.message}`); }
}
console.log('samples in', dir);
