import { useApiData } from '../../lib/useApiData.js';
import { formatDayDate } from '../../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import StatCard, { StatGrid } from './StatCard.jsx';
import { SchoolLogo } from '../landing/SchoolMark.jsx';
import { Alert, HeroBanner, LoadingState, Sparkle } from '../ui/index.js';
import { ArrowRightIcon, AttendanceIcon, DismissalIcon, InfoIcon, PhoneIcon, RefreshIcon, StarIcon, StudentsIcon } from '../ui/icons.jsx';

const GROUP_TONES = {
  leaf: 'bg-leaf-50 text-leaf-700',
  sun: 'bg-sun-100 text-sun-700',
  grape: 'bg-grape-50 text-grape-700',
  sky: 'bg-sky-50 text-sky-700',
  brand: 'bg-brand-50 text-brand-700',
};

/** "Open Attendance →" link-style button to an existing dashboard tab. */
function OpenButton({ onClick, children }) {
  return (
    <QuietButton onClick={onClick} className="min-h-10 px-3">
      {children}
      <ArrowRightIcon className="h-4 w-4" />
    </QuietButton>
  );
}

/** One titled group of numbers inside a summary card. */
function Group({ id, title, icon: Icon, tone, action, children }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-brand-100 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="flex items-center gap-2.5 font-semibold text-brand-900">
          <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center rounded-xl ${GROUP_TONES[tone]}`}>
            <Icon className="h-5 w-5" />
          </span>
          {title}
        </h3>
        {action}
      </div>
      <StatGrid className="mt-3">{children}</StatGrid>
    </section>
  );
}

function RefreshButton({ onClick, disabled }) {
  return (
    <QuietButton onClick={onClick} disabled={disabled}>
      <RefreshIcon className="h-4 w-4" />
      Refresh
    </QuietButton>
  );
}

const QUICK_ACTIONS = [
  { key: 'attendance', label: 'Attendance', icon: AttendanceIcon },
  { key: 'performance', label: 'Performance', icon: StarIcon },
  { key: 'dismissal', label: 'Dismissal', icon: DismissalIcon },
];

/**
 * Greeting hero for the staff home tab. Quick actions only open sections that are already in this
 * role's navigation (`onNavigate(key)`); nothing here loads data.
 */
/** Teachers: the sections an admin assigned (they see only these students). Admins see every section. */
export function TeacherSectionsNote({ account }) {
  const sections = account.profile.sections ?? [];
  if (sections.length === 0) {
    return (
      <Alert tone="warning" title="No section assigned yet">
        You will see students, attendance, Performance Evaluations, dismissals and reports once an administrator assigns
        your section(s) under Accounts.
      </Alert>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-brand-700">
      <span className="font-semibold text-brand-900">Your section{sections.length === 1 ? '' : 's'}:</span>
      {sections.map((n) => <span key={n} className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-100">{n}</span>)}
    </p>
  );
}

export function StaffWelcome({ account, roleLabel, onNavigate }) {
  const firstName = account.profile.displayName?.split(' ')[0];
  return (
    <HeroBanner
      titleId="staff-welcome"
      eyebrow={`${roleLabel} Dashboard`}
      title={`Hello${firstName ? `, ${firstName}` : ''}!`}
      description="Here’s today at Little Einstein Discovery School. Where would you like to start?"
      aside={(
        <div className="relative mx-auto hidden h-36 w-36 items-center justify-center rounded-full bg-white shadow-lg ring-8 ring-white/15 lg:flex">
          <SchoolLogo decorative className="h-24 w-auto" />
          <Sparkle className="absolute -left-2 top-3 h-6 w-6 text-sun-400" />
        </div>
      )}
    >
      <nav aria-label="Quick actions">
        <ul className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => onNavigate(key)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-brand-700 shadow-sm motion-safe:transition-colors hover:bg-sun-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun-400 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600`}
              >
                <Icon className="h-4.5 w-4.5" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </HeroBanner>
  );
}

/**
 * Today at a glance for staff (admin and teacher): GET /api/reports/today.
 * `onNavigate(sectionKey)` opens the matching dashboard tab.
 */
