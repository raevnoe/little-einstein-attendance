import { ALL_ROLES } from '@led/shared';
import { findUserById } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';
import { ACCESS_DENIED_WINDOW_MS, recordAudit } from '../services/audit.service.js';

/**
 * Refuses the request and records it (best effort): the server saw a VALID token but refused
 * access. Repeats of the same user + reason + API area are recorded once per 5 minutes.
 * Stale-claim refusals are not recorded: they are the normal "refresh your token" step.
 */
async function deny(req, next, error, role) {
  const area = `${req.method} ${req.baseUrl ?? ''}`;
  await recordAudit({
    eventType: 'auth.access-denied',
    outcome: 'denied',
    actor: { type: 'user', uid: req.user.uid, role },
    target: { type: 'route', id: area },
    reason: error.code,
    details: { code: error.code },
    route: area,
  }, { suppressKey: `denied|${req.user.uid}|${error.code}|${area}`, windowMs: ACCESS_DENIED_WINDOW_MS });
  return next(error);
}

/**
 * Allows the request only if the caller's VERIFIED role (Firebase custom claim,
 * set on req.user by requireAuth) is one of `allowedRoles`, and their users/{uid}
 * profile exists, is active, and agrees with the token's role.
 *
 * Roles in headers, query strings, URLs, or bodies are never consulted.
 * Must run after requireAuth. Sets req.profile for later handlers.
 */
export function requireRole(...allowedRoles) {
  const unknown = allowedRoles.filter((role) => !ALL_ROLES.includes(role));
  if (allowedRoles.length === 0 || unknown.length > 0) {
    // Programming error: fail at startup rather than silently allowing/denying.
    throw new Error(`requireRole: invalid roles [${unknown.join(', ') || 'none given'}]`);
  }

  return async function roleGuard(req, res, next) {
    if (!req.user) {
      return next(new HttpError(401, 'auth/missing-token', 'Authentication required.'));
    }

    let profile;
    try {
      profile = await findUserById(req.user.uid);
    } catch (err) {
      console.error('[auth] Failed to load user profile for authorization:', err);
      return next(new HttpError(503, 'profile/unavailable', 'User profile is temporarily unavailable.'));
    }

    if (!profile) {
      return deny(req, next, new HttpError(403, 'auth/profile-missing', 'Your account has not been set up yet.'), req.user.role);
    }
    if (profile.active !== true) {
      return deny(req, next, new HttpError(403, 'auth/account-inactive', 'This account has been deactivated.'), profile.role);
    }
    // Role changes update the claim and the profile together, so a mismatch means
    // this token was issued before the change. Refuse it; the client refreshes its
    // token and retries, so a demoted user cannot keep using old privileges.
    if (profile.role !== req.user.role) {
      return next(new HttpError(401, 'auth/claims-stale', 'Your permissions have changed. Please try again.'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return deny(req, next, new HttpError(403, 'auth/forbidden', 'You do not have access to this resource.'), profile.role);
    }

    req.profile = profile;
    return next();
  };
}
