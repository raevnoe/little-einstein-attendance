// Development-only dismissal-code read-back (NODE_ENV=test/development + SMS_PROVIDER=mock).
// Firebase is the in-memory fake; SMS goes to the mock provider or an IPROG provider with a
// fake fetch. No real SMS is sent. The production case is in devOtp.production.test.js.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let sms;
let tokens;
let fetchers;
let dismissal;
let smsService;
let mockProvider;
let outbox;
let today;
let clockMs;
let t0;

const ANA = 'K2026-001';
const CARA = 'K2026-003';

before(async () => {
  api = await startTestApi();
  dismissal = await import('../src/services/dismissal.service.js');
  smsService = await import('../src/services/sms/sms.service.js');
  mockProvider = await import('../src/services/sms/mock.provider.js');
  outbox = await import('../src/services/sms/devOtpOutbox.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  t0 = Date.parse(`${today}T01:00:00Z`); // 9:00 AM in Asia/Manila
  dismissal.setDismissalClockForTests(() => clockMs);

  tokens = {
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    // Also linked to Ana, but did not request the code (not the SMS recipient).
    coParent: api.addUser({ uid: 'coParent', role: 'parent', mobileNumber: '+639174444444' }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' }),
    inactiveParent: api.addUser({ uid: 'inactiveParent', role: 'parent', active: false }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA', 'coParent', 'inactiveParent'] });
  api.addStudent({ studentId: CARA, firstName: 'Cara', parentIds: ['parentB'] });

  const make = async (token, body) => (await api.call('POST', '/parent/fetchers', { token, body })).body.fetcher.fetcherId;
  fetchers = {
    maria: await make(tokens.parentA, { fullName: 'Maria Santos', relationship: 'Grandmother', studentIds: [ANA] }),
    rosa: await make(tokens.parentB, { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: [CARA] }),
  };
});

after(async () => {
  dismissal.setDismissalClockForTests(null);
  smsService.setSmsProviderForTests(null);
  await api.close();
});

beforeEach(() => {
  clockMs = t0;
  api.fake.clear('dismissalRecords');
  outbox.clearDevOtpOutboxForTests();
  sms = mockProvider.createMockSmsProvider();
  smsService.setSmsProviderForTests(sms);
});

const idOf = (studentId) => `${studentId}_${today}`;
const requestCode = (token = tokens.parentA, studentId = ANA, fetcherId = fetchers.maria) =>
  api.call('POST', '/parent/dismissals', { token, body: { studentId, fetcherId } });
const devOtp = (token = tokens.parentA, studentId = ANA) => api.call('GET', `/dev/dismissal-otp/${studentId}`, { token });
const verify = (otp, requestNumber = 1) =>
  api.call('POST', `/dismissals/${idOf(ANA)}/verify`, { token: tokens.teacher, body: { otp, requestNumber } });
const smsCode = () => /dismissal code is (\d{6})\./.exec(sms.sent.at(-1).message)[1];

async function captureConsole(fn) {
  const lines = [];
  const originals = {};
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[level] = console[level];
    console[level] = (...args) => lines.push(args.map(String).join(' '));
  }
  try {
    return { result: await fn(), output: lines.join('\n') };
  } finally {
    Object.assign(console, originals);
  }
}

describe('enable rule', () => {
  test('enabled only outside production, with SMS_PROVIDER=mock AND the mock provider in use', () => {
    const on = { nodeEnv: 'development', configuredProvider: 'mock', activeProvider: 'mock' };
    assert.equal(outbox.isDevOtpOutboxEnabled(on), true);
    assert.equal(outbox.isDevOtpOutboxEnabled({ ...on, nodeEnv: 'test' }), true);
    assert.equal(outbox.isDevOtpOutboxEnabled({ ...on, nodeEnv: 'production' }), false);
    assert.equal(outbox.isDevOtpOutboxEnabled({ ...on, configuredProvider: 'iprog' }), false);
    assert.equal(outbox.isDevOtpOutboxEnabled({ ...on, configuredProvider: 'philsms' }), false);
    assert.equal(outbox.isDevOtpOutboxEnabled({ ...on, activeProvider: 'iprog' }), false);
    assert.equal(outbox.isDevOtpOutboxEnabled({ nodeEnv: 'production', configuredProvider: 'iprog', activeProvider: 'iprog' }), false);
  });
});

describe('dev mode + mock SMS', () => {
  test('the requesting parent can read the code, and the teacher can verify with it', async () => {
    const { result: res, output } = await captureConsole(() => requestCode());
    assert.equal(res.status, 201);

    const peek = await devOtp();
    assert.equal(peek.status, 200);
    assert.equal(peek.body.devOnly, true);
    assert.match(peek.body.otp, /^\d{6}$/);
    assert.equal(peek.body.otp, smsCode(), 'same code the mock SMS carried');
    assert.equal(peek.body.dismissalId, idOf(ANA));
    assert.equal(peek.body.requestNumber, 1);
    assert.equal(peek.headers['cache-control'], 'no-store');

    // Normal responses, Firestore and the console never contain the code.
    const code = peek.body.otp;
    const parentList = await api.call('GET', '/parent/dismissals', { token: tokens.parentA });
    const staffList = await api.call('GET', '/dismissals', { token: tokens.teacher });
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.ok(!Object.values(record).includes(code), 'no Firestore field holds the plain code');
    assert.ok(!JSON.stringify(record).includes(`is ${code}`), 'SMS text not stored');
    for (const text of [res.text, parentList.text, staffList.text, output]) {
      assert.ok(!text.includes(code), 'code not in normal responses or logs');
    }
    assert.match(record.otpHash, /^[0-9a-f]{64}$/, 'still stored only as a hash');

    // The code still goes through the normal hash check, and is single use.
    assert.equal((await verify(code)).status, 200);
    assert.equal((await verify(code)).status, 409);
    const afterUse = await devOtp();
    assert.equal(afterUse.status, 404, 'not returned once used');
  });

  test('reading the code does not log it', async () => {
    await requestCode();
    const { result, output } = await captureConsole(() => devOtp());
    assert.equal(result.status, 200);
    assert.ok(!output.includes(result.body.otp));
  });

  test('a new code replaces the old one; the old one is never returned', async () => {
    await requestCode();
    const first = (await devOtp()).body.otp;
    clockMs = t0 + 61_000; // after the cooldown
    assert.equal((await requestCode()).status, 201);
    const second = await devOtp();
    assert.equal(second.body.requestNumber, 2);
    assert.equal(second.body.otp, smsCode());
    if (first !== second.body.otp) {
      assert.equal((await verify(first, 2)).status, 400, 'old code rejected');
    }
    assert.equal((await verify(second.body.otp, 2)).status, 200);
  });

  test('expired and locked codes are not returned', async () => {
    await requestCode();
    clockMs = t0 + 11 * 60_000;
    assert.equal((await devOtp()).status, 404, 'expired');

    clockMs = t0 + 12 * 60_000;
    await requestCode();
    const code = (await devOtp()).body.otp;
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    for (let i = 0; i < 5; i += 1) await verify(wrong, 2);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'locked');
    assert.equal((await devOtp()).status, 404, 'locked');
  });

  test('failed SMS leaves nothing to read', async () => {
    sms.send = async () => ({ ok: false, providerMessageId: null, error: { code: 'provider-error', message: 'x' } });
    assert.equal((await requestCode()).status, 502);
    assert.equal(outbox.devOtpOutboxSizeForTests(), 0);
    assert.equal((await devOtp()).status, 404);
  });
});

describe('access control', () => {
  test('requires authentication', async () => {
    await requestCode();
    assert.equal((await api.call('GET', `/dev/dismissal-otp/${ANA}`)).status, 401);
    assert.equal((await api.call('GET', `/dev/dismissal-otp/${ANA}`, { token: 'forged-token' })).status, 401);
  });

  test('teachers and admins cannot read codes', async () => {
    await requestCode();
    assert.equal((await devOtp(tokens.teacher)).status, 403);
    assert.equal((await devOtp(tokens.admin)).status, 403);
  });

  test('an unrelated parent cannot read another family\'s code', async () => {
    await requestCode();
    const res = await devOtp(tokens.parentB, ANA);
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes(smsCode()));
  });

  test('a co-parent who did not request the code cannot read it', async () => {
    await requestCode();
    const res = await devOtp(tokens.coParent, ANA);
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes(smsCode()));
  });

  test('an inactive parent account is refused', async () => {
    await requestCode();
    assert.equal((await devOtp(tokens.inactiveParent, ANA)).status, 403);
  });

  test('each parent reads only their own child\'s current code', async () => {
    await requestCode();
    await requestCode(tokens.parentB, CARA, fetchers.rosa);
    const own = await devOtp(tokens.parentB, CARA);
    assert.equal(own.status, 200);
    assert.equal(own.body.otp, smsCode());
    assert.equal(own.body.dismissalId, idOf(CARA));
  });

  test('malformed student IDs are rejected', async () => {
    const res = await devOtp(tokens.parentA, 'not a valid id!!');
    assert.ok([400, 404].includes(res.status));
  });
});

describe('disabled when a real provider is in use', () => {
  test('IPROG (fake fetch): nothing is remembered and the route answers 404', async () => {
    const { createIprogSmsProvider } = await import('../src/services/sms/iprog.provider.js');
    let message = null;
    smsService.setSmsProviderForTests(createIprogSmsProvider({
      apiToken: 'test-token',
      fetchImpl: async (url, init) => {
        message = JSON.parse(init.body).message;
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 200, message_id: 'iSms-1' }) };
      },
    }));
    const res = await requestCode();
    assert.equal(res.status, 201);
    const code = /dismissal code is (\d{6})\./.exec(message)[1];
    assert.ok(!res.text.includes(code));
    assert.equal(outbox.devOtpOutboxSizeForTests(), 0, 'code not kept in memory');

    const peek = await devOtp();
    assert.equal(peek.status, 404);
    assert.ok(!peek.text.includes(code));
    assert.equal((await verify(code)).status, 200, 'normal flow unaffected');
  });
});
