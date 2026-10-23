// Background refresh timer for "live" screens (polling: the screen asks the API again every few
// seconds). Push connections are not possible on the serverless API, and the browser must never read
// Firestore directly (CLAUDE.md section 5), so polling is the safe way to keep a screen current.
//
// Every refresh costs Firestore reads (free plan: 50,000 a day), so a refresh is SKIPPED while the
// tab is hidden or the device is offline, and never overlaps a refresh that is still running.
// When the tab becomes visible again (or the device comes back online), resume() refreshes at once
// if the data is older than one interval. Framework-free so it can be tested without a browser.

/**
 * Returns { start(), stop(), resume(), tick() }. `run` is an async function that refreshes the data;
 * `isPaused()` returns true while refreshing should be skipped.
 */
export function createPoller({ intervalMs, run, isPaused = () => false, now = () => Date.now(), timers = globalThis }) {
  let timer = null;
  let inFlight = false;
  let lastRunAt = now();

  async function tick() {
    if (inFlight || isPaused()) return false;
    inFlight = true;
    try {
      await run();
    } catch {
      // Keep showing the last data; the next tick simply tries again.
    } finally {
      lastRunAt = now();
      inFlight = false;
    }
    return true;
  }

  return {
    tick,
    start() {
      if (timer === null) timer = timers.setInterval(tick, intervalMs);
    },
    stop() {
      if (timer !== null) timers.clearInterval(timer);
      timer = null;
    },
    /** Tab visible again / back online: refresh now only if the data is already one interval old. */
    resume() {
      if (now() - lastRunAt >= intervalMs) return tick();
      return Promise.resolve(false);
    },
  };
}

/** Default pause rule in the browser: hidden tab or offline device. */
export function browserIsIdle() {
  return globalThis.document?.hidden === true || globalThis.navigator?.onLine === false;
}
