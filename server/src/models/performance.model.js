// `performance/{studentId}_{evaluationDate}_{area}` document: ONE Student Performance
// evaluation per student, school date and performance area. The deterministic ID is what
// makes a duplicate impossible (Student IDs never contain "_", dates are YYYY-MM-DD and
// area keys are lowercase words with hyphens, so the ID is unambiguous).
//
//   studentId       string   school Student ID
//   evaluationDate  string   "YYYY-MM-DD" school-local date (same rule as attendance)
//   area            string   key from PERFORMANCE_AREAS
//   starRating      integer  1-5 (visual rating, not a grade)
//   observation     string   short teacher note ('' when none)
//   teacherId       string   uid of the staff member who last saved it (from the verified token)
//   createdAt, updatedAt
//
// Student details are NOT copied here; they are joined from students/{studentId}.
import {
  COLLECTIONS,
  MAX_OBSERVATION_LENGTH,
  MAX_STAR_RATING,
  MIN_STAR_RATING,
  PERFORMANCE_AREA_KEYS,
} from '@led/shared';
import { db } from '../config/firebaseAdmin.js';
import { normalizeStudentId } from './student.model.js';

export const performanceCollection = () => db.collection(COLLECTIONS.PERFORMANCE);

export const performanceDocId = (studentId, evaluationDate, area) => `${studentId}_${evaluationDate}_${area}`;

/** Splits a document ID from a URL; null if it cannot be a performance ID. */
export function parsePerformanceDocId(value) {
  const match = /^([^_]+)_(\d{4}-\d{2}-\d{2})_([a-z-]+)$/.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const studentId = normalizeStudentId(match[1]);
  if (!studentId || studentId !== match[1] || !PERFORMANCE_AREA_KEYS.includes(match[3])) return null;
  return { studentId, evaluationDate: match[2], area: match[3] };
}

export function validateStarRating(value) {
  return Number.isInteger(value) && value >= MIN_STAR_RATING && value <= MAX_STAR_RATING
    ? { value }
    : { error: `Star rating must be a whole number from ${MIN_STAR_RATING} to ${MAX_STAR_RATING}.` };
}

// Control characters other than tab and newline (e.g. NUL, escape sequences).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Optional short note. Normal punctuation and line breaks are kept as typed. */
export function validateObservation(value) {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: 'Observation must be text.' };
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length > MAX_OBSERVATION_LENGTH) {
    return { error: `Observation must be ${MAX_OBSERVATION_LENGTH} characters or fewer.` };
  }
  if (CONTROL_CHARS.test(text)) return { error: 'Observation contains characters that are not allowed.' };
  return { value: text };
}

export async function findPerformanceById(id) {
  const snapshot = await performanceCollection().doc(id).get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

/** Equality query on one field; other filters are applied by the caller. */
export async function findPerformanceWhere(field, value) {
  const snapshot = await performanceCollection().where(field, '==', value).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/** Every evaluation from `from` to `to` (inclusive). Single-field range: no composite index needed. */
export async function findPerformanceInRange(from, to) {
  const snapshot = await performanceCollection().where('evaluationDate', '>=', from).where('evaluationDate', '<=', to).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

/** What parents see: area, stars, note and date only (no teacher account data, no IDs). */
export function toParentPerformanceView(record) {
  return {
    evaluationDate: record.evaluationDate,
    area: record.area,
    starRating: record.starRating,
    observation: record.observation ?? '',
  };
}

/** Full record for staff. */
export function toStaffPerformanceView(record) {
  return {
    id: record.id,
    studentId: record.studentId,
    ...toParentPerformanceView(record),
    teacherId: record.teacherId,
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}
