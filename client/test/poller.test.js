import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPoller } from '../src/lib/poller.js';

function fakeTimers() {
  const intervals = new Map();
  let next = 1;
  return {
    setInterval: (fn, ms) => { intervals.set(next, { fn, ms }); return next++; },
    clearInterval: (id) => intervals.delete(id),
    intervals,
    fire: async () => { for (const { fn } of intervals.values()) await fn(); },
  };
}

describe('createPoller', () => {
  it('refreshes on every interval tick while active', async () => {
    const timers = fakeTimers();
    let runs = 0;
    const poller = createPoller({ intervalMs: 15_000, run: async () => { runs += 1; }, timers });
    poller.start();
    assert.equal([...timers.intervals.values()][0].ms, 15_000);
    await timers.fire();
    await timers.fire();
    assert.equal(runs, 2);
  });

  it('skips refreshes while paused (hidden tab / offline) - no Firestore reads', async () => {
    const timers = fakeTimers();
    let paused = true;
    let runs = 0;
    const poller = createPoller({ intervalMs: 1000, run: async () => { runs += 1; }, isPaused: () => paused, timers });
    poller.start();
    await timers.fire();
    assert.equal(runs, 0);
    paused = false;
    await timers.fire();
    assert.equal(runs, 1);
  });

  it('never runs two refreshes at the same time', async () => {
    let release;
    let runs = 0;
    const poller = createPoller({ intervalMs: 1000, run: () => { runs += 1; return new Promise((r) => { release = r; }); }, timers: fakeTimers() });
    const first = poller.tick();
    assert.equal(await poller.tick(), false, 'second tick skipped while the first is in flight');
    release();
    await first;
    assert.equal(runs, 1);
  });

  it('a failed refresh is swallowed and the next one still runs', async () => {
    let runs = 0;
    const poller = createPoller({ intervalMs: 1000, run: async () => { runs += 1; if (runs === 1) throw new Error('network'); }, timers: fakeTimers() });
    assert.equal(await poller.tick(), true);
    assert.equal(await poller.tick(), true);
    assert.equal(runs, 2);
  });

  it('resume() refreshes at once only when the data is at least one interval old', async () => {
    let time = 0;
    let runs = 0;
    const poller = createPoller({ intervalMs: 60_000, run: async () => { runs += 1; }, now: () => time, timers: fakeTimers() });
    time = 30_000;
    assert.equal(await poller.resume(), false);
    time = 60_000;
    assert.equal(await poller.resume(), true);
    assert.equal(runs, 1);
  });

  it('stop() clears the timer', () => {
    const timers = fakeTimers();
    const poller = createPoller({ intervalMs: 1000, run: async () => {}, timers });
    poller.start();
    poller.start();
    assert.equal(timers.intervals.size, 1, 'start() is idempotent');
    poller.stop();
    assert.equal(timers.intervals.size, 0);
  });
});
