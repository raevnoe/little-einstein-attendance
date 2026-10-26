const TONES = {
  neutral: { card: 'bg-paper ring-brand-100', bar: 'bg-brand-200' },
  good: { card: 'bg-paper ring-brand-100', bar: 'bg-leaf-400' },
  attention: { card: 'bg-amber-50 ring-amber-200', bar: 'bg-amber-400' },
};

/**
 * One number with a label, for dashboards and report totals. `tone` = neutral | good | attention;
 * the coloured bar only supports the label (the text always says what the number means).
 */
export default function StatCard({ label, value, hint, tone = 'neutral' }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <div className={`relative break-inside-avoid overflow-hidden rounded-2xl p-4 pl-5 shadow-sm ring-1 print:shadow-none ${t.card}`}>
      <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-1.5 rounded-r-full ${t.bar}`} />
      <p className="text-sm font-medium text-brand-700">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-brand-900">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-brand-600 dark:text-brand-300">{hint}</p>}
    </div>
  );
}

/** Responsive grid of StatCards: 2 columns on phones, more on wider screens. */
export function StatGrid({ children, className = '' }) {
  return <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 ${className}`}>{children}</div>;
}
