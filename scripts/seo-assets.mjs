/**
 * Generates the PNG/ICO brand assets in public/ from public/favicon.svg, plus the 1200×630 Open Graph image.
 * Uses headless Chrome only (no image libraries). Run manually after changing the logo: `npm run seo:assets`.
 *   CHROME_PATH=/path/to/chrome npm run seo:assets   (defaults to the standard Windows install path)
 * Outputs: favicon.ico (16+32+48), favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png (180, full-bleed),
 *          icon-192.png, icon-512.png, icon-maskable-512.png, og-image.png
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BRAND = '#2148ed';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-assets-'));
const chrome = (args) =>
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${path.join(tmp, 'profile')}`, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8');
const SPECS = [
  { name: 'favicon-16x16.png', size: 16, mode: 'tile' },
  { name: 'favicon-32x32.png', size: 32, mode: 'tile' },
  { name: 'favicon-48x48.png', size: 48, mode: 'tile', temp: true },
  { name: 'apple-touch-icon.png', size: 180, mode: 'bleed' },
  { name: 'icon-192.png', size: 192, mode: 'tile' },
  { name: 'icon-512.png', size: 512, mode: 'tile' },
  { name: 'icon-maskable-512.png', size: 512, mode: 'maskable' },
];

// 1) Rasterize the SVG at each size in a canvas and dump the PNGs as data URLs.
const genHtml = `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre><script>
(async () => {
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(${JSON.stringify(svg)});
  await img.decode();
  const specs = ${JSON.stringify(SPECS)};
  const out = {};
  for (const s of specs) {
    const c = document.createElement('canvas'); c.width = c.height = s.size;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    if (s.mode === 'tile') ctx.drawImage(img, 0, 0, s.size, s.size);
    else {
      ctx.fillStyle = '${BRAND}'; ctx.fillRect(0, 0, s.size, s.size);
      const scale = s.mode === 'maskable' ? 0.78 : 0.92; const d = s.size * scale; const o = (s.size - d) / 2;
      ctx.drawImage(img, o, o, d, d);
    }
    out[s.name] = c.toDataURL('image/png');
  }
  document.getElementById('out').textContent = JSON.stringify(out);
})();
</script>`;
const genFile = path.join(tmp, 'gen.html');
fs.writeFileSync(genFile, genHtml);
const dom = chrome(['--virtual-time-budget=5000', '--dump-dom', pathToFileURL(genFile).href]);
const json = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)?.[1];
if (!json) throw new Error('Chrome did not produce icon data');
const images = JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const buffers = {};
for (const s of SPECS) {
  const buf = Buffer.from(images[s.name].split(',')[1], 'base64');
  buffers[s.name] = buf;
  if (!s.temp) fs.writeFileSync(path.join(PUBLIC, s.name), buf);
}

// 2) favicon.ico with embedded PNGs (16, 32, 48).
const icoEntries = [16, 32, 48].map((size) => ({ size, data: buffers[`favicon-${size}x${size}.png`] }));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(icoEntries.length, 4);
let offset = 6 + 16 * icoEntries.length;
const dir = icoEntries.map(({ size, data }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), Buffer.concat([header, ...dir, ...icoEntries.map((e) => e.data)]));

// 3) Open Graph image (1200×630).
const markSvg = svg.replace('width="64" height="64"', 'width="56" height="56"');
const ogHtml = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;background:#1a36d9;background:radial-gradient(circle at 85% 10%,#5c8dfd 0,transparent 45%),radial-gradient(circle at 0% 100%,rgba(245,158,11,.35) 0,transparent 40%),linear-gradient(135deg,#2148ed,#1c2eb0);color:#fff;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);background-size:48px 48px}
.left{position:absolute;left:72px;top:64px;width:600px}
.brand{display:flex;align-items:center;gap:14px;font-family:'Plus Jakarta Sans';font-weight:800;font-size:30px;letter-spacing:-.3px}
.brand svg{border-radius:14px;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
h1{font-family:'Plus Jakarta Sans';font-weight:800;font-size:56px;line-height:1.06;letter-spacing:-1px;margin-top:40px}
h1 span{color:#fcd34d}
p{margin-top:22px;font-size:22px;line-height:1.45;color:#dae6ff;max-width:540px}
.url{position:absolute;left:72px;bottom:44px;font-size:22px;font-weight:600;color:#fff;display:flex;gap:10px;align-items:center}
.url i{display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b}
.paper{position:absolute;right:64px;top:92px;width:420px;background:#fff;border-radius:18px;padding:26px;color:#1e293b;transform:rotate(3deg);box-shadow:0 40px 80px -30px rgba(10,15,60,.7)}
.row{display:flex;justify-content:space-between;align-items:center}
.co{font-weight:700;font-size:17px}.muted{color:#64748b;font-size:12px}
.tag{color:#2148ed;font-weight:800;font-size:12px;letter-spacing:2.5px}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}
td{padding:9px 0;border-bottom:1px solid #eef2f7}td:last-child{text-align:right;font-weight:700}
.tot{margin-top:14px;margin-left:auto;width:220px;font-size:13px;color:#475569}
.tot div{display:flex;justify-content:space-between;padding:3px 0}
.due{margin-top:6px;background:#2148ed;color:#fff;border-radius:8px;padding:9px 10px!important;font-weight:800}
.badge{position:absolute;right:300px;bottom:70px;background:#fff;color:#065f46;border-radius:14px;padding:12px 16px;font-weight:700;font-size:15px;display:flex;gap:10px;align-items:center;box-shadow:0 20px 40px -20px rgba(0,0,0,.5)}
.badge b{display:inline-flex;width:26px;height:26px;border-radius:50%;background:#10b981;color:#fff;align-items:center;justify-content:center;font-size:15px}
</style></head><body><div class="grid"></div>
<div class="left">
  <div class="brand">${markSvg}<span>ContractorDocs</span></div>
  <h1>Professional contractor paperwork <span>in minutes</span></h1>
  <p>Invoices, estimates, change orders and daily reports. E-signatures, a client portal and Gmail sending.</p>
</div>
<div class="url"><i></i>www.contractordocs.app</div>
<div class="paper">
  <div class="row"><div><div class="co">Northline Renovations</div><div class="muted">Maple St. kitchen remodel</div></div><div style="text-align:right"><div class="tag">INVOICE</div><div style="font-weight:800">#1042</div></div></div>
  <table>
    <tr><td>Demolition &amp; haul-away</td><td>$1,200.00</td></tr>
    <tr><td>Cabinet installation</td><td>$1,530.00</td></tr>
    <tr><td>Quartz countertop</td><td>$3,150.00</td></tr>
    <tr><td>Under-cabinet lighting</td><td>$640.00</td></tr>
  </table>
  <div class="tot"><div><span>Subtotal</span><span>$6,520.00</span></div><div><span>Tax (8%)</span><span>$521.60</span></div><div class="due"><span>Balance due</span><span>$5,041.60</span></div></div>
</div>
<div class="badge"><b>&#10003;</b>Estimate approved &amp; signed</div>
</body></html>`;
const ogFile = path.join(tmp, 'og.html');
fs.writeFileSync(ogFile, ogHtml);
chrome(['--virtual-time-budget=8000', '--window-size=1200,630', `--screenshot=${path.join(PUBLIC, 'og-image.png')}`, pathToFileURL(ogFile).href]);

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};
for (const f of ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og-image.png']) {
  console.log(`${f.padEnd(24)} ${pngSize(path.join(PUBLIC, f))}`);
}
console.log(`favicon.ico              ${fs.statSync(path.join(PUBLIC, 'favicon.ico')).size} bytes (16, 32, 48)`);
fs.rmSync(tmp, { recursive: true, force: true });
