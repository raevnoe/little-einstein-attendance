// Student Performance Evaluation business rules: a teacher's daily star rating (1-5) and
// short observation per performance area. Not a grading system.
//
// Saving is an upsert on the deterministic document performance/{studentId}_{date}_{area},
// run in a Firestore transaction that also re-reads the student: simultaneous saves of the
// same student/date/area end as ONE record (the losing transaction retries as an update).
// Audit (Phase 11): each save writes its audit entry in that same transaction, with the star
// rating before/after and whether the observation changed - never the observation text.
import { PERFORMANCE_AREA_KEYS, dailyAverageStarRating } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { env } from '../config/env.js';
import {
  findPerformanceById,
  findPerformanceWhere,
  parsePerformanceDocId,
  performanceCollection,
  performanceDocId,
  toParentPerformanceView,
  toStaffPerformanceView,
  validateObservation,
  validateStarRating,
} from '../models/performance.model.js';
import { normalizeStudentId, studentsCollection } from '../models/student.model.js';
import { findUsersByIds } from '../models/user.model.js';
import { getChildOfParent } from './student.service.js';
import { addDays, isValidSchoolDate, schoolDateOf } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';
import { auditInTransaction } from './audit.service.js';
import { notifyPerformanceInApp } from './inbox.service.js';
import { ALL_SECTIONS, sectionInScope, studentInScope } from '../utils/sectionScope.js';

const CREATE_FIELDS = ['studentId', 'evaluationDate', 'area', 'starRating', 'observation'];
const UPDATE_FIELDS = ['starRating', 'observation'];
const PARENT_HISTORY_DAYS = 30;

const notFound = () => new HttpError(404, 'performance/not-found', 'This performance evaluation could not be found.');
const studentNotFound = () => new HttpError(404, 'students/not-found', 'This student could not be found.');
const studentInactive = () => new HttpError(409, 'students/inactive', 'This student is inactive and cannot be evaluated.');
const invalid = (fields) => new HttpError(400, 'validation/invalid-performance', 'Please correct the highlighted fields.', { fields });

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
const areaOrder = (key) => PERFORMANCE_AREA_KEYS.indexOf(key);

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/** teacherId, timestamps, role, etc. are decided by the server and are rejected if sent. */
function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new HttpError(400, 'validation/unknown-fields', `These fields cannot be set: ${unknown.join(', ')}.`);
  }
}

function validateEvaluationDate(value) {
  if (!isValidSchoolDate(value)) return { error: 'Evaluation date must be a valid date (YYYY-MM-DD).' };
  if (value > schoolDateOf()) return { error: 'Evaluation date cannot be in the future.' };
  return { value };
}

function parseQueryDate(value) {
  if (value === undefined || value === '') return null;
  if (!isValidSchoolDate(value)) throw new HttpError(400, 'validation/invalid-date', 'Date must be a valid date (YYYY-MM-DD).');
  return value;
}

/** Parses a performance ID from a URL; 400 if malformed. */
export function parsePerformanceId(value) {
  const parts = parsePerformanceDocId(value);
  if (!parts) throw new HttpError(400, 'validation/invalid-performance-id', 'Invalid performance evaluation ID.');
  return performanceDocId(parts.studentId, parts.evaluationDate, parts.area);
}

/** Reads the student inside the transaction: must exist, be in the staff member's sections, and be active. */
async function assertActiveStudent(tx, studentId, scope = ALL_SECTIONS) {
  const snapshot = await tx.get(studentsCollection().doc(studentId));
  if (!snapshot.exists || !studentInScope(scope, snapshot.data())) throw studentNotFound();
  if (snapshot.data().active !== true) throw studentInactive();
  return snapshot.data();
}

