// SMS boundary. The rest of the app calls sendSms() and never talks to a provider directly,
// so a provider can be swapped by writing another one with the same send() shape:
//   send({ to: '+639XXXXXXXXX', message }) -> { ok, providerMessageId, error: { code, message } | null }
import { env } from '../../config/env.js';
import { createMockSmsProvider } from './mock.provider.js';
import { createIprogSmsProvider } from './iprog.provider.js';
import { createPhilSmsProvider } from './philsms.provider.js';

let provider = null;

function createProvider(name) {
  if (name === 'mock') return createMockSmsProvider();
  if (name === 'iprog') return createIprogSmsProvider({ apiToken: env.sms.iprogApiToken });
  return createPhilSmsProvider({ apiToken: env.sms.philsmsApiToken, senderId: env.sms.philsmsSenderId });
}

export function getSmsProvider() {
  provider ??= createProvider(env.sms.provider);
  return provider;
}

/** Automated tests only: swap in a provider (e.g. a mock, or an IPROG/PhilSMS provider with a fake fetch). */
export function setSmsProviderForTests(testProvider) {
  provider = testProvider;
}

/** Sends one SMS. Never throws. Returns the provider result plus the provider's name. */
export async function sendSms(to, message) {
  const current = getSmsProvider();
  try {
    return { ...(await current.send({ to, message })), provider: current.name };
  } catch (err) {
    console.error(`[sms] ${current.name} provider threw unexpectedly:`, err?.message);
    return { ok: false, providerMessageId: null, error: { code: 'unexpected', message: 'SMS provider error.' }, provider: current.name };
  }
}
