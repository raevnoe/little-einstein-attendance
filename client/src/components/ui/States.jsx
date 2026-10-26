/** Loading text with a small spinner (the spinner only moves when reduced motion is not requested). */
export function LoadingState({ children = 'Loading…', className = '' }) {
  return (
    <p role="status" className={`flex items-center gap-3 text-sm text-brand-500 ${className}`}>
      <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-brand-100 border-t-brand-600 motion-safe:animate-spin" />
      {children}
    </p>
  );
}

/** Nothing to show yet. Never filled with sample data. */
export function EmptyState({ icon, title, children, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-dashed border-brand-200 px-6 py-10 text-center ${className}`}>
      {icon && (
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:text-brand-300">
          {icon}
        </span>
      )}
      <p className={`${icon ? 'mt-4' : ''} text-base font-semibold text-brand-900`}>{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-brand-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
