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
import {
  ARRIVAL_STATUS,
  ATTENDANCE_STATUS,
  DEPARTURE_STATUS,
  LATE_EXCUSE_MAX_LENGTH,
  SCAN_OUTCOMES,
  hasLetters,
  arrivalFor,
  dayStatusWithoutRecord,
  departureFor,
  noClassReason,
} from '@led/shared';
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
import { findAllStudents, findStudentById, normalizeStudentId, studentsCollection, toStudentSummary } from '../models/student.model.js';
import { getAttendanceSettings } from '../models/systemSettings.model.js';
import { NOTIFICATION_EVENTS } from '../models/notification.model.js';
import { notifyAttendanceEvent } from './notification.service.js';
import { notifyAttendanceInApp, notifyRejectedScanInApp, notifySmsProblemInApp } from './inbox.service.js';
import { resolveScannedUid } from './rfidCard.service.js';
import { getChildOfParent, matchesStudentSearch } from './student.service.js';
import { addDays, isValidSchoolDate, schoolDateOf, startOfSchoolDay } from '../utils/schoolDate.js';
import { sectionTimeFor, sectionsRef } from '../models/section.model.js';
import { getCalendar } from '../models/calendar.model.js';
import { HttpError } from '../utils/httpError.js';
import { SYSTEM_ACTOR, UNKNOWN_SCAN_WINDOW_MS, auditInTransaction, recordAudit } from './audit.service.js';
import { ALL_SECTIONS, studentInScope } from '../utils/sectionScope.js';

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
    case SCAN_OUTCOMES.TIME_IN: return `Arrival recorded for ${name}.`;
    case SCAN_OUTCOMES.TIME_OUT: return `Pick-up recorded for ${name}.`;
    case SCAN_OUTCOMES.DUPLICATE_IGNORED:
      return `${name} was scanned moments ago. Repeated scans within ${debounceSeconds} seconds are ignored.`;
    case SCAN_OUTCOMES.ALREADY_COMPLETED:
      return `${name} has already arrived and been picked up today. No changes were made.`;
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

/** Sections' own class hours (systemSettings/sections); empty if unreadable (school defaults apply). */
async function readSectionHours() {
  try {
    const snap = await sectionsRef().get();
    const data = snap.exists ? snap.data() : {};
    return { startTimes: data.startTimes ?? {}, endTimes: data.endTimes ?? {} };
  } catch (err) {
    console.error('[attendance] Could not read section class hours; using the school defaults:', err.message);
    return { startTimes: {}, endTimes: {} };
  }
}

/**
 * Everything needed to say what a student WITHOUT a record is on a given day (absent, not arrived,
 * no class): read once per request.
 */
export async function noRecordContext() {
  const [settings, hours, calendar] = await Promise.all([getAttendanceSettings(), readSectionHours(), getCalendar()]);
  const today = schoolDateOf();
  return { today, elapsedMs: Date.now() - startOfSchoolDay(today), calendar, settings, hours };
}

/** The parent's own child (404 for anyone else, via getChildOfParent), as the full stored record. */
async function ownChild(parentUid, studentId) {
  await getChildOfParent(parentUid, studentId);
  return findStudentById(studentId);
}

const enrolledFromOf = (student) => (student.createdAt?.toDate ? schoolDateOf(student.createdAt.toDate()) : null);

/** not-arrived | absent | no-class | future for a student with no record on schoolDate. */
export function statusWithoutRecord(student, schoolDate, ctx) {
  return dayStatusWithoutRecord({
    schoolDate,
    today: ctx.today,
    elapsedMs: ctx.elapsedMs,
    endTime: sectionTimeFor(student.section, ctx.hours.endTimes, ctx.settings.classEndTime),
    calendar: ctx.calendar,
    enrolledFrom: enrolledFromOf(student),
  });
}

