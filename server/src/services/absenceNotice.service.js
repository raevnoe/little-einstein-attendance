// Absence notices: staff text the parents of today's absent students, by hand, after the class end
// time. A person always confirms, because a wrong "absent" text is worse than a late one (the reader
// may have been down, or a child may have forgotten the card): the screen lists who would be texted,
// staff untick anyone who is actually in school, and only then the texts go out.
// Absent is never stored; it is worked out again here at the moment of sending, so a child who
// arrived in the meantime is left out. One text per parent number per child per day (sendOnce).
import { ATTENDANCE_STATUS } from '@led/shared';
import { attendanceDocId, findAttendanceByDate } from '../models/attendance.model.js';
import { NOTIFICATION_EVENTS, NOTIFICATION_STATUS, findAbsenceNoticesOn } from '../models/notification.model.js';
import { findAllStudents, normalizeStudentId } from '../models/student.model.js';
import { getSmsSettings } from '../models/systemSettings.model.js';
import { noRecordContext, statusWithoutRecord } from './attendance.service.js';
import { recordAudit } from './audit.service.js';
import { notifyAttendanceEvent, parentRecipients } from './notification.service.js';
import { HttpError } from '../utils/httpError.js';
import { ALL_SECTIONS, studentInScope } from '../utils/sectionScope.js';

const MAX_STUDENTS = 200;
const SEND_BATCH = 10; // texts in flight at once: keeps one request well inside the serverless time limit

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

/** What already happened for this child today, from their notification records (null = nothing). */
function noticeFromRecords(records) {
  if (!records?.length) return null;
  if (records.some((r) => r.status === NOTIFICATION_STATUS.SENT || r.status === NOTIFICATION_STATUS.PENDING)) return 'sent';
  return records.some((r) => r.status === NOTIFICATION_STATUS.FAILED) ? 'failed' : 'no-number';
}

/** Today's absent students in scope, each with `notice`: pending | sent | failed | no-number | opted-out. */
async function absentStudents(scope) {
  const ctx = await noRecordContext();
  const [students, attendance, notices, sms] = await Promise.all([
    findAllStudents(), findAttendanceByDate(ctx.today), findAbsenceNoticesOn(ctx.today), getSmsSettings(),
  ]);
  const hasRecord = new Set(attendance.map((r) => r.studentId));
  const noticesByStudent = Map.groupBy(notices, (n) => n.studentId);
  const absent = students.filter((s) => s.active && studentInScope(scope, s) && !hasRecord.has(s.studentId)
    && statusWithoutRecord(s, ctx.today, ctx) === ATTENDANCE_STATUS.ABSENT);

  const rows = await Promise.all(absent.map(async (student) => {
    const done = noticeFromRecords(noticesByStudent.get(student.studentId));
    if (done) return { student, notice: done };
    const recipients = await parentRecipients(student.parentIds ?? [], { honourOptOut: sms.allowParentSmsOptOut });
    if (recipients.length) return { student, notice: 'pending' };
    return { student, notice: recipients.optedOut > 0 ? 'opted-out' : 'no-number' };
  }));
  rows.sort((a, b) => a.student.lastName.localeCompare(b.student.lastName) || a.student.firstName.localeCompare(b.student.firstName));
  return { schoolDate: ctx.today, smsEnabled: sms.attendanceSmsEnabled, rows };
}

const toView = ({ schoolDate, smsEnabled, rows }) => ({
  schoolDate,
  smsEnabled,
  students: rows.map(({ student, notice }) => ({ studentId: student.studentId, name: fullName(student), section: student.section, notice })),
});

/** GET: today's absent students and whether their parents were texted. No phone numbers. */
export async function getAbsenceNotices({ scope = ALL_SECTIONS } = {}) {
  return toView(await absentStudents(scope));
}

function parseStudentIds(input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const ids = body.studentIds;
  if (Object.keys(body).some((k) => k !== 'studentIds') || !Array.isArray(ids) || ids.length === 0 || ids.length > MAX_STUDENTS) {
    throw new HttpError(400, 'validation/invalid-request', 'Select at least one student.');
  }
  const clean = ids.map(normalizeStudentId);
  if (clean.some((id) => !id)) throw new HttpError(400, 'validation/invalid-student-id', 'Invalid Student ID.');
  return new Set(clean);
}

/**
 * POST { studentIds }: texts the parents of the chosen students, keeping only those still absent,
 * not yet notified and within the caller's sections. Returns the counts and the refreshed list.
 */
export async function sendAbsenceNotices(ctx, input, { scope = ALL_SECTIONS } = {}) {
  const chosen = parseStudentIds(input);
  const list = await absentStudents(scope);
  if (!list.smsEnabled) throw new HttpError(409, 'attendance/sms-off', 'Attendance SMS are turned off in School Settings.');
  const targets = list.rows.filter((r) => r.notice === 'pending' && chosen.has(r.student.studentId)).map((r) => r.student);
  if (targets.length === 0) {
    throw new HttpError(409, 'attendance/no-absence-notices', 'There is no one to notify: these students have arrived or were already notified.');
  }

  const results = [];
  for (let i = 0; i < targets.length; i += SEND_BATCH) {
    results.push(...await Promise.all(targets.slice(i, i + SEND_BATCH).map((student) => notifyAttendanceEvent({
      event: NOTIFICATION_EVENTS.ABSENCE,
      student,
      attendanceId: attendanceDocId(student.studentId, list.schoolDate),
      occurredAt: new Date(),
      schoolDate: list.schoolDate,
    }))));
  }
  const sent = results.filter((r) => r.status === NOTIFICATION_STATUS.SENT || r.status === 'partial').length;
  const failed = results.filter((r) => r.status === NOTIFICATION_STATUS.FAILED).length;
  await recordAudit({
    ...ctx,
    eventType: 'sms.absence-notices',
    outcome: failed ? 'failure' : 'success',
    target: { type: 'attendance', id: list.schoolDate },
    details: { students: targets.length, studentIds: targets.map((s) => s.studentId), sent, failed },
  });
  return { sent, failed, ...toView(await absentStudents(scope)) };
}
