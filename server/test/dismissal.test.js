// Dismissal Verification (OTP) API. Firebase is an in-memory fake and SMS goes to the mock
// provider (or an IPROG provider with a fake fetch): no real SMS is sent, no credits are used.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let sms; // current mock provider
let tokens;
let fetchers;
let dismissal; // dismissal.service module
let smsService;
let mockProvider;
let schoolDateOf;

const T0_HOUR_UTC = '01:00:00Z'; // 9:00 AM in Asia/Manila
let today;
let t0;
let clockMs;

const ANA = 'K2026-001';
const BEN = 'K2026-002';
const CARA = 'K2026-003';
const EVE = 'K2026-005';
const FAY = 'K2026-006';

before(async () => {
  api = await startTestApi();
  dismissal = await import('../src/services/dismissal.service.js');
  smsService = await import('../src/services/sms/sms.service.js');
  mockProvider = await import('../src/services/sms/mock.provider.js');
  ({ schoolDateOf } = await import('../src/utils/schoolDate.js'));

  today = schoolDateOf(new Date());
  t0 = Date.parse(`${today}T${T0_HOUR_UTC}`);
  dismissal.setDismissalClockForTests(() => clockMs);

  tokens = {
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' }),
    parentFail: api.addUser({ uid: 'parentFail', role: 'parent', mobileNumber: `+639173339990` }), // mock failure suffix
    parentNoMobile: api.addUser({ uid: 'parentNoMobile', role: 'parent' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    teacher2: api.addUser({ uid: 'teacher2', role: 'teacher' }),
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] });
  api.addStudent({ studentId: BEN, firstName: 'Ben', parentIds: ['parentA'] });
  api.addStudent({ studentId: CARA, firstName: 'Cara', parentIds: ['parentB'] });
  api.addStudent({ studentId: EVE, firstName: 'Eve', parentIds: ['parentFail'] });
  api.addStudent({ studentId: FAY, firstName: 'Fay', parentIds: ['parentNoMobile'] });

  const make = async (token, body) => (await api.call('POST', '/parent/fetchers', { token, body })).body.fetcher.fetcherId;
  fetchers = {
    maria: await make(tokens.parentA, { fullName: 'Maria Santos', relationship: 'Grandmother', studentIds: [ANA, BEN] }),
    lito: await make(tokens.parentA, { fullName: 'Lito Lim', relationship: 'Driver', studentIds: [ANA] }),
    rosa: await make(tokens.parentB, { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: [CARA] }),
    eveFetcher: await make(tokens.parentFail, { fullName: 'Ella Cruz', relationship: 'Aunt', studentIds: [EVE] }),
    fayFetcher: await make(tokens.parentNoMobile, { fullName: 'Fe Diaz', relationship: 'Aunt', studentIds: [FAY] }),
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
  sms = mockProvider.createMockSmsProvider();
  smsService.setSmsProviderForTests(sms);
  // Restore Fetchers a previous test may have changed.
  api.fake.patch('fetchers', fetchers.maria, { active: true, fullName: 'Maria Santos', relationship: 'Grandmother', studentIds: [ANA, BEN] });
  api.fake.patch('fetchers', fetchers.lito, { active: true, fullName: 'Lito Lim', relationship: 'Driver', studentIds: [ANA] });
});

const idOf = (studentId) => `${studentId}_${today}`;
const requestCode = (token, studentId, fetcherId) =>
  api.call('POST', '/parent/dismissals', { token, body: { studentId, fetcherId } });
const verify = (dismissalId, otp, requestNumber = 1, token = tokens.teacher) =>
  api.call('POST', `/dismissals/${dismissalId}/verify`, { token, body: { otp, requestNumber } });
const release = (dismissalId, requestNumber = 1, token = tokens.teacher) =>
  api.call('POST', `/dismissals/${dismissalId}/release`, { token, body: { requestNumber } });

/** The code from the last SMS the mock provider "sent". */
function lastCode() {
  const match = /dismissal code is (\d{6})\./.exec(sms.sent.at(-1)?.message ?? '');
  assert.ok(match, 'an SMS with a code was sent');
  return match[1];
}
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

/** Captures everything written to the console while `fn` runs. */
async function captureConsole(fn) {
  const lines = [];
  const originals = {};
  for (const level of ['log', 'info', 'warn', 'error']) {
    originals[level] = console[level];
    console[level] = (...args) => lines.push(args.map(String).join(' '));
  }
  try {
    return { result: await fn(), output: lines.join('\n') };
  } finally {
    Object.assign(console, originals);
  }
}

describe('code generation', () => {
  test('generateOtp returns 6 random digits', () => {
    const codes = Array.from({ length: 200 }, () => dismissal.generateOtp());
    assert.ok(codes.every((c) => /^\d{6}$/.test(c)));
    assert.ok(new Set(codes).size > 190, 'codes are not repeated');
  });
});

describe('parent requests a code', () => {
  test('sends the code ONLY by SMS to the parent and stores only a salted hash', async () => {
    const { result: res, output } = await captureConsole(() => requestCode(tokens.parentA, ANA, fetchers.maria));
    assert.equal(res.status, 201);
    const code = lastCode();

    // SMS: to the requesting parent's registered number, mentions the Fetcher.
    assert.equal(sms.sent.length, 1);
    assert.equal(sms.sent[0].to, '+639171111111');
    assert.match(sms.sent[0].message, /Maria Santos/);

    // Response: status and expiry, never the code or hash.
    assert.equal(res.body.dismissal.status, 'awaiting-verification');
    assert.equal(res.body.dismissal.otpExpiresAt, new Date(t0 + 10 * 60_000).toISOString());
    assert.equal(res.body.dismissal.attemptsRemaining, 5);
    assert.ok(!res.text.includes(code), 'code not in API response');
    assert.ok(!/otpHash|otpSalt/.test(res.text));

    // Firestore: hash + salt, no plain code, no SMS text.
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.match(record.otpHash, /^[0-9a-f]{64}$/);
    assert.match(record.otpSalt, /^[0-9a-f]{32}$/);
    assert.ok(Object.values(record).every((v) => v !== code));
    assert.ok(!JSON.stringify(record).includes(`"${code}"`));
    assert.ok(!('message' in record) && !('message' in (record.sms ?? {})));
    assert.equal(record.studentId, ANA);
    assert.equal(record.parentId, 'parentA');
    assert.equal(record.fetcherId, fetchers.maria);

    // Logs never contain the code.
    assert.ok(!output.includes(code), 'code not logged');
  });

  test('parent sees today’s status of own children only', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const a = await api.call('GET', '/parent/dismissals', { token: tokens.parentA });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.dismissals.map((d) => d.studentId), [ANA]);
    assert.ok(!/otpHash|otpSalt|verifiedBy|releasedBy/.test(a.text));
    const b = await api.call('GET', '/parent/dismissals', { token: tokens.parentB });
    assert.deepEqual(b.body.dismissals, []);
  });

  test('rejects another parent’s child, another parent’s Fetcher, and an unauthorized Fetcher', async () => {
    const otherChild = await requestCode(tokens.parentA, CARA, fetchers.maria);
    assert.equal(otherChild.status, 404);
    const otherFetcher = await requestCode(tokens.parentA, ANA, fetchers.rosa);
    assert.equal(otherFetcher.status, 404);
    const notForThisChild = await requestCode(tokens.parentA, BEN, fetchers.lito);
    assert.equal(notForThisChild.status, 404);
    const unknown = await requestCode(tokens.parentA, ANA, 'AAAAAAAAAAAAAAAAAAAA');
    assert.equal(unknown.status, 404);
    assert.equal(otherFetcher.body.error.message, unknown.body.error.message, 'no detail about whose Fetcher it is');
    assert.equal(sms.sent.length, 0);
    assert.equal(api.fake.all('dismissalRecords').length, 0);
  });

  test('rejects an inactive Fetcher', async () => {
    api.fake.patch('fetchers', fetchers.lito, { active: false });
    const res = await requestCode(tokens.parentA, ANA, fetchers.lito);
    assert.equal(res.status, 404);
    assert.equal(sms.sent.length, 0);
  });

  test('refuses when the parent has no registered mobile number', async () => {
    const res = await requestCode(tokens.parentNoMobile, FAY, fetchers.fayFetcher);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/no-mobile-number');
    assert.equal(sms.sent.length, 0);
    assert.equal(api.fake.all('dismissalRecords').length, 0);
  });

  test('rejects client-supplied extra fields', async () => {
    const res = await api.call('POST', '/parent/dismissals', {
      token: tokens.parentA, body: { studentId: ANA, fetcherId: fetchers.maria, parentId: 'parentB', otp: '123456' },
    });
    assert.equal(res.status, 400);
    assert.equal(sms.sent.length, 0);
  });
});

