// Builds the publishable media folder from the final recordings:
//   node build/assemble.mjs [--only 01,02,...] [--work <dir>]
//
// Reads  <work>/out/chapters/NN-id/{video.mp4, <lang>.m4a, chapter.json}  (from `record/run.mjs ... --langs en,es`)
//        <work>/cache/audio/<lang>/<chapter>/<scene>.json                  (sentence times of each spoken language)
//        translations/<lang>/NN-id.json and _titles.json                    (captions + chapter titles)
// Writes <work>/publish/v1/
//        manifest.json                 chapters (titles in every language, duration, files, a small poster as a data URI)
//        ch/NN-id/video.mp4, <lang>.m4a
//        subtitles/<lang>.json         { chapterId: [[start, end, text], ...] } for every language that has a translation
// Upload this folder (keeping the structure) into the public Supabase bucket `tutorial-media`, folder `v1`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORK } from '../config.mjs';
import { loadChapters, loadTranslations, sentencesOf } from '../tts/narrate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const work = opt('work', process.env.TUTORIAL_WORK_DIR || WORK);
const only = opt('only', '') ? String(opt('only')).split(',').map((x) => x.padStart(2, '0')) : null;
const outDir = path.join(work, 'publish', 'v1');
const ALL = ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ru'];
const subLangs = ALL.filter((l) => l === 'en' || fs.existsSync(path.join(root, 'translations', l)));

const run = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8' }); if (r.status !== 0) throw new Error(`${cmd}: ${String(r.stderr).slice(0, 300)}`); return r.stdout; };
const probe = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f]));
const meta = (L, chapterId, sceneId) => { try { return JSON.parse(fs.readFileSync(path.join(work, 'cache', 'audio', L, chapterId, sceneId + '.json'), 'utf8')); } catch { return null; } };
const titles = {};
for (const L of subLangs) { const f = path.join(root, 'translations', L, '_titles.json'); titles[L] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; }

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'subtitles'), { recursive: true });
const chapters = [];
const bundles = Object.fromEntries(subLangs.map((l) => [l, {}]));
const trs = Object.fromEntries(subLangs.map((l) => [l, loadTranslations(l)]));

for (const ch of await loadChapters(only)) {
  const slug = `${String(ch.number).padStart(2, '0')}-${ch.id}`;
  const src = path.join(work, 'out', 'chapters', slug);
  const info = (() => { try { return JSON.parse(fs.readFileSync(path.join(src, 'chapter.json'), 'utf8')); } catch { return null; } })();
  if (!info || !fs.existsSync(path.join(src, 'video.mp4'))) { console.log(`skip ${slug}: not recorded yet`); continue; }
  const dest = path.join(outDir, 'ch', slug);
  fs.mkdirSync(dest, { recursive: true });
  fs.copyFileSync(path.join(src, 'video.mp4'), path.join(dest, 'video.mp4'));
  const duration = +probe(path.join(src, 'video.mp4')).toFixed(2);
  const audio = {};
  for (const L of info.langs || [info.lang]) if (fs.existsSync(path.join(src, `${L}.m4a`))) { fs.copyFileSync(path.join(src, `${L}.m4a`), path.join(dest, `${L}.m4a`)); audio[L] = `ch/${slug}/${L}.m4a`; }
  // captions: a spoken language uses its own sentence times, the others reuse the English windows
  for (const L of subLangs) {
    const cues = [];
    for (const [i, scene] of ch.scenes.entries()) {
      const st = info.scenes[i].start + (info.scenes[i].lead || 0);
      const texts = sentencesOf(ch, scene, L, trs[L]);
      const own = meta(L, ch.id, scene.id);
      const windows = (own || meta('en', ch.id, scene.id))?.sentences;
      const tp = own ? (info.scenes[i].tempo?.[L] || 1) : 1; // a voice that was sped up to fit has its captions sped up too
      if (!windows || texts.some((t) => typeof t !== 'string' || !t)) continue; // not translated yet: no captions for this scene
      const offs = info.scenes[i].offsets || [];
      texts.forEach((t, k) => cues.push([+(st + windows[k].start / tp + (offs[k] || 0)).toFixed(2), +(st + windows[k].end / tp + (offs[k] || 0)).toFixed(2), t]));
    }
    if (cues.length) bundles[L][ch.id] = cues;
  }
  // poster: a small JPEG as a data URI
  const posterFile = path.join(dest, 'poster.jpg');
  run('ffmpeg', ['-y', '-v', 'error', '-ss', String(Math.min(3, duration * 0.1)), '-i', path.join(src, 'video.mp4'), '-frames:v', '1', '-vf', 'scale=480:-1', '-q:v', '8', posterFile]);
  const poster = 'data:image/jpeg;base64,' + fs.readFileSync(posterFile).toString('base64');
  fs.rmSync(posterFile);
  const title = { en: ch.title }, summary = { en: ch.summary };
  for (const L of subLangs) { if (titles[L][`${ch.id}.title`]) title[L] = titles[L][`${ch.id}.title`]; if (titles[L][`${ch.id}.summary`]) summary[L] = titles[L][`${ch.id}.summary`]; }
  chapters.push({ id: ch.id, number: ch.number, title, summary, duration, video: `ch/${slug}/video.mp4`, poster, audio, guides: ch.covers || [] });
  console.log(`ok   ${slug}  ${duration}s  voices: ${Object.keys(audio).join(',') || 'none'}`);
}
const subtitles = {};
for (const L of subLangs) if (Object.keys(bundles[L]).length) { fs.writeFileSync(path.join(outDir, 'subtitles', `${L}.json`), JSON.stringify(bundles[L])); subtitles[L] = `subtitles/${L}.json`; }
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ version: 1, chapters, subtitles }));
const bytes = (d) => { let n = 0; for (const f of fs.readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? bytes(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size; return n; };
console.log(`\n${chapters.length} chapter(s), captions in: ${Object.keys(subtitles).join(', ')}; ${(bytes(outDir) / 1e6).toFixed(1)} MB -> ${outDir}`);
