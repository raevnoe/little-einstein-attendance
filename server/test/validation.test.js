// Input validation added on 2026-11-02: names without numbers or symbols (students, accounts,
// pick-up people), kindergarten age, duplicate students and pick-up people, reasons that use words,
// and the shared password rules (applied by the screens; passwords never reach this server).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLetters, passwordProblems, passwordStrength, validatePersonName } from '@led/shared';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;

const call = (method, path, token, body) => api.call(method, path, { token, body });
const student = (over = {}) => ({ studentId: 'K2026-601', firstName: 'Lia', lastName: 'Santos', dateOfBirth: '2021-04-04', gender: 'Female', section: 'K1', ...over });

before(async () => {
  api = await startTestApi();
  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent' }),
  };
  api.addStudent({ studentId: 'K2026-600', firstName: 'Mia', lastName: 'Reyes', parentIds: ['parentA'] });
});

after(async () => {
  await api.close();
});

describe('names', () => {
  test('the shared rule accepts real names and refuses numbers and symbols', () => {
    for (const ok of ['Juan', 'Ma. Clara', 'Dela Cruz', "O'Neil", 'Anne-Marie', 'Juan Cruz Jr.', 'Ñino', 'José']) {
      assert.equal(validatePersonName(ok, { label: 'Name' }).error, undefined, ok);
    }
    assert.match(validatePersonName('Juan2', { label: 'First name' }).error, /cannot contain numbers/);
    for (const bad of ['Juan--Cruz', 'Juan..', 'Juan_Cruz', '@na', '-Ana', 'Ana-', 'Ana!']) {
      assert.ok(validatePersonName(bad, { label: 'Name' }).error, bad);
    }
    assert.deepEqual(validatePersonName('  Ana   Lee ', { label: 'Name' }), { value: 'Ana Lee' });
  });

  test('student, account and pick-up person names are all checked by the server', async () => {
    const s = await call('POST', '/students', tokens.admin, student({ firstName: 'Lia2' }));
    assert.equal(s.status, 400);
    assert.match(s.body.error.details.fields.firstName, /numbers/);

    const a = await call('POST', '/admin/users', tokens.admin, { email: 'x@example.com', firstName: 'Maria', lastName: 'Cruz3', role: 'parent' });
    assert.equal(a.status, 400);
    assert.match(a.body.error.details.fields.lastName, /numbers/);

    const f = await call('POST', '/parent/fetchers', tokens.parentA, { fullName: 'Rosa 1', relationship: 'Aunt', studentIds: ['K2026-600'] });
    assert.equal(f.status, 400);
    assert.match(f.body.error.details.fields.fullName, /numbers/);
  });
});

describe('students', () => {
  test('a kindergarten student is at least 2 years old', async () => {
    const thisYear = new Date().getUTCFullYear();
    const res = await call('POST', '/students', tokens.admin, student({ studentId: 'K2026-602', dateOfBirth: `${thisYear}-01-01` }));
    assert.equal(res.status, 400);
    assert.match(res.body.error.details.fields.dateOfBirth, /at least 2 years old/);
  });

  test('the same child cannot be added twice (same first name, last name and birthday)', async () => {
    assert.equal((await call('POST', '/students', tokens.admin, student())).status, 201);
    const twin = await call('POST', '/students', tokens.admin, student({ studentId: 'K2026-603', firstName: ' lia ', lastName: 'SANTOS' }));
    assert.equal(twin.status, 409);
    assert.match(twin.body.error.message, /K2026-601/);
    // A real twin has another first name: allowed.
    assert.equal((await call('POST', '/students', tokens.admin, student({ studentId: 'K2026-604', firstName: 'Leo' }))).status, 201);
    // Editing one into a copy of another is refused too.
    const edit = await call('PATCH', '/students/K2026-604', tokens.admin, { firstName: 'Lia' });
    assert.equal(edit.status, 409);
  });
});

describe('pick-up people', () => {
  test('a parent cannot add two active pick-up people with the same name', async () => {
    const body = { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: ['K2026-600'] };
    assert.equal((await call('POST', '/parent/fetchers', tokens.parentA, body)).status, 201);
    const again = await call('POST', '/parent/fetchers', tokens.parentA, { ...body, fullName: 'rosa  reyes' });
    assert.equal(again.status, 409);
    assert.ok(again.body.error.details.fields.fullName);
  });
});

describe('reasons', () => {
  test('a reason must use words', async () => {
    assert.equal(hasLetters('...'), false);
    assert.equal(hasLetters('Doctor'), true);
    const res = await call('PUT', '/admin/calendar', tokens.admin, { noClassDates: [{ date: '2026-12-25', reason: '!!!' }] });
    assert.equal(res.status, 400);
  });
});

describe('passwords (shared rules used by the screens)', () => {
  test('need 8+ characters with upper and lower case, a number and a special character', () => {
    assert.deepEqual(passwordProblems('Sunflower7!'), []);
    for (const weak of ['alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbers!!', 'NoSpecial123']) {
      assert.ok(passwordProblems(weak).length > 0, weak);
    }
    assert.ok(passwordProblems('Abc1!').includes('At least 8 characters'));
  });

  test('refuse common passwords and ones built from the person\'s own name or email', () => {
    assert.ok(passwordProblems('P@ssw0rd').includes('Not a common password'));
    assert.ok(passwordProblems('Maria2026!', { email: 'maria.cruz@example.com', names: ['Maria', 'Cruz'] }).includes('Does not contain your name or email'));
    assert.equal(passwordStrength(''), 0);
    assert.equal(passwordStrength('Sunflower7!'), 3);
    assert.equal(passwordStrength('Sunflower7!Garden'), 4);
    assert.ok(passwordStrength('P@ssw0rd') <= 2, 'common passwords never look strong');
  });
});
