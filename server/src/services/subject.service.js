// Subjects (admin): add, rename, hide/show and reorder the subjects teachers rate behavior in.
// Each change is one transaction with one audit entry. Nothing is ever deleted.
import { MAX_SUBJECTS, SUBJECT_KEY_PATTERN, subjectKeyFromLabel, validateSubjectLabel } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { clearSubjectsCache, getSubjects, readSubjects, subjectsRef } from '../models/subject.model.js';
import { auditInTransaction } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';

const sameLabel = (a, b) => a.toLowerCase() === b.toLowerCase();
const invalidLabel = (message) => new HttpError(400, 'validation/invalid-subject', message, { fields: { label: message } });
const NOT_FOUND = () => new HttpError(404, 'subjects/not-found', 'This subject could not be found.');

export async function listSubjects() {
  return { subjects: await getSubjects() };
}

function save(tx, subjects) {
  tx.set(subjectsRef(), { subjects, updatedAt: FieldValue.serverTimestamp() });
}

/** Adds a visible subject at the end of the list. Its key is made from the name (unique). */
export async function addSubject(ctx, input) {
  const { value: label, error } = validateSubjectLabel(input?.label);
  if (error) throw invalidLabel(error);
  let created;
  await db.runTransaction(async (tx) => {
    const subjects = await readSubjects(tx);
    if (subjects.some((s) => sameLabel(s.label, label))) {
      throw new HttpError(409, 'subjects/duplicate', `There is already a subject called "${label}". Show it again instead of adding it twice.`, { fields: { label: 'This subject already exists.' } });
    }
    if (subjects.length >= MAX_SUBJECTS) throw new HttpError(409, 'subjects/too-many', `At most ${MAX_SUBJECTS} subjects.`);
    const base = subjectKeyFromLabel(label) || 'subject';
    let key = base;
    for (let n = 2; subjects.some((s) => s.key === key); n += 1) key = `${base}-${n}`;
    created = { key, label, hidden: false };
    save(tx, [...subjects, created]);
    auditInTransaction(tx, { ...ctx, eventType: 'subject.added', target: { type: 'subject', id: key }, details: { subject: key, changes: [`added "${label}"`] } });
  });
  clearSubjectsCache();
  return { subject: created, ...(await listSubjects()) };
}

/**
 * Changes one subject: { label?, hidden?, move?: "up" | "down" }. At least one subject must stay
 * visible. Renaming changes only the name; past evaluations keep the subject.
 */
export async function updateSubject(ctx, key, input) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const keys = Object.keys(body);
  if (!keys.length || keys.some((k) => !['label', 'hidden', 'move'].includes(k))) {
    throw new HttpError(400, 'validation/invalid-request', 'Send { "label" }, { "hidden": true | false } or { "move": "up" | "down" }.');
  }
  if ('hidden' in body && typeof body.hidden !== 'boolean') throw new HttpError(400, 'validation/invalid-request', 'hidden must be true or false.');
  if ('move' in body && !['up', 'down'].includes(body.move)) throw new HttpError(400, 'validation/invalid-request', 'move must be "up" or "down".');
  let label = null;
  if ('label' in body) {
    const checked = validateSubjectLabel(body.label);
    if (checked.error) throw invalidLabel(checked.error);
    label = checked.value;
  }
  if (typeof key !== 'string' || !SUBJECT_KEY_PATTERN.test(key)) throw NOT_FOUND();

  await db.runTransaction(async (tx) => {
    const subjects = await readSubjects(tx);
    const index = subjects.findIndex((s) => s.key === key);
    if (index < 0) throw NOT_FOUND();
    const current = subjects[index];
    const next = { ...current };
    const changes = [];
    if (label !== null && label !== current.label) {
      if (subjects.some((s) => s.key !== key && sameLabel(s.label, label))) {
        throw new HttpError(409, 'subjects/duplicate', `There is already a subject called "${label}".`, { fields: { label: 'This subject already exists.' } });
      }
      next.label = label;
      changes.push(`renamed "${current.label}" -> "${label}"`);
    }
    if ('hidden' in body && body.hidden !== current.hidden) {
      if (body.hidden && subjects.filter((s) => !s.hidden).length <= 1) {
        throw new HttpError(409, 'subjects/last-visible', 'At least one subject must stay visible.');
      }
      next.hidden = body.hidden;
      changes.push(body.hidden ? 'hidden' : 'shown again');
    }
    const list = subjects.map((s, i) => (i === index ? next : s));
    if (body.move) {
      const to = body.move === 'up' ? index - 1 : index + 1;
      if (to >= 0 && to < list.length) {
        [list[index], list[to]] = [list[to], list[index]];
        changes.push(`moved ${body.move}`);
      }
    }
    if (!changes.length) return;
    save(tx, list);
    auditInTransaction(tx, { ...ctx, eventType: 'subject.updated', target: { type: 'subject', id: key }, details: { subject: key, changes } });
  });
  clearSubjectsCache();
  return listSubjects();
}
