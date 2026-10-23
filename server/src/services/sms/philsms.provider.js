// PhilSMS provider: sends ONE plain-text SMS through the PhilSMS v3 API.
//
//   POST https://app.philsms.com/api/v3/sms/send
//   Authorization: Bearer <PHILSMS_API_TOKEN>
//   { "recipient": "639XXXXXXXXX", "sender_id": "<PHILSMS_SENDER_ID>", "type": "plain", "message": "..." }
//
// send() never throws: every problem becomes { ok: false, error: { code, message } } so the
// caller (attendance) can never fail because of SMS. The token is never logged or returned.
// "ok" means PhilSMS ACCEPTED the message; it is not proof that the phone received it.
//
// PhilSMS failures look like { "status": "error", "message": "..." }. Only that message and the
// HTTP status are kept - "PhilSMS error (HTTP 422): Invalid recipient" plus error.httpStatus -
// after redacting anything credential-like. The rest of the provider response is discarded.
import { PH_MOBILE_PATTERN } from '@led/shared';

export const PHILSMS_SEND_URL = 'https://app.philsms.com/api/v3/sms/send';
const SENDER_ID_PATTERN = /^[A-Za-z0-9]{1,11}$/; // PhilSMS: alphanumeric, max 11 characters
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 200;

const failed = (code, message, extra = {}) => ({ ok: false, providerMessageId: null, error: { code, message, ...extra } });

// Credential-looking text that a provider message must never carry into logs or Firestore.
const SECRET_PATTERNS = [
  /\bBearer\s+\S+/gi,
  /\b(token|api[_-]?key|apikey|secret|password|authorization)(\s*["']?\s*[:=]\s*)["']?[^\s"',}]+/gi,
  /\b\d+\|[A-Za-z0-9]{20,}/g, // "id|token" style API tokens
  /[A-Za-z0-9_-]{32,}/g, // any other long opaque key-like string
];

/** Safe one-line provider text: token and credential-like values redacted, control characters removed, length capped. */
export function redactProviderText(text, apiToken) {
  let safe = String(text ?? '');
  if (apiToken) safe = safe.split(apiToken).join('[redacted]');
  for (const pattern of SECRET_PATTERNS) {
    safe = safe.replace(pattern, (match, key, sep) => (typeof key === 'string' ? `${key}${sep}[redacted]` : '[redacted]'));
  }
  // eslint-disable-next-line no-control-regex
  safe = safe.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return safe.length > MAX_ERROR_LENGTH ? `${safe.slice(0, MAX_ERROR_LENGTH - 3)}...` : safe;
}

/** The provider's message uid, if the response has one (data may be an object or a list). */
function messageUid(data) {
  const item = Array.isArray(data) ? data[0] : data;
  return typeof item?.uid === 'string' || typeof item?.uid === 'number' ? String(item.uid) : null;
}

export function createPhilSmsProvider({ apiToken, senderId, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  /** "PhilSMS error (HTTP 422): Invalid recipient" - only PhilSMS's own `message`, redacted. */
  const providerError = (code, httpStatus, body, fallback) => {
    const reason = typeof body?.message === 'string' ? redactProviderText(body.message, apiToken) : '';
    return failed(code, `PhilSMS error (HTTP ${httpStatus}): ${reason || fallback}`, { httpStatus });
  };

  return {
    name: 'philsms',

    /** `to` is "+639XXXXXXXXX". */
    async send({ to, message }) {
      if (!apiToken) return failed('not-configured', 'PHILSMS_API_TOKEN is not set on the server.');
      if (!senderId || !SENDER_ID_PATTERN.test(senderId)) {
        return failed('not-configured', 'PHILSMS_SENDER_ID is missing or is not 1-11 letters/numbers.');
      }
      if (typeof to !== 'string' || !PH_MOBILE_PATTERN.test(to)) {
        return failed('invalid-recipient', 'Recipient is not a Philippine mobile number.');
      }

      let response;
      try {
        response = await fetchImpl(PHILSMS_SEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          // PhilSMS expects the number without "+": 639XXXXXXXXX.
          body: JSON.stringify({ recipient: to.slice(1), sender_id: senderId, type: 'plain', message }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
          return failed('timeout', `PhilSMS did not respond within ${timeoutMs / 1000} seconds.`);
        }
        return failed('network-error', 'Could not reach PhilSMS.');
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
      if (body?.status !== 'success') {
        return providerError('provider-error', response.status, body, body === null ? noReason : 'the message was not accepted.');
      }
      return { ok: true, providerMessageId: messageUid(body.data), error: null };
    },
  };
}
