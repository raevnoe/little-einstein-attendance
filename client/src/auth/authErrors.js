// Maps Firebase Auth error codes to safe, user-friendly messages.
// Wrong password and unknown email share one message on purpose, so the login
// form never reveals which emails have accounts.
const MESSAGES = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/user-disabled': 'This account has been disabled. Please contact the school administrator.',
  'auth/too-many-requests': 'Too many sign-in attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Cannot reach the sign-in service. Check your internet connection.',
};

export function getAuthErrorMessage(error) {
  return MESSAGES[error?.code] ?? 'Sign-in failed. Please try again.';
}
