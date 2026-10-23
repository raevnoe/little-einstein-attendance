import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { changedSince, dataSignature } from '../src/lib/refreshSound.js';

describe('Refresh button sound', () => {
  const before = { summary: { checkedIn: 3 }, records: [{ studentId: 'K2026-001', timeIn: '07:42' }] };

  it('reports a change when the refreshed data differs', () => {
    const after = { summary: { checkedIn: 4 }, records: [...before.records, { studentId: 'K2026-002', timeIn: '07:50' }] };
    assert.equal(changedSince(dataSignature(before), after), true);
  });

  it('stays silent when nothing changed', () => {
    assert.equal(changedSince(dataSignature(before), structuredClone(before)), false);
  });

  it('stays silent without a snapshot (first load, automatic refresh, reload after own change)', () => {
    assert.equal(changedSince(null, before), false);
    assert.equal(changedSince(undefined, before), false);
  });

  it('stays silent when there was no data on screen or the refresh returned nothing', () => {
    assert.equal(dataSignature(null), null);
    assert.equal(changedSince(dataSignature(before), null), false);
  });
});
