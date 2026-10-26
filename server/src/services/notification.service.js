// Attendance SMS notifications to parents.
//
//   attendance.service (after the transaction commits)
//     -> notifyAttendanceEvent()      who to text, what to say, record the result
//       -> sms.service sendSms()     provider boundary
//         -> IPROG (or mock) provider HTTP call
//
// Never throws: an SMS problem must never undo or fail an attendance record.
import { ROLES, normalizePhMobileNumber } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { formatSchoolTime } from '../utils/schoolDate.js';
import { NOTIFICATION_EVENTS, NOTIFICATION_STATUS, notificationDocId, notificationsCollection } from '../models/notification.model.js';
import { findUsersByIds } from '../models/user.model.js';
import { getSmsSettings } from '../models/systemSettings.model.js';
import { sendSms } from './sms/sms.service.js';

const ALREADY_EXISTS = 6; // Firestore gRPC status
const SCHOOL_NAME = 'Little Einstein Discovery School';

/** Short, parent-friendly text. No RFID UID, account IDs, or other internal data. */
export function attendanceSmsMessage(event, student, occurredAt) {
  const name = [student.firstName, student.lastName].filter(Boolean).join(' ');
  const time = formatSchoolTime(occurredAt);
  return event === NOTIFICATION_EVENTS.ARRIVAL
    ? `${SCHOOL_NAME}: ${name} has arrived at school at ${time}.`
    : `${SCHOOL_NAME}: ${name} has checked out at ${time}.`;
}

/**
 * Unique, valid mobile numbers of the student's ACTIVE parent accounts.
 * Returns [{ to: '+639XXXXXXXXX', parentIds: [...] }] (parents sharing a number share one SMS).
 * With `honourOptOut`, parents who turned off arrival/departure SMS (users/{uid}.attendanceSms
 * === false) are left out; `optedOut` counts them.
 */
export async function parentRecipients(parentIds = [], { honourOptOut = false } = {}) {
  const parents = await findUsersByIds(parentIds);
  const byNumber = new Map();
  let optedOut = 0;
  for (const parent of parents) {
    if (parent.role !== ROLES.PARENT || parent.active !== true) continue;
    const to = normalizePhMobileNumber(parent.mobileNumber);
    if (!to) continue;
    if (honourOptOut && parent.attendanceSms === false) {
      optedOut += 1;
      continue;
    }
    if (!byNumber.has(to)) byNumber.set(to, []);
    byNumber.get(to).push(parent.uid);
  }
  const recipients = [...byNumber.entries()].map(([to, ids]) => ({ to, parentIds: ids }));
  return Object.assign(recipients, { optedOut });
}

/** Sends to one number unless this event was already sent/attempted for it. */
async function sendOnce(base, { to, parentIds }) {
  const ref = notificationsCollection().doc(notificationDocId(base.attendanceId, base.event, to));
  try {
    // Claim the (attendance, event, number) slot first; a second request for it stops here.
    await ref.create({
      ...base, parentIds, recipient: to, provider: null, providerMessageId: null,
      status: NOTIFICATION_STATUS.PENDING, error: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err?.code === ALREADY_EXISTS) return 'duplicate';
    throw err;
  }
  const result = await sendSms(to, base.message);
  const status = result.ok ? NOTIFICATION_STATUS.SENT : NOTIFICATION_STATUS.FAILED;
  await ref.update({
    status,
    provider: result.provider,
    providerMessageId: result.providerMessageId ?? null,
    error: result.error ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  // error.message is already safe to log: providers never include the token or the phone number.
  if (!result.ok) console.warn(`[sms] ${base.event} SMS for ${base.studentId} failed (${result.error?.code}): ${result.error?.message}`);
  return status;
}

async function recordSkipped(base, reason) {
  try {
    await notificationsCollection().doc(notificationDocId(base.attendanceId, base.event, null)).create({
      ...base, parentIds: [], recipient: null, provider: null, providerMessageId: null,
      status: NOTIFICATION_STATUS.SKIPPED, error: { code: reason, message: 'No active parent account has a valid mobile number.' },
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err?.code !== ALREADY_EXISTS) throw err;
  }
}

/**
 * Texts the student's parents about an arrival/departure. Call ONLY after the attendance
 * transaction has committed. Returns a summary without phone numbers, for staff display:
 *   { event, status: sent | partial | failed | skipped | already-notified | off | opted-out, recipients, sent, failed }
 * `off` = turned off in School Settings; `opted-out` = every parent with a number turned them off.
 * Neither is a problem, so neither writes a notifications record.
 */
export async function notifyAttendanceEvent({ event, student, attendanceId, occurredAt }) {
  const summary = { event, status: NOTIFICATION_STATUS.FAILED, recipients: 0, sent: 0, failed: 0 };
  try {
    const { attendanceSmsEnabled, allowParentSmsOptOut } = await getSmsSettings();
    if (!attendanceSmsEnabled) return { ...summary, status: 'off' };
    const base = {
      studentId: student.studentId,
      attendanceId,
      event,
      channel: 'sms',
      message: attendanceSmsMessage(event, student, occurredAt),
    };
    const recipients = await parentRecipients(student.parentIds ?? [], { honourOptOut: allowParentSmsOptOut });
    if (recipients.length === 0 && recipients.optedOut > 0) return { ...summary, status: 'opted-out' };
    if (recipients.length === 0) {
      await recordSkipped(base, 'no-parent-mobile-number');
      return { ...summary, status: NOTIFICATION_STATUS.SKIPPED };
    }

    const results = await Promise.all(recipients.map((r) => sendOnce(base, r)));
    if (results.every((s) => s === 'duplicate')) return { ...summary, status: 'already-notified' };
    const sent = results.filter((s) => s === NOTIFICATION_STATUS.SENT).length;
    const failedCount = results.filter((s) => s === NOTIFICATION_STATUS.FAILED).length;
    const status = failedCount === 0 ? NOTIFICATION_STATUS.SENT : sent === 0 ? NOTIFICATION_STATUS.FAILED : 'partial';
    return { ...summary, status, recipients: sent + failedCount, sent, failed: failedCount };
  } catch (err) {
    console.error(`[sms] ${event} notification for ${student.studentId} could not be processed:`, err?.message);
    return summary;
  }
}
