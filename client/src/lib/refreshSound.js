import { playSound } from './sounds.js';

// Sound for a Refresh BUTTON (never for automatic refreshes or the first load): it plays only when
// the refreshed data differs from what was on screen when the button was pressed.

/** A comparable snapshot of API data (null when there is nothing to compare yet). */
export function dataSignature(data) {
  if (data === null || data === undefined) return null;
  try {
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/** True when `data` differs from the snapshot taken before the refresh. */
export function changedSince(beforeSignature, data) {
  if (beforeSignature === null || beforeSignature === undefined) return false;
  const after = dataSignature(data);
  return after !== null && after !== beforeSignature;
}

// A screen may play its own, more specific sound for the same data once it renders (the Dismissal
// page's new-request alert, a parent's arrival chime). The update sound waits briefly and is skipped
// if such a sound played meanwhile, so only one sound is heard.
const SPECIFIC_SOUND_WINDOW_MS = 300;

/** Plays the "update" sound when the refresh brought new data. */
export function soundIfChanged(beforeSignature, data) {
  if (!changedSince(beforeSignature, data)) return;
  setTimeout(() => playSound('update', { skipIfRecentMs: SPECIFIC_SOUND_WINDOW_MS + 100 }), SPECIFIC_SOUND_WINDOW_MS);
}
