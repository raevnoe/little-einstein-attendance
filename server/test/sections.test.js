// Sections: the admin-managed list, student and teacher assignments, and the teacher scope
// (teachers see and act only on students of their sections). In-memory Firebase fake, mock SMS.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let t;
let today;
const ANA = 'K2026-301'; // Kinder A
const BEN = 'K2026-302'; // Kinder B
const CARD_ANA = 'E2000017221101441890C301';
const CARD_BEN = 'E2000017221101441890C302';

before(async () => {
  api = await startTestApi();
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  api.fake.seed('systemSettings', 'sections', { names: ['Kinder A', 'Kinder B', 'Pre-Kinder'] });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
  t = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacherA: api.addUser({ uid: 'teacherA', role: 'teacher', sections: ['Kinder A'] }),
    teacherB: api.addUser({ uid: 'teacherB', role: 'teacher', sections: ['Kinder B'] }),
    teacherNone: api.addUser({ uid: 'teacherNone', role: 'teacher', sections: [] }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', section: 'Kinder A', parentIds: ['parentA'], rfidCardUid: CARD_ANA });
  api.addStudent({ studentId: BEN, firstName: 'Ben', section: 'Kinder B', parentIds: ['parentB'], rfidCardUid: CARD_BEN });
  api.fake.seed('rfidCards', CARD_ANA, { uid: CARD_ANA, studentId: ANA, active: true });
  api.fake.seed('rfidCards', CARD_BEN, { uid: CARD_BEN, studentId: BEN, active: true });
});

after(async () => {
  await api.close();
});

const call = (method, path, token, body) => api.call(method, path, { token, body });
const ids = (list, key = 'studentId') => list.map((x) => x[key] ?? x.student?.studentId).sort();

describe('section list (admin)', () => {
  test('lists sections with counts; only admins', async () => {
    const res = await call('GET', '/admin/sections', t.admin);
    assert.equal(res.status, 200);
    const kinderA = res.body.sections.find((s) => s.name === 'Kinder A');
    assert.deepEqual({ students: kinderA.students, teachers: kinderA.teachers }, { students: 1, teachers: 1 });
    assert.equal((await call('GET', '/admin/sections', t.teacherA)).status, 403);
  });

  test('adds a section; duplicates (ignoring case/spaces) and bad names are refused', async () => {
    const added = await call('POST', '/admin/sections', t.admin, { name: '  Kinder   C ' });
    assert.equal(added.status, 201);
    assert.ok(added.body.sections.some((s) => s.name === 'Kinder C'));
    assert.equal((await call('POST', '/admin/sections', t.admin, { name: 'kinder c' })).status, 409);
    assert.equal((await call('POST', '/admin/sections', t.admin, { name: '' })).status, 400);
    assert.equal((await call('POST', '/admin/sections', t.admin, { name: '<script>' })).status, 400);
    assert.equal((await call('POST', '/admin/sections', t.admin, { name: 'X', extra: 1 })).status, 400);
    assert.ok(api.fake.all('auditLogs').some((e) => e.eventType === 'section.added' && e.details.section === 'Kinder C'));
  });

  test('a section in use cannot be removed; an unused one can', async () => {
    assert.equal((await call('DELETE', `/admin/sections/${encodeURIComponent('Kinder A')}`, t.admin)).status, 409);
    const removed = await call('DELETE', `/admin/sections/${encodeURIComponent('Pre-Kinder')}`, t.admin);
    assert.equal(removed.status, 200);
    assert.ok(!removed.body.sections.some((s) => s.name === 'Pre-Kinder'));
    assert.equal((await call('DELETE', '/admin/sections/Nowhere', t.admin)).status, 404);
  });
});

describe('students must use a listed section', () => {
  const newStudent = (section, studentId) => ({
    studentId, firstName: 'Cara', lastName: 'Test', dateOfBirth: '2021-03-03', gender: 'Female', section, parentIds: [],
  });

  test('create: unlisted refused; listed stored with the list spelling', async () => {
    const bad = await call('POST', '/students', t.admin, newStudent('Kinder Z', 'K2026-310'));
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details.fields.section);
    const ok = await call('POST', '/students', t.admin, newStudent('kinder b', 'K2026-311'));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.student.section, 'Kinder B');
  });

  test('edit: keeping an older unlisted section is allowed, changing to one is not', async () => {
    api.addStudent({ studentId: 'K2026-312', firstName: 'Old', section: 'Legacy Room' });
    assert.equal((await call('PATCH', '/students/K2026-312', t.admin, { firstName: 'Olga', section: 'Legacy Room' })).status, 200);
    assert.equal((await call('PATCH', '/students/K2026-312', t.admin, { section: 'Another Room' })).status, 400);
    assert.equal((await call('PATCH', '/students/K2026-312', t.admin, { section: 'Kinder B' })).status, 200);
  });
});