/** Adds the student's name/section and the saving staff member's name (staff views only). */
async function withNames(records) {
  const studentIds = [...new Set(records.map((r) => r.studentId))];
  const teacherIds = [...new Set(records.map((r) => r.teacherId).filter(Boolean))];
  const [studentSnaps, teachers] = await Promise.all([
    studentIds.length ? db.getAll(...studentIds.map((id) => studentsCollection().doc(id))) : [],
    findUsersByIds(teacherIds),
  ]);
  const students = new Map(studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));
  const teacherNames = new Map(teachers.map((t) => [t.uid, t.displayName]));
  return records.map((r) => {
    const s = students.get(r.studentId);
    return {
      ...toStaffPerformanceView(r),
      student: s ? { studentId: s.studentId, name: fullName(s), section: s.section, active: s.active } : null,
      teacherName: teacherNames.get(r.teacherId) ?? null,
    };
  });
}

/** Evaluations are visible to a teacher only for students of their sections (`scope`). */
const evaluationInScope = (scope, e) => scope.all || Boolean(e.student && sectionInScope(scope, e.student.section));

export async function getEvaluation(id, { scope = ALL_SECTIONS } = {}) {
  const record = await findPerformanceById(id);
  if (!record) throw notFound();
  const evaluation = (await withNames([record]))[0];
  if (!evaluationInScope(scope, evaluation)) throw notFound();
  return evaluation;
}

/** Audit entry for a saved evaluation (inside the saving transaction). */
function auditSave(tx, ctx, id, previous, fields) {
  auditInTransaction(tx, {
    ...ctx,
    eventType: previous ? 'performance.updated' : 'performance.created',
    target: { type: 'performance', id },
    details: {
      studentId: fields.studentId,
      evaluationDate: fields.evaluationDate,
      area: fields.area,
      starRating: fields.starRating,
      previousStarRating: previous ? previous.starRating : null,
      observationChanged: previous ? (previous.observation ?? '') !== fields.observation : Boolean(fields.observation),
    },
  });
}

/**
 * Creates the evaluation for student/date/area, or updates it if one already exists.
 * `ctx` = auditContext(req); the evaluator is its verified user. Returns { created, evaluation }.
 */
