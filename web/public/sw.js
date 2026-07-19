// Service worker de Baby Tracker.
//
// Solo cachea los archivos estáticos de la propia app para que abra al
// instante en el móvil. La API (otro origen) nunca se cachea: los datos
// siempre viajan a Google Sheets en tiempo real.

const CACHE = 'baby-tracker-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Solo GET del propio origen; la API de Apps Script y el script de Google
  // van siempre por red.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  if (url.pathname.includes('/assets/')) {
    // Archivos con hash en el nombre: inmutables, caché primero.
    event.respondWith(cacheFirst(event.request))
  } else {
    // index.html, manifest, iconos: red primero con respaldo en caché.
    event.respondWith(networkFirst(event.request))
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: true })
    if (hit) return hit
    // Navegación sin red y sin caché exacta: entrega la portada cacheada.
    if (request.mode === 'navigate') {
      const index = await cache.match('./')
      if (index) return index
    }
    throw err
  }
}
