// The school calendar used for Absent: `systemSettings/calendar`
//   { schoolYearStart: "YYYY-MM-DD" | null, noClassDates: [{ date: "YYYY-MM-DD", reason }], updatedAt }
// Class days are Monday to Friday (shared CLASS_WEEKDAYS) minus `noClassDates` (holidays,
// suspensions), and never before `schoolYearStart`. Changed only by admins (services/calendar.service.js).
// Cached for 30 s per server instance like the other settings; saving clears this instance's cache.
import { COLLECTIONS } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

const CACHE_TTL_MS = 30_000;

export const calendarRef = () => db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc('calendar');

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The stored calendar, cleaned: invalid entries are dropped, dates sorted. */
export function parseCalendar(data) {
  const noClassDates = (Array.isArray(data?.noClassDates) ? data.noClassDates : [])
    .filter((d) => d && DATE.test(d.date))
    .map((d) => ({ date: d.date, reason: typeof d.reason === 'string' ? d.reason : '' }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { schoolYearStart: DATE.test(data?.schoolYearStart ?? '') ? data.schoolYearStart : null, noClassDates };
}

let cached = null;

export async function getCalendar() {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.calendar;
  let data = null;
  try {
    const snap = await calendarRef().get();
    data = snap.exists ? snap.data() : null;
  } catch (err) {
    console.error('[calendar] Could not load the school calendar; using last known/empty:', err.message);
    if (cached) return cached.calendar;
  }
  const calendar = parseCalendar(data);
  cached = { calendar, loadedAt: Date.now() };
  return calendar;
}

export function clearCalendarCache() {
  cached = null;
}
