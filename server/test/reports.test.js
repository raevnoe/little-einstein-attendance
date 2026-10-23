// Phase 10 reports and dashboard summaries. Firebase is the in-memory fake; nothing is sent.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let today;
let day; // day(n) = n days before today
let addDays;

const ANA = 'K2026-001'; // active, K1
const BEN = 'K2026-002'; // active, K2
const CY = 'K2026-003'; // inactive, has a record in range
const DEX = 'K2026-004'; // inactive, no records
const ANA_UID = 'E2000017221101441890AAAA';
const MOBILE = '+639171234567';
const SECRET_SMS_TEXT = 'Little Einstein: Ana arrived at 7:45 AM.';

/** Timestamp at HH:MM (Asia/Manila, UTC+8) on a school date. */
const at = (date, hhmm) => Timestamp.fromDate(new Date(`${date}T${hhmm}:00+08:00`));

function seedAttendance(studentId, date, timeIn, timeOut = null) {
  api.fake.seed('attendance', `${studentId}_${date}`, {
    studentId, schoolDate: date, status: timeOut ? 'checked-out' : 'checked-in',
    timeIn: at(date, timeIn), timeOut: timeOut ? at(date, timeOut) : null,
    entrySource: 'manual-test', exitSource: timeOut ? 'manual-test' : null,
    entryRfidUid: ANA_UID, exitRfidUid: timeOut ? ANA_UID : null,
  });
}

function seedEvaluation(studentId, date, area, starRating, observation = '', teacherId = 'teacher1') {
  api.fake.seed('performance', `${studentId}_${date}_${area}`, {
    studentId, evaluationDate: date, area, starRating, observation, teacherId,
  });
}

before(async () => {
  api = await startTestApi();
  ({ addDays } = await import('../src/utils/schoolDate.js'));
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf();
  day = (n) => addDays(today, -n);

  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin', firstName: 'Ada' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher', firstName: 'Tess' }),
    inactiveTeacher: api.addUser({ uid: 'teacher2', role: 'teacher', active: false }),
    parent: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: MOBILE }),
    parentNoMobile: api.addUser({ uid: 'parentB', role: 'parent' }),
    escalator: api.addUser({ uid: 'parentC', role: 'parent', claimRole: 'admin' }), // profile says parent
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', lastName: 'Cruz', section: 'K1', parentIds: ['parentA'], rfidCardUid: ANA_UID });
  api.addStudent({ studentId: BEN, firstName: 'Ben', lastName: 'Diaz', section: 'K2', parentIds: ['parentB'] });
  api.addStudent({ studentId: CY, firstName: 'Cy', lastName: 'Lim', section: 'K1', active: false });
  api.addStudent({ studentId: DEX, firstName: 'Dex', lastName: 'Ong', section: 'K1', active: false });

  // Attendance: day(3) has NO records at all (e.g. a weekend).
  seedAttendance(ANA, day(2), '07:40', '11:30');
  seedAttendance(ANA, day(1), '07:50'); // no time out recorded
  seedAttendance(BEN, day(2), '07:55'); // no time out recorded
  seedAttendance(CY, day(1), '08:00', '11:00');
  seedAttendance(ANA, today, '07:45');
  seedAttendance(ANA, day(40), '07:45', '11:00'); // outside every range used below

  // Performance
  seedEvaluation(ANA, day(1), 'language', 4, '=HYPERLINK("http://x") Reads short words.');
  seedEvaluation(ANA, day(1), 'mathematics', 3, 'Counts to 20.');
  seedEvaluation(ANA, day(2), 'language', 5);
  seedEvaluation(CY, day(2), 'science', 2, 'Needs help.');
  seedEvaluation(ANA, today, 'language', 4);

  // RFID cards
  api.fake.seed('rfidCards', ANA_UID, { uid: ANA_UID, studentId: ANA, active: true });
  api.fake.seed('rfidCards', 'E2000017221101441890BBBB', { uid: 'E2000017221101441890BBBB', studentId: null, active: true });
  api.fake.seed('rfidCards', 'E2000017221101441890CCCC', { uid: 'E2000017221101441890CCCC', studentId: null, active: false });

  // Dismissals today
  const later = Timestamp.fromMillis(Date.now() + 10 * 60_000);
  api.fake.seed('dismissalRecords', `${ANA}_${today}`, {
    dismissalId: `${ANA}_${today}`, studentId: ANA, schoolDate: today, status: 'awaiting-verification',
    otpExpiresAt: later, otpHash: 'a'.repeat(64), otpSalt: 'b'.repeat(32),
  });
  api.fake.seed('dismissalRecords', `${BEN}_${today}`, {
    dismissalId: `${BEN}_${today}`, studentId: BEN, schoolDate: today, status: 'released', otpExpiresAt: later,
  });

  // SMS notification records: 2 sent, 1 failed, 1 skipped today; 1 sent long ago.
  const now = Timestamp.now();
  const note = (id, status, createdAt = now) => api.fake.seed('notifications', id, {
    studentId: ANA, status, recipient: status === 'skipped' ? null : MOBILE, message: SECRET_SMS_TEXT, createdAt,
  });
  note('n1', 'sent');
  note('n2', 'sent');
  note('n3', 'failed');
  note('n4', 'skipped');
  note('n-old', 'sent', Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000));
});

