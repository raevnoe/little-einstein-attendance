// SMS service provider selection. Runs with SMS_PROVIDER=mock: no real SMS is sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SMS_PROVIDER = 'mock';
process.env.IPROG_SMS_API_TOKEN = '';
const { getSmsProvider, sendSms, setSmsProviderForTests } = await import('../src/services/sms/sms.service.js');
const { createIprogSmsProvider } = await import('../src/services/sms/iprog.provider.js');

test('SMS_PROVIDER=mock uses the mock provider and sends nothing real', async () => {
  const mock = getSmsProvider();
  assert.equal(mock.name, 'mock');
  const result = await sendSms('+639171234567', 'Hello');
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'mock');
  assert.equal(mock.sent.length, 1);
});

test('sendSms reports the iprog provider name and failures without throwing', async () => {
  setSmsProviderForTests(createIprogSmsProvider({ apiToken: null, fetchImpl: async () => assert.fail('must not call') }));
  try {
    const result = await sendSms('+639171234567', 'Hello');
    assert.equal(result.provider, 'iprog');
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'not-configured');
  } finally {
    setSmsProviderForTests(null);
  }
});
