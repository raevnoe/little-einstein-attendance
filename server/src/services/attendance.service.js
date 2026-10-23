// Daily Attendance business rules.
//
// processRfidScan() is the ONE entry point for RFID scans. Today it is fed by the
// staff "manual test UID" endpoint; the future UHF reader adapter/bridge will call the
// same function with the raw UID it reads, so no attendance logic depends on how
// the reader communicates.
//
//   raw UID -> normalize -> active assigned card -> active student -> today's record
//
// Lifecycle of attendance/{studentId}_{schoolDate}, decided inside ONE Firestore
// transaction (so simultaneous scans cannot create two records or skip a step):
//   no record                        -> create, timeIn          (time-in)
//   timeIn, no timeOut, within window -> no change              (duplicate-ignored)
//   timeIn, no timeOut, after window  -> set timeOut            (time-out)
//   timeOut set, within window        -> no change              (duplicate-ignored)
//   timeOut set, after window         -> no change, logged      (already-completed)
import { ATTENDANCE_STATUS, SCAN_OUTCOMES } from '@led/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { env } from '../config/env.js';
import {
  attendanceDocId,
  attendanceRef,
  findAttendanceByDate,
  findAttendanceOfStudent,
  toAttendanceView,
  toStaffAttendanceView,
} from '../models/attendance.model.js';
import { findAllStudents, studentsCollection, toStudentSummary } from '../models/student.model.js';
import { getAttendanceSettings } from '../models/systemSettings.model.js';
import { NOTIFICATION_EVENTS } from '../models/notification.model.js';
import { notifyAttendanceEvent } from './notification.service.js';
import { notifyAttendanceInApp, notifyRejectedScanInApp, notifySmsProblemInApp } from './inbox.service.js';
import { resolveScannedUid } from './rfidCard.service.js';
import { getChildOfParent, matchesStudentSearch } from './student.service.js';
import { addDays, isValidSchoolDate, schoolDateOf } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';
import { SYSTEM_ACTOR, UNKNOWN_SCAN_WINDOW_MS, auditInTransaction, recordAudit } from './audit.service.js';

const PARENT_HISTORY_DAYS = 30;
const INVALID_UID_MESSAGE = 'RFID UID must be 4-64 hexadecimal characters (0-9, A-F).';

const ACCEPTED = new Set([SCAN_OUTCOMES.TIME_IN, SCAN_OUTCOMES.TIME_OUT]);

const CARD_PROBLEM_OUTCOMES = {
  unknown: SCAN_OUTCOMES.UNKNOWN_RFID,
  inactive: SCAN_OUTCOMES.RFID_INACTIVE,
  unassigned: SCAN_OUTCOMES.RFID_UNASSIGNED,
};

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

function scanMessage(outcome, name, debounceSeconds) {
  switch (outcome) {
    case SCAN_OUTCOMES.TIME_IN: return `Time in recorded for ${name}.`;
    case SCAN_OUTCOMES.TIME_OUT: return `Time out recorded for ${name}.`;
    case SCAN_OUTCOMES.DUPLICATE_IGNORED:
      return `${name} was scanned moments ago. Repeated scans within ${debounceSeconds} seconds are ignored.`;
    case SCAN_OUTCOMES.ALREADY_COMPLETED:
      return `${name} already has a time in and time out today. No changes were made.`;
    case SCAN_OUTCOMES.UNKNOWN_RFID: return 'This RFID card is not registered. No attendance was recorded.';
    case SCAN_OUTCOMES.RFID_INACTIVE: return 'This RFID card is inactive. No attendance was recorded.';
    case SCAN_OUTCOMES.RFID_UNASSIGNED: return 'This RFID card is not assigned to a student. No attendance was recorded.';
    case SCAN_OUTCOMES.STUDENT_INACTIVE:
      return `${name} is marked inactive. No attendance was recorded.`;
    default: return 'The scan could not be processed.';
  }
}

/** Decides what one scan does to today's record. Runs inside the transaction. */
function decide(record, nowMs, debounceMs) {
  if (!record) return SCAN_OUTCOMES.TIME_IN;
  if (!record.timeOut) {
    return nowMs - record.timeIn.toMillis() < debounceMs ? SCAN_OUTCOMES.DUPLICATE_IGNORED : SCAN_OUTCOMES.TIME_OUT;
  }
  return nowMs - record.timeOut.toMillis() < debounceMs ? SCAN_OUTCOMES.DUPLICATE_IGNORED : SCAN_OUTCOMES.ALREADY_COMPLETED;
}

/**
 * Processes one RFID scan. `source` is set by the SERVER code calling this (e.g. the
 * manual-test route or, later, the reader adapter), never taken from a client. `ctx` is
 * auditContext(req) of the staff member whose session submitted the scan.
 * Audit (Phase 11): time-in/time-out are audited in the scan transaction; rejected scans are
 * audited best effort (same card + outcome at most once per 10 minutes); debounced repeats are
 * not audited.
 * Returns { outcome, accepted, message, uid, schoolDate, student, attendance, sms }.
 * Throws 400 only when the UID itself is malformed.
 */
