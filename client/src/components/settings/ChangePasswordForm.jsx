import { useState } from 'react';
import { changePassword, MIN_PASSWORD_LENGTH, validatePasswordChange } from '../../lib/passwordChange.js';
import { sendPasswordSetupEmail } from '../../lib/passwordSetupEmail.js';
import { Alert, Button, Card, CardHeader, Field } from '../ui/index.js';
import { inputClass } from '../ui/classes.js';
import { LockIcon } from '../ui/icons.jsx';

const EMPTY = { current: '', next: '', confirm: '' };

/** Change your own password (checked against the current one by Firebase). */
export default function ChangePasswordForm({ email }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { tone, text }

  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setMessage(null);
    const invalid = validatePasswordChange(values);
    setErrors(invalid ?? {});
    if (invalid) return;
    setBusy(true);
    try {
      await changePassword(values.current, values.next);
      setValues(EMPTY);
      setMessage({ tone: 'success', text: 'Your password was changed. Other devices signed in to this account will need the new password.' });
    } catch (err) {
      if (err.field) setErrors({ [err.field]: err.message });
      else setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function sendResetEmail() {
    setMessage(null);
    try {
      await sendPasswordSetupEmail(email);
      setMessage({ tone: 'success', text: `A password reset link was sent to ${email}.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    }
  }

  const input = (key, autoComplete) => (
    <input
      type="password"
      autoComplete={autoComplete}
      value={values[key]}
      onChange={set(key)}
      className={inputClass({ invalid: Boolean(errors[key]) })}
    />
  );

  return (
    <Card as="section" aria-labelledby="password-title">
      <CardHeader titleId="password-title" title="Change password" icon={<LockIcon className="h-5 w-5" />} />
      <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:max-w-md">
        {/* Lets password managers save the new password for the right account. */}
        <input type="email" name="username" autoComplete="username" value={email ?? ''} readOnly hidden />
        <Field id="password-current" label="Current password" error={errors.current}>{input('current', 'current-password')}</Field>
        <Field id="password-next" label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={errors.next}>
          {input('next', 'new-password')}
        </Field>
        <Field id="password-confirm" label="Type the new password again" error={errors.confirm}>{input('confirm', 'new-password')}</Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" busy={busy} busyLabel="Changing…">Change password</Button>
          <button type="button" onClick={sendResetEmail} className="text-sm font-semibold text-brand-600 dark:text-brand-300 underline-offset-2 hover:underline">
            Forgot your current password?
          </button>
        </div>
      </form>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
    </Card>
  );
}
