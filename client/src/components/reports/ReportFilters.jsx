import { useEffect, useState } from 'react';
import { PERFORMANCE_AREAS } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { RANGE_PRESETS, presetRange } from '../../lib/dateRange.js';
import { studentFullName } from '../../lib/format.js';
import { FOCUS_RING, LABEL, inputClass } from '../ui/index.js';
import { CalendarIcon } from '../ui/icons.jsx';

const INPUT = inputClass();

/** Student list for the student filter (staff API; includes inactive students for history). */
function useStudentOptions() {
  const [students, setStudents] = useState([]);
  useEffect(() => {
    let cancelled = false;
    apiRequest('/students?status=all')
      .then(({ students: list }) => !cancelled && setStudents(
        [...list].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)),
      ))
      .catch(() => {}); // the filter still works without the list (the report itself shows errors)
    return () => {
      cancelled = true;
    };
  }, []);
  return students;
}

/**
 * Date range + section/student (+ area) filters. `filters` = { from, to, section, studentId, area? }.
 * `today` and `sections` come from the last report the server returned.
 */
export default function ReportFilters({ filters, onChange, today, sections = [], showArea = false, idPrefix }) {
  const students = useStudentOptions();
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  const id = (name) => `${idPrefix}-${name}`;
  const visibleStudents = students.filter((s) => !filters.section || s.section?.toLowerCase() === filters.section.toLowerCase());

  return (
    <div className="space-y-4 print:hidden">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick date ranges">
        <CalendarIcon className="h-5 w-5 text-brand-500" />
        {RANGE_PRESETS.map((p) => {
          const range = today ? presetRange(p.key, today) : null;
          const active = range && range.from === filters.from && range.to === filters.to;
          return (
            <button
              key={p.key}
              type="button"
              disabled={!today}
              aria-pressed={Boolean(active)}
              onClick={() => onChange({ ...filters, ...range })}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold motion-safe:transition-colors disabled:opacity-50 ${FOCUS_RING} ${
                active ? 'bg-brand-600 text-white shadow-sm' : 'bg-paper text-brand-700 ring-1 ring-brand-200 hover:bg-sun-50 hover:ring-brand-300'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 ${showArea ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <div>
          <label htmlFor={id('from')} className={LABEL}>From</label>
          <input id={id('from')} type="date" value={filters.from} max={today} onChange={set('from')} className={INPUT} />
        </div>
        <div>
          <label htmlFor={id('to')} className={LABEL}>To</label>
          <input id={id('to')} type="date" value={filters.to} max={today} onChange={set('to')} className={INPUT} />
        </div>
        <div>
          <label htmlFor={id('section')} className={LABEL}>Section</label>
          <select
            id={id('section')}
            value={filters.section}
            onChange={(e) => onChange({ ...filters, section: e.target.value, studentId: '' })}
            className={INPUT}
          >
            <option value="">All sections</option>
            {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={id('student')} className={LABEL}>Student</label>
          <select id={id('student')} value={filters.studentId} onChange={set('studentId')} className={INPUT}>
            <option value="">All students</option>
            {visibleStudents.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.lastName}, {studentFullName({ ...s, lastName: '' })} ({s.studentId}){s.active ? '' : ' – inactive'}
              </option>
            ))}
          </select>
        </div>
        {showArea && (
          <div>
            <label htmlFor={id('area')} className={LABEL}>Area</label>
            <select id={id('area')} value={filters.area} onChange={set('area')} className={INPUT}>
              <option value="">All areas</option>
              {PERFORMANCE_AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
