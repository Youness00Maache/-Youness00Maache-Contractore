// One command to record chapters: starts its own fake backend + app dev server on slot-specific ports, records, stops them.
//
//   node record/run.mjs <slot> <NN> [<NN> ...] [--lang en]
//
//   <slot>  a single letter, one per person/helper working at the same time (a, b, c ...): own ports
//           (backend 54330+n, app 3020+n) and own output folder (<work dir>-<slot>), so nobody collides.
//   narration: real audio timing from cache/audio/<lang>/... if it exists, otherwise placeholder timing (--mock) is made first.
// Output: <work dir>-<slot>/out/chapters/<NN-id>/{video.mp4, <lang>.vtt, <lang>.m4a, preview.mp4, chapter.json, fail-*.jpg}
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORK } from '../config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const repo = path.join(root, '..', '..', '..');
const args = process.argv.slice(2);
const slot = args[0];
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const chapters = args.slice(1).filter((a) => /^\d+$/.test(a)).map((a) => a.padStart(2, '0'));
if (!slot || !/^[a-z]$/.test(slot) || !chapters.length) { console.log('usage: node record/run.mjs <slot a-z> <NN> [<NN> ...] [--lang en]'); process.exit(1); }
const n = slot.charCodeAt(0) - 97;
const backendPort = 54330 + n, appPort = 3020 + n;
const work = process.env.TUTORIAL_WORK_DIR || `${WORK}-${slot}`;
const env = { ...process.env, TUTORIAL_WORK_DIR: work, TUTORIAL_APP_URL: `http://localhost:${appPort}`, TUTORIAL_BACKEND: `http://127.0.0.1:${backendPort}` };

const up = (url) => new Promise((resolve) => { const r = http.get(url, (res) => { res.resume(); resolve(res.statusCode > 0); }); r.on('error', () => resolve(false)); r.setTimeout(4000, () => { r.destroy(); resolve(false); }); });
const waitFor = async (url, label) => { for (let i = 0; i < 90; i++) { if (await up(url)) return; await new Promise((r) => setTimeout(r, 1000)); } throw new Error(label + ' did not start'); };
const kill = (child) => { if (child && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); };

const started = [];
try {
  if (!(await up(`http://127.0.0.1:${backendPort}/__health`))) {
    started.push(spawn('node', [path.join(root, 'fake-backend', 'server.mjs'), String(backendPort)], { stdio: 'ignore', env }));
    await waitFor(`http://127.0.0.1:${backendPort}/__health`, 'fake backend');
  }
  if (!(await up(`http://localhost:${appPort}/`))) {
    started.push(spawn('node', [path.join(repo, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(appPort), '--strictPort', '--host', 'localhost'], {
      cwd: repo, stdio: 'ignore', env: { ...env, VITE_SUPABASE_URL: `http://127.0.0.1:${backendPort}`, VITE_SUPABASE_ANON_KEY: 'demo-anon-key' },
    }));
    await waitFor(`http://localhost:${appPort}/`, 'app dev server');
  }
  for (const nn of chapters) {
    await up(`http://127.0.0.1:${backendPort}/__reset`);
    // placeholder timing when this chapter has no narration for the language yet
    const audioDir = path.join(work, 'cache', 'audio', lang);
    const has = fs.existsSync(audioDir) && fs.readdirSync(audioDir).some((d) => fs.existsSync(path.join(audioDir, d)));
    if (!has || args.includes('--mock')) spawnSync('node', [path.join(root, 'tts', 'narrate.mjs'), lang, '--chapters', nn, '--mock'], { stdio: 'inherit', env });
    console.log(`\n=== chapter ${nn} (slot ${slot}, app :${appPort}) ===`);
    spawnSync('node', [path.join(root, 'record', 'chapter.mjs'), nn, '--lang', lang], { stdio: 'inherit', env });
  }
} finally {
  for (const c of started) kill(c);
}
