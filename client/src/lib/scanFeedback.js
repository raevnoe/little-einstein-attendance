// Turns one submitAttendanceScan() result into what the large scan-result card shows.
// Display only: it reads the result the scan request already returned and makes no request.
import { SCAN_OUTCOMES } from '@led/shared';
import { formatTime } from './format.js';

export const FEEDBACK_KINDS = Object.freeze({
  SUCCESS: 'success', // time in / time out recorded
  INFO: 'info', // nothing changed and nothing to do (repeated scan, day already complete)
  WARNING: 'warning', // card or student needs an administrator
  OFFLINE: 'offline',
  ERROR: 'error',
});

// Success and info cards clear on their own; warnings and errors stay until the next scan or Dismiss.
export const AUTO_CLEAR_KINDS = new Set([FEEDBACK_KINDS.SUCCESS, FEEDBACK_KINDS.INFO]);

const CARD_ACTION = 'Ask an administrator to check this card in RFID Cards.';

const CARD_TITLES = {
  [SCAN_OUTCOMES.UNKNOWN_RFID]: 'RFID Card Not Recognized',
  [SCAN_OUTCOMES.RFID_UNASSIGNED]: 'RFID Card Not Assigned',
  [SCAN_OUTCOMES.RFID_INACTIVE]: 'RFID Card Inactive',
};

/** Both recorded times when present, otherwise none. */
function recordedTimes(attendance, timeZone) {
  const times = [];
  if (attendance?.timeIn) times.push({ label: 'Time In', value: formatTime(attendance.timeIn, timeZone) });
  if (attendance?.timeOut) times.push({ label: 'Time Out', value: formatTime(attendance.timeOut, timeZone) });
  return times;
}

/**
 * Returns { kind, title, studentName, times: [{ label, value }], message, nextStep }.
 * `timeZone` is the school's time zone from the attendance list (the browser's when not loaded yet).
 */
export function describeScanResult(result, { timeZone } = {}) {
  const studentName = result.studentName ?? null;
  const base = { studentName, times: [], message: result.text, nextStep: null };

  switch (result.outcome) {
    case SCAN_OUTCOMES.TIME_IN:
      return {
        ...base,
        kind: FEEDBACK_KINDS.SUCCESS,
        title: 'Time In Recorded',
        times: [{ label: 'Time In', value: formatTime(result.attendance?.timeIn, timeZone) }],
        message: 'Attendance recorded successfully.',
      };
    case SCAN_OUTCOMES.TIME_OUT:
      return {
        ...base,
        kind: FEEDBACK_KINDS.SUCCESS,
        title: 'Time Out Recorded',
        times: [{ label: 'Time Out', value: formatTime(result.attendance?.timeOut, timeZone) }],
        message: 'Attendance recorded successfully.',
      };
    case SCAN_OUTCOMES.DUPLICATE_IGNORED:
      return {
        ...base,
        kind: FEEDBACK_KINDS.INFO,
        title: 'Scan Already Recorded',
        times: recordedTimes(result.attendance, timeZone),
        nextStep: 'No action needed.',
      };
    case SCAN_OUTCOMES.ALREADY_COMPLETED:
      return {
        ...base,
        kind: FEEDBACK_KINDS.INFO,
        title: 'Attendance Already Complete',
        times: recordedTimes(result.attendance, timeZone),
        nextStep: 'No action needed.',
      };
    case SCAN_OUTCOMES.UNKNOWN_RFID:
    case SCAN_OUTCOMES.RFID_UNASSIGNED:
    case SCAN_OUTCOMES.RFID_INACTIVE:
      return { ...base, kind: FEEDBACK_KINDS.WARNING, title: CARD_TITLES[result.outcome], nextStep: CARD_ACTION };
    case SCAN_OUTCOMES.STUDENT_INACTIVE:
      return {
        ...base,
        kind: FEEDBACK_KINDS.WARNING,
        title: 'Student Inactive',
        nextStep: 'Ask an administrator to check this student’s record in Students.',
      };
    default:
      if (result.offline) {
        return {
          ...base,
          kind: FEEDBACK_KINDS.OFFLINE,
          title: 'Attendance Could Not Be Recorded',
          nextStep: 'Reconnect to the internet, then scan the card again.',
        };
      }
      return { ...base, kind: FEEDBACK_KINDS.ERROR, title: 'Attendance Could Not Be Recorded', nextStep: 'Scan the card again.' };
  }
}

/**
 * Sound for a reader scan result (see lib/sounds.js): a recorded time in / time out -> 'success';
 * anything that needs attention (warning, error, offline) -> 'error'; nothing changed -> null.
 */
export function soundForScan(result) {
  const { kind } = describeScanResult(result, {});
  if (kind === FEEDBACK_KINDS.SUCCESS) return 'success';
  if (kind === FEEDBACK_KINDS.WARNING || kind === FEEDBACK_KINDS.ERROR || kind === FEEDBACK_KINDS.OFFLINE) return 'error';
  return null;
}
