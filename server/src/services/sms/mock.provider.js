// Mock SMS provider for development and automated tests (SMS_PROVIDER=mock). It NEVER
// contacts PhilSMS. It keeps what it would have sent in `sent` (for in-process tests) and
// logs a masked line. Refused in production by config/env.js.
//
// Test hook: a recipient ending in MOCK_FAILING_SUFFIX simulates a provider failure.
import { randomUUID } from 'node:crypto';
import { PH_MOBILE_PATTERN } from '@led/shared';

export const MOCK_FAILING_SUFFIX = '9990';

const mask = (number) => `${number.slice(0, 6)}*****${number.slice(-2)}`;

export function createMockSmsProvider() {
  const sent = [];
  return {
    name: 'mock',
    sent,
    async send({ to, message }) {
      if (typeof to !== 'string' || !PH_MOBILE_PATTERN.test(to)) {
        return { ok: false, providerMessageId: null, error: { code: 'invalid-recipient', message: 'Recipient is not a Philippine mobile number.' } };
      }
      if (to.endsWith(MOCK_FAILING_SUFFIX)) {
        return { ok: false, providerMessageId: null, error: { code: 'provider-error', message: 'Simulated provider failure (mock).' } };
      }
      sent.push({ to, message });
      console.info(`[sms:mock] NOT sent (mock provider) to ${mask(to)}: ${message.length} characters`);
      return { ok: true, providerMessageId: `mock-${randomUUID()}`, error: null };
    },
  };
}
