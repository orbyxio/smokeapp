const SW = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Pedido novo', {
    body: d.body || '',
    icon: '/pwa?s=192',
    badge: '/pwa?s=192',
    tag: d.tag || 'pedido',
    renotify: true,
    data: { url: d.url || '/admin' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.indexOf(url) !== -1 && 'focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
`;

export async function GET() {
  return new Response(SW, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
