const APP_URL = 'https://tomermachloof.github.io/financial-app/'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await self.clients.claim()
    const windowClients = await self.clients.matchAll({ type: 'window' })
    for (const client of windowClients) {
      try { client.navigate(client.url) } catch {}
    }
  })())
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
