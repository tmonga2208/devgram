// DevGram service worker.
//
// - Build assets (/_next/static/) and icons are served from the cache, which
//   fills on first use.
// - Page navigations always go to the network; if that fails, the offline
//   page is shown.
// - Everything else (API calls, other origins, non-GET requests) is left to
//   the network, so nothing private or user-specific is ever stored.

const CACHE = "devgram-static-v1"
const OFFLINE_URL = "/offline"
const MAX_ENTRIES = 150

// Stores the offline page together with the build assets its HTML refers to,
// so it renders properly even when nothing else has been cached yet.
async function cacheOfflinePage() {
  const cache = await caches.open(CACHE)
  const response = await fetch(OFFLINE_URL, { cache: "reload" })
  if (!response.ok) throw new Error(`offline page answered ${response.status}`)
  await cache.put(OFFLINE_URL, response.clone())

  const html = await response.text()
  const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s<>)]+/g) || [])
  assets.add("/icons/icon-192.png")
  await Promise.all([...assets].map((asset) => cache.add(asset).catch(() => undefined)))
}

// Build assets get new names on every deploy, so old ones would pile up.
async function trimCache(cache) {
  const keys = await cache.keys()
  const excess = keys.filter((request) => new URL(request.url).pathname !== OFFLINE_URL).slice(0, Math.max(0, keys.length - MAX_ENTRIES))
  await Promise.all(excess.map((request) => cache.delete(request)))
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("devgram-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok) {
    const copy = response.clone()
    caches
      .open(CACHE)
      .then((cache) => cache.put(request, copy).then(() => trimCache(cache)))
      .catch(() => undefined)
  }
  return response
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match(OFFLINE_URL)) || Response.error()
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request))
  } else if (request.mode === "navigate") {
    event.respondWith(networkWithOfflineFallback(request))
  }
})
