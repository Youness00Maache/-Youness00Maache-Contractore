// Tiny static file server with CORS and byte ranges (so videos can seek), for local checks of the media and the player.
//   node scripts/serve-media.mjs <folder> [port=3999]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 3999);
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.vtt': 'text/vtt', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  const file = path.resolve(dir, rel || 'index.html');
  if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404, { 'access-control-allow-origin': '*' }); return res.end('not found'); }
  const size = fs.statSync(file).size;
  const head = { 'access-control-allow-origin': '*', 'content-type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'accept-ranges': 'bytes' };
  const m = String(req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[2] && m[1] ? Math.min(size - 1, Number(m[2])) : size - 1;
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'content-length': size });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${dir} on http://127.0.0.1:${port}`));
