/**
 * Asserts the prerendered marketing site is SEO-complete. Run after `npm run build`:  npm run seo:check
 * Exits 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.contractordocs.app';
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const read = (p) => fs.readFileSync(p, 'utf8');

const STATIC_ROUTES = ['/', '/features', '/pricing', '/templates', '/invoice-generator', '/estimate-generator', '/blog', '/about', '/contact', '/privacy', '/terms', '/security', '/help'];
const registry = read(path.join(ROOT, 'content/blog/registry.ts'));
const slugs = [...registry.slice(registry.indexOf('export const BLOG_POSTS')).matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]);
const ROUTES = [...STATIC_ROUTES, ...slugs.map((s) => `/blog/${s}`)];
const APP_PREFIXES = ['/auth/', '/dashboard', '/jobs', '/settings', '/update-password'];
const fileFor = (route) => (route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, ...route.split('/').filter(Boolean), 'index.html'));

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const meta = (html, attr, key) => {
  const re = new RegExp(`<meta ${attr}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" content="([^"]*)"`, 'i');
  return html.match(re)?.[1];
};
const textOf = (html) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

// ---------------------------------------------------------------- pages
const titles = new Map();
const descriptions = new Map();
const publicFiles = new Set(fs.readdirSync(path.join(ROOT, 'public')).map((f) => `/${f}`));
const rows = [];
let template;

for (const route of ROUTES) {
  const file = fileFor(route);
  if (!fs.existsSync(file)) { fail(`${route}: missing ${path.relative(ROOT, file)}`); continue; }
  const html = read(file);
  template ||= html;
  const where = route;
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '');
  const titleCount = (html.match(/<title>/g) || []).length;
  const desc = decode(meta(html, 'name', 'description') || '');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expectedCanonical = route === '/' ? `${SITE}/` : `${SITE}${route}`;

  if (!title) fail(`${where}: no <title>`);
  if (titleCount !== 1) fail(`${where}: ${titleCount} <title> tags`);
  if (title.length > 75) warnings.push(`${where}: title is ${title.length} chars`);
  if (titles.has(title)) fail(`${where}: duplicate title with ${titles.get(title)}: "${title}"`);
  titles.set(title, route);
  if (!desc) fail(`${where}: no meta description`);
  else if (desc.length < 70 || desc.length > 170) fail(`${where}: description length ${desc.length} (want 70–170)`);
  if (descriptions.has(desc)) fail(`${where}: duplicate description with ${descriptions.get(desc)}`);
  descriptions.set(desc, route);
  if (canonical !== expectedCanonical) fail(`${where}: canonical ${canonical} != ${expectedCanonical}`);
  for (const [attr, key] of [['property', 'og:title'], ['property', 'og:description'], ['property', 'og:url'], ['property', 'og:image'], ['property', 'og:type'], ['name', 'twitter:card'], ['name', 'twitter:image']]) {
    if (!meta(html, attr, key)) fail(`${where}: missing ${key}`);
  }
  if (meta(html, 'property', 'og:url') !== expectedCanonical) fail(`${where}: og:url mismatch`);
  if (/noindex/.test(meta(html, 'name', 'robots') || '')) fail(`${where}: page is noindex`);
  if ((html.match(/name="google-site-verification"/g) || []).length < 2) fail(`${where}: google-site-verification meta tags missing`);
  if (/localhost|127\.0\.0\.1/.test(html.replace(/<script type="module"[^>]*><\/script>/g, ''))) fail(`${where}: contains localhost URL`);

  // Rendered content
  const rootMatch = html.match(/<div id="root" data-prerendered="([^"]+)">([\s\S]*)<\/div>\s*<div id="pdf-render-content"/);
  if (!rootMatch) { fail(`${where}: #root not prerendered`); continue; }
  if (rootMatch[1] !== route) fail(`${where}: data-prerendered="${rootMatch[1]}"`);
  const body = rootMatch[2];
  const h1s = (body.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) fail(`${where}: ${h1s} <h1> elements`);
  const words = textOf(body).split(' ').length;
  if (words < 250) fail(`${where}: only ${words} words of rendered text`);
  if (route.startsWith('/blog/') && words < 1500) fail(`${where}: blog post renders only ${words} words (body + chrome)`);
  for (const img of body.match(/<img [^>]*>/g) || []) if (!/\balt="/.test(img)) fail(`${where}: <img> without alt`);

  // JSON-LD
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const types = new Set();
  for (const b of ldBlocks) {
    try {
      const data = JSON.parse(b[1]);
      for (const node of data['@graph'] || [data]) types.add(node['@type']);
      if (route === '/pricing' || route === '/') {
        const app = (data['@graph'] || []).find((n) => n['@type'] === 'SoftwareApplication');
        if (!app?.offers?.length) fail(`${where}: SoftwareApplication without offers`);
      }
    } catch (e) {
      fail(`${where}: invalid JSON-LD (${e.message})`);
    }
  }
  const need = route === '/' ? ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']
    : route === '/pricing' ? ['SoftwareApplication', 'FAQPage', 'BreadcrumbList']
    : route.startsWith('/blog/') ? ['BlogPosting', 'BreadcrumbList', 'FAQPage']
    : ['/invoice-generator', '/estimate-generator'].includes(route) ? ['FAQPage', 'BreadcrumbList']
    : ['BreadcrumbList'];
  for (const t of need) if (!types.has(t)) fail(`${where}: JSON-LD missing ${t}`);

  // Internal links resolve
  for (const m of body.matchAll(/href="(\/[^"#?]*)/g)) {
    const target = m[1].replace(/\/$/, '') || '/';
    if (ROUTES.includes(target) || publicFiles.has(target) || APP_PREFIXES.some((p) => target.startsWith(p))) continue;
    fail(`${where}: broken internal link ${m[1]}`);
  }
  rows.push({ route, title, words, ld: [...types].join(',') });
}

// ---------------------------------------------------------------- app shell
const shellPath = path.join(DIST, 'app.html');
if (!fs.existsSync(shellPath)) fail('dist/app.html (SPA shell) missing');
else {
  const shell = read(shellPath);
  if (!/<meta name="robots" content="noindex/.test(shell)) fail('app.html is not noindex');
  if (!shell.includes('<div id="root"></div>')) fail('app.html #root is not empty');
}

// ---------------------------------------------------------------- landing bundle stays light
const home = read(path.join(DIST, 'index.html'));
const preloads = [...home.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
for (const p of preloads) if (/\/(supabase|pdf|ocr|scanner|calendar|App)-/.test(p)) fail(`landing page preloads heavy chunk ${p}`);

// ---------------------------------------------------------------- sitemap
const sitemapPath = path.join(DIST, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) fail('dist/sitemap.xml missing');
else {
  const xml = read(sitemapPath);
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) fail('sitemap: missing XML declaration');
  if (!/<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml) || !xml.trim().endsWith('</urlset>')) fail('sitemap: bad <urlset>');
  const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  const locs = urls.map((u) => u[1]);
  if (new Set(locs).size !== locs.length) fail('sitemap: duplicate URLs');
  for (const [, loc, lastmod] of urls) {
    if (!loc.startsWith(`${SITE}/`)) fail(`sitemap: non-absolute or wrong host ${loc}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) fail(`sitemap: bad lastmod ${lastmod}`);
  }
  for (const route of ROUTES) {
    const loc = route === '/' ? `${SITE}/` : `${SITE}${route}`;
    if (!locs.includes(loc)) fail(`sitemap: missing ${loc}`);
  }
  if ((xml.match(/<url>/g) || []).length !== ROUTES.length) fail(`sitemap: ${(xml.match(/<url>/g) || []).length} URLs, expected ${ROUTES.length}`);
}

// ---------------------------------------------------------------- robots.txt
const robotsPath = path.join(DIST, 'robots.txt');
if (!fs.existsSync(robotsPath)) fail('dist/robots.txt missing');
else {
  const robots = read(robotsPath);
  if (!/^User-agent: \*/m.test(robots)) fail('robots: no "User-agent: *"');
  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots: missing Sitemap line');
  const disallows = [...robots.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1].trim());
  for (const p of ['/dashboard', '/auth/', '/settings', '/jobs']) if (!disallows.includes(p)) fail(`robots: should disallow ${p}`);
  for (const route of ROUTES) {
    if (route === '/') continue;
    for (const d of disallows) if (!d.includes('*') && route.startsWith(d)) fail(`robots: ${d} blocks public page ${route}`);
  }
}

