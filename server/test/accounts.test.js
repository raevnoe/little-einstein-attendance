// Admin account management: list accounts and create admin/teacher/parent accounts.
// Firebase is the in-memory fake: no real accounts are created and no email is sent.
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;

before(async () => {
  api = await startTestApi();
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin', firstName: 'Ada' }),
    inactiveAdmin: api.addUser({ uid: 'admin3', role: 'admin', active: false }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher', firstName: 'Tess' }),
    parent: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    escalator: api.addUser({ uid: 'parentC', role: 'parent', claimRole: 'admin' }),
  };
});

afterEach(() => {
  api.fake.failWrites('auditLogs', false);
  api.fake.failAuthCreate(null);
});

after(() => api.close());

const call = (method, path, token, body) => api.call(method, path, { token, body });
const NEW_PARENT = { email: ' Maria.Cruz@Example.com ', firstName: 'Maria', lastName: 'Cruz', role: 'parent', mobileNumber: '0917 555 1234' };
const authUserByEmail = (email) => api.fake.authUsers().find((u) => u.email === email);

describe('access', () => {
  test('requires a signed-in active admin (verified claim, not a client-supplied role)', async () => {
    for (const method of ['GET', 'POST']) {
      const body = method === 'POST' ? NEW_PARENT : undefined;
      assert.equal((await call(method, '/admin/users')).status, 401);
      assert.equal((await call(method, '/admin/users', 'forged-token')).status, 401);
      assert.equal((await call(method, '/admin/users', tokens.teacher, body)).status, 403);
      assert.equal((await call(method, '/admin/users', tokens.parent, body)).status, 403);
      assert.equal((await call(method, '/admin/users', tokens.inactiveAdmin, body)).status, 403);
      // Token claims admin but the profile says parent: refused as a stale claim (client refreshes it).
      assert.equal((await call(method, '/admin/users', tokens.escalator, body)).status, 401);
    }
    const res = await api.call('POST', '/admin/users', { token: tokens.teacher, body: NEW_PARENT, headers: { 'X-Role': 'admin' } });
    assert.equal(res.status, 403);
    assert.equal(authUserByEmail('maria.cruz@example.com'), undefined, 'nothing created by a refused request');
  });
});

describe('GET /api/admin/users', () => {
  test('lists every account by name, with public fields only', async () => {
    const res = await call('GET', '/admin/users', tokens.admin);
    assert.equal(res.status, 200);
    const uids = res.body.users.map((u) => u.uid);
    for (const uid of ['admin1', 'admin3', 'teacher1', 'parentA']) assert.ok(uids.includes(uid), uid);
    const names = res.body.users.map((u) => u.displayName);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.deepEqual(Object.keys(res.body.users[0]).sort(),
      ['active', 'attendanceSms', 'createdAt', 'displayName', 'email', 'firstName', 'lastName', 'mobileNumber', 'role', 'sections', 'uid', 'updatedAt']);
  });
});

