// The school's kindergarten sections (e.g. "Kinder A", "Pre-Kinder"), kept by admins in ONE
// settings document: `systemSettings/sections` { names: string[], updatedAt }. No separate
// collection: a short list of names. Students store their section NAME (students.section) and
// teachers the names they handle (users/{uid}.sections); names compare without case or extra spaces.
// Until an admin saves the list for the first time, it is the sections already used by students.
import { COLLECTIONS } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';
import { findAllStudents } from './student.model.js';

export const MAX_SECTIONS = 50;
export const SECTION_MAX_LENGTH = 40;
const SECTION_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

export const sectionsRef = () => db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc('sections');

/** Comparison key: "  kinder  a " and "Kinder A" are the same section. */
export const sectionKey = (name) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '');

/** A cleaned section name, or { error }. */
export function validateSectionName(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name) return { error: 'Section name is required.' };
  if (name.length > SECTION_MAX_LENGTH || !SECTION_PATTERN.test(name)) {
    return { error: `Section name must be up to ${SECTION_MAX_LENGTH} letters, numbers, spaces, periods, apostrophes or hyphens.` };
  }
  return { value: name };
}

const sortNames = (names) => [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

/** Distinct section names used by students (first spelling wins), sorted. */
function namesFromStudents(students) {
  const byKey = new Map();
  for (const s of students) if (s.section && !byKey.has(sectionKey(s.section))) byKey.set(sectionKey(s.section), s.section);
  return sortNames(byKey.values());
}

/**
 * { names, saved }: the saved list, or (never saved yet) the sections students already use.
 * Pass `tx` to read inside a transaction (students are then read outside it: they only seed
 * an unsaved list).
 */
export async function readSectionNames(tx) {
  const snap = tx ? await tx.get(sectionsRef()) : await sectionsRef().get();
  const names = snap.exists ? snap.data().names : null;
  if (Array.isArray(names)) return { names: sortNames(names), saved: true };
  return { names: namesFromStudents(await findAllStudents()), saved: false };
}

export { sortNames };
