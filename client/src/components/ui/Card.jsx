import { CARD } from './classes.js';
import { Squiggle } from './Decor.jsx';

/** White content card. `as` lets it be a <section>, <li>, <article>… */
export default function Card({ as: Tag = 'div', padded = true, className = '', children, ...props }) {
  return (
    <Tag className={`${CARD} ${padded ? 'p-5 sm:p-6' : ''} ${className}`} {...props}>
      {children}
    </Tag>
  );
}

/**
 * Heading row for a card: title, optional subtitle, optional actions on the right.
 * `script` shows the title in the handwritten heading font with a wavy underline in `accent`.
 */
export function CardHeader({ title, titleId, subtitle, actions, icon, script = false, accent = 'sun', className = '' }) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:text-brand-300" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          {script ? (
            <h2 id={titleId} className="font-script text-[2rem] leading-none text-brand-700 print:font-sans print:text-lg print:font-semibold print:leading-snug print:text-brand-900">
              {title}
              <Squiggle accent={accent} className="mt-1 block h-2.5 w-14 print:hidden" />
            </h2>
          ) : (
            <h2 id={titleId} className="text-lg font-semibold text-brand-900">{title}</h2>
          )}
          {subtitle && <p className={`${script ? 'mt-1.5' : 'mt-0.5'} text-sm text-brand-500`}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
