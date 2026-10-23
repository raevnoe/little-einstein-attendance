// Student business rules on top of the student model: uniqueness, parent-link
// validation, search, and per-parent access.
//
// Audit (Phase 11): create/update/deactivate/reactivate write the student change and its
// audit entry in ONE transaction. Updates record the NAMES of changed fields only (no values:
// no names, birth dates or parent account IDs).
import { ROLES } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { findUsersByIds } from '../models/user.model.js';
import {
  EDITABLE_FIELDS,
  findAllStudents,
  findStudentById,
  findStudentsByParent,
  newStudentDocument,
  normalizeStudentId,
  studentsCollection,
  toChildView,
  toStudentDetail,
  toStudentSummary,
  validateStudentFields,
} from '../models/student.model.js';
import { HttpError } from '../utils/httpError.js';
import { ACCESS_DENIED_WINDOW_MS, auditInTransaction, recordAudit } from './audit.service.js';

// Firestore gRPC status codes.
const ALREADY_EXISTS = 6;

const STUDENT_NOT_FOUND = () => new HttpError(404, 'students/not-found', 'This student could not be found.');
const DUPLICATE_ID = (studentId) => new HttpError(409, 'students/duplicate-id', `A student with Student ID ${studentId} already exists.`, {
  fields: { studentId: 'This Student ID is already in use.' },
});

function invalid(errors) {
  return new HttpError(400, 'validation/invalid-student', 'Please correct the highlighted fields.', { fields: errors });
}

/** Parses a Student ID from a URL; 400 if malformed. */
export function parseStudentId(value) {
  const id = normalizeStudentId(value);
  if (!id) throw new HttpError(400, 'validation/invalid-student-id', 'Invalid Student ID.');
  return id;
}

/** Every linked ID must be an existing account with the parent role. */
async function assertParentAccounts(parentIds) {
  if (!parentIds?.length) return;
  const users = await findUsersByIds(parentIds);
  const valid = users.filter((u) => u.role === ROLES.PARENT).map((u) => u.uid);
  if (valid.length !== parentIds.length) {
    throw invalid({ parentIds: 'One or more selected accounts are not parent accounts.' });
  }
}

/** True if every word of `q` appears in the student's ID, name, or section. */
export function matchesStudentSearch(s, q) {
  const search = typeof q === 'string' ? q.trim().toLowerCase() : '';
  if (!search) return true;
  const haystack = [s.studentId, s.firstName, s.middleName, s.lastName, s.section].join(' ').toLowerCase();
  return search.split(/\s+/).every((term) => haystack.includes(term));
}

export async function listStudents({ q, status } = {}) {
  const wantActive = status === 'active' ? true : status === 'inactive' ? false : null;

  return (await findAllStudents())
    .filter((s) => wantActive === null || s.active === wantActive)
    .filter((s) => matchesStudentSearch(s, q))
    .map(toStudentSummary);
}

/**
 * Staff view of one student with the linked parents' names. Parent contact details (email,
 * mobile number) are included only with `includeContact` (admins: they manage SMS numbers).
 * Teachers only see whether a parent has an SMS number on file.
 */
export async function getStudent(studentId, { includeContact = false } = {}) {
  const student = await findStudentById(studentId);
  if (!student) throw STUDENT_NOT_FOUND();

  const parents = (await findUsersByIds(student.parentIds ?? [])).map(({ uid, displayName, email, active, mobileNumber }) => ({
    uid,
    displayName,
    active,
    hasMobileNumber: Boolean(mobileNumber),
    ...(includeContact ? { email, mobileNumber: mobileNumber ?? null } : {}),
  }));
  return { ...toStudentDetail(student), parents };
}

