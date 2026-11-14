const CACHE = 'voxelheim-v3';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.open(CACHE).then(c =>
      c.match(e.request).then(r =>
        r || fetch(e.request).then(n => {
          if (n && n.ok) c.put(e.request, n.clone());
          return n;
        }).catch(() => r)
      )
    )
  );
});
