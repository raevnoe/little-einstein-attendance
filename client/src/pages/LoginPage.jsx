import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { SchoolLogo } from '../components/landing/SchoolMark.jsx';
import BrandStripe from '../components/ui/BrandStripe.jsx';
import { DoodleBackdrop } from '../components/ui/Decor.jsx';
import Field from '../components/ui/Field.jsx';
import { buttonClass, FOCUS_RING, inputClass } from '../components/ui/classes.js';
import { AlertIcon, ArrowLeftIcon, EyeIcon, EyeOffIcon } from '../components/ui/icons.jsx';
import { playSound } from '../lib/sounds.js';
import ThemeToggle from '../components/ThemeToggle.jsx';

export default function LoginPage({ onBack }) {
  const { login, sessionMessage } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // On success, AuthProvider switches the app to the signed-in view. Only this form chimes:
      // a session restored on page load stays silent.
      playSound('welcome');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const message = error ?? sessionMessage;

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <BrandStripe />
      <div className="flex flex-1 lg:grid lg:grid-cols-2">
        {/* Brand panel: desktop only (phones and tablets see the logo above the form). */}
        <div className="relative hidden flex-col items-center justify-center overflow-hidden bg-canvas px-10 lg:flex">
          <DoodleBackdrop />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-sky-50" />
            <span className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-sun-50" />
          </div>
          <div className="relative flex max-w-md flex-col items-center text-center">
            <SchoolLogo className="h-56 w-auto" />
            <p className="mt-8 text-2xl font-bold tracking-tight text-brand-900">Welcome to Little Einstein</p>
            <p className="mt-2 text-base leading-relaxed text-brand-700">
              Daily attendance, student performance and dismissal for our kindergarten families and staff.
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              {onBack ? (
                <button type="button" onClick={onBack} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 ${FOCUS_RING}`}>
                  <ArrowLeftIcon className="h-4 w-4" />
                  Back to home
                </button>
              ) : <span />}
              <ThemeToggle compact />
            </div>

            <div className="rounded-2xl border border-brand-100 bg-paper p-6 shadow-sm sm:p-8">
              <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
                <SchoolLogo className="h-24 w-auto lg:hidden" />
                <h1 className="mt-4 font-script text-[2.5rem] leading-none text-brand-700 lg:mt-0">Sign in to continue</h1>
                <p className="mt-1 text-sm text-brand-500">For parents, teachers and school staff.</p>
              </div>

              <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
                <Field id="email" label="Email">
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={submitting}
                    className={inputClass()}
                  />
                </Field>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-brand-900">Password</label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      className={inputClass({ className: 'pr-12' })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((shown) => !shown)}
                      aria-pressed={showPassword}
                      aria-controls="password"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className={`absolute right-1 top-1/2 mt-0.5 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-brand-500 hover:bg-brand-50 hover:text-brand-700 ${FOCUS_RING}`}
                    >
                      {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                {message && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{message}</span>
                  </p>
                )}

                <button type="submit" disabled={submitting} className={buttonClass({ size: 'lg', block: true })}>
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>

            <p className="mt-4 text-center text-sm text-brand-500">
              Accounts are created by the school. Contact the school office if you cannot sign in.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
