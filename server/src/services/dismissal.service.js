// Dismissal Verification: a parent asks for a one-time code for ONE own child and ONE of
// their own active Fetchers authorized for that child; the server texts the code to that
// parent's registered mobile number; the parent gives it to the Fetcher; a teacher enters
// it (verify) and then separately confirms the handover (release).
//
//   parent  POST /api/parent/dismissals         -> requestDismissalCode()
//   staff   POST /api/dismissals/:id/verify     -> verifyDismissalCode()
//   staff   POST /api/dismissals/:id/release    -> releaseStudent()
//
// Code rules:
//   - 6 digits from crypto.randomInt; only a salted scrypt hash is stored (bound to the
//     dismissal ID and request number), compared in constant time.
//   - The code is usable only after the SMS provider accepted it. If the SMS fails, the hash
//     is deleted, so no uncommunicated code can ever be verified.
//   - Expires after otpExpiryMinutes; locked after otpMaxAttempts incorrect codes; deleted
//     when verified (single use). A new request replaces the previous code.
//   - Requests are limited per child per day (cooldown + daily cap), decided inside the same
//     Firestore transaction, so concurrent requests cannot bypass the limits.
//   - The plain code exists only in memory between generation and the SMS call. It is never
//     returned, logged, or stored (the SMS text is not stored either). Sole exception, for
//     local manual testing: with NODE_ENV != production AND SMS_PROVIDER=mock it is also kept
//     in process memory for the requesting parent (getDevOtpForParent, devOtpOutbox.js).
// Every state change is a Firestore transaction on dismissalRecords/{studentId}_{schoolDate},
// so two concurrent verifications or releases cannot both succeed.
// Audit (Phase 11): every state change writes its audit entry in that same transaction
// (code activated or SMS failed, wrong code, lock, expiry, cancellation, verification,
// release). Refusals that change nothing (cooldown, daily limit, stale request, already used)
// are audited best effort. Entries never contain the code, its hash/salt, the SMS text,
// the phone number, or the Fetcher's name.
// In-app notifications (inbox.service.js, after each commit, best effort): code sent / SMS failed
// to the requesting parent, request waiting and code locked to staff, release to the child's
// parents. They name the Fetcher (as the Dismissal screens do) but never contain the code.
import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  DEFAULT_DISMISSAL_MAX_CODES_PER_DAY,
  DEFAULT_DISMISSAL_REQUEST_COOLDOWN_SECONDS,
  DISMISSAL_OTP_PATTERN,
  DISMISSAL_STATUS,
  normalizePhMobileNumber,
} from '@led/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { env } from '../config/env.js';
import {
  dismissalDocId,
  dismissalRef,
  dismissalsCollection,
  effectiveDismissalStatus,
  findDismissalsByDate,
  parseDismissalDocId,
  toParentDismissalView,
  toStaffDismissalView,
} from '../models/dismissal.model.js';
import { FETCHER_ID_PATTERN, fetcherAuthorizedFor, fetchersCollection } from '../models/fetcher.model.js';
import { findStudentById, findStudentsByParent, normalizeStudentId, studentsCollection } from '../models/student.model.js';
import { ALL_SECTIONS, sectionInScope, studentInScope } from '../utils/sectionScope.js';
import { getDismissalSettings } from '../models/systemSettings.model.js';
import { findUsersByIds } from '../models/user.model.js';
import { sendSms } from './sms/sms.service.js';
import { auditInTransaction, recordAudit } from './audit.service.js';
import { notifyDismissalLockedInApp, notifyDismissalRequestInApp, notifyReleasedInApp } from './inbox.service.js';
import { isDevOtpOutboxEnabled, readDevOtp, rememberDevOtp } from './sms/devOtpOutbox.js';
import { parseSchoolDate } from './attendance.service.js';
import { schoolDateOf } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';

// Defaults; the live values are School Settings (systemSettings/dismissal).
export const REQUEST_COOLDOWN_SECONDS = DEFAULT_DISMISSAL_REQUEST_COOLDOWN_SECONDS;
export const MAX_CODE_REQUESTS_PER_DAY = DEFAULT_DISMISSAL_MAX_CODES_PER_DAY;

