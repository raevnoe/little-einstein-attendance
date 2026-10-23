import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { badgeText, freshUnread, isUnread, itemDate, laterTime, mergeFeed, newestTime, unreadCount } from '../src/lib/notificationFeed.js';

const item = (id, notifiedAt, extra = {}) => ({ id, kind: 'arrival', title: id, notifiedAt, ...extra });
const T1 = '2026-10-24T00:01:00.000Z';
const T2 = '2026-10-24T00:02:00.000Z';
const T3 = '2026-10-24T00:03:00.000Z';

describe('notification bell feed', () => {
  it('merges newer items, newest first, replacing updated ones', () => {
    const current = [item('a', T2), item('b', T1)];
    const merged = mergeFeed(current, [item('c', T3), item('b', T3, { title: 'updated' })]);
    assert.deepEqual(merged.map((i) => i.id), ['c', 'b', 'a']);
    assert.equal(merged.find((i) => i.id === 'b').title, 'updated');
  });

  it('keeps at most the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`n${i}`, `2026-10-24T00:00:${String(i).padStart(2, '0')}.000Z`));
    const merged = mergeFeed([], many, 30);
    assert.equal(merged.length, 30);
    assert.equal(merged[0].id, 'n39');
  });

  it('finds the newest time (null when empty)', () => {
    assert.equal(newestTime([]), null);
    assert.equal(newestTime([item('a', T1), item('b', T3), item('c', T2)]), T3);
  });

  it('counts unread items against the seen marker', () => {
    const items = [item('a', T3), item('b', T2), item('c', T1)];
    assert.equal(unreadCount(items, null), 3);
    assert.equal(unreadCount(items, T2), 1);
    assert.equal(unreadCount(items, T3), 0);
    assert.equal(isUnread(item('x', T2), T2), false);
  });

  it('reports only new or updated, unseen items as fresh (for the sound)', () => {
    const current = [item('a', T1)];
    assert.deepEqual(freshUnread(current, [item('a', T1)], null), []);
    assert.deepEqual(freshUnread(current, [item('b', T2)], null).map((i) => i.id), ['b']);
    assert.deepEqual(freshUnread(current, [item('a', T3)], T1).map((i) => i.id), ['a']);
    assert.deepEqual(freshUnread(current, [item('b', T2)], T2), []);
  });

  it('moves the seen marker only forward', () => {
    assert.equal(laterTime(null, null), null);
    assert.equal(laterTime(T1, null), T1);
    assert.equal(laterTime(null, T2), T2);
    assert.equal(laterTime(T1, T2), T2);
    assert.equal(laterTime(T3, T2), T3);
  });

  it('finds the day an item is about (older performance items only have it in the ID)', () => {
    assert.equal(itemDate({ id: 'x', kind: 'performance', date: '2026-10-24' }), '2026-10-24');
    assert.equal(itemDate({ id: 'performance_K2026-001_2026-10-23', kind: 'performance', date: null }), '2026-10-23');
    assert.equal(itemDate({ id: 'arrival_K2026-001_2026-10-23', kind: 'arrival', date: null }), null);
  });

  it('caps the badge text', () => {
    assert.equal(badgeText(3), '3');
    assert.equal(badgeText(9), '9');
    assert.equal(badgeText(12), '9+');
  });
});
