// `systemSettings/{name}` documents: small runtime settings an administrator can change
// without redeploying:
//
//   systemSettings/attendance
//     rfidDebounceSeconds  integer 0-300  same card re-read within this window is ignored
//
//   systemSettings/dismissal (Phase 9)
//     otpExpiryMinutes     integer 1-30   how long a dismissal code stays valid
//     otpMaxAttempts       integer 3-10   incorrect codes allowed before the request is locked
//
// A missing document or an invalid value falls back to the default, so the system
// always has a safe setting. There is no settings UI yet; edit it in the Firebase console.
import {
  COLLECTIONS,
  DEFAULT_DISMISSAL_OTP_EXPIRY_MINUTES,
  DEFAULT_DISMISSAL_OTP_MAX_ATTEMPTS,
  DEFAULT_RFID_DEBOUNCE_SECONDS,
} from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

const MAX_DEBOUNCE_SECONDS = 300;
const CACHE_TTL_MS = 30_000; // avoids a settings read on every scan

let cached = null;

export function parseDebounceSeconds(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_DEBOUNCE_SECONDS ? value : DEFAULT_RFID_DEBOUNCE_SECONDS;
}

export async function getAttendanceSettings() {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.settings;
  let data = null;
  try {
    const snapshot = await db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc('attendance').get();
    data = snapshot.exists ? snapshot.data() : null;
  } catch (err) {
    // Settings are not worth failing a scan over: keep the last known value or the default.
    console.error('[settings] Could not load attendance settings; using last known/default:', err.message);
    if (cached) return cached.settings;
  }
  const settings = Object.freeze({ rfidDebounceSeconds: parseDebounceSeconds(data?.rfidDebounceSeconds) });
  cached = { settings, loadedAt: Date.now() };
  return settings;
}

const intInRange = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback);

let cachedDismissal = null;

export async function getDismissalSettings() {
  if (cachedDismissal && Date.now() - cachedDismissal.loadedAt < CACHE_TTL_MS) return cachedDismissal.settings;
  let data = null;
  try {
    const snapshot = await db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc('dismissal').get();
    data = snapshot.exists ? snapshot.data() : null;
  } catch (err) {
    console.error('[settings] Could not load dismissal settings; using last known/default:', err.message);
    if (cachedDismissal) return cachedDismissal.settings;
  }
  const settings = Object.freeze({
    otpExpiryMinutes: intInRange(data?.otpExpiryMinutes, 1, 30, DEFAULT_DISMISSAL_OTP_EXPIRY_MINUTES),
    otpMaxAttempts: intInRange(data?.otpMaxAttempts, 3, 10, DEFAULT_DISMISSAL_OTP_MAX_ATTEMPTS),
  });
  cachedDismissal = { settings, loadedAt: Date.now() };
  return settings;
}
