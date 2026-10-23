import { useSyncExternalStore } from 'react';

// A minimal router on the browser's History API (no package needed: every dashboard is one level
// deep). navigate() changes the address without reloading; Back/Forward (popstate) are followed.
// Screens read the address with usePathname() and work out what to show from it (routes.js).

const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener) {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

const currentPath = () => window.location.pathname;

/** The current address path, e.g. "/teacher-dashboard/reports". Re-renders when it changes. */
export function usePathname() {
  return useSyncExternalStore(subscribe, currentPath, () => '/');
}

/**
 * Goes to `path`. `replace` corrects the address without adding a Back step (redirects).
 * The query string and hash are dropped (addresses carry sections only).
 */
export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname && !window.location.search && !window.location.hash) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  notify();
}

// A dashboard address opened while signed out: shown again after signing in (this tab only).
let returnTo = null;
export const rememberReturnTo = (path) => { returnTo = path; };
export const takeReturnTo = () => returnTo;
export const clearReturnTo = () => { returnTo = null; };

// Set while the user signs out on purpose, so the app goes to the landing page instead of
// treating the dashboard address as "open this after signing in".
let signingOut = false;
export const beginSignOut = () => { signingOut = true; };
export const isSigningOut = () => signingOut;
export const finishSignOut = () => {
  const was = signingOut;
  signingOut = false;
  return was;
};
