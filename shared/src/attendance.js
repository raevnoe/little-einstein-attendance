// Daily Attendance constants shared by client and server (the server is the authority).

// Default RFID debounce. The live value is systemSettings/attendance.rfidDebounceSeconds.
export const DEFAULT_RFID_DEBOUNCE_SECONDS = 10;

// Plain school-local date used as the attendance day, e.g. "2026-09-25".
export const SCHOOL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Stored on attendance/{studentId}_{schoolDate}. "absent" is never stored: it is
// what a student with no record for the day is shown as.
export const ATTENDANCE_STATUS = Object.freeze({
  ABSENT: 'absent',
  CHECKED_IN: 'checked-in',
  CHECKED_OUT: 'checked-out',
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
