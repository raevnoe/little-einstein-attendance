// DEVELOPMENT-ONLY "outbox" for dismissal codes sent through the MOCK SMS provider.
//
// With SMS_PROVIDER=mock nothing is texted, so a developer doing a manual browser test has no
// way to see the 6-digit code. This module keeps the latest code per dismissal record in
// PROCESS MEMORY ONLY, so the parent who requested it can read it back through
// GET /api/dev/dismissal-otp/:studentId (routes/dev.routes.js).
//
// It is active only when ALL of these hold:
//   - NODE_ENV is not "production",
//   - SMS_PROVIDER is "mock" (config/env.js already refuses mock in production), and
//   - the provider actually in use is the mock provider.
// Otherwise every function is a no-op / returns null. The code is never written to Firestore,
// never logged, and never added to any normal API response. Hashing, expiry, attempt limits
// and single use are unchanged: verification still goes through the stored hash only.
import { env } from '../../config/env.js';
import { getSmsProvider } from './sms.service.js';

const outbox = new Map(); // dismissalId -> { requestNumber, parentId, otp, expiresAtMs }

/** Pure check (arguments let tests cover production/IPROG without restarting the process). */
export function isDevOtpOutboxEnabled({
  nodeEnv = env.nodeEnv,
  configuredProvider = env.sms.provider,
  activeProvider = getSmsProvider().name,
} = {}) {
  return nodeEnv !== 'production' && configuredProvider === 'mock' && activeProvider === 'mock';
}

/** Called after the mock provider accepted a dismissal SMS. No-op unless enabled. */
export function rememberDevOtp({ dismissalId, requestNumber, parentId, otp, expiresAtMs, nowMs }) {
  if (!isDevOtpOutboxEnabled()) return;
  for (const [id, entry] of outbox) if (entry.expiresAtMs <= nowMs) outbox.delete(id);
  outbox.set(dismissalId, { requestNumber, parentId, otp, expiresAtMs });
}

/** The remembered entry for a dismissal record, or null (always null when disabled). */
export function readDevOtp(dismissalId) {
  if (!isDevOtpOutboxEnabled()) return null;
  return outbox.get(dismissalId) ?? null;
}

/** Automated tests only. */
export function devOtpOutboxSizeForTests() {
  return outbox.size;
}
export function clearDevOtpOutboxForTests() {
  outbox.clear();
}
