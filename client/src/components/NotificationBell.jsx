import { useEffect, useId, useRef, useState } from 'react';
import { NOTIFICATION_KINDS as KIND } from '@led/shared';
import { badgeText, isUnread } from '../lib/notificationFeed.js';
import { FOCUS_RING, buttonClass } from './ui/classes.js';
import {
  AlertIcon, AttendanceIcon, BellIcon, DismissalIcon, LockIcon, PhoneIcon, RfidCardIcon, StarIcon,
} from './ui/icons.jsx';

const KIND_ICONS = {
  [KIND.ARRIVAL]: AttendanceIcon,
  [KIND.DEPARTURE]: AttendanceIcon,
  [KIND.DISMISSAL_CODE_SENT]: DismissalIcon,
  [KIND.DISMISSAL_SMS_FAILED]: AlertIcon,
  [KIND.DISMISSAL_RELEASED]: DismissalIcon,
  [KIND.DISMISSAL_REQUEST]: DismissalIcon,
  [KIND.DISMISSAL_LOCKED]: LockIcon,
  [KIND.PERFORMANCE]: StarIcon,
  [KIND.RFID_SCAN_REJECTED]: RfidCardIcon,
  [KIND.SMS_PROBLEMS]: PhoneIcon,
};
const WARNING_KINDS = new Set([KIND.DISMISSAL_SMS_FAILED, KIND.DISMISSAL_LOCKED, KIND.RFID_SCAN_REJECTED, KIND.SMS_PROBLEMS]);

// Panel position: under the header button (phones: full width below the header), or beside the
// sidebar logo (desktop sidebar layout).
const PANEL_PLACEMENT = {
  header: 'fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96',
  sidebar: 'absolute left-0 top-full mt-2 w-96',
};

function whenText(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

/**
 * The notification bell and its list. `feed` comes from useNotifications() (one instance in
 * AppShell, shared by the header and sidebar bells, so there is one check and one sound).
 * Opening the list marks everything shown as seen; items that were unread stay highlighted while
 * it is open. Selecting an item opens its section when the account has that section.
 */
export default function NotificationBell({ feed, nav = [], onNavigate, placement = 'header', className = '' }) {
  const [open, setOpen] = useState(false);
  const [highlightAfter, setHighlightAfter] = useState(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const panelId = useId();
  const sections = new Set(nav.map((item) => item.key));

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setHighlightAfter({ seenAt: feed.seenAt });
    setOpen(true);
    feed.markAllSeen();
  }

  function select(item) {
    setOpen(false);
    // The item goes along so a screen can open the exact place (e.g. a child's performance day).
    if (item.link && sections.has(item.link)) onNavigate?.(item.link, item);
  }

  const label = feed.unread > 0 ? `Notifications, ${feed.unread} unread` : 'Notifications';

  return (
    <div ref={containerRef} className={`relative print:hidden ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        className={buttonClass({ variant: 'secondary', size: 'icon', className: 'relative' })}
      >
        <BellIcon className="h-5 w-5" />
        {feed.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-paper"
          >
            {badgeText(feed.unread)}
          </span>
        )}
      </button>

      {/* New items are announced to screen readers even while the list is closed. */}
      <p className="sr-only" aria-live="polite">{feed.announcement}</p>

      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className={`${PANEL_PLACEMENT[placement]} z-50 overflow-hidden rounded-2xl bg-paper text-left shadow-lg ring-1 ring-brand-100`}
        >
          <h2 className="border-b border-brand-100 px-4 py-3 text-base font-semibold text-brand-900">Notifications</h2>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
            {feed.status === 'loading' && feed.items.length === 0 && (
              <p className="px-4 py-6 text-sm text-brand-500">Loading notifications…</p>
            )}
            {feed.status === 'error' && (
              <div className="space-y-3 px-4 py-6 text-sm text-brand-700">
                <p>Notifications could not be loaded.</p>
                <button type="button" onClick={feed.retry} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Try again</button>
              </div>
            )}
            {feed.status === 'ready' && feed.items.length === 0 && (
              <p className="px-4 py-6 text-sm text-brand-500">No notifications yet.</p>
            )}
            {feed.items.length > 0 && (
              <ul className="divide-y divide-brand-50">
                {feed.items.map((item) => {
                  const Icon = KIND_ICONS[item.kind] ?? BellIcon;
                  const unread = highlightAfter && isUnread(item, highlightAfter.seenAt);
                  const warning = WARNING_KINDS.has(item.kind);
                  const content = (
                    <>
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          warning ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-600 dark:text-brand-300'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm text-brand-900 ${unread ? 'font-bold' : 'font-semibold'}`}>
                          {unread && <span className="sr-only">New: </span>}
                          {item.title}
                        </span>
                        {item.body && <span className="mt-0.5 block text-sm text-brand-700">{item.body}</span>}
                        <span className="mt-1 block text-xs text-brand-500">{whenText(item.notifiedAt)}</span>
                      </span>
                      {unread && <span aria-hidden="true" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />}
                    </>
                  );
                  const rowClass = `flex w-full gap-3 px-4 py-3 text-left ${unread ? 'bg-sky-50/60' : ''}`;
                  return (
                    <li key={item.id}>
                      {item.link && sections.has(item.link) ? (
                        <button type="button" onClick={() => select(item)} className={`${rowClass} hover:bg-canvas ${FOCUS_RING}`}>
                          {content}
                        </button>
                      ) : (
                        <div className={rowClass}>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
