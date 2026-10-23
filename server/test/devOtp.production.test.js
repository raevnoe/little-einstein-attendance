// The development-only dismissal-code read-back must not exist in production.
// `node --test` runs each file in its own process, so NODE_ENV=production here is real for
// config/env.js. SMS uses an IPROG provider with a fake fetch: nothing is sent.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { startTestApi } from './helpers/testApi.js';

process.env.NODE_ENV = 'production';

let api;
let tokens;
let today;
let lastMessage = null;
let outbox;

const ANA = 'K2026-001';

before(async () => {
  api = await startTestApi({ smsProvider: 'iprog' });
  const smsService = await import('../src/services/sms/sms.service.js');
  const { createIprogSmsProvider } = await import('../src/services/sms/iprog.provider.js');
  outbox = await import('../src/services/sms/devOtpOutbox.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  smsService.setSmsProviderForTests(createIprogSmsProvider({
    apiToken: 'test-token',
    fetchImpl: async (url, init) => {
      lastMessage = JSON.parse(init.body).message;
      return { ok: true, status: 200, text: async () => JSON.stringify({ status: 200, message_id: 'iSms-1' }) };
    },
  }));

  tokens = {
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] });
});

after(() => api.close());

describe('production', () => {
  test('the dev route does not exist, even for the parent who requested the code', async () => {
    const fetcherId = (await api.call('POST', '/parent/fetchers', {
      token: tokens.parentA, body: { fullName: 'Maria Santos', relationship: 'Grandmother', studentIds: [ANA] },
    })).body.fetcher.fetcherId;
    const res = await api.call('POST', '/parent/dismissals', { token: tokens.parentA, body: { studentId: ANA, fetcherId } });
    assert.equal(res.status, 201);
    const code = /dismissal code is (\d{6})\./.exec(lastMessage)[1];

    assert.equal(outbox.isDevOtpOutboxEnabled(), false);
    assert.equal(outbox.devOtpOutboxSizeForTests(), 0, 'code not kept in memory');

    for (const token of [tokens.parentA, undefined]) {
      const peek = await api.call('GET', `/dev/dismissal-otp/${ANA}`, { token });
      assert.equal(peek.status, 404);
      assert.ok(!peek.text.includes(code));
    }

    // Ordinary production responses never reveal the code.
    const parentList = await api.call('GET', '/parent/dismissals', { token: tokens.parentA });
    const staffList = await api.call('GET', '/dismissals', { token: tokens.teacher });
    for (const text of [res.text, parentList.text, staffList.text]) assert.ok(!text.includes(code));

    // The normal flow still works.
    const verified = await api.call('POST', `/dismissals/${ANA}_${today}/verify`, {
      token: tokens.teacher, body: { otp: code, requestNumber: 1 },
    });
    assert.equal(verified.status, 200);
  });

  test('the server refuses to start with SMS_PROVIDER=mock in production', () => {
    const envUrl = new URL('../src/config/env.js', import.meta.url).href;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(envUrl)});`], {
      env: { ...process.env, NODE_ENV: 'production', SMS_PROVIDER: 'mock' },
      encoding: 'utf8',
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /SMS_PROVIDER=mock is not allowed in production/);
  });
});
