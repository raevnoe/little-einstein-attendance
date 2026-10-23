// Phase 11 audit logging: who did what, recorded server-side, without sensitive data.
// Firebase is the in-memory fake and SMS is the mock provider: nothing is sent.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Timestamp } from 'firebase-admin/firestore';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let audit; // audit.service module
let smsService;
let today;

const ANA = 'K2026-001'; // parentA's child
const BEN = 'K2026-002'; // parentB's child
const CARD_A = 'E2000017221101441890AAAA';
const CARD_B = 'E2000017221101441890BBBB';
const PARENT_A_MOBILE = '+639171111111';
const SECRET_DOB = '2021-03-04';
const SECRET_OBSERVATION = 'Reads short words slowly.';
const FETCHER_NAME = 'Maria Santos';

before(async () => {
  api = await startTestApi();
  audit = await import('../src/services/audit.service.js');
  smsService = await import('../src/services/sms/sms.service.js');
  ({ today } = { today: (await import('../src/utils/schoolDate.js')).schoolDateOf() });

  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin', firstName: 'Ada' }),
    admin2: api.addUser({ uid: 'admin2', role: 'admin' }),
    inactiveAdmin: api.addUser({ uid: 'admin3', role: 'admin', active: false }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher', firstName: 'Tess' }),
    teacher2: api.addUser({ uid: 'teacher2', role: 'teacher', firstName: 'Tom' }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: PARENT_A_MOBILE }),
    parentB: api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' }),
    escalator: api.addUser({ uid: 'parentC', role: 'parent', claimRole: 'admin' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA'] });
  api.addStudent({ studentId: BEN, firstName: 'Ben', parentIds: ['parentB'] });
});

after(async () => {
  smsService.setSmsProviderForTests(null);
  await api.close();
});

beforeEach(() => {
  api.fake.clear('auditLogs');
  api.fake.failWrites('auditLogs', false);
  audit.resetAuditSuppressionForTests();
});

const call = (method, path, token, body) => api.call(method, path, { token, body });
const entries = (eventType) => api.fake.all('auditLogs').filter((e) => !eventType || e.eventType === eventType);
const only = (eventType) => {
  const list = entries(eventType);
  assert.equal(list.length, 1, `exactly one ${eventType} entry (found ${list.length})`);
  return list[0];
};

/** Checks the shared shape every entry must have. */
function assertEntry(entry, { eventType, outcome = 'success', actorUid, role, target }) {
  assert.equal(entry.eventType, eventType);
  assert.equal(entry.outcome, outcome);
  assert.ok(entry.occurredAt instanceof Timestamp, 'server timestamp');
  assert.ok(Math.abs(entry.occurredAt.toMillis() - Date.now()) < 60_000, 'recent server time');
  assert.equal(entry.schoolDate, today, 'school date (date only) in the school time zone');
  if (actorUid) assert.deepEqual(entry.actor, { type: 'user', uid: actorUid, role });
  if (target) assert.deepEqual(entry.target, target);
}

/** Text that must never appear in an audit entry or an audit API response. */
function assertNoSecrets(text, extra = []) {
  for (const secret of [PARENT_A_MOBILE, '09171111111', SECRET_DOB, SECRET_OBSERVATION, FETCHER_NAME,
    'tok-', 'Bearer', 'otpHash', 'otpSalt', '@example.com', 'dismissal code is', ...extra]) {
    assert.ok(!text.includes(secret), `must not contain ${secret}`);
  }
}

describe('audit entry sanitizing', () => {
  test('only allow-listed details are kept; phone- and email-like text is redacted; IDs are kept intact', async () => {
    const { buildAuditEntry } = await import('../src/models/auditLog.model.js');
    const entry = buildAuditEntry({
      eventType: 'dismissal.verify-failed',
      outcome: 'failure',
      actor: { type: 'user', uid: 'teacher1', role: 'teacher', email: 'x@example.com' },
      target: { type: 'dismissal', id: 'K09171234567_2026-10-10' },
      reason: 'call 0917 123 4567',
      details: {
        studentId: '09171234567', fetcherId: 'abc', requestNumber: 1, attemptsRemaining: 2,
        otp: '654321', otpHash: 'f'.repeat(64), message: 'dismissal code is 654321', mobileNumber: '+639171234567',
        nested: { a: 1 },
      },
      route: 'POST /api/dismissals/:dismissalId/verify',
    });
    assert.deepEqual(entry.details, { studentId: '09171234567', fetcherId: 'abc', requestNumber: 1, attemptsRemaining: 2 });
    assert.equal(entry.reason, '[redacted]');
    assert.deepEqual(entry.actor, { type: 'user', uid: 'teacher1', role: 'teacher' });
    assert.equal(entry.target.id, 'K09171234567_2026-10-10');
    assert.ok(!JSON.stringify(entry).includes('654321'));
    assert.ok(!JSON.stringify(entry).includes('f'.repeat(64)));
  });

  test('unknown event types and outcomes are programming errors', async () => {
    const { buildAuditEntry } = await import('../src/models/auditLog.model.js');
    assert.throws(() => buildAuditEntry({ eventType: 'user.deleted' }), /Unknown audit event type/);
    assert.throws(() => buildAuditEntry({ eventType: 'student.created', outcome: 'maybe' }), /Unknown audit outcome/);
  });

  test('a client-like actor type is reduced to a safe system actor', async () => {
    const { buildAuditEntry } = await import('../src/models/auditLog.model.js');
    assert.deepEqual(buildAuditEntry({ eventType: 'student.created', actor: { type: 'admin', uid: 'x' } }).actor,
      { type: 'system', uid: null, role: null });
  });
});

describe('audit log API access', () => {
  test('requires a valid admin', async () => {
    assert.equal((await api.call('GET', '/admin/audit-logs')).status, 401);
    assert.equal((await call('GET', '/admin/audit-logs', 'forged-token')).status, 401);
    for (const token of [tokens.teacher, tokens.parentA, tokens.inactiveAdmin, tokens.escalator]) {
      assert.notEqual((await call('GET', '/admin/audit-logs', token)).status, 200);
    }
    assert.equal((await call('GET', '/admin/audit-logs', tokens.teacher)).status, 403);
    assert.equal((await call('GET', '/admin/audit-logs', tokens.parentA)).status, 403);
    assert.equal((await call('GET', '/admin/audit-logs', tokens.admin)).status, 200);
  });

  test('there is no way to change or delete entries through the API', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await call(method, '/admin/audit-logs', tokens.admin, {})).status, 404, method);
      assert.equal((await call(method, '/admin/audit-logs/AAAAAAAAAAAAAAAAAAAA', tokens.admin, {})).status, 404, method);
    }
  });
});

