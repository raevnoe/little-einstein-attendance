// Custom illustration for the landing hero: a parent and child arriving at school,
// an attendance check-in card, an SMS on a phone, and a star-rated day.
// Built from simple shapes so it stays light and needs no image assets.

const STAR_PATH =
  'M0 -9L2.23 -3.07L8.56 -2.78L3.61 1.17L5.29 7.28L0 3.8L-5.29 7.28L-3.61 1.17L-8.56 -2.78L-2.23 -3.07Z';

const SKIN = '#e9c2a0';

function Star({ x, y, filled }) {
  return <path d={STAR_PATH} transform={`translate(${x} ${y})`} className={filled ? 'fill-star' : 'fill-brand-100'} />;
}

export default function HeroIllustration({ className = '' }) {
  return (
    <svg
      viewBox="0 0 520 440"
      className={className}
      role="img"
      aria-label="A parent and child arriving at school, with an attendance check-in, an SMS notification and a star-rated day"
    >
      <defs>
        <filter id="hero-card-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#2c2e3c" floodOpacity="0.12" />
        </filter>
      </defs>

      {/* Backdrop */}
      <circle className="fill-brand-50" cx="270" cy="220" r="196" />
      <circle className="fill-leaf-100" cx="430" cy="86" r="34" />
      <ellipse className="fill-leaf-100" cx="262" cy="378" rx="228" ry="20" />

      {/* School building */}
      <line className="stroke-brand-500" x1="260" y1="104" x2="260" y2="62" strokeWidth="3" strokeLinecap="round" />
      <path className="fill-leaf-400" d="M260 62l32 10-32 10z" />
      <path className="fill-brand-500" d="M138 172L260 102l122 70z" />
      <circle className="fill-white" cx="260" cy="146" r="15" />
      <path className="fill-leaf-400" d={STAR_PATH} transform="translate(260 147) scale(0.95)" />
      <rect className="fill-white stroke-brand-200" x="160" y="170" width="200" height="200" rx="6" strokeWidth="2" />
      {[
        [182, 196],
        [298, 196],
        [182, 256],
        [298, 256],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect className="fill-brand-100" x={x} y={y} width="40" height="36" rx="6" />
          <path className="stroke-white" d={`M${x + 20} ${y}v36M${x} ${y + 18}h40`} strokeWidth="3" />
        </g>
      ))}
      <path className="fill-leaf-300" d="M234 370v-52a26 26 0 0152 0v52z" />
      <path className="stroke-leaf-400" d="M260 294v76" strokeWidth="2" />
      <circle className="fill-leaf-700" cx="252" cy="336" r="2.5" />
      <circle className="fill-leaf-700" cx="268" cy="336" r="2.5" />

      {/* Parent */}
      <path className="fill-brand-700" d="M100 340h9v34h-9zM113 340h9v34h-9z" />
      <rect className="fill-brand-500" x="94" y="282" width="34" height="62" rx="15" />
      <circle cx="111" cy="264" r="15" fill={SKIN} />
      <path className="fill-brand-700" d="M96 262a15 15 0 0130 0c-6-6-18-7-30 0z" />
      <path d="M126 300c8 6 12 12 16 22" stroke={SKIN} strokeWidth="6" strokeLinecap="round" fill="none" />

      {/* Child with backpack */}
      <path className="fill-brand-700" d="M144 350h7v24h-7zM155 350h7v24h-7z" />
      <rect className="fill-brand-500" x="134" y="318" width="12" height="24" rx="5" />
      <rect className="fill-leaf-400" x="140" y="314" width="26" height="40" rx="11" />
      <circle cx="153" cy="300" r="12" fill={SKIN} />
      <path className="fill-brand-700" d="M141 298a12 12 0 0124 0c-5-5-15-6-24 0z" />

      {/* Star-rated day card */}
      <g filter="url(#hero-card-shadow)">
        <rect className="fill-white" x="18" y="104" width="150" height="70" rx="16" />
      </g>
      <rect className="fill-brand-200" x="34" y="120" width="64" height="8" rx="4" />
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} x={42 + (n - 1) * 24} y={152} filled={n <= 4} />
      ))}

      {/* Attendance check-in card */}
      <g filter="url(#hero-card-shadow)">
        <rect className="fill-white" x="290" y="312" width="176" height="64" rx="16" />
      </g>
      <circle className="fill-leaf-100" cx="322" cy="344" r="16" />
      <path className="stroke-leaf-700" d="M314 344l6 6 11-12" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect className="fill-brand-500" x="348" y="333" width="92" height="8" rx="4" />
      <rect className="fill-brand-200" x="348" y="349" width="60" height="8" rx="4" />

      {/* Phone with SMS */}
      <g filter="url(#hero-card-shadow)">
        <rect className="fill-brand-900" x="378" y="118" width="116" height="184" rx="20" />
      </g>
      <rect className="fill-white" x="385" y="130" width="102" height="160" rx="13" />
      <rect className="fill-brand-100" x="420" y="136" width="32" height="5" rx="2.5" />
      <path className="fill-leaf-100" d="M395 158h74a8 8 0 018 8v34a8 8 0 01-8 8h-66l-10 8v-50a8 8 0 018-8z" />
      <rect className="fill-leaf-700" x="404" y="170" width="54" height="7" rx="3.5" />
      <rect className="fill-leaf-400" x="404" y="185" width="38" height="7" rx="3.5" />
      <path className="fill-brand-50" d="M403 228h66a8 8 0 018 8v18a8 8 0 01-8 8h-66a8 8 0 01-8-8v-18a8 8 0 018-8z" />
      <rect className="fill-mist-400" x="405" y="240" width="46" height="7" rx="3.5" />
    </svg>
  );
}