export function TodaySummary({ onNavigate }) {
  const { loading, data, error, reload, refresh } = useApiData('/reports/today');

  return (
    <Panel
      title="Today at school"
      titleId="today-summary-title"
      subtitle={data ? `${formatDayDate(data.schoolDate, { long: true })} · school time (${data.timeZone})` : 'School day summary'}
      script
      accent="leaf"
      actions={<RefreshButton onClick={refresh} disabled={loading} />}
    >
      {loading && <LoadingState className="mt-4">Loading today’s summary…</LoadingState>}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && (
        <div className="mt-5 space-y-4">
          <Group id="today-attendance" title="Daily Attendance" icon={AttendanceIcon} tone="leaf" action={<OpenButton onClick={() => onNavigate('attendance')}>Open Attendance</OpenButton>}>
            <StatCard label="In school" value={data.attendance.inSchool} tone="good" />
            <StatCard label="Went home" value={data.attendance.wentHome} />
            <StatCard label="No time in" value={data.attendance.noTimeIn} />
            <StatCard label="Students" value={data.attendance.students} />
          </Group>

          <Group id="today-performance" title="Performance Evaluation" icon={StarIcon} tone="sun" action={<OpenButton onClick={() => onNavigate('performance')}>Open Performance</OpenButton>}>
            <StatCard
              label="Students evaluated today"
              value={data.performance.studentsEvaluated}
              hint={`of ${data.performance.activeStudents} active students`}
            />
            <StatCard label="Star ratings saved today" value={data.performance.evaluations} />
          </Group>

          <Group id="today-dismissal" title="Dismissal Verification" icon={DismissalIcon} tone="grape" action={<OpenButton onClick={() => onNavigate('dismissal')}>Open Dismissal</OpenButton>}>
            <StatCard
              label="Waiting for code check"
              value={data.dismissals.awaitingVerification}
              tone={data.dismissals.awaitingVerification ? 'attention' : 'neutral'}
            />
            <StatCard
              label="Verified, not yet released"
              value={data.dismissals.verified}
              tone={data.dismissals.verified ? 'attention' : 'neutral'}
            />
            <StatCard label="Released to a Fetcher" value={data.dismissals.released} />
            <StatCard label="Dismissal requests" value={data.dismissals.total} />
          </Group>

          <div className="flex flex-wrap gap-2">
            <OpenButton onClick={() => onNavigate('reports')}>Open Reports</OpenButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Admin-only counts: GET /api/admin/overview (counts only; no names, numbers or messages). */
export function AdminOverview({ onNavigate }) {
  const { loading, data, error, reload, refresh } = useApiData('/admin/overview');

  return (
    <Panel
      title="School records"
      titleId="admin-overview-title"
      subtitle="Students, RFID cards, parent accounts and today’s SMS notifications"
      script
      accent="sky"
      actions={<RefreshButton onClick={refresh} disabled={loading} />}
    >
      {loading && <LoadingState className="mt-4">Loading school records…</LoadingState>}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && (
        <div className="mt-5 space-y-4">
          <Group
            id="records-overview"
            title="Students and RFID Cards"
            icon={StudentsIcon}
            tone="brand"
            action={(
              <div className="flex flex-wrap gap-2">
                <OpenButton onClick={() => onNavigate('students')}>Open Students</OpenButton>
                <OpenButton onClick={() => onNavigate('rfid')}>Open RFID Cards</OpenButton>
              </div>
            )}
          >
            <StatCard label="Active students" value={data.students.active} hint={`${data.students.inactive} inactive`} />
            <StatCard
              label="Active students without an RFID card"
              value={data.students.activeWithoutRfidCard}
              tone={data.students.activeWithoutRfidCard ? 'attention' : 'neutral'}
            />
            <StatCard label="RFID cards assigned" value={data.rfidCards.assigned} hint={`${data.rfidCards.unassigned} unassigned · ${data.rfidCards.inactive} inactive`} />
            <StatCard
              label="Parents without a mobile number"
              value={data.parents.withoutMobileNumber}
              hint={`of ${data.parents.active} active parent accounts`}
              tone={data.parents.withoutMobileNumber ? 'attention' : 'neutral'}
            />
          </Group>

          <Group id="sms-today" title="SMS notifications today" icon={PhoneIcon} tone="sky">
            <StatCard label="Sent" value={data.sms.sent} hint="Accepted by the SMS provider (not proof of delivery)" tone="good" />
            <StatCard label="Failed" value={data.sms.failed} tone={data.sms.failed ? 'attention' : 'neutral'} />
            <StatCard label="Skipped" value={data.sms.skipped} hint="No parent mobile number on file" />
          </Group>
          <p className="flex items-center gap-2 text-xs text-brand-600">
            <InfoIcon className="h-4 w-4 shrink-0" />
            Arrival and departure messages only. Dismissal codes are not counted here.
          </p>
        </div>
      )}
    </Panel>
  );
}
