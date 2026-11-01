import { useState } from 'react';
import Panel, { ErrorMessage } from '../Panel.jsx';
import { useApiData } from '../../lib/useApiData.js';
import { durationText, formatDayDate, formatTime } from '../../lib/format.js';
import { LoadingState } from '../ui/index.js';
import { ArrowLeftIcon, ArrowRightIcon } from '../ui/icons.jsx';

// GET /api/parent/children/:studentId/calendar?month=YYYY-MM (the server decides every day's status
// from the attendance records, the school calendar and the class end time).
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Colour is never the only signal: each day also has a text label (title + screen readers) and the legend.
const STYLES = {
  present: { cell: 'bg-leaf-100 text-leaf-700 ring-leaf-300', label: 'Present', dot: 'bg-leaf-400' },
  late: { cell: 'bg-sun-100 text-sun-700 ring-sun-400', label: 'Late', dot: 'bg-sun-400' },
  excused: { cell: 'bg-sun-100 text-sun-700 ring-sun-400', label: 'Late (excused)', dot: 'bg-sun-400' },
  absent: { cell: 'bg-red-100 text-red-700 ring-red-400', label: 'Absent', dot: 'bg-red-600' },
  'not-arrived': { cell: 'bg-paper text-brand-700 ring-brand-200', label: 'Not yet arrived', dot: 'bg-mist-400' },
  'no-class': { cell: 'bg-canvas text-mist-400 ring-transparent', label: 'No class', dot: 'bg-brand-200' },
  future: { cell: 'bg-paper text-brand-300 ring-transparent', label: '', dot: '' },
};

const LEGEND = ['present', 'late', 'absent', 'no-class'];

const monthLabel = (month) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
function shiftMonth(month, by) {
  const d = new Date(`${month}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

/** One line about a day, for the details under the calendar. */
function dayDetails(day, timeZone) {
  const style = STYLES[day.status];
  if (day.status === 'no-class') return `No class${day.note ? ` · ${day.note}` : ''}`;
  if (day.status === 'absent') return 'Absent · no arrival was recorded';
  if (day.status === 'not-arrived') return 'Not yet arrived';
  const parts = [style.label];
  if (day.lateMinutes) parts[0] = `${style.label} · ${durationText(day.lateMinutes)} late`;
  parts.push(`Arrived ${formatTime(day.timeIn, timeZone)}`);
  if (day.timeOut) {
    parts.push(`Picked up ${formatTime(day.timeOut, timeZone)}${day.departureStatus === 'early' && day.earlyMinutes ? ` (${durationText(day.earlyMinutes)} early)` : ''}`);
  }
  return parts.join(' · ');
}

/** A parent's month view: green present, yellow late, red absent, grey no class. */
export default function ChildCalendar({ studentId }) {
  const [month, setMonth] = useState('');
  const [selected, setSelected] = useState(null);
  const query = month ? `?month=${month}` : '';
  const { loading, data, error, reload } = useApiData(`/parent/children/${encodeURIComponent(studentId)}/calendar${query}`);
  const cal = data?.calendar;
  const thisMonth = cal?.today.slice(0, 7);
  const go = (by) => {
    setMonth(shiftMonth(cal.month, by));
    setSelected(null);
  };

  const firstWeekday = cal ? new Date(`${cal.month}-01T12:00:00Z`).getUTCDay() : 0;
  const selectedDay = cal?.days.find((d) => d.date === selected);

  return (
    <Panel
      title="Attendance Calendar"
      titleId={`calendar-${studentId}`}
      subtitle={cal ? `${cal.summary.present} present · ${cal.summary.late} late · ${cal.summary.absent} absent this month` : 'Loading…'}
      script
      accent="sky"
    >
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {cal && (
        <>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button type="button" onClick={() => go(-1)} disabled={loading} className="rounded-xl p-2 text-brand-700 hover:bg-brand-50" aria-label="Previous month">
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <p className="font-semibold text-brand-900" aria-live="polite">{monthLabel(cal.month)}</p>
            <button type="button" onClick={() => go(1)} disabled={loading || cal.month >= thisMonth} className="rounded-xl p-2 text-brand-700 hover:bg-brand-50 disabled:opacity-30" aria-label="Next month">
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          </div>

          <div role="group" aria-label={`Attendance for ${monthLabel(cal.month)}`} className="mt-3">
            <div aria-hidden="true" className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-brand-500">
              {WEEKDAYS.map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstWeekday }, (_, i) => <span key={`pad-${i}`} aria-hidden="true" />)}
              {cal.days.map((day) => {
                const style = STYLES[day.status] ?? STYLES.future;
                const isToday = day.date === cal.today;
                const label = `${formatDayDate(day.date, { long: true })}${style.label ? `: ${style.label}` : ''}`;
                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={day.status === 'future'}
                    onClick={() => setSelected(day.date)}
                    aria-label={label}
                    aria-pressed={selected === day.date}
                    title={label}
                    className={`flex aspect-square min-h-9 items-center justify-center rounded-xl text-sm font-semibold ring-1 ring-inset ${style.cell} ${isToday ? 'outline outline-2 outline-offset-1 outline-brand-500' : ''} ${selected === day.date ? 'ring-2 ring-brand-600' : ''}`}
                  >
                    {Number(day.date.slice(8))}
                  </button>
                );
              })}
            </div>
          </div>

          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-700" aria-label="Legend">
            {LEGEND.map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-3 w-3 rounded-full ${STYLES[key].dot}`} />
                {STYLES[key].label}
              </li>
            ))}
          </ul>

          <p className="mt-3 min-h-5 text-sm text-brand-900" aria-live="polite">
            {selectedDay ? (
              <>
                <strong>{formatDayDate(selectedDay.date, { long: true })}:</strong> {dayDetails(selectedDay, cal.timeZone)}
              </>
            ) : (
              <span className="text-brand-500">Tap a day to see the times.</span>
            )}
          </p>
        </>
      )}
      {loading && !cal && <LoadingState className="mt-4">Loading calendar…</LoadingState>}
    </Panel>
  );
}
