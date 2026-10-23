// In-app notifications (the bell): users/{uid}/inbox + GET/POST /api/notifications.
// Firebase is the in-memory fake and SMS goes to the mock provider: nothing real is sent.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let audit;
let inbox; // inbox.service module
let today;

const ANA = 'K2026-101'; // parentA + parentA2 (inactive parent account also linked)
const BEN = 'K2026-102'; // parentB
const CARA = 'K2026-103'; // parentFail (mock SMS failure number)
const DIA = 'K2026-104'; // parentA: dismissal lock + release tests
const ELI = 'K2026-105'; // no parent mobile number -> SMS skipped
const CARD_ANA = 'E2000017221101441890A101';
const CARD_ELI = 'E2000017221101441890A105';
const UNKNOWN_CARD = 'E2000017221101441890FFFF';

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const items = (uid) => api.fake.all(`users/${uid}/inbox`);
const feed = (token, query = '') => api.call('GET', `/notifications${query}`, { token });
const scan = (uid) => api.call('POST', '/attendance/scan', { token: tokens.teacher, body: { uid } });

before(async () => {
  api = await startTestApi();
  audit = await import('../src/services/audit.service.js');
  inbox = await import('../src/services/inbox.service.js');
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());

  tokens = {
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    parentA2: api.addUser({ uid: 'parentA2', role: 'parent', active: false }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' }),
    parentFail: api.addUser({ uid: 'parentFail', role: 'parent', mobileNumber: '+639173339990' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    teacherOff: api.addUser({ uid: 'teacherOff', role: 'teacher', active: false }),
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA', 'parentA2'], rfidCardUid: CARD_ANA });
  api.addStudent({ studentId: BEN, firstName: 'Ben', parentIds: ['parentB'] });
  api.addStudent({ studentId: CARA, firstName: 'Cara', parentIds: ['parentFail'] });
  api.addStudent({ studentId: DIA, firstName: 'Dia', parentIds: ['parentA'] });
  api.addStudent({ studentId: ELI, firstName: 'Eli', parentIds: [], rfidCardUid: CARD_ELI });
  api.fake.seed('rfidCards', CARD_ANA, { uid: CARD_ANA, studentId: ANA, active: true });
  api.fake.seed('rfidCards', CARD_ELI, { uid: CARD_ELI, studentId: ELI, active: true });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
});

after(async () => {
  await api.close();
});

beforeEach(() => {
  audit.resetAuditSuppressionForTests();
  for (const uid of ['parentA', 'parentA2', 'parentB', 'parentFail', 'teacher1', 'teacherOff', 'admin1']) {
    api.fake.clear(`users/${uid}/inbox`);
  }
});

describe('access', () => {
  test('requires a valid sign-in and an active account', async () => {
    assert.equal((await feed(undefined)).status, 401);
    assert.equal((await feed('forged-token')).status, 401);
    assert.equal((await feed(tokens.teacherOff)).status, 403);
    assert.equal((await api.call('POST', '/notifications/seen', { body: { upTo: new Date().toISOString() } })).status, 401);
  });

  test('there is no way to read another inbox or to write notifications', async () => {
    assert.equal((await feed(tokens.parentB, '?uid=parentA')).status, 400);
    assert.equal((await api.call('POST', '/notifications', { token: tokens.admin, body: { title: 'x' } })).status, 404);
    assert.equal((await api.call('DELETE', '/notifications', { token: tokens.admin })).status, 404);
  });

  test('rejects unknown, repeated and malformed parameters', async () => {
    assert.equal((await feed(tokens.parentA, '?limit=500')).status, 400);
    assert.equal((await feed(tokens.parentA, '?after=yesterday')).status, 400);
    assert.equal((await feed(tokens.parentA, '?after=2026-01-01T00:00:00Z&after=2026-01-02T00:00:00Z')).status, 400);
    const seen = (body) => api.call('POST', '/notifications/seen', { token: tokens.parentA, body });
    assert.equal((await seen({})).status, 400);
    assert.equal((await seen({ upTo: 'now' })).status, 400);
    assert.equal((await seen({ upTo: new Date().toISOString(), uid: 'parentB' })).status, 400);
  });
});

describe('attendance', () => {
  beforeEach(() => {
    api.fake.clear('attendance');
    api.fake.clear('notifications');
  });

  test('arrival and departure reach the ACTIVE linked parents only', async () => {
    assert.equal((await scan(CARD_ANA)).status, 201);
    await pause();
    assert.equal((await scan(CARD_ANA)).status, 200);

    const res = await feed(tokens.parentA);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => i.kind), ['departure', 'arrival']);
    const [departure, arrival] = res.body.items;
    assert.equal(arrival.title, 'Ana arrived at school');
    assert.match(arrival.body, /^Time in: \d{1,2}:\d{2} [AP]M$/);
    assert.equal(departure.title, 'Ana left school');
    assert.equal(arrival.link, 'records');
    assert.equal(arrival.studentId, ANA);
    assert.deepEqual(Object.keys(arrival).sort(), ['body', 'date', 'id', 'kind', 'link', 'notifiedAt', 'studentId', 'title']);

    assert.equal(items('parentA2').length, 0, 'inactive parent account');
    assert.equal(items('parentB').length, 0);
    assert.equal(items('teacher1').length, 0);
  });

  test('the same event is never shown twice', async () => {
    const event = { event: 'arrival', student: { studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] }, attendanceId: `${ANA}_${today}`, occurredAt: new Date() };
    await inbox.notifyAttendanceInApp(event);
    await inbox.notifyAttendanceInApp(event);
    assert.equal(items('parentA').length, 1);
  });

  test('a notification failure never fails the scan', async () => {
    api.fake.failWrites('users/parentA/inbox');
    try {
      const res = await scan(CARD_ANA);
      assert.equal(res.status, 201);
      assert.equal(res.body.scan.outcome, 'time-in');
      assert.ok(api.fake.read('attendance', `${ANA}_${today}`));
    } finally {
      api.fake.failWrites('users/parentA/inbox', false);
    }
  });

  test('admins: unknown card once per day; SMS problems as one running count', async () => {
    assert.equal((await scan(UNKNOWN_CARD)).status, 404);
    audit.resetAuditSuppressionForTests();
    assert.equal((await scan(UNKNOWN_CARD)).status, 404);
    const rejected = items('admin1').filter((i) => i.kind === 'rfid-scan-rejected');
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].title, 'Unknown RFID card scanned');
    assert.match(rejected[0].body, new RegExp(`UID ${UNKNOWN_CARD} at`));
    assert.equal(rejected[0].audience, 'admin');
    assert.equal(items('teacher1').length, 0, 'admin-only');

    // Eli has no parent with a mobile number: the SMS is skipped, twice (time-in, time-out).
    await scan(CARD_ELI);
    await pause();
    await scan(CARD_ELI);
    const problems = items('admin1').filter((i) => i.kind === 'sms-problems');
    assert.equal(problems.length, 1);
    assert.equal(problems[0].skipped, 2);
    assert.match(problems[0].body, /^2 skipped \(no parent mobile number\)/);

    // The feed hides internal counters.
    const res = await feed(tokens.admin);
    const view = res.body.items.find((i) => i.kind === 'sms-problems');
    assert.equal(view.skipped, undefined);
  });
});

