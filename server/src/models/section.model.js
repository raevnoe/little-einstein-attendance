// The school's kindergarten sections (e.g. "Kinder A", "Pre-Kinder"), kept by admins in ONE
// settings document: `systemSettings/sections` { names: string[], startTimes: { [name]: "HH:MM" },
// endTimes: { [name]: "HH:MM" }, updatedAt }. startTimes/endTimes = a section's own class hours (late
// arrivals, absent cut-off, early pick-up); a section without one uses the school default (School Settings). No separate
// collection: a short list of names. Students store their section NAME (students.section) and
// teachers the names they handle (users/{uid}.sections); names compare without case or extra spaces.
// Until an admin saves the list for the first time, it is the sections already used by students.
import { COLLECTIONS, TIME_OF_DAY_PATTERN } from '@led/shared';
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
 * { names, saved, startTimes, endTimes }: the saved list (times only for listed names), or (never saved yet) the sections students already use.
 * Pass `tx` to read inside a transaction (students are then read outside it: they only seed
 * an unsaved list).
 */
export async function readSectionNames(tx) {
  const snap = tx ? await tx.get(sectionsRef()) : await sectionsRef().get();
  const names = snap.exists ? snap.data().names : null;
  if (Array.isArray(names)) {
    const data = snap.data();
    return { names: sortNames(names), saved: true, startTimes: listedTimes(names, data.startTimes), endTimes: listedTimes(names, data.endTimes) };
  }
  return { names: namesFromStudents(await findAllStudents()), saved: false, startTimes: {}, endTimes: {} };
}

/** Only valid "HH:MM" values of listed sections. */
function listedTimes(names, times) {
  const listed = new Set(names);
  return Object.fromEntries(Object.entries(times ?? {}).filter(([name, time]) => listed.has(name) && TIME_OF_DAY_PATTERN.test(time)));
}

/** The time that applies to a student's section (start or end): the section's own, else `schoolDefault`. */
export function sectionTimeFor(sectionName, times, schoolDefault) {
  const key = sectionKey(sectionName);
  const own = Object.entries(times ?? {}).find(([name]) => sectionKey(name) === key)?.[1];
  return own && TIME_OF_DAY_PATTERN.test(own) ? own : schoolDefault;
}

export { sortNames };
