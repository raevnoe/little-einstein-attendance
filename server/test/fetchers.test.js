// Fetcher management API: parent ownership, cross-parent isolation, validation, admin views,
// and role-based access. Firebase is an in-memory fake; no real data or SMS is involved.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApi } from './helpers/testApi.js';

let api;
let parentA;
let parentB;
let teacher;
let admin;

before(async () => {
  api = await startTestApi();
  parentA = api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' });
  parentB = api.addUser({ uid: 'parentB', role: 'parent', mobileNumber: '+639172222222' });
  teacher = api.addUser({ uid: 'teacher1', role: 'teacher' });
  admin = api.addUser({ uid: 'admin1', role: 'admin' });
  api.addStudent({ studentId: 'K2026-001', firstName: 'Ana', parentIds: ['parentA'] });
  api.addStudent({ studentId: 'K2026-002', firstName: 'Ben', parentIds: ['parentA'] });
  api.addStudent({ studentId: 'K2026-003', firstName: 'Cara', parentIds: ['parentB'] });
  api.addStudent({ studentId: 'K2026-004', firstName: 'Dino', parentIds: ['parentA'], active: false });
});

after(() => api.close());

const createFetcher = (token, body) => api.call('POST', '/parent/fetchers', { token, body });

describe('parent manages own Fetchers', () => {
  let fetcherId;

  test('registers a Fetcher for own active children', async () => {
    const res = await createFetcher(parentA, { fullName: '  Maria   Santos ', relationship: 'Grandmother', studentIds: ['k2026-001', 'K2026-002'] });
    assert.equal(res.status, 201);
    assert.equal(res.body.fetcher.fullName, 'Maria Santos');
    assert.deepEqual(res.body.fetcher.studentIds, ['K2026-001', 'K2026-002']);
    assert.equal(res.body.fetcher.active, true);
    assert.equal('parentId' in res.body.fetcher, false);
    fetcherId = res.body.fetcher.fetcherId;
    assert.equal(api.fake.read('fetchers', fetcherId).parentId, 'parentA');
  });

  test('lists only own Fetchers', async () => {
    await createFetcher(parentB, { fullName: 'Pedro Cruz', relationship: 'Uncle', studentIds: ['K2026-003'] });
    const a = await api.call('GET', '/parent/fetchers', { token: parentA });
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.fetchers.map((f) => f.fullName), ['Maria Santos']);
    const b = await api.call('GET', '/parent/fetchers', { token: parentB });
    assert.deepEqual(b.body.fetchers.map((f) => f.fullName), ['Pedro Cruz']);
  });

  test('edits name, relationship and authorized children', async () => {
    const res = await api.call('PATCH', `/parent/fetchers/${fetcherId}`, {
      token: parentA, body: { relationship: 'Lola', studentIds: ['K2026-002'] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.fetcher.relationship, 'Lola');
    assert.deepEqual(res.body.fetcher.studentIds, ['K2026-002']);
  });

  test('deactivates a Fetcher without deleting it; it can no longer be edited', async () => {
    const res = await api.call('POST', `/parent/fetchers/${fetcherId}/deactivate`, { token: parentA });
    assert.equal(res.status, 200);
    assert.equal(res.body.fetcher.active, false);
    assert.ok(api.fake.read('fetchers', fetcherId), 'record is kept');
    const edit = await api.call('PATCH', `/parent/fetchers/${fetcherId}`, { token: parentA, body: { relationship: 'Aunt' } });
    assert.equal(edit.status, 409);
  });
});

describe('cross-parent isolation', () => {
  let fetcherOfB;

  before(async () => {
    fetcherOfB = (await createFetcher(parentB, { fullName: 'Rosa Reyes', relationship: 'Aunt', studentIds: ['K2026-003'] })).body.fetcher.fetcherId;
  });

  test('cannot authorize a Fetcher for another parent’s child', async () => {
    const res = await createFetcher(parentA, { fullName: 'Intruder Person', relationship: 'Friend', studentIds: ['K2026-003'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error.details.fields.studentIds, /own children/);
  });

  test('cannot add another parent’s child to an own Fetcher', async () => {
    const own = (await createFetcher(parentA, { fullName: 'Lito Lim', relationship: 'Driver', studentIds: ['K2026-001'] })).body.fetcher;
    const res = await api.call('PATCH', `/parent/fetchers/${own.fetcherId}`, { token: parentA, body: { studentIds: ['K2026-001', 'K2026-003'] } });
    assert.equal(res.status, 400);
  });

  test('cannot authorize an inactive own child', async () => {
    const res = await createFetcher(parentA, { fullName: 'Lito Lim', relationship: 'Driver', studentIds: ['K2026-004'] });
    assert.equal(res.status, 400);
  });

  test('cannot edit or deactivate another parent’s Fetcher (404, same as unknown)', async () => {
    const edit = await api.call('PATCH', `/parent/fetchers/${fetcherOfB}`, { token: parentA, body: { fullName: 'Changed Name' } });
    assert.equal(edit.status, 404);
    const deactivate = await api.call('POST', `/parent/fetchers/${fetcherOfB}/deactivate`, { token: parentA });
    assert.equal(deactivate.status, 404);
    const unknown = await api.call('POST', '/parent/fetchers/AAAAAAAAAAAAAAAAAAAA/deactivate', { token: parentA });
    assert.equal(unknown.status, 404);
    assert.equal(edit.body.error.message, unknown.body.error.message);
    assert.equal(api.fake.read('fetchers', fetcherOfB).active, true);
    assert.equal(api.fake.read('fetchers', fetcherOfB).fullName, 'Rosa Reyes');
  });

  test('a client-supplied parentId/active/timestamps is rejected, not trusted', async () => {
    const res = await createFetcher(parentA, { fullName: 'Lito Lim', relationship: 'Driver', studentIds: ['K2026-001'], parentId: 'parentB' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation/unknown-fields');
    const patch = await api.call('PATCH', `/parent/fetchers/${fetcherOfB}`, { token: parentB, body: { active: true, parentId: 'parentA' } });
    assert.equal(patch.status, 400);
  });
});

describe('validation', () => {
  test('rejects missing/invalid fields', async () => {
    const res = await createFetcher(parentA, { fullName: '', relationship: '<script>', studentIds: [] });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.details.fields).sort(), ['fullName', 'relationship', 'studentIds']);
    const bad = await createFetcher(parentA, { fullName: 'Maria 123', relationship: 'Aunt', studentIds: ['not a/valid id'] });
    assert.equal(bad.status, 400);
  });
});

describe('role-based access', () => {
  test('requires authentication; rejects forged tokens', async () => {
    assert.equal((await api.call('GET', '/parent/fetchers')).status, 401);
    assert.equal((await api.call('GET', '/parent/fetchers', { token: 'forged-token' })).status, 401);
    assert.equal((await api.call('GET', '/admin/fetchers')).status, 401);
  });

  test('teachers and admins cannot use the parent Fetcher API', async () => {
    assert.equal((await api.call('GET', '/parent/fetchers', { token: teacher })).status, 403);
    assert.equal((await createFetcher(admin, { fullName: 'X Y', relationship: 'Aunt', studentIds: ['K2026-001'] })).status, 403);
  });

  test('a role header/body cannot grant access', async () => {
    const res = await api.call('GET', '/admin/fetchers', { token: parentA, headers: { 'X-Role': 'admin' } });
    assert.equal(res.status, 403);
  });

  test('inactive parent accounts are refused', async () => {
    const token = api.addUser({ uid: 'parentInactive', role: 'parent', active: false });
    assert.equal((await api.call('GET', '/parent/fetchers', { token })).status, 403);
  });

  test('parents and teachers cannot use the admin Fetcher views', async () => {
    assert.equal((await api.call('GET', '/admin/fetchers', { token: parentA })).status, 403);
    assert.equal((await api.call('GET', '/admin/fetchers', { token: teacher })).status, 403);
  });

  test('admin sees every Fetcher with parent and child names, and can deactivate one', async () => {
    const res = await api.call('GET', '/admin/fetchers', { token: admin });
    assert.equal(res.status, 200);
    const rosa = res.body.fetchers.find((f) => f.fullName === 'Rosa Reyes');
    assert.equal(rosa.parentName, 'parentB Test');
    assert.deepEqual(rosa.students.map((s) => s.name), ['Cara Test']);
    const off = await api.call('POST', `/admin/fetchers/${rosa.fetcherId}/deactivate`, { token: admin });
    assert.equal(off.status, 200);
    assert.equal(off.body.fetcher.active, false);
    const activeOnly = await api.call('GET', '/admin/fetchers?status=active', { token: admin });
    assert.ok(activeOnly.body.fetchers.every((f) => f.active));
  });
});
