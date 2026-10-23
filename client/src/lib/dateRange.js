// Plain-date (YYYY-MM-DD) helpers for report filters. `today` always comes from the server,
// which defines the school day in its time zone, so the device clock and time zone never matter.
// The server re-validates every range; these only give a quick message before asking it.
import { MAX_REPORT_RANGE_DAYS, SCHOOL_DATE_PATTERN } from '@led/shared';

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(value) {
  if (typeof value !== 'string' || !SCHOOL_DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Number of days from `from` to `to`, inclusive. */
export function daysInRange(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** null when the range is acceptable, otherwise a message for the user. */
export function rangeError(from, to, today) {
  if (!isRealDate(from) || !isRealDate(to)) return 'Choose a start date and an end date.';
  if (to > today || from > today) return 'Dates cannot be in the future.';
  if (from > to) return 'The start date must be on or before the end date.';
  if (daysInRange(from, to) > MAX_REPORT_RANGE_DAYS) return `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days.`;
  return null;
}

/** Quick ranges ending today. "This month" starts on the 1st (never more than 31 days). */
export function presetRange(key, today) {
  switch (key) {
    case 'today': return { from: today, to: today };
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last31': return { from: addDays(today, -(MAX_REPORT_RANGE_DAYS - 1)), to: today };
    default: return null;
  }
}

export const RANGE_PRESETS = Object.freeze([
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last31', label: `Last ${MAX_REPORT_RANGE_DAYS} days` },
]);
