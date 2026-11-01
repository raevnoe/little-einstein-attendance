import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePath, sectionPath } from '../src/lib/routes.js';
import { resolveTheme } from '../src/lib/theme.js';
import { maskMobileNumber } from '../src/lib/format.js';
import { smsSummary } from '../src/lib/attendanceScan.js';

describe('Settings', () => {
  it('has an address in every dashboard', () => {
    for (const role of ['admin', 'teacher', 'parent']) {
      assert.equal(sectionPath(role, 'settings'), `/${role}-dashboard/settings`);
      assert.deepEqual(parsePath(`/${role}-dashboard/settings`), { page: 'dashboard', role, section: 'settings' });
    }
  });

  it('resolves the colour choice; "Match this device" follows the device', () => {
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
  });

  it('shows a parent only part of their own number', () => {
    assert.equal(maskMobileNumber('+639171234567'), '+63 917 ••• 4567');
    assert.equal(maskMobileNumber(null), null);
    assert.equal(maskMobileNumber('0917 123 4567'), null);
  });

  it('explains SMS that were not sent on purpose without showing an error', () => {
    assert.deepEqual(smsSummary({ event: 'arrival', status: 'off' }).error, false);
    assert.match(smsSummary({ event: 'arrival', status: 'off' }).text, /School Settings/);
    assert.deepEqual(smsSummary({ event: 'departure', status: 'opted-out' }).error, false);
  });
});

describe('late arrivals (display)', () => {
  it('writes minutes late in words', async () => {
    const { earlyText, lateText } = await import('../src/lib/format.js');
    assert.equal(earlyText(30), 'Picked up 30 min early');
    assert.equal(earlyText(90), 'Picked up 1 hour 30 min early');
    assert.equal(lateText(22), '22 min late');
    assert.equal(lateText(60), '1 hour late');
    assert.equal(lateText(75), '1 hour 15 min late');
    assert.equal(lateText(130), '2 hours 10 min late');
    assert.equal(lateText(0), 'Late');
    assert.equal(lateText(null), 'Late');
  });

  it('formats a start time for people', async () => {
    const { formatTimeOfDay } = await import('@led/shared');
    assert.equal(formatTimeOfDay('08:00'), '8:00 AM');
    assert.equal(formatTimeOfDay('13:30'), '1:30 PM');
    assert.equal(formatTimeOfDay('00:05'), '12:05 AM');
  });
});

describe('password setup page', () => {
  it('has its own address, whether or not someone is signed in', async () => {
    const { parsePath } = await import('../src/lib/routes.js');
    assert.deepEqual(parsePath('/set-password'), { page: 'set-password' });
  });
});
