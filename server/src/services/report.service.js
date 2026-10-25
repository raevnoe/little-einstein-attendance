// Reports and dashboard summaries (Phase 10). Read-only: nothing here writes to Firestore.
//
// Every report is built from data that already exists. Deliberately NOT calculated:
//   - absences over a date range (there is no school calendar, so a day without records may be
//     a weekend or holiday). "No time in" is shown only per day, and only on days that have
//     at least one attendance record;
//   - grades, percentages, or star averages across several days or areas. The only star
//     average is the existing per-day Daily Average Star Rating.
// Responses use explicit field lists: no RFID UIDs, scan sources, parent IDs, phone numbers,
// SMS text, or dismissal codes/hashes.
import {
  ATTENDANCE_STATUS,
  DISMISSAL_STATUS,
  MAX_REPORT_RANGE_DAYS,
  MAX_STAR_RATING,
  MIN_STAR_RATING,
  PERFORMANCE_AREA_KEYS,
  REPORT_ATTENDANCE_STATUS,
  ROLES,
  dailyAverageStarRating,
} from '@led/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env.js';
import { findAttendanceByDate, findAttendanceInRange } from '../models/attendance.model.js';
import { effectiveDismissalStatus, findDismissalsByDate } from '../models/dismissal.model.js';
import { findNotificationStatusesSince, NOTIFICATION_STATUS } from '../models/notification.model.js';
import { findPerformanceInRange, findPerformanceWhere } from '../models/performance.model.js';
import { cardStatus, findAllCards } from '../models/rfidCard.model.js';
import { findAllStudents, normalizeStudentId } from '../models/student.model.js';
import { ALL_SECTIONS, studentInScope } from '../utils/sectionScope.js';

/** The students a staff member may report on (teachers: their sections) and a record filter. */
function scoped(students, scope) {
  if (scope.all) return { students, mine: () => true };
  const visible = students.filter((s) => studentInScope(scope, s));
  const ids = new Set(visible.map((s) => s.studentId));
  return { students: visible, mine: (r) => ids.has(r.studentId) };
}
import { findUsersByIds, findUsersByRole } from '../models/user.model.js';
import { addDays, isValidSchoolDate, schoolDateOf } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';

