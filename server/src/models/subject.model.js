// The school's subject list for Behavioral Evaluations: `systemSettings/subjects`
//   { subjects: [{ key, label, hidden }], updatedAt }   (array order = the order screens show)
// Until an admin saves a change it is the starting list (shared DEFAULT_SUBJECTS). Keys are stored in
// every evaluation (and its document ID), so they never change; labels may. Subjects are hidden, never
// deleted. Cached for 30 s per server instance; saving clears this instance's cache.
import { COLLECTIONS, DEFAULT_SUBJECTS, SUBJECT_KEY_PATTERN } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

const CACHE_TTL_MS = 30_000;

export const subjectsRef = () => db.collection(COLLECTIONS.SYSTEM_SETTINGS).doc('subjects');

/** The stored list, cleaned; the starting list when nothing valid is stored. */
export function parseSubjects(data) {
  const list = Array.isArray(data?.subjects) ? data.subjects : null;
  const subjects = (list ?? [])
    .filter((s) => s && SUBJECT_KEY_PATTERN.test(s.key) && typeof s.label === 'string' && s.label)
    .map((s) => ({ key: s.key, label: s.label, hidden: s.hidden === true }));
  return subjects.length ? subjects : DEFAULT_SUBJECTS.map((s) => ({ ...s }));
}

let cached = null;

export async function getSubjects() {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.subjects;
  let data = null;
  try {
    const snap = await subjectsRef().get();
    data = snap.exists ? snap.data() : null;
  } catch (err) {
    console.error('[subjects] Could not load the subject list; using last known/starting list:', err.message);
    if (cached) return cached.subjects;
  }
  const subjects = parseSubjects(data);
  cached = { subjects, loadedAt: Date.now() };
  return subjects;
}

/** Inside a transaction (fresh, not cached). */
export async function readSubjects(tx) {
  const snap = await tx.get(subjectsRef());
  return parseSubjects(snap.exists ? snap.data() : null);
}

export function clearSubjectsCache() {
  cached = null;
}

/** Position of a key in the list (unknown keys last), for sorting evaluations. */
export const subjectOrder = (subjects, key) => {
  const i = subjects.findIndex((s) => s.key === key);
  return i < 0 ? subjects.length : i;
};
