// Shared Tailwind class strings for the redesigned UI. Components in this folder use them, and
// screens that still build their own markup can reuse them instead of copying class lists.

export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-paper';

const BUTTON_BASE = `inline-flex items-center justify-center gap-2 rounded-xl font-semibold motion-safe:transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

const BUTTON_VARIANTS = {
  // dark: brand-700 is a light TEXT colour there, so hovering brightens the button instead.
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:hover:bg-brand-600 dark:hover:brightness-125',
  secondary: 'border border-brand-200 bg-paper text-brand-700 hover:border-brand-500 hover:bg-brand-50',
  danger: 'border border-red-200 bg-paper text-red-700 hover:border-red-400 hover:bg-red-50',
  'danger-solid': 'bg-red-700 text-white shadow-sm hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-500',
  quiet: 'text-brand-700 hover:bg-brand-50',
};

const BUTTON_SIZES = {
  sm: 'min-h-10 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
  // Square icon-only button (44px); give it an accessible name (aria-label).
  icon: 'h-11 w-11 shrink-0 text-sm',
};

/** Class list for a button or a link styled as a button. */
export function buttonClass({ variant = 'primary', size = 'md', block = false, className = '' } = {}) {
  return [BUTTON_BASE, BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary, BUTTON_SIZES[size] ?? BUTTON_SIZES.md, block ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');
}

export const LABEL = 'block text-sm font-semibold text-brand-900';
export const HINT = 'mt-1 text-sm text-brand-500';
export const FIELD_ERROR = 'mt-1 text-sm font-medium text-red-700';

/** Text input / select / textarea. Invalid fields get a red border (the message says why). */
export function inputClass({ invalid = false, className = '' } = {}) {
  return [
    'mt-1 block min-h-11 w-full rounded-xl border bg-paper px-3 py-2 text-base text-brand-900 placeholder:text-mist-400',
    'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-brand-500',
    invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-brand-200 focus:border-brand-500 focus:ring-brand-100',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export const CARD = 'rounded-2xl border border-brand-100 bg-paper shadow-sm';

// Tables: wrap in <ResponsiveTable> so wide tables scroll inside their card on small screens.
export const TABLE = 'min-w-full text-left text-sm';
export const TH = 'whitespace-nowrap bg-canvas px-4 py-3 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300';
export const TD = 'px-4 py-3 align-top text-brand-900';
export const TR = 'border-t border-brand-100 hover:bg-canvas/70';

// A physical UHF RFID UID, shown as a monospace "chip" so it is never confused with a Student ID.
export const UID_CHIP = 'inline-block rounded-lg bg-canvas px-2 py-1 font-mono text-xs text-brand-700 ring-1 ring-inset ring-brand-100';
