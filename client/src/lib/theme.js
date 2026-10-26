// Appearance: light or dark colours (index.css redefines the colour tokens for
// <html data-theme="dark">). The choice is per device, kept in localStorage like the sound setting:
//   'light' (default: the app is light unless someone chooses otherwise), 'dark', or 'system'
//   ("Match this device" in Settings) which follows the device's light/dark setting.
// index.html applies the stored choice before the app loads, so a dark page never flashes white.
import { THEME_CHOICES } from '@led/shared';

const STORAGE_KEY = 'led.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
// Browser/PWA title bar colour per theme (light = the logo navy, as in manifest.webmanifest).
const THEME_COLORS = { light: '#2e3192', dark: '#0d1024' };

const listeners = new Set();

export function getThemeChoice() {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return THEME_CHOICES.includes(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

const systemPrefersDark = () => globalThis.matchMedia?.(DARK_QUERY).matches === true;

/** 'light' | 'dark' for a choice ('system' asks the device). */
export function resolveTheme(choice, prefersDark = systemPrefersDark()) {
  if (choice === 'dark' || choice === 'light') return choice;
  return prefersDark ? 'dark' : 'light';
}

function apply() {
  const doc = globalThis.document;
  if (!doc) return;
  const theme = resolveTheme(getThemeChoice());
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export function setThemeChoice(choice) {
  if (!THEME_CHOICES.includes(choice)) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private window): the choice still applies until the page is closed.
  }
  apply();
  for (const listener of listeners) listener(choice);
}

/** Calls `listener(choice)` after every change; returns the unsubscribe function. */
export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Applies the stored choice and follows the device while the choice is 'system'. Call once. */
export function installTheme() {
  apply();
  globalThis.matchMedia?.(DARK_QUERY).addEventListener?.('change', apply);
}
