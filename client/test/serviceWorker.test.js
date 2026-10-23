// Phase 12: builds the real sw.js (vite-plugins/serviceWorker.js + src/sw/*) and runs it in a fake
// service-worker scope, to prove what it caches and which requests it leaves alone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { buildServiceWorker, isPrecacheable } from '../vite-plugins/serviceWorker.js';

const ORIGIN = 'https://school.example';
const source = (name) => readFileSync(new URL(`../src/sw/${name}`, import.meta.url), 'utf8');
const SOURCES = { policySource: source('swPolicy.js'), workerSource: source('serviceWorker.js') };

const BUILD_FILES = [
  { fileName: 'index.html', content: '<!doctype html><div id="root"></div>' },
  { fileName: 'assets/index-abc.js', content: 'console.log(1)' },
  { fileName: 'assets/index-abc.css', content: 'body{}' },
  { fileName: 'assets/index-abc.js.map', content: '{}' },
  { fileName: 'manifest.webmanifest', content: '{}' },
  { fileName: 'icons/icon-192.png', content: 'png' },
  { fileName: 'favicon.svg', content: '<svg/>' },
];

/** Runs sw.js in a fake ServiceWorkerGlobalScope. `network(url, init)` plays the server. */
function startWorker({ files = BUILD_FILES, network, existingCaches = [] } = {}) {
  const { code, precache, version } = buildServiceWorker({ files, ...SOURCES });
  const listeners = {};
  const stores = new Map(existingCaches.map((name) => [name, new Map()]));
  const stats = { puts: 0, skipWaiting: 0, claimed: 0, fetched: [] };

  const fetchImpl = async (request) => {
    const url = typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;
    stats.fetched.push(url);
    return network(url, request);
  };
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async addAll(requests) {
        for (const request of requests) {
          const response = await fetchImpl(request);
          if (!response.ok) throw new TypeError('bad response');
          store.set(request.url, response);
        }
      },
      async put() {
        stats.puts += 1;
      },
      // Like a browser: a response stored with a Vary header does not match a request whose
      // varied headers differ (here: always treated as different) unless ignoreVary is set.
      async match(request, options = {}) {
        const url = typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;
        const response = store.get(url);
        if (response?.headers.has('vary') && !options.ignoreVary) return undefined;
        return response?.clone();
      },
    };
  };

  class FakeRequest {
    constructor(url, init = {}) {
      this.url = new URL(url, ORIGIN).href;
      this.method = 'GET';
      this.mode = 'cors';
      this.cache = init.cache;
      this.headers = new Headers();
    }
  }

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
    skipWaiting: () => {
      stats.skipWaiting += 1;
    },
    clients: { claim: async () => { stats.claimed += 1; } },
  };
  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  vm.runInNewContext(code, { self, caches, fetch: fetchImpl, Request: FakeRequest, URL, Set, Promise, console });

  async function dispatch(type, init = {}) {
    let waited = null;
    let responded = null;
    listeners[type]({ ...init, waitUntil: (p) => { waited = p; }, respondWith: (p) => { responded = p; } });
    if (waited) await waited;
    return responded;
  }

  return { dispatch, stores, stats, precache, cacheName: `led-app-shell-${version}` };
}

const ok = (body = 'ok') => new Response(body, { status: 200 });
const request = (path, { method = 'GET', mode = 'cors', headers = {} } = {}) => ({
  method, mode, url: new URL(path, ORIGIN).href, headers: new Headers(headers),
});

describe('service worker build (plugin)', () => {
  it('precaches only allowed build files - no source maps, no sw.js, no API paths', () => {
    const { precache } = buildServiceWorker({ files: [...BUILD_FILES, { fileName: 'sw.js', content: '' }, { fileName: 'other.html', content: '' }], ...SOURCES });
    assert.deepEqual(precache, [
      '/assets/index-abc.css',
      '/assets/index-abc.js',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/index.html',
      '/manifest.webmanifest',
    ]);
    assert.ok(precache.every((path) => !path.startsWith('/api')));
    assert.equal(isPrecacheable('assets/index-abc.js.map'), false);
  });

  it('changes the cache version whenever a build file changes', () => {
    const a = buildServiceWorker({ files: BUILD_FILES, ...SOURCES }).version;
    const b = buildServiceWorker({ files: BUILD_FILES.map((f) => (f.fileName === 'index.html' ? { ...f, content: 'changed' } : f)), ...SOURCES }).version;
    assert.notEqual(a, b);
    assert.equal(a, buildServiceWorker({ files: [...BUILD_FILES].reverse(), ...SOURCES }).version);
  });

  it('injects the API base URL and refuses a build without index.html', () => {
    const { code } = buildServiceWorker({ files: BUILD_FILES, apiBaseUrl: 'https://api.school.example/api', ...SOURCES });
    assert.match(code, /"apiBaseUrl": "https:\/\/api\.school\.example\/api"/);
    assert.throws(() => buildServiceWorker({ files: BUILD_FILES.slice(1), ...SOURCES }), /index\.html/);
  });
});

