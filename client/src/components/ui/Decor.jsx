// Stage 5 visual language: curved shapes, star motifs and script headings in the logo colours.
// Everything here is decorative (aria-hidden) or a plain heading; no data, no behaviour.
import doodlesGrid from '../../assets/images/doodles-grid.webp';
import doodlesDashed from '../../assets/images/doodles-dashed.webp';

const ACCENT_TEXT = {
  sun: 'text-sun-400',
  leaf: 'text-leaf-400',
  sky: 'text-sky-500',
  grape: 'text-grape-500',
  brand: 'text-brand-600 dark:text-brand-300',
};

/** Four-point sparkle. Colour comes from `currentColor` (pass a text-* class). */
export function Sparkle({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 0c.9 6.4 5.6 11.1 12 12-6.4.9-11.1 5.6-12 12-.9-6.4-5.6-11.1-12-12C6.4 11.1 11.1 6.4 12 0z" />
    </svg>
  );
}

/** Rounded five-point star (the star-rating motif). */
export function StarShape({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Hand-drawn wavy underline used below script headings. */
export function Squiggle({ className = 'h-2.5 w-20', accent = 'sun' }) {
  return (
    <svg viewBox="0 0 80 10" preserveAspectRatio="none" className={`${className} ${ACCENT_TEXT[accent] ?? ACCENT_TEXT.sun}`} fill="none" aria-hidden="true" focusable="false">
      <path d="M2 6c6-5 10-5 16 0s10 5 16 0 10-5 16 0 10 5 16 0 8-4 12-1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const SCRIPT_SIZES = {
  sm: 'text-[1.75rem]',
  md: 'text-[2rem] sm:text-[2.25rem]',
  lg: 'text-[2.5rem] sm:text-5xl',
};

/**
 * Friendly handwritten heading (Caveat) with a wavy underline in a logo colour.
 * Short titles only; the text stays a real heading for screen readers.
 */
export function ScriptHeading({ as: Tag = 'h2', id, accent = 'sun', size = 'md', className = '', children }) {
  return (
    <Tag id={id} className={`font-script leading-none text-brand-700 print:font-sans print:text-xl print:font-bold print:text-brand-900 ${SCRIPT_SIZES[size] ?? SCRIPT_SIZES.md} ${className}`}>
      {children}
      <Squiggle accent={accent} className="mt-1 block h-2.5 w-16 print:hidden" />
    </Tag>
  );
}

// The doodle pictures keep the palette by dropping their own colours: grey "pencil" lines on
// light backgrounds; on navy, a copy pre-converted to white lines on transparent (doodles-dashed.webp).
const DOODLES = {
  light: { image: doodlesGrid, className: 'opacity-[0.13] grayscale' },
  dark: { image: doodlesDashed, className: 'opacity-[0.18]' },
};

/** Repeating school doodles behind a section (place inside a `relative` parent). Decorative only. */
export function DoodleBackdrop({ tone = 'light', size = 560, className = '' }) {
  const { image, className: look } = DOODLES[tone] ?? DOODLES.light;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 bg-repeat print:hidden ${look} ${className}`}
      style={{ backgroundImage: `url(${image})`, backgroundSize: `${size}px auto` }}
    />
  );
}

/** Background shapes for HeroBanner: doodles, logo-colour circles, a ring, sparkles and a soft wave. */
function HeroShapes() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 print:hidden">
      <DoodleBackdrop tone="dark" />
      <span className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-grape-500/70" />
      <span className="absolute -bottom-20 right-1/4 hidden h-44 w-44 rounded-full border-[16px] border-sky-500/40 sm:block" />
      <span className="absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-leaf-400/35" />
      <span className="absolute right-8 top-6 h-4 w-4 rounded-full bg-sun-400" />
      <Sparkle className="absolute right-[38%] top-5 hidden h-5 w-5 text-sun-400 sm:block" />
      <Sparkle className="absolute bottom-6 right-10 h-6 w-6 text-sky-300" />
      <StarShape className="absolute left-[46%] bottom-4 hidden h-4 w-4 text-sun-400/80 md:block" />
      <svg viewBox="0 0 600 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-10 w-full text-white/[0.07]" fill="currentColor">
        <path d="M0 38C120 8 230 60 360 34S540 6 600 26V60H0z" />
      </svg>
    </div>
  );
}

/**
 * Bold page hero (navy, curved logo-colour shapes, script title) for home screens only - never on
 * the busy work screens. Hidden when printing. `aside` sits on the right from 1024px.
 */
export function HeroBanner({ eyebrow, title, titleId, as: Heading = 'h1', description, aside, children, className = '' }) {
  return (
    <section aria-labelledby={titleId} className={`relative isolate overflow-hidden rounded-[2rem] bg-brand-600 text-white shadow-sm print:hidden ${className}`}>
      <HeroShapes />
      <div className="relative grid gap-6 px-6 py-7 sm:px-9 sm:py-9 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-100 dark:text-sky-300">{eyebrow}</p>}
          <Heading id={titleId} className="mt-2 font-script text-[2.75rem] leading-[0.95] text-white sm:text-[3.5rem]">
            {title}
          </Heading>
          {description && <p className="mt-3 max-w-2xl text-base text-white/90">{description}</p>}
          {children && <div className="mt-5">{children}</div>}
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
    </section>
  );
}

const AVATAR_TONES = {
  leaf: 'bg-leaf-100 text-leaf-700',
  grape: 'bg-grape-100 text-grape-700',
  sky: 'bg-sky-100 text-sky-700',
  brand: 'bg-brand-100 text-brand-700',
  sun: 'bg-sun-100 text-sun-700',
};

/** Round initials badge (decorative; the name is always written next to it). */
export function InitialsAvatar({ text, tone = 'leaf', className = 'h-12 w-12 text-base' }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_TONES[tone] ?? AVATAR_TONES.leaf} ${className}`}>
      {text}
    </span>
  );
}
