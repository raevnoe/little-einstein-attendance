// Phase 12: while the browser is offline no API request is sent (nothing is queued or replayed),
// and the user sees the standard offline message. Online behaviour is unchanged.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, createApiRequest } from '../src/lib/apiCore.js';
import { OFFLINE_MESSAGE } from '../src/lib/format.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function setup({ offline = false, respond = () => json(200, { ok: true }), user = null } = {}) {
  const state = { offline };
  const calls = [];
  const apiRequest = createApiRequest({
    baseUrl: '/api',
    getCurrentUser: () => user,
    isOffline: () => state.offline,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return respond(url, init, calls.length);
    },
  });
  return { apiRequest, calls, state };
}

const fakeUser = () => {
  const tokens = [];
  return { tokens, getIdToken: async (force) => { tokens.push(force); return force ? 'fresh' : 'cached'; } };
};

describe('apiRequest offline guard', () => {
  const OPERATIONS = [
    ['/attendance/scan', { method: 'POST', body: { uid: 'E200' } }],
    ['/performance', { method: 'POST', body: {} }],
    ['/dismissals/K1/request', { method: 'POST', body: {} }],
    ['/dismissals/K1/verify', { method: 'POST', body: { code: '123456' } }],
    ['/dismissals/K1/release', { method: 'POST', body: {} }],
    ['/students', { method: 'POST', body: {} }],
    ['/rfid-cards/E200/assign', { method: 'POST', body: {} }],
    ['/fetchers', { method: 'POST', body: {} }],
    ['/admin/users/u1/mobile-number', { method: 'PATCH', body: {} }],
    ['/students', { method: 'GET' }],
  ];

  it('sends nothing and returns the offline message for every operation', async () => {
    const { apiRequest, calls } = setup({ offline: true, user: fakeUser() });
    for (const [path, options] of OPERATIONS) {
      await assert.rejects(apiRequest(path, options), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.message, OFFLINE_MESSAGE);
        assert.equal(error.code, 'network/offline');
        assert.equal(error.status, 0);
        return true;
      });
    }
    assert.equal(calls.length, 0);
  });

  it('does not replay a blocked request when the connection returns', async () => {
    const { apiRequest, calls, state } = setup({ offline: true });
    await assert.rejects(apiRequest('/attendance/scan', { method: 'POST', body: { uid: 'E200' } }));
    state.offline = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(calls.length, 0);
    await apiRequest('/auth/me'); // a NEW request made by the user afterwards is sent normally
    assert.deepEqual(calls.map((c) => c.url), ['/api/auth/me']);
  });

  it('reports the offline message when the network drops during the request', async () => {
    const { apiRequest, state } = setup({ respond: () => { state.offline = true; throw new TypeError('Failed to fetch'); } });
    await assert.rejects(apiRequest('/students'), { message: OFFLINE_MESSAGE, code: 'network/offline' });
  });
});

describe('apiRequest online behaviour (unchanged)', () => {
  it('sends JSON with the Bearer token and returns the data', async () => {
    const user = fakeUser();
    const { apiRequest, calls } = setup({ user, respond: () => json(201, { student: { id: 'K1' } }) });
    assert.deepEqual(await apiRequest('/students', { method: 'POST', body: { a: 1 } }), { student: { id: 'K1' } });
    assert.equal(calls[0].url, '/api/students');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer cached');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.body, '{"a":1}');
  });

  it('still says the server cannot be reached when online but the API is down', async () => {
    const { apiRequest } = setup({ respond: () => { throw new TypeError('Failed to fetch'); } });
    await assert.rejects(apiRequest('/students'), { code: 'network/unavailable', message: /Cannot reach the server/ });
    const proxyDown = setup({ respond: () => new Response('Bad gateway', { status: 502 }) });
    await assert.rejects(proxyDown.apiRequest('/students'), { code: 'network/unavailable', status: 502 });
  });

  it('passes API errors through with status, code and details', async () => {
    const { apiRequest } = setup({ respond: () => json(403, { error: { message: 'You do not have permission to perform this action.', code: 'auth/forbidden' } }) });
    await assert.rejects(apiRequest('/admin/overview'), { status: 403, code: 'auth/forbidden' });
  });

  it('retries exactly once with a fresh token when the role claim is stale', async () => {
    const user = fakeUser();
    const { apiRequest, calls } = setup({
      user,
      respond: (_url, _init, n) => (n === 1 ? json(401, { error: { message: 'stale', code: 'auth/claims-stale' } }) : json(200, { ok: 1 })),
    });
    assert.deepEqual(await apiRequest('/auth/me'), { ok: 1 });
    assert.equal(calls.length, 2);
    assert.deepEqual(user.tokens, [false, true]);
  });
});

describe('apiRequest when something other than the API answers', () => {
  it('index.html from static hosting (no backend deployed) is "Cannot reach the server", not null', async () => {
    const html = () => new Response('<!doctype html><html></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const { apiRequest } = setup({ respond: html });
    await assert.rejects(apiRequest('/auth/me'), (err) => err instanceof ApiError && err.code === 'network/unavailable'
      && /Cannot reach the server/.test(err.message));
  });

  it('a JSON null body is rejected the same way', async () => {
    const { apiRequest } = setup({ respond: () => json(200, null) });
    await assert.rejects(apiRequest('/auth/me'), (err) => err.code === 'network/unavailable');
  });
});
