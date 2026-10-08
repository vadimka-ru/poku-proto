// Optional service worker of the game page (play/sw.js), OFF by default: the page registers it only for ?sw=1 (kept in localStorage 'poku.sw'; ?sw=0 turns it off and clears
// its caches). Not verified inside Telegram's WebViews, which is why it is not on for everybody. tools/web-build.sh writes the build id into the line below, so each build has its
// own byte-different worker and its own cache: the old one is deleted when the new one activates.
//   * files with the build id in their name (poku-<id>.wasm / .pck / .js, poku-<id>-bridge/...): content-named, never change -> cache first, filled on the first network answer
//   * the page itself (play/ with any query) and ice.json: network first, the cached copy only when the network fails (offline start)
//   * everything else (other origins, non-GET): not touched
// GitHub Pages sends max-age=600 for all of it, so without this a start after ten minutes asks the server about each of ~25 files again (a 304 each when all is well).
const BUILD = 'poku-89894af';
const CACHE = 'poku-' + BUILD;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('poku-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const versioned = (url) => url.pathname.split('/').some((seg) => seg === BUILD || seg.startsWith(BUILD + '.') || seg.startsWith(BUILD + '-'));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (versioned(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200 && !req.headers.has('range')) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }
  const page = req.mode === 'navigate' || url.pathname.endsWith('/ice.json');
  if (page) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && req.mode === 'navigate') (await caches.open(CACHE)).put(new Request(url.origin + url.pathname), res.clone()).catch(() => {});
        return res;
      } catch (e) {
        const hit = await caches.match(new Request(url.origin + url.pathname), { ignoreSearch: true });
        if (hit) return hit;
        throw e;
      }
    })());
  }
});

// The page asks, after the first frame, for the files it just downloaded to be copied into the cache: from the HTTP cache only ('only-if-cached' never uses the network),
// so a first visit costs no second download.
self.addEventListener('message', (event) => {
  const names = event.data && event.data.warm;
  if (!Array.isArray(names)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const base = new URL('./', self.location.href);
    for (const n of names) {
      const u = new URL(n, base);
      if (!versioned(u)) continue;
      try {
        if (await cache.match(u.href)) continue;
        const res = await fetch(u.href, { cache: 'only-if-cached', mode: 'same-origin' });
        if (res.ok && res.status === 200) await cache.put(u.href, res);
      } catch (e) { /* not in the HTTP cache: filled later by a normal load */ }
    }
  })());
});
