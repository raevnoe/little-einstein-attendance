/* global SW_CONFIG, shellCacheName, isStaleShellCache, apiPathPrefix, classifyRequest */
// Phase 12 service worker (classic script). NOT bundled by Vite: vite-plugins/serviceWorker.js
// writes dist/sw.js = SW_CONFIG (version, base, precache list, API base URL) + swPolicy.js + this file.
//
// What it does:
//   install   precache the app shell (index.html, hashed /assets/*, manifest, icons) - nothing else
//   activate  delete this app's OLD shell caches, then control open pages
//   fetch     navigations: network first, cached index.html only when the network fails
//             precached build files: cache first
//             everything else (API, Firebase Auth, other origins, POST...): not handled
//   message   SKIP_WAITING - sent only when the user presses "Reload" on the update banner
// It never stores a response at runtime, never queues requests, and has no background sync.

const CACHE_NAME = shellCacheName(SW_CONFIG.version);
const APP_ORIGIN = self.location.origin;
const SHELL_URL = `${SW_CONFIG.base}index.html`;
const PRECACHED = new Set(SW_CONFIG.precache);
const POLICY = {
  appOrigin: APP_ORIGIN,
  apiPrefix: apiPathPrefix(SW_CONFIG.apiBaseUrl, APP_ORIGIN),
  precached: PRECACHED,
};

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache so a new version never precaches old files.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SW_CONFIG.precache.map((path) => new Request(path, { cache: 'reload' })))),
  );
  // No skipWaiting() here: a new version waits until the user chooses to reload.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => isStaleShellCache(name, CACHE_NAME)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ignoreVary: hosts often send "Vary: Origin", and Vite's <script type="module" crossorigin> requests
// carry an Origin header the precache request did not have. Only exact precached URLs are matched.
const MATCH_OPTIONS = { ignoreVary: true };

async function cachedShell() {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(SHELL_URL, MATCH_OPTIONS);
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const shell = await cachedShell();
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(request, MATCH_OPTIONS)) || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const kind = classifyRequest(event.request, POLICY);
  if (kind === 'navigation') event.respondWith(networkFirstNavigation(event.request));
  else if (kind === 'asset') event.respondWith(cacheFirstAsset(event.request));
  // Anything else: no respondWith -> the browser sends the request exactly as before.
});
