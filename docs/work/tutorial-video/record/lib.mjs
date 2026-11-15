// Recording toolkit: drives the REAL app in Chrome (against the fake demo backend) like a person would, and captures
// the screen as a real-time screencast. Nothing here talks to the owner's account or stores any secret.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DEMO_USER } from '../fake-backend/seed.mjs';

export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const APP_URL = process.env.TUTORIAL_APP_URL || 'http://localhost:3012';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The fake session the Supabase client reads from localStorage (same key the app uses). */
export function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return { access_token: 'demo-access', token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'demo-refresh', user: DEMO_USER };
}

const CURSOR_SCRIPT = `
(() => {
  const mk = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));will-change:transform';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7.6 19 2.6-7.7L21 10.8z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + (e.clientX - 22) + 'px;top:' + (e.clientY - 22) + 'px;width:44px;height:44px;border-radius:50%;border:3px solid #3b82f6;background:rgba(59,130,246,.25);z-index:2147483646;pointer-events:none';
      document.documentElement.appendChild(r);
      r.animate([{ transform: 'scale(.35)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 520, easing: 'ease-out' }).onfinish = () => r.remove();
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mk); else mk();
})();`;

export async function launch({ width = 1280, height = 720, scale = 1, storage = {}, extraInit = '' } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--disable-features=Translate', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'en-US', timezoneId: 'America/New_York', permissions: ['geolocation'] });
  const ls = { 'contractordocs-auth': JSON.stringify(fakeSession()), theme: 'dark', ...storage };
  await context.addInitScript(({ ls }) => { try { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } catch { /* ignore */ } }, { ls });
  await context.addInitScript(CURSOR_SCRIPT);
  if (extraInit) await context.addInitScript(extraInit);
  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Real-time screencast piped straight into ffmpeg (constant 30 fps H.264, video only). NO frame files are written:
 * the disk of this PC is nearly full, and thousands of JPEGs also make the Vite dev server crawl.
 * The latest screencast frame is repeated until a newer one arrives, so the video always runs at real time.
 * Frames of different sizes (a phone-sized scene inside a desktop recording) are fitted onto a fixed dark canvas.
 */
export async function startCapture(page, outFile, { quality = 82, fps = 30, width = 1280, height = 720, crf = 24 } = {}) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b1220,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const closed = new Promise((resolve, reject) => { ff.on('close', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exited with ' + c)))); ff.on('error', reject); });
  ff.stdin.on('error', () => {});
  const cdp = await page.context().newCDPSession(page);
  let latest = null, written = 0, t0 = 0, timer = null, paused = false, pausedAt = 0, shift = 0;
  const pump = () => { if (!latest || paused) return; const due = Math.floor(((Date.now() - t0 - shift) / 1000) * fps); while (written < due) { ff.stdin.write(latest); written++; } };
  cdp.on('Page.screencastFrame', (f) => {
    latest = Buffer.from(f.data, 'base64');
    if (!t0) { t0 = Date.now(); timer = setInterval(pump, 8); }
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1 });
  for (let i = 0; i < 100 && !t0; i++) await sleep(50); // first frame starts the clock
  if (!t0) throw new Error('the screencast produced no frame');
  return {
    /** seconds of VIDEO so far (time spent paused does not count) */
    now: () => ((paused ? pausedAt : Date.now()) - t0 - shift) / 1000,
    /** stop the clock (a page is loading): the video does not advance and the loading is never shown */
    pause() { if (!paused) { paused = true; pausedAt = Date.now(); } },
    /** start the clock again; the next frame written is the newest one, i.e. the loaded page */
    resume() { if (paused) { shift += Date.now() - pausedAt; paused = false; } },
    get frames() { return written; },
    async stop(endPad = 0.6) {
      await sleep(endPad * 1000);
      pump();
      clearInterval(timer);
      await cdp.send('Page.stopScreencast').catch(() => {});
      ff.stdin.end();
      await closed;
      return outFile;
    },
  };
}

/** Frames -> constant-30-fps H.264 (video only). */
export function encode(frames, outFile, { fps = 30, crf = 23, endPad = 0.6 } = {}) {
  if (!frames.length) throw new Error('no frames captured');
  const listFile = outFile + '.concat.txt';
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const dur = next ? Math.max(0.001, next.t - f.t) : endPad;
    lines.push(`file '${f.file.replace(/\\/g, '/')}'`, `duration ${dur.toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, '/')}'`);
  fs.writeFileSync(listFile, lines.join('\n'));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=${fps},format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-movflags', '+faststart', outFile], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
  fs.rmSync(listFile, { force: true });
  return outFile;
}

/** How long the cursor takes to glide a distance (px): short hops are quick, long ones stay under ~0.75 s. */
export const glideMs = (dist, fast = false) => (fast ? 150 : Math.min(750, Math.max(280, 220 + dist * 0.55)));

/** A person at the keyboard: smooth cursor, clicks on labels, typing, scrolling. `fast` = catch up with the narration. */
export class Actor {
  constructor(page) { this.page = page; this.x = 640; this.y = 360; this.fast = false; this.lastDown = null; this.nowFn = null; }
  async pause(s) { await sleep(s * 1000); }
  async glide(x, y, ms) {
    if (ms == null) ms = glideMs(Math.hypot(x - this.x, y - this.y), this.fast);
    const sx = this.x, sy = this.y, started = Date.now();
    for (;;) { // follow the clock, not a step count: the glide lasts exactly `ms` however slow each mouse step is
      const t = Math.min(1, (Date.now() - started) / ms); const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
      await this.page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      if (t >= 1) break;
    }
    this.x = x; this.y = y;
  }
  async center(locator) {
    let b = await locator.first().boundingBox();
    const vp = this.page.viewportSize() || { width: 1280, height: 720 };
    if (!b || b.y < 4 || b.x < 0 || b.y + b.height > vp.height - 4 || b.x + b.width > vp.width) { // only scroll when it is out of view
      await locator.first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(120);
      b = await locator.first().boundingBox();
    }
    if (!b) throw new Error('target not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  async moveTo(locator, ms) { const p = await this.center(locator); await this.glide(p.x, p.y, ms); }
  async click(locator, ms) {
    await this.moveTo(locator, ms);
    await this.pause(this.fast ? 0.02 : 0.06);
    if (this.nowFn) this.lastDown = this.nowFn(); // the moment of the click, for the sync report
    await this.page.mouse.down(); await sleep(45); await this.page.mouse.up();
    await this.pause(this.fast ? 0.04 : 0.1);
  }
  async type(locator, text, perChar) { await this.click(locator); await this.page.keyboard.type(text, { delay: perChar ?? (this.fast ? 20 : 45) }); await this.pause(0.08); }
  async scroll(dy, steps = 10) { for (let i = 0; i < steps; i++) { await this.page.mouse.wheel(0, dy / steps); await sleep(28); } await this.pause(0.12); }
}

export function run(cmd, args, opts = {}) { return spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts }); }
