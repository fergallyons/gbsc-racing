const CACHE = 'gbsc-racing-v4';
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

// Fetch strategy:
//   API/external calls  → network-first (never cache)
//   HTML / JS / CSS     → network-first (always fresh when online, cache fallback offline)
//   Other static assets → cache-first (icons, manifest — rarely change)
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Halsail has its own proxy fallback in halFetch() that triggers on TypeError (CORS failure).
  // If the SW catches the network error and returns a 503 Response instead, halFetch() sees
  // a non-ok response rather than a TypeError and never retries via the proxy. Pass through.
  if (url.includes('halsail.com')) return;

  // Always network-first for API calls — never serve stale API data from cache
  if (
    url.includes('supabase.co') ||
    url.includes('open-meteo.com') ||
    url.includes('/.netlify/functions/') ||
    url.includes('/api/')
  ) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then(r => r || new Response('', {status: 503, statusText: 'Network unavailable'}))
      )
    );
    return;
  }

  // Network-first for app shell + dynamic edge-function responses — ensures updates land immediately
  if (
    url.endsWith('/') ||
    url.includes('/index.html') ||
    url.includes('/app.js') ||
    url.includes('/style.css') ||
    url.includes('/club-config.js') ||
    url.includes('/manifest.json') ||
    url.includes('/version.json')
  ) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for everything else (favicon, manifest, etc.)
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

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  const title   = data.title ?? 'GBSC Racing';
  const options = {
    body:    data.body ?? '',
    icon:    '/favicon.svg',
    badge:   '/favicon.svg',
    data:    { url: data.url ?? '/' },
    tag:     data.tag ?? 'gbsc',   // replaces previous notification of same tag
    renotify: false,
    vibrate: [100, 50, 100],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope) && 'focus' in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
