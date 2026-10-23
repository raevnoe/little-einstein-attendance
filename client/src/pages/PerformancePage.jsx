import { useState } from 'react';
import DailyEvaluation from '../components/performance/DailyEvaluation.jsx';
import PerformanceRecords from '../components/performance/PerformanceRecords.jsx';
import { FOCUS_RING } from '../components/ui/classes.js';

const VIEWS = [
  { key: 'evaluate', label: 'Daily Evaluation' },
  { key: 'records', label: 'All Records' },
];

/**
 * Student Performance Evaluation for staff (admin and teacher): daily star ratings and
 * observations per performance area. Not a grading system. The API enforces access.
 */
export default function PerformancePage() {
  const [view, setView] = useState('evaluate');

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-brand-100 bg-canvas p-1" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold motion-safe:transition-colors ${FOCUS_RING} ${
              view === v.key ? 'bg-white text-brand-900 shadow-sm ring-1 ring-brand-100' : 'text-brand-700 hover:bg-white/70'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === 'evaluate' ? <DailyEvaluation /> : <PerformanceRecords />}
    </div>
  );
}
