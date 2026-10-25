// Kindergarten sections: the admin-managed list (systemSettings/sections) and the rules that keep
// students and teachers pointing at names on it. Teacher assignment lives in userAccount.service.
import { ROLES } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { MAX_SECTIONS, readSectionNames, sectionKey, sectionsRef, sortNames, validateSectionName } from '../models/section.model.js';
import { findAllStudents } from '../models/student.model.js';
import { findUsersByRole } from '../models/user.model.js';
import { auditInTransaction } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';

const invalidName = (message) => new HttpError(400, 'validation/invalid-section', message, { fields: { name: message } });
const NOT_FOUND = () => new HttpError(404, 'sections/not-found', 'This section could not be found.');

/**
 * Admin list: each section with how many students (active / all) and teachers use it, plus the
 * sections students still carry that are NOT on the list (older records), so they can be added.
 */
export async function listSections() {
  const [{ names, saved }, students, teachers] = await Promise.all([readSectionNames(), findAllStudents(), findUsersByRole(ROLES.TEACHER)]);
  const count = (key) => ({
    activeStudents: students.filter((s) => s.active && sectionKey(s.section) === key).length,
    students: students.filter((s) => sectionKey(s.section) === key).length,
    teachers: teachers.filter((t) => (t.sections ?? []).some((name) => sectionKey(name) === key)).length,
  });
  const listed = new Set(names.map(sectionKey));
  const unlisted = sortNames([...new Map(students
    .filter((s) => s.section && !listed.has(sectionKey(s.section)))
    .map((s) => [sectionKey(s.section), s.section])).values()]);
  return { saved, sections: names.map((name) => ({ name, ...count(sectionKey(name)) })), unlisted };
}

/** Adds a section name (409 if the same name, ignoring case and spaces, is already listed). */
export async function addSection(ctx, input) {
  const { value: name, error } = validateSectionName(input?.name);
  if (error) throw invalidName(error);
  await db.runTransaction(async (tx) => {
    const { names } = await readSectionNames(tx);
    if (names.some((n) => sectionKey(n) === sectionKey(name))) {
      throw new HttpError(409, 'sections/duplicate', `The section "${name}" already exists.`);
    }
    if (names.length >= MAX_SECTIONS) throw new HttpError(409, 'sections/too-many', `At most ${MAX_SECTIONS} sections.`);
    tx.set(sectionsRef(), { names: sortNames([...names, name]), updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, { ...ctx, eventType: 'section.added', target: { type: 'section', id: name }, details: { section: name } });
  });
  return listSections();
}

/**
 * Removes a section name. Refused (409) while any student - active or not - or any teacher still
 * uses it: move them first, so no record points at a section that no longer exists.
 */
export async function removeSection(ctx, rawName) {
  const key = sectionKey(rawName);
  const [students, teachers] = await Promise.all([findAllStudents(), findUsersByRole(ROLES.TEACHER)]);
  const studentCount = students.filter((s) => sectionKey(s.section) === key).length;
  const teacherCount = teachers.filter((t) => (t.sections ?? []).some((n) => sectionKey(n) === key)).length;
  if (studentCount || teacherCount) {
    throw new HttpError(409, 'sections/in-use',
      `This section is still used by ${studentCount} student(s) and ${teacherCount} teacher(s). Move them to another section first.`);
  }
  await db.runTransaction(async (tx) => {
    const { names } = await readSectionNames(tx);
    const name = names.find((n) => sectionKey(n) === key);
    if (!name) throw NOT_FOUND();
    tx.set(sectionsRef(), { names: names.filter((n) => n !== name), updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, { ...ctx, eventType: 'section.removed', target: { type: 'section', id: name }, details: { section: name } });
  });
  return listSections();
}

/**
 * The listed spelling of a section chosen on a student form, or { error }. `current` = the student's
 * section today: keeping an older, unlisted section unchanged is allowed (so other edits still work).
 */
export async function resolveStudentSection(value, { current = null } = {}) {
  const { value: name, error } = validateSectionName(value);
  if (error) return { error: error.replace('Section name', 'Section') };
  if (current && sectionKey(current) === sectionKey(name)) return { value: current };
  const { names } = await readSectionNames();
  const listed = names.find((n) => sectionKey(n) === sectionKey(name));
  return listed ? { value: listed } : { error: 'Choose a section from the list (an admin adds new sections under Students → Sections).' };
}

/** Listed spellings for a teacher's sections (deduplicated), or { error }. */
export async function resolveTeacherSections(values) {
  if (!Array.isArray(values)) return { error: 'Sections must be a list of section names.' };
  if (values.length > MAX_SECTIONS) return { error: `At most ${MAX_SECTIONS} sections.` };
  const { names } = await readSectionNames();
  const byKey = new Map(names.map((n) => [sectionKey(n), n]));
  const chosen = new Map();
  for (const value of values) {
    const listed = typeof value === 'string' ? byKey.get(sectionKey(value)) : undefined;
    if (!listed) return { error: `"${typeof value === 'string' ? value : '?'}" is not a section on the list.` };
    chosen.set(sectionKey(listed), listed);
  }
  return { value: sortNames(chosen.values()) };
}
