// A simple page to WATCH the finished chapters (English voice + Spanish voice, with captions), for review by a person.
//   node scripts/make-watch-page.mjs <output folder> [--work <dir>]
// Scans <work>/out/chapters/*/ for finished recordings (video.mp4 + <lang>.m4a + <lang>.vtt), muxes one MP4 per voice language,
// copies them into <output folder>/watch/ and writes <output folder>/watch.html.
// Serve the folder with:  node scripts/serve-media.mjs <output folder> 3999   ->  http://127.0.0.1:3999/watch.html
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WORK } from '../config.mjs';
import { loadChapters } from '../tts/narrate.mjs';

const args = process.argv.slice(2);
const outRoot = path.resolve(args[0] || '.');
const work = args.includes('--work') ? args[args.indexOf('--work') + 1] : (process.env.TUTORIAL_WORK_DIR || WORK);
const dest = path.join(outRoot, 'watch');
fs.mkdirSync(dest, { recursive: true });
const NAMES = { en: 'English voice', es: 'Voz en español' };
const run = (a) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr.slice(0, 300)); };
const mins = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const sections = [];
let total = 0;
for (const ch of await loadChapters(null)) {
  const slug = `${String(ch.number).padStart(2, '0')}-${ch.id}`;
  const src = path.join(work, 'out', 'chapters', slug);
  const info = (() => { try { return JSON.parse(fs.readFileSync(path.join(src, 'chapter.json'), 'utf8')); } catch { return null; } })();
  if (!info || !info.sync || !fs.existsSync(path.join(src, 'video.mp4')) || !(info.langs || []).includes('en') || !fs.existsSync(path.join(src, 'en.m4a'))) continue;
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path.join(src, 'video.mp4')], { encoding: 'utf8' }).stdout);
  total += dur;
  const versions = [];
  for (const L of ['en', 'es']) {
    const audio = path.join(src, `${L}.m4a`);
    if (!fs.existsSync(audio)) continue;
    const out = path.join(dest, `${slug}.${L}.mp4`);
    if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(path.join(src, 'video.mp4')).mtimeMs) run(['-i', path.join(src, 'video.mp4'), '-i', audio, '-c:v', 'copy', '-c:a', 'copy', '-shortest', out]);
    const vtt = path.join(src, `${L}.vtt`);
    if (fs.existsSync(vtt)) fs.copyFileSync(vtt, path.join(dest, `${slug}.${L}.vtt`));
    versions.push({ L, file: `watch/${slug}.${L}.mp4`, vtt: fs.existsSync(vtt) ? `watch/${slug}.${L}.vtt` : null });
  }
  sections.push({ slug, ch, dur, versions, open: info.unresolved?.length || 0 });
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ContractorDocs video tutorial: finished chapters</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; background:#0b1220; color:#e6ebf5; font-family: Inter, system-ui, 'Segoe UI', sans-serif; }
  main { max-width: 1000px; margin: 0 auto; padding: 24px 20px 80px; }
  h1 { font-size: 24px; margin: 0 0 6px; } .lead { color:#8fa0bd; margin: 0 0 8px; line-height:1.5; }
  nav { display:flex; flex-wrap:wrap; gap:8px; margin: 14px 0 6px; } nav a { color:#cfe0ff; font-size:13px; text-decoration:none; border:1px solid #2f4a85; padding:5px 11px; border-radius:999px; }
  section { margin-top: 34px; } h2 { font-size: 18px; margin: 0; } .sub { color:#8fa0bd; font-size:14px; margin: 3px 0 10px; }
  video { width:100%; border-radius:12px; background:#000; display:block; } details { margin-top: 10px; } summary { cursor:pointer; color:#cfe0ff; font-size:14px; padding:4px 0; }
  .tag { display:inline-block; font-size:12px; color:#8fa0bd; border:1px solid #22304a; border-radius:6px; padding:1px 7px; margin-left:8px; vertical-align:middle; }
</style></head>
<body><main>
  <h1>ContractorDocs video tutorial: finished chapters</h1>
  <p class="lead">${sections.length} chapter(s) finished so far, ${mins(total)} in total. Real app with demo data, automatic cursor, real AI33 voice-over in English and Spanish, with captions (turn them on with the CC button). More chapters appear here as they finish.</p>
  <nav>${sections.map((s) => `<a href="#c${s.ch.number}">${s.ch.number}. ${esc(s.ch.title)}</a>`).join('')}</nav>
${sections.map((s) => {
  const en = s.versions.find((v) => v.L === 'en'), es = s.versions.find((v) => v.L === 'es');
  const tag = (v) => `<video controls preload="metadata" src="${v.file}" crossorigin="anonymous">${v.vtt ? `<track kind="captions" srclang="${v.L}" label="${NAMES[v.L]}" src="${v.vtt}" default>` : ''}</video>`;
  return `  <section id="c${s.ch.number}"><h2>${s.ch.number}. ${esc(s.ch.title)}<span class="tag">${mins(s.dur)}</span></h2><p class="sub">${esc(s.ch.summary)}</p>
    ${en ? tag(en) : ''}
    ${es ? `<details><summary>Spanish voice and captions (${NAMES.es})</summary>${tag(es)}</details>` : ''}
  </section>`;
}).join('\n')}
</main></body></html>`;
fs.writeFileSync(path.join(outRoot, 'watch.html'), html);
console.log(`${sections.length} chapter(s), ${mins(total)} total -> ${path.join(outRoot, 'watch.html')}`);
