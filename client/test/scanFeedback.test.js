// Large RFID scan-result card: what it says for every result the existing scan request returns.
// Display only - the fake API below answers like POST /api/attendance/scan; nothing is recorded.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SCAN_OUTCOMES } from '@led/shared';
import { submitAttendanceScan } from '../src/lib/attendanceScan.js';
import { AUTO_CLEAR_KINDS, describeScanResult, FEEDBACK_KINDS, soundForScan } from '../src/lib/scanFeedback.js';
import { OFFLINE_MESSAGE } from '../src/lib/format.js';

const UID = '202511060009301106100680';
const TZ = 'Asia/Manila';
const online = () => true;
// 2026-10-22 07:42 and 15:05 in Manila (UTC+8).
const TIME_IN = '2026-10-21T23:42:00.000Z';
const TIME_OUT = '2026-10-22T07:05:00.000Z';

const student = { studentId: 'K2026-001', name: 'Eithan Mendoza', section: 'K1' };

function scanOk(outcome, attendance, message = 'server message') {
  return async () => ({ scan: { outcome, message, student, attendance, sms: null } });
}

function scanRejected(outcome, message, scanExtra = {}) {
  return async () => {
    throw Object.assign(new Error(message), { status: 409, code: `attendance/${outcome}`, details: { scan: { outcome, ...scanExtra } } });
  };
}

const describeFor = async (request, isOnline = online) => describeScanResult(await submitAttendanceScan(UID, { request, isOnline }), { timeZone: TZ });

