import { performanceAreaLabel } from '@led/shared';
import { QuietButton } from '../Panel.jsx';
import { SchoolLogo } from '../landing/SchoolMark.jsx';
import { Alert, LoadingState, Sparkle, Squiggle } from '../ui/index.js';
import { PrinterIcon } from '../ui/icons.jsx';

/** "Section K1 · Student K2026-001 · Area Language", or "All students". */
function filterSummary(filters) {
  const parts = [];
  if (filters.section) parts.push(`Section ${filters.section}`);
  if (filters.studentId) parts.push(`Student ${filters.studentId}`);
  if (filters.area) parts.push(`Area: ${performanceAreaLabel(filters.area)}`);
  return parts.length ? parts.join(' · ') : 'All students';
}

/**
 * Title block of a report. Also what heads the printed page: logo, school name, period, filters,
 * time zone, and when it was printed. On screen the title uses the script font; printed it is plain.
 */
export default function ReportHeader({ title, report, range, children }) {
  const printedAt = new Date().toLocaleString('en-PH', { timeZone: report.timeZone, dateStyle: 'long', timeStyle: 'short' });
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-paper p-5 shadow-sm ring-1 ring-brand-100 sm:p-6 print:overflow-visible print:rounded-none print:border-b-2 print:border-brand-600 print:p-0 print:pb-3 print:shadow-none print:ring-0">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-sky-50 print:hidden" />
      <Sparkle className="pointer-events-none absolute right-6 top-5 h-5 w-5 text-sun-400 print:hidden" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <SchoolLogo className="hidden h-16 w-auto print:block" />
          <div className="min-w-0">
            <p className="hidden text-sm font-semibold text-brand-700 print:block">Little Einstein Discovery School — Kindergarten</p>
            <h2 className="font-script text-[2.25rem] leading-none text-brand-700 print:font-sans print:text-xl print:font-bold print:leading-tight print:text-brand-900">
              {title}
            </h2>
            <Squiggle accent="sky" className="mt-1 block h-2.5 w-16 print:hidden" />
            <p className="mt-2 text-sm text-brand-700 print:mt-0.5">
              <strong>{range}</strong> · {filterSummary(report.filters)}
            </p>
            <p className="mt-0.5 text-xs text-brand-600 dark:text-brand-300">
              Dates and times are school time ({report.timeZone}).
              <span className="hidden print:inline"> Printed {printedAt}.</span>
            </p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Export/print buttons (never printed). */
export function ReportActions({ children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {children}
      <QuietButton onClick={() => window.print()}>
        <PrinterIcon className="h-4 w-4" />
        Print
      </QuietButton>
    </div>
  );
}

/** Loading (before the first answer) and invalid-range messages. */
export function ReportStatus({ loading, invalid, hasData }) {
  if (invalid) {
    return <Alert tone="warning" role="alert">{invalid}</Alert>;
  }
  if (loading && !hasData) {
    return (
      <div className="flex justify-center rounded-2xl bg-paper px-4 py-8 ring-1 ring-brand-100">
        <LoadingState>Loading report…</LoadingState>
      </div>
    );
  }
  return null;
}
