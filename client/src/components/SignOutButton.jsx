import { useId, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { beginSignOut, finishSignOut } from '../lib/router.js';
import { buttonClass } from './ui/classes.js';
import { SignOutIcon } from './ui/icons.jsx';

/**
 * Sign out button. By default it first asks "Sign out?" in a native modal <dialog> (focus stays
 * inside it, Escape or a click outside cancels, Cancel has the initial focus). Error screens where
 * signing out is the only way forward pass `confirm={false}`.
 */
export default function SignOutButton({ className = '', confirm = true }) {
  const { logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const dialogRef = useRef(null);
  const titleId = useId();
  const textId = useId();

  async function signOut() {
    setSigningOut(true);
    // Signing out on purpose goes to the landing page ("/"), not to the login form.
    beginSignOut();
    try {
      await logout();
    } catch (err) {
      finishSignOut();
      setSigningOut(false);
      throw err;
    }
  }

  function handleClick() {
    if (confirm && dialogRef.current?.showModal) dialogRef.current.showModal();
    else signOut();
  }

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={signingOut}
        className={buttonClass({ variant: 'secondary', className })}
      >
        <SignOutIcon className="h-4 w-4" />
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>

      {confirm && (
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          aria-describedby={textId}
          // A click on the dimmed backdrop lands on the <dialog> element itself.
          onClick={(event) => { if (event.target === dialogRef.current && !signingOut) close(); }}
          onCancel={(event) => { if (signingOut) event.preventDefault(); }}
          className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-brand-100 bg-paper p-0 text-left shadow-xl backdrop:bg-brand-900/40 dark:backdrop:bg-black/60"
        >
          <div className="p-6">
            <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <SignOutIcon className="h-5 w-5" />
            </span>
            <h2 id={titleId} className="mt-4 text-lg font-bold text-brand-900">Sign out?</h2>
            <p id={textId} className="mt-1 text-sm text-brand-700">
              Anything you have not saved will be lost. You will need your email and password to sign in again.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} disabled={signingOut} autoFocus className={buttonClass({ variant: 'secondary' })}>
                Cancel
              </button>
              <button type="button" onClick={signOut} disabled={signingOut} className={buttonClass()}>
                <SignOutIcon className="h-4 w-4" />
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
