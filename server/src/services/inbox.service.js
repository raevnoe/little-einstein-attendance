// In-app notifications (the bell): who is told what, and each account's feed.
//
//   attendance / dismissal / performance services (AFTER their transaction commits)
//     -> notify*() here -> users/{uid}/inbox/{deterministic id}
//   GET  /api/notifications       -> listInbox()   the caller's own inbox only
//   POST /api/notifications/seen  -> markSeen()
//
// Every notify*() is best effort and never throws: a notification problem must never undo or
// fail the action that caused it (same rule as SMS). Deterministic IDs mean a retried or
// repeated event never shows twice. Recipients are re-read at the time of the event: only
// ACTIVE accounts with the right role (parents linked to the child; staff; admins).
import {
  NOTIFICATION_AUDIENCES as AUDIENCE,
  NOTIFICATION_FEED_LIMIT,
  NOTIFICATION_KINDS as KIND,
  ROLES,
  SCAN_OUTCOMES,
  performanceAreaLabel,
} from '@led/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { audiencesFor, inboxCollection, isoFloor, toInboxView } from '../models/inbox.model.js';
import { findStudentsByParent } from '../models/student.model.js';
import { findUsersByIds, findUsersByRole, usersCollection } from '../models/user.model.js';
import { formatSchoolDateShort, formatSchoolTime, schoolDateOf } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';

const ALREADY_EXISTS = 6; // Firestore gRPC status

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

// ---- recipients

async function activeParentUids(parentIds = []) {
  const users = await findUsersByIds(parentIds);
  return users.filter((u) => u.role === ROLES.PARENT && u.active === true).map((u) => u.uid);
}

async function activeStaffUids({ adminsOnly = false } = {}) {
  const roles = adminsOnly ? [ROLES.ADMIN] : [ROLES.ADMIN, ROLES.TEACHER];
  const users = (await Promise.all(roles.map(findUsersByRole))).flat();
  return users.filter((u) => u.active === true).map((u) => u.uid);
}

// ---- writing

/** Logs only the kind and an error code: never names, numbers or IDs of people. */
async function safely(kind, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`[inbox] ${kind} notification could not be saved (${err?.code ?? 'error'}): ${err?.message}`);
  }
}

