// Settings: School Settings (GET/PATCH /api/admin/settings) and My Account (/api/account).
// Firebase is the in-memory fake and SMS goes to a mock provider: nothing real is sent.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchoolSettings } from '@led/shared';
import { startTestApi } from './helpers/testApi.js';

let api;
let tokens;
let smsService;
let mockProvider;
let settingsModel;
let audit;
let sms;
const revoked = [];

const ANA = 'K2026-301'; // parentA (mobile number)
const CARD_ANA = 'E2000017221101441890C301';

const settingsCall = (method, token, body) => api.call(method, '/admin/settings', { token, body });
const scanAna = () => api.call('POST', '/attendance/scan', { token: tokens.teacher, body: { uid: CARD_ANA } });
const auditEntries = (eventType) => api.fake.all('auditLogs').filter((e) => e.eventType === eventType);

before(async () => {
  api = await startTestApi();
  smsService = await import('../src/services/sms/sms.service.js');
  mockProvider = await import('../src/services/sms/mock.provider.js');
  settingsModel = await import('../src/models/systemSettings.model.js');
  audit = await import('../src/services/audit.service.js');
  api.fake.adminAuth.revokeRefreshTokens = async (uid) => { revoked.push(uid); };

  tokens = {
    admin: api.addUser({ uid: 'admin1', role: 'admin' }),
    teacher: api.addUser({ uid: 'teacher1', role: 'teacher' }),
    parentA: api.addUser({ uid: 'parentA', role: 'parent', mobileNumber: '+639171111111' }),
    parentOff: api.addUser({ uid: 'parentOff', role: 'parent', active: false }),
  };
  api.addStudent({ studentId: ANA, firstName: 'Ana', parentIds: ['parentA'], rfidCardUid: CARD_ANA });
  api.fake.seed('rfidCards', CARD_ANA, { uid: CARD_ANA, studentId: ANA, active: true });
});

after(async () => {
  smsService.setSmsProviderForTests(null);
  await api.close();
});

beforeEach(() => {
  for (const name of ['attendance', 'notifications', 'auditLogs']) api.fake.clear(name);
  api.fake.clear('systemSettings');
  api.fake.seed('systemSettings', 'sections', { names: ['K1', 'K2'] });
  api.fake.seed('systemSettings', 'attendance', { rfidDebounceSeconds: 0 });
  api.fake.patch('users', 'parentA', { attendanceSms: true });
  settingsModel.clearSettingsCache();
  audit.resetAuditSuppressionForTests();
  sms = mockProvider.createMockSmsProvider();
  smsService.setSmsProviderForTests(sms);
  revoked.length = 0;
});

