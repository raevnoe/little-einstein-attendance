const TONES = {
  neutral: 'bg-canvas text-brand-700 ring-brand-100',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-leaf-50 text-leaf-700 ring-leaf-100',
  info: 'bg-sky-50 text-sky-700 ring-sky-100',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  grape: 'bg-grape-50 text-grape-700 ring-grape-100',
};

/** Small status label. The text always states the status; colour only supports it. */
export default function Badge({ tone = 'neutral', dot = false, className = '', children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone] ?? TONES.neutral} ${className}`}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
