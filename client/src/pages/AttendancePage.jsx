import { useCallback, useEffect, useRef, useState } from 'react';
import { ATTENDANCE_STATUS, SCAN_SOURCES } from '@led/shared';
import { apiRequest } from '../lib/apiClient.js';
import { formatDate, formatTime } from '../lib/format.js';
import { browserIsIdle, createPoller } from '../lib/poller.js';
import { dataSignature, soundIfChanged } from '../lib/refreshSound.js';
import AttendanceStatusBadge from '../components/attendance/AttendanceStatusBadge.jsx';
import ManualScanPanel from '../components/attendance/ManualScanPanel.jsx';
import ReaderScanPanel from '../components/attendance/ReaderScanPanel.jsx';
import { Alert, Badge, Card, EmptyState, Field, LoadingState, ResponsiveTable, buttonClass, inputClass, TABLE, TD, TH, TR } from '../components/ui/index.js';
import { CalendarIcon, RefreshIcon, StudentsIcon } from '../components/ui/icons.jsx';

// Counts come from the API's summary for the selected date (never computed or invented here).
const SUMMARY_TILES = [
  { key: 'checkedIn', label: 'In school', dot: 'bg-leaf-400', border: 'border-leaf-100' },
  { key: 'checkedOut', label: 'Went home', dot: 'bg-brand-500', border: 'border-brand-100' },
  { key: 'absent', label: 'No time in', dot: 'bg-mist-400', border: 'border-brand-100' },
  { key: 'total', label: 'Students', dot: 'bg-sky-500', border: 'border-sky-100' },
];

/**
 * A recorded time, plus a small "typed" mark when that scan came from the typed-UID form instead of
 * the reader (as reported by the screen). Older records (manual-test) carry no mark: their source is
 * unknown.
 */
function ScanTime({ time, source, timeZone }) {
  const formatted = formatTime(time, timeZone);
  if (!time || source !== SCAN_SOURCES.MANUAL_ENTRY) return formatted;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {formatted}
      <span title="The card UID was typed, not scanned" className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
        typed<span className="sr-only"> (card UID entered by hand, not scanned)</span>
      </span>
    </span>
  );
}

const SEARCH_DELAY_MS = 300;
// Keeps today's list current for scans made on OTHER devices; this device's own scans refresh it at once.
const REFRESH_MS = 60_000;

/**
 * Daily Attendance for staff (admin and teacher). Dates and times come from the
 * server in the school's time zone. `date` '' means "today" as the server defines it.
 */
