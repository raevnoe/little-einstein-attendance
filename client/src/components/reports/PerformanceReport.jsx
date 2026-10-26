import { useState } from 'react';
import { MAX_STAR_RATING, MIN_STAR_RATING, performanceAreaLabel } from '@led/shared';
import { formatDateRange, formatDayDate } from '../../lib/format.js';
import { csvFileName, downloadCsv, toCsv } from '../../lib/csv.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import { StarDisplay } from '../performance/StarRating.jsx';
import ReportFilters from './ReportFilters.jsx';
import ReportHeader, { ReportActions, ReportStatus } from './ReportHeader.jsx';
import { useReport } from './useReport.js';
import { Alert, EmptyState, InitialsAvatar, TH } from '../ui/index.js';
import { DownloadIcon, StarIcon } from '../ui/icons.jsx';

const EMPTY_FILTERS = { from: '', to: '', section: '', studentId: '', area: '' };
// Highest first, as teachers read them: 5★ 4★ 3★ 2★ 1★.
const STAR_VALUES = Array.from({ length: MAX_STAR_RATING - MIN_STAR_RATING + 1 }, (_, i) => MAX_STAR_RATING - i);

const sortName = (s) => `${s.lastName}, ${[s.firstName, s.middleName].filter(Boolean).join(' ')}`;

