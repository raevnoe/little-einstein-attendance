// Late arrivals: decided at time-in from the section's own start time (or the school default) plus the
// grace period, stored on the record, shown to staff/parents/reports, and excusable by staff.
// The real clock is used, so the tests pick start times that make the result certain:
//   "00:00" + 0 min grace  -> every time-in is late;   "23:00" + 60 min grace -> every time-in is on time
//   (the class must end after it starts, so those cases also set the end time to "23:59").
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { arrivalFor } from '@led/shared';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let settingsModel;
let today;

const ANA = 'K2026-401'; // K1, parentA
const BEN = 'K2026-402'; // K2
const CARD_ANA = 'E2000017221101441890D401';
const CARD_BEN = 'E2000017221101441890D402';

const scan = (uid) => api.call('POST', '/attendance/scan', { token: tokens.teacher, body: { uid, method: 'reader' } });
const record = (studentId) => api.fake.read('attendance', `${studentId}_${today}`);
const excuse = (studentId, body, token = tokens.teacher) =>
  api.call('PATCH', `/attendance/${studentId}_${today}/late`, { token, body });
const entries = (eventType) => api.fake.all('auditLogs').filter((e) => e.eventType === eventType);

function schoolDefault(classStartTime, lateGraceMinutes) {
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0, classStartTime, lateGraceMinutes });
  settingsModel.clearSettingsCache();
}

