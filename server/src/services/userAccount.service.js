// Admin operations on user accounts. Keeps the Firebase custom claim (authoritative)
// and the users/{uid} profile (display/query copy) in sync. Every failure path
// leaves the account in a state that requireRole DENIES, never one that grants more.
//
// Audit (Phase 11): the profile change and its audit entry are written in ONE Firestore
// transaction, so a committed profile change always has its entry and a failed audit write
// leaves the profile unchanged. Firebase Authentication (claims, disabled flag, sessions)
// cannot join that transaction, so each operation orders the Auth step so that a failure is
// safe, undoes the Auth step when the audit/profile write fails, and reports an Auth step that
// failed AFTER the audited profile change as a separate "failure" entry plus an error response.
import { randomBytes } from 'node:crypto';
import { resolveTeacherSections } from './section.service.js';
import { ALL_ROLES, AUDIT_OUTCOMES, ROLES, normalizePhMobileNumber } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, db } from '../config/firebaseAdmin.js';
import { buildNewUser, findAllUsers, findUserById, toPublicUser, usersCollection } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';
import { auditInTransaction, recordAudit } from './audit.service.js';

const CREATE_FIELDS = ['email', 'firstName', 'lastName', 'role', 'mobileNumber'];

/** Every account (admins, teachers, parents), sorted by name. One school: the list is small. */
export async function listAccounts() {
  return (await findAllUsers())
    .map(toPublicUser)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Creates a Firebase Auth user, its authoritative `role` claim and the users/{uid} profile
 * (with its `user.created` audit entry, in one transaction). Without `password`, the account
 * gets a long random password that is never returned, logged or stored: the person sets their
 * own through Firebase's password-reset email, which the admin's browser asks Firebase to send.
 * Any failure after the Auth user exists deletes it, so no half-made account is left behind.
 */
export async function createAccount(ctx, input, { password } = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const unknown = Object.keys(body).filter((key) => !CREATE_FIELDS.includes(key));
  if (unknown.length) {
    throw new HttpError(400, 'validation/invalid-request', `Unknown field(s): ${unknown.join(', ')}.`);
  }

  let userData;
  try {
    userData = buildNewUser(body);
  } catch (err) {
    if (!err.field) throw err;
    throw new HttpError(400, 'validation/invalid-user', err.message, { fields: { [err.field]: err.message } });
  }

  let record;
  try {
    record = await adminAuth.createUser({
      email: userData.email,
      password: password ?? randomBytes(32).toString('base64url'),
      displayName: userData.displayName,
    });
  } catch (err) {
    if (err?.code === 'auth/email-already-exists') {
      const message = 'An account with this email already exists.';
      throw new HttpError(409, 'users/email-exists', message, { fields: { email: message } });
    }
    if (err?.code === 'auth/invalid-email') {
      const message = 'A valid email is required.';
      throw new HttpError(400, 'validation/invalid-user', message, { fields: { email: message } });
    }
    throw err;
  }

  try {
    await adminAuth.setCustomUserClaims(record.uid, { role: userData.role });
    await db.runTransaction(async (tx) => {
      tx.create(usersCollection().doc(record.uid), {
        uid: record.uid,
        ...userData,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      auditInTransaction(tx, {
        ...ctx, eventType: 'user.created', target: { type: 'user', id: record.uid }, details: { role: userData.role },
      });
    });
  } catch (err) {
    await adminAuth.deleteUser(record.uid).catch(() => {});
    throw err;
  }

  return toPublicUser(await findUserById(record.uid));
}

function assertNotSelf(actorUid, targetUid) {
  // Prevents an admin from locking themselves out. It also guarantees at least one
  // active admin always remains: the last admin can only be changed by themselves.
  if (actorUid === targetUid) {
    throw new HttpError(403, 'users/self-modification', 'You cannot change your own role or status.');
  }
}

async function loadTarget(uid) {
  const profile = await findUserById(uid);
  if (!profile) {
    throw new HttpError(404, 'users/not-found', 'User not found.');
  }
  try {
    return { profile, record: await adminAuth.getUser(uid) };
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      throw new HttpError(404, 'users/not-found', 'User not found.');
    }
    throw err;
  }
}

/** Updates users/{uid} and writes its audit entry atomically. */
function updateProfileWithAudit(targetUid, fields, event) {
  return db.runTransaction(async (tx) => {
    tx.update(usersCollection().doc(targetUid), { ...fields, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, { ...event, target: { type: 'user', id: targetUid } });
  });
}

// ---- the signed-in user's own account (Settings -> My Account). `uid` always comes from the
// verified token, never from the request.

/** A PARENT turns their own arrival/departure SMS on or off (users/{uid}.attendanceSms). */
export async function setOwnAttendanceSms(ctx, uid, value) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'validation/invalid-preference', 'attendanceSms must be true or false.');
  }
  await updateProfileWithAudit(uid, { attendanceSms: value }, {
    ...ctx, eventType: 'user.sms-preference-changed', details: { attendanceSms: value },
  });
  return toPublicUser(await findUserById(uid));
}

/**
 * Ends every session of the caller, including this one: Firebase revokes the refresh tokens and
 * requireAuth (checkRevoked) refuses ID tokens issued before now. Audited after the Auth step
 * (it cannot join a transaction); an audit failure does not undo a sign-out.
 */
