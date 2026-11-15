// Records ONE chapter from its script: runs every scene against the real app (demo backend), paced to the narration
// timings in cache/audio/<lang>/<chapter>/<scene>.json (run `node tts/narrate.mjs en --mock` first for a placeholder).
//
//   node record/chapter.mjs 03 [--lang en] [--no-audio]
//
// Output: out/chapters/<NN-id>/video.mp4 (video only), <lang>.m4a, <lang>.vtt, preview.mp4 (video + audio), chapter.json
// (scene start times, unresolved actions). An action that cannot be performed is reported and skipped, never silent.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, startCapture, Actor, APP_URL, sleep } from './lib.mjs';
import { OUT, CACHE } from '../config.mjs';
import { loadChapters } from '../tts/narrate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const num = process.argv[2];
const lang = (process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en');
const noAudio = process.argv.includes('--no-audio');
if (!num) { console.log('usage: node record/chapter.mjs <NN> [--lang en] [--no-audio]'); process.exit(1); }

const ffmpeg = (a) => { const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr.slice(0, 400)); };

/** Find a visible element by what a person sees: role+name, label, placeholder, text. */
async function locate(page, a) {
  const name = a.target;
  const roles = a.role ? [a.role] : ['button', 'link', 'tab', 'menuitem', 'checkbox', 'combobox', 'textbox', 'option'];
  const tries = [];
  for (const role of roles) tries.push(page.getByRole(role, { name, exact: true }));
  tries.push(page.getByLabel(name, { exact: true }), page.getByPlaceholder(name, { exact: true }), page.getByText(name, { exact: true }));
  for (const role of roles) tries.push(page.getByRole(role, { name }));
  tries.push(page.getByLabel(name), page.getByPlaceholder(name), page.getByText(name));
  // a screen may still be loading: look for up to 8 seconds before giving up
  const until = Date.now() + (a.patience ?? 8000);
  do {
    for (const t of tries) {
      const vis = t.filter({ visible: true });
      const n = await vis.count().catch(() => 0);
      if (n > 0) return vis.nth(Math.min(a.nth || 0, n - 1));
    }
    await sleep(350);
  } while (Date.now() < until);
  return null;
}

/** Open a route and wait until the app has painted something. */
async function open(page, route) {
  await page.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => { throw new Error('could not open ' + route + ': ' + String(e.message).split('\n')[0]); });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await sleep(900);
}

const OVERLAY = `
window.__ring = (x, y, w, h, label, ms) => {
  const r = document.createElement('div');
  r.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;border:3px solid #f59e0b;border-radius:10px;box-shadow:0 0 0 6px rgba(245,158,11,.22);left:' + (x - 6) + 'px;top:' + (y - 6) + 'px;width:' + (w + 12) + 'px;height:' + (h + 12) + 'px';
  document.documentElement.appendChild(r);
  let l;
  if (label) { l = document.createElement('div'); l.textContent = label; l.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;background:#f59e0b;color:#111;font:600 15px Inter,system-ui,sans-serif;padding:6px 12px;border-radius:8px;left:' + x + 'px;top:' + Math.max(8, y - 44) + 'px;max-width:380px'; document.documentElement.appendChild(l); }
  r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });
  setTimeout(() => { r.remove(); l && l.remove(); }, ms);
};
window.__caption = (text, ms) => {
  const c = document.createElement('div'); c.textContent = text;
  c.style.cssText = 'position:fixed;z-index:2147483644;left:50%;bottom:56px;transform:translateX(-50%);background:rgba(11,18,32,.92);color:#fff;border:1px solid #2f4a85;font:600 26px Inter,system-ui,sans-serif;padding:14px 26px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.5)';
  document.documentElement.appendChild(c);
  c.animate([{ opacity: 0, transform: 'translate(-50%,16px)' }, { opacity: 1, transform: 'translate(-50%,0)' }], { duration: 300, fill: 'forwards' });
  setTimeout(() => c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => c.remove(), ms);
};`;