after(() => api.close());

const get = (path, token = tokens.teacher) => api.call('GET', path, { token });
const attendanceReport = (params, token) => get(`/reports/attendance?${new URLSearchParams(params)}`, token);
const performanceReport = (params, token) => get(`/reports/performance?${new URLSearchParams(params)}`, token);

/** No private data a report must never carry. */
function assertNoPrivateData(text) {
  for (const secret of [ANA_UID, MOBILE, SECRET_SMS_TEXT, 'parentA', 'manual-test', 'otpHash', 'a'.repeat(64), 'dateOfBirth', 'teacherId']) {
    assert.ok(!text.includes(secret), `response must not contain ${secret}`);
  }
}

describe('access control', () => {
  const REPORT_PATHS = ['/reports/today', '/reports/attendance', '/reports/performance'];

  test('reports require authentication', async () => {
    for (const path of [...REPORT_PATHS, '/admin/overview']) {
      assert.equal((await api.call('GET', path)).status, 401, path);
      assert.equal((await api.call('GET', path, { token: 'forged-token' })).status, 401, path);
    }
  });

  test('parents cannot read staff reports or the admin overview', async () => {
    for (const path of [...REPORT_PATHS, '/admin/overview']) {
      assert.equal((await get(path, tokens.parent)).status, 403, path);
    }
  });

  test('a token claiming admin while the profile says parent is refused', async () => {
    for (const path of [...REPORT_PATHS, '/admin/overview']) {
      assert.notEqual((await get(path, tokens.escalator)).status, 200, path);
    }
  });

  test('inactive staff accounts are refused', async () => {
    assert.equal((await get('/reports/today', tokens.inactiveTeacher)).status, 403);
  });

  test('teachers and admins can read reports; only admins can read the overview', async () => {
    for (const path of REPORT_PATHS) {
      assert.equal((await get(path, tokens.teacher)).status, 200, path);
      assert.equal((await get(path, tokens.admin)).status, 200, path);
    }
    assert.equal((await get('/admin/overview', tokens.teacher)).status, 403);
    assert.equal((await get('/admin/overview', tokens.admin)).status, 200);
  });

  test('parent routes still return only the parent\'s own child', async () => {
    assert.equal((await get(`/parent/children/${ANA}/attendance`, tokens.parent)).status, 200);
    assert.equal((await get(`/parent/children/${BEN}/attendance`, tokens.parent)).status, 404);
    assert.equal((await get(`/parent/children/${BEN}/performance`, tokens.parent)).status, 404);
  });
});