describe('service worker runtime', () => {
  it('install precaches exactly the allow-list (bypassing the HTTP cache) and does not skip waiting', async () => {
    const worker = startWorker({ network: () => ok() });
    await worker.dispatch('install');
    assert.deepEqual([...worker.stores.get(worker.cacheName).keys()].sort(), worker.precache.map((p) => `${ORIGIN}${p}`).sort());
    assert.equal(worker.stats.skipWaiting, 0);
  });

  it('activate deletes only this app\'s old shell caches, then claims the pages', async () => {
    const worker = startWorker({ network: () => ok(), existingCaches: ['led-app-shell-old', 'another-app-cache'] });
    await worker.dispatch('install');
    await worker.dispatch('activate');
    assert.deepEqual([...worker.stores.keys()].sort(), ['another-app-cache', worker.cacheName].sort());
    assert.equal(worker.stats.claimed, 1);
  });

  it('skips waiting only when the page sends SKIP_WAITING', async () => {
    const worker = startWorker({ network: () => ok() });
    await worker.dispatch('message', { data: { type: 'OTHER' } });
    assert.equal(worker.stats.skipWaiting, 0);
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    assert.equal(worker.stats.skipWaiting, 1);
  });

  it('leaves API, auth, cross-origin and non-GET requests to the browser and stores nothing', async () => {
    const worker = startWorker({ network: () => ok('{"students":[]}') });
    await worker.dispatch('install');
    const untouched = [
      request('/api/auth/me', { headers: { Authorization: 'Bearer token' } }),
      request('/api/students'),
      request('/api/reports/today', { mode: 'navigate' }),
      request('/api/attendance/scan', { method: 'POST' }),
      request('/api/dismissals/K1/verify', { method: 'POST' }),
      { method: 'GET', mode: 'cors', url: 'https://securetoken.googleapis.com/v1/token', headers: new Headers() },
      { method: 'GET', mode: 'cors', url: 'https://api.school.example/api/students', headers: new Headers() },
    ];
    for (const r of untouched) assert.equal(await worker.dispatch('fetch', { request: r }), null, r.url);
    assert.equal(worker.stats.puts, 0);
    assert.equal(worker.stores.get(worker.cacheName).size, worker.precache.length);
  });

  it('navigations use the network first and fall back to the cached shell when offline', async () => {
    let online = true;
    const worker = startWorker({ network: () => (online ? ok('fresh shell') : Promise.reject(new TypeError('offline'))) });
    online = true;
    await worker.dispatch('install');

    const fresh = await worker.dispatch('fetch', { request: request('/', { mode: 'navigate' }) });
    assert.equal(await fresh.text(), 'fresh shell');

    online = false;
    const cached = await worker.dispatch('fetch', { request: request('/', { mode: 'navigate' }) });
    assert.equal(await cached.text(), 'fresh shell'); // the precached index.html
    assert.equal(worker.stats.puts, 0);
  });

  it('serves precached build files from the cache without the network', async () => {
    let online = true;
    const worker = startWorker({ network: (url) => (online ? ok(`file ${new URL(url).pathname}`) : Promise.reject(new TypeError('offline'))) });
    await worker.dispatch('install');
    online = false;
    const response = await worker.dispatch('fetch', { request: request('/assets/index-abc.js') });
    assert.equal(await response.text(), 'file /assets/index-abc.js');
  });

  it('still serves the shell and assets offline when the server sent "Vary: Origin"', async () => {
    // Found in the Phase 12 browser test: vite preview (and many hosts) send Vary: Origin, and
    // Vite's <script type="module" crossorigin> requests carry an Origin header.
    let online = true;
    const worker = startWorker({
      network: (url) => (online ? new Response(`file ${new URL(url).pathname}`, { headers: { Vary: 'Origin' } }) : Promise.reject(new TypeError('offline'))),
    });
    await worker.dispatch('install');
    online = false;
    const asset = await worker.dispatch('fetch', { request: request('/assets/index-abc.js', { headers: { Origin: ORIGIN } }) });
    assert.equal(await asset.text(), 'file /assets/index-abc.js');
    const shell = await worker.dispatch('fetch', { request: request('/', { mode: 'navigate' }) });
    assert.equal(await shell.text(), 'file /index.html');
  });
});
