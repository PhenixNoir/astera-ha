// Astera Mobil — service worker: uygulama kabuğunu önbelleğe alır, telefona gelen bildirimleri gösterir.
const CACHE = 'astera-m-v6';
const SHELL = ['/m/', '/static/m/m.js', '/static/pbar.js', '/static/m/m.css', '/static/app.css', '/static/m/icon-192.png', '/static/m/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Kabuk: önce ağ, ağ yoksa önbellek. API istekleri hiç önbelleğe alınmaz.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  if (u.pathname === '/m/' || u.pathname.startsWith('/static/')) {
    e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/m/'))));
  }
});

// Push içeriksiz gelir; son bildirimleri sunucudan çekip gösteririz.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let list = [];
    try { list = await (await fetch('/api/notifications/recent?sec=900', { cache: 'no-store' })).json(); } catch { /* */ }
    if (!list.length) return self.registration.showNotification('Astera', { body: 'Yeni bildirim var', icon: '/static/m/icon-192.png', badge: '/static/m/badge-96.png', tag: 'astera', renotify: true, silent: false, vibrate: [300, 120, 300] });
    return Promise.all(list.slice(0, 3).map((n) => self.registration.showNotification(n.title || 'Astera', {
      body: n.body || '', icon: '/static/m/icon-192.png', badge: '/static/m/badge-96.png', tag: 'n' + n.id,
      data: { id: n.id, kind: n.kind, action: n.action }, vibrate: [300, 120, 300, 120, 300],
      silent: false, renotify: true, requireInteraction: n.level === 'bad',
    })));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {}, a = d.action || {};
  let url = '/m/#bildirim';
  if (a.t === 'job') url = `/m/#baskilar?job=${a.id}`;
  else if (a.t === 'bambu') url = `/m/#baskilar?ev=${encodeURIComponent(a.id)}`;
  else if (a.t === 'plan' || d.kind === 'printer' || d.kind === 'print_done') url = '/m/#baskilar';
  else if (a.t === 'spool') url = '/m/#filament';
  else if (a.t === 'product') url = '/m/#stok';
  e.waitUntil((async () => {
    if (d.id) fetch(`/api/notifications/${d.id}/resolve`, { method: 'POST' }).catch(() => {});
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all.find((x) => new URL(x.url).pathname.startsWith('/m/'));
    if (c) { await c.focus(); c.postMessage({ go: url }); return; }
    return self.clients.openWindow(url);
  })());
});
