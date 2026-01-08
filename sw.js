const CACHE_NAME = 'contractordocs-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Alfa+Slab+One&family=Anton&family=Arvo&family=Bangers&family=Bebas+Neue&family=Bitter&family=Cabin&family=Caveat&family=Comfortaa&family=Cormorant+Garamond&family=Crimson+Text&family=Dancing+Script:wght@400;700&family=DM+Sans&family=EB+Garamond&family=Indie+Flower&family=Inconsolata&family=Inter&family=JetBrains+Mono&family=Josefin+Sans&family=Lato:ital,wght@0,400;0,700;1,400&family=Lobster&family=Lora&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Nunito&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Oswald:wght@400;700&family=Pacifico&family=Patrick+Hand&family=Permanent+Marker&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins&family=PT+Serif&family=Raleway:ital,wght@0,400;0,700;1,400&family=Righteous&family=Roboto:ital,wght@0,400;0,700;1,400&family=Rubik&family=Shadows+Into+Light+Two&family=Source+Code+Pro&family=Space+Grotesk&family=Space+Mono&family=Ubuntu&family=Work+Sans&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Network-first for Supabase API to get fresh data if possible, but we handle offline logic in App.tsx
  if (url.hostname.includes('supabase.co')) {
    return; 
  }

  // Stale-While-Revalidate for static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Update cache with new version
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseToCache);
            });
        }
        return networkResponse;
      });
      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