/** `ctx` = auditContext(req) of the admin. */
export async function createStudent(ctx, input) {
  const body = input && typeof input === 'object' ? input : {};
  const studentId = normalizeStudentId(body.studentId);
  const { data, errors } = validateStudentFields(body);
  if (!studentId) {
    errors.studentId = 'Student ID is required: 3-20 letters, numbers or hyphens (e.g. K2026-001).';
  }
  if (Object.keys(errors).length) throw invalid(errors);

  await assertParentAccounts(data.parentIds);

  const ref = studentsCollection().doc(studentId);
  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw DUPLICATE_ID(studentId);
      tx.create(ref, newStudentDocument(studentId, data));
      auditInTransaction(tx, {
        ...ctx,
        eventType: 'student.created',
        target: { type: 'student', id: studentId },
        details: { section: data.section, parentCount: data.parentIds?.length ?? 0 },
      });
    });
  } catch (err) {
    if (err?.code === ALREADY_EXISTS) throw DUPLICATE_ID(studentId);
    throw err;
  }
  return getStudent(studentId, { includeContact: true });
}

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function updateStudent(ctx, studentId, input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if ('studentId' in body && normalizeStudentId(body.studentId) !== studentId) {
    throw invalid({ studentId: 'Student ID cannot be changed.' });
  }
  const unknown = Object.keys(body).filter((k) => k !== 'studentId' && !EDITABLE_FIELDS.includes(k));
  if (unknown.length) {
    throw new HttpError(400, 'validation/unknown-fields', `These fields cannot be edited: ${unknown.join(', ')}.`);
  }

  const { data, errors } = validateStudentFields(body, { partial: true });
  if (Object.keys(errors).length) throw invalid(errors);
  if (Object.keys(data).length === 0) {
    throw new HttpError(400, 'validation/empty-update', 'No changes were provided.');
  }

  await assertParentAccounts(data.parentIds);
  const ref = studentsCollection().doc(studentId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw STUDENT_NOT_FOUND();
    const current = snapshot.data();
    const changedFields = Object.keys(data).filter((key) => !sameValue(current[key], data[key]));
    const before = new Set(current.parentIds ?? []);
    const after = new Set(data.parentIds ?? current.parentIds ?? []);
    tx.update(ref, { ...data, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, {
      ...ctx,
      eventType: 'student.updated',
      target: { type: 'student', id: studentId },
      details: {
        changedFields,
        parentsLinked: [...after].filter((uid) => !before.has(uid)).length,
        parentsUnlinked: [...before].filter((uid) => !after.has(uid)).length,
      },
    });
  });
  return getStudent(studentId, { includeContact: true });
}

/** Deactivation never deletes: future attendance/performance records keep their reference. */
export async function setStudentActive(ctx, studentId, active) {
  const ref = studentsCollection().doc(studentId);
  await db.runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) throw STUDENT_NOT_FOUND();
    tx.update(ref, { active, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, {
      ...ctx,
      eventType: active ? 'student.reactivated' : 'student.deactivated',
      target: { type: 'student', id: studentId },
    });
  });
  return getStudent(studentId, { includeContact: true });
}

/** Only students whose parentIds contain this parent's uid. */
export async function listChildrenOfParent(parentUid) {
  return (await findStudentsByParent(parentUid))
    .filter((s) => s.active)
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
    .map(toChildView);
}

/**
 * Best-effort audit when a parent asks for a record that EXISTS but belongs to another family
 * (once per parent + record per 5 minutes). The response is the same 404 either way.
 */
export function recordOwnershipDenied(parentUid, resource, id) {
  return recordAudit({
    eventType: 'auth.ownership-denied',
    outcome: 'denied',
    actor: { type: 'user', uid: parentUid, role: ROLES.PARENT },
    target: { type: resource, id },
    reason: `${resource}/not-owned`,
    details: { resource },
  }, { suppressKey: `ownership|${parentUid}|${resource}|${id}`, windowMs: ACCESS_DENIED_WINDOW_MS });
}

/** A parent's own child, or 404 (never reveals whether another family's student exists). */
export async function getChildOfParent(parentUid, studentId) {
  const student = await findStudentById(studentId);
  if (student && !student.parentIds?.includes(parentUid)) await recordOwnershipDenied(parentUid, 'student', studentId);
  if (!student || !student.active || !student.parentIds?.includes(parentUid)) throw STUDENT_NOT_FOUND();
  return toChildView(student);
}
