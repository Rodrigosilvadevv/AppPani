/* AppPani — service worker (somente web/PWA; o app nativo usa push nativo).
 *
 * IMPORTANTE: se você já tem um sw.js funcionando em produção com o seu `send-push`,
 * pode manter o seu. Este aqui aceita o payload em JSON { title, body, url, icon, tag }
 * ou texto puro, então costuma funcionar com o que a função já envia.
 */
const VERSAO = 'apppani-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'AppPani';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || d.txt || 'Saiu fornada fresquinha! 🥖',
      icon: d.icon || '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || VERSAO,
      renotify: Boolean(d.tag),
      data: { url: d.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) { c.navigate?.(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
