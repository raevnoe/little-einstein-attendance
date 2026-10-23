// `rfidCards/{uid}` document. The document ID is the NORMALIZED physical UHF RFID
// UID (see shared normalizeRfidUid), so Firestore guarantees UID uniqueness.
// The UID is a physical identifier; it is never a Student ID.
//
//   uid                string   normalized physical UID
//   studentId          string?  currently assigned student (null = unassigned)
//   previousStudentId  string?  last student the card was taken from (history)
//   active             boolean  inactive cards are never assigned and never valid for scanning
//   assignedAt         Timestamp? when the current assignment started
//   unassignedAt       Timestamp? when the card was last taken from a student
//   createdAt, updatedAt
//
// Invariant (kept by rfidCard.service transactions): if a card has a studentId it
// is active, and students/{studentId}.rfidCardUid points back to it.
import { COLLECTIONS } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';

export const rfidCardsCollection = () => db.collection(COLLECTIONS.RFID_CARDS);

export function newCardFields(uid) {
  return {
    uid,
    studentId: null,
    previousStudentId: null,
    active: true,
    assignedAt: null,
    unassignedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function findCardByUid(uid) {
  const snapshot = await rfidCardsCollection().doc(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function findAllCards() {
  const snapshot = await rfidCardsCollection().get();
  return snapshot.docs.map((doc) => doc.data());
}

/** unassigned | assigned | inactive */
export function cardStatus(card) {
  if (!card.active) return 'inactive';
  return card.studentId ? 'assigned' : 'unassigned';
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

export function toCardView(card) {
  return {
    uid: card.uid,
    studentId: card.studentId ?? null,
    previousStudentId: card.previousStudentId ?? null,
    active: card.active,
    status: cardStatus(card),
    assignedAt: iso(card.assignedAt),
    unassignedAt: iso(card.unassignedAt),
    createdAt: iso(card.createdAt),
    updatedAt: iso(card.updatedAt),
  };
}
