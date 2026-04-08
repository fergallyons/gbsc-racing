const CACHE = 'gbsc-racing-v1';
const STATIC = ['/', '/index.html', '/app.js', '/style.css', '/favicon.svg', '/manifest.json'];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

// Activate — remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API/external, cache-first for static assets
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Always go network-first for API calls
  if (
    url.includes('supabase.co') ||
    url.includes('halsail.com') ||
    url.includes('open-meteo.com') ||
    url.includes('/.netlify/functions/') ||
    url.includes('/api/')
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
