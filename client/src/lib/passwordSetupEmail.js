// Asks Firebase Authentication to email a "set your password" (password-reset) link.
// Used after an admin creates an account: the server gives the account a random password
// that nobody knows, so the person chooses their own through this link. No password ever
// passes through the admin, the API or this app. The email text is Firebase's template
// (Firebase console > Authentication > Templates > Password reset).
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, firebaseConfigError } from './firebase.js';
import { OFFLINE_MESSAGE } from './format.js';

export async function sendPasswordSetupEmail(email) {
  if (!navigator.onLine) throw new Error(OFFLINE_MESSAGE);
  if (!auth) throw new Error(firebaseConfigError);
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err?.code === 'auth/too-many-requests') {
      throw new Error('Too many emails were requested. Please wait a few minutes and try again.');
    }
    if (err?.code === 'auth/network-request-failed') {
      throw new Error(navigator.onLine ? 'Cannot reach Firebase. Please try again in a moment.' : OFFLINE_MESSAGE);
    }
    throw new Error('The password setup email could not be sent. Please try again.');
  }
}
