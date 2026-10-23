import { useState } from 'react';
import { ALL_ROLES, ROLES } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { OFFLINE_MESSAGE } from '../../lib/format.js';
import { sendPasswordSetupEmail } from '../../lib/passwordSetupEmail.js';
import { useAuth } from '../../auth/useAuth.js';
import Panel, { ErrorMessage } from '../../components/Panel.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ParentMobileNumber from '../../components/students/ParentMobileNumber.jsx';
import { Alert, Badge, Button, Card, EmptyState, Field, InitialsAvatar, InlineConfirm, LoadingState, buttonClass, inputClass, LABEL } from '../../components/ui/index.js';
import { PlusIcon, UserIcon } from '../../components/ui/icons.jsx';

const ROLE_LABELS = { admin: 'Admin', teacher: 'Teacher', parent: 'Parent' };
const ROLE_TONES = { admin: 'grape', teacher: 'info', parent: 'brand' };
const AVATAR_TONES = { admin: 'grape', teacher: 'sky', parent: 'leaf' };
const EMPTY = { email: '', firstName: '', lastName: '', role: ROLES.PARENT, mobileNumber: '' };

const initials = (u) => `${u.firstName?.[0] ?? ''}${u.lastName?.[0] ?? ''}`.toUpperCase();

/** Admin form for a new account. The server validates everything; the person sets their own password by email. */
function CreateAccountForm({ onCreated, onCancel }) {
  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const isParent = values.role === ROLES.PARENT;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!navigator.onLine) return setFormError(OFFLINE_MESSAGE);
    setSaving(true);
    setFieldErrors({});
    setFormError(null);
    const { email, firstName, lastName, role, mobileNumber } = values;
    const body = { email, firstName, lastName, role, ...(isParent && mobileNumber.trim() ? { mobileNumber } : {}) };

    let user;
    try {
      ({ user } = await apiRequest('/admin/users', { method: 'POST', body }));
    } catch (error) {
      setFieldErrors(error.details?.fields ?? {});
      setFormError(error.message);
      setSaving(false);
      return;
    }
    // The account exists now; a failed email is reported but does not undo it (it can be resent).
    let emailError = null;
    try {
      await sendPasswordSetupEmail(user.email);
    } catch (error) {
      emailError = error.message;
    }
    onCreated(user, emailError);
  }

  const control = (field, props = {}) => ({ ...props, value: values[field], onChange: set(field), className: inputClass({ invalid: Boolean(fieldErrors[field]), className: props.className }) });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <h2 className="text-xl font-bold text-brand-900">Add Account</h2>
        <p className="mt-1 text-sm text-brand-500">
          No password is set here. After saving, Firebase emails the person a link to choose their own password.
        </p>

        <fieldset disabled={saving} className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field id="account-role" label="Role" error={fieldErrors.role}>
            <select {...control('role')}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field id="account-email" label="Email" error={fieldErrors.email} hint={fieldErrors.email ? undefined : 'Used to sign in and to receive the password setup email.'}>
            <input {...control('email', { type: 'email', autoComplete: 'off' })} />
          </Field>
          <Field id="account-firstName" label="First Name" error={fieldErrors.firstName}>
            <input {...control('firstName', { autoComplete: 'off' })} />
          </Field>
          <Field id="account-lastName" label="Last Name" error={fieldErrors.lastName}>
            <input {...control('lastName', { autoComplete: 'off' })} />
          </Field>
          {isParent && (
            <Field id="account-mobileNumber" label="Mobile Number" optional error={fieldErrors.mobileNumber} hint={fieldErrors.mobileNumber ? undefined : 'For attendance SMS and dismissal codes, e.g. 0917 123 4567.'}>
              <input {...control('mobileNumber', { inputMode: 'tel', autoComplete: 'off', className: 'font-mono' })} />
            </Field>
          )}
        </fieldset>
        {values.role === ROLES.ADMIN && (
          <Alert tone="warning" role={null} className="mt-4">An admin can manage every account, student and RFID card.</Alert>
        )}

        {formError && <Alert tone="error" className="mt-6">{formError}</Alert>}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-brand-100 pt-5">
          <button type="button" onClick={onCancel} disabled={saving} className={buttonClass({ variant: 'secondary' })}>Cancel</button>
          <Button type="submit" busy={saving} busyLabel="Creating…">Create account</Button>
        </div>
      </Card>
    </form>
  );
}

