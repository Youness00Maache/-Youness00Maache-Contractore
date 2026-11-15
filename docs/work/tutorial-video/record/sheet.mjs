// One contact-sheet image of a recorded chapter (evenly spaced frames), so a chapter can be reviewed with ONE image read.
//   node record/sheet.mjs <slot> <NN> [cols=4] [rows=3]     -> <work dir>-<slot>/out/chapters/<NN-id>/sheet.jpg
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORK } from '../config.mjs';

const [slot, nn, colsArg, rowsArg] = process.argv.slice(2);
if (!slot || !nn) { console.log('usage: node record/sheet.mjs <slot> <NN> [cols] [rows]'); process.exit(1); }
const work = process.env.TUTORIAL_WORK_DIR || `${WORK}-${slot}`;
const base = path.join(work, 'out', 'chapters');
const dir = fs.readdirSync(base).find((d) => d.startsWith(String(nn).padStart(2, '0') + '-'));
if (!dir) { console.log('no recorded chapter ' + nn); process.exit(1); }
const video = path.join(base, dir, 'video.mp4');
const cols = Number(colsArg || 4), rows = Number(rowsArg || 3);
const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video], { encoding: 'utf8' }).stdout);
const out = path.join(base, dir, 'sheet.jpg');
const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', video, '-vf', `fps=${(cols * rows) / dur},scale=480:-1,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '4', out], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(out);