export async function processRfidScan({ rawUid, source, ctx = { actor: SYSTEM_ACTOR } }) {
  const resolved = await resolveScannedUid(rawUid);
  if (resolved.problem === 'invalid-uid') {
    throw new HttpError(400, 'validation/invalid-rfid-uid', INVALID_UID_MESSAGE, { fields: { uid: INVALID_UID_MESSAGE } });
  }

  const { rfidDebounceSeconds } = await getAttendanceSettings();
  const result = (outcome, extra = {}) => ({
    outcome,
    accepted: ACCEPTED.has(outcome),
    message: scanMessage(outcome, extra.student?.name ?? 'This student', rfidDebounceSeconds),
    uid: resolved.uid,
    schoolDate: null,
    student: null,
    attendance: null,
    sms: null, // SMS summary (no phone numbers) for time-in/time-out only
    ...extra,
  });

  if (resolved.problem) return logged(result(CARD_PROBLEM_OUTCOMES[resolved.problem]), source, ctx);

  const { studentId } = resolved.student;
  const decision = await db.runTransaction(async (tx) => {
    // The clock is read inside the transaction so a retried attempt uses the retry time.
    const now = Timestamp.now();
    const schoolDate = schoolDateOf(now.toDate());
    const ref = attendanceRef(studentId, schoolDate);
    const [recordSnap, studentSnap] = await tx.getAll(ref, studentsCollection().doc(studentId));
    const student = studentSnap.data();

    // Re-checked inside the transaction in case the student or card changed since the lookup.
    if (!student || student.rfidCardUid !== resolved.uid) return { outcome: SCAN_OUTCOMES.RFID_UNASSIGNED };
    if (!student.active) return { outcome: SCAN_OUTCOMES.STUDENT_INACTIVE, schoolDate, student };

    const outcome = decide(recordSnap.exists ? recordSnap.data() : null, now.toMillis(), rfidDebounceSeconds * 1000);
    if (outcome === SCAN_OUTCOMES.TIME_IN) {
      tx.create(ref, {
        studentId,
        schoolDate,
        status: ATTENDANCE_STATUS.CHECKED_IN,
        timeIn: now,
        timeOut: null,
        entrySource: source,
        exitSource: null,
        entryRfidUid: resolved.uid,
        exitRfidUid: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome === SCAN_OUTCOMES.TIME_OUT) {
      tx.update(ref, {
        status: ATTENDANCE_STATUS.CHECKED_OUT,
        timeOut: now,
        exitSource: source,
        exitRfidUid: resolved.uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (ACCEPTED.has(outcome)) {
      auditInTransaction(tx, {
        ...ctx,
        eventType: outcome === SCAN_OUTCOMES.TIME_IN ? 'attendance.time-in' : 'attendance.time-out',
        target: { type: 'attendance', id: attendanceDocId(studentId, schoolDate) },
        details: { studentId, schoolDate, source },
      });
    }
    return { outcome, schoolDate, student, now, exists: recordSnap.exists || outcome === SCAN_OUTCOMES.TIME_IN };
  });

  if (decision.outcome === SCAN_OUTCOMES.RFID_UNASSIGNED) return logged(result(decision.outcome), source, ctx);

  const { student } = decision;
  const record = decision.exists ? (await attendanceRef(studentId, decision.schoolDate).get()).data() : null;

  // SMS and in-app notifications only AFTER the transaction has committed, and only when
  // attendance actually changed. The transaction yields time-in/time-out at most once per student
  // per day, so repeated scans cannot resend. A notification failure is reported in `sms` (SMS
  // only) but never undoes attendance.
  let sms = null;
  if (ACCEPTED.has(decision.outcome)) {
    const event = {
      event: decision.outcome === SCAN_OUTCOMES.TIME_IN ? NOTIFICATION_EVENTS.ARRIVAL : NOTIFICATION_EVENTS.DEPARTURE,
      student,
      attendanceId: attendanceDocId(studentId, decision.schoolDate),
      occurredAt: decision.now.toDate(),
    };
    [sms] = await Promise.all([notifyAttendanceEvent(event), notifyAttendanceInApp(event)]);
    await recordSmsOutcome(sms, studentId, event.attendanceId);
    await notifySmsProblemInApp({ sms, at: event.occurredAt });
  }

  return logged(result(decision.outcome, {
    schoolDate: decision.schoolDate,
    student: { studentId, name: fullName(student), section: student.section },
    attendance: record ? toStaffAttendanceView(record) : null,
    sms,
  }), source, ctx);
}

/**
 * Rejected and anomalous scans (unknown/inactive/unassigned card, inactive student, scan after
 * time-out) go to the server log and, best effort, to auditLogs and the admins' notification bell.
 * A stray tag near the reader is re-read constantly, so the same card + outcome is recorded at
 * most once per 10 minutes. Debounced repeats are neither logged nor audited.
 */
async function logged(scan, source, ctx) {
  if (!scan.accepted && scan.outcome !== SCAN_OUTCOMES.DUPLICATE_IGNORED) {
    console.warn(`[attendance] scan not recorded: ${scan.outcome} uid=${scan.uid} student=${scan.student?.studentId ?? '-'} source=${source}`);
    const recorded = await recordAudit({
      ...ctx,
      eventType: 'rfid.scan.rejected',
      outcome: 'failure',
      target: { type: 'rfidCard', id: scan.uid },
      reason: `attendance/${scan.outcome}`,
      details: { scanOutcome: scan.outcome, studentId: scan.student?.studentId ?? null },
    }, { suppressKey: `scan|${scan.outcome}|${scan.uid}`, windowMs: UNKNOWN_SCAN_WINDOW_MS });
    // Admins' bell: only when the audit entry was written (same 10-minute suppression), and at
    // most one item per card + reason + day (see inbox.service.js).
    if (recorded) await notifyRejectedScanInApp({ outcome: scan.outcome, uid: scan.uid, student: scan.student });
  }
  return scan;
}

/** Best-effort audit of an arrival/departure SMS: counts and status only (no numbers or text). */
async function recordSmsOutcome(sms, studentId, attendanceId) {
  if (!sms || sms.status === 'already-notified') return;
  await recordAudit({
    actor: SYSTEM_ACTOR,
    eventType: 'sms.attendance-notification',
    outcome: sms.status === 'sent' || sms.status === 'skipped' ? 'success' : 'failure',
    target: { type: 'attendance', id: attendanceId },
    reason: `sms/${sms.status}`,
    details: {
      event: sms.event, studentId, status: sms.status, sent: sms.sent, failed: sms.failed, skipped: sms.status === 'skipped' ? 1 : 0,
    },
  });
}

function statusOf(record) {
  return record?.status ?? ATTENDANCE_STATUS.ABSENT;
}

/** Parses an optional ?date=; defaults to today. Future dates are rejected. */
export function parseSchoolDate(value) {
  const today = schoolDateOf();
  if (value === undefined || value === '') return today;
  if (!isValidSchoolDate(value)) {
    throw new HttpError(400, 'validation/invalid-date', 'Date must be a valid date (YYYY-MM-DD).');
  }
  if (value > today) throw new HttpError(400, 'validation/future-date', 'Attendance cannot be viewed for a future date.');
  return value;
}

/**
 * Staff roster for one school day: every active student (plus any inactive student
 * who has a record that day), with their attendance or "absent".
 */
export async function getDailyAttendance({ date, q, status } = {}) {
  const schoolDate = parseSchoolDate(date);
  const [students, records] = await Promise.all([findAllStudents(), findAttendanceByDate(schoolDate)]);
  const recordsByStudent = new Map(records.map((r) => [r.studentId, r]));

  const rows = students
    .filter((s) => s.active || recordsByStudent.has(s.studentId))
    .map((s) => {
      const record = recordsByStudent.get(s.studentId);
      return {
        student: toStudentSummary(s),
        status: statusOf(record),
        attendance: record ? toStaffAttendanceView(record) : null,
      };
    });

  const summary = {
    total: rows.length,
    absent: rows.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    checkedIn: rows.filter((r) => r.status === ATTENDANCE_STATUS.CHECKED_IN).length,
    checkedOut: rows.filter((r) => r.status === ATTENDANCE_STATUS.CHECKED_OUT).length,
  };

  const wantStatus = Object.values(ATTENDANCE_STATUS).includes(status) ? status : null;
  const filtered = rows
    .filter((r) => !wantStatus || r.status === wantStatus)
    .filter((r) => matchesStudentSearch(r.student, q))
    .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName));

  return { schoolDate, today: schoolDateOf(), timeZone: env.schoolTimeZone, summary, records: filtered };
}

/** A parent's own child's recent attendance, or 404 (same rule as the child lookup). */
export async function getChildAttendance(parentUid, studentId) {
  await getChildOfParent(parentUid, studentId);
  const today = schoolDateOf();
  const dates = Array.from({ length: PARENT_HISTORY_DAYS }, (_, i) => addDays(today, -i));
  const records = (await findAttendanceOfStudent(studentId, dates))
    .sort((a, b) => b.schoolDate.localeCompare(a.schoolDate))
    .map(toAttendanceView);
  const todayRecord = records.find((r) => r.schoolDate === today);
  return {
    studentId,
    today,
    timeZone: env.schoolTimeZone,
    todayStatus: todayRecord?.status ?? ATTENDANCE_STATUS.ABSENT,
    records,
  };
}