describe('request limits', () => {
  test('cooldown between requests, then a new code replaces the old one', async () => {
    assert.equal((await requestCode(tokens.parentA, ANA, fetchers.maria)).status, 201);
    const first = lastCode();
    const tooSoon = await requestCode(tokens.parentA, ANA, fetchers.maria);
    assert.equal(tooSoon.status, 429);
    assert.equal(tooSoon.body.error.code, 'dismissal/too-soon');
    assert.equal(sms.sent.length, 1);

    clockMs += 61_000;
    assert.equal((await requestCode(tokens.parentA, ANA, fetchers.lito)).status, 201);
    const second = lastCode();
    // Only one live code: the old one fails on the current request (and its request number is stale).
    assert.equal((await verify(idOf(ANA), first, 1)).status, 409);
    assert.equal((await verify(idOf(ANA), first === second ? wrongCode(first) : first, 2)).status, 400);
    const ok = await verify(idOf(ANA), second, 2);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.dismissal.fetcher.fullName, 'Lito Lim');
  });

  test('daily limit per child', async () => {
    for (let i = 0; i < dismissal.MAX_CODE_REQUESTS_PER_DAY; i += 1) {
      assert.equal((await requestCode(tokens.parentA, ANA, fetchers.maria)).status, 201);
      clockMs += 61_000;
    }
    const res = await requestCode(tokens.parentA, ANA, fetchers.maria);
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'dismissal/daily-limit');
    assert.equal(sms.sent.length, dismissal.MAX_CODE_REQUESTS_PER_DAY);
  });

  test('concurrent requests produce exactly one code and one SMS', async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => requestCode(tokens.parentA, ANA, fetchers.maria)));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 429, 429, 429]);
    assert.equal(sms.sent.length, 1);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).requestCount, 1);
  });
});