// ---------------------------------------------------------------- verification + static assets
const verification = 'google58a3bf2c7e0ed45b.html';
if (!fs.existsSync(path.join(DIST, verification))) fail(`${verification} missing from dist`);
else if (read(path.join(DIST, verification)).trim() !== `google-site-verification: ${verification}`) fail(`${verification} content changed`);
for (const f of ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'og-image.png', 'logo.png', 'manifest.webmanifest']) {
  if (!fs.existsSync(path.join(DIST, f))) fail(`dist/${f} missing`);
}
try {
  const manifest = JSON.parse(read(path.join(DIST, 'manifest.webmanifest')));
  if (manifest.start_url !== '/dashboard') fail('manifest start_url should be /dashboard');
  for (const icon of manifest.icons) if (!fs.existsSync(path.join(DIST, icon.src))) fail(`manifest icon missing: ${icon.src}`);
} catch (e) {
  fail(`manifest invalid: ${e.message}`);
}

// ---------------------------------------------------------------- vercel.json
try {
  const vercel = JSON.parse(read(path.join(ROOT, 'vercel.json')));
  const csp = vercel.headers?.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value || '';
  if (!csp) fail('vercel.json: no Content-Security-Policy');
  for (const key of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) {
    if (!vercel.headers?.some((h) => h.headers.some((x) => x.key === key))) fail(`vercel.json: missing ${key}`);
  }
  const inline = [...home.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const s of inline) {
    const h = `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;
    if (!csp.includes(h)) fail(`vercel.json: CSP script-src missing ${h} for the inline boot script`);
  }
  const rewrite = vercel.rewrites?.find((r) => r.destination === '/app.html');
  if (!rewrite) fail('vercel.json: SPA rewrite to /app.html missing');
  if (vercel.cleanUrls) warnings.push('vercel.json: cleanUrls redirects /google…html; Google HTML-file verification may fail');
  if (vercel.trailingSlash !== false) fail('vercel.json: trailingSlash should be false');
} catch (e) {
  fail(`vercel.json invalid: ${e.message}`);
}

// ---------------------------------------------------------------- report
console.log(`Checked ${rows.length} prerendered pages:`);
for (const r of rows) console.log(`  ${r.route.padEnd(50)} ${String(r.words).padStart(5)} words  [${r.ld}]`);
for (const w of warnings) console.log(`WARN  ${w}`);
if (errors.length) {
  for (const e of errors) console.log(`FAIL  ${e}`);
  console.log(`\nSEO check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`\nSEO check passed: ${rows.length} pages, unique titles/descriptions, canonical + OG + JSON-LD, sitemap (${ROUTES.length} URLs), robots.txt, CSP hash, verification file.`);
