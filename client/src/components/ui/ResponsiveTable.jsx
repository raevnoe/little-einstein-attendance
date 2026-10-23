/**
 * Lets a wide table scroll sideways inside its card on small screens instead of widening the page.
 * Keyboard users can focus the region to scroll it. Use with TABLE / TH / TD / TR from classes.js.
 * `relative` keeps absolutely positioned children (e.g. sr-only labels) clipped inside the
 * scroller, so they cannot widen the page.
 */
export default function ResponsiveTable({ label, className = '', children }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`relative overflow-x-auto rounded-xl border border-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 print:overflow-visible print:border-0 ${className}`}
    >
      {children}
    </div>
  );
}
