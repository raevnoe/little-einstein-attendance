// Demo cleanup (scripts/resetData.js -> services/dataReset.service.js) against the in-memory fake:
// a plan changes nothing; the run backs up first, removes every test record and every account not
// kept, and leaves the kept accounts and the attendance/dismissal settings.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestApi } from './helpers/testApi.js';

let api;
let reset;
let dir;
const uids = {};

before(async () => {
  api = await startTestApi();
  reset = await import('../src/services/dataReset.service.js');
  dir = await mkdtemp(join(tmpdir(), 'led-reset-'));

  // Accounts: a real sign-in (Auth) + a profile, like the app creates them.
  const account = async (email, role, extra = {}) => {
    const user = await api.fake.adminAuth.createUser({ email, password: 'x'.repeat(32), displayName: email });
    api.fake.seed('users', user.uid, { uid: user.uid, email, firstName: 'T', lastName: 'User', displayName: email, role, active: true, ...extra });
    uids[email] = user.uid;
  };
  await account('owner@school.test', 'admin');
  await account('teacher@school.test', 'teacher', { sections: ['K1'] });
  await account('parent@school.test', 'parent', { mobileNumber: '+639171111111' });
  await account('test.parent@example.com', 'parent');
  await account('test.admin@example.com', 'admin');

  // Test records in every collection the reset clears.
  api.addStudent({ studentId: 'K2026-901', parentIds: [uids['test.parent@example.com']] });
  api.fake.seed('rfidCards', 'E200001', { uid: 'E200001', studentId: 'K2026-901', active: true });
  api.fake.seed('attendance', 'K2026-901_2026-10-20', { studentId: 'K2026-901', schoolDate: '2026-10-20' });
  api.fake.seed('performance', 'K2026-901_2026-10-20_language', { studentId: 'K2026-901', starRating: 4 });
  api.fake.seed('fetchers', 'f1', { parentId: uids['test.parent@example.com'], fullName: 'Rosa' });
  api.fake.seed('dismissalRecords', 'K2026-901_2026-10-20', { studentId: 'K2026-901', status: 'released' });
  api.fake.seed('notifications', 'n1', { status: 'sent' });
  api.fake.seed('auditLogs', 'a1', { eventType: 'student.created' });
  api.fake.seed(`users/${uids['teacher@school.test']}/inbox`, 'i1', { kind: 'dismissal-request' });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 10 });
  api.fake.patch('users', uids['owner@school.test'], { notificationsSeenAt: new Date() });
});

after(async () => {
  await api.close();
  await rm(dir, { recursive: true, force: true });
});

const KEEP = ['Owner@School.test ', 'teacher@school.test', 'parent@school.test'];

test('refuses unsafe plans and changes nothing', async () => {
  await assert.rejects(reset.planReset({ keepEmails: [] }), /at least one account/);
  await assert.rejects(reset.planReset({ keepEmails: ['nobody@school.test'] }), /No account found for: nobody@school.test/);
  await assert.rejects(reset.planReset({ keepEmails: ['teacher@school.test'] }), /no ACTIVE admin/);
  assert.equal(api.fake.all('students').length, 1);
});

test('the plan lists what would go and what stays, without changing anything', async () => {
  const plan = await reset.planReset({ keepEmails: KEEP });
  assert.deepEqual(plan.kept.map((k) => k.email).sort(), ['owner@school.test', 'parent@school.test', 'teacher@school.test']);
  assert.deepEqual(plan.deleted.map((d) => d.email).sort(), ['test.admin@example.com', 'test.parent@example.com']);
  assert.equal(plan.collections.students, 1);
  assert.equal(plan.collections.auditLogs, 1);
  assert.equal(plan.inboxItems, 1);
  assert.equal(plan.sectionList, true);
  assert.equal(api.fake.all('students').length, 1, 'planning deletes nothing');
});

test('the run writes a backup first, then removes the test data and the accounts not kept', async () => {
  const plan = await reset.planReset({ keepEmails: KEEP });
  const backupPath = join(dir, 'backup.json');
  const lines = [];
  await reset.runReset(plan, { backupPath, log: (l) => lines.push(l) });

  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.collections.students[0].id, 'K2026-901');
  assert.equal(backup.users.length, 5);
  assert.ok(backup.sectionList.names.includes('K1'));

  for (const name of ['students', 'rfidCards', 'attendance', 'performance', 'fetchers', 'dismissalRecords', 'notifications', 'auditLogs']) {
    assert.equal(api.fake.all(name).length, 0, name);
  }
  assert.equal(api.fake.all(`users/${uids['teacher@school.test']}/inbox`).length, 0);
  assert.equal(api.fake.read('systemSettings', 'sections'), undefined);
  assert.deepEqual(api.fake.read('systemSettings', 'attendance'), { rfidDebounceSeconds: 10 });

  // Kept accounts stay (role, number) without their old teacher sections or seen marker.
  const teacher = api.fake.read('users', uids['teacher@school.test']);
  assert.equal(teacher.role, 'teacher');
  assert.equal(teacher.sections, undefined);
  assert.equal(api.fake.read('users', uids['parent@school.test']).mobileNumber, '+639171111111');
  assert.equal(api.fake.read('users', uids['owner@school.test']).notificationsSeenAt, undefined);

  // Accounts not kept: profile and sign-in gone.
  assert.equal(api.fake.read('users', uids['test.parent@example.com']), undefined);
  assert.equal(api.fake.read('users', uids['test.admin@example.com']), undefined);
  const signIns = api.fake.authUsers().map((u) => u.email).sort();
  assert.deepEqual(signIns, ['owner@school.test', 'parent@school.test', 'teacher@school.test']);

  // The log names counts only, never record contents.
  assert.ok(!lines.join(' ').includes('Rosa'));
  // A second backup with the same name is refused rather than overwritten.
  await assert.rejects(reset.runReset(plan, { backupPath }));
});
