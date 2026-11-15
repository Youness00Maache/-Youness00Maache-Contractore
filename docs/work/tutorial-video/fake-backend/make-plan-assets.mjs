// One-off: draws the demo floor plan of chapter 24 (a made-up master bath, 50 px = 1 ft) and its measurements, into fake-backend/assets/.
//   node fake-backend/make-plan-assets.mjs
// The fake server serves any file of assets/ by its name (see server.mjs), the plan listing comes from demo/24-plans-measure.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CHROME } from '../record/lib.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets');
fs.mkdirSync(dir, { recursive: true });
export const PLAN_NAME = 'plan24bath-Master-bath-floor-plan';
const W = 1600, H = 1000, PX_PER_FT = 50;

const html = `<body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const c = document.getElementById('c').getContext('2d');
c.fillStyle = '#fbfaf6'; c.fillRect(0, 0, ${W}, ${H});
// faint grid (1 ft)
c.strokeStyle = '#ece8dd'; c.lineWidth = 1;
for (let x = 0; x <= ${W}; x += 50) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, ${H}); c.stroke(); }
for (let y = 0; y <= ${H}; y += 50) { c.beginPath(); c.moveTo(0, y); c.lineTo(${W}, y); c.stroke(); }
const wall = (x1, y1, x2, y2, w = 10) => { c.strokeStyle = '#1f2933'; c.lineWidth = w; c.lineCap = 'square'; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
// outer walls
wall(100, 100, 1500, 100, 14); wall(1500, 100, 1500, 900, 14); wall(1500, 900, 100, 900, 14); wall(100, 900, 100, 100, 14);
// inner walls: bath | closet | bedroom, hall
wall(525, 100, 525, 650); wall(800, 100, 800, 900); wall(100, 650, 800, 650);
// doors (arc + leaf)
const door = (x, y, r, a0, a1) => { c.strokeStyle = '#6b7280'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); c.strokeStyle = '#1f2933'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + r * Math.cos(a1), y + r * Math.sin(a1)); c.stroke(); };
c.fillStyle = '#fbfaf6'; c.fillRect(380, 640, 90, 22); door(380, 650, 90, 0, Math.PI / 2 * 0.99);
c.fillStyle = '#fbfaf6'; c.fillRect(790, 700, 22, 90); door(800, 700, 90, Math.PI / 2, Math.PI);
// bath fixtures: tub / shower, vanity, toilet
c.strokeStyle = '#374151'; c.lineWidth = 3; c.fillStyle = '#e8eef5';
c.fillRect(110, 110, 150, 300); c.strokeRect(110, 110, 150, 300); c.beginPath(); c.moveTo(110, 110); c.lineTo(260, 410); c.moveTo(260, 110); c.lineTo(110, 410); c.stroke();
c.fillRect(330, 110, 180, 70); c.strokeRect(330, 110, 180, 70);
c.beginPath(); c.ellipse(420, 560, 38, 50, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.strokeRect(380, 480, 80, 28);
// outlets
c.fillStyle = '#374151';
for (const [x, y] of [[300, 108], [520, 250], [520, 480], [300, 642], [112, 480], [112, 580]]) { c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); }
// room names
c.fillStyle = '#111827'; c.font = '600 30px Arial';
c.fillText('MASTER BATH', 175, 330 + 140); c.fillText('CLOSET', 575, 380); c.fillText('BEDROOM', 1020, 500); c.fillText('HALL', 400, 790);
c.font = '22px Arial'; c.fillStyle = '#4b5563'; c.fillText("8' 6\\" x 11'", 215, 510); c.fillText("5' 6\\" x 11'", 590, 415);
// dimension line 8' 6" on the top wall of the bath (425 px)
c.strokeStyle = '#c2410c'; c.fillStyle = '#c2410c'; c.lineWidth = 3;
c.beginPath(); c.moveTo(100, 62); c.lineTo(525, 62); c.moveTo(100, 48); c.lineTo(100, 76); c.moveTo(525, 48); c.lineTo(525, 76); c.stroke();
c.font = '700 26px Arial'; c.fillText("8' 6\\"", 280, 50);
c.fillStyle = '#6b7280'; c.font = '20px Arial'; c.fillText('NORTHLINE REMODELING   |   NAIR MASTER BATH   |   SHEET A-1   |   SCALE 1/4" = 1\\'-0"', 100, 960);
</script></body>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
await page.locator('#c').screenshot({ path: path.join(dir, PLAN_NAME + '.png'), type: 'png' });
await browser.close();

// measurements: the bath room as a Drywall area, the walls as Baseboard, 6 outlets; scale calibrated on the 8' 6" dimension line (425 px)
const m = (ft) => ft * 0.3048;
const doc = {
  v: 1, version: 3, updatedAt: new Date().toISOString(), kind: 'image', pageCount: 1,
  labels: [
    { id: 'l-drywall', name: 'Drywall', color: '#e8590c' },
    { id: 'l-base', name: 'Baseboard', color: '#1c7ed6' },
    { id: 'l-outlets', name: 'Outlets', color: '#2f9e44' },
  ],
  pages: { 1: {
    scale: { mPerU: m(1) / PX_PER_FT, how: 'calibrated', ref: m(8.5) },
    items: [
      { id: 'i-area', tool: 'area', label: 'l-drywall', pts: [[100, 100], [525, 100], [525, 650], [100, 650]] },
      { id: 'i-cut', tool: 'area', label: 'l-drywall', subtract: true, pts: [[110, 110], [260, 110], [260, 410], [110, 410]] },
      { id: 'i-line', tool: 'line', label: 'l-base', pts: [[525, 100], [525, 650], [100, 650], [100, 100], [525, 100]] },
      ...[[300, 108], [520, 250], [520, 480], [300, 642], [112, 480], [112, 580]].map((p, i) => ({ id: 'i-out' + i, tool: 'count', label: 'l-outlets', pts: [p] })),
    ],
  } },
};
fs.writeFileSync(path.join(dir, PLAN_NAME + '.measure.json'), JSON.stringify(doc));
console.log('wrote', path.join(dir, PLAN_NAME + '.png'), 'and the measurements');
