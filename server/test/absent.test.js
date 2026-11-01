// Absent, class days (school calendar), class end time and early pick-up, and the parent's month
// calendar. Past dates in September 2026 keep the results independent of when the tests run:
//   Sep 5 Sat · Sep 7 Mon (present) · Sep 8 Tue (late) · Sep 9 Wed (holiday) · Sep 10 Thu (no record = absent)
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { departureFor, dayStatusWithoutRecord } from '@led/shared';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let calendarModel;
let settingsModel;

const ANA = 'K2026-501'; // K1, parentA, enrolled Aug 15
const BEN = 'K2026-502'; // K2, enrolled Sep 20 (after the dates below)
const CARD_ANA = 'E2000017221101441890E501';
const CALENDAR = { schoolYearStart: '2026-09-01', noClassDates: [{ date: '2026-09-09', reason: 'Holiday' }] };

const call = (method, path, token, body) => api.call(method, path, { token, body });
const entries = (eventType) => api.fake.all('auditLogs').filter((e) => e.eventType === eventType);
const created = (date) => Timestamp.fromDate(new Date(`${date}T02:00:00Z`));

before(async () => {
  api = await startTestApi();
  calendarModel = await import('../src/models/calendar.model.js');
  settingsModel = await import('../src/models/systemSettings.model.js');
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent' }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', section: 'K1', parentIds: ['parentA'], rfidCardUid: CARD_ANA });
  api.addStudent({ studentId: BEN, firstName: 'Ben', section: 'K2' });
  api.fake.patch('students', ANA, { createdAt: created('2026-08-15') });
  api.fake.patch('students', BEN, { createdAt: created('2026-09-20') });
  api.fake.seed('rfidCards', CARD_ANA, { uid: CARD_ANA, studentId: ANA, active: true });
  seedSeptember();
});

function seedSeptember() {
  const at = (date, hh) => Timestamp.fromDate(new Date(`${date}T${hh}:00+08:00`));
  api.fake.clear('attendance');
  api.fake.seed('attendance', `${ANA}_2026-09-07`, { studentId: ANA, schoolDate: '2026-09-07', status: 'checked-out', timeIn: at('2026-09-07', '07:50'), timeOut: at('2026-09-07', '11:40'), arrivalStatus: 'on-time', lateMinutes: 0, departureStatus: 'on-time', earlyMinutes: 0 });
  api.fake.seed('attendance', `${ANA}_2026-09-08`, { studentId: ANA, schoolDate: '2026-09-08', status: 'checked-out', timeIn: at('2026-09-08', '08:40'), timeOut: at('2026-09-08', '10:30'), arrivalStatus: 'late', lateMinutes: 40, departureStatus: 'early', earlyMinutes: 60 });
}

after(async () => {
  await api.close();
});

beforeEach(async () => {
  api.fake.clear('auditLogs');
  seedSeptember();
  api.fake.seed('systemSettings', 'calendar', CALENDAR);
  api.fake.seed('systemSettings', 'sections', { names: ['K1', 'K2'] });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
  calendarModel.clearCalendarCache();
  settingsModel.clearSettingsCache();
});

describe('the rules', () => {
  test('no record: no class, not arrived before the end time, absent after it', () => {
    const base = { today: '2026-09-10', endTime: '11:30', calendar: CALENDAR };
    const at = (h, m) => (h * 60 + m) * 60_000;
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-10', elapsedMs: at(9, 0) }), 'not-arrived');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-10', elapsedMs: at(11, 30) }), 'absent');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-08', elapsedMs: 0 }), 'absent');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-09', elapsedMs: 0 }), 'no-class', 'holiday');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-05', elapsedMs: 0 }), 'no-class', 'Saturday');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-08-31', elapsedMs: 0 }), 'no-class', 'before the school year');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-08', elapsedMs: 0, enrolledFrom: '2026-09-09' }), 'no-class', 'not enrolled yet');
    assert.equal(dayStatusWithoutRecord({ ...base, schoolDate: '2026-09-11', elapsedMs: 0 }), 'future');
  });

  test('early pick-up = strictly before the class end time', () => {
    const at = (h, m) => (h * 60 + m) * 60_000;
    assert.deepEqual(departureFor({ elapsedMs: at(10, 30), endTime: '11:30' }), { departureStatus: 'early', earlyMinutes: 60 });
    assert.deepEqual(departureFor({ elapsedMs: at(11, 30), endTime: '11:30' }), { departureStatus: 'on-time', earlyMinutes: 0 });
  });
});