async function perform(page, me, a, ctx) {
  switch (a.act) {
    case 'goto': await open(page, a.route); return;
    case 'wait': await sleep((a.s || 1) * 1000); return;
    case 'key': await page.keyboard.press(a.key); await me.pause(0.3); return;
    case 'scroll': {
      if (a.to) { const el = await locate(page, { target: a.to }); if (!el) throw new Error('scroll target not found'); await el.scrollIntoViewIfNeeded(); await me.pause(0.4); }
      else await me.scroll(a.by);
      return;
    }
    case 'caption': await page.evaluate(([t, ms]) => window.__caption(t, ms), [a.text, ctx.sentenceMs || 3500]); return;
    case 'state': ctx.log(`state note: ${a.note}`); return;
    case 'zoom': ctx.zooms.push({ t: ctx.now(), target: a.target || null, out: !!a.out, scale: a.scale || 1.25 }); return;
  }
  const el = await locate(page, a);
  if (!el) throw new Error(`"${a.target}" not found on screen`);
  if (a.act === 'hover') { await me.moveTo(el); return; }
  if (a.act === 'highlight') {
    await me.moveTo(el, 500);
    const b = await el.boundingBox();
    if (b) await page.evaluate(([x, y, w, h, l, ms]) => window.__ring(x, y, w, h, l, ms), [b.x, b.y, b.width, b.height, a.label || '', 2600]);
    return;
  }
  if (a.act === 'click') { await me.click(el); await sleep(300); return; }
  if (a.act === 'type') { await me.click(el); await page.keyboard.press('Control+A'); await page.keyboard.type(a.text, { delay: 45 }); await me.pause(0.2); return; }
  if (a.act === 'select') {
    const tag = await el.evaluate((n) => n.tagName.toLowerCase());
    await me.moveTo(el);
    if (tag === 'select') { await el.selectOption({ label: a.option }).catch(async () => el.selectOption(a.option)); await me.pause(0.3); }
    else { await me.click(el); const opt = await locate(page, { target: a.option }); if (!opt) throw new Error(`option "${a.option}" not found`); await me.click(opt); }
    return;
  }
  throw new Error(`unknown act ${a.act}`);
}

