// Student constants shared by client and server. The server is the authority;
// the client uses these only for form options and hints.

export const GENDERS = Object.freeze(['Male', 'Female']);

// School-assigned Student ID, e.g. K2026-001. NOT the RFID UID.
// 3-20 characters: uppercase letters, digits and hyphens; no leading/trailing hyphen.
// It is also the Firestore document ID, so it must never contain "/".
export const STUDENT_ID_PATTERN = /^[A-Z0-9](?:[A-Z0-9-]{1,18}[A-Z0-9])$/;

export const MAX_PARENTS_PER_STUDENT = 4;
