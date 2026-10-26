import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { Alert, LoadingState, inputClass, LABEL } from '../ui/index.js';

/**
 * Lists students eligible for a card: active and without an RFID card.
 * This is only a convenience - the server re-checks eligibility when assigning.
 */
export default function StudentPicker({ value, onChange, excludeStudentId }) {
  const [state, setState] = useState({ loading: true, students: [], error: null });
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiRequest('/students?status=active')
      .then((data) => setState({
        loading: false,
        students: data.students.filter((s) => !s.rfidAssigned && s.studentId !== excludeStudentId),
        error: null,
      }))
      .catch((error) => setState({ loading: false, students: [], error: error.message }));
  }, [excludeStudentId]);

  const term = search.trim().toLowerCase();
  const visible = state.students.filter((s) =>
    !term || [s.studentId, s.firstName, s.middleName, s.lastName, s.section].join(' ').toLowerCase().includes(term));

  if (state.loading) return <LoadingState>Loading students…</LoadingState>;
  if (state.error) return <Alert tone="error">{state.error}</Alert>;
  if (state.students.length === 0) {
    return <p className="text-sm text-brand-700">No active students without an RFID card.</p>;
  }

  return (
    <div>
      <label htmlFor="picker-search" className={LABEL}>Select Student</label>
      <input
        id="picker-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Student ID or name"
        className={inputClass()}
      />
      <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1" role="radiogroup" aria-label="Students">
        {visible.map((s) => {
          const checked = value?.studentId === s.studentId;
          return (
            <label
              key={s.studentId}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm motion-safe:transition-colors ${
                checked ? 'border-brand-500 bg-brand-50' : 'border-brand-100 bg-paper hover:bg-canvas'
              }`}
            >
              <input type="radio" name="picker-student" checked={checked} onChange={() => onChange(s)} className="h-4 w-4 accent-brand-600" />
              <span className="font-mono text-brand-500">{s.studentId}</span>
              <span className="font-medium text-brand-900">{s.lastName}, {s.firstName}</span>
              <span className="ml-auto text-xs text-brand-500">{s.section}</span>
            </label>
          );
        })}
        {visible.length === 0 && <p className="text-sm text-brand-500">No matching students.</p>}
      </div>
    </div>
  );
}