describe('School Settings (admin)', () => {
  test('only admins can read or change them', async () => {
    assert.equal((await settingsCall('GET')).status, 401);
    assert.equal((await settingsCall('GET', tokens.teacher)).status, 403);
    assert.equal((await settingsCall('PATCH', tokens.parentA, { sms: { attendanceSmsEnabled: false } })).status, 403);
    assert.equal(api.fake.read('systemSettings', 'sms'), undefined, 'nothing saved');
  });

  test('returns the defaults when nothing is stored', async () => {
    const res = await settingsCall('GET', tokens.admin);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.settings, { ...defaultSchoolSettings(), attendance: { rfidDebounceSeconds: 0 } });
  });

  test('saves changed values with one audit entry per changed group', async () => {
    const res = await settingsCall('PATCH', tokens.admin, {
      dismissal: { otpExpiryMinutes: 15, otpMaxAttempts: 5 }, // 5 = unchanged
      sms: { attendanceSmsEnabled: false },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.dismissal.otpExpiryMinutes, 15);
    assert.equal(res.body.settings.sms.attendanceSmsEnabled, false);
    assert.equal(api.fake.read('systemSettings', 'dismissal').otpExpiryMinutes, 15);
    assert.equal(api.fake.read('systemSettings', 'dismissal').otpMaxAttempts, undefined, 'unchanged values are not written');

    const entries = auditEntries('settings.changed');
    assert.equal(entries.length, 2);
    const dismissal = entries.find((e) => e.target.id === 'dismissal');
    assert.equal(dismissal.actor.uid, 'admin1');
    assert.deepEqual(dismissal.details, { group: 'dismissal', changes: ['otpExpiryMinutes: 10 -> 15'] });

    // Saving the same values again changes nothing and records nothing.
    await settingsCall('PATCH', tokens.admin, { dismissal: { otpExpiryMinutes: 15 } });
    assert.equal(auditEntries('settings.changed').length, 2);
  });

  test('rejects values out of range, wrong types and unknown settings; nothing is saved', async () => {
    const tooLong = await settingsCall('PATCH', tokens.admin, { dismissal: { otpExpiryMinutes: 31 } });
    assert.equal(tooLong.status, 400);
    assert.ok(tooLong.body.error.details.fields['dismissal.otpExpiryMinutes']);
    for (const body of [
      { dismissal: { otpExpiryMinutes: '15' } },
      { dismissal: { otpExpiryMinutes: 12.5 } },
      { sms: { attendanceSmsEnabled: 'no' } },
      { attendance: { rfidDebounceSeconds: -1 } },
      { dismissal: { pepper: 1 } },
      { sections: { names: [] } },
      [],
    ]) {
      assert.equal((await settingsCall('PATCH', tokens.admin, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(api.fake.read('systemSettings', 'dismissal'), undefined);
    assert.equal(auditEntries('settings.changed').length, 0);
  });

  test('the dismissal code limits come from the settings', async () => {
    await settingsCall('PATCH', tokens.admin, { dismissal: { maxCodesPerDay: 1, requestCooldownSeconds: 30 } });
    const fetcher = (await api.call('POST', '/parent/fetchers', {
      token: tokens.parentA, body: { fullName: 'Maria Santos', relationship: 'Grandmother', studentIds: [ANA] },
    })).body.fetcher.fetcherId;
    const request = () => api.call('POST', '/parent/dismissals', { token: tokens.parentA, body: { studentId: ANA, fetcherId: fetcher } });
    assert.equal((await request()).status, 201);
    const second = await request();
    assert.equal(second.status, 429);
    assert.equal(second.body.error.code, 'dismissal/daily-limit');
    assert.match(second.body.error.message, /limit of 1 codes/);
    api.fake.clear('dismissalRecords');
  });
});

describe('arrival/departure SMS switches', () => {
  test('turned off by the school: no SMS, no SMS record, attendance still recorded', async () => {
    await settingsCall('PATCH', tokens.admin, { sms: { attendanceSmsEnabled: false } });
    const res = await scanAna();
    assert.equal(res.status, 201);
    assert.equal(res.body.scan.outcome, 'time-in');
    assert.equal(res.body.scan.sms.status, 'off');
    assert.equal(sms.sent.length, 0);
    assert.equal(api.fake.all('notifications').length, 0);
    assert.equal(auditEntries('sms.attendance-notification').length, 0);
  });

  test('a parent can turn them off for their own account, and the school can override that', async () => {
    const off = await api.call('PATCH', '/account/preferences', { token: tokens.parentA, body: { attendanceSms: false } });
    assert.equal(off.status, 200);
    assert.equal(off.body.profile.attendanceSms, false);
    const entry = auditEntries('user.sms-preference-changed')[0];
    assert.equal(entry.target.id, 'parentA');
    assert.deepEqual(entry.details, { attendanceSms: false });

    const scan = await scanAna();
    assert.equal(scan.body.scan.sms.status, 'opted-out');
    assert.equal(sms.sent.length, 0);
    assert.equal(api.fake.all('notifications').length, 0);

    // The school no longer allows opting out: the parent's stored choice is ignored...
    await settingsCall('PATCH', tokens.admin, { sms: { allowParentSmsOptOut: false } });
    api.fake.clear('attendance');
    assert.equal((await scanAna()).body.scan.sms.status, 'sent');
    assert.equal(sms.sent.length, 1);
    // ...and turning it off again is refused (turning it back on is still allowed).
    const refused = await api.call('PATCH', '/account/preferences', { token: tokens.parentA, body: { attendanceSms: false } });
    assert.equal(refused.status, 409);
    assert.equal((await api.call('PATCH', '/account/preferences', { token: tokens.parentA, body: { attendanceSms: true } })).status, 200);
  });
});

describe('My Account', () => {
  test('GET /api/account: own profile; SMS options for parents only', async () => {
    const teacher = await api.call('GET', '/account', { token: tokens.teacher });
    assert.equal(teacher.status, 200);
    assert.equal(teacher.body.profile.uid, 'teacher1');
    assert.equal(teacher.body.sms, null);
    const parent = await api.call('GET', '/account', { token: tokens.parentA });
    assert.equal(parent.body.profile.attendanceSms, true);
    assert.deepEqual(parent.body.sms, { attendanceSmsEnabled: true, allowParentSmsOptOut: true });
    assert.equal((await api.call('GET', '/account')).status, 401);
    assert.equal((await api.call('GET', '/account', { token: tokens.parentOff })).status, 403);
  });

  test('preferences: parents only, own account only, known fields only', async () => {
    assert.equal((await api.call('PATCH', '/account/preferences', { token: tokens.teacher, body: { attendanceSms: false } })).status, 403);
    for (const body of [{}, { attendanceSms: 'no' }, { attendanceSms: false, uid: 'someoneElse' }, { mobileNumber: '+639170000000' }]) {
      assert.equal((await api.call('PATCH', '/account/preferences', { token: tokens.parentA, body })).status, 400, JSON.stringify(body));
    }
    assert.equal(api.fake.read('users', 'parentA').attendanceSms, true);
    assert.equal(api.fake.read('users', 'parentA').mobileNumber, '+639171111111', 'parents cannot change their number');
  });

  test('sign out on all devices revokes the caller\'s own sessions and is audited', async () => {
    const res = await api.call('POST', '/account/sign-out-everywhere', { token: tokens.teacher, body: { uid: 'admin1' } });
    assert.equal(res.status, 200);
    assert.deepEqual(revoked, ['teacher1'], 'only the caller, whatever the body says');
    const entry = auditEntries('user.signed-out-everywhere')[0];
    assert.equal(entry.actor.uid, 'teacher1');
    assert.equal(entry.target.id, 'teacher1');
  });
});
