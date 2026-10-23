// Phase 6B: both the UHF reader and the manual fallback submit through submitAttendanceScan(),
// which calls the existing POST /api/attendance/scan (server: processRfidScan()).
// The API is a fake here: no network, no Firestore, no RFID data changes, no SMS.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRfidUid, SCAN_OUTCOMES } from '@led/shared';
import { SCAN_TONES, submitAttendanceScan } from '../src/lib/attendanceScan.js';
import { createKeyboardScanBuffer } from '../src/lib/rfidKeyboardScanner.js';
import { OFFLINE_MESSAGE } from '../src/lib/format.js';

const READER_UID = '202511060009301106100680';

/** Fake apiRequest that records calls and answers like the server would. */
function fakeApi(respond) {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    return respond(path, options);
  };
  return { calls, request };
}

const timeInResponse = () => ({
  scan: {
    outcome: SCAN_OUTCOMES.TIME_IN,
    accepted: true,
    message: 'Time in recorded for Ana Cruz.',
    sms: { event: 'arrival', status: 'sent', recipients: 1, sent: 1, failed: 0 },
  },
});

/** An ApiError-like rejection, as apiClient throws for 4xx scan outcomes. */
function apiError(message, outcome) {
  return Object.assign(new Error(message), { status: 404, details: { scan: { outcome } } });
}

const online = () => true;

describe('submitAttendanceScan (shared by reader and manual entry)', () => {
  it('6. a reader scan reaches the existing attendance scan API exactly once', async () => {
    const api = fakeApi(timeInResponse);
    const pending = [];
    const scanner = createKeyboardScanBuffer({
      onScan: (uid) => pending.push(submitAttendanceScan(uid, { request: api.request, isOnline: online })),
    });
    for (const ch of READER_UID) scanner.handleKeyDown({ key: ch, target: { tagName: 'BODY' } });
    scanner.handleKeyDown({ key: 'Enter', target: { tagName: 'BODY' }, preventDefault() {} });
    scanner.handleKeyDown({ key: 'Enter', target: { tagName: 'BODY' }, preventDefault() {} });
    const results = await Promise.all(pending);

    assert.equal(api.calls.length, 1, '8. one reader scan = one attendance request');
    assert.deepEqual(api.calls[0], { path: '/attendance/scan', options: { method: 'POST', body: { uid: READER_UID } } });
    assert.equal(results[0].tone, SCAN_TONES.ACCEPTED);
    assert.equal(results[0].text, 'Time in recorded for Ana Cruz.');
    assert.equal(results[0].sms.text, 'Arrival SMS sent to 1 parent number.');
  });

  it('5. manual UID entry still submits the same request (raw UID, trimmed)', async () => {
    const api = fakeApi(timeInResponse);
    const result = await submitAttendanceScan('  3008 33b2-ddd9:01c4 0a00 0001 ', { request: api.request, isOnline: online });
    assert.deepEqual(api.calls, [{ path: '/attendance/scan', options: { method: 'POST', body: { uid: '3008 33b2-ddd9:01c4 0a00 0001' } } }]);
    assert.equal(result.tone, SCAN_TONES.ACCEPTED);
  });

  it('3. an empty UID never calls the API', async () => {
    const api = fakeApi(timeInResponse);
    for (const uid of ['', '   ', undefined]) {
      const result = await submitAttendanceScan(uid, { request: api.request, isOnline: online });
      assert.equal(result.tone, SCAN_TONES.REJECTED);
      assert.equal(result.text, 'Enter an RFID card UID.');
    }
    assert.equal(api.calls.length, 0);
  });

  it('shows the server message for a debounced scan as "ignored"', async () => {
    const api = fakeApi(() => ({
      scan: { outcome: SCAN_OUTCOMES.DUPLICATE_IGNORED, message: 'Ana Cruz was scanned moments ago.', sms: null },
    }));
    const result = await submitAttendanceScan(READER_UID, { request: api.request, isOnline: online });
    assert.equal(result.tone, SCAN_TONES.IGNORED);
    assert.equal(result.sms, null);
  });

  it('shows rejected scans (unknown/inactive/unassigned card, inactive student, completed) with the server message', async () => {
    const message = 'This RFID card is not registered. No attendance was recorded.';
    const api = fakeApi(() => {
      throw apiError(message, SCAN_OUTCOMES.UNKNOWN_RFID);
    });
    const result = await submitAttendanceScan(READER_UID, { request: api.request, isOnline: online });
    assert.equal(result.tone, SCAN_TONES.REJECTED);
    assert.equal(result.text, message);
    assert.equal(result.outcome, SCAN_OUTCOMES.UNKNOWN_RFID);
  });

  it('does not call the API while offline', async () => {
    const api = fakeApi(timeInResponse);
    const result = await submitAttendanceScan(READER_UID, { request: api.request, isOnline: () => false });
    assert.equal(result.text, OFFLINE_MESSAGE);
    assert.equal(api.calls.length, 0);
  });

  it('the physical card UID is already valid under the existing shared rule (no new rule needed)', () => {
    assert.equal(normalizeRfidUid(READER_UID), READER_UID);
  });
});
