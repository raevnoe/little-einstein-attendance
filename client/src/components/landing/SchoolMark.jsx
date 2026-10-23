import logoUrl from '../../assets/school-logo.png';

// Official Little Einstein Discovery School logo (client/brand/official-logo.png, resized by
// scripts/generate-icons.mjs). Never recolour, crop or stretch it: width/height keep the 640x575
// aspect ratio and only one dimension is set in CSS (the other is auto).
const LOGO_WIDTH = 640;
const LOGO_HEIGHT = 575;

/**
 * The logo image. `decorative` when the school name is written right next to it (screen readers
 * then hear the name once); otherwise it carries the school name as its alt text.
 */
export function SchoolLogo({ className = 'h-12 w-auto', decorative = false }) {
  return (
    <img
      src={logoUrl}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      alt={decorative ? '' : 'Little Einstein Discovery School logo'}
      className={`shrink-0 object-contain ${className}`}
      decoding="async"
    />
  );
}

/** Logo + school name, used in headers. `compact` hides the second line on very small screens. */
export default function SchoolMark({ compact = false, logoClassName = 'h-11 w-auto' }) {
  return (
    <span className="flex items-center gap-3">
      <SchoolLogo decorative className={logoClassName} />
      <span className="leading-tight">
        <span className="block text-sm font-bold text-brand-900 sm:text-base">Little Einstein</span>
        <span className={`${compact ? 'hidden sm:block' : 'block'} text-xs font-semibold text-brand-500`}>
          Discovery School
        </span>
      </span>
    </span>
  );
}
