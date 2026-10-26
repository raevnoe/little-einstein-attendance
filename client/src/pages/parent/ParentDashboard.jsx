import { useEffect, useRef, useState } from 'react';
import { NOTIFICATION_KINDS } from '@led/shared';
import AppShell from '../../components/AppShell.jsx';
import { ErrorMessage } from '../../components/Panel.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { useApiData } from '../../lib/useApiData.js';
import { playSound } from '../../lib/sounds.js';
import { itemDate } from '../../lib/notificationFeed.js';
import { studentFullName } from '../../lib/format.js';
import { TodayAttendance, AttendanceHistory } from '../../components/attendance/ChildAttendance.jsx';
import ChildPerformance from '../../components/performance/ChildPerformance.jsx';
import ParentDismissal from '../../components/dismissal/ParentDismissal.jsx';
import { SchoolLogo } from '../../components/landing/SchoolMark.jsx';
import { EmptyState, HeroBanner, LoadingState, Sparkle } from '../../components/ui/index.js';
import { DismissalIcon, RecordsIcon, SettingsIcon, StudentsIcon } from '../../components/ui/icons.jsx';
import SettingsPage from '../SettingsPage.jsx';

const NAV = [
  { key: 'records', label: 'Daily Records', icon: RecordsIcon },
  { key: 'dismissal', label: 'Fetchers & Dismissal', icon: DismissalIcon },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

function initials(child) {
  return `${child.firstName?.[0] ?? ''}${child.lastName?.[0] ?? ''}`.toUpperCase();
}

/** Chips for choosing one child (on the navy hero). They wrap instead of scrolling sideways. */
function ChildSelector({ options, selectedId, onSelect }) {
  return (
    <div role="group" aria-label="Choose a child" className="flex flex-wrap gap-2">
      {options.map((child) => {
        const selected = child.studentId === selectedId;
        return (
          <button
            key={child.studentId}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(child.studentId)}
            className={`inline-flex min-h-12 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-left text-sm font-semibold motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600 ${
              selected
                ? 'bg-paper text-brand-700 shadow-sm'
                : 'bg-white/10 text-white ring-1 ring-inset ring-white/40 hover:bg-white/20'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                selected ? 'bg-leaf-100 text-leaf-700' : 'bg-white/15 text-white'
              }`}
            >
              {initials(child)}
            </span>
            {child.firstName}
          </button>
        );
      })}
    </div>
  );
}

/** The school logo on a white disc, for the navy hero (never recoloured or cropped). */
function LogoDisc() {
  return (
    <div className="relative mx-auto hidden h-40 w-40 items-center justify-center rounded-full bg-white shadow-lg ring-8 ring-white/15 lg:flex">
      <SchoolLogo decorative className="h-28 w-auto" />
      <Sparkle className="absolute -left-3 top-3 h-6 w-6 text-sun-400" />
    </div>
  );
}

const PARENT_REFRESH_MS = 60_000;

/**
 * Plays a chime when a background refresh shows that today's time in / time out was just
 * recorded (never on the first load, never for another day or another child).
 */
function useArrivalSound(attendance) {
  const previous = useRef(null);
  useEffect(() => {
    if (!attendance) return;
    const today = attendance.records.find((r) => r.schoolDate === attendance.today);
    const now = { key: `${attendance.studentId}:${attendance.today}`, timeIn: Boolean(today?.timeIn), timeOut: Boolean(today?.timeOut) };
    const before = previous.current;
    if (before && before.key === now.key) {
      if (!before.timeOut && now.timeOut) playSound('departure');
      else if (!before.timeIn && now.timeIn) playSound('arrival');
    }
    previous.current = now;
  }, [attendance]);
}

/**
 * Everything for ONE child: today's attendance first, then history and performance.
 * `focus` (from a notification): { n, target: 'today' | 'performance', date } scrolls to that card;
 * for performance it also opens the evaluation day. `n` changes on every tap, so the same
 * notification can be opened again.
 */
