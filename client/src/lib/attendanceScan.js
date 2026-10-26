// The ONE client-side way to submit an RFID scan. Both the UHF RFID reader (keyboard
// emulation) and the manual UID fallback call submitAttendanceScan(), which posts the raw
// UID to POST /api/attendance/scan -> processRfidScan() on the server. The server decides
// everything else (UID normalization/validation, card, student, date, time in/out,
// debounce, SMS); the browser only sends the UID, says which input it came from (`method`:
// "reader" or "manual", stored by the server as rfid-reader / manual-entry) and shows the result.
//
// `request` is injected (the app passes apiRequest) so this module has no Firebase or
// Vite dependency and can be tested with Node's built-in test runner.
import { SCAN_METHODS, SCAN_OUTCOMES } from '@led/shared';
import { OFFLINE_MESSAGE } from './format.js';

export const SCAN_TONES = Object.freeze({
  ACCEPTED: 'accepted', // time in / time out recorded
  IGNORED: 'ignored', // same card again within the debounce period
  REJECTED: 'rejected', // invalid, unknown, inactive, unassigned, already completed, errors
});

/** One line about the parent SMS for a time-in/time-out (the server sends it; no numbers are shown). */
export function smsSummary(sms) {
  if (!sms) return null;
  const what = sms.event === 'arrival' ? 'Arrival SMS' : 'Departure SMS';
  const numbers = (n) => `${n} parent number${n === 1 ? '' : 's'}`;
  switch (sms.status) {
    case 'sent': return { error: false, text: `${what} sent to ${numbers(sms.sent)}.` };
    case 'partial': return { error: true, text: `${what} sent to ${sms.sent} of ${numbers(sms.recipients)}; ${sms.failed} failed.` };
    case 'skipped': return { error: true, text: `No SMS sent: no linked parent account has a mobile number.` };
    case 'off': return { error: false, text: 'No SMS: arrival and departure SMS are turned off in School Settings.' };
    case 'opted-out': return { error: false, text: 'No SMS: the parents turned off arrival and departure SMS.' };
    default: return { error: true, text: `${what} could not be sent. The attendance was still recorded.` };
  }
}

const browserIsOnline = () => globalThis.navigator?.onLine !== false;

/** The student's name and recorded times from the server's scan object (already in the response). */
function scanDetails(scan) {
  const attendance = scan?.attendance ? { timeIn: scan.attendance.timeIn ?? null, timeOut: scan.attendance.timeOut ?? null } : null;
  return { studentName: scan?.student?.name ?? null, attendance };
}

/**
 * Sends one scanned/typed UID to the server. Never throws. `method`: SCAN_METHODS.READER from the
 * reader panel, SCAN_METHODS.MANUAL (default) from the typed-UID form.
 * Returns { tone, text, sms, outcome, studentName, attendance, offline } for display;
 * `outcome` is null when no scan result came back.
 */
export async function submitAttendanceScan(rawUid, { request, isOnline = browserIsOnline, method = SCAN_METHODS.MANUAL }) {
  const uid = typeof rawUid === 'string' ? rawUid.trim() : '';
  const noScan = { sms: null, outcome: null, studentName: null, attendance: null, offline: false };
  if (!uid) return { ...noScan, tone: SCAN_TONES.REJECTED, text: 'Enter an RFID card UID.' };
  if (!isOnline()) return { ...noScan, tone: SCAN_TONES.REJECTED, text: OFFLINE_MESSAGE, offline: true };

  try {
    const { scan } = await request('/attendance/scan', { method: 'POST', body: { uid, method } });
    const ignored = scan.outcome === SCAN_OUTCOMES.DUPLICATE_IGNORED;
    return {
      tone: ignored ? SCAN_TONES.IGNORED : SCAN_TONES.ACCEPTED,
      text: scan.message,
      sms: smsSummary(scan.sms),
      outcome: scan.outcome,
      ...scanDetails(scan),
      offline: false,
    };
  } catch (error) {
    // Rejected scans (unknown/inactive/unassigned card, inactive student, already completed,
    // invalid UID) arrive as API errors whose message was written by the server for staff.
    return {
      tone: SCAN_TONES.REJECTED,
      text: error?.message || 'Something went wrong. Please try again.',
      sms: null,
      outcome: error?.details?.scan?.outcome ?? null,
      ...scanDetails(error?.details?.scan),
      offline: error?.code === 'network/offline',
    };
  }
}
