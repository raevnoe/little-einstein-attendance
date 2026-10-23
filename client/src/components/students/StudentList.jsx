import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import StatusBadge from '../StatusBadge.jsx';
import { Alert, Card, EmptyState, Field, LoadingState, ResponsiveTable, buttonClass, inputClass, TABLE, TD, TH, TR } from '../ui/index.js';
import { PlusIcon, StudentsIcon } from '../ui/icons.jsx';

const SEARCH_DELAY_MS = 300;

export default function StudentList({ canManage, onView, onAdd }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [result, setResult] = useState({ loading: true, students: [], error: null });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set('q', search.trim());
      setResult((r) => ({ ...r, loading: true, error: null }));
      apiRequest(`/students?${params}`)
        .then((data) => !cancelled && setResult({ loading: false, students: data.students, error: null }))
        .catch((error) => !cancelled && setResult({ loading: false, students: [], error: error.message }));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status]);

  const students = result.students;
  const fullName = (s) => `${s.lastName}, ${s.firstName}${s.middleName ? ` ${s.middleName}` : ''}`;
  const rfidText = (s) => (s.rfidAssigned ? 'Assigned' : 'Not Assigned');

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-brand-100 p-4 sm:p-5">
        <Field id="student-search" label="Search" className="min-w-48 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Student ID, name, or section"
            className={inputClass()}
          />
        </Field>
        <Field id="student-status" label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass({ className: 'w-auto' })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </Field>
        {canManage && (
          <button type="button" onClick={onAdd} className={buttonClass()}>
            <PlusIcon className="h-4 w-4" />
            Add Student
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {result.error && <Alert tone="error" className="mb-4">{result.error}</Alert>}

        {students.length > 0 && (
          <ResponsiveTable label="Students" className="hidden sm:block">
            <table className={`${TABLE} min-w-[640px]`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>Student ID</th>
                  <th scope="col" className={TH}>Name</th>
                  <th scope="col" className={TH}>Section</th>
                  <th scope="col" className={TH}>Gender</th>
                  <th scope="col" className={TH}>RFID</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId} className={TR}>
                    <td className={`${TD} font-mono text-brand-700`}>{s.studentId}</td>
                    <td className={`${TD} font-medium`}>{fullName(s)}</td>
                    <td className={`${TD} text-brand-700`}>{s.section}</td>
                    <td className={`${TD} text-brand-700`}>{s.gender}</td>
                    <td className={`${TD} text-brand-700`}>{rfidText(s)}</td>
                    <td className={TD}><StatusBadge active={s.active} /></td>
                    <td className={`${TD} text-right`}>
                      <button type="button" onClick={() => onView(s.studentId)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        {students.length > 0 && (
          <ul className="space-y-3 sm:hidden" aria-label="Students">
            {students.map((s) => (
              <li key={s.studentId} className="rounded-2xl border border-brand-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-900">{fullName(s)}</p>
                    <p className="text-sm text-brand-500"><span className="font-mono">{s.studentId}</span> · {s.section}</p>
                  </div>
                  <StatusBadge active={s.active} />
                </div>
                <p className="mt-2 text-sm text-brand-700">{s.gender} · RFID: {rfidText(s)}</p>
                <button type="button" onClick={() => onView(s.studentId)} className={buttonClass({ variant: 'secondary', size: 'sm', block: true, className: 'mt-3' })}>
                  View
                </button>
              </li>
            ))}
          </ul>
        )}

        {!result.loading && !result.error && students.length === 0 && (
          <EmptyState icon={<StudentsIcon className="h-6 w-6" />} title="No students found." />
        )}
        {result.loading && <LoadingState className="justify-center py-6">Loading students…</LoadingState>}
      </div>
    </Card>
  );
}