describe('teacher section assignment', () => {
  test('admin sets a teacher\'s sections (list spelling, deduplicated), audited', async () => {
    const res = await call('PATCH', '/admin/users/teacherNone/sections', t.admin, { sections: ['kinder b', 'Kinder B', 'Kinder A'] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.user.sections, ['Kinder A', 'Kinder B']);
    const entry = api.fake.all('auditLogs').find((e) => e.eventType === 'user.sections-changed');
    assert.deepEqual(entry.details, { sections: ['Kinder A', 'Kinder B'], count: 2 });
    // Back to none for the scope tests below.
    assert.equal((await call('PATCH', '/admin/users/teacherNone/sections', t.admin, { sections: [] })).status, 200);
  });

  test('refused: unlisted section, non-teacher, wrong body, non-admin caller', async () => {
    assert.equal((await call('PATCH', '/admin/users/teacherA/sections', t.admin, { sections: ['Kinder Z'] })).status, 400);
    assert.equal((await call('PATCH', '/admin/users/parentA/sections', t.admin, { sections: ['Kinder A'] })).status, 400);
    assert.equal((await call('PATCH', '/admin/users/teacherA/sections', t.admin, { sections: 'Kinder A' })).status, 400);
    assert.equal((await call('PATCH', '/admin/users/teacherA/sections', t.admin, { sections: [], role: 'admin' })).status, 400);
    assert.equal((await call('PATCH', '/admin/users/teacherA/sections', t.teacherA, { sections: ['Kinder B'] })).status, 403);
  });
});

describe('teacher scope', () => {
  test('students and RFID cards: own sections only; others look missing', async () => {
    assert.deepEqual(ids((await call('GET', '/students', t.teacherA)).body.students), [ANA]);
    assert.equal((await call('GET', `/students/${BEN}`, t.teacherA)).status, 404);
    assert.equal((await call('GET', `/students/${ANA}`, t.teacherA)).status, 200);
    assert.deepEqual((await call('GET', '/rfid-cards', t.teacherA)).body.cards.map((c) => c.uid), [CARD_ANA]);
    assert.equal((await call('GET', `/rfid-cards/${CARD_BEN}`, t.teacherA)).status, 404);
    assert.deepEqual((await call('GET', '/students', t.teacherNone)).body.students, []);
    assert.ok((await call('GET', '/students', t.admin)).body.students.length >= 2);
  });

  test('attendance: the reader records anyone; the roster shows own sections only', async () => {
    assert.equal((await call('POST', '/attendance/scan', t.teacherA, { uid: CARD_BEN, method: 'reader' })).status, 201);
    const roster = (await call('GET', '/attendance', t.teacherA)).body;
    assert.deepEqual(ids(roster.records.map((r) => r.student)), [ANA]);
    assert.equal(roster.summary.total, 1);
    assert.deepEqual((await call('GET', '/attendance', t.teacherNone)).body.records, []);
  });

  test('performance: save and read own sections only', async () => {
    const body = (studentId) => ({ studentId, evaluationDate: today, area: 'language', starRating: 4, observation: '' });
    assert.equal((await call('POST', '/performance', t.teacherA, body(BEN))).status, 404);
    assert.equal((await call('POST', '/performance', t.teacherA, body(ANA))).status, 201);
    assert.equal((await call('POST', '/performance', t.admin, body(BEN))).status, 201);
    assert.deepEqual(ids((await call('GET', '/performance', t.teacherA)).body.evaluations), [ANA]);
    assert.equal((await call('GET', `/performance/${BEN}_${today}_language`, t.teacherA)).status, 404);
    assert.equal((await call('PATCH', `/performance/${BEN}_${today}_language`, t.teacherA, { starRating: 1 })).status, 404);
  });

  test('reports: counts and section filters cover own sections only', async () => {
    const todaySummary = (await call('GET', '/reports/today', t.teacherA)).body;
    assert.equal(todaySummary.attendance.students, 1);
    const report = (await call('GET', '/reports/attendance', t.teacherA)).body;
    assert.deepEqual(report.sections, ['Kinder A']);
    assert.ok(!JSON.stringify(report).includes(BEN));
    const perf = (await call('GET', '/reports/performance', t.teacherA)).body;
    assert.ok(!JSON.stringify(perf).includes(BEN));
  });

  test('dismissals: list, verify and release own sections only; alerts go to that section\'s teachers', async () => {
    const fetcher = (await call('POST', '/parent/fetchers', t.parentB, { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: [BEN] })).body.fetcher;
    assert.equal((await call('POST', '/parent/dismissals', t.parentB, { studentId: BEN, fetcherId: fetcher.fetcherId })).status, 201);

    assert.deepEqual((await call('GET', '/dismissals', t.teacherA)).body.dismissals, []);
    assert.equal((await call('GET', '/dismissals', t.teacherB)).body.dismissals.length, 1);
    const verify = await call('POST', `/dismissals/${BEN}_${today}/verify`, t.teacherA, { otp: '123456', requestNumber: 1 });
    assert.equal(verify.status, 404);
    const release = await call('POST', `/dismissals/${BEN}_${today}/release`, t.teacherA, { requestNumber: 1 });
    assert.equal(release.status, 404);

    const inbox = (uid) => api.fake.all(`users/${uid}/inbox`).filter((i) => i.kind === 'dismissal-request');
    assert.equal(inbox('teacherB').length, 1);
    assert.equal(inbox('admin1').length, 1);
    assert.equal(inbox('teacherA').length, 0);
    assert.equal(inbox('teacherNone').length, 0);
  });

  test('a teacher\'s profile shows their sections', async () => {
    const me = await call('GET', '/auth/me', t.teacherA);
    assert.equal(me.status, 200);
    assert.deepEqual(me.body.profile.sections, ['Kinder A']);
  });
});