export default function AttendancePage() {
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState({ loading: true, data: null, error: null });
  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);
  // The Refresh button (not the automatic refresh or a scan) chimes when the list changed.
  const compareRef = useRef(null);
  const refreshWithSound = () => {
    compareRef.current = dataSignature(result.data);
    refresh();
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (search.trim()) params.set('q', search.trim());
      if (status !== 'all') params.set('status', status);
      setResult((r) => ({ ...r, loading: true, error: null }));
      apiRequest(`/attendance?${params}`)
        .then((data) => {
          if (cancelled) return;
          soundIfChanged(compareRef.current, data);
          compareRef.current = null;
          setResult({ loading: false, data, error: null });
        })
        .catch((error) => !cancelled && setResult((r) => ({ ...r, loading: false, error: error.message })));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, search, status, refreshKey]);

  const data = result.data;
  const viewingToday = Boolean(data) && data.schoolDate === data.today;

  // Skipped while the tab is hidden or offline (each refresh reads every student: Firestore quota).
  useEffect(() => {
    if (!viewingToday) return undefined;
    const poller = createPoller({ intervalMs: REFRESH_MS, run: refresh, isPaused: browserIsIdle });
    const resume = () => { if (!browserIsIdle()) poller.resume(); };
    poller.start();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      poller.stop();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [viewingToday, refresh]);

  const records = data?.records ?? [];
  const studentName = (s) => `${s.lastName}, ${s.firstName}${s.middleName ? ` ${s.middleName}` : ''}`;

  return (
    <div className="space-y-5">
      {viewingToday && <ReaderScanPanel onScanned={refresh} timeZone={data.timeZone} />}
      {viewingToday && <ManualScanPanel onScanned={refresh} />}

      {data && (
        <section aria-label="Attendance summary">
          <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-brand-900">
            <CalendarIcon className="h-5 w-5 text-brand-500" />
            {formatDate(data.schoolDate)}
            {viewingToday && <Badge tone="brand">Today</Badge>}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {SUMMARY_TILES.map((tile) => (
              <div key={tile.key} className={`rounded-2xl border bg-paper p-4 shadow-sm ${tile.border}`}>
                <dt className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${tile.dot}`} />
                  {tile.label}
                </dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums text-brand-900">{data.summary[tile.key]}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-end gap-3 border-b border-brand-100 p-4 sm:p-5">
          <Field id="attendance-date" label="Date">
            <input
              type="date"
              value={date || data?.schoolDate || ''}
              max={data?.today}
              onChange={(e) => setDate(e.target.value === data?.today ? '' : e.target.value)}
              className={inputClass({ className: 'w-auto' })}
            />
          </Field>
          <Field id="attendance-search" label="Search" className="min-w-48 flex-1">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Student ID, name, or section"
              className={inputClass()}
            />
          </Field>
          <Field id="attendance-status" label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass({ className: 'w-auto' })}>
              <option value="all">All</option>
              <option value={ATTENDANCE_STATUS.CHECKED_IN}>In school</option>
              <option value={ATTENDANCE_STATUS.CHECKED_OUT}>Went home</option>
              <option value={ATTENDANCE_STATUS.ABSENT}>No time in</option>
            </select>
          </Field>
          <button type="button" onClick={refreshWithSound} className={buttonClass({ variant: 'secondary' })}>
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="p-4 sm:p-5">
          {result.error && <Alert tone="error" className="mb-4">{result.error}</Alert>}

          {/* Tablets and desktops: table. */}
          {records.length > 0 && (
            <ResponsiveTable label="Daily attendance" className="hidden sm:block print:block">
              <table className={`${TABLE} min-w-[640px]`}>
                <thead>
                  <tr>
                    <th scope="col" className={TH}>Student ID</th>
                    <th scope="col" className={TH}>Name</th>
                    <th scope="col" className={TH}>Section</th>
                    <th scope="col" className={TH}>Time In</th>
                    <th scope="col" className={TH}>Time Out</th>
                    <th scope="col" className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(({ student: s, attendance: a, status: rowStatus }) => (
                    <tr key={s.studentId} className={TR}>
                      <td className={`${TD} font-mono text-brand-700`}>{s.studentId}</td>
                      <td className={`${TD} font-medium`}>
                        {studentName(s)}
                        {!s.active && <span className="ml-2 text-xs font-normal text-brand-500">(inactive)</span>}
                      </td>
                      <td className={`${TD} text-brand-700`}>{s.section}</td>
                      <td className={`${TD} tabular-nums`}><ScanTime time={a?.timeIn} source={a?.entrySource} timeZone={data.timeZone} /></td>
                      <td className={`${TD} tabular-nums`}><ScanTime time={a?.timeOut} source={a?.exitSource} timeZone={data.timeZone} /></td>
                      <td className={TD}><AttendanceStatusBadge status={rowStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}

          {/* Phones: one card per student. */}
          {records.length > 0 && (
            <ul className="space-y-3 sm:hidden print:hidden" aria-label="Daily attendance">
              {records.map(({ student: s, attendance: a, status: rowStatus }) => (
                <li key={s.studentId} className="rounded-2xl border border-brand-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-900">
                        {studentName(s)}
                        {!s.active && <span className="ml-2 text-xs font-normal text-brand-500">(inactive)</span>}
                      </p>
                      <p className="text-sm text-brand-500"><span className="font-mono">{s.studentId}</span> · {s.section}</p>
                    </div>
                    <AttendanceStatusBadge status={rowStatus} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-canvas px-3 py-2">
                      <dt className="text-xs font-semibold text-brand-500">Time In</dt>
                      <dd className="font-semibold tabular-nums text-brand-900"><ScanTime time={a?.timeIn} source={a?.entrySource} timeZone={data.timeZone} /></dd>
                    </div>
                    <div className="rounded-xl bg-canvas px-3 py-2">
                      <dt className="text-xs font-semibold text-brand-500">Time Out</dt>
                      <dd className="font-semibold tabular-nums text-brand-900"><ScanTime time={a?.timeOut} source={a?.exitSource} timeZone={data.timeZone} /></dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}

          {!result.loading && data && records.length === 0 && (
            <EmptyState icon={<StudentsIcon className="h-6 w-6" />} title="No students found." />
          )}
          {result.loading && !data && <LoadingState className="justify-center py-6">Loading attendance…</LoadingState>}
        </div>
      </Card>
    </div>
  );
}
