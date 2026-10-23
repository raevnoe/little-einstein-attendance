// What a reader scan means on the RFID card registration screen. UHF readers can read a card
// several times and can also pick up OTHER cards within range (e.g. a pile of new cards on the
// desk), so the screen never silently swaps the card being registered:
//   - the same card read again is ignored;
//   - a DIFFERENT card while one is being registered is reported as "multiple" - the admin
//     must start over with only one card near the reader;
//   - the card that was just registered is ignored until another card is scanned (it is often
//     still lying on the reader).
// The server stays the authority: it re-validates the UID and refuses duplicates.
import { normalizeRfidUid } from '@led/shared';

/**
 * `current`: normalized UID of the card on screen (null when waiting).
 * `lastSaved`: normalized UID of the card registered last (null if none).
 * Returns { kind: 'new' | 'ignore' | 'multiple' | 'invalid', uid }.
 */
export function classifyRegistrationScan({ current = null, lastSaved = null }, rawUid) {
  const uid = normalizeRfidUid(rawUid);
  if (current) {
    if (!uid || uid === current) return { kind: 'ignore', uid };
    return { kind: 'multiple', uid };
  }
  if (!uid) return { kind: 'invalid', uid: null };
  if (uid === lastSaved) return { kind: 'ignore', uid };
  return { kind: 'new', uid };
}
