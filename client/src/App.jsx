import { useEffect } from 'react';
import { ROLES } from '@led/shared';
import { useAuth } from './auth/useAuth.js';
import { firebaseConfigError } from './lib/firebase.js';
import { LANDING_PATH, LOGIN_PATH, parsePath, resolveRoute, sectionPath } from './lib/routes.js';
import {
  clearReturnTo, finishSignOut, isSigningOut, navigate, rememberReturnTo, takeReturnTo, usePathname,
} from './lib/router.js';
import SignOutButton from './components/SignOutButton.jsx';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import SystemScreen from './components/SystemScreen.jsx';
import { Alert, Button, LoadingState } from './components/ui/index.js';
import { RefreshIcon } from './components/ui/icons.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AccessDeniedPage from './pages/AccessDeniedPage.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import TeacherDashboard from './pages/teacher/TeacherDashboard.jsx';
import ParentDashboard from './pages/parent/ParentDashboard.jsx';

const DASHBOARD_BY_ROLE = {
  [ROLES.ADMIN]: AdminDashboard,
  [ROLES.TEACHER]: TeacherDashboard,
  [ROLES.PARENT]: ParentDashboard,
};

function CenteredMessage({ children }) {
  return (
    <SystemScreen>
      <div className="flex justify-center text-center text-sm text-brand-700">{children}</div>
    </SystemScreen>
  );
}

// Picks what a signed-in user sees from the SERVER-verified account (GET /api/auth/me).
// This only controls rendering; the API enforces access on every request. The address picks the
// section of the account's OWN dashboard (another role's address shows your own dashboard).
function SignedInApp({ pathname }) {
  const { account, accountError, reloadAccount } = useAuth();
  const role = account?.profile?.active ? account.user.role : null;
  const Dashboard = DASHBOARD_BY_ROLE[role];
  const route = Dashboard ? resolveRoute({ signedIn: true, role, pathname, returnTo: takeReturnTo() }) : null;

  // Correct the address (no extra Back step): "/", "/login", another role's or an unknown address.
  const target = route?.path ?? null;
  useEffect(() => {
    if (!target) return;
    clearReturnTo();
    if (pathname !== target) navigate(target, { replace: true });
  }, [target, pathname]);

  // The account could not be loaded (e.g. the app was opened offline): load it again once, when
  // the browser reports the connection is back. Only after a FAILED load, so a dashboard that is
  // already open (and any form on it) is never reset; nothing else is retried automatically.
  useEffect(() => {
    if (!accountError) return undefined;
    window.addEventListener('online', reloadAccount, { once: true });
    return () => window.removeEventListener('online', reloadAccount);
  }, [accountError, reloadAccount]);

  if (accountError) {
    return (
      <SystemScreen>
        <Alert tone="error" title="Your account could not be loaded">{accountError}</Alert>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={reloadAccount}>
            <RefreshIcon className="h-4 w-4" />
            Retry
          </Button>
          <SignOutButton confirm={false} />
        </div>
      </SystemScreen>
    );
  }
  if (!account) {
    return (
      <CenteredMessage>
        <LoadingState>Loading your account…</LoadingState>
      </CenteredMessage>
    );
  }

  const { profile } = account;
  if (!profile) return <AccessDeniedPage reason="Your account has no school profile yet." />;
  if (!profile.active) return <AccessDeniedPage reason="Your account has been deactivated." />;
  if (!Dashboard) return <AccessDeniedPage reason="Your account does not have a role assigned." />;

  return <Dashboard section={route.section} onSectionChange={(key) => navigate(sectionPath(role, key))} />;
}

function go(path) {
  navigate(path);
  window.scrollTo(0, 0);
}

// Signed-out users see the public landing page ("/") or the login form ("/login"). A dashboard
// address shows the login form and opens that section after signing in; a session ended by the
// server is always on a dashboard address, so its message appears on the login form. Signing
// out on purpose goes to the landing page.
function SignedOutApp({ pathname }) {
  const leaving = isSigningOut();
  const route = leaving ? { page: 'landing', path: LANDING_PATH } : resolveRoute({ signedIn: false, pathname });

  useEffect(() => {
    if (finishSignOut()) {
      clearReturnTo();
    } else if (parsePath(pathname).page === 'dashboard') {
      rememberReturnTo(pathname);
    }
    if (pathname !== route.path) navigate(route.path, { replace: true });
  }, [pathname, route.path]);

  if (route.page === 'login') return <LoginPage onBack={() => go(LANDING_PATH)} />;
  return <LandingPage onLogin={() => go(LOGIN_PATH)} />;
}

function AppContent() {
  const { status } = useAuth();
  const pathname = usePathname();

  if (firebaseConfigError) return <CenteredMessage>{firebaseConfigError}</CenteredMessage>;
  if (status === 'loading') {
    return (
      <CenteredMessage>
        <LoadingState>Loading…</LoadingState>
      </CenteredMessage>
    );
  }
  if (status === 'signedIn') return <SignedInApp pathname={pathname} />;
  return <SignedOutApp pathname={pathname} />;
}

// The connection/update banner (Phase 12) is shown above every screen.
export default function App() {
  return (
    <>
      <ConnectionStatus />
      <AppContent />
    </>
  );
}
