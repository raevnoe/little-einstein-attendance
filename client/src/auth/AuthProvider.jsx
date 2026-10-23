import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { apiRequest } from '../lib/apiClient.js';
import { AuthContext } from './AuthContext.js';
import { getAuthErrorMessage } from './authErrors.js';

// Backend answers that mean the Firebase session must not be used any more.
const SESSION_ENDED_STATUSES = new Set([401, 403]);

/**
 * status: 'loading' | 'signedOut' | 'signedIn'
 * account: the server-verified GET /api/auth/me response ({ user, profile }) or null.
 * The role used for routing comes from `account.user.role`, which the backend read
 * from the verified token's custom claims. The UI only decides what to SHOW; every
 * API endpoint enforces access itself with requireRole.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [account, setAccount] = useState(null);
  const [accountError, setAccountError] = useState(null);
  const [sessionMessage, setSessionMessage] = useState(null);

  const loadAccount = useCallback(async () => {
    setAccountError(null);
    try {
      let data = await apiRequest('/auth/me');
      // Role changed since this token was issued: refresh it once so the UI shows the current role.
      if (data.profile && data.profile.role !== data.user.role) {
        await auth.currentUser?.getIdToken(true);
        data = await apiRequest('/auth/me');
      }
      setAccount(data);
    } catch (error) {
      if (SESSION_ENDED_STATUSES.has(error.status)) {
        setSessionMessage(error.message);
        await signOut(auth);
        return;
      }
      setAccountError(error.message);
    }
  }, []);

  useEffect(() => {
    if (!auth) return undefined;

    return onAuthStateChanged(auth, (firebaseUser) => {
      setAccount(null);
      setAccountError(null);
      if (firebaseUser) {
        setStatus('signedIn');
        loadAccount();
      } else {
        setStatus('signedOut');
      }
    });
  }, [loadAccount]);

  const login = useCallback(async (email, password) => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      throw new Error('Enter your email and password.');
    }
    setSessionMessage(null);
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, password);
    } catch (error) {
      throw new Error(getAuthErrorMessage(error), { cause: error });
    }
  }, []);

  const logout = useCallback(async () => {
    setSessionMessage(null);
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ status, account, accountError, sessionMessage, login, logout, reloadAccount: loadAccount }),
    [status, account, accountError, sessionMessage, login, logout, loadAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
