// Small display helpers shared by pages.

export function studentFullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

/** "2020-01-15" -> "January 15, 2020". Parsed as a plain date (no timezone shift). */
export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** ISO timestamp -> "7:45 AM" in the school's time zone (sent by the API). */
export function formatTime(isoTimestamp, timeZone) {
  if (!isoTimestamp) return '—';
  return new Date(isoTimestamp).toLocaleTimeString('en-PH', { timeZone, hour: 'numeric', minute: '2-digit' });
}

export const OFFLINE_MESSAGE = 'You’re offline — this action requires an internet connection.';

/** "2026-10-04" -> "Sat, Oct 4" (or "Saturday, October 4, 2026" with long: true). */
export function formatDayDate(isoDate, { long = false } = {}) {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const options = long
    ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
    : { weekday: 'short', month: 'short', day: 'numeric' };
  return new Date(year, month - 1, day).toLocaleDateString('en-PH', options);
}

/** "Oct 1 – Oct 7, 2026", or one long date when both are the same day. */
export function formatDateRange(from, to) {
  if (!from || !to) return '—';
  if (from === to) return formatDayDate(from, { long: true });
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(fy !== ty ? { year: 'numeric' } : {}) });
  const end = new Date(ty, tm - 1, td).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
}

/**
 * What to show for a linked parent's SMS number. Admins receive the number itself; teachers
 * only receive `hasMobileNumber` (the server withholds parent contact details from them).
 * Returns { kind: 'number' | 'on-file' | 'none', text }.
 */
export function parentSmsContact(parent) {
  if (parent?.mobileNumber) return { kind: 'number', text: parent.mobileNumber };
  if (parent?.hasMobileNumber) return { kind: 'on-file', text: 'number on file' };
  return { kind: 'none', text: 'no mobile number' };
}