describe('SMS failure', () => {
  test('a failed SMS leaves no usable code', async () => {
    const res = await requestCode(tokens.parentFail, EVE, fetchers.eveFetcher);
    assert.equal(res.status, 502);
    assert.equal(res.body.error.code, 'dismissal/sms-failed');
    const record = api.fake.read('dismissalRecords', idOf(EVE));
    assert.equal(record.status, 'sms-failed');
    assert.equal(record.otpHash, undefined);
    assert.equal(record.otpSalt, undefined);
    assert.equal(record.sms.status, 'failed');
    // No code can verify it (brute force is impossible: there is no hash).
    const attempt = await verify(idOf(EVE), '000000');
    assert.equal(attempt.status, 409);
    assert.equal(attempt.body.error.code, 'dismissal/not-verifiable');
    assert.equal(api.fake.read('dismissalRecords', idOf(EVE)).status, 'sms-failed');
  });

  test('IPROG HTTP error (fake fetch) is handled; the token never leaks', async () => {
    const { createIprogSmsProvider } = await import('../src/services/sms/iprog.provider.js');
    const TOKEN = 'secret-iprog-token-abcdefghijklmnopqrstuvwxyz012345';
    let sentBody = null;
    smsService.setSmsProviderForTests(createIprogSmsProvider({
      apiToken: TOKEN,
      fetchImpl: async (url, init) => {
        sentBody = JSON.parse(init.body);
        return { ok: false, status: 500, text: async () => JSON.stringify({ status: 500, message: `bad token ${TOKEN}` }) };
      },
    }));
    const { result: res, output } = await captureConsole(() => requestCode(tokens.parentA, ANA, fetchers.maria));
    assert.equal(res.status, 502);
    assert.equal(sentBody.phone_number, '639171111111');
    const code = /dismissal code is (\d{6})\./.exec(sentBody.message)[1];
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.status, 'sms-failed');
    assert.equal(record.otpHash, undefined);
    for (const text of [res.text, JSON.stringify(record), output]) {
      assert.ok(!text.includes(TOKEN), 'token not exposed');
      assert.ok(!text.includes(code), 'code not exposed');
    }
  });

  test('IPROG success (fake fetch) activates the code', async () => {
    const { createIprogSmsProvider } = await import('../src/services/sms/iprog.provider.js');
    let message = null;
    smsService.setSmsProviderForTests(createIprogSmsProvider({
      apiToken: 'test-token',
      fetchImpl: async (url, init) => {
        message = JSON.parse(init.body).message;
        return { ok: true, status: 200, text: async () => JSON.stringify({ status: 200, message_id: 'iSms-1' }) };
      },
    }));
    assert.equal((await requestCode(tokens.parentA, ANA, fetchers.maria)).status, 201);
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.sms.provider, 'iprog');
    assert.equal(record.sms.providerMessageId, 'iSms-1');
    const code = /dismissal code is (\d{6})\./.exec(message)[1];
    assert.equal((await verify(idOf(ANA), code)).status, 200);
  });
});

