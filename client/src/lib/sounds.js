// Short notification sounds made with the Web Audio API (no audio files, no packages).
//
// Browsers only allow sound after the person has interacted with the page, so the audio is
// "unlocked" on the first click/tap/key press (signing in counts; so does a reader scan, which
// arrives as key presses). The on/off choice is a per-device convenience kept in localStorage;
// sound is never required: every event is also shown on screen.

const STORAGE_KEY = 'led.sound';

// [frequency Hz, start s, duration s] per note. Rising = good news, falling/low = needs attention.
// Gains were doubled (about +6 dB) after browser testing found the tones too quiet; the limiter
// in output() keeps overlapping notes from distorting. The square-wave error tone stays lower
// because it already sounds louder than a sine at the same gain.
const SOUNDS = {
  success: { wave: 'sine', gain: 0.38, notes: [[880, 0, 0.14], [1318, 0.1, 0.24]] },
  error: { wave: 'square', gain: 0.12, notes: [[220, 0, 0.18], [175, 0.22, 0.3]] },
  arrival: { wave: 'sine', gain: 0.38, notes: [[659, 0, 0.18], [880, 0.15, 0.18], [1175, 0.3, 0.34]] },
  departure: { wave: 'sine', gain: 0.38, notes: [[1175, 0, 0.18], [880, 0.15, 0.18], [659, 0.3, 0.34]] },
  alert: { wave: 'triangle', gain: 0.45, notes: [[988, 0, 0.14], [988, 0.18, 0.14], [1319, 0.36, 0.38]] },
  // Signed in: a short rising arpeggio (C-E-G-C).
  welcome: { wave: 'sine', gain: 0.34, notes: [[523, 0, 0.16], [659, 0.12, 0.16], [784, 0.24, 0.16], [1047, 0.36, 0.4]] },
  // A Refresh button brought new data: two soft notes, quieter than success.
  update: { wave: 'sine', gain: 0.3, notes: [[784, 0, 0.12], [1047, 0.1, 0.22]] },
  // New item under the notification bell: a bell-like ding-ding.
  notify: { wave: 'triangle', gain: 0.42, notes: [[1319, 0, 0.22], [1760, 0.14, 0.42]] },
};

// Two sounds for the same moment (e.g. the Dismissal page alert and the bell) would overlap;
// playSound(name, { skipIfRecentMs }) stays silent when another sound started that recently.
let lastPlayedAt = 0;

let context = null;
let master = null;
const listeners = new Set();

function audioContext() {
  if (context) return context;
  const AudioCtx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    context = new AudioCtx();
  } catch {
    return null;
  }
  return context;
}

/** Shared output: a soft limiter in front of the speakers (falls back to the speakers directly). */
function output(ctx) {
  if (master) return master;
  try {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    limiter.connect(ctx.destination);
    master = limiter;
  } catch {
    master = ctx.destination;
  }
  return master;
}

export function isSoundEnabled() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Private mode / blocked storage: the choice just lasts until the page is reloaded.
  }
  for (const listener of listeners) listener(enabled);
}

/** Calls `listener(enabled)` when the setting changes (e.g. another toggle on the page). */
export function subscribeSound(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Resumes the audio context. Must run during a user gesture the first time. */
export function unlockAudio() {
  const ctx = audioContext();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

let unlockInstalled = false;
/** Unlocks audio on the first click, tap or key press anywhere on the page (installed once). */
export function installAudioUnlock() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  const unlock = () => unlockAudio();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/**
 * Plays one of: success | error | arrival | departure | alert | welcome | update | notify.
 * Silent when sound is off or unavailable, or (with skipIfRecentMs) when another sound just played.
 */
export function playSound(name, { force = false, skipIfRecentMs = 0 } = {}) {
  const sound = SOUNDS[name];
  if (!sound || (!force && !isSoundEnabled())) return;
  if (skipIfRecentMs && Date.now() - lastPlayedAt < skipIfRecentMs) return;
  const ctx = audioContext();
  if (!ctx) return;
  lastPlayedAt = Date.now();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.02;
  const destination = output(ctx);
  for (const [frequency, offset, duration] of sound.notes) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = sound.wave;
    oscillator.frequency.value = frequency;
    // Soft attack and fade-out, so it chimes instead of clicking.
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(sound.gain, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + duration + 0.05);
  }
}
