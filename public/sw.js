const APP_URL = 'https://tomermachloof.github.io/financial-app/'

self.addEventListener('install', (e) => {
  // Force activate immediately — don't wait for old SW to die
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  // Claim all clients immediately
  e.waitUntil(
    caches.keys().then(names => Promise.all(names.map(n => caches.delete(n))))
      .then(() => clients.claim())
  )
})

// NEVER cache anything — always fetch from network
// This ensures iOS PWA always gets the latest JS bundles
self.addEventListener('fetch', e => {
  // Let the browser handle non-GET requests normally
  if (e.request.method !== 'GET') return

  e.respondWith(
    fetch(e.request).catch(() => {
      // Only if network fails, try cache as absolute last resort
      return caches.match(e.request)
    })
  )
})

self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title || 'כלכלה', {
      body: data.body || '',
      dir: 'rtl',
      lang: 'he',
      tag: 'daily-summary',
      renotify: true,
      data: { url: data.url || APP_URL },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const targetUrl = e.notification.data?.url || APP_URL
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('financial-app') && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})
