// UHF RFID card UID helpers shared by client and server (the server is the authority).
//
// UHF readers report the tag's EPC/TID, which is binary data shown as hexadecimal.
// Readers differ in formatting (case, spaces, ":" or "-" separators), so every UID
// is normalized to one canonical form before it is stored or looked up:
//   " 3008 33b2-ddd9:01c4 0a00 0001 " -> "300833B2DDD901C40A000001"
// No fixed length is assumed (EPC lengths vary by tag); 4-64 hex characters.
// The normalized UID is also the Firestore document ID of rfidCards/{uid}.

export const RFID_UID_PATTERN = /^[0-9A-F]{4,64}$/;

/** Returns the canonical UID, or null if the input is not a plausible UHF UID. */
export function normalizeRfidUid(value) {
  if (typeof value !== 'string') return null;
  const uid = value.replace(/[\s:-]/g, '').toUpperCase();
  return RFID_UID_PATTERN.test(uid) ? uid : null;
}