describe('report filter validation', () => {
  const cases = [
    ['invalid date', { from: '2026-02-30' }, 'validation/invalid-date'],
    ['not a date', { to: 'yesterday' }, 'validation/invalid-date'],
    ['future end date', { to: '2999-01-01' }, 'validation/future-date'],
    ['start after end', () => ({ from: day(1), to: day(2) }), 'validation/invalid-range'],
    ['32-day range', () => ({ from: day(31), to: today }), 'validation/range-too-long'],
    ['unknown parameter', { status: 'absent' }, 'validation/unknown-parameters'],
    ['bad student ID', { studentId: 'bad id!' }, 'validation/invalid-student-id'],
    ['overlong section', { section: 'x'.repeat(41) }, 'validation/invalid-section'],
  ];
  for (const [name, params, code] of cases) {
    test(`rejects ${name} (400)`, async () => {
      const p = typeof params === 'function' ? params() : params;
      for (const report of [attendanceReport, performanceReport]) {
        const res = await report(p);
        assert.equal(res.status, 400, `${name}: ${res.text}`);
        assert.equal(res.body.error.code, code);
      }
    });
  }

  test('rejects an unknown performance area and repeated parameters (400)', async () => {
    assert.equal((await performanceReport({ area: 'gpa' })).status, 400);
    assert.equal((await get(`/reports/attendance?from=${day(1)}&from=${day(2)}`)).status, 400);
  });

  test('accepts exactly 31 days, and defaults to today', async () => {
    const res = await attendanceReport({ from: day(30), to: today });
    assert.equal(res.status, 200);
    assert.equal(res.body.days.length, 31);
    const def = await attendanceReport({});
    assert.equal(def.body.from, today);
    assert.equal(def.body.to, today);
    assert.equal(def.body.timeZone, 'Asia/Manila');
  });
});

describe('attendance report', () => {
  test('per-day counts: "no time in" only on days with records; no absence totals', async () => {
    const res = await attendanceReport({ from: day(3), to: day(1) });
    assert.equal(res.status, 200);
    const [d3, d2, d1] = res.body.days;

    assert.deepEqual(d3, { schoolDate: day(3), attendanceRecorded: false, students: 2, timeIn: 0, timeOut: 0, noTimeOutRecorded: 0, noTimeIn: null });
    // Roster on day(2): the two active students (Cy is inactive and has no record that day).
    assert.deepEqual(d2, { schoolDate: day(2), attendanceRecorded: true, students: 2, timeIn: 2, timeOut: 1, noTimeOutRecorded: 1, noTimeIn: 0 });
    // day(1): Ana (no time out) + Cy (inactive, but has a record) -> Ben has no time in.
    assert.deepEqual(d1, { schoolDate: day(1), attendanceRecorded: true, students: 3, timeIn: 2, timeOut: 1, noTimeOutRecorded: 1, noTimeIn: 1 });

    assert.ok(!/absen/i.test(res.text), 'no absence status or totals');
    assertNoPrivateData(res.text);
  });

  test('per-student totals and derived statuses', async () => {
    const res = await attendanceReport({ from: day(3), to: day(1) });
    const ids = res.body.students.map((s) => s.student.studentId);
    assert.deepEqual(ids, [ANA, BEN, CY], 'sorted by name; Dex (inactive, no records) left out');

    const ana = res.body.students[0];
    assert.equal(ana.daysWithTimeIn, 2);
    assert.equal(ana.daysWithTimeOut, 1);
    assert.equal(ana.daysNoTimeOutRecorded, 1);
    assert.deepEqual(ana.records.map((r) => [r.schoolDate, r.status]), [
      [day(2), 'time-out-recorded'],
      [day(1), 'no-time-out-recorded'],
    ]);
    assert.equal(ana.records[0].timeIn, at(day(2), '07:40').toDate().toISOString());
    assert.deepEqual(Object.keys(ana.student).sort(), ['active', 'firstName', 'lastName', 'middleName', 'name', 'section', 'studentId']);
    assert.equal(res.body.students[2].student.active, false);
  });

  test('section and student filters', async () => {
    const k1 = await attendanceReport({ from: day(3), to: day(1), section: 'k1' });
    assert.deepEqual(k1.body.students.map((s) => s.student.studentId), [ANA, CY]);
    // day(2) for K1: roster is Ana only (Cy is inactive with no record that day); Ana has a time in.
    assert.deepEqual([k1.body.days[1].students, k1.body.days[1].noTimeIn], [1, 0]);
    assert.deepEqual(k1.body.sections, ['K1', 'K2']);

    const ben = await attendanceReport({ from: day(3), to: day(1), studentId: BEN.toLowerCase() });
    assert.deepEqual(ben.body.students.map((s) => s.student.studentId), [BEN]);
    assert.equal(ben.body.days[2].noTimeIn, 1);
  });

  test('records outside the range are not included', async () => {
    const res = await attendanceReport({ from: day(3), to: day(1), studentId: ANA });
    assert.ok(!res.body.students[0].records.some((r) => r.schoolDate === day(40)));
  });
});