async function main() {
  const [chapter] = await loadChapters([num.padStart(2, '0')]);
  if (!chapter) throw new Error('no chapter ' + num);
  const slug = `${String(chapter.number).padStart(2, '0')}-${chapter.id}`;
  const out = path.join(OUT, 'chapters', slug);
  fs.mkdirSync(out, { recursive: true });
  const audioMeta = (scene) => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, 'audio', lang, chapter.id, scene.id + '.json'), 'utf8')); } catch { return null; } };

  const { browser, page } = await launch();
  await page.addInitScript(OVERLAY);
  page.on('dialog', (d) => d.accept().catch(() => {})); // "leave without saving?" prompts must not block a scene
  await open(page, chapter.scenes[0].route);
  await page.getByText(/Marcus|Dashboard/).first().waitFor({ timeout: 20000 }).catch(() => {});
  await sleep(1200);
  const cap = await startCapture(page, path.join(out, 'video.mp4'));
  const me = new Actor(page);
  const unresolved = [], zooms = [], sceneTimes = [];
  const log = (m) => console.log('   ' + m);

  for (const scene of chapter.scenes) {
    const meta = audioMeta(scene);
    if (!meta && !noAudio) throw new Error(`no narration timing for ${chapter.id}.${scene.id}: run  node tts/narrate.mjs ${lang} --chapters ${num} --mock`);
    const sentences = meta ? meta.sentences : scene.say.map((s, i) => ({ start: i * 4, end: (i + 1) * 4 }));
    const duration = (meta ? meta.duration : sentences.at(-1).end) + 0.6;
    const t0 = cap.now();
    sceneTimes.push({ id: scene.id, start: +t0.toFixed(3), duration: +duration.toFixed(3), kind: scene.kind });
    console.log(`scene ${scene.id} (${scene.kind}) ${duration.toFixed(1)}s`);
    if (scene.kind === 'app') {
      if (scene.route && scene !== chapter.scenes[0]) await open(page, scene.route);
      const ctx = { now: () => cap.now(), zooms, log, sentenceMs: 3500 };
      for (const [i, a] of (scene.do || []).entries()) {
        const startAt = t0 + (sentences[a.with]?.start ?? 0) + (a.delay || 0);
        const wait = startAt - cap.now();
        if (wait > 0) await sleep(wait * 1000);
        ctx.sentenceMs = ((sentences[a.with]?.end ?? 4) - (sentences[a.with]?.start ?? 0)) * 1000;
        try { await perform(page, me, a, ctx); }
        catch (e) {
          const msg = `${chapter.id}.${scene.id} do[${i}] ${a.act} "${a.target || ''}": ${String(e.message).split('\n')[0]}`;
          unresolved.push(msg); log('UNRESOLVED ' + msg);
          // evidence for fixing the script: what the screen looked like (kept small), outside the recording
          try { await page.screenshot({ path: path.join(out, `fail-${scene.id}-${i}.jpg`), type: 'jpeg', quality: 55, scale: 'css' }); } catch { /* ignore */ }
        }
      }
    } else {
      // motion scene: a full-screen overlay (iframe) on top of the app page, so the app state underneath is kept.
      // Templates are served by the dev server from docs/work/tutorial-video/motion/<template>.html; without one, a title card.
      const tpl = scene.template && fs.existsSync(path.join(root, 'motion', scene.template + '.html')) ? scene.template : null;
      const card = `<body style="margin:0;background:#0b1220;color:#e6ebf5;font:600 44px Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh;text-align:center;padding:0 120px;box-sizing:border-box">${(scene.do || []).find((d) => d.act === 'caption')?.text || scene.say[0]}</body>`;
      await page.evaluate(([src, doc]) => {
        const f = document.createElement('iframe'); f.id = '__motion';
        f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;z-index:2147483640;background:#0b1220';
        if (src) f.src = src; else f.srcdoc = doc;
        document.documentElement.appendChild(f);
        const c = document.getElementById('__cur'); if (c) c.style.display = 'none';
      }, [tpl ? `/docs/work/tutorial-video/motion/${tpl}.html` : null, card]);
      if (!tpl) unresolved.push(`${chapter.id}.${scene.id}: motion scene has no template yet (title card shown): ${String(scene.visual || '').slice(0, 90)}`);
      const stay = t0 + duration - cap.now();
      if (stay > 0) await sleep(stay * 1000);
      await page.evaluate(() => { document.getElementById('__motion')?.remove(); const c = document.getElementById('__cur'); if (c) c.style.display = ''; });
    }
    const left = t0 + duration - cap.now();
    if (left > 0) await sleep(left * 1000);
  }
  const video = await cap.stop();
  await browser.close();

  // audio + subtitles for this language
  const vtt = ['WEBVTT', ''];
  const fmt = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = (t % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s}`; };
  const inputs = [], filters = [];
  chapter.scenes.forEach((scene, i) => {
    const meta = audioMeta(scene); if (!meta) return;
    const st = sceneTimes[i].start;
    meta.sentences.forEach((s, k) => vtt.push(`${fmt(st + s.start)} --> ${fmt(st + s.end)}`, scene.say[k], ''));
    inputs.push('-i', path.join(CACHE, 'audio', lang, chapter.id, meta.file));
    filters.push(`[${inputs.length / 2 - 1}:a]adelay=${Math.round(st * 1000)}|${Math.round(st * 1000)}[a${filters.length}]`);
  });
  fs.writeFileSync(path.join(out, `${lang}.vtt`), vtt.join('\n'));
  let preview = null;
  if (filters.length) {
    const mix = filters.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${filters.length}:normalize=0[out]`;
    ffmpeg([...inputs, '-filter_complex', [...filters, mix].join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', path.join(out, `${lang}.m4a`)]);
    preview = path.join(out, 'preview.mp4');
    ffmpeg(['-i', video, '-i', path.join(out, `${lang}.m4a`), '-c:v', 'copy', '-c:a', 'copy', '-shortest', preview]);
  }
  const info = { chapter: slug, lang, video: 'video.mp4', scenes: sceneTimes, zooms, unresolved, frames: cap.frames };
  fs.writeFileSync(path.join(out, 'chapter.json'), JSON.stringify(info, null, 1));
  console.log(`\n${slug}: ${sceneTimes.at(-1).start + sceneTimes.at(-1).duration > 0 ? (sceneTimes.at(-1).start + sceneTimes.at(-1).duration).toFixed(0) : 0}s, ${unresolved.length} unresolved action(s)`);
  for (const u of unresolved) console.log('  - ' + u);
  console.log('->', preview || video);
}
await main();
