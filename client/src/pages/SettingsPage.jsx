import { useState } from 'react';
import { ROLES } from '@led/shared';
import { useAuth } from '../auth/useAuth.js';
import { apiRequest } from '../lib/apiClient.js';
import { beginSignOut, finishSignOut } from '../lib/router.js';
import AppearanceSettings from '../components/settings/AppearanceSettings.jsx';
import ChangePasswordForm from '../components/settings/ChangePasswordForm.jsx';
import ParentSmsSetting from '../components/settings/ParentSmsSetting.jsx';
import SchoolSettingsForm from '../components/settings/SchoolSettingsForm.jsx';
import { Alert, Button, Card, CardHeader, InlineConfirm } from '../components/ui/index.js';
import { SignOutIcon, UserIcon } from '../components/ui/icons.jsx';

const ROLE_LABELS = { [ROLES.ADMIN]: 'Administrator', [ROLES.TEACHER]: 'Teacher', [ROLES.PARENT]: 'Parent' };

/**
 * Settings for every role: My Account, appearance, password, sign out everywhere; parents also see
 * their SMS details, admins the School Settings. Nobody can change their own name, email or role here
 * (the admin does that), and a parent cannot change the number dismissal codes are sent to.
 */
export default function SettingsPage() {
  const { account } = useAuth();
  const role = account?.user?.role;
  const profile = account?.profile ?? {};

  return (
    <div className="space-y-6">
      {role === ROLES.ADMIN && <SchoolSettingsForm />}
      <Card as="section" aria-labelledby="my-account-title">
        <CardHeader titleId="my-account-title" title="My account" icon={<UserIcon className="h-5 w-5" />} />
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Item label="Name" value={profile.displayName} />
          <Item label="Email" value={profile.email} />
          <Item label="Role" value={ROLE_LABELS[role]} />
          {role === ROLES.TEACHER && (
            <Item
              label="Your sections"
              value={profile.sections?.length ? profile.sections.join(', ') : 'None assigned yet'}
              className="sm:col-span-3"
            />
          )}
        </dl>
        <p className="mt-4 text-sm text-brand-500">To change your name, email{role === ROLES.TEACHER ? ' or sections' : ''}, please ask the school administrator.</p>
      </Card>
      {role === ROLES.PARENT && <ParentSmsSetting />}
      <AppearanceSettings />
      <ChangePasswordForm email={profile.email} />
      <SignOutEverywhere />
    </div>
  );
}

function Item({ label, value, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-sm font-semibold text-brand-500">{label}</dt>
      <dd className="mt-1 break-words text-base text-brand-900">{value || '—'}</dd>
    </div>
  );
}

/** Ends every session of this account (e.g. a lost phone), including this one. */
function SignOutEverywhere() {
  const { logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/account/sign-out-everywhere', { method: 'POST' });
      // Like the Sign out button: signing out on purpose goes to the landing page.
      beginSignOut();
      await logout().catch((err) => {
        finishSignOut();
        throw err;
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="sign-out-all-title">
      <CardHeader
        titleId="sign-out-all-title"
        title="Sign out on all devices"
        subtitle="For example if a phone or tablet with this account was lost. You will need to sign in again here too."
        icon={<SignOutIcon className="h-5 w-5" />}
      />
      <div className="mt-4">
        {confirming ? (
          <InlineConfirm
            message="Sign out of this account on every device, including this one?"
            confirmLabel="Yes, sign out everywhere"
            busyLabel="Signing out…"
            busy={busy}
            onConfirm={run}
            onCancel={() => setConfirming(false)}
          />
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>Sign out on all devices</Button>
        )}
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      </div>
    </Card>
  );
}
