import { MAX_STAR_RATING, starRatingLabel } from '@led/shared';

const STARS = Array.from({ length: MAX_STAR_RATING }, (_, i) => i + 1);

/**
 * Read-only stars, e.g. ★★★★☆. `value` may be a decimal (Daily Average); it is shown rounded.
 * `showLabel` adds the rating's word ("Very good") - for one area's rating, not for averages.
 */
export function StarDisplay({ value, size = 'text-lg', showLabel = false }) {
  const filled = Math.round(value ?? 0);
  const word = showLabel ? starRatingLabel(value) : '';
  const stars = (
    <span className={`${size} leading-none tracking-wide`} role="img" aria-label={`${value ?? 0} of ${MAX_STAR_RATING} stars${word ? `, ${word}` : ''}`}>
      {STARS.map((n) => (
        <span key={n} className={n <= filled ? 'text-star' : 'text-star-empty'}>{n <= filled ? '★' : '☆'}</span>
      ))}
    </span>
  );
  if (!word) return stars;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {stars}
      <span aria-hidden="true" className="text-xs font-semibold text-brand-600 dark:text-brand-300">{word}</span>
    </span>
  );
}

const STAR_PATH = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z';

/** Large (44px) tap targets for choosing 1-5 stars (tablet friendly), with the rating's word. */
export function StarInput({ value, onChange, disabled, label }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-label={label} className="flex gap-0.5">
        {STARS.map((n) => {
          const filled = Boolean(value) && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}, ${starRatingLabel(n)}`}
              disabled={disabled}
              onClick={() => onChange(n)}
              className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-sun-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true" focusable="false">
                <path d={STAR_PATH} strokeWidth="1.5" strokeLinejoin="round" className={filled ? 'fill-star stroke-star' : 'fill-paper stroke-star-empty'} />
              </svg>
            </button>
          );
        })}
      </div>
      <span aria-hidden="true" className="text-sm font-semibold text-brand-500">
        {value ? `${value} of ${MAX_STAR_RATING} · ${starRatingLabel(value)}` : 'Not rated'}
      </span>
    </div>
  );
}