function AccountRow({ user, isSelf, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'deactivate' | 'reactivate' | 'role'
  const [newRole, setNewRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }

  async function run(action, successText) {
    if (!navigator.onLine) return setMessage({ tone: 'error', text: OFFLINE_MESSAGE });
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMode(null);
      if (successText) setMessage({ tone: 'success', text: successText });
      else onChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const post = (path, body) => apiRequest(`/admin/users/${encodeURIComponent(user.uid)}/${path}`, { method: body ? 'PATCH' : 'POST', body });
  const changeRole = () => run(() => post('role', { role: newRole }));
  const deactivate = () => run(() => post('deactivate'));
  const reactivate = () => run(() => post('reactivate'));
  const sendEmail = () => run(() => sendPasswordSetupEmail(user.email), `Password setup email sent to ${user.email}.`);

  return (
    <li className="flex flex-col rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsAvatar text={initials(user)} tone={AVATAR_TONES[user.role]} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <p className="font-semibold text-brand-900">
              {user.displayName}
              {isSelf && <span className="ml-1 text-sm font-normal text-brand-500">(you)</span>}
            </p>
            <p className="break-all text-sm text-brand-500">{user.email}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
          <StatusBadge active={user.active} />
        </div>
      </div>

      {user.role === ROLES.PARENT && (
        <div className="mt-2 text-sm">
          <ParentMobileNumber parent={user} canManage onSaved={onChanged} />
        </div>
      )}

      {isSelf ? (
        <p className="mt-3 text-sm text-brand-500">You cannot change your own role or status.</p>
      ) : mode === 'deactivate' ? (
        <InlineConfirm
          className="mt-4"
          message={<>Deactivate <strong>{user.displayName}</strong>? They are signed out and can no longer sign in. Their records are kept, and you can reactivate the account later.</>}
          confirmLabel="Deactivate"
          busyLabel="Deactivating…"
          busy={busy}
          onConfirm={deactivate}
          onCancel={() => setMode(null)}
        />
      ) : mode === 'reactivate' ? (
        <InlineConfirm
          className="mt-4"
          tone="neutral"
          message={<>Reactivate <strong>{user.displayName}</strong>? They can sign in again as {ROLE_LABELS[user.role]}.</>}
          confirmLabel="Reactivate"
          busyLabel="Reactivating…"
          busy={busy}
          onConfirm={reactivate}
          onCancel={() => setMode(null)}
        />
      ) : mode === 'role' ? (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor={`role-${user.uid}`} className={LABEL}>New role</label>
            <select id={`role-${user.uid}`} value={newRole} onChange={(e) => setNewRole(e.target.value)} disabled={busy} className={inputClass({ className: 'w-auto' })}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <InlineConfirm
            tone={newRole === ROLES.ADMIN ? 'danger' : 'neutral'}
            message={newRole === user.role
              ? 'Choose a different role.'
              : <>Change <strong>{user.displayName}</strong> from {ROLE_LABELS[user.role]} to {ROLE_LABELS[newRole]}? Their access changes the next time they use the app.{newRole === ROLES.ADMIN && ' An admin can manage every account, student and RFID card.'}</>}
            confirmLabel="Change role"
            busyLabel="Saving…"
            busy={busy}
            onConfirm={() => (newRole === user.role ? setMode(null) : changeRole())}
            onCancel={() => { setMode(null); setNewRole(user.role); }}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.active ? (
            <>
              <button type="button" onClick={sendEmail} disabled={busy} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                {busy ? 'Sending…' : 'Send password setup email'}
              </button>
              <button type="button" onClick={() => setMode('role')} disabled={busy} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Change role</button>
              <button type="button" onClick={() => setMode('deactivate')} disabled={busy} className={buttonClass({ variant: 'danger', size: 'sm' })}>Deactivate</button>
            </>
          ) : (
            <button type="button" onClick={() => setMode('reactivate')} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Reactivate</button>
          )}
        </div>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-sm font-medium ${message.tone === 'error' ? 'text-red-700' : 'text-leaf-700'}`}>
          {message.text}
        </p>
      )}
    </li>
  );
}

/** Admin: every account (admins, teachers, parents). Accounts are deactivated, never deleted. */
export default function AccountsPage() {
  const { account } = useAuth();
  const [view, setView] = useState('list');
  const [notice, setNotice] = useState(null); // { tone, title, text }
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('active');
  const { loading, data, error, reload } = useApiData('/admin/users');

  function handleCreated(user, emailError) {
    setView('list');
    setNotice(emailError
      ? { tone: 'warning', title: `${ROLE_LABELS[user.role]} account created for ${user.displayName}.`, text: `The password setup email was not sent: ${emailError} Use “Send password setup email” on their account to try again.` }
      : { tone: 'success', title: `${ROLE_LABELS[user.role]} account created for ${user.displayName}.`, text: `A password setup email was sent to ${user.email}. They choose their own password from that link, then sign in.` });
    reload();
  }

  if (view === 'create') {
    return <CreateAccountForm onCreated={handleCreated} onCancel={() => setView('list')} />;
  }

  const term = search.trim().toLowerCase();
  const users = (data?.users ?? []).filter((u) => (role === 'all' || u.role === role)
    && (status === 'all' || u.active === (status === 'active'))
    && (!term || `${u.displayName} ${u.email}`.toLowerCase().includes(term)));

  return (
    <div className="space-y-4">
      {notice && (
        <Alert tone={notice.tone} title={notice.title} action={(
          <button type="button" onClick={() => setNotice(null)} className={buttonClass({ variant: 'quiet', size: 'sm' })}>Dismiss</button>
        )}>
          <p>{notice.text}</p>
        </Alert>
      )}
      <Panel
        title="User Accounts"
        titleId="admin-accounts-title"
        subtitle="Admin, teacher and parent sign-in accounts. Link parents to their children from the Students section."
        actions={(
          <button type="button" onClick={() => { setNotice(null); setView('create'); }} className={buttonClass()}>
            <PlusIcon className="h-5 w-5" /> Add account
          </button>
        )}
      >
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="account-search" className={LABEL}>Search</label>
            <input id="account-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" className={inputClass()} />
          </div>
          <div>
            <label htmlFor="account-role-filter" className={LABEL}>Role</label>
            <select id="account-role-filter" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass({ className: 'w-auto' })}>
              <option value="all">All roles</option>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="account-status-filter" className={LABEL}>Status</label>
            <select id="account-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass({ className: 'w-auto' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        {error && <ErrorMessage message={error} onRetry={reload} />}
        {loading && <LoadingState className="mt-4">Loading accounts…</LoadingState>}
        {data && users.length === 0 && (
          <EmptyState className="mt-4" icon={<UserIcon className="h-6 w-6" />} title="No accounts found." />
        )}
        {users.length > 0 && (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {users.map((u) => <AccountRow key={`${u.uid}:${u.updatedAt}`} user={u} isSelf={u.uid === account?.user?.uid} onChanged={reload} />)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
