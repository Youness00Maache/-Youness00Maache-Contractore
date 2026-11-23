// Phone-width audit of the app against the fake demo backend (needs launch.json "fake-backend" + "contractordocs-fake", port 3012).
// usage: node docs/work/mobile-audit/mobile-audit.mjs <outDir> [width=390] [name,name...]   (SHOTS=0 skips screenshots)
// Reports per page: sideways overflow + offenders, tap targets under 30 px, text under 11 px, content hidden under the tab bar.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const REPO = 'C:/Users/JAAF/Downloads/-Youness00Maache-Contractore-c2ee2b2908a94c029486956a75db59d142a2ee41';
const require = createRequire(REPO + '/docs/work/tutorial-video/package.json');
const { chromium } = require('playwright-core');
const { DEMO_USER } = await import('file:///' + REPO + '/docs/work/tutorial-video/fake-backend/seed.mjs');

const out = process.argv[2] || './audit';
const width = Number(process.argv[3] || 390);
const filter = process.argv[4] || '';
const shots = process.env.SHOTS !== '0';
fs.mkdirSync(out, { recursive: true });

const J1 = '914b2e98-b828-4b5b-8fd5-72d04509ec80';
const J2 = 'a7d3e379-b2d0-4f32-a61c-b0226f8121df';
const ROUTES = [
  ['dashboard', '/dashboard'], ['clients', '/clients'], ['messages', '/communication'], ['forum', '/forum'],
  ['leads', '/leads'], ['pipeline', '/pipeline'], ['service-plans', '/service-plans'], ['papers', '/papers'],
  ['inventory', '/inventory'], ['pricebook', '/pricebook'], ['calendar', '/calendar'], ['crew', '/crew'],
  ['analytics', '/analytics'], ['calculator', '/calculator'], ['settings', '/settings'], ['profile', '/profile'],
  ['help', '/tutorials'], ['job1', `/jobs/${J1}`], ['job2', `/jobs/${J2}`], ['select-doc', `/jobs/${J1}/select-doc`],
  ['new-job', '/jobs/new'],
  ['estimate', `/jobs/${J1}/forms/estimate/b05d6b6e-e7aa-4870-8ce2-69f5d54fd028`],
  ['invoice', `/jobs/${J1}/forms/invoice/57078455-3efe-4137-961d-e07f28423953`],
  ['change-order', `/jobs/${J1}/forms/changeorder/9fc5a404-eb7d-4350-8d48-51762a4e4ec7`],
  ['new-workorder', `/jobs/${J1}/forms/workorder`], ['new-dailyreport', `/jobs/${J1}/forms/dailyjobreport`],
  ['new-timesheet', `/jobs/${J1}/forms/timesheet`], ['new-receipt', `/jobs/${J1}/forms/receipt`],
  ['new-note', `/jobs/${J1}/forms/note`], ['new-warranty', `/jobs/${J1}/forms/warranty`],
  ['new-po', `/jobs/${J1}/forms/purchaseorder`], ['new-expense', `/jobs/${J1}/forms/expenselog`],
  ['new-material', `/jobs/${J1}/forms/materiallog`],
].filter(([n]) => !filter || filter.split(',').includes(n));

const now = Math.floor(Date.now() / 1000);
const session = { access_token: 'demo-access', token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'demo-refresh', user: DEMO_USER };
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York' });
await context.addInitScript(({ s }) => { try { localStorage.setItem('contractordocs-auth', s); localStorage.setItem('theme', 'dark'); localStorage.setItem('cd_tour_done', '1'); } catch {} }, { s: JSON.stringify(session) });
const page = await context.newPage();
const report = [];
for (const [name, url] of ROUTES) {
  const errors = [];
  const onErr = (e) => errors.push(String(e.message || e).slice(0, 160));
  page.on('pageerror', onErr);
  await page.goto('http://localhost:3012' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => {
    const W = innerWidth;
    const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(/\s+/).slice(0, 6).join('.')} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
    const all = [...document.querySelectorAll('body *')];
    const over = [];
    for (const el of all) { if (!vis(el)) continue; const b = el.getBoundingClientRect(); if ((b.right > W + 1 || b.left < -1) && !clipped(el) && getComputedStyle(el).position !== 'fixed') over.push([Math.round(b.right - W), desc(el)]); }
    // deepest offenders first: drop ancestors of other offenders
    const small = [];
    for (const el of document.querySelectorAll('button, a[href], [role=button], input, select')) { if (!vis(el)) continue; const b = el.getBoundingClientRect(); if ((b.height < 30 || b.width < 30) && el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'hidden') small.push(`${Math.round(b.width)}x${Math.round(b.height)} ${desc(el)}`); }
    let tiny = 0; const tinyEx = [];
    for (const el of all) { if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue; if (!vis(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11) { tiny++; if (tinyEx.length < 4) tinyEx.push(`${fs}px ${desc(el)}`); } }
    const dock = document.querySelector('nav[aria-label="Main"].fixed');
    return { scrollW: document.documentElement.scrollWidth, W, over: over.slice(0, 10), overCount: over.length, small: small.slice(0, 12), smallCount: small.length, tiny, tinyEx, dock: !!dock && getComputedStyle(dock).display !== 'none', h1: (document.querySelector('h1')?.innerText || '').slice(0, 50), docH: document.documentElement.scrollHeight };
  });
  // content hidden under the dock: scroll to the bottom and check what is under the bar
  r.underDock = await page.evaluate(async () => {
    const dock = document.querySelector('nav[aria-label="Main"].fixed');
    if (!dock || getComputedStyle(dock).display === 'none') return null;
    scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 300));
    const top = dock.getBoundingClientRect().top;
    // the lowest interactive/text element that is not part of a fixed layer
    let lowest = 0; let what = '';
    for (const el of document.querySelectorAll('main *, #root *')) {
      if (dock.contains(el)) continue; let fixed = false; for (let p = el; p; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; } } if (fixed) continue;
      const b = el.getBoundingClientRect(); if (b.height === 0 || b.width === 0) continue;
      if (b.bottom > lowest && (el.children.length === 0)) { lowest = b.bottom; what = (el.innerText || el.tagName).slice(0, 30); }
    }
    return { dockTop: Math.round(top), lowestContent: Math.round(lowest), hidden: lowest > top + 1, what };
  });
  r.errors = errors; r.name = name; r.url = url; r.finalUrl = page.url().replace('http://localhost:3012', '');
  page.off('pageerror', onErr);
  if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, `${name}.jpg`), type: 'jpeg', quality: 55, fullPage: r.docH < 9000 }); }
  report.push(r);
  console.log(`${name.padEnd(16)} ${r.finalUrl.slice(0, 30).padEnd(31)} overflowX=${r.scrollW - r.W} offenders=${r.overCount} small=${r.smallCount} tiny=${r.tiny} dock=${r.dock}${r.underDock?.hidden ? ' HIDDEN-UNDER-DOCK(' + r.underDock.what + ')' : ''}${errors.length ? ' ERR=' + errors.length : ''}`);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
