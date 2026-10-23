// UHF RFID card management. Every assignment change runs in ONE Firestore transaction
// that reads and writes both the card and the student(s) involved, so concurrent
// admin actions cannot leave a card on two students or two cards on one student
// (the transaction that loses the race is retried against the winner's result).
// Audit (Phase 11): every card change writes its audit entry in that same transaction, so a
// change never commits without its entry. `ctx` = auditContext(req) of the admin.
import { normalizeRfidUid } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { findAllCards, findCardByUid, newCardFields, rfidCardsCollection, toCardView } from '../models/rfidCard.model.js';
import { findAllStudents, findStudentById, normalizeStudentId, studentsCollection } from '../models/student.model.js';
import { HttpError } from '../utils/httpError.js';
import { auditInTransaction } from './audit.service.js';

const ALREADY_EXISTS = 6; // Firestore gRPC status
const INVALID_UID_MESSAGE = 'RFID UID must be 4-64 hexadecimal characters (0-9, A-F).';

const cardNotFound = () => new HttpError(404, 'rfid/not-found', 'This RFID card could not be found.');
const studentNotFound = () => new HttpError(404, 'students/not-found', 'This student could not be found.');
const conflict = (code, message) => new HttpError(409, code, message);

/** Parses a UID from a URL; 400 if it cannot be a UHF UID. */
export function parseRfidUid(value) {
  const uid = normalizeRfidUid(value);
  if (!uid) throw new HttpError(400, 'validation/invalid-rfid-uid', INVALID_UID_MESSAGE);
  return uid;
}

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');
const studentRef = (s) => (s ? { studentId: s.studentId, name: fullName(s), active: s.active } : null);

const cardTarget = (uid) => ({ type: 'rfidCard', id: uid });

/**
 * Registers a new card. With an optional `studentId` (the reader registration screen), the card
 * is registered AND assigned in the same transaction, with the same checks as assignCard():
 * the student must exist, be active and have no card. Either both happen or neither does.
 */
export async function registerCard(ctx, body) {
  const uid = normalizeRfidUid(body?.uid);
  if (!uid) {
    throw new HttpError(400, 'validation/invalid-rfid-uid', INVALID_UID_MESSAGE, { fields: { uid: INVALID_UID_MESSAGE } });
  }
  const hasStudent = body?.studentId !== undefined && body?.studentId !== null && body?.studentId !== '';
  const studentId = hasStudent ? normalizeStudentId(body.studentId) : null;
  if (hasStudent && !studentId) {
    throw new HttpError(400, 'validation/invalid-student-id', 'Invalid Student ID.', { fields: { studentId: 'Invalid Student ID.' } });
  }
  const duplicate = () => new HttpError(409, 'rfid/duplicate-uid', `RFID card ${uid} is already registered.`, {
    fields: { uid: 'This RFID card is already registered.' },
  });
  const ref = rfidCardsCollection().doc(uid);
  try {
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) throw duplicate();
      let target = null;
      if (studentId) {
        target = await readStudent(tx, studentId);
        if (!target.data) throw studentNotFound();
        if (!target.data.active) throw conflict('students/inactive', 'This student is inactive and cannot be given an RFID card.');
        const cardsOfStudent = await tx.get(rfidCardsCollection().where('studentId', '==', studentId));
        const otherUid = target.data.rfidCardUid ?? cardsOfStudent.docs[0]?.id;
        if (otherUid) {
          throw conflict('rfid/student-has-card', `Student ${studentId} already has RFID card ${otherUid}. Unassign it first.`);
        }
      }

      const fields = newCardFields(uid);
      tx.create(ref, studentId ? { ...fields, studentId, assignedAt: FieldValue.serverTimestamp() } : fields);
      auditInTransaction(tx, { ...ctx, eventType: 'rfid.card.registered', target: cardTarget(uid) });
      if (target) {
        tx.update(target.ref, { rfidCardUid: uid, updatedAt: FieldValue.serverTimestamp() });
        auditInTransaction(tx, { ...ctx, eventType: 'rfid.card.assigned', target: cardTarget(uid), details: { studentId } });
      }
    });
  } catch (err) {
    if (err?.code === ALREADY_EXISTS) throw duplicate();
    throw err;
  }
  return getCard(uid);
}

