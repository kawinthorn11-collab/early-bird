// Offline support: the page shell is network-first so a new deploy shows up on the next visit;
// built assets, voice files and fonts are cache-first because their names never change.
const CACHE = 'early-bird-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './audio/manifest.json'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const shell = req.mode === 'navigate' || req.url.endsWith('/audio/manifest.json');
  e.respondWith(shell ? networkFirst(req) : cacheFirst(req));
});
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
  catch { return (await c.match(req)) || (await c.match('./')) || Response.error(); }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.status === 200) c.put(req, r.clone());
  return r;
}