const SCHOOL_NAME = 'Little Einstein Discovery School';
const HASH_BYTES = 32;
const scryptAsync = promisify(scrypt);

// Server clock. Tests replace it to check expiry without waiting.
let clock = () => Date.now();
export function setDismissalClockForTests(fn) {
  clock = fn ?? (() => Date.now());
}
const now = () => Timestamp.fromMillis(clock());

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

// ---- errors (messages are safe for clients; none reveals a code or another family's data)
const STUDENT_NOT_FOUND = () => new HttpError(404, 'students/not-found', 'This student could not be found.');
const FETCHER_NOT_AUTHORIZED = () =>
  new HttpError(404, 'fetchers/not-authorized', 'This Fetcher could not be found or is not authorized for this child.');
const DISMISSAL_NOT_FOUND = () =>
  new HttpError(404, 'dismissal/not-found', 'This dismissal request could not be found.');
const NOT_VERIFIABLE = () =>
  new HttpError(409, 'dismissal/not-verifiable', 'This code can no longer be used. Ask the parent to request a new code.');
const STALE_REQUEST = () =>
  new HttpError(409, 'dismissal/request-changed', 'This dismissal request has changed. Refresh the list and try again.');
const FETCHER_NO_LONGER_AUTHORIZED = () =>
  new HttpError(409, 'dismissal/fetcher-not-authorized',
    'This Fetcher is no longer authorized to collect this child. Do not release the child.');

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/** Anything else (verifiedBy, releasedBy, status, timestamps, role...) is rejected, never trusted. */
function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new HttpError(400, 'validation/unknown-fields', `These fields cannot be set: ${unknown.join(', ')}.`);
  }
}

function parseRequestNumber(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new HttpError(400, 'validation/invalid-request-number', 'Refresh the dismissal list and try again.');
  }
  return value;
}

/** Parses a dismissal ID from a URL; 404 so malformed and unknown IDs look the same. */
export function parseDismissalId(value) {
  const parts = parseDismissalDocId(value);
  if (!parts) throw DISMISSAL_NOT_FOUND();
  return dismissalDocId(parts.studentId, parts.schoolDate);
}

// ---- code generation and hashing

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** The hash is bound to the record and request, so a hash copied elsewhere verifies nothing. */
async function hashOtp(otp, saltHex, dismissalId, requestNumber) {
  const key = await scryptAsync(`${dismissalId}:${requestNumber}:${otp}`, Buffer.from(saltHex, 'hex'), HASH_BYTES);
  return key.toString('hex');
}

async function otpMatches(otp, record) {
  if (typeof record.otpHash !== 'string' || typeof record.otpSalt !== 'string') return false;
  const expected = Buffer.from(record.otpHash, 'hex');
  const actual = Buffer.from(await hashOtp(otp, record.otpSalt, record.dismissalId, record.requestCount), 'hex');
  return expected.length === HASH_BYTES && timingSafeEqual(expected, actual);
}

const DISCARD_CODE = () => ({ otpHash: FieldValue.delete(), otpSalt: FieldValue.delete() });

/** Short GSM-7 friendly text. Only the child's first name; no IDs or other internal data. */
export function dismissalSmsMessage({ childFirstName, fetcherName, otp, expiryMinutes }) {
  return `${SCHOOL_NAME}: ${childFirstName}'s dismissal code is ${otp}. `
    + `Give it only to ${fetcherName}. Valid for ${expiryMinutes} minutes.`;
}

// ---- parent: request a code

/**
 * `parent` is { uid, profile } from the verified token and the server-side profile.
 * Body: { studentId, fetcherId }. Returns the parent view of the request (never the code).
 */
