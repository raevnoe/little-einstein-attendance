// `systemSettings/{group}` documents: small runtime settings an administrator changes on the
// School Settings screen (services/settings.service.js) without redeploying. The fields, limits and
// defaults are listed in shared/src/settings.js (SCHOOL_SETTINGS):
//
//   systemSettings/attendance   rfidDebounceSeconds
//   systemSettings/dismissal    otpExpiryMinutes, otpMaxAttempts, requestCooldownSeconds, maxCodesPerDay
//   systemSettings/sms          attendanceSmsEnabled, allowParentSmsOptOut
//
// (systemSettings/sections is the section list; see section.model.js.)
//
// A missing document or an invalid value falls back to the default, so the system always has a
// safe setting. Values are cached for 30 s per server instance; saving clears this instance's cache,
// other instances pick the change up within 30 s.
import { COLLECTIONS, SCHOOL_SETTINGS, SCHOOL_SETTING_GROUPS, isValidSettingValue } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

const CACHE_TTL_MS = 30_000; // avoids a settings read on every scan

export const settingsRef = (group) => db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc(group);

/** Every field of `group` from stored data, with the default for anything missing or invalid. */
export function parseSettingsGroup(group, data) {
  return Object.freeze(Object.fromEntries(Object.entries(SCHOOL_SETTINGS[group]).map(([key, spec]) => [
    key, isValidSettingValue(spec, data?.[key]) ? data[key] : spec.default,
  ])));
}

export function parseDebounceSeconds(value) {
  return parseSettingsGroup('attendance', { rfidDebounceSeconds: value }).rfidDebounceSeconds;
}

const cache = new Map(); // group -> { settings, loadedAt }

async function loadGroup(group) {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit.settings;
  let data = null;
  try {
    const snapshot = await settingsRef(group).get();
    data = snapshot.exists ? snapshot.data() : null;
  } catch (err) {
    // Settings are not worth failing a scan or a request over: keep the last known value or the default.
    console.error(`[settings] Could not load ${group} settings; using last known/default:`, err.message);
    if (hit) return hit.settings;
  }
  const settings = parseSettingsGroup(group, data);
  cache.set(group, { settings, loadedAt: Date.now() });
  return settings;
}

export const getAttendanceSettings = () => loadGroup('attendance');
export const getDismissalSettings = () => loadGroup('dismissal');
export const getSmsSettings = () => loadGroup('sms');

/** Current values of every group, read fresh (inside `tx` when given). */
export async function readSchoolSettings(tx) {
  const refs = SCHOOL_SETTING_GROUPS.map(settingsRef);
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  return Object.fromEntries(SCHOOL_SETTING_GROUPS.map((group, i) => [group, parseSettingsGroup(group, snaps[i].exists ? snaps[i].data() : null)]));
}

/** Called after saving so this server instance uses the new values at once. */
export function clearSettingsCache() {
  cache.clear();
}
