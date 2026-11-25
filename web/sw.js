// Service worker de RyM Simu: permite instalar la web como app y abrirla sin conexión.
// La compilación (/api/*) siempre va a la red: necesita el servidor.
const CACHE = 'rym-simu-v2';
const SHELL = ['./', 'index.html', 'icons/logo-rym.png', 'style.css', 'dist/app.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith('/api/')) return;
  // Red primero (así cada publicación en Vercel llega enseguida) y caché si no hay conexión.
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname.endsWith('fonts.gstatic.com') || url.hostname.endsWith('fonts.googleapis.com'))) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