describe('dismissal', () => {
  let fetchers;
  before(async () => {
    const make = async (token, body) => (await api.call('POST', '/parent/fetchers', { token, body })).body.fetcher.fetcherId;
    fetchers = {
      maria: await make(tokens.parentA, { fullName: 'Maria Santos', relationship: 'Aunt', studentIds: [ANA, DIA] }),
      rosa: await make(tokens.parentFail, { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: [CARA] }),
    };
  });
  const request = (token, studentId, fetcherId) => api.call('POST', '/parent/dismissals', { token, body: { studentId, fetcherId } });
  const devCode = async (token, studentId) => (await api.call('GET', `/dev/dismissal-otp/${studentId}`, { token })).body.otp;

  test('a sent code: the parent is told (never the code), every active staff member sees the request', async () => {
    assert.equal((await request(tokens.parentA, ANA, fetchers.maria)).status, 201);
    const code = await devCode(tokens.parentA, ANA);
    assert.match(code, /^\d{6}$/);

    const [sent] = (await feed(tokens.parentA)).body.items;
    assert.equal(sent.kind, 'dismissal-code-sent');
    assert.equal(sent.title, 'Dismissal code sent for Ana');
    assert.match(sent.body, /for Maria Santos \(Aunt\)\. It expires at/);

    for (const token of [tokens.teacher, tokens.admin]) {
      const [request1] = (await feed(token)).body.items;
      assert.equal(request1.kind, 'dismissal-request');
      assert.equal(request1.title, 'Dismissal request: Ana Test');
      assert.equal(request1.body, 'Fetcher: Maria Santos (Aunt). Waiting for code verification.');
      assert.equal(request1.link, 'dismissal');
    }
    assert.equal(items('teacherOff').length, 0);

    // No inbox anywhere contains the code or a phone number.
    const everything = JSON.stringify(['parentA', 'teacher1', 'admin1'].flatMap(items));
    assert.ok(!everything.includes(code));
    assert.ok(!everything.includes('9171111111'));
  });

  test('a failed code SMS: only the parent is told, staff see nothing', async () => {
    assert.equal((await request(tokens.parentFail, CARA, fetchers.rosa)).status, 502);
    const [failed] = (await feed(tokens.parentFail)).body.items;
    assert.equal(failed.kind, 'dismissal-sms-failed');
    assert.equal(items('teacher1').length, 0);
    assert.equal(items('admin1').length, 0);
  });

  test('a locked code goes to staff; a release goes to every active linked parent', async () => {
    assert.equal((await request(tokens.parentA, DIA, fetchers.maria)).status, 201);
    const code = await devCode(tokens.parentA, DIA);
    const wrong = code === '000000' ? '111111' : '000000';
    const dismissalId = `${DIA}_${today}`;
    const verify = (otp, requestNumber) => api.call('POST', `/dismissals/${dismissalId}/verify`, { token: tokens.teacher, body: { otp, requestNumber } });
    for (let i = 0; i < 5; i += 1) await verify(wrong, 1);
    const locked = items('teacher1').find((i) => i.kind === 'dismissal-locked');
    assert.equal(locked.title, 'Dismissal code locked: Dia Test');
    assert.ok(items('admin1').some((i) => i.kind === 'dismissal-locked'));

    // A new code (after the cooldown), verified and released.
    api.fake.patch('dismissalRecords', dismissalId, { requestedAt: Timestamp.fromMillis(Date.now() - 120_000) });
    assert.equal((await request(tokens.parentA, DIA, fetchers.maria)).status, 201);
    assert.equal((await verify(await devCode(tokens.parentA, DIA), 2)).status, 200);
    assert.equal((await api.call('POST', `/dismissals/${dismissalId}/release`, { token: tokens.teacher, body: { requestNumber: 2 } })).status, 200);

    const [released] = (await feed(tokens.parentA)).body.items;
    assert.equal(released.kind, 'dismissal-released');
    assert.equal(released.title, 'Dia has been picked up');
    assert.match(released.body, /^Released to Maria Santos \(Aunt\) at \d{1,2}:\d{2} [AP]M\.$/);
  });
});

