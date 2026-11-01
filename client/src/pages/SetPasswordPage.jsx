import { useEffect, useState } from 'react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { OFFLINE_MESSAGE } from '../lib/format.js';
import { newPasswordError } from '../lib/passwordChange.js';
import SystemScreen from '../components/SystemScreen.jsx';
import PasswordChecklist from '../components/PasswordChecklist.jsx';
import { Alert, Button, Field, LoadingState } from '../components/ui/index.js';
import { inputClass } from '../components/ui/classes.js';

// The page the password setup / reset email opens (Firebase "custom action URL" ->
// https://<site>/set-password?mode=resetPassword&oobCode=...). It applies the app's password rules,
// which Firebase's own page does not. The one-time code in the link is checked by Firebase; nothing
// passes through our server.
const LINK_PROBLEM = 'This link has expired or was already used. Ask the school for a new password setup email, or use "Forgot your password?" in Settings after signing in.';

export default function SetPasswordPage({ onDone }) {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const code = params.get('oobCode');
  const isSetupLink = mode === 'resetPassword' && Boolean(code);
  const [state, setState] = useState(() => (isSetupLink
    ? { step: 'checking', email: null, error: null }
    : { step: 'invalid', email: null, error: 'This link is not a password setup link.' }));
  const [values, setValues] = useState({ next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSetupLink) return;
    verifyPasswordResetCode(auth, code)
      .then((email) => setState({ step: 'form', email, error: null }))
      .catch((err) => setState({
        step: 'invalid',
        error: err?.code === 'auth/network-request-failed' && !navigator.onLine ? OFFLINE_MESSAGE : LINK_PROBLEM,
      }));
  }, [isSetupLink, code]);

  const context = { email: state.email ?? '' };

  async function submit(event) {
    event.preventDefault();
    const next = newPasswordError(values.next, context);
    const nextErrors = { next: next ?? undefined, confirm: !next && values.confirm !== values.next ? 'The two passwords do not match.' : undefined };
    setErrors(nextErrors);
    if (nextErrors.next || nextErrors.confirm) return;
    if (!navigator.onLine) {
      setErrors({ next: OFFLINE_MESSAGE });
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, values.next);
      setState({ step: 'done', email: state.email, error: null });
    } catch (err) {
      if (err?.code === 'auth/weak-password' || err?.code === 'auth/password-does-not-meet-requirements') {
        setErrors({ next: 'This password does not meet the requirements. Please choose a stronger one.' });
      } else {
        setState({ step: 'invalid', error: LINK_PROBLEM });
      }
    } finally {
      setBusy(false);
    }
  }

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  return (
    <SystemScreen>
      <h1 className="text-center text-2xl font-bold text-brand-900">Set your password</h1>
      {state.step === 'checking' && <LoadingState className="mt-6 justify-center">Checking your link…</LoadingState>}

      {state.step === 'invalid' && (
        <>
          <Alert tone="error" className="mt-6">{state.error}</Alert>
          <div className="mt-4 flex justify-center"><Button variant="secondary" onClick={onDone}>Go to sign in</Button></div>
        </>
      )}

      {state.step === 'done' && (
        <>
          <Alert tone="success" className="mt-6" title="Your password is set">You can now sign in with {state.email} and your new password.</Alert>
          <div className="mt-4 flex justify-center"><Button onClick={onDone}>Sign in</Button></div>
        </>
      )}

      {state.step === 'form' && (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4 rounded-2xl border border-brand-100 bg-paper p-6 shadow-sm">
          <p className="text-sm text-brand-700">For <strong>{state.email}</strong></p>
          <input type="email" name="username" autoComplete="username" value={state.email} readOnly hidden />
          <div>
            <Field id="set-password-next" label="New password" error={errors.next}>
              <input type="password" autoComplete="new-password" value={values.next} onChange={set('next')} className={inputClass({ invalid: Boolean(errors.next) })} />
            </Field>
            <PasswordChecklist password={values.next} context={context} id="set-password-rules" />
          </div>
          <Field id="set-password-confirm" label="Type the password again" error={errors.confirm}>
            <input type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} className={inputClass({ invalid: Boolean(errors.confirm) })} />
          </Field>
          <Button type="submit" block busy={busy} busyLabel="Saving…">Set password</Button>
        </form>
      )}
    </SystemScreen>
  );
}