describe('daily attendance', () => {
  test('a class day with no arrival is absent; holidays, weekends and days before enrolment are no class', async () => {
    const thu = await call('GET', '/attendance?date=2026-09-10', tokens.admin);
    const row = (res, id) => res.body.records.find((r) => r.student.studentId === id);
    assert.equal(row(thu, ANA).status, 'absent');
    assert.equal(row(thu, BEN).status, 'no-class', 'Ben was added later');
    assert.equal(thu.body.summary.absent, 1);
    assert.equal(thu.body.noClass, null);

    const wed = await call('GET', '/attendance?date=2026-09-09', tokens.admin);
    assert.equal(wed.body.noClass, 'Holiday');
    assert.equal(row(wed, ANA).status, 'no-class');
    const sat = await call('GET', '/attendance?date=2026-09-05', tokens.admin);
    assert.equal(sat.body.noClass, 'Weekend');

    const absentOnly = await call('GET', '/attendance?date=2026-09-10&status=absent', tokens.admin);
    assert.deepEqual(absentOnly.body.records.map((r) => r.student.studentId), [ANA]);
  });

  test('early pick-up is decided at time-out and stored', async () => {
    await call('PATCH', '/admin/sections/K1', tokens.admin, { startTime: '00:00', endTime: '23:59' });
    api.fake.clear('attendance');
    assert.equal((await call('POST', '/attendance/scan', tokens.teacher, { uid: CARD_ANA })).status, 201);
    const out = await call('POST', '/attendance/scan', tokens.teacher, { uid: CARD_ANA });
    assert.equal(out.body.scan.outcome, 'time-out', JSON.stringify(out.body));
    assert.equal(out.body.scan.attendance.departureStatus, 'early');
    const today = out.body.scan.schoolDate;
    const stored = api.fake.read('attendance', `${ANA}_${today}`);
    assert.equal(stored.departureStatus, 'early');
    assert.equal(stored.scheduledEnd, '23:59');
    assert.equal(entries('attendance.time-out')[0].details.departureStatus, 'early');
    await call('PATCH', '/admin/sections/K1', tokens.admin, { startTime: null, endTime: null });
  });

  test('class hours must end after they start (school default and per section)', async () => {
    const bad = await call('PATCH', '/admin/settings', tokens.admin, { attendance: { classEndTime: '07:00' } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details.fields['attendance.classEndTime']);
    const badSection = await call('PATCH', '/admin/sections/K1', tokens.admin, { endTime: '07:00' });
    assert.equal(badSection.status, 400);
    const ok = await call('PATCH', '/admin/sections/K1', tokens.admin, { startTime: '13:00', endTime: '16:00' });
    assert.equal(ok.status, 200);
    assert.deepEqual(entries('section.class-hours-changed')[0].details, { section: 'K1', startTime: '13:00', endTime: '16:00' });
    await call('PATCH', '/admin/sections/K1', tokens.admin, { startTime: null, endTime: null });
  });
});

describe('school calendar (admin)', () => {
  test('only admins read or change it; it is validated and audited', async () => {
    assert.equal((await call('GET', '/admin/calendar', tokens.teacher)).status, 403);
    assert.deepEqual((await call('GET', '/admin/calendar', tokens.admin)).body.calendar, CALENDAR);

    for (const body of [
      { schoolYearStart: '2026-02-30' },
      { noClassDates: [{ date: 'tomorrow' }] },
      { noClassDates: [{ date: '2026-09-09' }, { date: '2026-09-09' }] },
      { noClassDates: [{ date: '2026-09-09', reason: 'x'.repeat(81) }] },
      { holidays: [] },
    ]) {
      assert.equal((await call('PUT', '/admin/calendar', tokens.admin, body)).status, 400, JSON.stringify(body));
    }

    const res = await call('PUT', '/admin/calendar', tokens.admin, {
      schoolYearStart: '2026-09-01',
      noClassDates: [{ date: '2026-09-09', reason: 'Holiday' }, { date: '2026-09-04', reason: '  Typhoon   suspension ' }],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.calendar.noClassDates[0], { date: '2026-09-04', reason: 'Typhoon suspension' });
    const entry = entries('settings.changed').find((e) => e.target.id === 'calendar');
    assert.deepEqual(entry.details.changes, ['added 2026-09-04']);
  });
});

describe("parent's month calendar", () => {
  test('present (green), late (yellow), absent (red) and no-class days, for the own child only', async () => {
    const res = await call('GET', `/parent/children/${ANA}/calendar?month=2026-09`, tokens.parentA);
    assert.equal(res.status, 200);
    const { calendar } = res.body;
    const day = (d) => calendar.days.find((x) => x.date === `2026-09-${d}`);
    assert.equal(calendar.days.length, 30);
    assert.equal(day('07').status, 'present');
    assert.equal(day('08').status, 'late');
    assert.equal(day('08').lateMinutes, 40);
    assert.equal(day('08').departureStatus, 'early');
    assert.deepEqual([day('09').status, day('09').note], ['no-class', 'Holiday']);
    assert.equal(day('10').status, 'absent');
    assert.deepEqual([day('05').status, day('05').note], ['no-class', 'Weekend']);
    assert.ok(calendar.summary.absent >= 1);
    assert.ok(!res.text.includes('rfid') && !res.text.includes('Source'), 'no staff-only data');

    assert.equal((await call('GET', `/parent/children/${ANA}/calendar?month=2026-09`, tokens.parentB)).status, 404);
    assert.equal((await call('GET', `/parent/children/${ANA}/calendar?month=2026-13`, tokens.parentA)).status, 400);
    assert.equal((await call('GET', `/parent/children/${ANA}/calendar?month=2999-01`, tokens.parentA)).status, 400);
    assert.equal((await call('GET', `/parent/children/${ANA}/calendar?month=2026-09`, tokens.teacher)).status, 403);
  });

  test('the attendance report counts absences by the calendar', async () => {
    const res = await call('GET', '/reports/attendance?from=2026-09-07&to=2026-09-11', tokens.admin);
    const ana = res.body.students.find((s) => s.student.studentId === ANA);
    assert.deepEqual(ana.absentDates, ['2026-09-10', '2026-09-11']);
    assert.equal(ana.daysAbsent, 2);
    assert.equal(ana.daysPickedUpEarly, 1);
    const wed = res.body.days.find((d) => d.schoolDate === '2026-09-09');
    assert.deepEqual([wed.noClass, wed.absent], ['Holiday', 0]);
  });
});
