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
import { launch, startCapture, Actor, APP_URL, sleep, glideMs } from './lib.mjs';
import { OUT, CACHE } from '../config.mjs';
import { loadChapters, loadTranslations, sentencesOf } from '../tts/narrate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const num = process.argv[2];
// --langs en,es : every listed language gets its own voice track + captions; each scene lasts as long as the LONGEST of them,
// and the actions follow the FIRST language's sentence times.
const langs = (process.argv.includes('--langs') ? process.argv[process.argv.indexOf('--langs') + 1] : (process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'en')).split(',');
const lang = langs[0];
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

/** Open a route and wait until the app has painted something. With a capture the loading is CUT OUT of the video (clock paused). */
async function open(page, route, cap) {
  cap?.pause();
  try {
    await page.goto(APP_URL + route, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => { throw new Error('could not open ' + route + ': ' + String(e.message).split('\n')[0]); });
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
    await sleep(700);
  } finally { cap?.resume(); }
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

async function perform(page, me, a, ctx, pre) {
  switch (a.act) {
    case 'goto': await open(page, a.route, ctx.cap); return;
    case 'wait': await sleep((a.s || 1) * 1000); return;
    case 'key': await page.keyboard.press(a.key); await me.pause(0.12); return;
    case 'scroll': {
      if (a.to) { const el = await locate(page, { target: a.to }); if (!el) throw new Error('scroll target not found'); await el.scrollIntoViewIfNeeded(); await me.pause(0.15); }
      else await me.scroll(a.by);
      return;
    }
    case 'caption': await page.evaluate(([t, ms]) => window.__caption(t, ms), [a.text, ctx.sentenceMs || 3500]); return;
    case 'state': ctx.log(`state note: ${a.note}`); return;
    case 'zoom': ctx.zooms.push({ t: ctx.now(), target: a.target || null, out: !!a.out, scale: a.scale || 1.25 }); return;
  }
  const el = pre ? pre.el : await locate(page, a);
  if (!el) throw new Error(`"${a.target}" not found on screen`);
  if (a.act === 'hover') { await me.moveTo(el); return; }
  if (a.act === 'highlight') {
    await me.moveTo(el);
    const b = await el.boundingBox();
    if (b) await page.evaluate(([x, y, w, h, l, ms]) => window.__ring(x, y, w, h, l, ms), [b.x, b.y, b.width, b.height, a.label || '', 2600]);
    return;
  }
  if (a.act === 'click') { await me.click(el); return; }
  if (a.act === 'type') { await me.click(el); await page.keyboard.press('Control+A'); await page.keyboard.type(a.text, { delay: Math.min(me.fast ? 20 : 45, Math.max(12, Math.floor(1400 / Math.max(1, a.text.length)))) }); await me.pause(0.08); return; }
  if (a.act === 'select') {
    const tag = await el.evaluate((n) => n.tagName.toLowerCase());
    await me.moveTo(el);
    if (tag === 'select') { await el.selectOption({ label: a.option }).catch(async () => el.selectOption(a.option)); await me.pause(0.1); }
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
  const audioMeta = (scene, L = lang) => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, 'audio', L, chapter.id, scene.id + '.json'), 'utf8')); } catch { return null; } };

  const { browser, page } = await launch();
  await page.addInitScript(OVERLAY);
  page.on('dialog', (d) => d.accept().catch(() => {})); // "leave without saving?" prompts must not block a scene
  await open(page, chapter.scenes[0].route);
  await page.getByText(/Marcus|Dashboard/).first().waitFor({ timeout: 20000 }).catch(() => {});
  await sleep(1200);
  const cap = await startCapture(page, path.join(out, 'video.mp4'));
  const me = new Actor(page);
  me.nowFn = () => cap.now();
  // narration starts LEAD seconds after a scene starts (the screen settles, the cursor is already moving); PAD closes the scene
  const LEAD = 0.45, PAD = 0.3;
  let size = 'desktop';
  let ratio = 1.25; // real travel time / estimated travel time, learned from the clicks so far
  const unresolved = [], zooms = [], sceneTimes = [], syncErrors = [], timing = [];
  const log = (m) => console.log('   ' + m);

  for (const scene of chapter.scenes) {
    const meta = audioMeta(scene);
    // the voice must be the voice of THIS text: a rewritten scene needs `node tts/narrate.mjs <lang> --chapters NN` before recording
    if (meta && !meta.mock && meta.text && meta.text !== scene.say.join(' ')) throw new Error(`the narration of ${chapter.id}.${scene.id} was changed after its voice was made: run  node tts/narrate.mjs ${lang} --chapters ${num}  first (ask the coordinator)`);
    if (!meta && !noAudio) throw new Error(`no narration timing for ${chapter.id}.${scene.id}: run  node tts/narrate.mjs ${lang} --chapters ${num} --mock`);
    const sentences = meta ? meta.sentences : scene.say.map((s, i) => ({ start: i * 4, end: (i + 1) * 4 }));
    const prim = meta ? meta.duration : sentences.at(-1).end;
    // the other voices are sped up a little (at most 1.12x) to fit the first language's timing; the scene grows only if they still do not fit
    const tempo = {}; let longest = prim;
    for (const L of langs.slice(1)) {
      const m = audioMeta(scene, L); if (!m) continue;
      const allowed = prim + 0.3;
      tempo[L] = m.duration > allowed ? Math.min(1.12, m.duration / allowed) : 1;
      longest = Math.max(longest, m.duration / tempo[L]);
    }
    const duration = LEAD + longest + PAD;
    // get the screen ready WITHOUT recording it: no loading screens, no waiting around
    if (scene.kind === 'app') {
      const dev = scene.device === 'phone' ? 'phone' : 'desktop';
      const needRoute = !!scene.route && scene !== chapter.scenes[0];
      if (dev !== size || needRoute) {
        cap.pause();
        try {
          if (dev !== size) { await page.setViewportSize(dev === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 }); size = dev; await sleep(450); }
          if (needRoute) await open(page, scene.route);
        } finally { cap.resume(); }
      }
    }
    const t0 = cap.now();
    const rec = { id: scene.id, start: +t0.toFixed(3), duration: +duration.toFixed(3), lead: LEAD, tempo, kind: scene.kind, offsets: scene.say.map(() => 0) };
    sceneTimes.push(rec);
    let finalOffset = 0; // seconds the voice had to wait for a slow step (elastic timing)
    console.log(`scene ${scene.id} (${scene.kind}) ${duration.toFixed(1)}s`);
    if (scene.kind === 'app') {
      const ctx = { now: () => cap.now(), cap, zooms, log, sentenceMs: 3500 };
      // when several actions share one sentence and none is named in it, spread them over the sentence (each needs its own moment)
      const unmatched = {};
      (scene.do || []).forEach((a, i) => {
        const t = String(scene.say[a.with] || '').toLowerCase();
        const named = a.target && t.includes(String(a.target).toLowerCase());
        if (!named && ['click', 'type', 'select', 'highlight', 'hover', 'scroll'].includes(a.act)) (unmatched[a.with] = unmatched[a.with] || []).push(i);
      });
      // ELASTIC timing: when a step is slow (a page needs time), everything after it moves later by the same amount, so the voice
      // never says a thing before the screen shows it. offsetNow only grows; offsetAfter[k] = the delay in force for sentence k.
      let offsetNow = 0;
      const offsetAfter = new Array(scene.say.length).fill(null);
      for (const [i, a] of (scene.do || []).entries()) {
        const win = sentences[a.with] || sentences[0];
        const text = String(scene.say[a.with] || '');
        // the action should LAND when the words that name it are spoken
        let frac;
        const idx = a.target && text ? text.toLowerCase().indexOf(String(a.target).toLowerCase()) : -1;
        if (idx >= 0) frac = Math.min(0.92, (idx + String(a.target).length * 0.35) / text.length);
        else { const list = unmatched[a.with] || [i]; const jx = Math.max(0, list.indexOf(i)); frac = 0.08 + (list.length > 1 ? (0.62 * jx) / (list.length - 1) : 0); }
        const effectAt = t0 + LEAD + win.start + frac * (win.end - win.start) + (a.delay || 0) + offsetNow;
        // find the control first, so the cursor can be timed to arrive exactly then
        let pre = null, travel = 0;
        if (['click', 'type', 'select', 'highlight', 'hover'].includes(a.act)) {
          let el = null; try { el = await locate(page, a); } catch { /* reported below */ }
          pre = { el };
          if (el) { const bb = await el.boundingBox().catch(() => null); if (bb) travel = glideMs(Math.hypot(bb.x + bb.width / 2 - me.x, bb.y + bb.height / 2 - me.y)) / 1000 + 0.06; }
        } else if (a.act === 'scroll') travel = 0.3;
        const startAt = effectAt - travel * ratio;
        const wait = startAt - cap.now();
        if (wait > 0) await sleep(wait * 1000);
        me.fast = cap.now() > startAt + 0.45; // behind the narration: hurry up
        ctx.sentenceMs = ((win.end ?? 4) - (win.start ?? 0)) * 1000;
        me.lastDown = null;
        const startedAt = cap.now();
        try { await perform(page, me, a, ctx, pre); }
        catch (e) {
          const msg = `${chapter.id}.${scene.id} do[${i}] ${a.act} "${a.target || ''}": ${String(e.message).split('\n')[0]}`;
          unresolved.push(msg); log('UNRESOLVED ' + msg);
          // evidence for fixing the script: what the screen looked like (kept small), outside the recording
          try { await page.screenshot({ path: path.join(out, `fail-${scene.id}-${i}.jpg`), type: 'jpeg', quality: 55, scale: 'css' }); } catch { /* ignore */ }
        }
        timing.push({ s: scene.id, i, act: a.act, target: String(a.target || a.route || '').slice(0, 28), want: +(effectAt - t0).toFixed(2), planned: +(startAt - t0).toFixed(2), started: +(startedAt - t0).toFixed(2), travel: +travel.toFixed(2), down: me.lastDown == null ? null : +(me.lastDown - t0).toFixed(2), fast: me.fast });
        if (a.act === 'click' && me.lastDown != null) {
          syncErrors.push(me.lastDown - effectAt);
          if (travel > 0.2 && !me.fast) ratio = Math.min(3, Math.max(0.8, 0.6 * ratio + 0.4 * ((me.lastDown - startedAt) / travel))); // adapt for the next one
        }
        { // late by more than a quarter second: the voice waits that long from here on
          const w = Math.min(a.with ?? 0, offsetAfter.length - 1);
          const actual = (a.act === 'click' || a.act === 'type') && me.lastDown != null ? me.lastDown : startedAt + travel;
          if (actual - effectAt > 0.25 && !['wait', 'state', 'caption', 'zoom'].includes(a.act)) offsetNow += actual - effectAt;
          offsetAfter[w] = offsetNow;
        }
      }
      me.fast = false;
      { let run = 0; rec.offsets = scene.say.map((_, k) => { if (offsetAfter[k] != null) run = Math.max(run, offsetAfter[k]); return +run.toFixed(2); }); finalOffset = run; rec.duration = +(duration + run).toFixed(3); }
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
      }, [tpl ? `/docs/work/tutorial-video/motion/${tpl}.html?d=${duration.toFixed(1)}` : null, card]);
      if (!tpl) unresolved.push(`${chapter.id}.${scene.id}: motion scene has no template yet (title card shown): ${String(scene.visual || '').slice(0, 90)}`);
      const stay = t0 + duration - cap.now();
      if (stay > 0) await sleep(stay * 1000);
      await page.evaluate(() => { document.getElementById('__motion')?.remove(); const c = document.getElementById('__cur'); if (c) c.style.display = ''; });
    }
    const left = t0 + duration + finalOffset - cap.now();
    if (left > 0) await sleep(left * 1000);
  }
  const video = await cap.stop(0.15);
  await browser.close();

  // voice track + captions for each language (a voice that had to be sped up has its captions sped up with it)
  const fmt = (t) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = (t % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`; };
  let preview = null;
  for (const L of langs) {
    const tr = loadTranslations(L);
    const vtt = ['WEBVTT', ''];
    const inputs = [], filters = [], temps = [];
    chapter.scenes.forEach((scene, i) => {
      const meta = audioMeta(scene, L); if (!meta) return;
      const rec = sceneTimes[i];
      const st = rec.start + rec.lead;
      const tp = rec.tempo[L] || 1;
      const texts = sentencesOf(chapter, scene, L, tr);
      const src = path.join(CACHE, 'audio', L, chapter.id, meta.file);
      meta.sentences.forEach((sn, k) => {
        const at = st + sn.start / tp + (rec.offsets[k] || 0);
        const len = sn.end - sn.start;
        vtt.push(`${fmt(at)} --> ${fmt(at + len / tp)}`, texts[k], '');
        const seg = path.join(out, `_seg-${L}-${scene.id}-${k}.wav`);
        ffmpeg(['-ss', sn.start.toFixed(3), '-t', len.toFixed(3), '-i', src, ...(tp !== 1 ? ['-filter:a', `atempo=${tp.toFixed(4)}`] : []), seg]);
        temps.push(seg);
        inputs.push('-i', seg);
        const ms = Math.round(at * 1000);
        filters.push(`[${inputs.length / 2 - 1}:a]adelay=${ms}|${ms}[a${filters.length}]`);
      });
    });
    fs.writeFileSync(path.join(out, `${L}.vtt`), vtt.join('\n'));
    if (filters.length) {
      const mix = filters.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${filters.length}:normalize=0[out]`;
      ffmpeg([...inputs, '-filter_complex', [...filters, mix].join(';'), '-map', '[out]', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', path.join(out, `${L}.m4a`)]);
      if (L === lang) { preview = path.join(out, 'preview.mp4'); ffmpeg(['-i', video, '-i', path.join(out, `${L}.m4a`), '-c:v', 'copy', '-c:a', 'copy', '-shortest', preview]); }
    }
    for (const f of temps) fs.rmSync(f, { force: true });
  }
  // how well the clicks landed on the spoken words (seconds; positive = the click came after the words)
  const absErr = syncErrors.map(Math.abs);
  const sync = { clicks: syncErrors.length, meanAbs: +(absErr.reduce((x, y) => x + y, 0) / Math.max(1, absErr.length)).toFixed(2), maxAbs: +Math.max(0, ...absErr).toFixed(2), meanSigned: +(syncErrors.reduce((x, y) => x + y, 0) / Math.max(1, syncErrors.length)).toFixed(2) };
  const info = { chapter: slug, lang, langs, video: 'video.mp4', scenes: sceneTimes, zooms, unresolved, sync, timing, frames: cap.frames };
  fs.writeFileSync(path.join(out, 'chapter.json'), JSON.stringify(info, null, 1));
  console.log(`\n${slug}: ${sceneTimes.at(-1).start + sceneTimes.at(-1).duration > 0 ? (sceneTimes.at(-1).start + sceneTimes.at(-1).duration).toFixed(0) : 0}s, ${unresolved.length} unresolved action(s)`);
  for (const u of unresolved) console.log('  - ' + u);
  console.log(`sync: ${sync.clicks} clicks, mean |error| ${sync.meanAbs}s, worst ${sync.maxAbs}s, mean ${sync.meanSigned}s (positive = click after the words)`);
  console.log('->', preview || video);
}
await main();
