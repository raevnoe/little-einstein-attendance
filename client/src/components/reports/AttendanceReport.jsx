import { useState } from 'react';
import { REPORT_ATTENDANCE_STATUS, REPORT_ATTENDANCE_STATUS_LABELS } from '@led/shared';
import { formatDateRange, formatDayDate, formatTime } from '../../lib/format.js';
import { csvFileName, downloadCsv, toCsv } from '../../lib/csv.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import ReportFilters from './ReportFilters.jsx';
import ReportHeader, { ReportActions, ReportStatus } from './ReportHeader.jsx';
import StatCard, { StatGrid } from './StatCard.jsx';
import { useReport } from './useReport.js';
import { Alert, Badge, EmptyState, InitialsAvatar, TH } from '../ui/index.js';
import { DownloadIcon, StudentsIcon } from '../ui/icons.jsx';

const EMPTY_FILTERS = { from: '', to: '', section: '', studentId: '' };
const NOT_RECORDED = 'No attendance recorded';

const sortName = (s) => `${s.lastName}, ${[s.firstName, s.middleName].filter(Boolean).join(' ')}`;

function StatusPill({ status }) {
  return (
    <Badge tone={status === REPORT_ATTENDANCE_STATUS.NO_TIME_OUT_RECORDED ? 'warning' : 'brand'}>
      {REPORT_ATTENDANCE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** CSV download button (never printed). */
function CsvButton({ onClick, disabled, children }) {
  return (
    <QuietButton onClick={onClick} disabled={disabled}>
      <DownloadIcon className="h-4 w-4" />
      {children}
    </QuietButton>
  );
}

function exportCsv(kind, report) {
  const name = () => csvFileName('attendance', kind, report.from, 'to', report.to, report.filters.section, report.filters.studentId);
  const time = (iso) => (iso ? formatTime(iso, report.timeZone) : '');
  const student = (s) => [s.studentId, s.lastName, s.firstName, s.middleName, s.section, s.active ? 'Active' : 'Inactive'];
  const STUDENT_HEADERS = ['Student ID', 'Last name', 'First name', 'Middle name', 'Section', 'Student status'];

  if (kind === 'daily-totals') {
    downloadCsv(name(), toCsv(
      ['Date', 'Students', 'Time in recorded', 'Time out recorded', 'No time out recorded', 'No time in', 'Note'],
      report.days.map((d) => [
        d.schoolDate, d.students, d.timeIn, d.timeOut, d.noTimeOutRecorded,
        d.attendanceRecorded ? d.noTimeIn : '', d.attendanceRecorded ? '' : NOT_RECORDED,
      ]),
    ));
  } else if (kind === 'student-totals') {
    downloadCsv(name(), toCsv(
      [...STUDENT_HEADERS, 'Days with time in', 'Days with time out', 'Days with no time out recorded'],
      report.students.map((s) => [...student(s.student), s.daysWithTimeIn, s.daysWithTimeOut, s.daysNoTimeOutRecorded]),
    ));
  } else {
    downloadCsv(name(), toCsv(
      [...STUDENT_HEADERS, 'Date', `Time in (${report.timeZone})`, `Time out (${report.timeZone})`, 'Status'],
      report.students.flatMap((s) => s.records.map((r) => [
        ...student(s.student), r.schoolDate, time(r.timeIn), time(r.timeOut), REPORT_ATTENDANCE_STATUS_LABELS[r.status],
      ])),
    ));
  }
}

function DailyTotals({ report }) {
  return (
    <Panel title="Daily totals" titleId="attendance-daily-title" script accent="leaf" className="break-inside-avoid">
      {/* Phones: one card per day. Tablets, desktops and print: a table. */}
      <ul className="mt-4 space-y-2 sm:hidden print:hidden">
        {report.days.map((d) => (
          <li key={d.schoolDate} className={`rounded-2xl p-3 ring-1 ring-brand-100 ${d.attendanceRecorded ? 'bg-paper' : 'bg-canvas'}`}>
            <p className="font-semibold text-brand-900">{formatDayDate(d.schoolDate)}</p>
            {d.attendanceRecorded ? (
              <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm text-brand-700">
                <dt>Time in</dt><dd className="text-right font-semibold text-brand-900">{d.timeIn}</dd>
                <dt>Time out</dt><dd className="text-right font-semibold text-brand-900">{d.timeOut}</dd>
                <dt>No time out recorded</dt><dd className="text-right font-semibold text-brand-900">{d.noTimeOutRecorded}</dd>
                <dt>No time in</dt><dd className="text-right font-semibold text-brand-900">{d.noTimeIn}</dd>
              </dl>
            ) : (
              <p className="mt-1 text-sm text-brand-600 dark:text-brand-300">{NOT_RECORDED}</p>
            )}
          </li>
        ))}
      </ul>
      <div className="relative mt-4 hidden overflow-x-auto rounded-2xl ring-1 ring-brand-100 sm:block print:block print:rounded-none print:ring-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th scope="col" className={TH}>Date</th>
              <th scope="col" className={`${TH} text-right`}>Students</th>
              <th scope="col" className={`${TH} text-right`}>Time in</th>
              <th scope="col" className={`${TH} text-right`}>Time out</th>
              <th scope="col" className={`${TH} text-right`}>No time out recorded</th>
              <th scope="col" className={`${TH} text-right`}>No time in</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((d) => (
              <tr key={d.schoolDate} className={`break-inside-avoid border-t border-brand-100 ${d.attendanceRecorded ? 'hover:bg-canvas/70' : 'bg-canvas/50'}`}>
                <th scope="row" className="px-4 py-2.5 font-medium text-brand-900">{formatDayDate(d.schoolDate)}</th>
                {d.attendanceRecorded ? (
                  <>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-900">{d.students}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-900">{d.timeIn}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-900">{d.timeOut}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-900">{d.noTimeOutRecorded}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-900">{d.noTimeIn}</td>
                  </>
                ) : (
                  <td colSpan={5} className="px-4 py-2.5 text-right italic text-brand-500">{NOT_RECORDED}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function StudentRecords({ records, timeZone }) {
  if (records.length === 0) return <p className="text-sm text-brand-600 dark:text-brand-300">No time in recorded in this period.</p>;
  return (
    <ul className="space-y-1.5 rounded-xl bg-canvas p-3 text-sm print:bg-transparent print:p-0">
      {records.map((r) => (
        <li key={r.schoolDate} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-28 font-medium text-brand-900">{formatDayDate(r.schoolDate)}</span>
          <span className="tabular-nums text-brand-700">In {formatTime(r.timeIn, timeZone)}</span>
          <span className="tabular-nums text-brand-700">Out {formatTime(r.timeOut, timeZone)}</span>
          <StatusPill status={r.status} />
        </li>
      ))}
    </ul>
  );
}

function StudentTotals({ report, showDays, onToggleDays }) {
  return (
    <Panel
      title="By student"
      titleId="attendance-students-title"
      script
      accent="grape"
      actions={(
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700 print:hidden">
          <input type="checkbox" checked={showDays} onChange={(e) => onToggleDays(e.target.checked)} className="h-5 w-5 accent-brand-600" />
          Show each day’s times
        </label>
      )}
    >
      {report.students.length === 0 ? (
        <EmptyState className="mt-4" icon={<StudentsIcon className="h-6 w-6" />} title="No students match these filters." />
      ) : (
        <ul className="mt-4 divide-y divide-brand-100">
          {report.students.map(({ student: s, daysWithTimeIn, daysWithTimeOut, daysNoTimeOutRecorded, records }) => (
            <li key={s.studentId} className="break-inside-avoid py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex flex-wrap items-center gap-x-2 font-semibold text-brand-900">
                  <InitialsAvatar text={`${s.firstName?.[0] ?? ''}${s.lastName?.[0] ?? ''}`.toUpperCase()} tone="grape" className="h-8 w-8 text-xs print:hidden" />
                  {sortName(s)}
                  <span className="ml-2 font-mono text-xs font-normal text-brand-600 dark:text-brand-300">{s.studentId}</span>
                  <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-300">{s.section}</span>
                  {!s.active && <span className="ml-2 text-xs font-normal text-brand-500">(inactive)</span>}
                </p>
                <p className="flex flex-wrap gap-x-4 text-sm text-brand-700">
                  <span>Time in: <strong className="tabular-nums text-brand-900">{daysWithTimeIn}</strong></span>
                  <span>Time out: <strong className="tabular-nums text-brand-900">{daysWithTimeOut}</strong></span>
                  <span>No time out recorded: <strong className="tabular-nums text-brand-900">{daysNoTimeOutRecorded}</strong></span>
                </p>
              </div>
              {showDays && <div className="mt-2"><StudentRecords records={records} timeZone={report.timeZone} /></div>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * Attendance Report (admin and teacher): GET /api/reports/attendance. Totals per day and per
 * student, built only from recorded scans. No absence totals across days (no school calendar).
 */
export default function AttendanceReport() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showDays, setShowDays] = useState(false);
  const { data: report, loading, error, invalid, today, reload } = useReport('/reports/attendance', filters);
  const shown = { ...filters, from: filters.from || report?.from || '', to: filters.to || report?.to || '' };

  const totals = report && report.days.reduce((t, d) => ({
    timeIn: t.timeIn + d.timeIn,
    timeOut: t.timeOut + d.timeOut,
    noTimeOutRecorded: t.noTimeOutRecorded + d.noTimeOutRecorded,
    daysRecorded: t.daysRecorded + (d.attendanceRecorded ? 1 : 0),
  }), { timeIn: 0, timeOut: 0, noTimeOutRecorded: 0, daysRecorded: 0 });

  return (
    <div className="space-y-5">
      <Panel className="print:hidden">
        <ReportFilters filters={shown} onChange={setFilters} today={today} sections={report?.sections} idPrefix="attendance-report" />
      </Panel>

      <ReportStatus loading={loading} invalid={invalid} hasData={Boolean(report)} />
      {error && <ErrorMessage message={error} onRetry={reload} />}

      {report && !invalid && (
        <div aria-busy={loading} className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
          <ReportHeader title="Attendance Report" report={report} range={formatDateRange(report.from, report.to)}>
            <ReportActions>
              <CsvButton onClick={() => exportCsv('daily-totals', report)}>Daily totals CSV</CsvButton>
              <CsvButton onClick={() => exportCsv('student-totals', report)} disabled={report.students.length === 0}>Student totals CSV</CsvButton>
              <CsvButton onClick={() => exportCsv('records', report)} disabled={report.students.length === 0}>Daily records CSV</CsvButton>
            </ReportActions>
          </ReportHeader>

          <StatGrid>
            <StatCard label="Days with attendance recorded" value={totals.daysRecorded} hint={`of ${report.days.length} ${report.days.length === 1 ? 'day' : 'days'} in this period`} />
            <StatCard label="Time in recorded" value={totals.timeIn} hint="Student-days" tone="good" />
            <StatCard label="Time out recorded" value={totals.timeOut} hint="Student-days" />
            <StatCard label="No time out recorded" value={totals.noTimeOutRecorded} hint="Student-days" tone={totals.noTimeOutRecorded ? 'attention' : 'neutral'} />
          </StatGrid>

          <Alert tone="info" role={null}>
            “No time in” is shown only for days when attendance was recorded for at least one student; days with no
            records at all (for example weekends or holidays) are not counted. “No time out recorded” only means no
            time-out scan was recorded — it does not show whether or how the child was dismissed.
          </Alert>

          <DailyTotals report={report} />
          <StudentTotals report={report} showDays={showDays} onToggleDays={setShowDays} />
        </div>
      )}
    </div>
  );
}
