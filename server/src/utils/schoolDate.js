// School-day helpers. Attendance days are plain local dates ("YYYY-MM-DD") in the
// school's time zone, never UTC dates: 07:30 in Manila is still the previous day in UTC.
import { SCHOOL_DATE_PATTERN } from '@led/shared';
import { env } from '../config/env.js';

const formatters = new Map();

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    // en-CA formats dates as YYYY-MM-DD.
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return formatters.get(timeZone);
}

/** The school date that `date` falls on in the school's time zone. */
export function schoolDateOf(date = new Date(), timeZone = env.schoolTimeZone) {
  return formatterFor(timeZone).format(date);
}

/** True for a real calendar date in YYYY-MM-DD form (rejects e.g. 2026-02-30). */
export function isValidSchoolDate(value) {
  if (typeof value !== 'string' || !SCHOOL_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Milliseconds by which the time zone's wall clock is ahead of UTC at instant `ms`. */
function zoneOffsetMs(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - ms;
}

/** The exact instant (ms) a school date begins in the school's time zone. */
export function startOfSchoolDay(schoolDate, timeZone = env.schoolTimeZone) {
  const wallMidnight = Date.parse(`${schoolDate}T00:00:00Z`);
  const first = wallMidnight - zoneOffsetMs(wallMidnight, timeZone);
  return wallMidnight - zoneOffsetMs(first, timeZone); // second pass handles DST-style offset changes
}

/** Calendar arithmetic on a plain date (no time zone involved). */
export function addDays(schoolDate, days) {
  const date = new Date(`${schoolDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "7:45 AM" in the school's time zone, with plain spaces (keeps SMS text in the GSM-7 charset). */
export function formatSchoolTime(date, timeZone = env.schoolTimeZone) {
  return date.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
}

/** "Oct 24" for a YYYY-MM-DD school date. */
export function formatSchoolDateShort(schoolDate) {
  return new Date(`${schoolDate}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}
