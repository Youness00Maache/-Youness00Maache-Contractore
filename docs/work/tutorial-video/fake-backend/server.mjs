// A tiny in-memory stand-in for Supabase (auth + PostgREST + functions + storage), used ONLY to record the tutorial
// video against the REAL app with DEMO data. No real account, no network, no secrets.
//
//   node fake-backend/server.mjs [port]        (default 54329)
//
// The app is started with VITE_SUPABASE_URL=http://127.0.0.1:54329 and a made-up anon key (see record/run-spike.mjs).
// Unknown tables read as empty and accept writes, unknown RPCs return null, unknown functions return {} so a screen
// that asks for something we did not seed simply shows its empty state instead of breaking.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { seed, DEMO_USER, rpcHandlers, functionHandlers, day, iso, id as newId } from './seed.mjs';

const PORT = Number(process.argv[2] || process.env.FAKE_BACKEND_PORT || 54329);
// per-chapter demo data: fake-backend/demo/*.mjs, each `export default ({ tables, uid, day, iso, id }) => {...}` (adds rows) and
// optional `export const rpc = { name: (args, tables) => result }`, `export const functions = { name: async (args, tables) => result }`
const demoDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo');
const demo = [];
if (fs.existsSync(demoDir)) for (const f of fs.readdirSync(demoDir).filter((x) => x.endsWith('.mjs')).sort()) demo.push(await import(pathToFileURL(path.join(demoDir, f)).href));
// The same rpc / function name may be answered by several demo modules (e.g. 'ai-assistant', 'gmail'): they are asked in file order, the
// seed handler last; the first answer that is not undefined / null / {} wins, so a handler simply returns undefined for what is not its own.
const chain = (base, key) => {
  const lists = {};
  for (const m of demo) for (const [k, h] of Object.entries(m[key] || {})) (lists[k] ||= []).push(h);
  for (const [k, h] of Object.entries(base)) (lists[k] ||= []).push(h);
  return Object.fromEntries(Object.entries(lists).map(([k, hs]) => [k, async (args, tables) => {
    for (const h of hs) { const r = await h(args, tables); if (r !== undefined && r !== null && !(typeof r === 'object' && !Array.isArray(r) && !Object.keys(r).length)) return r; }
    return undefined;
  }]));
};
// A module may export `insertHooks = { table_name: (row, tables) => row }`: it completes a NEW row the way a database trigger would (token, snapshot columns...).
const insertHooks = Object.assign({}, ...demo.map((m) => m.insertHooks || {}));
// A module may export `patchHooks = { table_name: (row, patch, tables) => void }`: it completes an UPDATED row the way a database trigger would
// (paid totals, status times...). Several modules may hook the same table: all of them run, in file order.
const patchHooks = {};
for (const m of demo) for (const [k, h] of Object.entries(m.patchHooks || {})) (patchHooks[k] ||= []).push(h);
const rpcAll = chain(rpcHandlers, 'rpc');
const fnAll = chain(functionHandlers, 'functions');
// `chapter` ("01", "30" ...) is only known when the caller says so: GET /__reset?chapter=NN. A demo module that needs a special
// starting state for one chapter (e.g. a brand-new empty account) checks `chapter` in its default function; without it every
// module builds the normal demo business.
// A module may also `export const finalize = (ctx) => {...}`: it runs after EVERY module's default function (so it can empty or
// reshape what the others added, without making their `tables.get('jobs').find(...)` lookups fail).
const build = (chapter) => {
  const t = new Map(Object.entries(seed()));
  const ctx = { tables: t, uid: DEMO_USER.id, day, iso, id: newId, chapter };
  for (const m of demo) if (typeof m.default === 'function') m.default(ctx);
  for (const m of demo) if (typeof m.finalize === 'function') m.finalize(ctx);
  return t;
};
const tables = build();
const log = (...a) => { if (process.env.FAKE_BACKEND_LOG) console.log(...a); };

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'content-range, content-type',
};
const send = (res, status, body, extra = {}) => {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { ...cors, 'content-type': 'application/json', ...extra });
  res.end(text);
};
const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});

// ---------- PostgREST filters ----------
const getPath = (row, col) => {
  // data->>field, data->field, data->a->>b
  const parts = col.split('->');
  let v = row[parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const key = parts[i].replace(/^>/, '');
    v = v == null ? undefined : v[key];
  }
  return v;
};
const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};
const coerce = (cell, raw) => (typeof cell === 'number' ? Number(raw) : typeof cell === 'boolean' ? raw === 'true' : raw);
const likeToRe = (p, ci) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', ci ? 'i' : '');
const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; };
const parseList = (s) => splitTop(s.replace(/^\(|\)$/g, '')).map((x) => x.replace(/^"|"$/g, ''));

