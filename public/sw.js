// Ashfall offline cache. The game generates everything in the browser, so
// once the page, its scripts and the fonts are cached it plays without a
// connection.
//
// The build (vite.config.js) fills in PRECACHE with every built file and
// names the cache after them, so a new version replaces the old cache.
//
//   pages        network first, falling back to the cached copy
//   own files    cache first (Vite gives them hashed names, so they never go stale)
//   Google Fonts cache first, saved as they are fetched
const CACHE = "ashfall-dev"
const PRECACHE = []
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"]

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const put = (req, res) => {
  if (res && (res.ok || res.type === "opaque")) {
    const copy = res.clone()
    caches.open(CACHE).then(c => c.put(req, copy))
  }
  return res
}

self.addEventListener("fetch", e => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  const own = url.origin === self.location.origin
  if (!own && !FONT_HOSTS.includes(url.hostname)) return
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => put("./", res))
        .catch(() => caches.match("./", { ignoreSearch: true })),
    )
    return
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))))
})
