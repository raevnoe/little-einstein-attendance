// `dismissalRecords/{studentId}_{schoolDate}` document: ONE Dismissal Verification record per
// student per school day (same ID rule as attendance). The deterministic ID is what makes a
// second release on the same day, or two live codes for the same child, impossible: asking for
// a new code REPLACES the previous one on this same document.
//
//   dismissalId          string    document ID
//   studentId            string    school Student ID
//   schoolDate           string    "YYYY-MM-DD" in the school's time zone
//   parentId             string    uid of the parent who requested the current code
//   fetcherId            string    fetchers/{fetcherId} the current code is for
//   fetcherName          string    Fetcher's name and relationship when the code was requested
//   fetcherRelationship  string    (kept so the record still says who collected the child)
//   status               string    see DISMISSAL_STATUS
//   requestCount         integer   codes requested today; also identifies the current request
//   requestedAt          Timestamp when the current code was requested
//   otpExpiresAt         Timestamp
//   otpHash, otpSalt     string    SECRET: scrypt hash and random salt of the current code.
//                                  Present only while the code may still be used; never returned
//                                  by any API. The plain code is never stored or logged.
//   failedAttempts       integer   incorrect codes entered for the current request
//   maxAttempts          integer   limit for the current request (from settings)
//   sms                  { status: sent|failed, provider, providerMessageId?, error?{code,message} }
//                                  (the SMS text itself is NOT stored: it contains the code)
//   verifiedAt, verifiedBy   Timestamp, uid   staff who entered the correct code
//   releasedAt, releasedBy   Timestamp, uid   staff who confirmed the handover
//   lockedAt, cancelledAt    Timestamp
//   createdAt, updatedAt
//
// Attendance is NOT touched: an attendance time-out is not proof of dismissal, and a release
// does not record a time-out.
import { COLLECTIONS, DISMISSAL_STATUS } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';
import { normalizeStudentId } from './student.model.js';
import { isValidSchoolDate } from '../utils/schoolDate.js';

export const dismissalsCollection = () => db.collection(COLLECTIONS.DISMISSAL_RECORDS);

export const dismissalDocId = (studentId, schoolDate) => `${studentId}_${schoolDate}`;
export const dismissalRef = (studentId, schoolDate) => dismissalsCollection().doc(dismissalDocId(studentId, schoolDate));

/** Splits a dismissal ID from a URL; null if it cannot be one. */
export function parseDismissalDocId(value) {
  const match = /^([^_]+)_(\d{4}-\d{2}-\d{2})$/.exec(typeof value === 'string' ? value : '');
  if (!match || normalizeStudentId(match[1]) !== match[1] || !isValidSchoolDate(match[2])) return null;
  return { studentId: match[1], schoolDate: match[2] };
}

export async function findDismissalsByDate(schoolDate) {
  const snapshot = await dismissalsCollection().where('schoolDate', '==', schoolDate).get();
  return snapshot.docs.map((doc) => doc.data());
}

/** The status to show: a usable code past its expiry time is expired. */
export function effectiveDismissalStatus(record, nowMs) {
  if (record.status === DISMISSAL_STATUS.AWAITING_VERIFICATION && record.otpExpiresAt?.toMillis() <= nowMs) {
    return DISMISSAL_STATUS.EXPIRED;
  }
  return record.status;
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

// Explicit allow-lists: otpHash and otpSalt can never reach a client by accident.
function commonFields(record, nowMs) {
  const status = effectiveDismissalStatus(record, nowMs);
  return {
    studentId: record.studentId,
    schoolDate: record.schoolDate,
    status,
    fetcher: { fetcherId: record.fetcherId, fullName: record.fetcherName, relationship: record.fetcherRelationship },
    requestedAt: iso(record.requestedAt),
    otpExpiresAt: iso(record.otpExpiresAt),
    attemptsRemaining: status === DISMISSAL_STATUS.AWAITING_VERIFICATION
      ? Math.max(0, (record.maxAttempts ?? 0) - (record.failedAttempts ?? 0))
      : 0,
    verifiedAt: iso(record.verifiedAt),
    releasedAt: iso(record.releasedAt),
  };
}

/** What the parent sees: no staff account IDs, no SMS provider details. */
export function toParentDismissalView(record, nowMs) {
  return { ...commonFields(record, nowMs), codesRequestedToday: record.requestCount ?? 0 };
}

/** What staff see. `names` maps uid -> display name. */
export function toStaffDismissalView(record, nowMs, names = new Map()) {
  return {
    dismissalId: record.dismissalId,
    ...commonFields(record, nowMs),
    requestNumber: record.requestCount ?? 0,
    failedAttempts: record.failedAttempts ?? 0,
    parentId: record.parentId,
    parentName: names.get(record.parentId) ?? null,
    verifiedBy: record.verifiedBy ?? null,
    verifiedByName: names.get(record.verifiedBy) ?? null,
    releasedBy: record.releasedBy ?? null,
    releasedByName: names.get(record.releasedBy) ?? null,
    sms: record.sms ? { status: record.sms.status, errorCode: record.sms.error?.code ?? null } : null,
    updatedAt: iso(record.updatedAt),
  };
}