function test(row, col, expr) {
  let negate = false;
  let [op, ...rest] = [expr.slice(0, expr.indexOf('.')), expr.slice(expr.indexOf('.') + 1)];
  if (op === 'not') { negate = true; [op, ...rest] = [rest[0].slice(0, rest[0].indexOf('.')), rest[0].slice(rest[0].indexOf('.') + 1)]; }
  let val = rest.join('.');
  if (op !== 'in' && /^".*"$/s.test(val)) val = val.slice(1, -1).replace(/\\(["\\])/g, '$1'); // a quoted value: eq."Jo, Inc."
  const cell = getPath(row, col);
  let ok;
  switch (op) {
    case 'eq': ok = cell != null && String(cell) === val; break;
    case 'neq': ok = cell == null || String(cell) !== val; break;
    case 'gt': ok = cmp(cell, coerce(cell, val)) > 0; break;
    case 'gte': ok = cmp(cell, coerce(cell, val)) >= 0; break;
    case 'lt': ok = cell != null && cmp(cell, coerce(cell, val)) < 0; break;
    case 'lte': ok = cell != null && cmp(cell, coerce(cell, val)) <= 0; break;
    case 'like': ok = cell != null && likeToRe(val, false).test(String(cell)); break;
    case 'ilike': ok = cell != null && likeToRe(val, true).test(String(cell)); break;
    case 'is': ok = val === 'null' ? cell == null : val === 'true' ? cell === true : val === 'false' ? cell === false : false; break;
    case 'in': ok = parseList(val).includes(String(cell)); break;
    case 'cs': { try { const need = JSON.parse(val.replace(/^\{/, '[').replace(/\}$/, ']')); const arr = Array.isArray(cell) ? cell : []; ok = need.every((n) => arr.some((x) => JSON.stringify(x) === JSON.stringify(n))); } catch { ok = false; } break; }
    default: ok = true;
  }
  return negate ? !ok : ok;
}
function orTest(row, group) {
  return splitTop(group.replace(/^\(|\)$/g, '')).some((part) => {
    // a nested group: and(a.eq.1,b.is.null)  /  or(...)
    const nested = part.match(/^(and|or)\((.*)\)$/s);
    if (nested) {
      const items = splitTop(nested[2]);
      const one = (p) => { const mm = p.match(/^([^.]+)\.(.+)$/); return mm ? test(row, mm[1], mm[2]) : false; };
      return nested[1] === 'and' ? items.every(one) : items.some(one);
    }
    const m = part.match(/^([^.]+)\.(.+)$/);
    return m ? test(row, m[1], m[2]) : false;
  });
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function applyFilters(rows, url) {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (RESERVED.has(k)) continue;
    if (k === 'or') out = out.filter((r) => orTest(r, v));
    else if (k === 'and') out = out.filter((r) => splitTop(v.replace(/^\(|\)$/g, '')).every((p) => { const m = p.match(/^([^.]+)\.(.+)$/); return m ? test(r, m[1], m[2]) : true; }));
    else out = out.filter((r) => test(r, k, v));
  }
  const order = url.searchParams.get('order');
  if (order) {
    const keys = order.split(',').map((o) => { const [c, ...f] = o.split('.'); return { c, desc: f.includes('desc') }; });
    out = [...out].sort((a, b) => { for (const { c, desc } of keys) { const r = cmp(getPath(a, c), getPath(b, c)); if (r) return desc ? -r : r; } return 0; });
  }
  return out;
}
// A module may export `embedCounts = { 'table.relation': (row, tables) => number }`: answers an embedded count such as `forum_comments(count)` (-> [{ count }]).
const embedCounts = Object.assign({}, ...demo.map((m) => m.embedCounts || {}));
function project(rows, select, table) {
  if (!select || select === '*') return rows;
  const cols = splitTop(select).map((s) => s.trim()).filter(Boolean);
  if (cols.some((c) => c === '*')) return rows;
  return rows.map((r) => {
    const o = {};
    for (const c of cols) {
      if (c.includes('(')) { // embedded resource: only a count that a demo module answers; everything else is left out
        const m = c.match(/^([A-Za-z0-9_]+)\(count\)$/);
        const fn = m && embedCounts[`${table}.${m[1]}`];
        if (fn) o[m[1]] = [{ count: fn(r, tables) }];
        continue;
      }
      const alias = c.match(/^([A-Za-z0-9_]+):(.+)$/);
      const target = alias ? alias[2] : c;
      o[alias ? alias[1] : target.replace(/.*->>?/, '')] = getPath(r, target.replace(/::.*/, ''));
    }
    return o;
  });
}

// ---------- REST ----------
async function rest(req, res, url, name) {
  const method = req.method;
  const buf = await readBody(req);
  let body; try { body = buf.length ? JSON.parse(buf.toString('utf8')) : undefined; } catch { body = undefined; }
  const prefer = String(req.headers.prefer || '');
  const wantsRows = /return=representation/.test(prefer);
  const accept = String(req.headers.accept || '');
  const singleObject = /vnd\.pgrst\.object/.test(accept);
  if (!tables.has(name)) tables.set(name, []);
  const rows = tables.get(name);

  if (method === 'GET' || method === 'HEAD') {
    const filtered = applyFilters(rows, url);
    const total = filtered.length;
    const off = Number(url.searchParams.get('offset') || 0);
    let lim = url.searchParams.get('limit') != null ? Number(url.searchParams.get('limit')) : undefined;
    const range = String(req.headers.range || '');
    let from = off;
    const rm = range.match(/^(\d+)-(\d+)$/);
    if (rm) { from = Number(rm[1]); lim = Number(rm[2]) - Number(rm[1]) + 1; }
    const page = filtered.slice(from, lim != null ? from + lim : undefined);
    const out = project(page, url.searchParams.get('select'), name);
    const headers = { 'content-range': `${total ? from : '*'}-${from + page.length - (page.length ? 1 : 0)}/${total}` };
    if (singleObject) {
      if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows`, hint: null }, headers);
      return send(res, 200, out[0], headers);
    }
    return send(res, 200, method === 'HEAD' ? '' : out, headers);
  }
  if (method === 'POST') {
    const list = Array.isArray(body) ? body : body ? [body] : [];
    const merge = /resolution=merge-duplicates/.test(prefer);
    const ignore = /resolution=ignore-duplicates/.test(prefer);
    const conflict = (url.searchParams.get('on_conflict') || 'id').split(',');
    const saved = [];
    for (const item of list) {
      let row = { id: randomUUID(), created_at: new Date().toISOString(), user_id: DEMO_USER.id, ...item };
      if (insertHooks[name]) row = insertHooks[name](row, tables) || row;
      const existing = (merge || ignore) ? rows.find((r) => conflict.every((c) => r[c] != null && r[c] === row[c])) : undefined;
      if (existing) { if (merge) Object.assign(existing, item, { updated_at: new Date().toISOString() }); saved.push(existing); }
      else { rows.push(row); saved.push(row); }
    }
    log('POST', name, saved.length);
    if (!wantsRows) return send(res, 201, '');
    const out = project(saved, url.searchParams.get('select'), name);
    return singleObject ? send(res, 201, out[0] ?? null) : send(res, 201, out);
  }
  if (method === 'PATCH' || method === 'PUT') {
    const targets = applyFilters(rows, url);
    for (const r of targets) { Object.assign(r, body || {}, { updated_at: new Date().toISOString() }); for (const h of patchHooks[name] || []) h(r, body || {}, tables); }
    log('PATCH', name, targets.length);
    if (!wantsRows) return send(res, 204, '');
    const out = project(targets, url.searchParams.get('select'), name);
    return singleObject ? send(res, 200, out[0] ?? null) : send(res, 200, out);
  }
  if (method === 'DELETE') {
    const targets = new Set(applyFilters(rows, url));
    tables.set(name, rows.filter((r) => !targets.has(r)));
    log('DELETE', name, targets.size);
    return wantsRows ? send(res, 200, [...targets]) : send(res, 204, '');
  }
  return send(res, 405, { message: 'method not allowed' });
}

/** A calm, believable "job site photo" as an SVG (varies with the file name): sky, wall, floor, a window or two. Put a real
 *  picture with the same file name into fake-backend/assets/ to override it. */
function demoImage(seedText) {
  let h = 0; for (const ch of String(seedText)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = (a) => a[h % a.length];
  const wall = pick(['#cfc7b8', '#bfc8cf', '#d8cdbd', '#b9b2a6', '#c7cfc4']);
  const floor = pick(['#8a6f52', '#7d756b', '#9a7b5a', '#6f6a63']);
  const accent = pick(['#3b6ea5', '#a5603b', '#4a8a63', '#8a4a63']);
  const win = (x) => `<rect x="${x}" y="70" width="150" height="150" fill="#9ec4e6"/><rect x="${x}" y="70" width="150" height="150" fill="none" stroke="#f4f1ea" stroke-width="10"/><path d="M${x + 75} 70V220M${x} 145H${x + 150}" stroke="#f4f1ea" stroke-width="6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="#a7a094"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/><rect y="330" width="640" height="150" fill="${floor}"/><path d="M0 330H640" stroke="#00000022" stroke-width="3"/>${win(60)}${h % 2 ? win(400) : ''}<rect x="${h % 2 ? 250 : 330}" y="190" width="170" height="140" rx="6" fill="${accent}"/><rect x="${h % 2 ? 262 : 342}" y="202" width="146" height="40" rx="4" fill="#ffffff33"/></svg>`;
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  try {
    // control endpoints answer with "connection: close": record/run.mjs asks for /__reset with a pooled keep-alive socket and then blocks
    // (spawnSync) for minutes; the next chapter's /__reset would reuse a socket the server already closed and silently never arrive.
    const ctl = { connection: 'close' };
    if (p === '/__health') return send(res, 200, { ok: true, tables: [...tables.keys()] }, ctl);
    if (p === '/__tables') return send(res, 200, Object.fromEntries([...tables].map(([k, v]) => [k, v.length])), ctl);
    if (p === '/__reset') { const chapter = url.searchParams.get('chapter') || undefined; console.log(new Date().toISOString(), 'reset', chapter || '(baseline)'); tables.clear(); for (const [k, v] of build(chapter)) tables.set(k, v); return send(res, 200, { ok: true, chapter: chapter || null }, ctl); }
    // auth
    if (p.startsWith('/auth/v1/')) {
      if (p.endsWith('/user')) return send(res, 200, DEMO_USER);
      if (p.endsWith('/token')) return send(res, 200, { access_token: 'demo', token_type: 'bearer', expires_in: 3600, refresh_token: 'demo', user: DEMO_USER });
      if (p.endsWith('/logout')) return send(res, 204, '');
      return send(res, 200, {});
    }
    // rest + rpc
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      const buf = await readBody(req);
      let args = {}; try { args = buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { /* ignore */ }
      const h = rpcAll[fn];
      log('RPC', fn);
      return send(res, 200, h ? ((await h(args, tables)) ?? null) : null);
    }
    if (p.startsWith('/rest/v1/')) return await rest(req, res, url, p.slice('/rest/v1/'.length));
    // edge functions
    if (p.startsWith('/functions/v1/')) {
      const fn = p.slice('/functions/v1/'.length);
      const buf = await readBody(req);
      let args = {}; try { args = buf.length ? JSON.parse(buf.toString('utf8')) : {}; } catch { /* ignore */ }
      const h = fnAll[fn];
      log('FUNCTION', fn, args && args.task);
      return send(res, 200, h ? ((await h(args, tables)) ?? {}) : {});
    }
    // storage: accept uploads, serve nothing real (demo images are served by the page itself, see seed.mjs)
    if (p.startsWith('/storage/v1/')) {
      // reads of any stored file (public or signed link) answer with a generated demo picture, so photos, logos and
      // files always show something; signed links point back here; uploads are accepted and forgotten.
      if (req.method === 'GET' && p.includes('/object/')) {
        const file = p.split('/object/').pop();
        const custom = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', path.basename(file.split('?')[0]));
        if (fs.existsSync(custom) && fs.statSync(custom).isFile()) {
          const ext = path.extname(custom).toLowerCase();
          res.writeHead(200, { ...cors, 'content-type': ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.webp': 'image/webp' })[ext] || 'application/octet-stream' });
          return res.end(fs.readFileSync(custom));
        }
        res.writeHead(200, { ...cors, 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' });
        return res.end(demoImage(file));
      }
      const buf = await readBody(req);
      if (req.method === 'POST' && p.includes('/object/sign/')) {
        const rest = p.split('/object/sign/')[1];
        let paths; try { paths = JSON.parse(buf.toString('utf8')).paths; } catch { paths = undefined; }
        const bucket = rest.split('/')[0];
        const sign = (rel) => `/object/sign/${bucket}/${rel}?token=demo`;
        if (Array.isArray(paths)) return send(res, 200, paths.map((rel) => ({ error: null, path: rel, signedURL: sign(rel) })));
        return send(res, 200, { signedURL: sign(rest.split('/').slice(1).join('/')) });
      }
      if (req.method === 'POST' && p.includes('/object/list/')) {
        // a demo module may export `storageList = (bucket, prefix, tables) => [{ name, created_at, metadata: { size, mimetype } }]` (undefined = not mine)
        let prefix = ''; try { prefix = JSON.parse(buf.toString('utf8')).prefix || ''; } catch { /* ignore */ }
        const bucket = p.split('/object/list/')[1];
        for (const m of demo) if (typeof m.storageList === 'function') { const r = m.storageList(bucket, prefix, tables); if (Array.isArray(r)) return send(res, 200, r); }
        return send(res, 200, []);
      }
      if (req.method === 'POST' || req.method === 'PUT') return send(res, 200, { Key: p.replace('/storage/v1/object/', ''), Id: randomUUID() });
      return send(res, 200, []);
    }
    return send(res, 404, { message: 'not found', path: p });
  } catch (e) {
    console.error('fake backend error', req.method, p, e);
    return send(res, 500, { message: String(e && e.message || e) });
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`fake backend on http://127.0.0.1:${PORT}`));
