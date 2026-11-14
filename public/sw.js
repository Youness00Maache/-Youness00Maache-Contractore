/*
 * ContractorDocs service worker: lets the app OPEN without a connection, so documents can be written offline
 * (offline outbox, lib/offline; competitor gap #14). Registered by lib/offline/offlineShell.ts in production builds.
 *
 *  - Page loads (navigations): network first, exactly as without a service worker. Only when the network fails is
 *    the last copy of the app shell (/app.html) used.
 *  - Built files under /assets/ (content-hashed, never change): served from the cache once fetched; at most
 *    MAX_ASSETS files are kept (oldest dropped first).
 *  - Everything else (Supabase, Gmail, fonts, images, other files) is not touched.
 *
 * To switch it off: replace this file with one that calls self.registration.unregister() and deletes the 'cd-' caches.
 */
const SHELL_CACHE = 'cd-shell-v1';
const ASSET_CACHE = 'cd-assets-v1';
const MAX_ASSETS = 300;
const SHELL_URL = '/app.html';

self.addEventListener('install', () => {
  self.skipWaiting();
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

const trim = async (cache) => {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
};

const isAsset = (url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/');

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
  }
});

// "cd-warm": refresh the app shell copy and store the files the page loaded before this worker controlled it.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cd-warm') return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(SHELL_URL, { cache: 'no-cache', credentials: 'same-origin' });
      if (response.ok) await (await caches.open(SHELL_CACHE)).put(SHELL_URL, response);
    } catch { /* offline: keep the copy we have */ }
    const urls = Array.isArray(data.urls) ? data.urls.filter((u) => typeof u === 'string').slice(0, 250) : [];
    const cache = await caches.open(ASSET_CACHE);
    for (const raw of urls) {
      try {
        const url = new URL(raw, self.location.origin);
        if (!isAsset(url) || await cache.match(url.href)) continue;
        const response = await fetch(url.href, { credentials: 'same-origin' });
        if (response.ok) await cache.put(url.href, response);
      } catch { /* skip */ }
    }
    await trim(cache);
  })());
});
