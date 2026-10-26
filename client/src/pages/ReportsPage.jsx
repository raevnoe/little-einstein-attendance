import { useState } from 'react';
import AttendanceReport from '../components/reports/AttendanceReport.jsx';
import PerformanceReport from '../components/reports/PerformanceReport.jsx';
import { FOCUS_RING } from '../components/ui/index.js';
import { AttendanceIcon, StarIcon } from '../components/ui/icons.jsx';

const VIEWS = [
  { key: 'attendance', label: 'Attendance', icon: AttendanceIcon },
  { key: 'performance', label: 'Performance Evaluation', icon: StarIcon },
];

/** Reports for staff (admin and teacher). The API checks the role on every request. */
export default function ReportsPage() {
  const [view, setView] = useState('attendance');

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-brand-100 bg-canvas p-1 print:hidden" role="tablist" aria-label="Report type">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold motion-safe:transition-colors ${FOCUS_RING} ${
              view === key ? 'bg-paper text-brand-900 shadow-sm ring-1 ring-brand-100' : 'text-brand-700 hover:bg-paper/70'
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
            {label}
          </button>
        ))}
      </div>
      {view === 'attendance' ? <AttendanceReport /> : <PerformanceReport />}
    </div>
  );
}
