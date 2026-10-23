// Starts the real Express app on a random local port with Firebase replaced by the in-memory
// fake and SMS_PROVIDER=mock. No real Firebase project, credentials or SMS are ever used.
// Requires `node --test --experimental-test-module-mocks` (see server/package.json).
import { mock } from 'node:test';
import { once } from 'node:events';
import { createFakeFirebase } from './fakeFirebase.js';

// `smsProvider` lets a test file start the app as if another provider were configured (e.g.
// NODE_ENV=production + iprog); tests then swap in a fake-fetch provider, so nothing is sent.
export async function startTestApi({ smsProvider = 'mock' } = {}) {
  process.env.SMS_PROVIDER = smsProvider;
  process.env.IPROG_SMS_API_TOKEN = '';
  process.env.PHILSMS_API_TOKEN = '';

  const fake = createFakeFirebase();
  mock.module(new URL('../../src/config/firebaseAdmin.js', import.meta.url).href, {
    namedExports: { db: fake.db, adminAuth: fake.adminAuth },
  });

  const { createApp } = await import('../../src/app.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;

  /** call('POST', '/parent/fetchers', { token, body }) -> { status, body } */
  async function call(method, path, { token, body, headers = {} } = {}) {
    const init = { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } };
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetch(`${base}${path}`, init);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null, text, headers: Object.fromEntries(response.headers) };
  }

  /** Creates users/{uid} and a sign-in token "tok-<uid>" whose verified role claim is `role`. */
  function addUser({ uid, role, active = true, mobileNumber, firstName = uid, lastName = 'Test', claimRole = role }) {
    fake.seed('users', uid, {
      uid, email: `${uid}@example.com`, firstName, lastName, displayName: `${firstName} ${lastName}`,
      role, active, ...(mobileNumber ? { mobileNumber } : {}),
    });
    fake.addToken(`tok-${uid}`, { uid, email: `${uid}@example.com`, role: claimRole });
    return `tok-${uid}`;
  }

  function addStudent({ studentId, firstName = 'Child', lastName = 'Test', parentIds = [], active = true, section = 'K1', rfidCardUid = null }) {
    fake.seed('students', studentId, {
      studentId, firstName, middleName: '', lastName, dateOfBirth: '2021-01-01', gender: 'Female',
      section, parentIds, active, rfidCardUid,
    });
  }

  return { fake, call, addUser, addStudent, close: () => new Promise((resolve) => server.close(resolve)) };
}
