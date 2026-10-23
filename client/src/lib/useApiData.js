import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './apiClient.js';
import { browserIsIdle, createPoller } from './poller.js';
import { dataSignature, soundIfChanged } from './refreshSound.js';

/**
 * GET `path` through the API client. Returns { loading, data, error, reload, refresh, updatedAt }.
 * A response is only used while `path` is still the requested one (no stale results).
 *
 * `refreshMs` (optional): refresh in the background every refreshMs while the tab is visible and
 * online (see poller.js). Background refreshes keep the current data on screen (no loading state,
 * so open forms are not reset) and a failed background refresh keeps the last data.
 *
 * `reload()` loads again silently (e.g. after the user's own change). `refresh()` is for Refresh
 * buttons: the same, plus the "update" sound when the new data differs from what was shown.
 */
export function useApiData(path, { refreshMs = 0 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: null, updatedAt: null });
  const key = `${attempt}:${path}`;
  // Snapshot taken when a Refresh button was pressed, compared once the new data arrives.
  const compareRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest(path)
      .then((data) => {
        if (cancelled) return;
        soundIfChanged(compareRef.current, data);
        compareRef.current = null;
        setState({ key, data, error: null, updatedAt: Date.now() });
      })
      .catch((error) => !cancelled && setState({ key, data: null, error: error.message, updatedAt: null }));
    return () => {
      cancelled = true;
    };
  }, [key, path]);

  const loaded = state.key === key && state.data !== null;

  useEffect(() => {
    if (!refreshMs || !loaded) return undefined;
    let cancelled = false;
    const poller = createPoller({
      intervalMs: refreshMs,
      isPaused: browserIsIdle,
      run: async () => {
        const data = await apiRequest(path);
        if (!cancelled) setState((s) => (s.key === key ? { ...s, data, error: null, updatedAt: Date.now() } : s));
      },
    });
    const resume = () => { if (!browserIsIdle()) poller.resume(); };
    poller.start();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      cancelled = true;
      poller.stop();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [refreshMs, loaded, key, path]);

  const reload = useCallback(() => {
    compareRef.current = null;
    setAttempt((n) => n + 1);
  }, []);
  const shownData = state.data;
  const refresh = useCallback(() => {
    compareRef.current = dataSignature(shownData);
    setAttempt((n) => n + 1);
  }, [shownData]);
  const loading = state.key !== key;
  return {
    loading,
    data: loading ? null : state.data,
    error: loading ? null : state.error,
    updatedAt: loading ? null : state.updatedAt,
    reload,
    refresh,
  };
}
