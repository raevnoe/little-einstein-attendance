// Absence SMS: staff confirm a list of today's absent students, then the server texts their parents
// once. The clock is fixed to a class day after the end time, so "absent" does not depend on when the
// tests run: Monday 2026-09-14, 2:00 PM in Manila. In-memory Firebase fake, mock SMS.
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { startTestApi } from './helpers/testApi.js';

const TODAY = '2026-09-14';
const ANA = 'K2026-601'; // K1, parentA: has a number
const BEN = 'K2026-602'; // K1, parentB: no number
const CARL = 'K2026-603'; // K1, parentOff: turned off arrival/departure SMS
const DIA = 'K2026-604'; // K2, parentD: other section

let api;
let t;
let settingsModel;

const call = (method, token, body) => api.call(method, '/attendance/absence-notices', { token, body });
const notices = () => api.fake.all('notifications').filter((n) => n.event === 'absence');
const noticeOf = (res, id) => res.body.students.find((s) => s.studentId === id)?.notice;

before(async () => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-14T06:00:00Z') });
  api = await startTestApi();
  settingsModel = await import('../src/models/systemSettings.model.js');
  t = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacherK1: api.addUser({ uid: 'teacherK1', role: 'teacher', sections: ['K1'] }),
    teacherK2: api.addUser({ uid: 'teacherK2', role: 'teacher', sections: ['K2'] }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent' }),
    parentOff: api.addUser({ uid: 'parentOff', role: 'parent', mobileNumber: '+639172222222' }),
    parentD: api.addUser({ uid: 'parentD', role: 'parent', mobileNumber: '+639173333333' }),
  };
  api.fake.patch('users', 'parentOff', { attendanceSms: false });
});

after(async () => {
  await api.close();
  mock.timers.reset();
});

beforeEach(() => {
  for (const name of ['notifications', 'auditLogs', 'attendance', 'students']) api.fake.clear(name);
  const enrolled = Timestamp.fromDate(new Date('2026-08-15T02:00:00Z'));
  for (const [studentId, firstName, section, parentIds] of [
    [ANA, 'Ana', 'K1', ['parentA']], [BEN, 'Ben', 'K1', ['parentB']], [CARL, 'Carl', 'K1', ['parentOff']], [DIA, 'Dia', 'K2', ['parentD']],
  ]) {
    api.addStudent({ studentId, firstName, section, parentIds });
    api.fake.patch('students', studentId, { createdAt: enrolled });
  }
  api.fake.seed('systemSettings', 'sms', { attendanceSmsEnabled: true, allowParentSmsOptOut: true });
  settingsModel.clearSettingsCache();
});

describe('the list', () => {
  test('staff see absent students and what can be sent; no phone numbers', async () => {
    const res = await call('GET', t.admin);
    assert.equal(res.status, 200);
    assert.equal(res.body.schoolDate, TODAY);
    assert.equal(noticeOf(res, ANA), 'pending');
    assert.equal(noticeOf(res, BEN), 'no-number');
    assert.equal(noticeOf(res, CARL), 'opted-out');
    assert.ok(!JSON.stringify(res.body).includes('+639'));
  });

  test('a child with attendance today is not on it', async () => {
    api.fake.seed('attendance', `${ANA}_${TODAY}`, { studentId: ANA, schoolDate: TODAY, status: 'checked-in' });
    assert.equal(noticeOf(await call('GET', t.admin), ANA), undefined);
  });

  test('teachers see only their sections; parents and signed-out users are refused', async () => {
    const res = await call('GET', t.teacherK2);
    assert.deepEqual(res.body.students.map((s) => s.studentId), [DIA]);
    assert.equal((await call('GET', t.parentA)).status, 403);
    assert.equal((await call('POST', t.parentA, { studentIds: [ANA] })).status, 403);
    assert.equal((await api.call('GET', '/attendance/absence-notices')).status, 401);
  });
});

