// Proof that a motion-graphic scene (plain HTML + Web Animations) is captured by the same pipeline as the app.
//   node record/motion-spike.mjs [template-file]  -> out/motion-spike.mp4
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch, startCapture, sleep } from './lib.mjs';
import { OUT } from '../config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'motion', 'month-limit.html');
const out = OUT;
const { browser, page } = await launch();
await page.goto(pathToFileURL(path.resolve(file)).href);
const cap = await startCapture(page, path.join(out, 'motion-spike.mp4'));
await page.waitForFunction('window.__done === true', null, { timeout: 60000 });
await sleep(300);
const mp4 = await cap.stop();
console.log('->', mp4, cap.frames, 'frames');
await browser.close();