describe('access denials', () => {
  test('a refused role is recorded once per user, reason and area within 5 minutes', async () => {
    for (let i = 0; i < 3; i += 1) assert.equal((await call('GET', '/admin/test', tokens.teacher)).status, 403);
    const entry = only('auth.access-denied');
    assertEntry(entry, { eventType: 'auth.access-denied', outcome: 'denied', actorUid: 'teacher1', role: 'teacher' });
    assert.equal(entry.reason, 'auth/forbidden');
    assert.deepEqual(entry.target, { type: 'route', id: 'GET /api/admin' });

    // Materially different: another area, another user, another reason.
    await call('GET', '/reports/today', tokens.parentA);
    await call('GET', '/admin/test', tokens.teacher2);
    await call('GET', '/admin/test', tokens.inactiveAdmin);
    assert.equal(entries('auth.access-denied').length, 4);
    assert.ok(entries('auth.access-denied').some((e) => e.reason === 'auth/account-inactive'));
  });

  test('forged tokens are refused but not stored (no trustworthy actor)', async () => {
    assert.equal((await call('GET', '/admin/test', 'forged-token')).status, 401);
    assert.equal(entries().length, 0);
  });

  test('a parent opening another family\'s child is recorded; the response is the usual 404', async () => {
    const res = await call('GET', `/parent/children/${BEN}/attendance`, tokens.parentA);
    assert.equal(res.status, 404);
    const entry = only('auth.ownership-denied');
    assertEntry(entry, { eventType: 'auth.ownership-denied', outcome: 'denied', actorUid: 'parentA', role: 'parent', target: { type: 'student', id: BEN } });
    // A Student ID that does not exist is not "another family's" record.
    await call('GET', '/parent/children/K2099-999/attendance', tokens.parentA);
    assert.equal(entries('auth.ownership-denied').length, 1);
  });
});