export async function listCards({ q, status, assignment } = {}) {
  const [cards, students] = await Promise.all([findAllCards(), findAllStudents()]);
  const studentsById = new Map(students.map((s) => [s.studentId, s]));
  const search = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const compactSearch = search.replace(/[\s:-]/g, '');

  return cards
    .filter((c) => (status === 'active' ? c.active : status === 'inactive' ? !c.active : true))
    .filter((c) => (assignment === 'assigned' ? Boolean(c.studentId) : assignment === 'unassigned' ? !c.studentId : true))
    .map((c) => ({ ...toCardView(c), student: studentRef(studentsById.get(c.studentId)) }))
    .filter((c) => {
      if (!search) return true;
      // UIDs are matched ignoring separators, the same way they are normalized.
      if (compactSearch && c.uid.toLowerCase().includes(compactSearch)) return true;
      const haystack = [c.studentId, c.student?.name].filter(Boolean).join(' ').toLowerCase();
      return search.split(/\s+/).every((term) => haystack.includes(term));
    });
}

export async function getCard(uid) {
  const card = await findCardByUid(uid);
  if (!card) throw cardNotFound();
  const [student, previousStudent] = await Promise.all([
    card.studentId ? findStudentById(card.studentId) : null,
    card.previousStudentId ? findStudentById(card.previousStudentId) : null,
  ]);
  return { ...toCardView(card), student: studentRef(student), previousStudent: studentRef(previousStudent) };
}

async function readStudent(tx, studentId) {
  const ref = studentsCollection().doc(studentId);
  const snapshot = await tx.get(ref);
  return { ref, data: snapshot.exists ? snapshot.data() : null };
}

/**
 * Assigns an active card to an active student. With `reassign`, moves a card that
 * is currently assigned to a different student; without it, an assigned card is
 * rejected (a card is never moved silently).
 */
export async function assignCard(ctx, uid, studentId, { reassign = false } = {}) {
  await db.runTransaction(async (tx) => {
    // All reads first (Firestore transactions require reads before writes).
    const cardRef = rfidCardsCollection().doc(uid);
    const cardSnapshot = await tx.get(cardRef);
    if (!cardSnapshot.exists) throw cardNotFound();
    const card = cardSnapshot.data();

    const target = await readStudent(tx, studentId);
    if (!target.data) throw studentNotFound();

    if (!card.active) throw conflict('rfid/card-inactive', 'This RFID card is inactive. Reactivate it before assigning.');
    if (!target.data.active) throw conflict('students/inactive', 'This student is inactive and cannot be given an RFID card.');
    if (card.studentId === studentId) throw conflict('rfid/already-assigned-to-student', 'This RFID card is already assigned to this student.');
    if (card.studentId && !reassign) {
      throw conflict('rfid/card-assigned', `This RFID card is already assigned to ${card.studentId}. Use Reassign to move it.`);
    }
    if (!card.studentId && reassign) throw conflict('rfid/not-assigned', 'This RFID card is not assigned. Use Assign instead.');

    // The student's pointer is the primary check; the query guards against drift.
    const cardsOfStudent = await tx.get(rfidCardsCollection().where('studentId', '==', studentId));
    const otherUid = target.data.rfidCardUid && target.data.rfidCardUid !== uid
      ? target.data.rfidCardUid
      : cardsOfStudent.docs.find((doc) => doc.id !== uid)?.id;
    if (otherUid) {
      throw conflict('rfid/student-has-card', `Student ${studentId} already has RFID card ${otherUid}. Unassign it first.`);
    }

    const previous = card.studentId ? await readStudent(tx, card.studentId) : null;

    const now = FieldValue.serverTimestamp();
    tx.update(cardRef, {
      studentId,
      assignedAt: now,
      updatedAt: now,
      ...(previous ? { previousStudentId: card.studentId, unassignedAt: now } : {}),
    });
    tx.update(target.ref, { rfidCardUid: uid, updatedAt: now });
    if (previous?.data?.rfidCardUid === uid) tx.update(previous.ref, { rfidCardUid: null, updatedAt: now });
    auditInTransaction(tx, {
      ...ctx,
      eventType: previous ? 'rfid.card.reassigned' : 'rfid.card.assigned',
      target: cardTarget(uid),
      details: previous ? { fromStudentId: card.studentId, toStudentId: studentId } : { studentId },
    });
  });
  return getCard(uid);
}