describe('teacher verification', () => {
  test('staff list shows the request without codes or hashes', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    const res = await api.call('GET', '/dismissals', { token: tokens.teacher });
    assert.equal(res.status, 200);
    const [row] = res.body.dismissals;
    assert.equal(row.dismissalId, idOf(ANA));
    assert.equal(row.student.name, 'Ana Test');
    assert.equal(row.fetcher.fullName, 'Maria Santos');
    assert.equal(row.parentName, 'parentA Test');
    assert.equal(row.requestNumber, 1);
    assert.ok(!/otpHash|otpSalt|mobileNumber/.test(res.text));
    assert.ok(!res.text.includes(code));
  });

  test('correct code verifies (records the staff from the token) but does not release', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const res = await verify(idOf(ANA), lastCode());
    assert.equal(res.status, 200);
    assert.equal(res.body.dismissal.status, 'verified');
    assert.equal(res.body.dismissal.verifiedBy, 'teacher1');
    assert.equal(res.body.dismissal.releasedAt, null);
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.status, 'verified');
    assert.equal(record.otpHash, undefined, 'code deleted after use');
  });

  test('code with spaces is accepted; malformed codes are rejected without counting', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    assert.equal((await verify(idOf(ANA), '12ab56')).status, 400);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).failedAttempts, 0);
    assert.equal((await verify(idOf(ANA), `${code.slice(0, 3)} ${code.slice(3)}`)).status, 200);
  });

  test('incorrect codes count down, then the request locks', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    const bad = wrongCode(code);
    for (let left = 4; left >= 1; left -= 1) {
      const res = await verify(idOf(ANA), bad);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'dismissal/incorrect-code');
      assert.equal(res.body.error.details.attemptsRemaining, left);
    }
    const locked = await verify(idOf(ANA), bad);
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error.code, 'dismissal/locked');
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.status, 'locked');
    assert.equal(record.failedAttempts, 5);
    assert.equal(record.otpHash, undefined);
    // Even the correct code no longer works.
    assert.equal((await verify(idOf(ANA), code)).status, 409);
    assert.equal((await release(idOf(ANA))).status, 409);
  });

  test('concurrent incorrect attempts are all counted', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const bad = wrongCode(lastCode());
    const results = await Promise.all(Array.from({ length: 7 }, () => verify(idOf(ANA), bad)));
    assert.equal(results.filter((r) => r.status === 400).length, 4);
    assert.equal(results.filter((r) => r.status === 409).length, 3);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'locked');
  });

  test('expired code is rejected and discarded', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    clockMs = t0 + 10 * 60_000 + 1000;
    const view = await api.call('GET', '/parent/dismissals', { token: tokens.parentA });
    assert.equal(view.body.dismissals[0].status, 'expired');
    const res = await verify(idOf(ANA), code);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/expired');
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.status, 'expired');
    assert.equal(record.otpHash, undefined);
  });

  test('code is valid until just before expiry', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    clockMs = t0 + 10 * 60_000 - 1000;
    assert.equal((await verify(idOf(ANA), lastCode())).status, 200);
  });

  test('single use: replaying a verified code fails', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    assert.equal((await verify(idOf(ANA), code)).status, 200);
    const replay = await verify(idOf(ANA), code, 1, tokens.teacher2);
    assert.equal(replay.status, 409);
    assert.equal(replay.body.error.code, 'dismissal/already-used');
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).verifiedBy, 'teacher1');
  });

  test('concurrent verification with the correct code succeeds exactly once', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    const results = await Promise.all([verify(idOf(ANA), code), verify(idOf(ANA), code, 1, tokens.teacher2), verify(idOf(ANA), code)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
  });

  test('a code cannot be used for another student', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const anaCode = lastCode();
    await requestCode(tokens.parentA, BEN, fetchers.maria);
    const benCode = lastCode();
    if (anaCode !== benCode) {
      const res = await verify(idOf(BEN), anaCode);
      assert.equal(res.status, 400);
    }
    // Even a copied hash/salt does not make Ana's code valid for Ben (hash is bound to the record).
    const ana = api.fake.read('dismissalRecords', idOf(ANA));
    api.fake.patch('dismissalRecords', idOf(BEN), { otpHash: ana.otpHash, otpSalt: ana.otpSalt });
    assert.equal((await verify(idOf(BEN), anaCode)).status, 400);
    assert.equal(api.fake.read('dismissalRecords', idOf(BEN)).status, 'awaiting-verification');
  });

  test('a stale request number (code for a previous Fetcher) is refused', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    clockMs += 61_000;
    await requestCode(tokens.parentA, ANA, fetchers.lito);
    const res = await verify(idOf(ANA), lastCode(), 1);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/request-changed');
  });

  test('Fetcher deactivated after the code was sent: verification fails and the request is cancelled', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    assert.equal((await api.call('POST', `/parent/fetchers/${fetchers.maria}/deactivate`, { token: tokens.parentA })).status, 200);
    const res = await verify(idOf(ANA), code);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/fetcher-not-authorized');
    const record = api.fake.read('dismissalRecords', idOf(ANA));
    assert.equal(record.status, 'cancelled');
    assert.equal(record.otpHash, undefined);
  });

  test('Fetcher no longer authorized for the child or renamed: verification fails', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await api.call('PATCH', `/parent/fetchers/${fetchers.maria}`, { token: tokens.parentA, body: { studentIds: [BEN] } });
    assert.equal((await verify(idOf(ANA), lastCode())).status, 409);

    api.fake.clear('dismissalRecords');
    api.fake.patch('fetchers', fetchers.maria, { studentIds: [ANA, BEN] });
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await api.call('PATCH', `/parent/fetchers/${fetchers.maria}`, { token: tokens.parentA, body: { fullName: 'Someone Else' } });
    assert.equal((await verify(idOf(ANA), lastCode())).status, 409);
  });

  test('client cannot set verifiedBy, status or timestamps', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const res = await api.call('POST', `/dismissals/${idOf(ANA)}/verify`, {
      token: tokens.teacher, body: { otp: lastCode(), requestNumber: 1, verifiedBy: 'admin1', status: 'released' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation/unknown-fields');
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'awaiting-verification');
  });

  test('unknown or malformed dismissal IDs look the same', async () => {
    const unknown = await verify(`K2026-999_${today}`, '123456');
    const malformed = await verify('not-an-id', '123456');
    assert.equal(unknown.status, 404);
    assert.equal(malformed.status, 404);
    assert.equal(unknown.body.error.message, malformed.body.error.message);
  });
});

