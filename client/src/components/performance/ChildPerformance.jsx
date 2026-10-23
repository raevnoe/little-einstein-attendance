import { useEffect, useRef, useState } from 'react';
import { performanceAreaLabel } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { formatDate, formatDayDate } from '../../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import { StarDisplay } from './StarRating.jsx';
import { LoadingState, StarShape, inputClass } from '../ui/index.js';

const DAYS_STEP = 3;

/** One evaluation day: a summary row (date + Daily Average Star Rating) that expands to every area. */
function EvaluationDay({ day, defaultOpen }) {
  return (
    <li>
      <details open={defaultOpen} className="group overflow-hidden rounded-2xl bg-white ring-1 ring-brand-100 open:shadow-sm">
        <summary className={`flex min-h-12 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 hover:bg-canvas [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500`}>
          <span className="flex items-center gap-3 font-semibold text-brand-900">
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun-50 text-star">
              <StarShape className="h-5 w-5" />
            </span>
            {formatDayDate(day.evaluationDate)}
          </span>
          <span className="flex items-center gap-2 text-sm text-brand-700">
            <span className="sr-only">Daily Average Star Rating</span>
            <StarDisplay value={day.dailyAverageStarRating} size="text-lg" />
            <span aria-hidden="true" className="font-semibold">{day.dailyAverageStarRating} of 5</span>
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-brand-500 motion-safe:transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 7.5l5 5 5-5" />
            </svg>
          </span>
        </summary>
        <div className="border-t border-brand-100 bg-canvas/60 px-4 pb-4 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Daily Average Star Rating · {day.dailyAverageStarRating} of 5</p>
          <ul className="mt-3 space-y-2.5">
            {day.evaluations.map((e) => (
              <li key={e.area} className="rounded-xl bg-white p-3 text-sm ring-1 ring-brand-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-brand-900">{performanceAreaLabel(e.area)}</span>
                  <StarDisplay value={e.starRating} size="text-lg" showLabel />
                </div>
                {e.observation && (
                  <figure className="mt-2 rounded-xl border-l-4 border-sky-300 bg-sky-50 px-3 py-2">
                    <figcaption className="text-xs font-semibold uppercase tracking-wide text-sky-700">Teacher’s observation</figcaption>
                    <blockquote className="mt-0.5 whitespace-pre-line text-brand-900">{e.observation}</blockquote>
                  </figure>
                )}
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

/**
 * A parent's READ-ONLY view of ONE own child's Performance Evaluations (the server
 * returns 404 for anyone else's child). Without a date: the last 30 days, newest first.
 * `initialDate` (optional, YYYY-MM-DD) opens that day, e.g. from a notification; `onLoaded` is
 * called once that first result is on screen (so the page can scroll to it).
 */
export default function ChildPerformance({ studentId, initialDate = '', onLoaded }) {
  const [date, setDate] = useState(initialDate);
  const [visible, setVisible] = useState(DAYS_STEP);
  // forDate = the date filter the result belongs to; loading is derived from it.
  const [state, setState] = useState({ forDate: null, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const query = date ? `?${new URLSearchParams({ date })}` : '';
    apiRequest(`/parent/children/${encodeURIComponent(studentId)}/performance${query}`)
      .then(({ performance }) => !cancelled && setState({ forDate: date, data: performance, error: null }))
      .catch((error) => !cancelled && setState({ forDate: date, data: null, error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [studentId, date]);

  function changeDate(value) {
    setDate(value);
    setVisible(DAYS_STEP);
  }

  const loading = state.forDate !== date;
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    if (loading || !onLoadedRef.current) return;
    onLoadedRef.current();
    onLoadedRef.current = null;
  }, [loading]);
  const data = loading ? null : state.data;
  const days = data?.days ?? [];
  const inputId = `performance-date-${studentId}`;

  return (
    <Panel
      title="Student Performance"
      titleId={`performance-${studentId}`}
      subtitle={date ? formatDate(date) : 'Last 30 days, newest first'}
      script
      accent="grape"
      actions={
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:flex-none">
            <label htmlFor={inputId} className="block text-xs font-semibold text-brand-600">Date</label>
            <input
              id={inputId}
              type="date"
              value={date}
              max={state.data?.today}
              onChange={(e) => changeDate(e.target.value)}
              className={inputClass({ className: 'text-sm' })}
            />
          </div>
          {date && (
            <QuietButton onClick={() => changeDate('')}>Last 30 days</QuietButton>
          )}
        </div>
      }
    >
      {!loading && state.error && <ErrorMessage message={state.error} />}
      {loading && <LoadingState className="mt-4">Loading performance…</LoadingState>}
      {data && days.length === 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-brand-200 px-4 py-4 text-sm text-brand-700">
          <StarShape className="h-5 w-5 shrink-0 text-star-empty" />
          {date ? `No performance evaluations on ${formatDate(date)}.` : 'No performance evaluations in the last 30 days.'}
        </div>
      )}

      {days.length > 0 && (
        <ul className="mt-5 space-y-3">
          {days.slice(0, visible).map((day, index) => (
            <EvaluationDay key={day.evaluationDate} day={day} defaultOpen={index === 0} />
          ))}
        </ul>
      )}

      {days.length > DAYS_STEP && (
        <div className="mt-3">
          {visible < days.length ? (
            <QuietButton onClick={() => setVisible((n) => n + DAYS_STEP)} className="w-full">
              Show more ({days.length - visible} more {days.length - visible === 1 ? 'day' : 'days'})
            </QuietButton>
          ) : (
            <QuietButton onClick={() => setVisible(DAYS_STEP)} className="w-full">
              Show fewer
            </QuietButton>
          )}
        </div>
      )}
    </Panel>
  );
}
