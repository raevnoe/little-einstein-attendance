// Fetcher and Dismissal Verification constants shared by client and server (the server is
// the authority). A Fetcher is a person a parent authorizes to collect a child; Fetchers
// have NO application account. Release is verified with a one-time code (OTP) that the
// server texts to the parent, who gives it to the Fetcher.

export const MAX_FETCHER_NAME_LENGTH = 80;
export const MAX_FETCHER_RELATIONSHIP_LENGTH = 40;
export const MAX_ACTIVE_FETCHERS_PER_PARENT = 10;

// Choices offered in the Fetcher form (plus "Other", where the parent types it). The server does
// not restrict the value to this list: any relationship that passes validation is accepted.
export const FETCHER_RELATIONSHIPS = Object.freeze([
  'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Older sibling', 'Cousin',
  'Godparent', 'Nanny', 'Household helper', 'Family driver', 'School service driver', 'Family friend', 'Neighbor',
]);

export const DISMISSAL_OTP_LENGTH = 6;
export const DISMISSAL_OTP_PATTERN = /^\d{6}$/;

// Defaults. The live values are systemSettings/dismissal (see the server model).
export const DEFAULT_DISMISSAL_OTP_EXPIRY_MINUTES = 10;
export const DEFAULT_DISMISSAL_OTP_MAX_ATTEMPTS = 5;

// Stored on dismissalRecords/{studentId}_{schoolDate}. An awaiting-verification record past
// its expiry time is SHOWN as expired, and is stored as expired once someone tries to use it.
export const DISMISSAL_STATUS = Object.freeze({
  SENDING: 'sending', // code generated, SMS not yet accepted (not usable)
  AWAITING_VERIFICATION: 'awaiting-verification', // SMS accepted; the teacher may verify
  SMS_FAILED: 'sms-failed', // SMS not accepted; code discarded
  LOCKED: 'locked', // too many incorrect codes; code discarded
  EXPIRED: 'expired', // code too old; code discarded
  CANCELLED: 'cancelled', // Fetcher deactivated/changed/no longer authorized; code discarded
  VERIFIED: 'verified', // correct code entered; waiting for the teacher to confirm handover
  RELEASED: 'released', // teacher confirmed the child was handed over (final)
});

export const DISMISSAL_STATUS_LABELS = Object.freeze({
  [DISMISSAL_STATUS.SENDING]: 'Sending code',
  [DISMISSAL_STATUS.AWAITING_VERIFICATION]: 'Waiting for teacher',
  [DISMISSAL_STATUS.SMS_FAILED]: 'SMS not sent',
  [DISMISSAL_STATUS.LOCKED]: 'Locked',
  [DISMISSAL_STATUS.EXPIRED]: 'Code expired',
  [DISMISSAL_STATUS.CANCELLED]: 'Cancelled',
  [DISMISSAL_STATUS.VERIFIED]: 'Verified',
  [DISMISSAL_STATUS.RELEASED]: 'Released',
});
