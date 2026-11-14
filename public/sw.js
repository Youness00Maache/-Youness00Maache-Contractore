/*
 * ContractorDocs service worker: lets the app OPEN without a connection, so documents can be written offline
 * (offline outbox, lib/offline; competitor gap #14). Registered by lib/offline/offlineShell.ts in production builds.
 *
 *  - Page loads (navigations): network first, exactly as without a service worker. Only when the network fails is
 *    the last copy of the app shell (/app.html) used.
 *  - Built files under /assets/ (content-hashed, never change): served from the cache once fetched; at most
 *    MAX_ASSETS files are kept (oldest dropped first). The app loads the main screens' files in the background after
 *    sign-in (App.tsx prefetchOfflineScreens), so forms, the job page, inventory, price book, calendar, clients,
 *    settings … open offline after one online visit.
 *  - The shell copy is kept together with the files it starts with (its <script> / <link> assets), so a shell saved
 *    after a new release never points at files this device doesn't have.
 *  - The app icon and manifest are kept too (the installed app's start screen).
 *  - Everything else (Supabase, Gmail, fonts, images, other files) is not touched.
 *
 * To switch it off: replace this file with one that calls self.registration.unregister() and deletes the 'cd-' caches.
 */
const SHELL_CACHE = 'cd-shell-v1';
const ASSET_CACHE = 'cd-assets-v1';
const MAX_ASSETS = 400;
const SHELL_URL = '/app.html';
const SHELL_EXTRAS = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/favicon.ico'];

const isAsset = (url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/');

/** /assets/ files the shell HTML starts with (scripts, styles, module preloads). */
const shellAssets = (html) => {
  const out = new Set();
  const re = /(?:src|href)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const url = new URL(m[1], self.location.origin);
      if (isAsset(url)) out.add(url.href);
    } catch { /* skip */ }
  }
  return Array.from(out);
};

const trim = async (cache) => {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
};

/** Stores these /assets/ files (the ones not stored yet). */
const keepAssets = async (urls) => {
  const cache = await caches.open(ASSET_CACHE);
  for (const href of urls) {
    try {
      const url = new URL(href, self.location.origin);
      if (!isAsset(url) || await cache.match(url.href)) continue;
      const response = await fetch(url.href, { credentials: 'same-origin' });
      if (response.ok) await cache.put(url.href, response);
    } catch { /* skip */ }
  }
  await trim(cache);
};

/** Refreshes the shell copy, and stores the files it starts with first (so the copy always works offline). */
const refreshShell = async () => {
  try {
    const response = await fetch(SHELL_URL, { cache: 'no-cache', credentials: 'same-origin' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await keepAssets(shellAssets(html));
    await (await caches.open(SHELL_CACHE)).put(SHELL_URL, response);
  } catch { /* offline: keep the copy we have */ }
  try {
    const cache = await caches.open(SHELL_CACHE);
    for (const extra of SHELL_EXTRAS) {
      if (await cache.match(extra)) continue;
      const res = await fetch(extra, { credentials: 'same-origin' });
      if (res.ok) await cache.put(extra, res);
    }
  } catch { /* optional */ }
};

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(refreshShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
    for (const key of await caches.keys()) {
      if (key.startsWith('cd-') && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const cache = await caches.open(SHELL_CACHE);
        const shell = await cache.match(SHELL_URL);
        if (shell) return shell;
        throw error;
      }
    })());
    return;
  }

  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(cache.put(request, copy).then(() => trim(cache)).catch(() => undefined));
      }
      return response;
    })());
    return;
  }

  // the installed app's icon / manifest: network first, the kept copy offline
  if (SHELL_EXTRAS.includes(url.pathname)) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch (error) {
        const hit = await (await caches.open(SHELL_CACHE)).match(url.pathname);
        if (hit) return hit;
        throw error;
      }
    })());
  }
});

// "cd-warm": refresh the app shell copy and store the files the page loaded before this worker controlled it.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cd-warm') return;
  event.waitUntil((async () => {
    await refreshShell();
    const urls = Array.isArray(data.urls) ? data.urls.filter((u) => typeof u === 'string').slice(0, 300) : [];
    await keepAssets(urls);
  })());
});