function exportCsv(kind, report) {
  const fileName = csvFileName('performance', kind, report.from, 'to', report.to, report.filters.section, report.filters.studentId, report.filters.area);
  const student = (s) => [s.studentId, s.lastName, s.firstName, s.middleName, s.section];
  const STUDENT_HEADERS = ['Student ID', 'Last name', 'First name', 'Middle name', 'Section'];

  if (kind === 'star-counts') {
    downloadCsv(fileName, toCsv(
      [...STUDENT_HEADERS, 'Area', 'Star ratings', ...STAR_VALUES.map((n) => `${n} stars`)],
      report.students.flatMap((s) => s.areas.map((a) => [
        ...student(s.student), performanceAreaLabel(a.area), a.ratings, ...STAR_VALUES.map((n) => a.starCounts[n]),
      ])),
    ));
  } else {
    downloadCsv(fileName, toCsv(
      ['Date', ...STUDENT_HEADERS, 'Area', 'Stars', 'Observation', 'Teacher', 'Daily Average Star Rating'],
      report.students.flatMap((s) => s.days.flatMap((d) => d.evaluations.map((e) => [
        d.evaluationDate, ...student(s.student), performanceAreaLabel(e.area), e.starRating, e.observation, e.teacherName ?? '',
        d.dailyAverageStarRating ?? '',
      ]))),
    ));
  }
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

function StarCountsTable({ areas }) {
  return (
    <div className="relative overflow-x-auto rounded-2xl ring-1 ring-brand-100 print:rounded-none print:ring-0">
      <table className="w-full min-w-[420px] text-left text-sm">
        <caption className="sr-only">Number of ratings with each star count, per area</caption>
        <thead>
          <tr>
            <th scope="col" className={TH}>Area</th>
            <th scope="col" className={`${TH} text-right`}>Ratings</th>
            {STAR_VALUES.map((n) => (
              <th key={n} scope="col" className={`${TH} text-right`}>
                <span aria-hidden="true">{n}★</span><span className="sr-only">{n} stars</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.area} className="border-t border-brand-100 hover:bg-canvas/70">
              <th scope="row" className="px-4 py-2.5 font-medium text-brand-900">{performanceAreaLabel(a.area)}</th>
              <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-brand-900">{a.ratings}</td>
              {STAR_VALUES.map((n) => (
                <td key={n} className={`px-4 py-2.5 text-right tabular-nums ${a.starCounts[n] ? 'text-brand-900' : 'text-brand-300'}`}>
                  {a.starCounts[n]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EvaluationDays({ days, showAverage }) {
  return (
    <ol className="space-y-3">
      {days.map((d) => (
        <li key={d.evaluationDate} className="break-inside-avoid rounded-2xl bg-canvas/60 p-3 ring-1 ring-brand-100 sm:p-4 print:bg-transparent">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-brand-900">{formatDayDate(d.evaluationDate)}</p>
            {showAverage && d.dailyAverageStarRating !== null && (
              <p className="flex items-center gap-2 text-sm text-brand-700">
                Daily Average <StarDisplay value={d.dailyAverageStarRating} size="text-lg" /> <span className="font-semibold">{d.dailyAverageStarRating}</span>
              </p>
            )}
          </div>
          <ul className="mt-2 space-y-2">
            {d.evaluations.map((e) => (
              <li key={e.area} className="rounded-xl bg-paper p-2.5 text-sm ring-1 ring-brand-100 print:p-0 print:ring-0">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-brand-900">{performanceAreaLabel(e.area)}</span>
                  <StarDisplay value={e.starRating} size="text-lg" showLabel />
                  {e.teacherName && <span className="text-xs text-brand-600 dark:text-brand-300">· {e.teacherName}</span>}
                </p>
                {e.observation && <p className="mt-1.5 whitespace-pre-line border-l-4 border-sky-300 pl-3 text-brand-700">{e.observation}</p>}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function StudentSection({ entry, showAverage, showObservations }) {
  const { student: s, ratings, areas, days } = entry;
  return (
    <Panel className="break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex flex-wrap items-center gap-x-2 text-lg font-semibold text-brand-900">
          <InitialsAvatar text={`${s.firstName?.[0] ?? ''}${s.lastName?.[0] ?? ''}`.toUpperCase()} tone="sun" className="h-10 w-10 text-sm print:hidden" />
          {sortName(s)}
          <span className="ml-2 font-mono text-xs font-normal text-brand-600 dark:text-brand-300">{s.studentId}</span>
          <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-300">{s.section}</span>
          {!s.active && <span className="ml-2 text-xs font-normal text-brand-500">(inactive)</span>}
        </h3>
        <p className="text-sm text-brand-700">
          {ratings} star {ratings === 1 ? 'rating' : 'ratings'} on {days.length} {days.length === 1 ? 'day' : 'days'}
        </p>
      </div>
      <div className="mt-4"><StarCountsTable areas={areas} /></div>
      {showObservations && <div className="mt-4"><EvaluationDays days={days} showAverage={showAverage} /></div>}
    </Panel>
  );
}

/**
 * Performance Report (admin and teacher): GET /api/reports/performance. Star counts per area and
 * the teacher's observations by day. Star ratings are visual observations, not grades: no
 * averages across days or areas are shown, only each day's Daily Average Star Rating.
 */
export default function PerformanceReport() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showObservations, setShowObservations] = useState(true);
  const { data: report, loading, error, invalid, today, reload } = useReport('/reports/performance', filters);
  const shown = { ...filters, from: filters.from || report?.from || '', to: filters.to || report?.to || '' };

  return (
    <div className="space-y-5">
      <Panel className="print:hidden">
        <ReportFilters filters={shown} onChange={setFilters} today={today} sections={report?.sections} showArea idPrefix="performance-report" />
      </Panel>

      <ReportStatus loading={loading} invalid={invalid} hasData={Boolean(report)} />
      {error && <ErrorMessage message={error} onRetry={reload} />}

      {report && !invalid && (
        <div aria-busy={loading} className={`space-y-5 ${loading ? 'opacity-60' : ''}`}>
          <ReportHeader title="Performance Evaluation Report" report={report} range={formatDateRange(report.from, report.to)}>
            <ReportActions>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
                <input type="checkbox" checked={showObservations} onChange={(e) => setShowObservations(e.target.checked)} className="h-5 w-5 accent-brand-600" />
                Show observations
              </label>
              <CsvButton onClick={() => exportCsv('star-counts', report)} disabled={report.students.length === 0}>Star counts CSV</CsvButton>
              <CsvButton onClick={() => exportCsv('observations', report)} disabled={report.students.length === 0}>Observations CSV</CsvButton>
            </ReportActions>
          </ReportHeader>

          <Alert tone="info" role={null}>
            Star ratings are a teacher’s visual observation, not a grade. The tables count how many times each
            number of stars was given. The Daily Average Star Rating summarizes one day’s areas
            {report.filters.area ? ' and is hidden while one area is selected' : ''}.
          </Alert>

          {report.students.length === 0 ? (
            <EmptyState icon={<StarIcon className="h-6 w-6" />} title="No performance evaluations were recorded for these filters in this period." />
          ) : (
            report.students.map((entry) => (
              <StudentSection key={entry.student.studentId} entry={entry} showAverage={!report.filters.area} showObservations={showObservations} />
            ))
          )}

          {report.notEvaluated.length > 0 && (
            <Panel title="Not evaluated in this period" titleId="not-evaluated-title" subtitle="Active students with no evaluation for these filters." script accent="sun" className="break-inside-avoid">
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {report.notEvaluated.map((s) => (
                  <li key={s.studentId} className="rounded-full bg-canvas px-3 py-1.5 text-brand-900 ring-1 ring-brand-100">
                    {sortName(s)} <span className="text-xs text-brand-500">{s.section}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
