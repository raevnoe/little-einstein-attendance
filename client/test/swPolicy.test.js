// Phase 12: the service worker may only answer app-shell requests. These are the rules that keep
// API responses, tokens and Firebase Auth traffic away from Cache Storage.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  apiPathPrefix,
  classifyRequest,
  isStaleShellCache,
  shellCacheName,
} from '../src/sw/swPolicy.js';

const ORIGIN = 'https://school.example';
const PRECACHED = new Set(['/index.html', '/assets/index-abc.js', '/assets/index-abc.css', '/manifest.webmanifest', '/icons/icon-192.png']);
const policy = (apiBaseUrl = '/api') => ({ appOrigin: ORIGIN, apiPrefix: apiPathPrefix(apiBaseUrl, ORIGIN), precached: PRECACHED });

function req(path, { method = 'GET', mode = 'cors', headers = {} } = {}) {
  return { method, mode, url: new URL(path, ORIGIN).href, headers: new Headers(headers) };
}

describe('apiPathPrefix', () => {
  it('uses the same-origin path of VITE_API_BASE_URL', () => {
    assert.equal(apiPathPrefix('/api', ORIGIN), '/api');
    assert.equal(apiPathPrefix('/api/', ORIGIN), '/api');
    assert.equal(apiPathPrefix(undefined, ORIGIN), '/api');
    assert.equal(apiPathPrefix(`${ORIGIN}/backend/api`, ORIGIN), '/backend/api');
  });

  it('returns null for an API on another origin (cross-origin requests are ignored anyway)', () => {
    assert.equal(apiPathPrefix('https://api.school.example/api', ORIGIN), null);
  });

  it("returns '' (answer nothing) when the API is the whole site", () => {
    assert.equal(apiPathPrefix('/', ORIGIN), '');
    assert.equal(apiPathPrefix(ORIGIN, ORIGIN), '');
  });
});

describe('classifyRequest', () => {
  it('answers navigations with the app shell and precached build files', () => {
    assert.equal(classifyRequest(req('/', { mode: 'navigate' }), policy()), 'navigation');
    assert.equal(classifyRequest(req('/some/page?x=1', { mode: 'navigate' }), policy()), 'navigation');
    assert.equal(classifyRequest(req('/assets/index-abc.js'), policy()), 'asset');
    assert.equal(classifyRequest(req('/manifest.webmanifest'), policy()), 'asset');
  });

  it('never answers API requests, including navigations and look-alike query strings', () => {
    for (const path of ['/api', '/api/', '/api/auth/me', '/api/students?section=A', '/api/reports/attendance', '/api/admin/audit-logs', '/api/dev/dismissal-otp/K1']) {
      assert.equal(classifyRequest(req(path), policy()), null, path);
      assert.equal(classifyRequest(req(path, { mode: 'navigate' }), policy()), null, `navigate ${path}`);
    }
  });

  it('never answers a custom same-origin API prefix, and always excludes /api', () => {
    const custom = policy(`${ORIGIN}/backend/api`);
    assert.equal(classifyRequest(req('/backend/api/students', { mode: 'navigate' }), custom), null);
    assert.equal(classifyRequest(req('/api/students', { mode: 'navigate' }), custom), null);
    assert.equal(classifyRequest(req('/backend/apiary', { mode: 'navigate' }), custom), 'navigation');
  });

  it('never answers Firebase Auth helper paths or other origins (API host, Google sign-in)', () => {
    assert.equal(classifyRequest(req('/__/auth/handler', { mode: 'navigate' }), policy()), null);
    const crossOrigin = [
      'https://api.school.example/api/students',
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',
      'https://securetoken.googleapis.com/v1/token',
    ];
    for (const url of crossOrigin) {
      assert.equal(classifyRequest({ method: 'GET', mode: 'cors', url, headers: new Headers() }, policy('https://api.school.example/api')), null, url);
    }
  });

  it('never answers non-GET requests (scans, OTP, release, evaluations)', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      assert.equal(classifyRequest(req('/index.html', { method }), policy()), null, method);
      assert.equal(classifyRequest(req('/', { method, mode: 'navigate' }), policy()), null, method);
    }
  });

  it('never answers a request carrying an Authorization header', () => {
    assert.equal(classifyRequest(req('/assets/index-abc.js', { headers: { Authorization: 'Bearer x' } }), policy()), null);
  });

  it('ignores files that are not in the precache list, and query-string variants', () => {
    assert.equal(classifyRequest(req('/assets/other.js'), policy()), null);
    assert.equal(classifyRequest(req('/assets/index-abc.js?v=2'), policy()), null);
    assert.equal(classifyRequest(req('/sw.js'), policy()), null);
  });

  it('fails closed when the API is configured at the site root or the URL is invalid', () => {
    assert.equal(classifyRequest(req('/', { mode: 'navigate' }), policy('/')), null);
    assert.equal(classifyRequest({ method: 'GET', url: 'not a url', headers: new Headers() }, policy()), null);
  });
});

describe('shell cache names', () => {
  it('only treats this app\'s OLD shell caches as stale', () => {
    const current = shellCacheName('v2');
    assert.equal(isStaleShellCache(shellCacheName('v1'), current), true);
    assert.equal(isStaleShellCache(current, current), false);
    assert.equal(isStaleShellCache('some-other-app-cache', current), false);
    assert.equal(isStaleShellCache('firebase-cache', current), false);
  });
});