describe('scan result card (describeScanResult)', () => {
  it('time in: title, student name, recorded time, success message', async () => {
    const card = await describeFor(scanOk(SCAN_OUTCOMES.TIME_IN, { timeIn: TIME_IN, timeOut: null }));
    assert.equal(card.kind, FEEDBACK_KINDS.SUCCESS);
    assert.equal(card.title, 'Time In Recorded');
    assert.equal(card.studentName, 'Eithan Mendoza');
    assert.equal(card.times.length, 1);
    assert.equal(card.times[0].label, 'Time In');
    assert.match(card.times[0].value, /^7:42\s?AM$/i);
    assert.equal(card.message, 'Attendance recorded successfully.');
  });

  it('time out: shows the time out, not the time in', async () => {
    const card = await describeFor(scanOk(SCAN_OUTCOMES.TIME_OUT, { timeIn: TIME_IN, timeOut: TIME_OUT }));
    assert.equal(card.kind, FEEDBACK_KINDS.SUCCESS);
    assert.equal(card.title, 'Time Out Recorded');
    assert.deepEqual(card.times.map((t) => t.label), ['Time Out']);
    assert.match(card.times[0].value, /^3:05\s?PM$/i);
  });

  it('debounced repeat: "Scan Already Recorded" with the name, the server message and no action', async () => {
    const card = await describeFor(scanOk(SCAN_OUTCOMES.DUPLICATE_IGNORED, { timeIn: TIME_IN, timeOut: null }, 'Eithan Mendoza was scanned moments ago.'));
    assert.equal(card.kind, FEEDBACK_KINDS.INFO);
    assert.equal(card.title, 'Scan Already Recorded');
    assert.equal(card.studentName, 'Eithan Mendoza');
    assert.equal(card.message, 'Eithan Mendoza was scanned moments ago.');
    assert.equal(card.nextStep, 'No action needed.');
    assert.deepEqual(card.times.map((t) => t.label), ['Time In']);
  });

  it('day already complete (409): name and both times from the error details', async () => {
    const card = await describeFor(
      scanRejected(SCAN_OUTCOMES.ALREADY_COMPLETED, 'Eithan Mendoza already has a time in and time out today. No changes were made.', {
        student,
        attendance: { timeIn: TIME_IN, timeOut: TIME_OUT },
      }),
    );
    assert.equal(card.kind, FEEDBACK_KINDS.INFO);
    assert.equal(card.title, 'Attendance Already Complete');
    assert.equal(card.studentName, 'Eithan Mendoza');
    assert.deepEqual(card.times.map((t) => t.label), ['Time In', 'Time Out']);
  });

  it('unknown / unassigned / inactive card: warning, clearly different from success, no student', async () => {
    const cases = [
      [SCAN_OUTCOMES.UNKNOWN_RFID, 'RFID Card Not Recognized'],
      [SCAN_OUTCOMES.RFID_UNASSIGNED, 'RFID Card Not Assigned'],
      [SCAN_OUTCOMES.RFID_INACTIVE, 'RFID Card Inactive'],
    ];
    for (const [outcome, title] of cases) {
      const card = await describeFor(scanRejected(outcome, 'This RFID card is not registered. No attendance was recorded.'));
      assert.equal(card.kind, FEEDBACK_KINDS.WARNING, outcome);
      assert.equal(card.title, title);
      assert.equal(card.studentName, null);
      assert.deepEqual(card.times, []);
      assert.equal(card.message, 'This RFID card is not registered. No attendance was recorded.');
      assert.match(card.nextStep, /administrator/);
    }
  });

  it('inactive student: warning with the name', async () => {
    const card = await describeFor(scanRejected(SCAN_OUTCOMES.STUDENT_INACTIVE, 'Eithan Mendoza is marked inactive. No attendance was recorded.', { student }));
    assert.equal(card.kind, FEEDBACK_KINDS.WARNING);
    assert.equal(card.studentName, 'Eithan Mendoza');
  });

  it('offline (no request sent): offline card with the standard offline message', async () => {
    let called = false;
    const card = await describeFor(async () => {
      called = true;
    }, () => false);
    assert.equal(called, false);
    assert.equal(card.kind, FEEDBACK_KINDS.OFFLINE);
    assert.equal(card.title, 'Attendance Could Not Be Recorded');
    assert.equal(card.message, OFFLINE_MESSAGE);
  });

  it('connection lost during the request (network/offline): offline card', async () => {
    const card = await describeFor(async () => {
      throw Object.assign(new Error(OFFLINE_MESSAGE), { status: 0, code: 'network/offline' });
    });
    assert.equal(card.kind, FEEDBACK_KINDS.OFFLINE);
  });

  it('server/network error: error card with the safe message and "scan again"', async () => {
    const card = await describeFor(async () => {
      throw Object.assign(new Error('Cannot reach the server. Please try again.'), { status: 0, code: 'network/unreachable' });
    });
    assert.equal(card.kind, FEEDBACK_KINDS.ERROR);
    assert.equal(card.title, 'Attendance Could Not Be Recorded');
    assert.equal(card.message, 'Cannot reach the server. Please try again.');
    assert.equal(card.nextStep, 'Scan the card again.');
  });

  it('only success and "already recorded" cards clear on their own', () => {
    assert.deepEqual([...AUTO_CLEAR_KINDS].sort(), [FEEDBACK_KINDS.INFO, FEEDBACK_KINDS.SUCCESS].sort());
  });

  it('building the card never sends another request', async () => {
    let calls = 0;
    const result = await submitAttendanceScan(UID, {
      request: async () => {
        calls += 1;
        return { scan: { outcome: SCAN_OUTCOMES.TIME_IN, message: 'x', student, attendance: { timeIn: TIME_IN, timeOut: null }, sms: null } };
      },
      isOnline: online,
    });
    describeScanResult(result, { timeZone: TZ });
    describeScanResult(result, { timeZone: TZ });
    assert.equal(calls, 1);
  });
});

describe('scan sound (soundForScan)', () => {
  const resultOf = (request, isOnline = online) => submitAttendanceScan(UID, { request, isOnline });

  it('time in / time out -> success chime', async () => {
    assert.equal(soundForScan(await resultOf(scanOk(SCAN_OUTCOMES.TIME_IN, { timeIn: TIME_IN, timeOut: null }))), 'success');
    assert.equal(soundForScan(await resultOf(scanOk(SCAN_OUTCOMES.TIME_OUT, { timeIn: TIME_IN, timeOut: TIME_OUT }))), 'success');
  });

  it('repeated scan (nothing changed) -> no sound', async () => {
    assert.equal(soundForScan(await resultOf(scanOk(SCAN_OUTCOMES.DUPLICATE_IGNORED, { timeIn: TIME_IN, timeOut: null }))), null);
  });

  it('unknown card, offline and server errors -> error tone', async () => {
    assert.equal(soundForScan(await resultOf(scanRejected(SCAN_OUTCOMES.UNKNOWN_RFID, 'Not registered.'))), 'error');
    assert.equal(soundForScan(await resultOf(scanOk(SCAN_OUTCOMES.TIME_IN, {}), () => false)), 'error');
    const serverDown = async () => { throw Object.assign(new Error('Cannot reach the server.'), { status: 0, code: 'network/unavailable' }); };
    assert.equal(soundForScan(await resultOf(serverDown)), 'error');
  });
});
