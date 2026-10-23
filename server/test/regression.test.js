// Regression checks for Daily Attendance (RFID scan + arrival/departure SMS) and Student
// Performance after Phase 9. Firebase is an in-memory fake; SMS goes to the mock provider.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let sms;
let smsService;
let teacher;
let parentA;
let parentB;
let today;

const UID = '300833B2DDD901C40A000001';

before(async () => {
  api = await startTestApi();
  smsService = await import('../src/services/sms/sms.service.js');
  const { createMockSmsProvider } = await import('../src/services/sms/mock.provider.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  sms = createMockSmsProvider();
  smsService.setSmsProviderForTests(sms);

  teacher = api.addUser({ uid: 'teacher1', role: 'teacher' });
  parentA = api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' });
  parentB = api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' });
  api.addStudent({ studentId: 'K2026-001', firstName: 'Ana', parentIds: ['parentA'], rfidCardUid: UID });
  api.addStudent({ studentId: 'K2026-003', firstName: 'Cara', parentIds: ['parentB'] });
  api.fake.seed('rfidCards', UID, { uid: UID, studentId: 'K2026-001', previousStudentId: null, active: true });
  // No debounce so the second scan is a time-out without waiting.
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
});

after(async () => {
  smsService.setSmsProviderForTests(null);
  await api.close();
});

test('RFID scan: time-in, time-out, then already-completed; arrival/departure SMS sent once each', async () => {
  const timeIn = await api.call('POST', '/attendance/scan', { token: teacher, body: { uid: '3008 33b2-ddd9:01c4 0a00 0001' } });
  assert.equal(timeIn.status, 201);
  assert.equal(timeIn.body.scan.outcome, 'time-in');
  assert.equal(timeIn.body.scan.sms.status, 'sent');

  const timeOut = await api.call('POST', '/attendance/scan', { token: teacher, body: { uid: UID } });
  assert.equal(timeOut.status, 200);
  assert.equal(timeOut.body.scan.outcome, 'time-out');

  const again = await api.call('POST', '/attendance/scan', { token: teacher, body: { uid: UID } });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'attendance/already-completed');

  assert.equal(sms.sent.length, 2);
  assert.match(sms.sent[0].message, /Ana Test has arrived/);
  assert.match(sms.sent[1].message, /Ana Test has checked out/);
  assert.equal(api.fake.all('attendance').length, 1);
  assert.equal(api.fake.read('attendance', `K2026-001_${today}`).status, 'checked-out');
  assert.equal(api.fake.all('notifications').length, 2);
  // An attendance time-out never creates or completes a dismissal.
  assert.equal(api.fake.all('dismissalRecords').length, 0);
});

test('unknown RFID UID records nothing', async () => {
  const res = await api.call('POST', '/attendance/scan', { token: teacher, body: { uid: 'ABCDEF01' } });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'attendance/unknown-rfid');
});

test('parents read only their own child’s attendance', async () => {
  const own = await api.call('GET', '/parent/children/K2026-001/attendance', { token: parentA });
  assert.equal(own.status, 200);
  assert.equal(own.body.attendance.todayStatus, 'checked-out');
  assert.ok(!own.text.includes(UID), 'no RFID UID for parents');
  assert.equal((await api.call('GET', '/parent/children/K2026-001/attendance', { token: parentB })).status, 404);
});

test('Performance Evaluation save, update and parent read-only view', async () => {
  const body = { studentId: 'K2026-001', evaluationDate: today, area: 'language', starRating: 4, observation: 'Read a short story.' };
  const created = await api.call('POST', '/performance', { token: teacher, body });
  assert.equal(created.status, 201);
  assert.equal(created.body.evaluation.teacherId, 'teacher1');
  const updated = await api.call('POST', '/performance', { token: teacher, body: { ...body, starRating: 5 } });
  assert.equal(updated.status, 200);
  assert.equal(api.fake.all('performance').length, 1);

  const forged = await api.call('POST', '/performance', { token: teacher, body: { ...body, teacherId: 'someone' } });
  assert.equal(forged.status, 400);

  const own = await api.call('GET', `/parent/children/K2026-001/performance?date=${today}`, { token: parentA });
  assert.equal(own.status, 200);
  assert.ok(!own.text.includes('teacher1'));
  assert.equal((await api.call('GET', '/parent/children/K2026-001/performance', { token: parentB })).status, 404);
  assert.equal((await api.call('POST', '/performance', { token: parentA, body })).status, 403);
});