describe('release', () => {
  test('requires a successful verification first', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const res = await release(idOf(ANA));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/not-verified');
  });

  test('an attendance time-out is not proof of release', async () => {
    api.fake.seed('attendance', `${ANA}_${today}`, { studentId: ANA, schoolDate: today, status: 'checked-out' });
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    assert.equal((await release(idOf(ANA))).status, 409);
    api.fake.clear('attendance');
  });

  test('verify then release records the staff and time from the server; release is final', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    assert.equal((await verify(idOf(ANA), code)).status, 200);
    clockMs += 30_000;
    const res = await release(idOf(ANA), 1, tokens.teacher2);
    assert.equal(res.status, 200);
    assert.equal(res.body.dismissal.status, 'released');
    assert.equal(res.body.dismissal.releasedBy, 'teacher2');
    assert.equal(res.body.dismissal.releasedAt, new Date(clockMs).toISOString());
    assert.equal(res.body.dismissal.verifiedBy, 'teacher1');

    const again = await release(idOf(ANA));
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'dismissal/already-released');
    assert.equal((await verify(idOf(ANA), code)).status, 409);

    // No new code for a released child today; attendance untouched.
    clockMs += 61_000;
    const newCode = await requestCode(tokens.parentA, ANA, fetchers.maria);
    assert.equal(newCode.status, 409);
    assert.equal(newCode.body.error.code, 'dismissal/already-released');
    assert.equal(api.fake.all('attendance').length, 0);
  });

  test('client cannot set releasedBy or status', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await verify(idOf(ANA), lastCode());
    const res = await api.call('POST', `/dismissals/${idOf(ANA)}/release`, {
      token: tokens.teacher, body: { requestNumber: 1, releasedBy: 'admin1', releasedAt: '2020-01-01T00:00:00Z' },
    });
    assert.equal(res.status, 400);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'verified');
  });

  test('concurrent releases succeed exactly once', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await verify(idOf(ANA), lastCode());
    const results = await Promise.all([release(idOf(ANA)), release(idOf(ANA), 1, tokens.teacher2), release(idOf(ANA))]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
  });

  test('Fetcher deactivated between verification and release blocks the release', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await verify(idOf(ANA), lastCode());
    await api.call('POST', `/admin/fetchers/${fetchers.maria}/deactivate`, { token: tokens.admin });
    const res = await release(idOf(ANA));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/fetcher-not-authorized');
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'cancelled');
  });

  test('a verified (not yet released) child cannot get a new code', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    await verify(idOf(ANA), lastCode());
    clockMs += 61_000;
    const res = await requestCode(tokens.parentA, ANA, fetchers.lito);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'dismissal/already-verified');
  });
});

