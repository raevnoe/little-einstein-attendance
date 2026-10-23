import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from './apiClient.js';
import { browserIsIdle, createPoller } from './poller.js';
import { freshUnread, laterTime, mergeFeed, newestTime, unreadCount } from './notificationFeed.js';
import { playSound } from './sounds.js';

// A screen's own sound for the same moment (Dismissal alert, parent arrival chime) wins: the bell
// stays quiet if another sound started this recently.
const SOUND_GAP_MS = 2_000;

async function fetchFeed() {
  const { items, seenAt } = await apiRequest('/notifications');
  return { status: 'ready', items: mergeFeed([], items), seenAt };
}
// A failed full load keeps items already shown; otherwise the bell offers "Try again".
const failed = (s) => (s.status === 'ready' ? s : { ...s, status: 'error' });

/**
 * The signed-in account's notification bell. Loads the latest items once, then every `refreshMs`
 * asks only for items newer than the newest it has (usually nothing, so it is cheap on the
 * Firestore quota). Skipped while the tab is hidden or offline (poller.js). New unread items play
 * the "notify" sound and are announced to screen readers; never on the first load.
 *
 * Returns { status: loading|ready|error, items, seenAt, unread, announcement, markAllSeen, retry }.
 */
export function useNotifications({ refreshMs }) {
  const [state, setState] = useState({ status: 'loading', items: [], seenAt: null });
  const [announcement, setAnnouncement] = useState('');
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const loadAll = useCallback(() => fetchFeed().then(setState, () => setState(failed)), []);

  useEffect(() => {
    let cancelled = false;
    fetchFeed()
      .then((next) => !cancelled && setState(next))
      .catch(() => !cancelled && setState(failed));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const poller = createPoller({
      intervalMs: refreshMs,
      isPaused: browserIsIdle,
      run: async () => {
        const current = stateRef.current;
        if (current.status !== 'ready') return loadAll();
        const after = newestTime(current.items);
        const { items, seenAt } = await apiRequest(after ? `/notifications?${new URLSearchParams({ after })}` : '/notifications');
        const fresh = freshUnread(current.items, items, seenAt);
        setState((s) => ({ ...s, items: mergeFeed(s.items, items), seenAt: laterTime(seenAt, s.seenAt) }));
        if (fresh.length > 0) {
          playSound('notify', { skipIfRecentMs: SOUND_GAP_MS });
          setAnnouncement(fresh.length === 1 ? `New notification: ${fresh[0].title}` : `${fresh.length} new notifications.`);
        }
        return undefined;
      },
    });
    const resume = () => { if (!browserIsIdle()) poller.resume(); };
    poller.start();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      poller.stop();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [refreshMs, loadAll]);

  /** Marks everything shown so far as seen (an item that arrives meanwhile stays unread). */
  const markAllSeen = useCallback(async () => {
    const { items, seenAt } = stateRef.current;
    const upTo = newestTime(items);
    if (!upTo || unreadCount(items, seenAt) === 0) return;
    setState((s) => ({ ...s, seenAt: upTo }));
    try {
      const result = await apiRequest('/notifications/seen', { method: 'POST', body: { upTo } });
      setState((s) => ({ ...s, seenAt: result.seenAt }));
    } catch {
      // Offline or server problem: the badge stays cleared on this screen; after a reload the
      // server's older marker applies again (those items show as unread once more).
    }
  }, []);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }));
    loadAll();
  }, [loadAll]);

  return { ...state, unread: unreadCount(state.items, state.seenAt), announcement, markAllSeen, retry };
}
