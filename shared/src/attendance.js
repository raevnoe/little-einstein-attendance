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

// Where a scan came from. Only the server sets this; clients cannot choose it.
export const SCAN_SOURCES = Object.freeze({
  MANUAL_TEST: 'manual-test', // development/testing UID entry in the staff UI
});
