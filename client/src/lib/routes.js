// Page addresses (URLs) for each screen. The address only decides what is DISPLAYED: typing another
// role's address shows your own dashboard, and the API checks the verified role on every request
// whatever the address says. Addresses name sections only - never Student IDs, RFID UIDs or
// other records (addresses end up in browser history and screenshots).
//
//   /                                   landing page (signed out)
//   /login                              sign-in form
//   /admin-dashboard[/<section>]        admin
//   /teacher-dashboard[/<section>]      teacher
//   /parent-dashboard[/fetchers]        parent
// Pure functions (no browser objects), so they can be tested with Node.
import { ROLES } from '@led/shared';

export const LANDING_PATH = '/';
export const LOGIN_PATH = '/login';

export const DASHBOARD_PATHS = Object.freeze({
  [ROLES.ADMIN]: '/admin-dashboard',
  [ROLES.TEACHER]: '/teacher-dashboard',
  [ROLES.PARENT]: '/parent-dashboard',
});

// Section key (as used by each dashboard's NAV) -> address part. '' = the dashboard's home.
const STAFF_SECTIONS = {
  dashboard: '',
  attendance: 'attendance',
  performance: 'performance',
  dismissal: 'dismissal',
  reports: 'reports',
  students: 'students',
  rfid: 'rfid-cards',
};
const SECTIONS = Object.freeze({
  [ROLES.ADMIN]: { ...STAFF_SECTIONS, fetchers: 'fetchers', accounts: 'accounts', audit: 'audit-log' },
  [ROLES.TEACHER]: STAFF_SECTIONS,
  [ROLES.PARENT]: { records: '', dismissal: 'fetchers' },
});

/** The home section key of a role's dashboard ('dashboard' for staff, 'records' for parents). */
export function homeSection(role) {
  return Object.entries(SECTIONS[role] ?? {}).find(([, slug]) => slug === '')?.[0] ?? null;
}

/** Address of one section of a role's dashboard (unknown section -> the dashboard's home). */
export function sectionPath(role, section) {
  const base = DASHBOARD_PATHS[role];
  if (!base) return LANDING_PATH;
  const slug = SECTIONS[role][section];
  return slug ? `${base}/${slug}` : base;
}

/** "/teacher-dashboard/reports/" -> "/teacher-dashboard/reports" (lower case, no trailing slash). */
function normalize(pathname) {
  const path = String(pathname ?? '/').toLowerCase().replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

/**
 * What an address points to:
 *   { page: 'landing' } | { page: 'login' } | { page: 'unknown' }
 *   { page: 'dashboard', role, section }   section = null when the part after the dashboard is unknown
 */
export function parsePath(pathname) {
  const path = normalize(pathname);
  if (path === LANDING_PATH) return { page: 'landing' };
  if (path === LOGIN_PATH) return { page: 'login' };
  for (const [role, base] of Object.entries(DASHBOARD_PATHS)) {
    if (path !== base && !path.startsWith(`${base}/`)) continue;
    const slug = path.slice(base.length + 1);
    const section = Object.entries(SECTIONS[role]).find(([, s]) => s === slug)?.[0] ?? null;
    return { page: 'dashboard', role, section };
  }
  return { page: 'unknown' };
}

/**
 * The screen to show and the address it should have.
 *   signed in  -> always the account's OWN dashboard: the section from the address when it is that
 *                 role's dashboard, else `returnTo` (the dashboard address opened while signed out),
 *                 else home.
 *   signed out -> landing or login; a dashboard address shows the login form (and is remembered as
 *                 `returnTo` by the caller); anything else shows the landing page.
 * Returns { page, section?, path } where `path` is the address to show (replace if different).
 */
export function resolveRoute({ signedIn, role, pathname, returnTo = null }) {
  const where = parsePath(pathname);
  if (signedIn) {
    const own = (w) => w.page === 'dashboard' && w.role === role && w.section !== null;
    const target = own(where) ? where : returnTo && own(parsePath(returnTo)) ? parsePath(returnTo) : null;
    const section = target?.section ?? homeSection(role);
    return { page: 'dashboard', section, path: sectionPath(role, section) };
  }
  if (where.page === 'login' || where.page === 'dashboard') return { page: 'login', path: LOGIN_PATH };
  return { page: 'landing', path: LANDING_PATH };
}
