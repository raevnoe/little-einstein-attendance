import { useCallback, useEffect, useState } from 'react';

/**
 * Exposes the browser's real PWA install prompt (`beforeinstallprompt`).
 * `canInstall` is only true when the browser has offered installation, so the UI never
 * shows an install button that cannot work (e.g. before the manifest/service worker exist,
 * on unsupported browsers, or once the app is installed).
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      event.preventDefault(); // Show our own button instead of the browser's mini-infobar.
      setPromptEvent(event);
    }
    function handleInstalled() {
      setPromptEvent(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null); // A prompt event can only be used once.
  }, [promptEvent]);

  return { canInstall: Boolean(promptEvent), promptInstall };
}
