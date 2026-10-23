// IPROG SMS provider: sends ONE plain-text SMS through the IPROG SMS v1 API.
//
//   POST https://www.iprogsms.com/api/v1/sms_messages
//   { "api_token": "<IPROG_SMS_API_TOKEN>", "phone_number": "639XXXXXXXXX", "message": "..." }
//
// Success looks like { "status": 200, "message": "...added to the queue...", "message_id": "iSms-XHYBk" }.
// Anything else (non-2xx HTTP, or a body whose "status" is not 200) is a failure.
//
// send() never throws: every problem becomes { ok: false, error: { code, message } } so the
// caller (attendance) can never fail because of SMS. The token is sent in the JSON body only
// (never in the URL), and is never logged or returned. "ok" means IPROG QUEUED the message;
// it is not proof that the phone received it. Only IPROG's own error text and the HTTP status
// are kept, after redacting anything credential-like. Only the plain SMS API is used - the
// dismissal OTP (Phase 9) is generated and verified by this application, not by IPROG.
import { PH_MOBILE_PATTERN } from '@led/shared';
import { redactProviderText } from './philsms.provider.js';

export const IPROG_SEND_URL = 'https://www.iprogsms.com/api/v1/sms_messages';
const DEFAULT_TIMEOUT_MS = 10_000;

const failed = (code, message, extra = {}) => ({ ok: false, providerMessageId: null, error: { code, message, ...extra } });

/** IPROG's "message" may be a string or a list of validation messages. */
function reasonText(body, apiToken) {
  const raw = Array.isArray(body?.message) ? body.message.filter((m) => typeof m === 'string').join('; ') : body?.message;
  return typeof raw === 'string' ? redactProviderText(raw, apiToken) : '';
}

export function createIprogSmsProvider({ apiToken, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const providerError = (code, httpStatus, body, fallback) =>
    failed(code, `IPROG error (HTTP ${httpStatus}): ${reasonText(body, apiToken) || fallback}`, { httpStatus });

  return {
    name: 'iprog',

    /** `to` is "+639XXXXXXXXX". */
    async send({ to, message }) {
      if (!apiToken) return failed('not-configured', 'IPROG_SMS_API_TOKEN is not set on the server.');
      if (typeof to !== 'string' || !PH_MOBILE_PATTERN.test(to)) {
        return failed('invalid-recipient', 'Recipient is not a Philippine mobile number.');
      }

      let response;
      try {
        response = await fetchImpl(IPROG_SEND_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          // IPROG expects the number without "+": 639XXXXXXXXX.
          body: JSON.stringify({ api_token: apiToken, phone_number: to.slice(1), message }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
          return failed('timeout', `IPROG did not respond within ${timeoutMs / 1000} seconds.`);
        }
        return failed('network-error', 'Could not reach IPROG.');
      }

      // Read as text first so a non-JSON reply (e.g. an HTML error page) is reported as such.
      const text = await response.text().catch(() => '');
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const noReason = body === null ? 'the response was not JSON.' : 'no error message was returned.';
      if (!response.ok) return providerError('http-error', response.status, body, noReason);
      if (Number(body?.status) !== 200) {
        return providerError('provider-error', response.status, body, body === null ? noReason : 'the message was not accepted.');
      }
      const id = body.message_id;
      return { ok: true, providerMessageId: typeof id === 'string' || typeof id === 'number' ? String(id) : null, error: null };
    },
  };
}