/**
 * Processes one RFID scan. `source` is chosen by the SERVER code calling this (the scan route maps
 * the screen's allow-listed method to rfid-reader / manual-entry), never copied from a client. `ctx` is
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

  const { rfidDebounceSeconds, classStartTime, classEndTime, lateGraceMinutes } = await getAttendanceSettings();
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
  const sectionHours = await readSectionHours();
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
    // Late or on time is decided once, at time-in, and stored (see ARRIVAL_STATUS in shared).
    // Early pick-up likewise, at time-out, against the class end time.
    const elapsedMs = now.toMillis() - startOfSchoolDay(schoolDate);
    const startTime = sectionTimeFor(student.section, sectionHours.startTimes, classStartTime);
    const endTime = sectionTimeFor(student.section, sectionHours.endTimes, classEndTime);
    const arrival = outcome === SCAN_OUTCOMES.TIME_IN ? arrivalFor({ elapsedMs, startTime, graceMinutes: lateGraceMinutes }) : null;
    const departure = outcome === SCAN_OUTCOMES.TIME_OUT ? departureFor({ elapsedMs, endTime }) : null;
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
        ...arrival,
        scheduledStart: startTime,
        graceMinutes: lateGraceMinutes,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (outcome === SCAN_OUTCOMES.TIME_OUT) {
      tx.update(ref, {
        status: ATTENDANCE_STATUS.CHECKED_OUT,
        timeOut: now,
        exitSource: source,
        exitRfidUid: resolved.uid,
        ...departure,
        scheduledEnd: endTime,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (ACCEPTED.has(outcome)) {
      auditInTransaction(tx, {
        ...ctx,
        eventType: outcome === SCAN_OUTCOMES.TIME_IN ? 'attendance.time-in' : 'attendance.time-out',
        target: { type: 'attendance', id: attendanceDocId(studentId, schoolDate) },
        details: { studentId, schoolDate, source, ...(arrival ?? {}), ...(departure ?? {}) },
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
      record, // the stored late / early pick-up decision, for the SMS text
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
      details: { scanOutcome: scan.outcome, studentId: scan.student?.studentId ?? null, source },
    }, { suppressKey: `scan|${scan.outcome}|${scan.uid}`, windowMs: UNKNOWN_SCAN_WINDOW_MS });
    // Admins' bell: only when the audit entry was written (same 10-minute suppression), and at
    // most one item per card + reason + day (see inbox.service.js).
    if (recorded) await notifyRejectedScanInApp({ outcome: scan.outcome, uid: scan.uid, student: scan.student });
  }
  return scan;
}

/** Best-effort audit of an arrival/departure SMS: counts and status only (no numbers or text). */
async function recordSmsOutcome(sms, studentId, attendanceId) {
  // 'off': attendance SMS are turned off in School Settings (that change is audited itself).
  if (!sms || sms.status === 'already-notified' || sms.status === 'off') return;
  await recordAudit({
    actor: SYSTEM_ACTOR,
    eventType: 'sms.attendance-notification',
    outcome: ['sent', 'skipped', 'opted-out'].includes(sms.status) ? 'success' : 'failure',
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
 * who has a record that day), with their attendance or "absent". Teachers (`scope`) see only
 * their sections, and the summary counts only those students. (Scanning itself is not limited by
 * section: the reader at the entrance records every student's attendance.)
 */
export async function getDailyAttendance({ date, q, status, scope = ALL_SECTIONS } = {}) {
  const schoolDate = parseSchoolDate(date);
  const [students, records, ctx] = await Promise.all([findAllStudents(), findAttendanceByDate(schoolDate), noRecordContext()]);
  const recordsByStudent = new Map(records.map((r) => [r.studentId, r]));

  const rows = students
    .filter((s) => studentInScope(scope, s))
    .filter((s) => s.active || recordsByStudent.has(s.studentId))
    .map((s) => {
      const record = recordsByStudent.get(s.studentId);
      return {
        student: toStudentSummary(s),
        status: record ? statusOf(record) : statusWithoutRecord(s, schoolDate, ctx),
        attendance: record ? toStaffAttendanceView(record) : null,
      };
    });

  const summary = {
    total: rows.length,
    absent: rows.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    notArrived: rows.filter((r) => r.status === ATTENDANCE_STATUS.NOT_ARRIVED).length,
    noClass: rows.filter((r) => r.status === ATTENDANCE_STATUS.NO_CLASS).length,
    checkedIn: rows.filter((r) => r.status === ATTENDANCE_STATUS.CHECKED_IN).length,
    checkedOut: rows.filter((r) => r.status === ATTENDANCE_STATUS.CHECKED_OUT).length,
    late: rows.filter((r) => r.attendance?.arrivalStatus === ARRIVAL_STATUS.LATE).length,
    excusedLate: rows.filter((r) => r.attendance?.arrivalStatus === ARRIVAL_STATUS.EXCUSED).length,
    early: rows.filter((r) => r.attendance?.departureStatus === DEPARTURE_STATUS.EARLY).length,
  };

  const wantStatus = Object.values(ATTENDANCE_STATUS).includes(status) ? status : null;
  const filtered = rows
    .filter((r) => !wantStatus || r.status === wantStatus)
    .filter((r) => matchesStudentSearch(r.student, q))
    .sort((a, b) => a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName));

  const noClass = noClassReason(schoolDate, ctx.calendar);
  return { schoolDate, today: schoolDateOf(), timeZone: env.schoolTimeZone, noClass, summary, records: filtered };
}

/** A parent's own child's recent attendance, or 404 (same rule as the child lookup). */
export async function getChildAttendance(parentUid, studentId) {
  const [student, ctx] = await Promise.all([ownChild(parentUid, studentId), noRecordContext()]);
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
    todayStatus: todayRecord?.status ?? statusWithoutRecord(student, today, ctx),
    records,
  };
}

const ATTENDANCE_NOT_FOUND = () => new HttpError(404, 'attendance/not-found', 'This attendance record could not be found.');

/** "K2026-001_2026-10-27" -> { studentId, schoolDate }, or 404 for anything else. */
function parseAttendanceId(value) {
  const match = /^(.+)_(\d{4}-\d{2}-\d{2})$/.exec(typeof value === 'string' ? value : '');
  const studentId = match ? normalizeStudentId(match[1]) : null;
  if (!studentId || !isValidSchoolDate(match[2])) throw ATTENDANCE_NOT_FOUND();
  return { studentId, schoolDate: match[2] };
}

/**
 * Excuses a LATE arrival ({ excused: true, reason }) or removes the excuse ({ excused: false }).
 * Teachers only for students in their sections (others: 404, like a missing record). The reason
 * stays on the attendance record for staff; the audit entry records only that it happened.
 */
export async function setLateExcuse(ctx, attendanceId, body, { scope = ALL_SECTIONS } = {}) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  if (Object.keys(input).some((key) => !['excused', 'reason'].includes(key)) || typeof input.excused !== 'boolean') {
    throw new HttpError(400, 'validation/invalid-request', 'Send { "excused": true, "reason": "..." } or { "excused": false }.');
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim().replace(/\s+/g, ' ') : '';
  if (input.excused && (reason.length < 3 || reason.length > LATE_EXCUSE_MAX_LENGTH || !hasLetters(reason))) {
    const message = `Write a short reason (3-${LATE_EXCUSE_MAX_LENGTH} characters).`;
    throw new HttpError(400, 'validation/invalid-reason', message, { fields: { reason: message } });
  }
  const { studentId, schoolDate } = parseAttendanceId(attendanceId);
  const ref = attendanceRef(studentId, schoolDate);

  await db.runTransaction(async (tx) => {
    const [recordSnap, studentSnap] = await tx.getAll(ref, studentsCollection().doc(studentId));
    if (!recordSnap.exists || !studentSnap.exists || !studentInScope(scope, studentSnap.data())) throw ATTENDANCE_NOT_FOUND();
    const record = recordSnap.data();
    const wanted = input.excused ? [ARRIVAL_STATUS.LATE, ARRIVAL_STATUS.EXCUSED] : [ARRIVAL_STATUS.EXCUSED];
    if (!wanted.includes(record.arrivalStatus)) {
      throw new HttpError(409, 'attendance/not-late', input.excused
        ? 'Only a late arrival can be excused.'
        : 'This arrival is not excused.');
    }
    tx.update(ref, input.excused
      ? { arrivalStatus: ARRIVAL_STATUS.EXCUSED, excuseReason: reason, excusedBy: ctx.actor.uid ?? null, excusedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
      : { arrivalStatus: ARRIVAL_STATUS.LATE, excuseReason: null, excusedBy: null, excusedAt: null, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, {
      ...ctx,
      eventType: input.excused ? 'attendance.late-excused' : 'attendance.late-excuse-removed',
      target: { type: 'attendance', id: attendanceDocId(studentId, schoolDate) },
      details: { studentId, schoolDate, lateMinutes: record.lateMinutes ?? null },
    });
  });
  return { attendance: toStaffAttendanceView((await ref.get()).data()) };
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A parent's own child's month, day by day, for the calendar: present (on time) | late | excused
 * (late, excused) | absent | not-arrived | no-class | future, plus the times and early pick-up.
 * ?month=YYYY-MM (default: this month; later months are refused).
 */
export async function getChildCalendar(parentUid, studentId, month) {
  const [student, ctx] = await Promise.all([ownChild(parentUid, studentId), noRecordContext()]);
  const thisMonth = ctx.today.slice(0, 7);
  const wanted = month === undefined || month === '' ? thisMonth : month;
  if (typeof wanted !== 'string' || !MONTH_PATTERN.test(wanted)) {
    throw new HttpError(400, 'validation/invalid-month', 'Month must be YYYY-MM.');
  }
  if (wanted > thisMonth) throw new HttpError(400, 'validation/future-month', 'The calendar cannot show a future month.');

  const daysInMonth = new Date(Date.UTC(Number(wanted.slice(0, 4)), Number(wanted.slice(5, 7)), 0)).getUTCDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => `${wanted}-${String(i + 1).padStart(2, '0')}`);
  const records = new Map((await findAttendanceOfStudent(studentId, dates.filter((d) => d <= ctx.today))).map((r) => [r.schoolDate, r]));

  const days = dates.map((date) => {
    const record = records.get(date);
    if (!record) {
      const status = statusWithoutRecord(student, date, ctx);
      return { date, status, note: status === ATTENDANCE_STATUS.NO_CLASS ? noClassReason(date, ctx.calendar) ?? 'Not enrolled yet' : null };
    }
    const view = toAttendanceView(record);
    const status = record.arrivalStatus === ARRIVAL_STATUS.LATE ? 'late' : record.arrivalStatus === ARRIVAL_STATUS.EXCUSED ? 'excused' : 'present';
    return { date, status, timeIn: view.timeIn, timeOut: view.timeOut, lateMinutes: view.lateMinutes, departureStatus: view.departureStatus, earlyMinutes: view.earlyMinutes };
  });
  const count = (st) => days.filter((d) => d.status === st).length;
  return {
    studentId,
    month: wanted,
    today: ctx.today,
    timeZone: env.schoolTimeZone,
    summary: { present: count('present'), late: count('late') + count('excused'), absent: count('absent') },
    days,
  };
}