describe('performance', () => {
  test('one item per child per day, listing the areas; no observation text or stars', async () => {
    const save = (area) => api.call('POST', '/performance', {
      token: tokens.teacher,
      body: { studentId: BEN, evaluationDate: today, area, starRating: 4, observation: 'Shared crayons kindly.' },
    });
    assert.equal((await save('language')).status, 201);
    assert.equal((await save('mathematics')).status, 201);
    assert.equal((await save('language')).status, 200); // edit: no duplicate area

    const list = items('parentB');
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'New Performance Evaluation for Ben');
    assert.match(list[0].body, /: Language, Mathematics$/);
    assert.equal(list[0].date, today);
    const [view] = (await feed(tokens.parentB)).body.items;
    assert.equal(view.date, today);
    assert.equal(view.areas, undefined);
    assert.ok(!JSON.stringify(list).includes('crayons'));
  });
});

describe('feed and seen marker', () => {
  test('newest first, ?after= returns only newer items, seen marker only moves forward', async () => {
    const student = { studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] };
    await inbox.notifyAttendanceInApp({ event: 'arrival', student, attendanceId: `${ANA}_2026-01-05`, occurredAt: new Date() });
    await pause();
    const first = (await feed(tokens.parentA)).body;
    assert.equal(first.items.length, 1);
    assert.equal(first.seenAt, null);
    const newest = first.items[0].notifiedAt;

    assert.deepEqual((await feed(tokens.parentA, `?after=${encodeURIComponent(newest)}`)).body.items, []);
    await inbox.notifyAttendanceInApp({ event: 'departure', student, attendanceId: `${ANA}_2026-01-05`, occurredAt: new Date() });
    const newer = (await feed(tokens.parentA, `?after=${encodeURIComponent(newest)}`)).body.items;
    assert.deepEqual(newer.map((i) => i.kind), ['departure']);

    const seen = await api.call('POST', '/notifications/seen', { token: tokens.parentA, body: { upTo: newest } });
    assert.equal(seen.status, 200);
    assert.equal(seen.body.seenAt, newest);
    assert.equal((await feed(tokens.parentA)).body.seenAt, newest);

    // Never backwards, never past "now".
    const back = await api.call('POST', '/notifications/seen', { token: tokens.parentA, body: { upTo: '2020-01-01T00:00:00.000Z' } });
    assert.equal(back.body.seenAt, newest);
    const future = await api.call('POST', '/notifications/seen', { token: tokens.parentA, body: { upTo: '2999-01-01T00:00:00.000Z' } });
    assert.ok(Date.parse(future.body.seenAt) <= Date.now());
  });

  test('items are shown only for the current role and still-linked children', async () => {
    const student = { studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] };
    await inbox.notifyAttendanceInApp({ event: 'arrival', student, attendanceId: `${ANA}_2026-01-06`, occurredAt: new Date() });
    // A parent item that somehow sits in a teacher's inbox (e.g. the account's role changed).
    api.fake.seed('users/teacher1/inbox', 'x', { kind: 'arrival', audience: 'parent', title: 'Ana arrived', notifiedAt: Timestamp.now() });
    assert.deepEqual((await feed(tokens.teacher)).body.items, []);

    // Ana is unlinked from parentA: her items disappear from parentA's bell.
    api.fake.patch('students', ANA, { parentIds: ['parentA2'] });
    try {
      assert.deepEqual((await feed(tokens.parentA)).body.items, []);
    } finally {
      api.fake.patch('students', ANA, { parentIds: ['parentA', 'parentA2'] });
    }
  });
});
