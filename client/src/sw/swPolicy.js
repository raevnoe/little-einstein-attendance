// Phase 12: the ONLY rules that decide which requests the service worker may answer.
// Pure functions with no imports: the build plugin (vite-plugins/serviceWorker.js) copies this
// file into dist/sw.js, and client/test/swPolicy.test.js tests it directly in Node.
//
// Default = do nothing (the browser handles the request normally). The service worker only
// answers same-origin GET requests that are either a page navigation (-> app shell) or one of
// the build files listed at build time. API calls, Firebase Auth, other origins, requests that
// carry an Authorization header, and every non-GET method are never touched or cached.

export const SHELL_CACHE_PREFIX = 'led-app-shell-';

// Same-origin paths that must never get the app shell, even if API_BASE_URL changes.
const ALWAYS_EXCLUDED_PREFIXES = ['/api', '/__/'];

export function shellCacheName(version) {
  return `${SHELL_CACHE_PREFIX}${version}`;
}

/** True only for this app's OLD shell caches; caches of anything else are left alone. */
export function isStaleShellCache(name, currentName) {
  return name.startsWith(SHELL_CACHE_PREFIX) && name !== currentName;
}

/**
 * Same-origin path prefix of the API, from VITE_API_BASE_URL (default "/api").
 * Returns null when the API is on another origin (cross-origin requests are ignored anyway),
 * and '' when the API base is the site root - then the service worker answers nothing.
 */
export function apiPathPrefix(apiBaseUrl, appOrigin) {
  let url;
  try {
    url = new URL(apiBaseUrl || '/api', appOrigin);
  } catch {
    return '';
  }
  if (url.origin !== appOrigin) return null;
  return url.pathname.replace(/\/+$/, '');
}

function hasPathPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/**
 * 'navigation' | 'asset' | null for a Request-like object ({ method, url, mode, headers }).
 * `precached` is the Set of build-file paths baked into sw.js.
 */
export function classifyRequest(request, { appOrigin, apiPrefix, precached }) {
  if (request.method !== 'GET') return null;
  if (request.headers?.has?.('authorization')) return null;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin !== appOrigin) return null;
  if (apiPrefix === '') return null; // API at the site root: fail closed.
  if (ALWAYS_EXCLUDED_PREFIXES.some((prefix) => hasPathPrefix(url.pathname, prefix))) return null;
  if (apiPrefix && hasPathPrefix(url.pathname, apiPrefix)) return null;

  if (request.mode === 'navigate') return 'navigation';
  if (!url.search && precached.has(url.pathname)) return 'asset';
  return null;
}
