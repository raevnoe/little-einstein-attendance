// In-app notifications (the bell). Each account has its own inbox: users/{uid}/inbox.
// The server writes an item when something happens; the bell only asks for items newer than the
// newest one it already has.

// Who an item is for. An item is shown only while the account still has a matching role
// (e.g. staff items are hidden if a teacher account becomes a parent account).
export const NOTIFICATION_AUDIENCES = Object.freeze({
  PARENT: 'parent',
  STAFF: 'staff', // teachers and admins
  ADMIN: 'admin',
});

export const NOTIFICATION_KINDS = Object.freeze({
  // parent
  ARRIVAL: 'arrival',
  DEPARTURE: 'departure',
  DISMISSAL_CODE_SENT: 'dismissal-code-sent',
  DISMISSAL_SMS_FAILED: 'dismissal-sms-failed',
  DISMISSAL_RELEASED: 'dismissal-released',
  PERFORMANCE: 'performance',
  // staff (teachers and admins)
  DISMISSAL_REQUEST: 'dismissal-request',
  DISMISSAL_LOCKED: 'dismissal-locked',
  // admin
  RFID_SCAN_REJECTED: 'rfid-scan-rejected',
  SMS_PROBLEMS: 'sms-problems',
});

// The bell shows at most this many items (newest first).
export const NOTIFICATION_FEED_LIMIT = 30;