/** Takes the card off its student (card record and history are kept). */
export async function unassignCard(ctx, uid) {
  await db.runTransaction(async (tx) => {
    const cardRef = rfidCardsCollection().doc(uid);
    const snapshot = await tx.get(cardRef);
    if (!snapshot.exists) throw cardNotFound();
    const card = snapshot.data();
    if (!card.studentId) throw conflict('rfid/not-assigned', 'This RFID card is not assigned to any student.');
    const holder = await readStudent(tx, card.studentId);
    detach(tx, cardRef, card, holder, {});
    auditInTransaction(tx, { ...ctx, eventType: 'rfid.card.unassigned', target: cardTarget(uid), details: { studentId: card.studentId } });
  });
  return getCard(uid);
}

/** Deactivating also unassigns: an inactive card must never stay on a student (lost/damaged card). */
export async function deactivateCard(ctx, uid) {
  await db.runTransaction(async (tx) => {
    const cardRef = rfidCardsCollection().doc(uid);
    const snapshot = await tx.get(cardRef);
    if (!snapshot.exists) throw cardNotFound();
    const card = snapshot.data();
    if (!card.active) return; // already inactive: nothing to do (nothing to audit)
    if (card.studentId) {
      detach(tx, cardRef, card, await readStudent(tx, card.studentId), { active: false });
    } else {
      tx.update(cardRef, { active: false, updatedAt: FieldValue.serverTimestamp() });
    }
    auditInTransaction(tx, {
      ...ctx, eventType: 'rfid.card.deactivated', target: cardTarget(uid), details: { studentId: card.studentId ?? null },
    });
  });
  return getCard(uid);
}

/** Reactivated cards come back unassigned. */
export async function reactivateCard(ctx, uid) {
  await db.runTransaction(async (tx) => {
    const cardRef = rfidCardsCollection().doc(uid);
    if (!(await tx.get(cardRef)).exists) throw cardNotFound();
    tx.update(cardRef, { active: true, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, { ...ctx, eventType: 'rfid.card.reactivated', target: cardTarget(uid) });
  });
  return getCard(uid);
}

function detach(tx, cardRef, card, holder, extraCardFields) {
  const now = FieldValue.serverTimestamp();
  tx.update(cardRef, {
    ...extraCardFields,
    studentId: null,
    previousStudentId: card.studentId,
    unassignedAt: now,
    updatedAt: now,
  });
  if (holder.data?.rfidCardUid === card.uid) tx.update(holder.ref, { rfidCardUid: null, updatedAt: now });
}

/**
 * Resolves a raw UID reported by a UHF reader and says why it cannot be used when it can't.
 * Returns { uid, problem, card?, student? } where problem is one of
 * 'invalid-uid' | 'unknown' | 'inactive' | 'unassigned' | null (null = active, assigned card).
 * The caller decides what to do with inactive students.
 */
export async function resolveScannedUid(rawUid) {
  const uid = normalizeRfidUid(rawUid);
  if (!uid) return { uid: null, problem: 'invalid-uid' };
  const card = await findCardByUid(uid);
  if (!card) return { uid, problem: 'unknown' };
  if (!card.active) return { uid, problem: 'inactive' };
  // A card pointing at a missing student is treated as unassigned.
  const student = card.studentId ? await findStudentById(card.studentId) : null;
  if (!student) return { uid, problem: 'unassigned' };
  return { uid, problem: null, card: toCardView(card), student };
}

/**
 * For the attendance service: the ACTIVE, ASSIGNED card for a raw UID and its student.
 * Returns null for unknown, inactive, or unassigned cards.
 */
export async function findActiveAssignmentByUid(rawUid) {
  const { problem, card, student } = await resolveScannedUid(rawUid);
  return problem ? null : { card, student };
}