const MAX_SECTION_LENGTH = 40;
const areaOrder = (key) => PERFORMANCE_AREA_KEYS.indexOf(key);
const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;
const byName = (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
  || a.studentId.localeCompare(b.studentId);

const badRequest = (code, message) => new HttpError(400, code, message);

// ---- query parsing (shared by the reports)

/** Only the listed query parameters, each at most once, as plain text. */
export function readQuery(query, allowed) {
  const unknown = Object.keys(query ?? {}).filter((key) => !allowed.includes(key));
  if (unknown.length) throw badRequest('validation/unknown-parameters', `Unknown report filters: ${unknown.join(', ')}.`);
  const values = {};
  for (const key of allowed) {
    const value = query?.[key];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string') throw badRequest('validation/invalid-parameter', `The "${key}" filter is invalid.`);
    values[key] = value.trim();
  }
  return values;
}

/**
 * `from`/`to` as YYYY-MM-DD in the school's time zone, inclusive. Defaults: to = today,
 * from = to. Rejects invalid dates, future dates, from > to, and ranges over the maximum.
 */
export function parseDateRange({ from, to }, today = schoolDateOf()) {
  const end = to ?? today;
  const start = from ?? end;
  for (const [label, value] of [['Start date', start], ['End date', end]]) {
    if (!isValidSchoolDate(value)) throw badRequest('validation/invalid-date', `${label} must be a valid date (YYYY-MM-DD).`);
    if (value > today) throw badRequest('validation/future-date', `${label} cannot be in the future.`);
  }
  if (start > end) throw badRequest('validation/invalid-range', 'The start date must be on or before the end date.');
  if (addDays(start, MAX_REPORT_RANGE_DAYS - 1) < end) {
    throw badRequest('validation/range-too-long', `A report can cover at most ${MAX_REPORT_RANGE_DAYS} days.`);
  }
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return { from: start, to: end, dates };
}

function parseStudentFilter(value) {
  if (value === undefined) return null;
  const studentId = normalizeStudentId(value);
  if (!studentId) throw badRequest('validation/invalid-student-id', 'Invalid Student ID.');
  return studentId;
}

function parseSectionFilter(value) {
  if (value === undefined) return null;
  if (value.length > MAX_SECTION_LENGTH) throw badRequest('validation/invalid-section', 'Invalid section.');
  return value;
}

const sameSection = (a, b) => (a ?? '').trim().toLowerCase() === b.toLowerCase();

/** The minimum student details a report needs (no RFID, parents, birth date or gender). */
function reportStudent(s) {
  return {
    studentId: s.studentId,
    firstName: s.firstName,
    middleName: s.middleName ?? '',
    lastName: s.lastName,
    name: fullName(s),
    section: s.section,
    active: s.active === true,
  };
}

function sectionsOf(students) {
  return [...new Set(students.map((s) => s.section).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/** Students matching the filters: active ones, plus inactive ones that have data in the range. */
function selectStudents(allStudents, { studentId, section }, hasData) {
  return allStudents
    .filter((s) => (!studentId || s.studentId === studentId) && (!section || sameSection(s.section, section)))
    .filter((s) => s.active === true || hasData(s.studentId));
}

// ---- attendance report

/** Derived (never stored) report status of one attendance record. */
function reportStatusOf(record) {
  return record.timeOut ? REPORT_ATTENDANCE_STATUS.TIME_OUT_RECORDED : REPORT_ATTENDANCE_STATUS.NO_TIME_OUT_RECORDED;
}

/**
 * GET /api/reports/attendance?from&to&section&studentId
 *   days[]:     per date - time in / time out / no time out recorded, and "no time in" ONLY
 *               when that date has at least one attendance record in the school
 *   students[]: per student - days with a time in, with a time out, with no time out recorded,
 *               and the records themselves. No absence totals.
 */
export async function getAttendanceReport(query, { scope = ALL_SECTIONS } = {}) {
  const q = readQuery(query, ['from', 'to', 'section', 'studentId']);
  const today = schoolDateOf();
  const { from, to, dates } = parseDateRange(q, today);
  const filters = { studentId: parseStudentFilter(q.studentId), section: parseSectionFilter(q.section) };

  const [everyStudent, schoolRecords] = await Promise.all([findAllStudents(), findAttendanceInRange(from, to)]);
  // Dates on which ANY student (whatever the filters) has a record: the school was taking attendance.
  const datesWithRecords = new Set(schoolRecords.map((r) => r.schoolDate));
  const { students: allStudents, mine } = scoped(everyStudent, scope);
  const allRecords = schoolRecords.filter(mine);
  const recordsByStudent = new Map();
  for (const r of allRecords) {
    if (!recordsByStudent.has(r.studentId)) recordsByStudent.set(r.studentId, []);
    recordsByStudent.get(r.studentId).push(r);
  }

  const students = selectStudents(allStudents, filters, (id) => recordsByStudent.has(id)).sort(byName);

  const studentRows = students.map((s) => {
    const records = (recordsByStudent.get(s.studentId) ?? []).sort((a, b) => a.schoolDate.localeCompare(b.schoolDate));
    const rows = records.map((r) => ({
      schoolDate: r.schoolDate,
      status: reportStatusOf(r),
      timeIn: iso(r.timeIn),
      timeOut: iso(r.timeOut),
    }));
    return {
      student: reportStudent(s),
      daysWithTimeIn: rows.length,
      daysWithTimeOut: rows.filter((r) => r.status === REPORT_ATTENDANCE_STATUS.TIME_OUT_RECORDED).length,
      daysNoTimeOutRecorded: rows.filter((r) => r.status === REPORT_ATTENDANCE_STATUS.NO_TIME_OUT_RECORDED).length,
      records: rows,
    };
  });

  const days = dates.map((schoolDate) => {
    const rows = studentRows.map((s) => s.records.find((r) => r.schoolDate === schoolDate) ?? null);
    // Roster for that day: active students, plus inactive ones with a record that day.
    const roster = studentRows.filter((s, i) => s.student.active || rows[i]);
    const withTimeIn = rows.filter(Boolean);
    const recorded = datesWithRecords.has(schoolDate);
    return {
      schoolDate,
      attendanceRecorded: recorded,
      students: roster.length,
      timeIn: withTimeIn.length,
      timeOut: withTimeIn.filter((r) => r.status === REPORT_ATTENDANCE_STATUS.TIME_OUT_RECORDED).length,
      noTimeOutRecorded: withTimeIn.filter((r) => r.status === REPORT_ATTENDANCE_STATUS.NO_TIME_OUT_RECORDED).length,
      // null (not 0, not "absent") when nobody in the school has a record that day.
      noTimeIn: recorded ? roster.length - withTimeIn.length : null,
    };
  });

  return {
    from,
    to,
    today,
    timeZone: env.schoolTimeZone,
    filters,
    sections: sectionsOf(allStudents),
    days,
    students: studentRows,
  };
}

// ---- performance report

function parseAreaFilter(value) {
  if (value === undefined) return null;
  if (!PERFORMANCE_AREA_KEYS.includes(value)) throw badRequest('validation/invalid-area', 'Invalid performance area.');
  return value;
}

const emptyStarCounts = () => Object.fromEntries(
  Array.from({ length: MAX_STAR_RATING - MIN_STAR_RATING + 1 }, (_, i) => [String(MIN_STAR_RATING + i), 0]),
);

/**
 * GET /api/reports/performance?from&to&section&studentId&area
 *   students[]: per student - number of star ratings, how many of each star per area, and the
 *               evaluations by day with that day's Daily Average Star Rating (only when no area
 *               filter is applied, because it summarizes ALL of a day's areas).
 *   notEvaluated[]: matching active students with no evaluation in the range.
 * No averages across days or areas, no percentages, no grades.
 */
export async function getPerformanceReport(query, { scope = ALL_SECTIONS } = {}) {
  const q = readQuery(query, ['from', 'to', 'section', 'studentId', 'area']);
  const today = schoolDateOf();
  const { from, to } = parseDateRange(q, today);
  const filters = {
    studentId: parseStudentFilter(q.studentId),
    section: parseSectionFilter(q.section),
    area: parseAreaFilter(q.area),
  };

  const [everyStudent, schoolRecords] = await Promise.all([findAllStudents(), findPerformanceInRange(from, to)]);
  const { students: allStudents, mine } = scoped(everyStudent, scope);
  const records = schoolRecords.filter(mine).filter((r) => !filters.area || r.area === filters.area);
  const recordsByStudent = new Map();
  for (const r of records) {
    if (!recordsByStudent.has(r.studentId)) recordsByStudent.set(r.studentId, []);
    recordsByStudent.get(r.studentId).push(r);
  }

  const students = selectStudents(allStudents, filters, (id) => recordsByStudent.has(id)).sort(byName);
  const teacherIds = [...new Set(records.map((r) => r.teacherId).filter(Boolean))];
  const teacherNames = new Map((await findUsersByIds(teacherIds)).map((t) => [t.uid, t.displayName]));

  const evaluated = [];
  const notEvaluated = [];
  for (const s of students) {
    const own = recordsByStudent.get(s.studentId) ?? [];
    if (own.length === 0) {
      if (s.active) notEvaluated.push(reportStudent(s));
      continue;
    }
    const areas = new Map();
    const byDate = new Map();
    for (const r of own) {
      if (!areas.has(r.area)) areas.set(r.area, { area: r.area, ratings: 0, starCounts: emptyStarCounts() });
      const area = areas.get(r.area);
      area.ratings += 1;
      area.starCounts[String(r.starRating)] += 1;
      if (!byDate.has(r.evaluationDate)) byDate.set(r.evaluationDate, []);
      byDate.get(r.evaluationDate).push(r);
    }
    evaluated.push({
      student: reportStudent(s),
      ratings: own.length,
      areas: [...areas.values()].sort((a, b) => areaOrder(a.area) - areaOrder(b.area)),
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([evaluationDate, dayRecords]) => ({
          evaluationDate,
          dailyAverageStarRating: filters.area ? null : dailyAverageStarRating(dayRecords.map((r) => r.starRating)),
          evaluations: dayRecords
            .sort((a, b) => areaOrder(a.area) - areaOrder(b.area))
            .map((r) => ({
              area: r.area,
              starRating: r.starRating,
              observation: r.observation ?? '',
              teacherName: teacherNames.get(r.teacherId) ?? null,
            })),
        })),
    });
  }

  return {
    from,
    to,
    today,
    timeZone: env.schoolTimeZone,
    filters,
    sections: sectionsOf(allStudents),
    students: evaluated,
    notEvaluated,
  };
}

// ---- dashboard summaries

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** GET /api/reports/today (admin and teacher): today's attendance, evaluations and dismissals. */
export async function getTodaySummary({ scope = ALL_SECTIONS } = {}) {
  const today = schoolDateOf();
  const nowMs = Date.now();
  const [everyStudent, schoolAttendance, schoolEvaluations, schoolDismissals] = await Promise.all([
    findAllStudents(),
    findAttendanceByDate(today),
    findPerformanceWhere('evaluationDate', today),
    findDismissalsByDate(today),
  ]);
  // Teachers: only their sections' students and their records.
  const { students, mine } = scoped(everyStudent, scope);
  const attendance = schoolAttendance.filter(mine);
  const evaluations = schoolEvaluations.filter(mine);
  const dismissals = schoolDismissals.filter(mine);
  const active = new Set(students.filter((s) => s.active === true).map((s) => s.studentId));
  const withRecord = new Set(attendance.map((r) => r.studentId));
  // Same roster rule as the Daily Attendance page: active students plus anyone with a record.
  const rosterSize = new Set([...active, ...withRecord]).size;
  const checkedIn = attendance.filter((r) => (r.status ?? ATTENDANCE_STATUS.CHECKED_IN) === ATTENDANCE_STATUS.CHECKED_IN).length;
  const dismissalCounts = countBy(dismissals, (r) => effectiveDismissalStatus(r, nowMs));

  return {
    schoolDate: today,
    timeZone: env.schoolTimeZone,
    attendance: {
      students: rosterSize,
      inSchool: checkedIn,
      wentHome: attendance.length - checkedIn,
      noTimeIn: rosterSize - attendance.length,
    },
    performance: {
      activeStudents: active.size,
      studentsEvaluated: new Set(evaluations.filter((r) => active.has(r.studentId)).map((r) => r.studentId)).size,
      evaluations: evaluations.length,
    },
    dismissals: {
      total: dismissals.length,
      awaitingVerification: dismissalCounts[DISMISSAL_STATUS.AWAITING_VERIFICATION] ?? 0,
      verified: dismissalCounts[DISMISSAL_STATUS.VERIFIED] ?? 0,
      released: dismissalCounts[DISMISSAL_STATUS.RELEASED] ?? 0,
    },
  };
}

/**
 * GET /api/admin/overview (admin only): counts of students, RFID cards, parent accounts and
 * today's SMS notifications. Counts only - no names, numbers, or message contents.
 */
export async function getAdminOverview() {
  const today = schoolDateOf();
  // Notifications created in the last 36 hours, then kept only if created on today's school
  // date: correct in any time zone without computing local midnight.
  const since = Timestamp.fromMillis(Date.now() - 36 * 60 * 60 * 1000);
  const [students, cards, parents, notifications] = await Promise.all([
    findAllStudents(),
    findAllCards(),
    findUsersByRole(ROLES.PARENT),
    findNotificationStatusesSince(since),
  ]);
  const activeStudents = students.filter((s) => s.active === true);
  const cardCounts = countBy(cards, cardStatus);
  const activeParents = parents.filter((p) => p.active === true);
  const todays = notifications.filter((n) => n.createdAt && schoolDateOf(n.createdAt.toDate()) === today);
  const smsCounts = countBy(todays, (n) => n.status);

  return {
    schoolDate: today,
    timeZone: env.schoolTimeZone,
    students: {
      active: activeStudents.length,
      inactive: students.length - activeStudents.length,
      activeWithoutRfidCard: activeStudents.filter((s) => !s.rfidCardUid).length,
    },
    rfidCards: {
      assigned: cardCounts.assigned ?? 0,
      unassigned: cardCounts.unassigned ?? 0,
      inactive: cardCounts.inactive ?? 0,
    },
    parents: {
      active: activeParents.length,
      withoutMobileNumber: activeParents.filter((p) => !p.mobileNumber).length,
    },
    sms: {
      sent: smsCounts[NOTIFICATION_STATUS.SENT] ?? 0,
      failed: smsCounts[NOTIFICATION_STATUS.FAILED] ?? 0,
      skipped: smsCounts[NOTIFICATION_STATUS.SKIPPED] ?? 0,
    },
  };
}