describe('accounts', () => {
  test('role change, deactivation, reactivation and mobile number are audited without the number', async () => {
    api.addUser({ uid: 'target1', role: 'teacher' });
    assert.equal((await call('PATCH', '/admin/users/target1/role', tokens.admin, { role: 'parent' })).status, 200);
    const role = only('user.role-changed');
    assertEntry(role, { eventType: 'user.role-changed', actorUid: 'admin1', role: 'admin', target: { type: 'user', id: 'target1' } });
    assert.deepEqual(role.details, { fromRole: 'teacher', toRole: 'parent' });
    assert.equal(role.route, 'PATCH /api/admin/users/:uid/role');

    assert.equal((await call('PATCH', '/admin/users/target1/mobile-number', tokens.admin, { mobileNumber: '0917 555 1234' })).status, 200);
    assert.deepEqual(only('user.mobile-number-changed').details, { hasNumber: true });
    assert.ok(!JSON.stringify(entries()).includes('5551234'));

    assert.equal((await call('POST', '/admin/users/target1/deactivate', tokens.admin)).status, 200);
    assert.equal((await call('POST', '/admin/users/target1/reactivate', tokens.admin)).status, 200);
    only('user.deactivated');
    only('user.reactivated');
  });

  test('self-modification is refused and changes nothing', async () => {
    assert.equal((await call('PATCH', '/admin/users/admin1/role', tokens.admin, { role: 'teacher' })).status, 403);
    assert.equal(entries('user.role-changed').length, 0);
  });
});

