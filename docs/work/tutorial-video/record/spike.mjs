// Feasibility spike: dashboard -> open a job -> scroll, recorded from the real app with demo data. ~15 s.
//   node record/spike.mjs        (needs the fake backend on :54329 and the app on :3012, see README)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, startCapture, Actor, APP_URL, sleep } from './lib.mjs';
import { OUT } from '../config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = OUT;

const { browser, page } = await launch();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 160)); });
page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 160)));
page.on('requestfailed', (r) => problems.push('failed: ' + r.url().slice(0, 120)));

await page.goto(APP_URL + '/dashboard', { waitUntil: 'domcontentloaded' });
await page.getByText('Whitfield Kitchen Remodel').first().waitFor({ timeout: 20000 });
await sleep(800);

const cap = await startCapture(page, path.join(out, 'spike.mp4'));
const me = new Actor(page);
await me.pause(1.0);
await me.moveTo(page.getByText('Nair Master Bath').first(), 900);
await me.pause(0.5);
await me.click(page.getByRole('button', { name: /View Project/i }).first());
await page.waitForLoadState('domcontentloaded');
await me.pause(1.5);
await me.scroll(500);
await me.pause(1.0);
const mp4 = await cap.stop();

console.log('page problems:', problems.length ? '\n' + [...new Set(problems)].slice(0, 15).join('\n') : 'none');
await browser.close();
console.log('->', mp4, cap.frames, 'frames');
