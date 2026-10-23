import { useEffect, useState } from 'react';
import SchoolMark, { SchoolLogo } from '../components/landing/SchoolMark.jsx';
import { DoodleBackdrop } from '../components/ui/Decor.jsx';
import classroomPhoto from '../assets/images/classroom.webp';
import teamworkImage from '../assets/images/teamwork-hands.webp';
import BrandStripe from '../components/ui/BrandStripe.jsx';
import { buttonClass, FOCUS_RING } from '../components/ui/classes.js';
import { AttendanceIcon, CheckCircleIcon, CloseIcon, DismissalIcon, DownloadIcon, InfoIcon, MenuIcon, PhoneIcon, StarIcon } from '../components/ui/icons.jsx';
import { useInstallPrompt } from '../lib/useInstallPrompt.js';

const NAV_LINKS = [
  { href: '#home', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#help', label: 'Help' },
];

const NAV_LINK = `inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-brand-700 motion-safe:transition-colors hover:bg-brand-50 hover:text-brand-900 ${FOCUS_RING}`;

// Section anchors sit below the sticky header.
const SECTION = 'scroll-mt-24';

// Accent colours are the logo's orbit colours; the text inside each tile uses the AA-safe dark shade.
const FEATURES = [
  {
    title: 'Attendance',
    text: 'Stay informed when your child arrives at and leaves school.',
    icon: AttendanceIcon,
    tile: 'bg-sky-50 text-sky-700',
  },
  {
    title: 'Performance',
    text: "View your child's daily learning and classroom performance.",
    icon: StarIcon,
    tile: 'bg-sun-50 text-sun-700',
  },
  {
    title: 'SMS Notifications',
    text: 'Receive important attendance and dismissal notifications directly on your phone.',
    icon: PhoneIcon,
    tile: 'bg-leaf-50 text-leaf-700',
  },
  {
    title: 'Safe Dismissal',
    text: 'When someone else will fetch your child, send a one-time code that the teacher checks before release.',
    icon: DismissalIcon,
    tile: 'bg-grape-50 text-grape-700',
  },
];

const STEPS = [
  { number: '1', title: 'Your child arrives', text: 'RFID attendance records the arrival.', dot: 'bg-sky-50 text-sky-700 ring-sky-500' },
  { number: '2', title: 'Stay informed', text: 'Parents receive important SMS notifications.', dot: 'bg-leaf-50 text-leaf-700 ring-leaf-400' },
  { number: '3', title: 'Follow their progress', text: 'View daily attendance and performance records.', dot: 'bg-grape-50 text-grape-700 ring-grape-500' },
];

function Header({ onLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-brand-100 bg-white/95 backdrop-blur">
      <BrandStripe />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <a href="#home" className={`rounded-xl ${FOCUS_RING}`} aria-label="Little Einstein Discovery School, home">
          <SchoolMark compact logoClassName="h-12 w-auto" />
        </a>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={NAV_LINK}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onLogin} className={buttonClass()}>
            Login
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className={`${buttonClass({ variant: 'secondary' })} w-11 px-0 md:hidden`}
          >
            {menuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-brand-100 bg-white md:hidden">
          <ul className="mx-auto max-w-7xl space-y-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-brand-700 hover:bg-brand-50 ${FOCUS_RING}`}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}

/** Classroom photo framed with the logo colours, plus a small (decorative) attendance note. */
function HeroPhoto() {
  return (
    <div className="relative mx-auto w-full max-w-md md:max-w-lg md:justify-self-end">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="absolute -right-5 -top-5 h-28 w-28 rounded-full bg-sun-400" />
        <span className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-leaf-400/80" />
        <span className="absolute -left-4 top-12 h-8 w-8 rounded-full bg-sky-500" />
        <span className="absolute -right-3 bottom-24 h-5 w-5 rounded-full bg-grape-500" />
      </div>
      <img
        src={classroomPhoto}
        alt="A kindergarten teacher reading a picture book with smiling pupils"
        width="736"
        height="736"
        fetchPriority="high"
        className="relative aspect-square w-full rounded-[2rem] object-cover shadow-lg ring-8 ring-white"
      />
      <div aria-hidden="true" className="absolute -bottom-5 right-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg ring-1 ring-brand-100 sm:right-8">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-50 text-leaf-700">
          <CheckCircleIcon className="h-5 w-5" />
        </span>
        <span className="text-sm">
          <span className="block font-semibold text-brand-900">Arrived safely</span>
          <span className="block text-brand-500">SMS sent to parent</span>
        </span>
      </div>
    </div>
  );
}

function InstallCard() {
  const { canInstall, promptInstall } = useInstallPrompt();

  // Only rendered when the browser actually offers installation - never a fake install action.
  if (!canInstall) return null;

  return (
    <section aria-labelledby="install-heading" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
      <div className="flex flex-col items-start gap-5 rounded-3xl border border-brand-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-center gap-4">
          <SchoolLogo decorative className="h-14 w-auto" />
          <div>
            <h2 id="install-heading" className="text-lg font-bold text-brand-900">Get the school app</h2>
            <p className="mt-1 max-w-xl text-base text-brand-700">
              Install Little Einstein on your device for quick access to your child&apos;s daily records.
            </p>
          </div>
        </div>
        <button type="button" onClick={promptInstall} className={buttonClass({ size: 'lg', className: 'w-full sm:w-auto' })}>
          <DownloadIcon className="h-5 w-5" />
          Install App
        </button>
      </div>
    </section>
  );
}

/**
 * Public landing page for signed-out visitors. `onLogin` opens the existing login form;
 * this page itself never touches authentication.
 */
export default function LandingPage({ onLogin }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-brand-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-900 focus:shadow"
      >
        Skip to content
      </a>

      <Header onLogin={onLogin} />

      <main id="main">
        {/* Hero */}
        <section id="home" aria-labelledby="hero-heading" className={`${SECTION} relative`}>
          {/* Soft background shapes in the logo colours (decoration only). */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-sky-50" />
            <span className="absolute -right-16 -top-20 h-80 w-80 rounded-full bg-sun-50" />
            <span className="absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-grape-50" />
          </div>
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-2 md:gap-8 md:pt-16 lg:gap-16 lg:px-8 lg:pb-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-leaf-700 ring-1 ring-leaf-100">
                <span className="h-2 w-2 rounded-full bg-leaf-400" aria-hidden="true" />
                For parents, teachers &amp; school staff
              </p>
              <h1
                id="hero-heading"
                className="mt-5 text-4xl font-bold leading-tight tracking-tight text-brand-900 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]"
              >
                A brighter way to stay connected with your child&apos;s school.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-brand-700">
                Track attendance, view daily performance, and receive important school notifications in one simple place.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={onLogin} className={buttonClass({ size: 'lg' })}>
                  Login
                </button>
                <a href="#features" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                  Learn More
                </a>
              </div>
            </div>
            <HeroPhoto />
          </div>
        </section>

        {/* Features */}
        <section id="features" aria-labelledby="features-heading" className={`${SECTION} relative isolate bg-canvas py-16 lg:py-24`}>
          <DoodleBackdrop className="-z-10" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="features-heading" className="max-w-2xl font-script text-[2.75rem] leading-none text-brand-700 sm:text-[3.25rem]">
              Everything parents need, in one place.
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              {FEATURES.map(({ title, text, icon: Icon, tile }) => (
                <li key={title} className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
                  <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tile}`} aria-hidden="true">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-brand-900">{title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-brand-700">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works + help */}
        <section id="help" aria-labelledby="how-heading" className={`${SECTION} py-16 lg:py-24`}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 id="how-heading" className="font-script text-[2.75rem] leading-none text-brand-700 sm:text-[3.25rem]">
              How it works
            </h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-6">
              {STEPS.map((step) => (
                <li key={step.number} className="flex gap-4">
                  <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ring-2 ${step.dot}`}>
                    {step.number}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-brand-900">{step.title}</h3>
                    <p className="mt-1 text-base leading-relaxed text-brand-700">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-12 flex gap-4 rounded-2xl border border-sky-100 bg-sky-50 p-5 sm:p-6">
              <InfoIcon className="mt-0.5 h-6 w-6 shrink-0 text-sky-700" />
              <div>
                <h3 className="text-base font-semibold text-brand-900">Need help signing in?</h3>
                <p className="mt-1 text-base leading-relaxed text-brand-700">
                  Accounts for parents, teachers and staff are created by the school. If you have not received your login
                  details or cannot sign in, please contact the Little Einstein Discovery School office.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* About / trust */}
        <section id="about" aria-labelledby="about-heading" className={`${SECTION} px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24`}>
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm">
            <BrandStripe className="h-1.5" />
            <div className="grid md:grid-cols-[2fr_3fr]">
              <img
                src={teamworkImage}
                alt=""
                width="736"
                height="414"
                loading="lazy"
                className="h-56 w-full object-cover object-left sm:h-72 md:h-full"
              />
              <div className="flex flex-col items-center gap-6 px-6 py-10 text-center sm:px-10 md:items-start md:text-left lg:px-14 lg:py-14">
                <SchoolLogo decorative className="h-24 w-auto sm:h-28" />
                <div className="max-w-2xl">
                  <h2 id="about-heading" className="font-script text-[2.75rem] leading-none text-brand-700 sm:text-[3.25rem]">
                    Built for Little Einstein Discovery School
                  </h2>
                  <p className="mt-4 text-lg leading-relaxed text-brand-700">
                    Designed to support better communication between the school and parents while making daily student
                    monitoring simpler and more organized.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <InstallCard />
      </main>

      <footer className="border-t border-brand-100 bg-canvas">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <SchoolLogo decorative className="h-12 w-auto" />
            <div>
              <p className="text-base font-bold text-brand-900">Little Einstein Discovery School</p>
              <p className="mt-0.5 text-sm text-brand-500">Supporting a brighter start for every child.</p>
            </div>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-2">
              <li>
                <a href="#home" className={NAV_LINK}>Home</a>
              </li>
              <li>
                <a href="#help" className={NAV_LINK}>Help</a>
              </li>
              <li>
                <button type="button" onClick={onLogin} className={NAV_LINK}>
                  Login
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
