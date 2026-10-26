// Changes the signed-in user's password directly with Firebase Authentication: the current password
// is checked first (Firebase requires a recent sign-in), then the new one is set. No password passes
// through the API. Firebase then ends this account's sessions on other devices; this one stays signed in.
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth, firebaseConfigError } from './firebase.js';
import { OFFLINE_MESSAGE } from './format.js';

export const MIN_PASSWORD_LENGTH = 8;

/** Field errors for the form, or null when it can be sent. */
export function validatePasswordChange({ current, next, confirm }) {
  const errors = {};
  if (!current) errors.current = 'Enter your current password.';
  if (next.length < MIN_PASSWORD_LENGTH) errors.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (next === current) errors.next = 'Choose a password different from your current one.';
  if (!errors.next && confirm !== next) errors.confirm = 'The two new passwords do not match.';
  return Object.keys(errors).length ? errors : null;
}

const MESSAGES = {
  'auth/invalid-credential': { field: 'current', message: 'Your current password is incorrect.' },
  'auth/wrong-password': { field: 'current', message: 'Your current password is incorrect.' },
  'auth/invalid-login-credentials': { field: 'current', message: 'Your current password is incorrect.' },
  'auth/weak-password': { field: 'next', message: 'This password is too weak. Use a longer one.' },
  'auth/password-does-not-meet-requirements': { field: 'next', message: 'This password does not meet the requirements. Use a longer one with letters and numbers.' },
  'auth/too-many-requests': { message: 'Too many attempts. Please wait a few minutes and try again.' },
  'auth/requires-recent-login': { message: 'Please sign out, sign in again, and then change your password.' },
};

/** Throws an Error with `field` ('current' | 'next' | undefined) when the change fails. */
export async function changePassword(current, next) {
  if (!navigator.onLine) throw new Error(OFFLINE_MESSAGE);
  if (!auth) throw new Error(firebaseConfigError);
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Please sign in again.');
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    await updatePassword(user, next);
  } catch (err) {
    if (err?.code === 'auth/network-request-failed') {
      throw new Error(navigator.onLine ? 'Cannot reach the sign-in service. Please try again.' : OFFLINE_MESSAGE, { cause: err });
    }
    const known = MESSAGES[err?.code];
    throw Object.assign(new Error(known?.message ?? 'Your password could not be changed. Please try again.', { cause: err }), { field: known?.field });
  }
}
