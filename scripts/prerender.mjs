/**
 * Prerenders every marketing route and blog post to static HTML for SEO (Vercel serves files before rewrites).
 *
 * Inputs : dist/index.html (client build) + dist-ssr/entry-server.js (vite build --ssr pages/entry-server.tsx)
 * Outputs: dist/index.html (home), dist/<route>/index.html, dist/app.html (empty SPA shell for app routes, noindex),
 *          dist/sitemap.xml. Removes dist-ssr afterwards (set KEEP_SSR=1 to keep it).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SSR_DIR = path.join(ROOT, 'dist-ssr');
const SEO_BLOCK = /<!--SEO:START-->[\s\S]*?<!--SEO:END-->/;
const ROOT_DIV = '<div id="root"></div>';

const fail = (msg) => {
  console.error(`[prerender] ${msg}`);
  process.exit(1);
};

const templatePath = path.join(DIST, 'index.html');
if (!fs.existsSync(templatePath)) fail('dist/index.html not found. Run `vite build` first.');
const entryPath = path.join(SSR_DIR, 'entry-server.js');
if (!fs.existsSync(entryPath)) fail('dist-ssr/entry-server.js not found. Run `vite build --ssr pages/entry-server.tsx --outDir dist-ssr` first.');

let template = fs.readFileSync(templatePath, 'utf8');
// If dist/index.html was already prerendered (re-run without a fresh client build), start from the app shell.
const shellPath = path.join(DIST, 'app.html');
if (template.includes('data-prerendered=') && fs.existsSync(shellPath)) {
  template = fs.readFileSync(shellPath, 'utf8').replace('<meta name="robots" content="noindex, nofollow">', '');
}
if (!SEO_BLOCK.test(template)) fail('SEO markers <!--SEO:START--> / <!--SEO:END--> missing in index.html');
if (!template.includes(ROOT_DIV)) fail(`"${ROOT_DIV}" missing in index.html`);

const ssr = await import(pathToFileURL(entryPath).href);
const site = ssr.site;
const routes = ssr.routes();

// 1) SPA shell for app routes (vercel.json rewrites unknown paths here). Never indexed.
const appHead = [
  '<title>ContractorDocs</title>',
  '<meta name="robots" content="noindex, nofollow">',
  `<meta name="description" content="${site.description.replace(/"/g, '&quot;')}">`,
].join('\n  ');
const appShell = template.replace(SEO_BLOCK, `<!--SEO:START-->\n  ${appHead}\n  <!--SEO:END-->`);
fs.writeFileSync(shellPath, appShell);

// 2) Prerendered pages.
const written = [];
const titles = new Map();
for (const route of routes) {
  const { html, head, seo } = await ssr.render(route);
  if (!html || html.length < 500) fail(`Rendered HTML for ${route} looks empty`);
  if (titles.has(seo.title)) fail(`Duplicate <title> "${seo.title}" on ${route} and ${titles.get(seo.title)}`);
  titles.set(seo.title, route);
  const page = template
    .replace(SEO_BLOCK, `<!--SEO:START-->\n  ${head}\n  <!--SEO:END-->`)
    .replace(ROOT_DIV, `<div id="root" data-prerendered="${route}">${html}</div>`);
  const outFile = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, ...route.split('/').filter(Boolean), 'index.html');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, page);
  written.push({ route, lastmod: seo.lastmod, file: path.relative(ROOT, outFile) });
}

// 3) sitemap.xml (absolute https://www.contractordocs.app URLs).
const priority = (r) => (r === '/' ? '1.0' : ['/pricing', '/features', '/templates', '/invoice-generator', '/estimate-generator'].includes(r) ? '0.9' : r.startsWith('/blog/') ? '0.7' : r === '/blog' ? '0.8' : '0.5');
const urls = written
  .map(({ route, lastmod }) => {
    const loc = route === '/' ? `${site.url}/` : `${site.url}${route}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority(route)}</priority>\n  </url>`;
  })
  .join('\n');
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

// 4) CSP: every inline <script> that executes must be allow-listed by hash in vercel.json.
const inlineScripts = [...appShell.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashes = inlineScripts.map((s) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`);
const vercelPath = path.join(ROOT, 'vercel.json');
if (fs.existsSync(vercelPath)) {
  const vercel = fs.readFileSync(vercelPath, 'utf8');
  const missing = hashes.filter((h) => !vercel.includes(h));
  if (missing.length) {
    console.warn(`[prerender] WARNING: vercel.json CSP is missing inline-script hash(es): ${missing.join(' ')}`);
    console.warn('[prerender] Update the script-src in vercel.json or the boot script will be blocked in production.');
  }
}

if (!process.env.KEEP_SSR) fs.rmSync(SSR_DIR, { recursive: true, force: true });

console.log(`[prerender] wrote ${written.length} pages + app.html + sitemap.xml (${written.length} URLs)`);
for (const w of written) console.log(`  ${w.route.padEnd(52)} ${w.file}`);
