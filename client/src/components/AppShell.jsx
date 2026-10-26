import { useEffect, useRef, useState } from 'react';
import { ROLES } from '@led/shared';
import { useAuth } from '../auth/useAuth.js';
import { useNotifications } from '../lib/useNotifications.js';
import NotificationBell from './NotificationBell.jsx';
import SignOutButton from './SignOutButton.jsx';
import SoundToggle from './SoundToggle.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import SchoolMark from './landing/SchoolMark.jsx';
import BrandStripe from './ui/BrandStripe.jsx';
import { Squiggle } from './ui/Decor.jsx';
import Badge from './ui/Badge.jsx';
import { FOCUS_RING } from './ui/classes.js';
import { MoreIcon } from './ui/icons.jsx';

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || '?';
}

function UserSummary({ account, className = '' }) {
  const name = account.profile.displayName;
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100">
        {initials(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-brand-900">
          <span className="sr-only">Signed in as </span>
          {name}
        </p>
        <Badge tone="success" className="mt-0.5 capitalize">{account.user.role}</Badge>
      </div>
    </div>
  );
}

/** Vertical section list for the desktop sidebar. */
function SidebarNav({ nav, activeKey, onNavigate }) {
  return (
    <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="space-y-1">
        {nav.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium motion-safe:transition-colors ${FOCUS_RING} ${
                  active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-brand-700/80 hover:bg-canvas hover:text-brand-900'
                }`}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand-600" />}
                {Icon && <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-brand-500'}`} />}
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Horizontal, scrollable pill row for tablets and phones (and for the parent layout everywhere). */
function PillNav({ nav, activeKey, onNavigate, className = '' }) {
  return (
    <nav aria-label="Sections" className={className}>
      <ul className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6">
        {nav.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key} className="shrink-0">
              <button
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold motion-safe:transition-colors ${FOCUS_RING} ${
                  active ? 'bg-brand-600 text-white shadow-sm' : 'bg-paper text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50'
                }`}
              >
                {Icon && <Icon className="h-4.5 w-4.5 shrink-0" />}
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Phones: the first nav items get their own slot in the bottom bar; the rest go under "More".
const BOTTOM_NAV_SLOTS = 4;
// One equal column per slot (full class names so Tailwind generates them): parent 2, admin/teacher 5.
const BOTTOM_NAV_COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };

// How often the bell checks for new items (each check is usually one Firestore read). Staff are
// checked more often so a waiting Fetcher is noticed on any screen.
const NOTIFICATION_REFRESH_MS = { staff: 30_000, parent: 60_000 };

/**
 * Fixed bottom bar for phones (below 640px), every signed-in layout. Same nav items and the same
 * onNavigate as the sidebar and pill row; only one of them is displayed at any width.
 * "More" is a disclosure button: its list opens above the bar and closes on selection, Escape,
 * or a tap outside.
 */
function BottomNav({ nav, activeKey, onNavigate }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const containerRef = useRef(null);
  const moreButtonRef = useRef(null);
  const primary = nav.slice(0, BOTTOM_NAV_SLOTS);
  const more = nav.slice(BOTTOM_NAV_SLOTS);
  const moreActive = more.some((item) => item.key === activeKey);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [moreOpen]);

  const go = (key) => {
    setMoreOpen(false);
    onNavigate(key);
  };

  const slotClass = (active) =>
    `flex min-h-16 w-full flex-col items-center justify-center gap-1 px-0.5 text-[11px] font-semibold leading-tight motion-safe:transition-colors ${FOCUS_RING} ${
      active ? 'text-brand-700' : 'text-brand-500 hover:text-brand-700'
    }`;
  const iconWrapClass = (active) =>
    `flex h-7 w-12 items-center justify-center rounded-full ${active ? 'bg-brand-600 text-white' : ''}`;

  return (
    <nav
      ref={containerRef}
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-100 bg-paper pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(46,49,146,0.06)] sm:hidden print:hidden"
    >
      {more.length > 0 && moreOpen && (
        <ul
          id="bottom-nav-more"
          className="absolute bottom-full right-2 mb-2 w-56 rounded-2xl bg-paper p-1.5 shadow-lg ring-1 ring-brand-100"
        >
          {more.map((item) => {
            const active = item.key === activeKey;
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => go(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium ${FOCUS_RING} ${
                    active ? 'bg-brand-50 font-semibold text-brand-700' : 'text-brand-700/80 hover:bg-canvas hover:text-brand-900'
                  }`}
                >
                  {Icon && <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-brand-600 dark:text-brand-300' : 'text-brand-500'}`} />}
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ul className={`grid ${BOTTOM_NAV_COLUMNS[primary.length + (more.length > 0 ? 1 : 0)]}`}>
        {primary.map((item) => {
          const active = item.key === activeKey;
          const Icon = item.icon;
          return (
            <li key={item.key} className="min-w-0">
              <button type="button" onClick={() => go(item.key)} aria-current={active ? 'page' : undefined} className={slotClass(active)}>
                <span aria-hidden="true" className={iconWrapClass(active)}>{Icon && <Icon className="h-5 w-5" />}</span>
                {item.label}
              </button>
            </li>
          );
        })}
        {more.length > 0 && (
          <li className="min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-controls="bottom-nav-more"
              className={slotClass(moreActive || moreOpen)}
            >
              <span aria-hidden="true" className={iconWrapClass(moreActive)}>
                <MoreIcon className="h-5 w-5" />
              </span>
              More
              {/* The visible "More" stays short; screen readers also hear which section is open. */}
              {moreActive && <span className="sr-only">, current section: {more.find((item) => item.key === activeKey)?.label}</span>}
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/**
 * Layout for signed-in pages.
 *   layout="sidebar" (admin, teacher): left sidebar from 1024px; compact header + pill row from
 *   640px; fixed bottom bar (BottomNav) on phones.
 *   layout="top" (parent): header + pill row from 640px; fixed bottom bar (BottomNav) on phones.
 * `nav` = [{ key, label, icon }]; the page owns the current section in its own state
 * (no router yet - see CLAUDE.md "Routing"). Navigation, header and sidebar are hidden when printing.
 */
export default function AppShell({ title, nav, activeKey, onNavigate, layout = 'top', children }) {
  const { account } = useAuth();
  const sidebar = layout === 'sidebar' && nav;
  // One feed for both bells (header and sidebar): one check and one sound.
  const notifications = useNotifications({
    refreshMs: account.user.role === ROLES.PARENT ? NOTIFICATION_REFRESH_MS.parent : NOTIFICATION_REFRESH_MS.staff,
  });

  return (
    <div className={`min-h-screen bg-paper text-brand-900 ${sidebar ? 'lg:flex' : ''}`}>
      {sidebar && (
        <aside className="hidden border-r border-brand-100 bg-paper print:hidden lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col">
          <BrandStripe />
          <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-5">
            <SchoolMark logoClassName="h-12 w-auto" />
            <NotificationBell feed={notifications} nav={nav} onNavigate={onNavigate} placement="sidebar" className="shrink-0" />
          </div>
          <SidebarNav nav={nav} activeKey={activeKey} onNavigate={onNavigate} />
          <div className="space-y-3 border-t border-brand-100 p-4">
            <UserSummary account={account} />
            <div className="grid grid-cols-2 gap-2">
              <SoundToggle className="w-full px-2" />
              <ThemeToggle className="w-full px-2" />
            </div>
            <SignOutButton className="w-full" />
          </div>
        </aside>
      )}

      <div className="min-w-0 flex-1">
        {/* relative on phones too: z-30 only applies to a positioned element, and backdrop-blur makes the
            header its own layer, so without it page content (e.g. the hero banner) covers the bell panel. */}
        <header className={`relative z-30 border-b border-brand-100 bg-paper/95 backdrop-blur sm:sticky sm:top-0 print:hidden ${sidebar ? 'lg:hidden' : ''}`}>
          <BrandStripe />
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <SchoolMark compact />
            <div className="flex min-w-0 items-center gap-3">
              <UserSummary account={account} className="hidden text-right sm:flex" />
              <NotificationBell feed={notifications} nav={nav} onNavigate={onNavigate} className="shrink-0" />
              {/* Phones: the sound button moves to the line below so the top row fits 360px screens. */}
              <span className="hidden gap-3 sm:flex"><SoundToggle compact /><ThemeToggle compact /></span>
              <SignOutButton className="shrink-0" />
            </div>
          </div>
          {/* Phones: the signed-in user goes on its own line so nothing is squeezed. */}
          <div className="flex items-center gap-2 border-t border-brand-50 px-4 py-2 sm:hidden">
            <p className="min-w-0 truncate text-sm text-brand-700">
              <span className="sr-only">Signed in as </span>
              <span className="font-semibold text-brand-900">{account.profile.displayName}</span>
            </p>
            <Badge tone="success" className="capitalize">{account.user.role}</Badge>
            <SoundToggle compact className="ml-auto" />
            <ThemeToggle compact />
          </div>
          {nav && (
            <PillNav
              nav={nav}
              activeKey={activeKey}
              onNavigate={onNavigate}
              className="hidden border-t border-brand-50 bg-canvas/60 sm:block"
            />
          )}
        </header>

        {/* Phones: extra bottom padding so the fixed bottom bar never covers the end of the page. */}
        <main
          className={`mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 print:max-w-none print:p-0 ${
            nav ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:pb-8' : ''
          }`}
        >
          {title && (
            <h1 className="font-script text-[2.5rem] leading-none text-brand-700 sm:text-5xl print:hidden">
              {title}
              <Squiggle className="mt-1.5 block h-3 w-20" />
            </h1>
          )}
          <div className={title ? 'mt-5 print:mt-0' : ''}>{children}</div>
        </main>
        {nav && <BottomNav nav={nav} activeKey={activeKey} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
