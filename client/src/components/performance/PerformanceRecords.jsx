import { useEffect, useState } from 'react';
import { PERFORMANCE_AREAS, performanceAreaLabel } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { formatDate } from '../../lib/format.js';
import { StarDisplay } from './StarRating.jsx';
import { Alert, Card, EmptyState, Field, LoadingState, ResponsiveTable, inputClass, TABLE, TD, TH, TR } from '../ui/index.js';
import { StarIcon } from '../ui/icons.jsx';

/**
 * Read-only list of saved evaluations filtered by student, date and area.
 * With no student selected a date is required (the API defaults to today).
 */
export default function PerformanceRecords() {
  const [students, setStudents] = useState([]);
  const [filters, setFilters] = useState({ studentId: '', date: '', area: '' });
  // forFilters = the filters the result belongs to; loading is derived from it.
  const [result, setResult] = useState({ forFilters: null, data: null, error: null });

  useEffect(() => {
    apiRequest('/students?status=all')
      .then(({ students: list }) => setStudents(list.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))))
      .catch(() => setStudents([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    apiRequest(`/performance?${params}`)
      .then((data) => !cancelled && setResult({ forFilters: filters, data, error: null }))
      .catch((error) => !cancelled && setResult({ forFilters: filters, data: null, error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const loading = result.forFilters !== filters;
  const data = result.data;

  const evaluations = data?.evaluations ?? [];

  return (
    <Card padded={false}>
      <div className="border-b border-brand-100 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field id="records-student" label="Student" className="min-w-56 flex-1">
            <select value={filters.studentId} onChange={set('studentId')} className={inputClass()}>
              <option value="">All students</option>
              {students.map((s) => (
                <option key={s.studentId} value={s.studentId}>{s.lastName}, {s.firstName} — {s.studentId}</option>
              ))}
            </select>
          </Field>
          <Field id="records-date" label="Date">
            <input
              type="date"
              value={filters.date || (filters.studentId ? '' : data?.today ?? '')}
              max={data?.today}
              onChange={set('date')}
              className={inputClass({ className: 'w-auto' })}
            />
          </Field>
          <Field id="records-area" label="Performance area">
            <select value={filters.area} onChange={set('area')} className={inputClass({ className: 'w-auto' })}>
              <option value="">All areas</option>
              {PERFORMANCE_AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-sm text-brand-500">
          {filters.studentId && !filters.date ? 'Showing all dates for this student.' : 'Clear the date and pick a student to see all of that student’s dates.'}
        </p>
      </div>

      <div className="p-4 sm:p-5">
        {!loading && result.error && <Alert tone="error" className="mb-4">{result.error}</Alert>}

        {evaluations.length > 0 && (
          <ResponsiveTable label="Performance evaluations">
            <table className={`${TABLE} min-w-[720px]`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Date</th>
                  <th scope="col" className={TH}>Student</th>
                  <th scope="col" className={TH}>Performance Area</th>
                  <th scope="col" className={TH}>Star Rating</th>
                  <th scope="col" className={TH}>Observation</th>
                  <th scope="col" className={TH}>Saved by</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((e) => (
                  <tr key={e.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap text-brand-700`}>{formatDate(e.evaluationDate)}</td>
                    <td className={`${TD} font-medium`}>
                      {e.student?.name ?? e.studentId}
                      <span className="block font-mono text-xs font-normal text-brand-500">{e.studentId}</span>
                    </td>
                    <td className={`${TD} text-brand-700`}>{performanceAreaLabel(e.area)}</td>
                    <td className={`${TD} whitespace-nowrap`}><StarDisplay value={e.starRating} size="text-base" showLabel /></td>
                    <td className={`${TD} whitespace-pre-line text-brand-700`}>{e.observation || '—'}</td>
                    <td className={`${TD} text-brand-700`}>{e.teacherName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
        {!loading && data && evaluations.length === 0 && (
          <EmptyState icon={<StarIcon className="h-6 w-6" />} title="No performance evaluations found." />
        )}
        {loading && !data && <LoadingState className="justify-center py-6">Loading…</LoadingState>}
      </div>
    </Card>
  );
}
