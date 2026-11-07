// Daily Attendance constants shared by client and server (the server is the authority).

// Default RFID debounce. The live value is systemSettings/attendance.rfidDebounceSeconds.
export const DEFAULT_RFID_DEBOUNCE_SECONDS = 10;

// Plain school-local date used as the attendance day, e.g. "2026-09-25".
export const SCHOOL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// checked-in / checked-out are stored on attendance/{studentId}_{schoolDate}. The other three are
// never stored: they are what a student with NO record that day is shown as (see dayStatusWithoutRecord).
export const ATTENDANCE_STATUS = Object.freeze({
  CHECKED_IN: 'checked-in',
  CHECKED_OUT: 'checked-out',
  NOT_ARRIVED: 'not-arrived', // class day, before the class end time
  ABSENT: 'absent', // class day, after the class end time (or a past class day)
  NO_CLASS: 'no-class', // weekend, holiday, before the school year or before the student was added
});

// Result of processing one RFID scan.
export const SCAN_OUTCOMES = Object.freeze({
  TIME_IN: 'time-in',
  TIME_OUT: 'time-out',
  DUPLICATE_IGNORED: 'duplicate-ignored', // same card again within the debounce period
  ALREADY_COMPLETED: 'already-completed', // day already has time-in and time-out
  UNKNOWN_RFID: 'unknown-rfid',
  RFID_INACTIVE: 'rfid-inactive',
  RFID_UNASSIGNED: 'rfid-unassigned',
  STUDENT_INACTIVE: 'student-inactive',
});

// Where a scan came from, stored as attendance entrySource / exitSource. The SERVER chooses the
// stored value from an allow-listed `method` the staff screen reports. The browser cannot prove
// a UID came from the reader (the reader types like a keyboard), so this is "reported by the
// screen", not proof - it labels the record and changes nothing else.
export const SCAN_SOURCES = Object.freeze({
  RFID_READER: 'rfid-reader', // the UHF RFID Reader panel on the Attendance page
  MANUAL_ENTRY: 'manual-entry', // the "type the UID" fallback form
  MANUAL_TEST: 'manual-test', // legacy: every scan before 2026-10-26 (reader and typed alike)
});

// What the Attendance page sends as `method` with each scan, and the source each one records.
export const SCAN_METHODS = Object.freeze({ READER: 'reader', MANUAL: 'manual' });
export const SCAN_SOURCE_BY_METHOD = Object.freeze({
  [SCAN_METHODS.READER]: SCAN_SOURCES.RFID_READER,
  [SCAN_METHODS.MANUAL]: SCAN_SOURCES.MANUAL_ENTRY,
});

// ---- Late arrivals. Decided by the server at time-in and STORED on the attendance record
// (arrivalStatus, lateMinutes, scheduledStart, graceMinutes), so later changes to the start time do
// not rewrite past days. Records from before this feature have no arrivalStatus (shown as unknown).
export const ARRIVAL_STATUS = Object.freeze({
  ON_TIME: 'on-time',
  LATE: 'late',
  EXCUSED: 'excused', // late, excused by a teacher/admin with a reason
});

export const ARRIVAL_STATUS_LABELS = Object.freeze({
  [ARRIVAL_STATUS.ON_TIME]: 'On time',
  [ARRIVAL_STATUS.LATE]: 'Late',
  [ARRIVAL_STATUS.EXCUSED]: 'Late (excused)',
});

// "HH:MM", 24-hour, school-local (e.g. "08:00", "13:30").
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_CLASS_START_TIME = '08:00';
export const DEFAULT_LATE_GRACE_MINUTES = 15;
export const LATE_EXCUSE_MAX_LENGTH = 200;

export const minutesOfTime = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "13:30" -> "1:30 PM". */
export function formatTimeOfDay(hhmm) {
  const minutes = minutesOfTime(hhmm);
  const h = Math.floor(minutes / 60);
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * On time or late for a time-in `elapsedMs` after school-local midnight. Late = strictly after the
 * start time plus the grace period; lateMinutes counts from the START time (whole minutes).
 */
export function arrivalFor({ elapsedMs, startTime, graceMinutes }) {
  const startMs = minutesOfTime(startTime) * 60_000;
  if (elapsedMs <= startMs + graceMinutes * 60_000) return { arrivalStatus: ARRIVAL_STATUS.ON_TIME, lateMinutes: 0 };
  return { arrivalStatus: ARRIVAL_STATUS.LATE, lateMinutes: Math.floor((elapsedMs - startMs) / 60_000) };
}

// ---- Early pick-up. Decided at time-out against the class end time and STORED like arrivals
// (departureStatus, earlyMinutes, scheduledEnd). Records from before this have no departureStatus.
export const DEPARTURE_STATUS = Object.freeze({
  ON_TIME: 'on-time',
  EARLY: 'early', // picked up before the class end time
});

export const DEFAULT_CLASS_END_TIME = '11:30';

/** Early = strictly before the end time; earlyMinutes = whole minutes before it. */
export function departureFor({ elapsedMs, endTime }) {
  const endMs = minutesOfTime(endTime) * 60_000;
  if (elapsedMs >= endMs) return { departureStatus: DEPARTURE_STATUS.ON_TIME, earlyMinutes: 0 };
  return { departureStatus: DEPARTURE_STATUS.EARLY, earlyMinutes: Math.floor((endMs - elapsedMs) / 60_000) };
}

// ---- Class days (for Absent). Monday to Friday, minus the admin's no-class dates
// (systemSettings/calendar), and never before the school year start the admin set.
export const CLASS_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5]); // 0 = Sunday
export const NO_CLASS_REASON_MAX_LENGTH = 80;
export const MAX_NO_CLASS_DATES = 200;

export const weekdayOf = (schoolDate) => new Date(`${schoolDate}T12:00:00Z`).getUTCDay();

/** null for a class day, else a short reason ("Weekend", "Before the school year", or the holiday name). */
export function noClassReason(schoolDate, calendar = {}) {
  if (calendar.schoolYearStart && schoolDate < calendar.schoolYearStart) return 'Before the school year';
  if (!CLASS_WEEKDAYS.includes(weekdayOf(schoolDate))) return 'Weekend';
  const holiday = (calendar.noClassDates ?? []).find((d) => d.date === schoolDate);
  return holiday ? (holiday.reason || 'No class') : null;
}

/**
 * What a student with NO attendance record on `schoolDate` is shown as:
 *   no-class (not a class day, or before `enrolledFrom`) | not-arrived (today, before `endTime`) | absent.
 * `elapsedMs` = time since school-local midnight NOW (used only when schoolDate is today).
 * Future dates are 'future' (calendar views only).
 */
export function dayStatusWithoutRecord({ schoolDate, today, elapsedMs, endTime, calendar, enrolledFrom }) {
  if (schoolDate > today) return 'future';
  if (enrolledFrom && schoolDate < enrolledFrom) return ATTENDANCE_STATUS.NO_CLASS;
  if (noClassReason(schoolDate, calendar)) return ATTENDANCE_STATUS.NO_CLASS;
  if (schoolDate === today && elapsedMs < minutesOfTime(endTime) * 60_000) return ATTENDANCE_STATUS.NOT_ARRIVED;
  return ATTENDANCE_STATUS.ABSENT;
}

/** 22 -> "22 min", 60 -> "1 hour", 75 -> "1 hour 15 min", 130 -> "2 hours 10 min" (screens and SMS). */
export function durationText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hours = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  return [hours, m || !h ? `${m} min` : ''].filter(Boolean).join(' ');
}