/** Writes one item into each inbox, once: an existing item with the same ID is left as it is. */
async function deliverOnce(uids, id, item) {
  await Promise.all(uids.map(async (uid) => {
    try {
      await inboxCollection(uid).doc(id).create({
        ...item,
        notifiedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      if (err?.code !== ALREADY_EXISTS) throw err;
    }
  }));
}

/**
 * For items that grow during the day (performance areas, SMS problem counts): `build(previous)`
 * returns the new fields from the stored item (or null). The item moves to the top again.
 */
async function deliverUpdate(uids, id, build) {
  if (uids.length === 0) return;
  await db.runTransaction(async (tx) => {
    const refs = uids.map((uid) => inboxCollection(uid).doc(id));
    const snaps = await tx.getAll(...refs);
    refs.forEach((ref, i) => {
      const previous = snaps[i].exists ? snaps[i].data() : null;
      tx.set(ref, {
        ...build(previous),
        notifiedAt: FieldValue.serverTimestamp(),
        ...(previous ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
    });
  });
}

// ---- parents

/** Arrival/departure of a child, after the attendance transaction committed. */
export async function notifyAttendanceInApp({ event, student, attendanceId, occurredAt }) {
  const arrival = event === 'arrival';
  await safely(arrival ? KIND.ARRIVAL : KIND.DEPARTURE, async () => {
    const uids = await activeParentUids(student.parentIds);
    await deliverOnce(uids, `${event}_${attendanceId}`, {
      kind: arrival ? KIND.ARRIVAL : KIND.DEPARTURE,
      audience: AUDIENCE.PARENT,
      title: arrival ? `${student.firstName} arrived at school` : `${student.firstName} left school`,
      body: `${arrival ? 'Time in' : 'Time out'}: ${formatSchoolTime(occurredAt)}`,
      link: 'records',
      studentId: student.studentId,
    });
  });
}

/** A Performance Evaluation was saved: one item per child per day, listing the areas so far. */
export async function notifyPerformanceInApp({ student, evaluationDate, area }) {
  await safely(KIND.PERFORMANCE, async () => {
    const uids = await activeParentUids(student.parentIds);
    await deliverUpdate(uids, `performance_${student.studentId}_${evaluationDate}`, (previous) => {
      const areas = [...new Set([...(previous?.areas ?? []), area])];
      return {
        kind: KIND.PERFORMANCE,
        audience: AUDIENCE.PARENT,
        title: `New Performance Evaluation for ${student.firstName}`,
        body: `${formatSchoolDateShort(evaluationDate)}: ${areas.map(performanceAreaLabel).join(', ')}`,
        link: 'records',
        studentId: student.studentId,
        date: evaluationDate,
        areas,
      };
    });
  });
}

// ---- dismissal (parents and staff)

/**
 * After a code request was processed. The requesting parent learns whether the code was sent
 * (never the code itself); when it was, every active teacher/admin sees a request waiting.
 */
export async function notifyDismissalRequestInApp({ record, student, parentUid, smsOk }) {
  const id = `${record.dismissalId}_${record.requestCount}`;
  const fetcher = `${record.fetcherName} (${record.fetcherRelationship})`;
  await safely(smsOk ? KIND.DISMISSAL_CODE_SENT : KIND.DISMISSAL_SMS_FAILED, async () => {
    await deliverOnce([parentUid], `dismissal-code_${id}`, smsOk
      ? {
        kind: KIND.DISMISSAL_CODE_SENT,
        audience: AUDIENCE.PARENT,
        title: `Dismissal code sent for ${student.firstName}`,
        body: `Sent to your mobile number for ${fetcher}. It expires at ${formatSchoolTime(record.otpExpiresAt.toDate())}.`,
        link: 'dismissal',
        studentId: student.studentId,
      }
      : {
        kind: KIND.DISMISSAL_SMS_FAILED,
        audience: AUDIENCE.PARENT,
        title: `Dismissal code for ${student.firstName} could not be sent`,
        body: 'No code is active. Please request a new code in a minute.',
        link: 'dismissal',
        studentId: student.studentId,
      });
  });
  if (!smsOk) return;
  await safely(KIND.DISMISSAL_REQUEST, async () => {
    await deliverOnce(await activeStaffUids(), `dismissal-request_${id}`, {
      kind: KIND.DISMISSAL_REQUEST,
      audience: AUDIENCE.STAFF,
      title: `Dismissal request: ${fullName(student)}`,
      body: `Fetcher: ${fetcher}. Waiting for code verification.`,
      link: 'dismissal',
    });
  });
}

/** Too many incorrect codes: staff are told the request is locked. */
export async function notifyDismissalLockedInApp({ record, student }) {
  await safely(KIND.DISMISSAL_LOCKED, async () => {
    await deliverOnce(await activeStaffUids(), `dismissal-locked_${record.dismissalId}_${record.requestCount}`, {
      kind: KIND.DISMISSAL_LOCKED,
      audience: AUDIENCE.STAFF,
      title: `Dismissal code locked: ${student ? fullName(student) : record.studentId}`,
      body: 'Too many incorrect codes. The parent must request a new code.',
      link: 'dismissal',
    });
  });
}

/** The child was handed to the Fetcher: every active parent linked to the child is told. */
export async function notifyReleasedInApp({ record, student, releasedAt }) {
  await safely(KIND.DISMISSAL_RELEASED, async () => {
    await deliverOnce(await activeParentUids(student.parentIds), `dismissal-released_${record.dismissalId}`, {
      kind: KIND.DISMISSAL_RELEASED,
      audience: AUDIENCE.PARENT,
      title: `${student.firstName} has been picked up`,
      body: `Released to ${record.fetcherName} (${record.fetcherRelationship}) at ${formatSchoolTime(releasedAt)}.`,
      link: 'dismissal',
      studentId: student.studentId,
    });
  });
}

// ---- admins

const REJECTED_SCAN_TEXT = {
  [SCAN_OUTCOMES.UNKNOWN_RFID]: ['Unknown RFID card scanned', 'Register it under RFID Cards if it belongs to a student.'],
  [SCAN_OUTCOMES.RFID_INACTIVE]: ['Inactive RFID card scanned', 'No attendance was recorded.'],
  [SCAN_OUTCOMES.RFID_UNASSIGNED]: ['Unassigned RFID card scanned', 'Assign it to a student under RFID Cards.'],
  [SCAN_OUTCOMES.STUDENT_INACTIVE]: ['Card of an inactive student scanned', 'No attendance was recorded.'],
};

/**
 * A rejected scan (unknown/inactive/unassigned card, inactive student). At most one item per
 * card + reason + day. Scans after a time-out are normal at the gate and are not reported.
 */
export async function notifyRejectedScanInApp({ outcome, uid, student, at = new Date() }) {
  const text = REJECTED_SCAN_TEXT[outcome];
  if (!text) return;
  await safely(KIND.RFID_SCAN_REJECTED, async () => {
    const who = student ? `${student.name} · ` : '';
    await deliverOnce(await activeStaffUids({ adminsOnly: true }), `rfid-scan-rejected_${outcome}_${uid}_${schoolDateOf(at)}`, {
      kind: KIND.RFID_SCAN_REJECTED,
      audience: AUDIENCE.ADMIN,
      title: text[0],
      body: `${who}UID ${uid} at ${formatSchoolTime(at)}. ${text[1]}`,
      link: 'rfid',
    });
  });
}

/** Arrival/departure SMS that failed or were skipped: one running count per day. */
export async function notifySmsProblemInApp({ sms, at = new Date() }) {
  const skipped = sms?.status === 'skipped' ? 1 : 0;
  const failed = sms && ['failed', 'partial'].includes(sms.status) ? Math.max(sms.failed ?? 0, 1) : 0;
  if (!skipped && !failed) return;
  await safely(KIND.SMS_PROBLEMS, async () => {
    const schoolDate = schoolDateOf(at);
    await deliverUpdate(await activeStaffUids({ adminsOnly: true }), `sms-problems_${schoolDate}`, (previous) => {
      const counts = { failed: (previous?.failed ?? 0) + failed, skipped: (previous?.skipped ?? 0) + skipped };
      const parts = [
        counts.failed && `${counts.failed} not sent`,
        counts.skipped && `${counts.skipped} skipped (no parent mobile number)`,
      ].filter(Boolean);
      return {
        kind: KIND.SMS_PROBLEMS,
        audience: AUDIENCE.ADMIN,
        title: 'Arrival/departure SMS problems today',
        body: `${parts.join(' · ')}. See the dashboard for today's SMS counts.`,
        link: 'dashboard',
        ...counts,
      };
    });
  });
}

// ---- the feed

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** ISO time -> Timestamp at the END of that millisecond (stored times have microseconds). */
function endOfMillisecond(value, field) {
  const ms = typeof value === 'string' && ISO_PATTERN.test(value) ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) throw new HttpError(400, 'validation/invalid-parameter', `"${field}" must be a time (ISO 8601).`);
  const seconds = Math.floor(ms / 1000);
  return new Timestamp(seconds, (ms - seconds * 1000) * 1_000_000 + 999_999);
}

function readFeedQuery(query = {}) {
  const unknown = Object.keys(query).filter((key) => key !== 'after');
  if (unknown.length) throw new HttpError(400, 'validation/unknown-parameters', `Unknown parameters: ${unknown.join(', ')}.`);
  if (query.after === undefined || query.after === '') return {};
  return { after: endOfMillisecond(query.after, 'after') };
}

/**
 * The caller's own inbox, newest first (at most NOTIFICATION_FEED_LIMIT). With ?after=<ISO>, only
 * items notified later (the bell's regular check: usually nothing). Items are shown only for the
 * caller's CURRENT role, and parent items only while the child is still linked and active.
 */
export async function listInbox({ uid, role, profile }, query) {
  const { after } = readFeedQuery(query);
  let feed = inboxCollection(uid).orderBy('notifiedAt', 'desc');
  if (after) feed = feed.where('notifiedAt', '>', after);
  const snapshot = await feed.limit(NOTIFICATION_FEED_LIMIT).get();

  const audiences = audiencesFor(role);
  let items = snapshot.docs.map((doc) => ({ data: doc.data(), id: doc.id })).filter(({ data }) => audiences.includes(data.audience));
  if (role === ROLES.PARENT && items.some(({ data }) => data.studentId)) {
    const linked = new Set((await findStudentsByParent(uid)).filter((s) => s.active).map((s) => s.studentId));
    items = items.filter(({ data }) => !data.studentId || linked.has(data.studentId));
  }
  return {
    items: items.map(({ id, data }) => toInboxView(id, data)),
    seenAt: isoFloor(profile?.notificationsSeenAt),
  };
}

/**
 * Body { upTo: ISO }: everything notified up to that time counts as seen (the newest item the
 * bell showed, so an item that arrives meanwhile stays unread). Only ever moves forward, never
 * past the current time. Not audited: it is a reading marker, not a change to the account.
 */
export async function markSeen(uid, input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const unknown = Object.keys(body).filter((key) => key !== 'upTo');
  if (unknown.length) throw new HttpError(400, 'validation/unknown-fields', `These fields cannot be set: ${unknown.join(', ')}.`);
  const requested = endOfMillisecond(body.upTo, 'upTo');
  const now = Timestamp.now();
  const upTo = requested.valueOf() > now.valueOf() ? now : requested;

  const seenAt = await db.runTransaction(async (tx) => {
    const ref = usersCollection().doc(uid);
    const current = (await tx.get(ref)).data()?.notificationsSeenAt;
    if (current && current.valueOf() >= upTo.valueOf()) return current;
    tx.update(ref, { notificationsSeenAt: upTo });
    return upTo;
  });
  return { seenAt: isoFloor(seenAt) };
}
