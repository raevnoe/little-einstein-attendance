// School Settings (admin) and personal preferences, shared by client and server. The server is the
// authority: it validates every value against these limits and falls back to the default when a
// stored value is missing or invalid.
import { DEFAULT_RFID_DEBOUNCE_SECONDS } from './attendance.js';
import { DEFAULT_DISMISSAL_OTP_EXPIRY_MINUTES, DEFAULT_DISMISSAL_OTP_MAX_ATTEMPTS } from './dismissal.js';

export const DEFAULT_DISMISSAL_REQUEST_COOLDOWN_SECONDS = 60;
export const DEFAULT_DISMISSAL_MAX_CODES_PER_DAY = 5;

// group -> field -> { type, default, min/max (integers), label, unit, hint }.
// Stored as systemSettings/{group} documents.
export const SCHOOL_SETTINGS = Object.freeze({
  attendance: Object.freeze({
    rfidDebounceSeconds: Object.freeze({
      type: 'integer', default: DEFAULT_RFID_DEBOUNCE_SECONDS, min: 0, max: 300, unit: 'seconds',
      label: 'Ignore repeated scans of the same card within',
      hint: 'A UHF reader can read a card several times. Repeats within this time are ignored.',
    }),
  }),
  dismissal: Object.freeze({
    otpExpiryMinutes: Object.freeze({
      type: 'integer', default: DEFAULT_DISMISSAL_OTP_EXPIRY_MINUTES, min: 1, max: 30, unit: 'minutes',
      label: 'Dismissal code is valid for',
      hint: 'Applies to codes requested after saving. Longer gives Fetchers who live far away more time.',
    }),
    otpMaxAttempts: Object.freeze({
      type: 'integer', default: DEFAULT_DISMISSAL_OTP_MAX_ATTEMPTS, min: 3, max: 10, unit: 'attempts',
      label: 'Wrong codes allowed before the code is locked',
      hint: 'Applies to codes requested after saving.',
    }),
    requestCooldownSeconds: Object.freeze({
      type: 'integer', default: DEFAULT_DISMISSAL_REQUEST_COOLDOWN_SECONDS, min: 30, max: 600, unit: 'seconds',
      label: 'Wait between code requests for the same child',
    }),
    maxCodesPerDay: Object.freeze({
      type: 'integer', default: DEFAULT_DISMISSAL_MAX_CODES_PER_DAY, min: 1, max: 10, unit: 'codes',
      label: 'Codes a parent may request per child per day',
    }),
  }),
  sms: Object.freeze({
    attendanceSmsEnabled: Object.freeze({
      type: 'boolean', default: true,
      label: 'Send arrival and departure SMS to parents',
      hint: 'When off, parents still see arrivals and departures in the app. Dismissal codes are always sent by SMS.',
    }),
    allowParentSmsOptOut: Object.freeze({
      type: 'boolean', default: true,
      label: 'Parents may turn off arrival and departure SMS for their own account',
      hint: 'When off, every parent with a mobile number receives them, whatever their own setting says.',
    }),
  }),
});

export const SCHOOL_SETTING_GROUPS = Object.freeze(Object.keys(SCHOOL_SETTINGS));

/** Defaults for every group: { attendance: {...}, dismissal: {...}, sms: {...} }. */
export function defaultSchoolSettings() {
  return Object.fromEntries(Object.entries(SCHOOL_SETTINGS).map(([group, fields]) => [
    group, Object.fromEntries(Object.entries(fields).map(([key, spec]) => [key, spec.default])),
  ]));
}

/** True if `value` is allowed for this setting. */
export function isValidSettingValue(spec, value) {
  if (spec.type === 'boolean') return typeof value === 'boolean';
  return Number.isInteger(value) && value >= spec.min && value <= spec.max;
}

// Appearance (per device, stored in the browser only).
export const THEME_CHOICES = Object.freeze(['system', 'light', 'dark']);
