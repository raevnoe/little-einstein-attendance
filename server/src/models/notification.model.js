// `notifications/{attendanceId}_{event}_{recipientDigits}` document: one SMS to one phone
// number for one attendance event. The deterministic ID means the same event can never be
// sent twice to the same number, even if notification is requested twice. When no parent
// has a usable number, one `..._none` document records that the SMS was skipped.
//
//   studentId          string    school Student ID
//   parentIds          string[]  parent accounts that share this number
//   attendanceId       string    attendance/{attendanceId} that triggered it
//   event              string    arrival | departure
//   channel            string    sms
//   recipient          string?   +639XXXXXXXXX (null when skipped)
//   message            string    exact text sent
//   provider           string?   iprog | philsms | mock
//   providerMessageId  string?   provider's message uid, when returned
//   status             string    pending -> sent | failed ; or skipped
//                                "sent" = accepted by the provider, NOT confirmed delivery
//   error              {code, message, httpStatus?}?  server-side reason (never secrets), e.g.
//                      { code: 'http-error', httpStatus: 422, message: 'PhilSMS error (HTTP 422): Invalid recipient' }
//   createdAt, updatedAt
//
// These records are server-side only: no API returns them to parents.
import { COLLECTIONS } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

export const NOTIFICATION_EVENTS = Object.freeze({ ARRIVAL: 'arrival', DEPARTURE: 'departure' });
export const NOTIFICATION_STATUS = Object.freeze({ PENDING: 'pending', SENT: 'sent', FAILED: 'failed', SKIPPED: 'skipped' });

export const notificationsCollection = () => db.collection(COLLECTIONS.NOTIFICATIONS);

export const notificationDocId = (attendanceId, event, recipient) =>
  `${attendanceId}_${event}_${recipient ? recipient.replace(/\D/g, '') : 'none'}`;

/**
 * Status and creation time ONLY of the notifications created at or after `since` (a Timestamp).
 * select() means message text and phone numbers are not even read; used for admin counts.
 */
export async function findNotificationStatusesSince(since) {
  const snapshot = await notificationsCollection().where('createdAt', '>=', since).select('status', 'createdAt').get();
  return snapshot.docs.map((doc) => {
    const { status, createdAt } = doc.data();
    return { status, createdAt };
  });
}
