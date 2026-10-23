import { useState } from 'react';
import UpdatedNote from '../UpdatedNote.jsx';
import { ATTENDANCE_STATUS } from '@led/shared';
import { formatDate, formatDayDate, formatTime, studentFullName } from '../../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import { PARENT_STATUS_LABELS } from '../../lib/attendanceStatusLabels.js';
import { InitialsAvatar, LoadingState, Sparkle } from '../ui/index.js';
import { CalendarIcon } from '../ui/icons.jsx';

// A parent's view of ONE own child's attendance. The data comes from
// GET /api/parent/children/:studentId/attendance (the server returns 404 for anyone else's child),
// loaded once by the dashboard and shared by the Today summary and the history list.

const HISTORY_STEP = 5;

const STATUS_TONE = {
  [ATTENDANCE_STATUS.CHECKED_IN]: { banner: 'bg-leaf-50 ring-leaf-100', icon: 'bg-leaf-400 text-white' },
  [ATTENDANCE_STATUS.CHECKED_OUT]: { banner: 'bg-grape-50 ring-grape-100', icon: 'bg-grape-500 text-white' },
  [ATTENDANCE_STATUS.ABSENT]: { banner: 'bg-canvas ring-brand-100', icon: 'bg-white text-brand-500 ring-1 ring-inset ring-brand-200' },
};

const STATUS_PATHS = {
  [ATTENDANCE_STATUS.CHECKED_IN]: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  [ATTENDANCE_STATUS.CHECKED_OUT]: <path d="M14 7l5 5-5 5M19 12H9M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h5" />,
  [ATTENDANCE_STATUS.ABSENT]: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
};

function StatusIcon({ status }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {STATUS_PATHS[status]}
    </svg>
  );
}

function statusSentence(status, record, timeZone) {
  if (status === ATTENDANCE_STATUS.CHECKED_IN) return `Arrived at ${formatTime(record?.timeIn, timeZone)}.`;
  if (status === ATTENDANCE_STATUS.CHECKED_OUT) return `Recorded leaving school at ${formatTime(record?.timeOut, timeZone)}.`;
  return 'No arrival has been recorded yet today.';
}

const MOMENTS = {
  arrival: {
    title: 'Arrival',
    label: 'Time In',
    card: 'border-leaf-400',
    icon: 'bg-leaf-50 text-leaf-700',
    // Sun rising over a horizon.
    path: <path d="M4 18h16M7 18a5 5 0 0110 0M12 7V4.5M6.3 10.3 4.6 8.6M17.7 10.3l1.7-1.7" />,
  },
  departure: {
    title: 'Departure',
    label: 'Time Out',
    card: 'border-grape-500',
    icon: 'bg-grape-50 text-grape-700',
    // House (going home).
    path: <path d="M4 11l8-6.5 8 6.5M6.5 9.5V19h11V9.5M10 19v-5h4v5" />,
  },
};