describe('performance report', () => {
  test('star counts per area and the per-day Daily Average Star Rating; no other averages', async () => {
    const res = await performanceReport({ from: day(2), to: day(1) });
    assert.equal(res.status, 200);
    const ana = res.body.students.find((s) => s.student.studentId === ANA);
    assert.equal(ana.ratings, 3);
    assert.deepEqual(ana.areas, [
      { area: 'language', ratings: 2, starCounts: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } },
      { area: 'mathematics', ratings: 1, starCounts: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 } },
    ]);
    assert.deepEqual(ana.days.map((d) => [d.evaluationDate, d.dailyAverageStarRating]), [[day(2), 5], [day(1), 3.5]]);
    assert.deepEqual(ana.days[1].evaluations[0], {
      area: 'language', starRating: 4, observation: '=HYPERLINK("http://x") Reads short words.', teacherName: 'Tess Test',
    });
    assert.ok(!/grade|percent|gpa/i.test(res.text));
    assert.ok(!('average' in ana) && !('averageStarRating' in ana), 'no range average');
    assertNoPrivateData(res.text);
  });

  test('inactive students with evaluations are listed; active students without any are "not evaluated"', async () => {
    const res = await performanceReport({ from: day(2), to: day(1) });
    assert.deepEqual(res.body.students.map((s) => s.student.studentId), [ANA, CY]);
    assert.deepEqual(res.body.notEvaluated.map((s) => s.studentId), [BEN]);
  });

  test('area filter: only that area, and no Daily Average (it summarizes all areas)', async () => {
    const res = await performanceReport({ from: day(2), to: day(1), area: 'mathematics' });
    assert.deepEqual(res.body.students.map((s) => s.student.studentId), [ANA]);
    assert.deepEqual(res.body.students[0].areas.map((a) => a.area), ['mathematics']);
    assert.equal(res.body.students[0].days[0].dailyAverageStarRating, null);
  });

  test('section filter', async () => {
    const res = await performanceReport({ from: day(2), to: day(1), section: 'K2' });
    assert.deepEqual(res.body.students, []);
    assert.deepEqual(res.body.notEvaluated.map((s) => s.studentId), [BEN]);
  });
});

describe('dashboard summaries', () => {
  test('today summary counts attendance, evaluations and dismissals', async () => {
    const res = await get('/reports/today');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      schoolDate: today,
      timeZone: 'Asia/Manila',
      attendance: { students: 2, inSchool: 1, wentHome: 0, noTimeIn: 1 },
      performance: { activeStudents: 2, studentsEvaluated: 1, evaluations: 1 },
      dismissals: { total: 2, awaitingVerification: 1, verified: 0, released: 1 },
    });
    assertNoPrivateData(res.text);
  });

  test('admin overview: counts only, including today\'s SMS sent/failed/skipped', async () => {
    const res = await get('/admin/overview', tokens.admin);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      schoolDate: today,
      timeZone: 'Asia/Manila',
      students: { active: 2, inactive: 2, activeWithoutRfidCard: 1 },
      rfidCards: { assigned: 1, unassigned: 1, inactive: 1 },
      parents: { active: 3, withoutMobileNumber: 2 },
      sms: { sent: 2, failed: 1, skipped: 1 },
    });
    assertNoPrivateData(res.text);
  });

  test('reports do not change any data', async () => {
    const before = JSON.stringify(['attendance', 'performance', 'dismissalRecords', 'notifications'].map((c) => api.fake.all(c)));
    await attendanceReport({ from: day(5), to: today });
    await performanceReport({ from: day(5), to: today });
    await get('/reports/today');
    await get('/admin/overview', tokens.admin);
    assert.equal(JSON.stringify(['attendance', 'performance', 'dismissalRecords', 'notifications'].map((c) => api.fake.all(c))), before);
  });
});
