// `students/{studentId}` document. The document ID IS the school Student ID
// (e.g. K2026-001), so Firestore itself guarantees uniqueness: create() fails if
// the ID already exists. Student IDs are therefore permanent (not editable).
// The Student ID is NOT the RFID UID; RFID cards are a separate collection (Phase 5).
import { COLLECTIONS, GENDERS, MAX_PARENTS_PER_STUDENT, STUDENT_ID_PATTERN } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { UID_PATTERN } from './user.model.js';

export const studentsCollection = () => db.collection(COLLECTIONS.STUDENTS);

const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const SECTION_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CHILD_AGE_YEARS = 12;

// Fields an admin may set. studentId is set once at creation; active has its own endpoints.
export const EDITABLE_FIELDS = Object.freeze([
  'firstName', 'middleName', 'lastName', 'dateOfBirth', 'gender', 'section', 'parentIds',
]);

/** Uppercases/trims a Student ID; returns null if it is not a valid Student ID. */
export function normalizeStudentId(value) {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return STUDENT_ID_PATTERN.test(id) ? id : null;
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function validateName(value, { required, label }) {
  const name = cleanText(value);
  if (!name) return required ? { error: `${label} is required.` } : { value: '' };
  if (name.length > 60) return { error: `${label} must be 60 characters or fewer.` };
  if (!NAME_PATTERN.test(name)) return { error: `${label} may only contain letters, spaces, periods, apostrophes and hyphens.` };
  return { value: name };
}

function validateDateOfBirth(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return { error: 'Date of birth is required.' };
  const date = new Date(`${text}T00:00:00Z`);
  // The round-trip check rejects impossible dates such as 2020-02-30.
  if (!DATE_PATTERN.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    return { error: 'Date of birth must be a valid date (YYYY-MM-DD).' };
  }
  const today = new Date();
  const oldest = new Date(Date.UTC(today.getUTCFullYear() - MAX_CHILD_AGE_YEARS, today.getUTCMonth(), today.getUTCDate()));
  if (date > today) return { error: 'Date of birth cannot be in the future.' };
  if (date < oldest) return { error: `Date of birth must be within the last ${MAX_CHILD_AGE_YEARS} years.` };
  return { value: text };
}

function validateParentIds(value) {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'Parents must be a list of parent account IDs.' };
  const ids = [...new Set(value)];
  if (ids.length > MAX_PARENTS_PER_STUDENT) return { error: `A student can have at most ${MAX_PARENTS_PER_STUDENT} parent accounts.` };
  if (!ids.every((id) => typeof id === 'string' && UID_PATTERN.test(id))) {
    return { error: 'One or more parent account IDs are invalid.' };
  }
  return { value: ids };
}

const VALIDATORS = {
  firstName: (v) => validateName(v, { required: true, label: 'First name' }),
  middleName: (v) => validateName(v, { required: false, label: 'Middle name' }),
  lastName: (v) => validateName(v, { required: true, label: 'Last name' }),
  dateOfBirth: validateDateOfBirth,
  gender: (v) => (GENDERS.includes(v) ? { value: v } : { error: `Gender must be ${GENDERS.join(' or ')}.` }),
  section: (v) => {
    const section = cleanText(v);
    if (!section) return { error: 'Section is required.' };
    if (section.length > 40 || !SECTION_PATTERN.test(section)) {
      return { error: 'Section must be up to 40 letters, numbers, spaces, periods, apostrophes or hyphens.' };
    }
    return { value: section };
  },
  parentIds: validateParentIds,
};

/**
 * Validates the given fields. With `partial`, only fields present in `input` are
 * checked (for edits); otherwise every field is validated (for creation).
 * Returns { data, errors } where errors maps field name -> message.
 */
export function validateStudentFields(input, { partial = false } = {}) {
  const data = {};
  const errors = {};
  for (const field of EDITABLE_FIELDS) {
    if (partial && !(field in input)) continue;
    const result = VALIDATORS[field](input[field]);
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }
  return { data, errors };
}

/** The document for a new student (always active). */
export function newStudentDocument(studentId, data) {
  return {
    studentId,
    ...data,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function findStudentById(studentId) {
  const snapshot = await studentsCollection().doc(studentId).get();
  return snapshot.exists ? snapshot.data() : null;
}

/** All students, ordered by Student ID (the document ID). Fine at kindergarten scale. */
export async function findAllStudents() {
  const snapshot = await studentsCollection().get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function findStudentsByParent(parentUid) {
  const snapshot = await studentsCollection().where('parentIds', 'array-contains', parentUid).get();
  return snapshot.docs.map((doc) => doc.data());
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

function basicFields(s) {
  return {
    studentId: s.studentId,
    firstName: s.firstName,
    middleName: s.middleName,
    lastName: s.lastName,
    gender: s.gender,
    section: s.section,
    active: s.active,
  };
}

/** Row shape for staff lists. */
export function toStudentSummary(s) {
  return { ...basicFields(s), rfidAssigned: Boolean(s.rfidCardUid) };
}

/** Full record for staff. */
export function toStudentDetail(s) {
  return {
    ...toStudentSummary(s),
    dateOfBirth: s.dateOfBirth,
    parentIds: s.parentIds ?? [],
    // Pointer to the student's assigned (always active) RFID card, maintained only
    // by the RFID card service inside transactions. Not editable via the student API.
    rfidCardUid: s.rfidCardUid ?? null,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
}

/** What a parent sees about their own child: no other parents' IDs, no RFID data. */
export function toChildView(s) {
  return { ...basicFields(s), dateOfBirth: s.dateOfBirth };
}