export async function signOutEverywhere(ctx, uid) {
  await adminAuth.revokeRefreshTokens(uid);
  await recordAudit({ ...ctx, eventType: 'user.signed-out-everywhere', target: { type: 'user', id: uid } });
}

/** `ctx` = auditContext(req): the verified admin performing the change. */
export async function assignRole(ctx, targetUid, role) {
  if (!ALL_ROLES.includes(role)) {
    throw new HttpError(400, 'validation/invalid-role', `role must be one of: ${ALL_ROLES.join(', ')}.`);
  }
  assertNotSelf(ctx.actor.uid, targetUid);

  const { profile, record } = await loadTarget(targetUid);
  if (profile.role === role && record.customClaims?.role === role) {
    return toPublicUser(profile);
  }

  const previousClaims = record.customClaims ?? {};
  await adminAuth.setCustomUserClaims(targetUid, { ...previousClaims, role });
  try {
    await updateProfileWithAudit(targetUid, { role }, {
      ...ctx, eventType: 'user.role-changed', details: { fromRole: profile.role, toRole: role },
    });
  } catch (err) {
    // Profile/audit not written: claim and profile disagree (requireRole rejects); restore anyway.
    await adminAuth.setCustomUserClaims(targetUid, previousClaims).catch(() => {});
    throw err;
  }

  return toPublicUser(await findUserById(targetUid));
}

export async function setAccountActive(ctx, targetUid, active) {
  assertNotSelf(ctx.actor.uid, targetUid);
  await loadTarget(targetUid);
  const eventType = active ? 'user.reactivated' : 'user.deactivated';

  if (active) {
    // Enable sign-in first; access is only granted once the profile is active too.
    await adminAuth.updateUser(targetUid, { disabled: false });
    try {
      await updateProfileWithAudit(targetUid, { active: true }, { ...ctx, eventType, details: { step: 'profile' } });
    } catch (err) {
      // Not audited, not reactivated: disable sign-in again (the profile is still inactive).
      await adminAuth.updateUser(targetUid, { disabled: true }).catch(() => {});
      throw err;
    }
  } else {
    // Mark inactive first (audited): from this moment requireRole rejects every request.
    await updateProfileWithAudit(targetUid, { active: false }, { ...ctx, eventType, details: { step: 'profile' } });
    try {
      await adminAuth.updateUser(targetUid, { disabled: true });
      await adminAuth.revokeRefreshTokens(targetUid);
    } catch (err) {
      // The profile is inactive (API access is already refused), but sign-in was not fully
      // disabled. Record and report it; the admin can deactivate again.
      await recordAudit({
        ...ctx, eventType, outcome: AUDIT_OUTCOMES.FAILURE, target: { type: 'user', id: targetUid },
        reason: 'auth/disable-failed', details: { step: 'firebase-auth' },
      });
      console.error(`[account] Firebase Auth deactivation of ${targetUid} failed (${err?.code ?? 'error'})`);
      throw new HttpError(502, 'users/auth-update-failed',
        'The account was marked inactive, but sign-in could not be disabled. Please try again.');
    }
  }

  return toPublicUser(await findUserById(targetUid));
}

/**
 * Sets (or clears, with null/'') a PARENT account's mobile number for attendance SMS.
 * Stored normalized as +639XXXXXXXXX on users/{uid} only. The audit entry records only
 * whether a number is set, never the number.
 */
/**
 * Sets the sections a TEACHER handles (body { sections: [names on the list] }; [] = none, so the
 * teacher sees no students). Profile change + audit in one transaction, like the mobile number.
 */
export async function setTeacherSections(ctx, targetUid, value) {
  const profile = await findUserById(targetUid);
  if (!profile) throw new HttpError(404, 'users/not-found', 'User not found.');
  if (profile.role !== ROLES.TEACHER) {
    throw new HttpError(400, 'users/not-teacher', 'Sections can only be assigned to teacher accounts.');
  }
  const resolved = await resolveTeacherSections(value);
  if (resolved.error) {
    throw new HttpError(400, 'validation/invalid-sections', resolved.error, { fields: { sections: resolved.error } });
  }
  await updateProfileWithAudit(targetUid, { sections: resolved.value }, {
    ...ctx, eventType: 'user.sections-changed', details: { sections: resolved.value, count: resolved.value.length },
  });
  return toPublicUser(await findUserById(targetUid));
}

export async function setParentMobileNumber(ctx, targetUid, value) {
  const profile = await findUserById(targetUid);
  if (!profile) throw new HttpError(404, 'users/not-found', 'User not found.');
  if (profile.role !== ROLES.PARENT) {
    throw new HttpError(400, 'users/not-parent', 'A mobile number can only be set for parent accounts.');
  }
  let mobileNumber = null;
  if (value !== null && value !== undefined && value !== '') {
    mobileNumber = normalizePhMobileNumber(value);
    if (!mobileNumber) {
      const message = 'Enter a Philippine mobile number, e.g. 0917 123 4567.';
      throw new HttpError(400, 'validation/invalid-mobile-number', message, { fields: { mobileNumber: message } });
    }
  }
  await updateProfileWithAudit(targetUid, { mobileNumber }, {
    ...ctx, eventType: 'user.mobile-number-changed', details: { hasNumber: Boolean(mobileNumber) },
  });
  return toPublicUser(await findUserById(targetUid));
}
