/**
 * Minimal static server that mimics Vercel's routing for the built site (for local checks/screenshots):
 * existing file → directory index (/pricing → dist/pricing/index.html) → rewrite to /app.html.
 * Usage: node scripts/seo-serve.mjs [port=4173]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const PORT = Number(process.argv[2] || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

http
  .createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.length > 1 && pathname.endsWith('/')) {
      res.writeHead(308, { Location: pathname.replace(/\/+$/, '') + url.search });
      return res.end();
    }
    const direct = path.join(DIST, pathname);
    if (!direct.startsWith(DIST)) { res.writeHead(400); return res.end(); }
    let file = isFile(direct) ? direct : isFile(path.join(direct, 'index.html')) ? path.join(direct, 'index.html') : null;
    let status = 200;
    if (!file) {
      if (pathname.startsWith('/assets/')) { res.writeHead(404); return res.end('Not found'); }
      file = path.join(DIST, 'app.html');
    }
    if (!isFile(file)) { res.writeHead(404); return res.end('Not built yet: run npm run build'); }
    res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  })
  .listen(PORT, () => console.log(`Serving dist on http://localhost:${PORT} (Vercel-like routing)`));