describe('students and RFID cards', () => {
  test('create, update and deactivate record field NAMES only', async () => {
    const body = { studentId: 'K2026-050', firstName: 'Cara', lastName: 'Reyes', dateOfBirth: SECRET_DOB, gender: 'Female', section: 'K1', parentIds: ['parentA'] };
    assert.equal((await call('POST', '/students', tokens.admin, body)).status, 201);
    const created = only('student.created');
    assertEntry(created, { eventType: 'student.created', actorUid: 'admin1', role: 'admin', target: { type: 'student', id: 'K2026-050' } });
    assert.deepEqual(created.details, { section: 'K1', parentCount: 1 });

    const patch = { firstName: 'Carla', dateOfBirth: '2021-05-06', section: 'K1', parentIds: ['parentA', 'parentB'] };
    assert.equal((await call('PATCH', '/students/K2026-050', tokens.admin, patch)).status, 200);
    assert.deepEqual(only('student.updated').details, { changedFields: ['firstName', 'dateOfBirth', 'parentIds'], parentsLinked: 1, parentsUnlinked: 0 });

    assert.equal((await call('POST', '/students/K2026-050/deactivate', tokens.admin)).status, 200);
    only('student.deactivated');
    assertNoSecrets(JSON.stringify(entries()), ['Carla', '2021-05-06']);
  });

  test('card register, assign, reassign, unassign, deactivate, reactivate', async () => {
    api.addStudent({ studentId: 'K2026-060', firstName: 'Dan' });
    api.addStudent({ studentId: 'K2026-061', firstName: 'Eli' });
    assert.equal((await call('POST', '/rfid-cards', tokens.admin, { uid: CARD_B })).status, 201);
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/assign`, tokens.admin, { studentId: 'K2026-060' })).status, 200);
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/reassign`, tokens.admin, { studentId: 'K2026-061' })).status, 200);
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/unassign`, tokens.admin)).status, 200);
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/deactivate`, tokens.admin)).status, 200);
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/reactivate`, tokens.admin)).status, 200);

    const target = { type: 'rfidCard', id: CARD_B };
    assertEntry(only('rfid.card.registered'), { eventType: 'rfid.card.registered', actorUid: 'admin1', role: 'admin', target });
    assert.deepEqual(only('rfid.card.assigned').details, { studentId: 'K2026-060' });
    assert.deepEqual(only('rfid.card.reassigned').details, { fromStudentId: 'K2026-060', toStudentId: 'K2026-061' });
    assert.deepEqual(only('rfid.card.unassigned').details, { studentId: 'K2026-061' });
    assert.deepEqual(only('rfid.card.deactivated').details, { studentId: null });
    only('rfid.card.reactivated');

    // A refused change (conflict) writes nothing.
    assert.equal((await call('POST', `/rfid-cards/${CARD_B}/unassign`, tokens.admin)).status, 409);
    assert.equal(entries('rfid.card.unassigned').length, 1);
  });
});

describe('RFID scans, attendance and SMS', () => {
  before(() => {
    api.fake.seed('rfidCards', CARD_A, { uid: CARD_A, studentId: ANA, active: true });
    api.fake.patch('students', ANA, { rfidCardUid: CARD_A });
  });
  beforeEach(() => {
    api.fake.clear('attendance');
    api.fake.clear('notifications'); // the same arrival would otherwise be "already notified"
  });
  const scan = (uid, token = tokens.teacher) => call('POST', '/attendance/scan', token, { uid });

  test('time-in and time-out are audited with the staff member who scanned', async () => {
    assert.equal((await scan(CARD_A)).status, 201);
    const timeIn = only('attendance.time-in');
    assertEntry(timeIn, {
      eventType: 'attendance.time-in', actorUid: 'teacher1', role: 'teacher', target: { type: 'attendance', id: `${ANA}_${today}` },
    });
    assert.deepEqual(timeIn.details, { studentId: ANA, schoolDate: today, source: 'manual-test' });

    // Debounced repeat: nothing recorded.
    assert.equal((await scan(CARD_A)).status, 200);
    assert.equal(entries('attendance.time-out').length, 0);
    assert.equal(entries('rfid.scan.rejected').length, 0);

    // Move the time-in back so the next scan is a time-out.
    api.fake.patch('attendance', `${ANA}_${today}`, { timeIn: Timestamp.fromMillis(Date.now() - 60_000) });
    assert.equal((await scan(CARD_A, tokens.admin)).status, 200);
    assertEntry(only('attendance.time-out'), { eventType: 'attendance.time-out', actorUid: 'admin1', role: 'admin' });
  });

  test('the arrival SMS outcome is recorded as counts only', async () => {
    await scan(CARD_A);
    const sms = entries('sms.attendance-notification');
    assert.equal(sms.length, 1);
    assert.deepEqual(sms[0].actor, { type: 'system', uid: null, role: null });
    assert.deepEqual(sms[0].details, { event: 'arrival', studentId: ANA, status: 'sent', sent: 1, failed: 0, skipped: 0 });
    assertNoSecrets(JSON.stringify(entries()));
  });

  test('unknown cards: one entry per card per 10 minutes; different cards are separate', async () => {
    const unknown = 'E2000017221101441890FFFF';
    for (let i = 0; i < 4; i += 1) assert.equal((await scan(unknown)).status, 404);
    const entry = only('rfid.scan.rejected');
    assertEntry(entry, { eventType: 'rfid.scan.rejected', outcome: 'failure', actorUid: 'teacher1', role: 'teacher', target: { type: 'rfidCard', id: unknown } });
    assert.equal(entry.details.scanOutcome, 'unknown-rfid');
    assert.equal(entry.reason, 'attendance/unknown-rfid');

    await scan('E2000017221101441890EEEE');
    assert.equal(entries('rfid.scan.rejected').length, 2);
  });

  test('a scan after time-out is recorded as an anomaly', async () => {
    api.fake.seed('attendance', `${ANA}_${today}`, {
      studentId: ANA, schoolDate: today, status: 'checked-out',
      timeIn: Timestamp.fromMillis(Date.now() - 120_000), timeOut: Timestamp.fromMillis(Date.now() - 60_000),
    });
    assert.equal((await scan(CARD_A)).status, 409);
    const entry = only('rfid.scan.rejected');
    assert.deepEqual(entry.details, { scanOutcome: 'already-completed', studentId: ANA });
  });
});

describe('performance evaluations', () => {
  test('save and edit record star ratings, never the observation text', async () => {
    const body = { studentId: ANA, evaluationDate: today, area: 'language', starRating: 3, observation: SECRET_OBSERVATION };
    assert.equal((await call('POST', '/performance', tokens.teacher, body)).status, 201);
    const created = only('performance.created');
    assertEntry(created, {
      eventType: 'performance.created', actorUid: 'teacher1', role: 'teacher', target: { type: 'performance', id: `${ANA}_${today}_language` },
    });
    assert.deepEqual(created.details, {
      studentId: ANA, evaluationDate: today, area: 'language', starRating: 3, previousStarRating: null, observationChanged: true,
    });

    // Another teacher edits it: the audit keeps who changed what.
    assert.equal((await call('PATCH', `/performance/${ANA}_${today}_language`, tokens.teacher2, { starRating: 5 })).status, 200);
    const updated = only('performance.updated');
    assertEntry(updated, { eventType: 'performance.updated', actorUid: 'teacher2', role: 'teacher' });
    assert.equal(updated.details.previousStarRating, 3);
    assert.equal(updated.details.starRating, 5);
    assert.equal(updated.details.observationChanged, false);
    assertNoSecrets(JSON.stringify(entries()));
  });

  test('a client cannot supply the evaluator or audit fields', async () => {
    const body = { studentId: ANA, evaluationDate: today, area: 'science', starRating: 2, teacherId: 'admin1', actor: { uid: 'x' } };
    assert.equal((await call('POST', '/performance', tokens.teacher, body)).status, 400);
    assert.equal(entries().length, 0);
    // A role header changes nothing either.
    const res = await api.call('POST', '/performance', {
      token: tokens.teacher, headers: { 'X-Role': 'admin' }, body: { studentId: ANA, evaluationDate: today, area: 'science', starRating: 2 },
    });
    assert.equal(res.status, 201);
    assert.deepEqual(only('performance.created').actor, { type: 'user', uid: 'teacher1', role: 'teacher' });
  });
});

describe('Fetchers and dismissal', () => {
  let fetcherId;
  before(async () => {
    smsService.setSmsProviderForTests((await import('../src/services/sms/mock.provider.js')).createMockSmsProvider());
  });

  test('Fetcher changes are audited without the Fetcher\'s name', async () => {
    const res = await call('POST', '/parent/fetchers', tokens.parentA, { fullName: FETCHER_NAME, relationship: 'Grandmother', studentIds: [ANA] });
    assert.equal(res.status, 201);
    fetcherId = res.body.fetcher.fetcherId;
    const created = only('fetcher.created');
    assertEntry(created, { eventType: 'fetcher.created', actorUid: 'parentA', role: 'parent', target: { type: 'fetcher', id: fetcherId } });
    assert.deepEqual(created.details, { studentIds: [ANA] });

    assert.equal((await call('PATCH', `/parent/fetchers/${fetcherId}`, tokens.parentA, { relationship: 'Aunt' })).status, 200);
    assert.deepEqual(only('fetcher.updated').details, { changedFields: ['relationship'], studentIds: [ANA] });

    // Another parent trying to edit it: same 404 as before, recorded as an ownership denial.
    assert.equal((await call('PATCH', `/parent/fetchers/${fetcherId}`, tokens.parentB, { relationship: 'Driver' })).status, 404);
    assertEntry(only('auth.ownership-denied'), {
      eventType: 'auth.ownership-denied', outcome: 'denied', actorUid: 'parentB', role: 'parent', target: { type: 'fetcher', id: fetcherId },
    });
    assertNoSecrets(JSON.stringify(entries()));
  });

  test('code request, wrong code, verification and release are audited; the code never is', async () => {
    api.fake.clear('dismissalRecords');
    assert.equal((await call('POST', '/parent/dismissals', tokens.parentA, { studentId: ANA, fetcherId })).status, 201);
    const code = /dismissal code is (\d{6})\./.exec(smsService.getSmsProvider().sent.at(-1).message)[1];
    const dismissalId = `${ANA}_${today}`;
    const requested = only('dismissal.code-requested');
    assertEntry(requested, { eventType: 'dismissal.code-requested', actorUid: 'parentA', role: 'parent', target: { type: 'dismissal', id: dismissalId } });
    assert.deepEqual(requested.details, { studentId: ANA, fetcherId, requestNumber: 1, smsStatus: 'sent', smsErrorCode: null });

    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    assert.equal((await call('POST', `/dismissals/${dismissalId}/verify`, tokens.teacher, { otp: wrong, requestNumber: 1 })).status, 400);
    const failed = only('dismissal.verify-failed');
    assertEntry(failed, { eventType: 'dismissal.verify-failed', outcome: 'failure', actorUid: 'teacher1', role: 'teacher' });
    assert.equal(failed.reason, 'dismissal/incorrect-code');
    assert.equal(failed.details.attemptsRemaining, 4);

    assert.equal((await call('POST', `/dismissals/${dismissalId}/verify`, tokens.teacher, { otp: code, requestNumber: 1 })).status, 200);
    assertEntry(only('dismissal.verified'), { eventType: 'dismissal.verified', actorUid: 'teacher1', role: 'teacher' });
    // Reusing the code: refused, recorded best effort.
    assert.equal((await call('POST', `/dismissals/${dismissalId}/verify`, tokens.teacher2, { otp: code, requestNumber: 1 })).status, 409);
    assert.ok(entries('dismissal.verify-failed').some((e) => e.reason === 'dismissal/already-used' && e.actor.uid === 'teacher2'));

    assert.equal((await call('POST', `/dismissals/${dismissalId}/release`, tokens.teacher2, { requestNumber: 1 })).status, 200);
    assertEntry(only('dismissal.released'), { eventType: 'dismissal.released', actorUid: 'teacher2', role: 'teacher' });

    // A second request on the same day is refused and recorded.
    assert.equal((await call('POST', '/parent/dismissals', tokens.parentA, { studentId: ANA, fetcherId })).status, 409);
    assert.ok(entries('dismissal.code-requested').some((e) => e.outcome === 'failure' && e.reason === 'dismissal/already-released'));

    const stored = JSON.stringify(entries());
    assertNoSecrets(stored, [code, wrong]);
    const viewer = await call('GET', '/admin/audit-logs?category=dismissal', tokens.admin);
    assert.equal(viewer.status, 200);
    assertNoSecrets(viewer.text, [code]);
  });
});

describe('failed audit writes', () => {
  const captureConsole = async (fn) => {
    const lines = [];
    const original = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    for (const level of Object.keys(original)) console[level] = (...args) => lines.push(args.map(String).join(' '));
    try {
      return { result: await fn(), output: lines.join('\n') };
    } finally {
      Object.assign(console, original);
    }
  };

  test('a transactional change does not commit when its audit entry cannot be written', async () => {
    api.fake.failWrites('auditLogs');
    const body = { studentId: 'K2026-070', firstName: 'Fay', lastName: 'Lim', dateOfBirth: SECRET_DOB, gender: 'Female', section: 'K2' };
    const { result: res, output } = await captureConsole(() => call('POST', '/students', tokens.admin, body));
    assert.equal(res.status, 500);
    assert.equal(res.body.error.message, 'Internal server error');
    assert.equal(res.body.error.stack, undefined, 'no stack trace unless NODE_ENV is development/test');
    assert.equal(api.fake.read('students', 'K2026-070'), undefined, 'student not created');
    assert.ok(!output.includes(SECRET_DOB));

    // Performance, RFID assignment and role changes behave the same way.
    const evaluation = { studentId: ANA, evaluationDate: today, area: 'motor-skills', starRating: 4 };
    assert.equal((await call('POST', '/performance', tokens.teacher, evaluation)).status, 500);
    assert.equal(api.fake.read('performance', `${ANA}_${today}_motor-skills`), undefined);

    api.fake.seed('rfidCards', 'E2000017221101441890CCCC', { uid: 'E2000017221101441890CCCC', studentId: null, active: true });
    api.addStudent({ studentId: 'K2026-071', firstName: 'Gia' });
    assert.equal((await call('POST', '/rfid-cards/E2000017221101441890CCCC/assign', tokens.admin, { studentId: 'K2026-071' })).status, 500);
    assert.equal(api.fake.read('rfidCards', 'E2000017221101441890CCCC').studentId, null);
    assert.equal(api.fake.read('students', 'K2026-071').rfidCardUid, null);

    api.addUser({ uid: 'target2', role: 'teacher' });
    assert.equal((await call('PATCH', '/admin/users/target2/role', tokens.admin, { role: 'parent' })).status, 500);
    assert.equal(api.fake.read('users', 'target2').role, 'teacher');
    assert.equal(api.fake.all('auditLogs').length, 0);
  });

  test('a scan whose time-in cannot be audited records no attendance', async () => {
    api.fake.clear('attendance');
    api.fake.failWrites('auditLogs');
    assert.equal((await call('POST', '/attendance/scan', tokens.teacher, { uid: CARD_A })).status, 500);
    assert.equal(api.fake.read('attendance', `${ANA}_${today}`), undefined);
  });

  test('best-effort events never break the request, and the log line has no details', async () => {
    api.fake.failWrites('auditLogs');
    const { result: denied, output } = await captureConsole(() => call('GET', '/admin/test', tokens.teacher));
    assert.equal(denied.status, 403);
    assert.match(output, /\[audit\] could not record auth\.access-denied \(14\)/);
    assert.ok(!output.includes('teacher1'));
    const unknown = await captureConsole(() => call('POST', '/attendance/scan', tokens.teacher, { uid: 'E2000017221101441890DDDD' }));
    assert.equal(unknown.result.status, 404, 'normal scan answer');
    // The failed key is released, so the next occurrence is recorded once writes work again.
    api.fake.failWrites('auditLogs', false);
    await call('POST', '/attendance/scan', tokens.teacher, { uid: 'E2000017221101441890DDDD' });
    assert.equal(entries('rfid.scan.rejected').length, 1);
  });
});

describe('audit log viewer', () => {
  const seedEntry = (i, { minutesAgo = i, category = 'student', eventType = 'student.updated', outcome = 'success', targetId = `K2026-${String(i).padStart(3, '0')}` } = {}) => {
    const id = `A${String(i).padStart(19, '0')}`;
    api.fake.seed('auditLogs', id, {
      eventType, category, outcome,
      occurredAt: Timestamp.fromMillis(Date.now() - minutesAgo * 60_000),
      schoolDate: today,
      actor: { type: 'user', uid: 'admin1', role: 'admin' },
      target: { type: 'student', id: targetId },
      reason: null, details: { changedFields: ['section'] }, route: 'PATCH /api/students/:studentId',
    });
    return id;
  };
  const get = (params) => call('GET', `/admin/audit-logs?${new URLSearchParams(params)}`, tokens.admin);

  test('pages newest first without gaps or repeats', async () => {
    for (let i = 0; i < 130; i += 1) seedEntry(i);
    const seen = [];
    let cursor;
    const sizes = [];
    do {
      const res = await get({ limit: '50', ...(cursor ? { cursor } : {}) });
      assert.equal(res.status, 200);
      sizes.push(res.body.entries.length);
      seen.push(...res.body.entries.map((e) => e.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    assert.deepEqual(sizes, [50, 50, 30]);
    assert.equal(new Set(seen).size, 130);
    assert.deepEqual(seen.slice(0, 3), ['A0000000000000000000', 'A0000000000000000001', 'A0000000000000000002']);
  });

  test('view shape: actor name resolved, no internal fields', async () => {
    seedEntry(1);
    const res = await get({});
    assert.equal(res.body.entries[0].actor.name, 'Ada Test');
    assert.deepEqual(Object.keys(res.body.entries[0]).sort(),
      ['actor', 'category', 'details', 'eventType', 'id', 'occurredAt', 'outcome', 'reason', 'route', 'schoolDate', 'target']);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  test('filters by category, event, outcome, record ID and date range', async () => {
    seedEntry(1);
    seedEntry(2, { category: 'rfid', eventType: 'rfid.scan.rejected', outcome: 'failure', targetId: 'E2000017221101441890FFFF' });
    seedEntry(3, { minutesAgo: 40 * 24 * 60 }); // 40 days ago: outside the default 7 days
    assert.equal((await get({})).body.entries.length, 2);
    assert.deepEqual((await get({ category: 'rfid' })).body.entries.map((e) => e.eventType), ['rfid.scan.rejected']);
    assert.equal((await get({ outcome: 'failure' })).body.entries.length, 1);
    assert.equal((await get({ eventType: 'student.updated' })).body.entries.length, 1);
    assert.equal((await get({ targetId: 'E2000017221101441890FFFF' })).body.entries.length, 1);
    assert.equal((await get({ actorUid: 'nobody' })).body.entries.length, 0);
  });

  test('stops at the read cap, says so, and can continue', async () => {
    for (let i = 0; i < 2100; i += 1) seedEntry(i, { category: 'student' });
    seedEntry(5000, { minutesAgo: 3000, category: 'rfid', eventType: 'rfid.scan.rejected', outcome: 'failure' });
    const first = await get({ category: 'rfid' });
    assert.equal(first.body.entries.length, 0);
    assert.equal(first.body.scanLimitReached, true);
    assert.equal(first.body.scanned, 2000);
    assert.ok(first.body.nextCursor);
    const second = await get({ category: 'rfid', cursor: first.body.nextCursor });
    assert.equal(second.body.entries.length, 1);
    assert.equal(second.body.scanLimitReached, false);
    assert.equal(second.body.nextCursor, null);
  });

  test('rejects invalid filters', async () => {
    const bad = [
      { limit: '0' }, { limit: '101' }, { limit: 'abc' }, { cursor: 'not-a-cursor' }, { cursor: 'B0000000000000000000' },
      { category: 'grades' }, { eventType: 'user.deleted' }, { outcome: 'maybe' }, { targetType: 'x' },
      { actorUid: 'bad uid!' }, { targetId: '<script>' }, { from: '2026-02-30' }, { to: '2999-01-01' },
      { from: today, to: '2000-01-01' }, { from: '2000-01-01', to: today }, { sort: 'asc' },
    ];
    for (const params of bad) {
      const res = await get(params);
      assert.equal(res.status, 400, JSON.stringify(params));
    }
  });
});
