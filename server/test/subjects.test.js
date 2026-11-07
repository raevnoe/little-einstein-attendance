// Subjects: the admin-managed list teachers rate behavior in (add, rename, hide/show, reorder),
// and how evaluations, reports and the parent's view follow it. In-memory Firebase fake, mock SMS.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let t;
let today;
const ANA = 'K2026-401';

before(async () => {
  api = await startTestApi();
  const { schoolDateOf } = await import('../src/utils/schoolDate.js');
  today = schoolDateOf(new Date());
  t = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    parent: api.addUser({ uid: 'parent1', role: 'parent' }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', section: 'K1', parentIds: ['parent1'] });
});

after(async () => {
  await api.close();
});

const call = (method, path, token, body) => api.call(method, path, { token, body });
const keys = (res) => res.body.subjects.map((s) => s.key);
const evaluate = (area, starRating = 4) =>
  call('POST', '/performance', t.teacher, { studentId: ANA, evaluationDate: today, area, starRating, observation: '' });

describe('subject list', () => {
  test('starts with the six subjects; every role can read it', async () => {
    for (const token of [t.admin, t.teacher, t.parent]) {
      const res = await call('GET', '/subjects', token);
      assert.equal(res.status, 200);
      assert.deepEqual(keys(res), ['language', 'mathematics', 'science', 'social-skills', 'motor-skills', 'classroom-behavior']);
      assert.ok(res.body.subjects.every((s) => s.hidden === false));
    }
    assert.equal((await api.call('GET', '/subjects')).status, 401);
  });

  test('only admins change it', async () => {
    assert.equal((await call('POST', '/admin/subjects', t.teacher, { label: 'Music' })).status, 403);
    assert.equal((await call('PATCH', '/admin/subjects/science', t.teacher, { hidden: true })).status, 403);
    assert.equal((await call('POST', '/admin/subjects', t.parent, { label: 'Music' })).status, 403);
  });

  test('adds a subject (key from the name); duplicates and bad names are refused', async () => {
    const res = await call('POST', '/admin/subjects', t.admin, { label: '  Filipino   2 ' });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.subject, { key: 'filipino-2', label: 'Filipino 2', hidden: false });
    assert.equal(keys(res).at(-1), 'filipino-2');
    assert.equal((await call('POST', '/admin/subjects', t.admin, { label: 'filipino 2' })).status, 409);
    assert.equal((await call('POST', '/admin/subjects', t.admin, { label: '' })).status, 400);
    assert.equal((await call('POST', '/admin/subjects', t.admin, { label: '<b>Art</b>' })).status, 400);
    assert.equal((await call('POST', '/admin/subjects', t.admin, { label: '2 Art' })).status, 400);
    assert.equal((await call('POST', '/admin/subjects', t.admin, { label: 'Art', key: 'x' })).status, 400);
    const entry = api.fake.all('auditLogs').find((e) => e.eventType === 'subject.added');
    assert.equal(entry.target.id, 'filipino-2');
    assert.deepEqual(entry.details.changes, ['added "Filipino 2"']);
  });

  test('renames (key stays), refuses a name another subject has, and moves', async () => {
    const renamed = await call('PATCH', '/admin/subjects/filipino-2', t.admin, { label: 'Filipino' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.subjects.find((s) => s.key === 'filipino-2').label, 'Filipino');
    assert.equal((await call('PATCH', '/admin/subjects/filipino-2', t.admin, { label: 'SCIENCE' })).status, 409);

    const up = await call('PATCH', '/admin/subjects/filipino-2', t.admin, { move: 'up' });
    assert.deepEqual(keys(up).slice(-2), ['filipino-2', 'classroom-behavior']);
    const first = await call('PATCH', '/admin/subjects/language', t.admin, { move: 'up' });
    assert.equal(keys(first)[0], 'language'); // already first: nothing changes
    assert.ok(api.fake.all('auditLogs').some((e) => e.eventType === 'subject.updated' && e.details.changes.includes('moved up')));
  });

  test('bad changes and unknown subjects are refused', async () => {
    assert.equal((await call('PATCH', '/admin/subjects/science', t.admin, {})).status, 400);
    assert.equal((await call('PATCH', '/admin/subjects/science', t.admin, { hidden: 'yes' })).status, 400);
    assert.equal((await call('PATCH', '/admin/subjects/science', t.admin, { move: 'left' })).status, 400);
    assert.equal((await call('PATCH', '/admin/subjects/science', t.admin, { key: 'x' })).status, 400);
    assert.equal((await call('PATCH', '/admin/subjects/history', t.admin, { hidden: true })).status, 404);
  });
});

describe('hidden subjects', () => {
  test('an existing evaluation of a hidden subject stays visible and editable; new ones are refused', async () => {
    assert.equal((await evaluate('science')).status, 201);
    const hidden = await call('PATCH', '/admin/subjects/science', t.admin, { hidden: true });
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.subjects.find((s) => s.key === 'science').hidden, true);

    // Same student/day/subject: updates the existing record.
    assert.equal((await evaluate('science', 5)).status, 200);
    const list = await call('GET', `/performance?studentId=${ANA}`, t.teacher);
    assert.equal(list.body.evaluations.find((e) => e.area === 'science').starRating, 5);

    // Another student-day has no science evaluation yet -> refused.
    api.addStudent({ studentId: 'K2026-402', firstName: 'Ben', section: 'K1', parentIds: [] });
    const refused = await call('POST', '/performance', t.teacher, { studentId: 'K2026-402', evaluationDate: today, area: 'science', starRating: 3, observation: '' });
    assert.equal(refused.status, 400);
    assert.match(refused.body.error.details.fields.area, /hidden/);

    // Parent still sees it; the report can still filter by it.
    const child = await call('GET', `/parent/children/${ANA}/performance`, t.parent);
    assert.ok(child.body.performance.days[0].evaluations.some((e) => e.area === 'science'));
    assert.equal((await call('GET', `/reports/performance?area=science`, t.admin)).status, 200);
    assert.equal((await call('GET', `/reports/performance?area=history`, t.admin)).status, 400);
  });

  test('a subject that is not on the list cannot be evaluated', async () => {
    assert.equal((await evaluate('history')).status, 400);
  });

  test('at least one subject stays visible; a hidden one can be shown again', async () => {
    const list = await call('GET', '/subjects', t.admin);
    const visible = list.body.subjects.filter((s) => !s.hidden).map((s) => s.key);
    for (const key of visible.slice(1)) {
      assert.equal((await call('PATCH', `/admin/subjects/${key}`, t.admin, { hidden: true })).status, 200);
    }
    const last = await call('PATCH', `/admin/subjects/${visible[0]}`, t.admin, { hidden: true });
    assert.equal(last.status, 409);
    assert.equal(last.body.error.code, 'subjects/last-visible');
    const shown = await call('PATCH', '/admin/subjects/science', t.admin, { hidden: false });
    assert.equal(shown.body.subjects.find((s) => s.key === 'science').hidden, false);
    assert.ok(api.fake.all('auditLogs').some((e) => e.eventType === 'subject.updated' && e.details.changes.includes('shown again')));
  });

  test('at most 20 subjects', async () => {
    const { MAX_SUBJECTS } = await import('@led/shared');
    let count = (await call('GET', '/subjects', t.admin)).body.subjects.length;
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; count < MAX_SUBJECTS; i += 1, count += 1) {
      assert.equal((await call('POST', '/admin/subjects', t.admin, { label: `Club ${letters[i]}` })).status, 201);
    }
    const res = await call('POST', '/admin/subjects', t.admin, { label: 'One too many' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'subjects/too-many');
  });
});