/** One of the two "today" cards. Only states what was recorded; '—' when nothing was. */
function MomentCard({ moment, time }) {
  const m = MOMENTS[moment];
  return (
    <div className={`rounded-2xl border-t-4 bg-white p-4 shadow-sm ring-1 ring-brand-100 sm:p-5 ${m.card}`}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.icon}`}>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
            {m.path}
          </svg>
        </span>
        <dt>
          <span className="block font-script text-2xl leading-none text-brand-700">{m.title}</span>
          <span className="block text-xs font-semibold uppercase tracking-wide text-brand-500">{m.label}</span>
        </dt>
      </div>
      <dd className="mt-3">
        <span className="block text-3xl font-bold tabular-nums text-brand-900">{time}</span>
        <span className="mt-0.5 block text-sm text-brand-500">{time === '—' ? 'Not recorded yet' : 'Recorded today'}</span>
      </dd>
    </div>
  );
}

/** The dashboard's main card: the child's name, today's status, Arrival (Time In) and Departure (Time Out). */
export function TodayAttendance({ child, attendance }) {
  const { loading, data, error, reload, updatedAt } = attendance;
  const status = data?.todayStatus in STATUS_TONE ? data.todayStatus : ATTENDANCE_STATUS.ABSENT;
  const todayRecord = data?.records.find((r) => r.schoolDate === data.today);
  const tone = STATUS_TONE[status];
  const headingId = `today-${child.studentId}`;

  return (
    <section aria-labelledby={headingId} className="relative isolate overflow-hidden rounded-[1.75rem] bg-white shadow-sm ring-1 ring-brand-100">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 -z-10 h-40 w-40 rounded-full bg-sun-100" />
      <Sparkle className="pointer-events-none absolute right-6 top-6 h-5 w-5 text-sun-400" />

      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-4 pr-8">
          <InitialsAvatar text={`${child.firstName?.[0] ?? ''}${child.lastName?.[0] ?? ''}`.toUpperCase()} tone="leaf" className="h-14 w-14 text-lg ring-4 ring-leaf-50" />
          <div className="min-w-0">
            <p className="font-script text-2xl leading-none text-grape-500">Today’s Attendance</p>
            <h2 id={headingId} className="mt-1 text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">
              {studentFullName(child)}
            </h2>
            <p className="mt-0.5 text-sm text-brand-500">
              {[child.section, data && formatDayDate(data.today, { long: true })].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {loading && (
          <div className="mt-6 space-y-3 motion-safe:animate-pulse" aria-hidden="true">
            <div className="h-16 rounded-2xl bg-brand-50" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-28 rounded-2xl bg-brand-50" />
              <div className="h-28 rounded-2xl bg-brand-50" />
            </div>
          </div>
        )}
        {loading && <p className="sr-only" role="status">Loading attendance…</p>}
        {error && <ErrorMessage message={error} onRetry={reload} />}

        {data && (
          <>
            <div className={`mt-6 flex items-center gap-4 rounded-2xl p-4 ring-1 ${tone.banner}`} role="status">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
                <StatusIcon status={status} />
              </span>
              <div>
                <p className="text-xl font-bold text-brand-900 sm:text-2xl">{PARENT_STATUS_LABELS[status]}</p>
                <p className="text-sm text-brand-700">{statusSentence(status, todayRecord, data.timeZone)}</p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <MomentCard moment="arrival" time={formatTime(todayRecord?.timeIn, data.timeZone)} />
              <MomentCard moment="departure" time={formatTime(todayRecord?.timeOut, data.timeZone)} />
            </dl>
            <UpdatedNote updatedAt={updatedAt} timeZone={data.timeZone} every="minute" className="mt-3" />
          </>
        )}
      </div>

      <details className="group border-t border-brand-100">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-7 [&::-webkit-details-marker]:hidden">
          Child details
          <svg viewBox="0 0 20 20" className="h-4 w-4 motion-safe:transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 7.5l5 5 5-5" />
          </svg>
        </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 px-5 pb-4 text-sm sm:px-7">
          <dt className="text-brand-600">Student ID</dt>
          <dd className="font-mono text-brand-900">{child.studentId}</dd>
          <dt className="text-brand-600">Section</dt>
          <dd className="text-brand-900">{child.section || '—'}</dd>
          <dt className="text-brand-600">Birthday</dt>
          <dd className="text-brand-900">{formatDate(child.dateOfBirth)}</dd>
        </dl>
      </details>
    </section>
  );
}

/** Recent days (newest first) as a timeline - no table, so nothing scrolls sideways on phones. */
export function AttendanceHistory({ studentId, attendance }) {
  const { loading, data, error, reload } = attendance;
  const [visible, setVisible] = useState(HISTORY_STEP);
  const records = data?.records ?? [];
  const headingId = `history-${studentId}`;

  return (
    <Panel title="Attendance History" titleId={headingId} subtitle="Last 30 days" script accent="leaf">
      {loading && <LoadingState className="mt-4">Loading attendance…</LoadingState>}
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {data && records.length === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-brand-200 px-4 py-4 text-sm text-brand-700">
          <CalendarIcon className="h-5 w-5 shrink-0 text-brand-500" />
          No attendance recorded in the last 30 days.
        </div>
      )}

      {records.length > 0 && (
        <ol className="ml-2 mt-5 space-y-4 border-l-2 border-dashed border-brand-100 pl-6">
          {records.slice(0, visible).map((r) => (
            <li key={r.schoolDate} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[33px] top-1 h-4 w-4 rounded-full ring-4 ring-white ${r.timeOut ? 'bg-grape-500' : r.timeIn ? 'bg-leaf-400' : 'bg-brand-200'}`}
              />
              <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-900">
                {formatDayDate(r.schoolDate)}
                {r.schoolDate === data.today && (
                  <span className="rounded-full bg-leaf-100 px-2 py-0.5 text-xs font-semibold text-leaf-700">Today</span>
                )}
              </p>
              <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <dt className="text-brand-500">In</dt>
                  <dd className="font-semibold tabular-nums text-brand-900">{formatTime(r.timeIn, data.timeZone)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-brand-500">Out</dt>
                  <dd className="font-semibold tabular-nums text-brand-900">{formatTime(r.timeOut, data.timeZone)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      )}

      {records.length > HISTORY_STEP && (
        <div className="mt-4 flex gap-2">
          {visible < records.length ? (
            <QuietButton onClick={() => setVisible((n) => n + HISTORY_STEP)} className="w-full">
              Show more ({records.length - visible} more)
            </QuietButton>
          ) : (
            <QuietButton onClick={() => setVisible(HISTORY_STEP)} className="w-full">
              Show fewer
            </QuietButton>
          )}
        </div>
      )}
    </Panel>
  );
}
