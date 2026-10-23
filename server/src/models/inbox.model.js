// `users/{uid}/inbox/{notificationId}` document: one in-app notification (the bell) for one
// account. Written by the server when something happens (inbox.service.js); never by clients.
// The document ID is deterministic per event, so the same event never appears twice.
//
//   kind         string     see NOTIFICATION_KINDS (shared)
//   audience     string     parent | staff | admin; shown only while the account has a matching role
//   title        string     short headline, e.g. "Juan arrived at school"
//   body         string     one line of detail
//   link         string?    section the client opens: records | dismissal | rfid | dashboard
//   studentId    string?    parent items: shown only while that child is still linked to the parent
//   date         string?    YYYY-MM-DD the item is about (performance: the evaluation date)
//   notifiedAt   Timestamp  server time; newest first. Updated when an item is updated (it moves up).
//   createdAt    Timestamp
//
// Never stored here: dismissal codes, phone numbers, emails, observation text, account IDs of
// other people. `users/{uid}.notificationsSeenAt` (Timestamp) marks what the account has seen.
import { COLLECTIONS, NOTIFICATION_AUDIENCES, ROLES } from '@led/shared';
import { usersCollection } from './user.model.js';

export const inboxCollection = (uid) => usersCollection().doc(uid).collection(COLLECTIONS.USER_INBOX);

/** Audiences an account may see with its CURRENT verified role. */
export function audiencesFor(role) {
  if (role === ROLES.PARENT) return [NOTIFICATION_AUDIENCES.PARENT];
  if (role === ROLES.TEACHER) return [NOTIFICATION_AUDIENCES.STAFF];
  if (role === ROLES.ADMIN) return [NOTIFICATION_AUDIENCES.STAFF, NOTIFICATION_AUDIENCES.ADMIN];
  return [];
}

/**
 * ISO time cut DOWN to the millisecond. Stored times have microseconds and Timestamp.toDate()
 * rounds, which could make an item look newer than the "seen" marker or the bell's `after`.
 */
export function isoFloor(timestamp) {
  if (typeof timestamp?.seconds !== 'number') return null;
  return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1_000_000)).toISOString();
}

/** Shape returned to the owner of the inbox (explicit allow-list). */
export function toInboxView(id, data) {
  return {
    id,
    kind: data.kind,
    title: data.title,
    body: data.body ?? '',
    link: data.link ?? null,
    studentId: data.studentId ?? null,
    date: data.date ?? null,
    notifiedAt: isoFloor(data.notifiedAt),
  };
}