describe('POST /api/admin/users', () => {
  test('creates a parent: Auth user + role claim + profile + audit entry, password never returned', async () => {
    const res = await call('POST', '/admin/users', tokens.admin, NEW_PARENT);
    assert.equal(res.status, 201);
    const { user } = res.body;
    assert.equal(user.email, 'maria.cruz@example.com');
    assert.equal(user.role, 'parent');
    assert.equal(user.active, true);
    assert.equal(user.mobileNumber, '+639175551234');

    const authUser = authUserByEmail('maria.cruz@example.com');
    assert.equal(authUser.uid, user.uid);
    assert.deepEqual(authUser.customClaims, { role: 'parent' });
    assert.ok(authUser.password.length >= 40, 'long random password');
    assert.ok(!res.text.includes(authUser.password), 'password is not in the response');

    const profile = api.fake.read('users', user.uid);
    assert.equal(profile.uid, user.uid);
    assert.equal(profile.role, 'parent');
    assert.equal(profile.displayName, 'Maria Cruz');
    assert.ok(!('password' in profile));

    const entry = api.fake.all('auditLogs').find((e) => e.eventType === 'user.created' && e.target.id === user.uid);
    assert.equal(entry.actor.uid, 'admin1');
    assert.equal(entry.actor.role, 'admin');
    assert.equal(entry.route, 'POST /api/admin/users');
    assert.deepEqual(entry.details, { role: 'parent' });
    // Timestamps and the random uid are left out: their digits could contain "555" by chance.
    const { occurredAt, createdAt, target, ...rest } = entry;
    const stored = JSON.stringify(rest);
    assert.ok(!stored.includes('maria') && !stored.includes('555'), 'no email or number in the audit entry');
  });

  test('creates teacher and admin accounts (no mobile number)', async () => {
    for (const role of ['teacher', 'admin']) {
      const res = await call('POST', '/admin/users', tokens.admin, { email: `new.${role}@example.com`, firstName: 'New', lastName: role, role });
      assert.equal(res.status, 201, role);
      assert.equal(res.body.user.role, role);
      assert.equal(res.body.user.mobileNumber, null);
      assert.deepEqual(authUserByEmail(`new.${role}@example.com`).customClaims, { role });
    }
  });

  test('the new account can then be deactivated with the existing endpoint', async () => {
    const created = await call('POST', '/admin/users', tokens.admin, { email: 'short.term@example.com', firstName: 'Short', lastName: 'Term', role: 'teacher' });
    const res = await call('POST', `/admin/users/${created.body.user.uid}/deactivate`, tokens.admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.active, false);
  });

  test('rejects invalid input with a field error and creates nothing', async () => {
    const cases = [
      [{ ...NEW_PARENT, email: 'not-an-email' }, 'email'],
      [{ ...NEW_PARENT, email: 'x.fetcher@example.com', role: 'fetcher' }, 'role'],
      [{ ...NEW_PARENT, email: 'x.student@example.com', role: 'student' }, 'role'],
      [{ ...NEW_PARENT, email: 'x.none@example.com', role: undefined }, 'role'],
      [{ ...NEW_PARENT, email: 'x.first@example.com', firstName: '  ' }, 'firstName'],
      [{ ...NEW_PARENT, email: 'x.last@example.com', lastName: 'L'.repeat(61) }, 'lastName'],
      [{ ...NEW_PARENT, email: 'x.mobile@example.com', mobileNumber: '12345' }, 'mobileNumber'],
      [{ ...NEW_PARENT, email: 'x.mobile2@example.com', mobileNumber: 9175551234 }, 'mobileNumber'],
      [{ email: 'x.teacher@example.com', firstName: 'T', lastName: 'M', role: 'teacher', mobileNumber: '09175551234' }, 'mobileNumber'],
    ];
    const before = api.fake.authUsers().length;
    for (const [body, field] of cases) {
      const res = await call('POST', '/admin/users', tokens.admin, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.ok(res.body.error.details.fields[field], `${field} error for ${JSON.stringify(body)}`);
    }
    assert.equal(api.fake.authUsers().length, before);
  });

  test('refuses client-controlled fields such as uid, active, password or claims', async () => {
    for (const extra of [{ uid: 'chosen-uid' }, { active: false }, { password: 'Secret123' }, { customClaims: { role: 'admin' } }]) {
      const res = await call('POST', '/admin/users', tokens.admin, { ...NEW_PARENT, email: 'extra@example.com', ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal(res.body.error.code, 'validation/invalid-request');
    }
    assert.equal(authUserByEmail('extra@example.com'), undefined);
    assert.equal((await call('POST', '/admin/users', tokens.admin, ['not', 'an', 'object'])).status, 400);
  });

  test('a duplicate email is a 409 conflict (case-insensitive)', async () => {
    const res = await call('POST', '/admin/users', tokens.admin, { ...NEW_PARENT, email: 'MARIA.CRUZ@example.com' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'users/email-exists');
    assert.ok(res.body.error.details.fields.email);
  });

  test('if the profile/audit write fails, the Auth user is deleted (no half-made account)', async () => {
    api.fake.failWrites('auditLogs');
    const res = await call('POST', '/admin/users', tokens.admin, { ...NEW_PARENT, email: 'half.made@example.com' });
    assert.equal(res.status, 500);
    assert.equal(authUserByEmail('half.made@example.com'), undefined);
    assert.equal(api.fake.all('users').find((u) => u.email === 'half.made@example.com'), undefined);
  });

  test('if Firebase Auth refuses, nothing is stored and no internal detail is returned', async () => {
    api.fake.failAuthCreate('auth/internal-error');
    const res = await call('POST', '/admin/users', tokens.admin, { ...NEW_PARENT, email: 'auth.down@example.com' });
    assert.equal(res.status, 500);
    assert.equal(api.fake.all('users').find((u) => u.email === 'auth.down@example.com'), undefined);
  });
});