export async function saveEvaluation(ctx, input, { scope = ALL_SECTIONS } = {}) {
  const teacherUid = ctx.actor.uid;
  const body = asObject(input);
  rejectUnknownFields(body, CREATE_FIELDS);

  const errors = {};
  const studentId = normalizeStudentId(body.studentId);
  if (!studentId) errors.studentId = 'Select a valid student.';
  const date = validateEvaluationDate(body.evaluationDate);
  if (date.error) errors.evaluationDate = date.error;
  if (!PERFORMANCE_AREA_KEYS.includes(body.area)) errors.area = 'Select a valid performance area.';
  const rating = validateStarRating(body.starRating);
  if (rating.error) errors.starRating = rating.error;
  const observation = validateObservation(body.observation);
  if (observation.error) errors.observation = observation.error;
  if (Object.keys(errors).length) throw invalid(errors);

  const id = performanceDocId(studentId, date.value, body.area);
  const ref = performanceCollection().doc(id);
  const { created, student } = await db.runTransaction(async (tx) => {
    const student = await assertActiveStudent(tx, studentId, scope);
    const existing = await tx.get(ref);
    const fields = {
      starRating: rating.value,
      observation: observation.value,
      teacherId: teacherUid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (existing.exists) {
      tx.update(ref, fields);
    } else {
      tx.create(ref, {
        studentId,
        evaluationDate: date.value,
        area: body.area,
        ...fields,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    auditSave(tx, ctx, id, existing.exists ? existing.data() : null, {
      studentId, evaluationDate: date.value, area: body.area, starRating: fields.starRating, observation: fields.observation,
    });
    return { created: !existing.exists, student };
  });
  // Parents' bell (best effort, after the commit; never fails the save).
  await notifyPerformanceInApp({ student, evaluationDate: date.value, area: body.area });
  return { created, evaluation: await getEvaluation(id) };
}

/** Changes the star rating and/or observation of an existing evaluation. */
export async function updateEvaluation(ctx, id, input, { scope = ALL_SECTIONS } = {}) {
  const teacherUid = ctx.actor.uid;
  const body = asObject(input);
  rejectUnknownFields(body, UPDATE_FIELDS);

  const fields = {};
  const errors = {};
  if ('starRating' in body) {
    const rating = validateStarRating(body.starRating);
    if (rating.error) errors.starRating = rating.error;
    else fields.starRating = rating.value;
  }
  if ('observation' in body) {
    const observation = validateObservation(body.observation);
    if (observation.error) errors.observation = observation.error;
    else fields.observation = observation.value;
  }
  if (Object.keys(errors).length) throw invalid(errors);
  if (Object.keys(fields).length === 0) throw new HttpError(400, 'validation/empty-update', 'No changes were provided.');

  const ref = performanceCollection().doc(id);
  const { previous, student } = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw notFound();
    const previous = snapshot.data();
    const student = await assertActiveStudent(tx, previous.studentId, scope);
    tx.update(ref, { ...fields, teacherId: teacherUid, updatedAt: FieldValue.serverTimestamp() });
    auditSave(tx, ctx, id, previous, {
      studentId: previous.studentId,
      evaluationDate: previous.evaluationDate,
      area: previous.area,
      starRating: fields.starRating ?? previous.starRating,
      observation: 'observation' in fields ? fields.observation : previous.observation ?? '',
    });
    return { previous, student };
  });
  await notifyPerformanceInApp({ student, evaluationDate: previous.evaluationDate, area: previous.area });
  return getEvaluation(id);
}

/**
 * Staff list filtered by student, date and/or area. With neither a student nor a date,
 * today's evaluations are returned (never the whole collection).
 */
export async function listEvaluations({ studentId: rawStudentId, date: rawDate, area, scope = ALL_SECTIONS } = {}) {
  let studentId = null;
  if (rawStudentId !== undefined && rawStudentId !== '') {
    studentId = normalizeStudentId(rawStudentId);
    if (!studentId) throw new HttpError(400, 'validation/invalid-student-id', 'Invalid Student ID.');
  }
  if (area !== undefined && area !== '' && !PERFORMANCE_AREA_KEYS.includes(area)) {
    throw new HttpError(400, 'validation/invalid-area', 'Invalid performance area.');
  }
  const today = schoolDateOf();
  const date = parseQueryDate(rawDate) ?? (studentId ? null : today);

  const records = (studentId ? await findPerformanceWhere('studentId', studentId) : await findPerformanceWhere('evaluationDate', date))
    .filter((r) => !date || r.evaluationDate === date)
    .filter((r) => !area || r.area === area);

  const evaluations = (await withNames(records)).filter((e) => evaluationInScope(scope, e)).sort((a, b) =>
    b.evaluationDate.localeCompare(a.evaluationDate)
    || (a.student?.name ?? a.studentId).localeCompare(b.student?.name ?? b.studentId)
    || areaOrder(a.area) - areaOrder(b.area));

  return { today, timeZone: env.schoolTimeZone, date, evaluations };
}

/**
 * A parent's own child's evaluations grouped by day (newest first), for one date or the
 * last 30 days. 404 unless it is the caller's own linked, active child.
 */
export async function getChildPerformance(parentUid, studentId, { date: rawDate } = {}) {
  await getChildOfParent(parentUid, studentId);
  const today = schoolDateOf();
  const date = parseQueryDate(rawDate);
  const oldest = addDays(today, -(PARENT_HISTORY_DAYS - 1));

  const byDate = new Map();
  for (const r of await findPerformanceWhere('studentId', studentId)) {
    if (date ? r.evaluationDate !== date : r.evaluationDate < oldest) continue;
    if (!byDate.has(r.evaluationDate)) byDate.set(r.evaluationDate, []);
    byDate.get(r.evaluationDate).push(r);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([evaluationDate, records]) => ({
      evaluationDate,
      dailyAverageStarRating: dailyAverageStarRating(records.map((r) => r.starRating)),
      evaluations: records.sort((a, b) => areaOrder(a.area) - areaOrder(b.area)).map(toParentPerformanceView),
    }));

  return { studentId, today, date, days };
}
