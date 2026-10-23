import { useSyncExternalStore } from 'react';
import { useOnlineStatus } from '../lib/useOnlineStatus.js';
import { serviceWorkerUpdates } from '../lib/serviceWorkerRegistration.js';
import { buttonClass } from './ui/classes.js';
import { RefreshIcon, WifiOffIcon } from './ui/icons.jsx';

/**
 * Shown on every screen (Phase 12). Nothing is rendered while online with no update waiting.
 *   Offline: live actions are unavailable (they are blocked, never queued).
 *   Update:  a new app version is ready; it is applied only when the user presses Reload.
 */
export default function ConnectionStatus() {
  const online = useOnlineStatus();
  const updateReady = useSyncExternalStore(serviceWorkerUpdates.subscribe, serviceWorkerUpdates.isUpdateReady, () => false);

  if (online && !updateReady) return null;

  return (
    <div className="print:hidden">
      {!online && (
        <div role="status" className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-900">
          <WifiOffIcon className="hidden h-5 w-5 shrink-0 sm:block" />
          <span>
            You’re offline. Attendance, evaluations, dismissal and other live actions are unavailable until the
            connection returns.
          </span>
        </div>
      )}
      {updateReady && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-3 border-b border-brand-100 bg-brand-50 px-4 py-2 text-sm text-brand-900">
          <span className="font-medium">A new version is available.</span>
          <button type="button" onClick={() => serviceWorkerUpdates.applyUpdate()} className={buttonClass({ size: 'sm' })}>
            <RefreshIcon className="h-4 w-4" />
            Reload
          </button>
        </div>
      )}
    </div>
  );
}
