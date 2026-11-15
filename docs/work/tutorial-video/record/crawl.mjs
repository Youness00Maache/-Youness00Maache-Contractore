// Visits every main screen against the demo backend and prints a compact health table:
// which screens render, console/page errors, failed requests, and which tables/RPCs/functions were asked for.
//   node record/crawl.mjs [route ...]
import { launch, APP_URL, sleep } from './lib.mjs';

const routes = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/dashboard', '/clients', '/communication', '/calendar', '/pipeline', '/leads', '/crew', '/papers', '/service-plans',
  '/inventory', '/pricebook', '/analytics', '/calculator', '/settings', '/tutorials', '/forum', '/profile',
];
const { browser, page } = await launch();
let current = '';
const asked = new Map(); // route -> Set of "table|rpc|fn"
const errors = new Map();
const note = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
page.on('request', (r) => {
  const u = r.url();
  const m = u.match(/127\.0\.0\.1:54329\/(rest\/v1\/rpc\/|rest\/v1\/|functions\/v1\/|storage\/v1\/)([A-Za-z0-9_\-/]+)/);
  if (m) note(asked, current, (m[1].startsWith('rest/v1/rpc') ? 'rpc:' : m[1].startsWith('functions') ? 'fn:' : m[1].startsWith('storage') ? 'storage:' : '') + m[2].split('/')[0]);
});
page.on('console', (m) => { if (m.type() === 'error') note(errors, current, m.text().slice(0, 110)); });
page.on('pageerror', (e) => note(errors, current, 'PAGEERROR ' + String(e).slice(0, 110)));

for (const route of routes) {
  current = route;
  await page.goto(APP_URL + route, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await sleep(2600);
  const info = await page.evaluate(() => ({ h: (document.querySelector('h1,h2')?.textContent || '').trim().slice(0, 60), len: document.body.innerText.length, path: location.pathname }));
  console.log(`${route.padEnd(16)} -> ${info.path.padEnd(16)} text ${String(info.len).padStart(5)}  "${info.h}"`);
  console.log(`    asked: ${[...(asked.get(route) || [])].join(', ') || '-'}`);
  if (errors.get(route)) for (const e of errors.get(route)) console.log('    ERR ' + e);
}
await browser.close();
