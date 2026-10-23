// Phase 12: registers dist/sw.js and tracks whether a NEW version is waiting.
// A waiting version is only activated when the user presses "Reload" on the update banner
// (applyUpdate). The page is never reloaded automatically, so no half-filled form is lost.
// No Vite/Firebase imports: main.jsx passes `enabled` (production builds only) and
// client/test/serviceWorkerRegistration.test.js drives it with a fake navigator.serviceWorker.

export function createServiceWorkerUpdates({ container, reload, onError = () => {} }) {
  let waitingWorker = null;
  let reloading = false;
  const listeners = new Set();

  function setWaiting(worker) {
    waitingWorker = worker;
    for (const listener of listeners) listener();
  }

  function watchRegistration(registration) {
    // Only an UPDATE waits: on the very first install there is no controlling worker yet.
    if (registration.waiting && container.controller) setWaiting(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && container.controller) setWaiting(worker);
      });
    });
  }

  return {
    async register(scriptUrl, scope) {
      try {
        const registration = await container.register(scriptUrl, { scope, updateViaCache: 'none' });
        watchRegistration(registration);
        return registration;
      } catch (error) {
        onError(error);
        return null;
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isUpdateReady: () => waitingWorker !== null,
    /** User chose "Reload": activate the waiting version, then reload once it controls the page. */
    applyUpdate() {
      if (!waitingWorker) return false;
      container.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        reload();
      });
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      return true;
    },
  };
}

const noUpdates = {
  subscribe: () => () => {},
  isUpdateReady: () => false,
  applyUpdate: () => false,
};

export let serviceWorkerUpdates = noUpdates;

/** Called once from main.jsx. Does nothing in the dev server or without service-worker support. */
export function registerServiceWorker({ enabled, baseUrl = '/' }) {
  const container = globalThis.navigator?.serviceWorker;
  if (!enabled || !container) return;

  const updates = createServiceWorkerUpdates({
    container,
    reload: () => window.location.reload(),
    onError: () => console.warn('Service worker registration failed; the app still works online.'),
  });
  serviceWorkerUpdates = updates;

  window.addEventListener('load', async () => {
    const registration = await updates.register(`${baseUrl}sw.js`, baseUrl);
    // Check for a new version whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    });
  });
}