describe('sending', () => {
  test('texts only the ticked students, with the absence wording, and is audited', async () => {
    const res = await call('POST', t.admin, { studentIds: [ANA] });
    assert.equal(res.status, 200);
    assert.equal(res.body.sent, 1);
    assert.equal(noticeOf(res, ANA), 'sent');
    assert.equal(noticeOf(res, DIA), 'pending'); // not ticked
    const [notice] = notices();
    assert.equal(notices().length, 1);
    assert.equal(notice.status, 'sent');
    assert.equal(notice.schoolDate, TODAY);
    assert.match(notice.message, /Ana Test was marked/);
    assert.match(notice.message, /was marked absent today \(Sep 14\)\. Please contact the school if this is a mistake\.$/);
    assert.ok(notice.message.length <= 160);
    const entry = api.fake.all('auditLogs').find((e) => e.eventType === 'sms.absence-notices');
    assert.equal(entry.actor.uid, 'admin1');
    assert.deepEqual(entry.details, { students: 1, studentIds: [ANA], sent: 1, failed: 0 });
    assert.ok(!JSON.stringify(entry).includes('+639'));
  });

  test('a second press texts nobody again', async () => {
    assert.equal((await call('POST', t.admin, { studentIds: [ANA] })).status, 200);
    assert.equal((await call('POST', t.admin, { studentIds: [ANA] })).status, 409);
    assert.equal(notices().length, 1);
  });

  test('a child who arrived before sending is left out', async () => {
    api.fake.seed('attendance', `${ANA}_${TODAY}`, { studentId: ANA, schoolDate: TODAY, status: 'checked-in' });
    assert.equal((await call('POST', t.admin, { studentIds: [ANA] })).status, 409);
    assert.equal(notices().length, 0);
  });

  test('a teacher cannot text another section; opted-out and no-number parents get nothing', async () => {
    assert.equal((await call('POST', t.teacherK1, { studentIds: [DIA] })).status, 409);
    assert.equal((await call('POST', t.admin, { studentIds: [BEN, CARL] })).status, 409);
    assert.equal(notices().length, 0);
  });

  test('the school switch stops it', async () => {
    api.fake.seed('systemSettings', 'sms', { attendanceSmsEnabled: false, allowParentSmsOptOut: true });
    settingsModel.clearSettingsCache();
    assert.equal((await call('GET', t.admin)).body.smsEnabled, false);
    assert.equal((await call('POST', t.admin, { studentIds: [ANA] })).status, 409);
    assert.equal(notices().length, 0);
  });

  test('a failed text is reported, shown as failed and not sent again', async () => {
    api.fake.patch('users', 'parentA', { mobileNumber: '+639171119990' }); // the mock provider refuses this number
    const res = await call('POST', t.admin, { studentIds: [ANA] });
    api.fake.patch('users', 'parentA', { mobileNumber: '+639171111111' });
    assert.equal(res.status, 200);
    assert.deepEqual({ sent: res.body.sent, failed: res.body.failed }, { sent: 0, failed: 1 });
    assert.equal(noticeOf(res, ANA), 'failed');
    assert.equal(api.fake.all('auditLogs').find((e) => e.eventType === 'sms.absence-notices').outcome, 'failure');
    assert.equal((await call('POST', t.admin, { studentIds: [ANA] })).status, 409);
  });

  test('no list on a weekend, unless it is an extra class day', async () => {
    const saturday = new Date('2026-09-19T06:00:00Z');
    const { clearCalendarCache } = await import('../src/models/calendar.model.js');
    mock.timers.setTime(saturday.getTime());
    try {
      clearCalendarCache();
      assert.deepEqual((await call('GET', t.admin)).body.students, []);
      api.fake.seed('systemSettings', 'calendar', { extraClassDates: [{ date: '2026-09-19', reason: 'Make-up class' }] });
      clearCalendarCache();
      const res = await call('GET', t.admin);
      assert.equal(res.body.schoolDate, '2026-09-19');
      assert.equal(noticeOf(res, ANA), 'pending');
    } finally {
      mock.timers.setTime(new Date('2026-09-14T06:00:00Z').getTime());
      api.fake.clear('systemSettings');
      clearCalendarCache();
    }
  });

  test('bad requests are refused', async () => {
    assert.equal((await call('POST', t.admin, {})).status, 400);
    assert.equal((await call('POST', t.admin, { studentIds: [] })).status, 400);
    assert.equal((await call('POST', t.admin, { studentIds: ['<x>'] })).status, 400);
    assert.equal((await call('POST', t.admin, { studentIds: [ANA], message: 'hello' })).status, 400);
    assert.equal(notices().length, 0);
  });
});
