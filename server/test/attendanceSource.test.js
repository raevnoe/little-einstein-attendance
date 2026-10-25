// Scan source: the Attendance page reports which input a UID came from ("reader" from the UHF RFID
// Reader panel, "manual" from the typed-UID form); the SERVER maps it to the stored entrySource /
// exitSource and refuses anything else. In-memory Firebase fake, mock SMS: nothing real is sent.
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let teacher;
let audit;
let today;
const ANA = 'K2026-201';
const CARD = 'E2000017221101441890B201';

before(async () => {
  api = await startTestApi();
  audit = await import('../src/services/audit.service.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  teacher = api.addUser({ uid: 'teacher1', role: 'teacher' });
  api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' });
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA'], rfidCardUid: CARD });
  api.fake.seed('rfidCards', CARD, { uid: CARD, studentId: ANA, active: true });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
});

after(async () => {
  await api.close();
});

beforeEach(() => {
  api.fake.clear('attendance');
  api.fake.clear('notifications');
  api.fake.clear('auditLogs');
  audit.resetAuditSuppressionForTests();
});

const scan = (body) => api.call('POST', '/attendance/scan', { token: teacher, body });
const record = () => api.fake.read('attendance', `${ANA}_${today}`);

test('a reader scan is stored as rfid-reader; a typed UID as manual-entry', async () => {
  assert.equal((await scan({ uid: CARD, method: 'reader' })).status, 201);
  assert.equal((await scan({ uid: CARD, method: 'manual' })).status, 200);
  assert.equal(record().entrySource, 'rfid-reader');
  assert.equal(record().exitSource, 'manual-entry');

  // The staff list returns both sources (for the "typed" mark).
  const list = await api.call('GET', '/attendance', { token: teacher });
  const row = list.body.records.find((r) => r.student.studentId === ANA);
  assert.equal(row.attendance.entrySource, 'rfid-reader');
  assert.equal(row.attendance.exitSource, 'manual-entry');
});

test('no method (e.g. an older cached app) counts as manual-entry, never as the reader', async () => {
  assert.equal((await scan({ uid: CARD })).status, 201);
  assert.equal(record().entrySource, 'manual-entry');
});

test('any other method is refused and records nothing', async () => {
  for (const method of ['rfid-reader', 'manual-test', 'READER', 'admin', 5, true, ['reader'], { x: 1 }, '']) {
    const res = await scan({ uid: CARD, method });
    assert.equal(res.status, 400, `method ${JSON.stringify(method)}`);
    assert.equal(res.body.error.code, 'validation/invalid-scan-method');
  }
  assert.equal(record(), undefined);
  assert.equal(api.fake.all('notifications').length, 0);
});

test('the audit log records the source for accepted and rejected scans', async () => {
  await scan({ uid: CARD, method: 'reader' });
  await scan({ uid: 'E2000017221101441890FFFF', method: 'manual' });
  const entries = api.fake.all('auditLogs');
  const timeIn = entries.find((e) => e.eventType === 'attendance.time-in');
  const rejected = entries.find((e) => e.eventType === 'rfid.scan.rejected');
  assert.equal(timeIn.details.source, 'rfid-reader');
  assert.equal(rejected.details.source, 'manual-entry');
});

test('parents never see the source', async () => {
  await scan({ uid: CARD, method: 'reader' });
  const parentToken = 'tok-parentA';
  const res = await api.call('GET', `/parent/children/${ANA}/attendance`, { token: parentToken });
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes('rfid-reader'));
});