before(async () => {
  api = await startTestApi();
  settingsModel = await import('../src/models/systemSettings.model.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }), // K1 + K2
    teacherK2: api.addUser({ uid: 'teacherK2', role: 'teacher', sections: ['K2'] }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', section: 'K1', parentIds: ['parentA'], rfidCardUid: CARD_ANA });
  api.addStudent({ studentId: BEN, firstName: 'Ben', section: 'K2', rfidCardUid: CARD_BEN });
  api.fake.seed('rfidCards', CARD_ANA, { uid: CARD_ANA, studentId: ANA, active: true });
  api.fake.seed('rfidCards', CARD_BEN, { uid: CARD_BEN, studentId: BEN, active: true });
});

after(async () => {
  await api.close();
});

beforeEach(() => {
  for (const name of ['attendance', 'auditLogs']) api.fake.clear(name);
  api.fake.seed('systemSettings', 'sections', { names: ['K1', 'K2'] });
  schoolDefault('00:00', 0);
});

describe('the rule', () => {
  test('late = strictly after start + grace; minutes are counted from the start time', () => {
    const at = (h, m, s = 0) => ((h * 60 + m) * 60 + s) * 1000;
    assert.deepEqual(arrivalFor({ elapsedMs: at(7, 50), startTime: '08:00', graceMinutes: 15 }), { arrivalStatus: 'on-time', lateMinutes: 0 });
    assert.deepEqual(arrivalFor({ elapsedMs: at(8, 15), startTime: '08:00', graceMinutes: 15 }), { arrivalStatus: 'on-time', lateMinutes: 0 });
    assert.deepEqual(arrivalFor({ elapsedMs: at(8, 15, 1), startTime: '08:00', graceMinutes: 15 }), { arrivalStatus: 'late', lateMinutes: 15 });
    assert.deepEqual(arrivalFor({ elapsedMs: at(8, 22, 30), startTime: '08:00', graceMinutes: 15 }), { arrivalStatus: 'late', lateMinutes: 22 });
    assert.deepEqual(arrivalFor({ elapsedMs: at(13, 5), startTime: '13:00', graceMinutes: 0 }), { arrivalStatus: 'late', lateMinutes: 5 });
  });
});

describe('time-in', () => {
  test('a late time-in is stored with the start time and grace that applied, and audited', async () => {
    const res = await scan(CARD_ANA);
    assert.equal(res.status, 201);
    assert.equal(res.body.scan.attendance.arrivalStatus, 'late');
    const stored = record(ANA);
    assert.equal(stored.arrivalStatus, 'late');
    assert.ok(stored.lateMinutes >= 0);
    assert.equal(stored.scheduledStart, '00:00');
    assert.equal(stored.graceMinutes, 0);
    assert.equal(entries('attendance.time-in')[0].details.arrivalStatus, 'late');

    // The time-out does not change it.
    await scan(CARD_ANA);
    assert.equal(record(ANA).arrivalStatus, 'late');
  });

  test('a section\'s own start time wins over the school default; clearing it goes back to the default', async () => {
    assert.equal((await api.call('PATCH', '/admin/sections/k1', { token: tokens.admin, body: { startTime: '23:00', endTime: '23:59' } })).status, 200);
    schoolDefault('00:00', 60);
    await scan(CARD_ANA);
    await scan(CARD_BEN);
    assert.equal(record(ANA).arrivalStatus, 'on-time', 'K1 uses its own 23:00');
    assert.equal(record(ANA).scheduledStart, '23:00');
    assert.equal(record(BEN).scheduledStart, '00:00', 'K2 uses the school default');
    const changed = entries('section.class-hours-changed')[0];
    assert.deepEqual(changed.details, { section: 'K1', startTime: '23:00', endTime: '23:59' });

    const list = await api.call('GET', '/admin/sections', { token: tokens.admin });
    assert.equal(list.body.sections.find((s) => s.name === 'K1').startTime, '23:00');
    assert.equal(list.body.sections.find((s) => s.name === 'K2').startTime, null);

    await api.call('PATCH', '/admin/sections/K1', { token: tokens.admin, body: { startTime: null, endTime: null } });
    assert.equal(api.fake.read('systemSettings', 'sections').startTimes.K1, undefined);
    assert.equal(api.fake.read('systemSettings', 'sections').endTimes.K1, undefined);
    // Changing the start time later never rewrites a day already recorded.
    assert.equal(record(ANA).arrivalStatus, 'on-time');
  });

  test('section start times: admin only, valid times only, listed sections only, kept when sections change', async () => {
    assert.equal((await api.call('PATCH', '/admin/sections/K1', { token: tokens.teacher, body: { startTime: '07:30' } })).status, 403);
    for (const startTime of ['25:00', '7:30', '07:30 AM', 730]) {
      assert.equal((await api.call('PATCH', '/admin/sections/K1', { token: tokens.admin, body: { startTime } })).status, 400, String(startTime));
    }
    assert.equal((await api.call('PATCH', '/admin/sections/K1', { token: tokens.admin, body: { startTime: '07:30', name: 'x' } })).status, 400);
    assert.equal((await api.call('PATCH', '/admin/sections/Nope', { token: tokens.admin, body: { startTime: '07:30' } })).status, 404);

    await api.call('PATCH', '/admin/sections/K1', { token: tokens.admin, body: { startTime: '07:30' } });
    await api.call('POST', '/admin/sections', { token: tokens.admin, body: { name: 'K3' } });
    assert.deepEqual(api.fake.read('systemSettings', 'sections').startTimes, { K1: '07:30' }, 'adding a section keeps start times');
  });

  test('the school default start time and grace are School Settings', async () => {
    const res = await api.call('PATCH', '/admin/settings', { token: tokens.admin, body: { attendance: { classStartTime: '23:00', classEndTime: '23:59', lateGraceMinutes: 60 } } });
    assert.equal(res.status, 200);
    await scan(CARD_BEN);
    assert.equal(record(BEN).arrivalStatus, 'on-time');
    const bad = await api.call('PATCH', '/admin/settings', { token: tokens.admin, body: { attendance: { classStartTime: '8:00' } } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details.fields['attendance.classStartTime']);
  });
});

describe('where it shows', () => {
  test('staff list counts late arrivals; parents see the status but never the excuse reason', async () => {
    await scan(CARD_ANA);
    const list = await api.call('GET', '/attendance', { token: tokens.admin });
    assert.equal(list.body.summary.late, 1);
    assert.equal(list.body.records.find((r) => r.student.studentId === ANA).attendance.arrivalStatus, 'late');

    await excuse(ANA, { excused: true, reason: 'Doctor appointment' });
    const parent = await api.call('GET', `/parent/children/${ANA}/attendance`, { token: tokens.parentA });
    const day = parent.body.attendance.records.find((r) => r.schoolDate === today);
    assert.equal(day.arrivalStatus, 'excused');
    assert.ok(!('excuseReason' in day) && !parent.text.includes('Doctor'));

    const report = await api.call('GET', `/reports/attendance?from=${today}&to=${today}`, { token: tokens.admin });
    assert.equal(report.body.days[0].lateExcused, 1);
    assert.equal(report.body.students.find((s) => s.student.studentId === ANA).daysLateExcused, 1);
    const summary = await api.call('GET', '/reports/today', { token: tokens.admin });
    assert.equal(summary.body.attendance.late, 0, 'excused arrivals are not counted as late');
  });
});

describe('excusing a late arrival', () => {
  test('a teacher excuses with a reason (kept off the audit log) and can remove the excuse', async () => {
    await scan(CARD_ANA);
    const res = await excuse(ANA, { excused: true, reason: '  Flooding  on   the road ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.attendance.arrivalStatus, 'excused');
    assert.equal(res.body.attendance.excuseReason, 'Flooding on the road');
    assert.equal(record(ANA).excusedBy, 'teacher1');
    const entry = entries('attendance.late-excused')[0];
    assert.equal(entry.actor.uid, 'teacher1');
    assert.ok(!JSON.stringify(entry).includes('Flooding'), 'reason not in the audit log');

    const undo = await excuse(ANA, { excused: false });
    assert.equal(undo.body.attendance.arrivalStatus, 'late');
    assert.equal(record(ANA).excuseReason, null);
    assert.equal(entries('attendance.late-excuse-removed').length, 1);
  });

  test('refused: no reason, on-time arrivals, other sections, parents, unknown records', async () => {
    await scan(CARD_ANA);
    for (const body of [{ excused: true }, { excused: true, reason: 'ok' }, { excused: true, reason: 'x'.repeat(201) }, { excused: 'yes' }, { excused: true, reason: 'Traffic', by: 'x' }]) {
      assert.equal((await excuse(ANA, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await excuse(ANA, { excused: false })).status, 409, 'not excused yet');
    assert.equal((await excuse(ANA, { excused: true, reason: 'Traffic' }, tokens.teacherK2)).status, 404, 'not this teacher\'s section');
    assert.equal((await excuse(ANA, { excused: true, reason: 'Traffic' }, tokens.parentA)).status, 403);
    assert.equal((await api.call('PATCH', `/attendance/${BEN}_${today}/late`, { token: tokens.admin, body: { excused: true, reason: 'Traffic' } })).status, 404, 'no record');
    assert.equal((await api.call('PATCH', '/attendance/not-an-id/late', { token: tokens.admin, body: { excused: true, reason: 'Traffic' } })).status, 404);

    schoolDefault('23:00', 60);
    await scan(CARD_BEN);
    assert.equal((await excuse(BEN, { excused: true, reason: 'Traffic' }, tokens.admin)).status, 409, 'on time');
    assert.equal(record(ANA).arrivalStatus, 'late', 'nothing changed');
  });
});

describe('SMS text', () => {
  test('says a late arrival or early pick-up in hours and minutes; on time stays as before', async () => {
    const { attendanceSmsMessage } = await import('../src/services/notification.service.js');
    const student = { firstName: 'Ana', lastName: 'Cruz' };
    const at = new Date('2026-09-07T01:20:00Z'); // 9:20 AM in Manila
    const arrival = (rec) => attendanceSmsMessage('arrival', student, at, rec);
    const pickUp = (rec) => attendanceSmsMessage('departure', student, at, rec);

    assert.match(arrival({ arrivalStatus: 'late', lateMinutes: 65 }), /Ana Cruz arrived at school at 9:20 AM \(1 hour 5 min late\)\.$/);
    assert.match(arrival({ arrivalStatus: 'late', lateMinutes: 20 }), /\(20 min late\)\.$/);
    assert.match(arrival({ arrivalStatus: 'late', lateMinutes: 120 }), /\(2 hours late\)\.$/);
    assert.match(arrival({ arrivalStatus: 'on-time', lateMinutes: 0 }), /Ana Cruz has arrived at school at 9:20 AM\.$/);
    assert.match(arrival(null), /has arrived at school at 9:20 AM\.$/); // older records: no status
    assert.match(pickUp({ departureStatus: 'early', earlyMinutes: 75 }), /picked up early at 9:20 AM \(1 hour 15 min before class ended\)\.$/);
    assert.match(pickUp({ departureStatus: 'on-time', earlyMinutes: 0 }), /Ana Cruz was picked up at 9:20 AM\.$/);
    // One SMS (160 GSM-7 characters) even with a long name.
    const long = attendanceSmsMessage('departure', { firstName: 'Maria Clarissa', lastName: 'Dela Cruz' }, at, { departureStatus: 'early', earlyMinutes: 135 });
    assert.ok(long.length <= 160, `${long.length} characters`);
  });
});
