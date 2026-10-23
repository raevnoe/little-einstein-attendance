// Phase 11 hardening: security headers, admin-only parent contact details, error details.
// NODE_ENV is NOT set here (like a forgotten deployment setting): error details stay hidden.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;

before(async () => {
  delete process.env.NODE_ENV;
  api = await startTestApi();
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    parent: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
  };
  api.addStudent({ studentId: 'K2026-001', firstName: 'Ana', parentIds: ['parentA'] });
});

after(() => api.close());

const EXPECTED_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
};

describe('security headers', () => {
  test('are sent on success, error and not-found responses', async () => {
    const responses = [
      await api.call('GET', '/health'),
      await api.call('GET', '/students', { token: tokens.teacher }),
      await api.call('GET', '/students'), // 401
      await api.call('GET', '/no-such-route'), // 404
    ];
    for (const res of responses) {
      for (const [name, value] of Object.entries(EXPECTED_HEADERS)) assert.equal(res.headers[name], value, `${name} on ${res.status}`);
      assert.equal(res.headers['x-powered-by'], undefined);
    }
  });
});

describe('parent contact details', () => {
  test('teachers see parent names and whether an SMS number exists, not the email or number', async () => {
    const res = await api.call('GET', '/students/K2026-001', { token: tokens.teacher });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.student.parents, [{ uid: 'parentA', displayName: 'parentA Test', active: true, hasMobileNumber: true }]);
    assert.ok(!res.text.includes('+639171111111'));
    assert.ok(!res.text.includes('@example.com'));
  });

  test('admins still get them (they manage SMS numbers)', async () => {
    const res = await api.call('GET', '/students/K2026-001', { token: tokens.admin });
    assert.deepEqual(res.body.student.parents[0], {
      uid: 'parentA', displayName: 'parentA Test', active: true, hasMobileNumber: true,
      email: 'parentA@example.com', mobileNumber: '+639171111111',
    });
  });

  test('parents still cannot use the staff student API', async () => {
    assert.equal((await api.call('GET', '/students/K2026-001', { token: tokens.parent })).status, 403);
  });
});

describe('error details', () => {
  test('an unexpected error with NODE_ENV unset returns a generic message and no stack', async () => {
    api.fake.failWrites('students');
    const original = console.error;
    console.error = () => {};
    try {
      const res = await api.call('POST', '/students/K2026-001/deactivate', { token: tokens.admin });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { error: { message: 'Internal server error' } });
    } finally {
      console.error = original;
      api.fake.failWrites('students', false);
    }
  });

  test('client errors keep their helpful message', async () => {
    const res = await api.call('GET', '/students/not%20an%20id', { token: tokens.admin });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.message, 'Invalid Student ID.');
  });
});