function ChildRecords({ child, focus }) {
  const todayRef = useRef(null);
  const performanceRef = useRef(null);
  const scrollTo = (ref) => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    ref.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  };
  // Today is the first card: scroll at once. Performance waits until its day has loaded, so cards
  // that finish loading above it cannot push it out of view again.
  useEffect(() => {
    if (focus?.target === 'today') scrollTo(todayRef);
  }, [focus]);

  // One request feeds both the Today summary and the history list.
  // Refreshes every minute while visible, so an arrival/departure appears without reloading.
  const attendance = useApiData(`/parent/children/${encodeURIComponent(child.studentId)}/attendance`, { refreshMs: PARENT_REFRESH_MS });
  useArrivalSound(attendance.data?.attendance);
  const view = {
    ...attendance,
    data: attendance.data?.attendance ?? null,
  };

  return (
    <div className="space-y-6">
      {/* scroll-mt: room for the sticky header when scrolled to. */}
      <div ref={todayRef} className="scroll-mt-32">
        <TodayAttendance child={child} attendance={view} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <AttendanceHistory studentId={child.studentId} attendance={view} />
        </div>
        <div ref={performanceRef} className="scroll-mt-32 lg:col-span-3">
          <ChildPerformance
            // A notification for a specific day opens that day (fresh view each time).
            key={focus?.target === 'performance' ? focus.n : 'performance'}
            studentId={child.studentId}
            initialDate={focus?.target === 'performance' ? focus.date ?? '' : ''}
            onLoaded={focus?.target === 'performance' ? () => scrollTo(performanceRef) : undefined}
          />
        </div>
      </div>
    </div>
  );
}

// Shows ONLY the children the server links to this parent (GET /api/parent/children).
// The selected child's Daily Attendance and Student Performance are read-only.
export default function ParentDashboard({ section, onSectionChange }) {
  const { account } = useAuth();
  const { loading, data, error, reload } = useApiData('/parent/children');
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);

  // Nav tabs pass only a key; a notification also passes its item, which selects that child and
  // scrolls to the right card (performance: opens that evaluation day).
  function navigate(key, item) {
    onSectionChange(key);
    if (!item) {
      setFocus(null);
      return;
    }
    if (item.studentId) setSelectedId(item.studentId);
    if (key === 'records') {
      const performance = item.kind === NOTIFICATION_KINDS.PERFORMANCE;
      setFocus((f) => ({ n: (f?.n ?? 0) + 1, target: performance ? 'performance' : 'today', date: performance ? itemDate(item) : null }));
    }
  }

  const children = data?.children ?? [];
  const selected = children.find((c) => c.studentId === selectedId) ?? children[0];
  const firstName = account.profile.displayName?.split(' ')[0];

  if (section === 'settings') {
    return (
      <AppShell nav={NAV} activeKey={section} onNavigate={navigate} title="Settings">
        <SettingsPage />
      </AppShell>
    );
  }

  return (
    <AppShell nav={NAV} activeKey={section} onNavigate={navigate}>
      <HeroBanner
        titleId="parent-welcome"
        eyebrow={section === 'dismissal' ? 'Fetchers & Dismissal' : 'Daily Records'}
        title={`Welcome${firstName ? `, ${firstName}` : ''}!`}
        description={section === 'dismissal'
          ? 'Choose who may pick up your child, and send a dismissal code when someone else will.'
          : children.length > 1
            ? 'Here’s how your children’s day is going.'
            : 'Here’s how your child’s day is going.'}
        aside={<LogoDisc />}
      >
        {section === 'records' && children.length > 1 && (
          <ChildSelector options={children} selectedId={selected?.studentId} onSelect={(id) => { setSelectedId(id); setFocus(null); }} />
        )}
      </HeroBanner>

      <div className="mt-6">
        {loading && (
          <div className="rounded-3xl bg-paper p-6 shadow-sm ring-1 ring-brand-100">
            <LoadingState>Loading your child’s records…</LoadingState>
          </div>
        )}
        {error && <ErrorMessage message={error} onRetry={reload} />}
        {data && children.length === 0 && (
          <EmptyState icon={<StudentsIcon className="h-6 w-6" />} title="No child is linked to your account yet">
            Please contact the school administrator.
          </EmptyState>
        )}
        {section === 'dismissal' && children.length > 0 && <ParentDismissal options={children} />}
        {section === 'records' && selected && (
          <div aria-label={`Records for ${studentFullName(selected)}`} role="region">
            {/* key: switching children starts each child's view fresh. */}
            <ChildRecords key={selected.studentId} child={selected} focus={focus} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