export async function requestDismissalCode(parent, input) {
  const body = asObject(input);
  rejectUnknownFields(body, ['studentId', 'fetcherId']);
  const studentId = normalizeStudentId(body.studentId);
  if (!studentId) throw new HttpError(400, 'validation/invalid-student-id', 'Select one of your children.');
  if (typeof body.fetcherId !== 'string' || !FETCHER_ID_PATTERN.test(body.fetcherId)) throw FETCHER_NOT_AUTHORIZED();

  const ctx = parent.ctx ?? { actor: { type: 'user', uid: parent.uid, role: 'parent' } };
  const audit = (dismissalId, extra) => ({
    ...ctx,
    eventType: 'dismissal.code-requested',
    target: { type: 'dismissal', id: dismissalId },
    ...extra,
    details: { studentId, fetcherId: body.fetcherId, ...extra.details },
  });
  // A refused request changes nothing: audited best effort, then reported to the parent.
  const refused = async (err) => {
    if (err instanceof HttpError) {
      const dismissalId = dismissalDocId(studentId, schoolDateOf(new Date(clock())));
      await recordAudit(audit(dismissalId, { outcome: 'failure', reason: err.code, details: {} }));
    }
    return err;
  };

  const to = normalizePhMobileNumber(parent.profile?.mobileNumber);
  if (!to) {
    throw await refused(new HttpError(409, 'dismissal/no-mobile-number',
      'Your account has no mobile number for SMS. Please ask the school to add one.'));
  }

  const { otpExpiryMinutes, otpMaxAttempts, requestCooldownSeconds, maxCodesPerDay } = await getDismissalSettings();
  const otp = generateOtp();
  const salt = randomBytes(16).toString('hex');

  const created = await db.runTransaction(async (tx) => {
    const at = now();
    const schoolDate = schoolDateOf(at.toDate());
    const ref = dismissalRef(studentId, schoolDate);
    const [studentSnap, fetcherSnap, recordSnap] = await tx.getAll(
      studentsCollection().doc(studentId), fetchersCollection().doc(body.fetcherId), ref,
    );
    const student = studentSnap.exists ? studentSnap.data() : null;
    if (!student || student.active !== true || !student.parentIds?.includes(parent.uid)) throw STUDENT_NOT_FOUND();
    const fetcher = fetcherSnap.exists ? fetcherSnap.data() : null;
    if (!fetcher || fetcher.parentId !== parent.uid || !fetcherAuthorizedFor(fetcher, student)) throw FETCHER_NOT_AUTHORIZED();

    const existing = recordSnap.exists ? recordSnap.data() : null;
    if (existing?.status === DISMISSAL_STATUS.RELEASED) {
      throw new HttpError(409, 'dismissal/already-released', `${student.firstName} has already been released today.`);
    }
    if (existing?.status === DISMISSAL_STATUS.VERIFIED) {
      throw new HttpError(409, 'dismissal/already-verified',
        `A teacher has already verified the code for ${student.firstName}. No new code is needed.`);
    }
    if (existing && (existing.requestCount ?? 0) >= maxCodesPerDay) {
      throw new HttpError(429, 'dismissal/daily-limit',
        `The limit of ${maxCodesPerDay} codes per child per day has been reached. Please contact the school.`);
    }
    const waitMs = existing?.requestedAt ? existing.requestedAt.toMillis() + requestCooldownSeconds * 1000 - at.toMillis() : 0;
    if (waitMs > 0) {
      throw new HttpError(429, 'dismissal/too-soon',
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`);
    }

    const dismissalId = dismissalDocId(studentId, schoolDate);
    const requestNumber = (existing?.requestCount ?? 0) + 1;
    const fields = {
      parentId: parent.uid,
      fetcherId: fetcher.fetcherId,
      fetcherName: fetcher.fullName,
      fetcherRelationship: fetcher.relationship,
      // Not usable until the SMS provider accepts the message.
      status: DISMISSAL_STATUS.SENDING,
      requestCount: requestNumber,
      requestedAt: at,
      otpExpiresAt: Timestamp.fromMillis(at.toMillis() + otpExpiryMinutes * 60_000),
      otpHash: await hashOtp(otp, salt, dismissalId, requestNumber),
      otpSalt: salt,
      failedAttempts: 0,
      maxAttempts: otpMaxAttempts,
      sms: null,
      verifiedAt: null,
      verifiedBy: null,
      releasedAt: null,
      releasedBy: null,
      lockedAt: null,
      cancelledAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existing) tx.update(ref, fields);
    else tx.create(ref, { dismissalId, studentId, schoolDate, ...fields, createdAt: FieldValue.serverTimestamp() });
    return { ref, dismissalId, requestNumber, student, fetcher, expiresAtMs: fields.otpExpiresAt.toMillis() };
  }).catch(async (err) => {
    throw await refused(err);
  });

  // SMS outside the transaction (a network call must never be retried by Firestore).
  const sms = await sendSms(to, dismissalSmsMessage({
    childFirstName: created.student.firstName,
    fetcherName: created.fetcher.fullName,
    otp,
    expiryMinutes: otpExpiryMinutes,
  }));

  // Activate the code only if THIS request is still the current one and the SMS was accepted.
  // The audit entry is part of the same transaction: if it cannot be written, the code stays
  // unusable ("sending") and the parent gets an error.
  const smsAudit = {
    requestNumber: created.requestNumber, smsStatus: sms.ok ? 'sent' : 'failed', smsErrorCode: sms.error?.code ?? null,
  };
  const activated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(created.ref);
    const record = snap.data();
    if (!record || record.requestCount !== created.requestNumber || record.status !== DISMISSAL_STATUS.SENDING) return false;
    auditInTransaction(tx, audit(created.dismissalId, sms.ok
      ? { outcome: 'success', reason: 'dismissal/code-sent', details: smsAudit }
      : { outcome: 'failure', reason: 'dismissal/sms-failed', details: smsAudit }));
    tx.update(created.ref, sms.ok
      ? {
        status: DISMISSAL_STATUS.AWAITING_VERIFICATION,
        sms: { status: 'sent', provider: sms.provider, providerMessageId: sms.providerMessageId ?? null, error: null },
        updatedAt: FieldValue.serverTimestamp(),
      }
      : {
        status: DISMISSAL_STATUS.SMS_FAILED,
        ...DISCARD_CODE(),
        sms: { status: 'failed', provider: sms.provider, providerMessageId: null, error: sms.error ?? null },
        updatedAt: FieldValue.serverTimestamp(),
      });
    return true;
  });
  if (!activated) {
    // A newer request replaced this one while the SMS was being sent: this code is never usable.
    await recordAudit(audit(created.dismissalId, { outcome: 'failure', reason: 'dismissal/superseded', details: smsAudit }));
  }

  // In-app notifications (best effort): only for the request that is still the current one.
  // They never contain the code.
  const stored = activated ? (await created.ref.get()).data() : null;
  if (stored) await notifyDismissalRequestInApp({ record: stored, student: created.student, parentUid: parent.uid, smsOk: sms.ok });

  if (!sms.ok) {
    // error.message is safe to log: providers never include the token, number, or SMS text.
    console.warn(`[dismissal] code SMS for ${created.student.studentId} failed (${sms.error?.code}): ${sms.error?.message}`);
    throw new HttpError(502, 'dismissal/sms-failed',
      'The code could not be sent by SMS. No code is active. Please try again in a minute.');
  }

  // Development with the MOCK provider only (no-op otherwise): keep the code in memory so the
  // requesting parent can read it for a manual test. See services/sms/devOtpOutbox.js.
  rememberDevOtp({
    dismissalId: created.dismissalId,
    requestNumber: created.requestNumber,
    parentId: parent.uid,
    otp,
    expiresAtMs: created.expiresAtMs,
    nowMs: clock(),
  });

  const record = stored ?? (await created.ref.get()).data();
  return toParentDismissalView(record, clock());
}

/** Today's dismissal records for the parent's own active children. */
export async function listOwnDismissals(parentUid) {
  const schoolDate = schoolDateOf(new Date(clock()));
  const children = (await findStudentsByParent(parentUid)).filter((s) => s.active);
  if (children.length === 0) return { schoolDate, timeZone: env.schoolTimeZone, dismissals: [] };
  const snaps = await db.getAll(...children.map((s) => dismissalRef(s.studentId, schoolDate)));
  const nowMs = clock();
  return {
    schoolDate,
    timeZone: env.schoolTimeZone,
    // Every parent linked to the child sees the child's dismissal status (never the code).
    dismissals: snaps.filter((s) => s.exists).map((s) => toParentDismissalView(s.data(), nowMs)),
  };
}

// ---- development only (mock SMS): read back the code the mock provider "sent"

const DEV_OTP_NOT_AVAILABLE = () =>
  new HttpError(404, 'dev-otp/not-available', 'No usable test code for this child. Request a new code first.');

/**
 * DEVELOPMENT + MOCK SMS ONLY. The code of the caller's OWN current request for their own
 * child: only the parent who requested it (the SMS recipient), only while it can still be
 * verified. 404 in every other case, including when the dev outbox is disabled.
 */
export async function getDevOtpForParent(parentUid, studentId) {
  if (!isDevOtpOutboxEnabled()) throw DEV_OTP_NOT_AVAILABLE();
  const nowMs = clock();
  const schoolDate = schoolDateOf(new Date(nowMs));
  const [studentSnap, recordSnap] = await db.getAll(studentsCollection().doc(studentId), dismissalRef(studentId, schoolDate));
  const student = studentSnap.exists ? studentSnap.data() : null;
  if (!student || student.active !== true || !student.parentIds?.includes(parentUid)) throw STUDENT_NOT_FOUND();

  const record = recordSnap.exists ? recordSnap.data() : null;
  const entry = record ? readDevOtp(record.dismissalId) : null;
  if (!record || !entry
    || record.parentId !== parentUid || entry.parentId !== parentUid
    || entry.requestNumber !== record.requestCount
    || effectiveDismissalStatus(record, nowMs) !== DISMISSAL_STATUS.AWAITING_VERIFICATION) {
    throw DEV_OTP_NOT_AVAILABLE();
  }
  return {
    otp: entry.otp,
    dismissalId: record.dismissalId,
    requestNumber: record.requestCount,
    otpExpiresAt: record.otpExpiresAt.toDate().toISOString(),
  };
}

// ---- staff: list, verify, release

/** Teachers act only on dismissals of students in their sections; others look like a missing record. */
async function assertStaffScope(dismissalId, scope) {
  if (scope.all) return;
  const parts = parseDismissalDocId(dismissalId);
  const student = parts ? await findStudentById(parts.studentId) : null;
  if (!studentInScope(scope, student)) throw DISMISSAL_NOT_FOUND();
}

/** Re-checks the Fetcher at verify/release time: still active, authorized, and unchanged. */
async function readFetcherAndStudent(tx, record) {
  const [fetcherSnap, studentSnap] = await tx.getAll(
    fetchersCollection().doc(record.fetcherId), studentsCollection().doc(record.studentId),
  );
  const fetcher = fetcherSnap.exists ? fetcherSnap.data() : null;
  const student = studentSnap.exists ? studentSnap.data() : null;
  const stillValid = fetcherAuthorizedFor(fetcher, student)
    && fetcher.parentId === record.parentId
    && fetcher.fullName === record.fetcherName
    && fetcher.relationship === record.fetcherRelationship;
  return { stillValid, student };
}

function cancelFields(at) {
  return { status: DISMISSAL_STATUS.CANCELLED, cancelledAt: at, ...DISCARD_CODE(), updatedAt: FieldValue.serverTimestamp() };
}

/** Loads the record for a staff action: must exist, be today's, and be the request on screen. */
async function readForStaffAction(tx, dismissalId, requestNumber, at) {
  const ref = dismissalsCollection().doc(dismissalId);
  const snap = await tx.get(ref);
  const record = snap.exists ? snap.data() : null;
  if (!record || record.schoolDate !== schoolDateOf(at.toDate())) return { error: DISMISSAL_NOT_FOUND() };
  if (record.requestCount !== requestNumber) return { error: STALE_REQUEST() };
  return { ref, record };
}

/** Audit event for a staff action on a dismissal record (no code, Fetcher name or phone). */
function staffAudit(ctx, dismissalId, requestNumber, record, eventType, outcome, reason, details = {}) {
  return {
    ...ctx,
    eventType,
    outcome,
    target: { type: 'dismissal', id: dismissalId },
    reason,
    details: { studentId: record?.studentId ?? null, fetcherId: record?.fetcherId ?? null, requestNumber, ...details },
  };
}

/**
 * Body: { otp, requestNumber }. `ctx` = auditContext(req); the verifier is its verified user.
 * On success the code is deleted (single use) and the record becomes "verified"; the child is
 * NOT released yet.
 */
export async function verifyDismissalCode(ctx, dismissalId, input, { scope = ALL_SECTIONS } = {}) {
  await assertStaffScope(dismissalId, scope);
  const staffUid = ctx.actor.uid;
  const body = asObject(input);
  rejectUnknownFields(body, ['otp', 'requestNumber']);
  const otp = typeof body.otp === 'string' ? body.otp.replace(/\s/g, '') : '';
  if (!DISMISSAL_OTP_PATTERN.test(otp)) {
    throw new HttpError(400, 'validation/invalid-otp', 'Enter the 6-digit code.', { fields: { otp: 'Enter the 6-digit code.' } });
  }
  const requestNumber = parseRequestNumber(body.requestNumber);
  const audit = (record, eventType, outcome, reason, details) =>
    staffAudit(ctx, dismissalId, requestNumber, record, eventType, outcome, reason, details);

  const outcome = await db.runTransaction(async (tx) => {
    const at = now();
    const { ref, record, error } = await readForStaffAction(tx, dismissalId, requestNumber, at);
    if (error) return { error, record };
    if (record.status === DISMISSAL_STATUS.VERIFIED || record.status === DISMISSAL_STATUS.RELEASED) {
      return { error: new HttpError(409, 'dismissal/already-used', 'This code has already been used.'), record };
    }
    if (record.status !== DISMISSAL_STATUS.AWAITING_VERIFICATION) return { error: NOT_VERIFIABLE(), record };

    const { stillValid, student } = await readFetcherAndStudent(tx, record);
    // A refusal that changes the record is audited in this same transaction.
    const fail = (error, details) => {
      auditInTransaction(tx, audit(record, 'dismissal.verify-failed', 'failure', error.code, details));
      return { error, audited: true };
    };
    if (record.otpExpiresAt.toMillis() <= at.toMillis()) {
      tx.update(ref, { status: DISMISSAL_STATUS.EXPIRED, ...DISCARD_CODE(), updatedAt: FieldValue.serverTimestamp() });
      return fail(new HttpError(409, 'dismissal/expired', 'This code has expired. Ask the parent to request a new code.'));
    }
    if (!stillValid) {
      tx.update(ref, cancelFields(at));
      return fail(FETCHER_NO_LONGER_AUTHORIZED());
    }

    if (await otpMatches(otp, record)) {
      tx.update(ref, {
        status: DISMISSAL_STATUS.VERIFIED,
        verifiedAt: at,
        verifiedBy: staffUid,
        ...DISCARD_CODE(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      auditInTransaction(tx, audit(record, 'dismissal.verified', 'success', 'dismissal/verified'));
      return { ok: true };
    }

    const failedAttempts = (record.failedAttempts ?? 0) + 1;
    const remaining = Math.max(0, (record.maxAttempts ?? 0) - failedAttempts);
    if (remaining === 0) {
      tx.update(ref, {
        status: DISMISSAL_STATUS.LOCKED, failedAttempts, lockedAt: at, ...DISCARD_CODE(), updatedAt: FieldValue.serverTimestamp(),
      });
      const locked = fail(new HttpError(409, 'dismissal/locked',
        'Too many incorrect codes. This request is locked; the parent must request a new code.'), { attemptsRemaining: 0 });
      return { ...locked, locked: { record, student } };
    }
    tx.update(ref, { failedAttempts, updatedAt: FieldValue.serverTimestamp() });
    return fail(new HttpError(400, 'dismissal/incorrect-code',
      `The code is incorrect. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left.`, { attemptsRemaining: remaining }),
    { attemptsRemaining: remaining });
  });

  // Failed attempts and lockouts are committed (with their audit entries) before we report them.
  // Refusals that changed nothing (stale request, already used...) are audited best effort.
  if (outcome.error) {
    if (!outcome.audited) await recordAudit(audit(outcome.record, 'dismissal.verify-failed', 'failure', outcome.error.code));
    if (outcome.locked) await notifyDismissalLockedInApp(outcome.locked);
    throw outcome.error;
  }
  return getStaffDismissal(dismissalId);
}

/**
 * Body: { requestNumber }. Separate, explicit confirmation that the verified Fetcher has the
 * child. Final: a released record can never be released (or verified) again.
 */
export async function releaseStudent(ctx, dismissalId, input, { scope = ALL_SECTIONS } = {}) {
  await assertStaffScope(dismissalId, scope);
  const staffUid = ctx.actor.uid;
  const body = asObject(input);
  rejectUnknownFields(body, ['requestNumber']);
  const requestNumber = parseRequestNumber(body.requestNumber);
  const audit = (record, eventType, outcome, reason) =>
    staffAudit(ctx, dismissalId, requestNumber, record, eventType, outcome, reason);

  const outcome = await db.runTransaction(async (tx) => {
    const at = now();
    const { ref, record, error } = await readForStaffAction(tx, dismissalId, requestNumber, at);
    if (error) return { error, record };
    if (record.status === DISMISSAL_STATUS.RELEASED) {
      return { error: new HttpError(409, 'dismissal/already-released', 'This child has already been released.'), record };
    }
    if (record.status !== DISMISSAL_STATUS.VERIFIED) {
      return { error: new HttpError(409, 'dismissal/not-verified', 'Verify the Fetcher’s code before releasing the child.'), record };
    }
    const { stillValid, student } = await readFetcherAndStudent(tx, record);
    if (!stillValid) {
      tx.update(ref, cancelFields(at));
      const cancelled = FETCHER_NO_LONGER_AUTHORIZED();
      auditInTransaction(tx, audit(record, 'dismissal.release-failed', 'failure', cancelled.code));
      return { error: cancelled, audited: true };
    }
    tx.update(ref, {
      status: DISMISSAL_STATUS.RELEASED,
      releasedAt: at,
      releasedBy: staffUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, audit(record, 'dismissal.released', 'success', 'dismissal/released'));
    return { ok: true, released: { record, student, releasedAt: at.toDate() } };
  });

  if (outcome.error) {
    if (!outcome.audited) await recordAudit(audit(outcome.record, 'dismissal.release-failed', 'failure', outcome.error.code));
    throw outcome.error;
  }
  // Parents' bell (best effort, after the commit).
  await notifyReleasedInApp(outcome.released);
  return getStaffDismissal(dismissalId);
}

/** Adds student name/section and parent/staff display names (no phone numbers). */
async function withNames(records) {
  const nowMs = clock();
  const uids = [...new Set(records.flatMap((r) => [r.parentId, r.verifiedBy, r.releasedBy]).filter(Boolean))];
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const [users, studentSnaps] = await Promise.all([
    findUsersByIds(uids),
    studentIds.length ? db.getAll(...studentIds.map((id) => studentsCollection().doc(id))) : [],
  ]);
  const names = new Map(users.map((u) => [u.uid, u.displayName]));
  const students = new Map(studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
  return records.map((r) => {
    const s = students.get(r.studentId);
    return {
      ...toStaffDismissalView(r, nowMs, names),
      student: s ? { studentId: s.studentId, name: fullName(s), section: s.section, active: s.active } : null,
    };
  });
}

export async function getStaffDismissal(dismissalId) {
  const snap = await dismissalsCollection().doc(dismissalId).get();
  if (!snap.exists) throw DISMISSAL_NOT_FOUND();
  return (await withNames([snap.data()]))[0];
}

/** Staff list for one school day (default today), newest request first; teachers: their sections only. */
export async function listDismissals({ date, scope = ALL_SECTIONS } = {}) {
  const schoolDate = parseSchoolDate(date);
  const records = await findDismissalsByDate(schoolDate);
  const dismissals = (await withNames(records))
    .filter((d) => scope.all || Boolean(d.student && sectionInScope(scope, d.student.section)))
    .sort((a, b) => (b.requestedAt ?? '').localeCompare(a.requestedAt ?? ''));
  return { schoolDate, today: schoolDateOf(new Date(clock())), timeZone: env.schoolTimeZone, dismissals };
}
