// Reader registration screen: POST /api/rfid-cards with an optional studentId registers the
// card and assigns it in ONE transaction (both or neither). Firebase is the in-memory fake.
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;

const CARD_1 = 'E2000017221101441890C001';
const CARD_2 = 'E2000017221101441890C002';
const CARD_3 = 'E2000017221101441890C003';

before(async () => {
  api = await startTestApi();
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    parent: api.addUser({ uid: 'parentA', role: 'parent' }),
  };
  api.addStudent({ studentId: 'K2026-001', firstName: 'Eithan', parentIds: ['parentA'] });
  api.addStudent({ studentId: 'K2026-002', firstName: 'Sophia' });
  api.addStudent({ studentId: 'K2026-003', firstName: 'Old', active: false });
  api.addStudent({ studentId: 'K2026-004', firstName: 'Has', rfidCardUid: 'E2000017221101441890FFFF' });
  api.fake.seed('rfidCards', 'E2000017221101441890FFFF', { uid: 'E2000017221101441890FFFF', studentId: 'K2026-004', active: true });
});

afterEach(() => api.fake.failWrites('auditLogs', false));
after(() => api.close());

const call = (method, path, token, body) => api.call(method, path, { token, body });
const auditFor = (uid) => api.fake.all('auditLogs').filter((e) => e.target?.id === uid).map((e) => e.eventType).sort();

describe('POST /api/rfid-cards with studentId', () => {
  test('registers and assigns in one step, with both audit entries', async () => {
    const res = await call('POST', '/rfid-cards', tokens.admin, { uid: 'e200 0017 2211 0144 1890 c001', studentId: 'k2026-001' });
    assert.equal(res.status, 201);
    assert.equal(res.body.card.uid, CARD_1);
    assert.equal(res.body.card.student.studentId, 'K2026-001');
    assert.equal(api.fake.read('rfidCards', CARD_1).studentId, 'K2026-001');
    assert.ok(api.fake.read('rfidCards', CARD_1).assignedAt, 'assignedAt set');
    assert.equal(api.fake.read('students', 'K2026-001').rfidCardUid, CARD_1);
    assert.deepEqual(auditFor(CARD_1), ['rfid.card.assigned', 'rfid.card.registered']);
  });

  test('without studentId it still registers an unassigned card (unchanged behaviour)', async () => {
    for (const studentId of [undefined, null, '']) {
      api.fake.clear('rfidCards');
      const res = await call('POST', '/rfid-cards', tokens.admin, { uid: CARD_2, studentId });
      assert.equal(res.status, 201);
      assert.equal(res.body.card.student, null);
    }
  });

  test('refuses and saves NOTHING when the student cannot get this card', async () => {
    api.fake.clear('rfidCards');
    api.fake.seed('rfidCards', 'E2000017221101441890FFFF', { uid: 'E2000017221101441890FFFF', studentId: 'K2026-004', active: true });
    const cases = [
      [{ studentId: 'K2026-999' }, 404, 'students/not-found'],
      [{ studentId: 'K2026-003' }, 409, 'students/inactive'],
      [{ studentId: 'K2026-004' }, 409, 'rfid/student-has-card'],
      [{ studentId: 'not a valid id!' }, 400, 'validation/invalid-student-id'],
      [{ studentId: 42 }, 400, 'validation/invalid-student-id'],
    ];
    for (const [extra, status, code] of cases) {
      const res = await call('POST', '/rfid-cards', tokens.admin, { uid: CARD_3, ...extra });
      assert.equal(res.status, status, JSON.stringify(extra));
      assert.equal(res.body.error.code, code);
      assert.equal(api.fake.read('rfidCards', CARD_3), undefined, 'card not registered');
    }
    assert.deepEqual(auditFor(CARD_3), []);
  });

  test('an already registered card is a 409 and its student is not changed', async () => {
    const res = await call('POST', '/rfid-cards', tokens.admin, { uid: 'E2000017221101441890FFFF', studentId: 'K2026-002' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'rfid/duplicate-uid');
    assert.equal(api.fake.read('rfidCards', 'E2000017221101441890FFFF').studentId, 'K2026-004');
    assert.equal(api.fake.read('students', 'K2026-002').rfidCardUid ?? null, null);
  });

  test('if the audit write fails, neither the card nor the student changes', async () => {
    api.fake.failWrites('auditLogs');
    const res = await call('POST', '/rfid-cards', tokens.admin, { uid: CARD_3, studentId: 'K2026-002' });
    assert.equal(res.status, 500);
    assert.equal(api.fake.read('rfidCards', CARD_3), undefined);
    assert.equal(api.fake.read('students', 'K2026-002').rfidCardUid ?? null, null);
  });

  test('only admins may register cards', async () => {
    for (const token of [tokens.teacher, tokens.parent]) {
      assert.equal((await call('POST', '/rfid-cards', token, { uid: CARD_3, studentId: 'K2026-002' })).status, 403);
    }
    assert.equal((await call('POST', '/rfid-cards', undefined, { uid: CARD_3 })).status, 401);
    assert.equal(api.fake.read('rfidCards', CARD_3), undefined);
  });
});
