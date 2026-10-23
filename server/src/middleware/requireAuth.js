import { ALL_ROLES } from '@led/shared';
import { adminAuth } from '../config/firebaseAdmin.js';
import { HttpError } from '../utils/httpError.js';

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9\-_.]+)$/;

function toAuthError(err) {
  switch (err?.code) {
    case 'auth/id-token-expired':
      return new HttpError(401, 'auth/token-expired', 'Your session has expired. Please sign in again.');
    case 'auth/id-token-revoked':
      return new HttpError(401, 'auth/token-revoked', 'Your session is no longer valid. Please sign in again.');
    case 'auth/user-disabled':
      return new HttpError(403, 'auth/account-disabled', 'This account has been disabled.');
    case 'auth/user-not-found':
      return new HttpError(401, 'auth/invalid-token', 'Invalid authentication token.');
    default:
      // Firebase token-format errors are client mistakes; anything else is our problem.
      if (typeof err?.code === 'string' && err.code.startsWith('auth/')) {
        return new HttpError(401, 'auth/invalid-token', 'Invalid authentication token.');
      }
      console.error('[auth] Token verification failed unexpectedly:', err);
      return new HttpError(503, 'auth/unavailable', 'Authentication service is temporarily unavailable.');
  }
}

/**
 * Verifies the Firebase ID token in `Authorization: Bearer <token>` and sets `req.user`.
 * The role comes ONLY from the verified token's custom claims, never from the request.
 */
export async function requireAuth(req, res, next) {
  const header = req.get('authorization');
  if (!header) {
    return next(new HttpError(401, 'auth/missing-token', 'Authentication required.'));
  }

  const match = BEARER_PATTERN.exec(header);
  if (!match) {
    return next(new HttpError(401, 'auth/invalid-token', 'Malformed Authorization header.'));
  }

  try {
    // checkRevoked also rejects disabled accounts and revoked sessions.
    const decoded = await adminAuth.verifyIdToken(match[1], true);

    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      role: ALL_ROLES.includes(decoded.role) ? decoded.role : null,
    };
    return next();
  } catch (err) {
    return next(toAuthError(err));
  }
}