describe('role-based access', () => {
  test('unauthenticated and forged tokens are refused', async () => {
    assert.equal((await api.call('GET', '/dismissals')).status, 401);
    assert.equal((await api.call('POST', '/parent/dismissals', { body: {} })).status, 401);
    assert.equal((await verify(idOf(ANA), '123456', 1, 'forged.token')).status, 401);
  });

  test('parents cannot list, verify or release', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const code = lastCode();
    assert.equal((await api.call('GET', '/dismissals', { token: tokens.parentA })).status, 403);
    assert.equal((await verify(idOf(ANA), code, 1, tokens.parentA)).status, 403);
    assert.equal((await release(idOf(ANA), 1, tokens.parentA)).status, 403);
    assert.equal(api.fake.read('dismissalRecords', idOf(ANA)).status, 'awaiting-verification');
  });

  test('a parent whose token claims a staff role but whose profile says parent is refused', async () => {
    const token = api.addUser({ uid: 'parentSneaky', role: 'parent', claimRole: 'teacher' });
    assert.equal((await api.call('GET', '/dismissals', { token })).status, 401);
  });

  test('teachers and admins cannot request parent codes', async () => {
    assert.equal((await requestCode(tokens.teacher, ANA, fetchers.maria)).status, 403);
    assert.equal((await requestCode(tokens.admin, ANA, fetchers.maria)).status, 403);
    assert.equal(sms.sent.length, 0);
  });

  test('admins can view dismissal records for a date and act as staff', async () => {
    await requestCode(tokens.parentA, ANA, fetchers.maria);
    const list = await api.call('GET', `/dismissals?date=${today}`, { token: tokens.admin });
    assert.equal(list.status, 200);
    assert.equal(list.body.dismissals.length, 1);
    assert.equal((await verify(idOf(ANA), lastCode(), 1, tokens.admin)).status, 200);
    const bad = await api.call('GET', '/dismissals?date=2026-02-30', { token: tokens.admin });
    assert.equal(bad.status, 400);
  });
});
