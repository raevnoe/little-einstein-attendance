// Cloud Firestore collection names. Use these constants instead of string literals.
export const COLLECTIONS = Object.freeze({
  USERS: 'users',
  STUDENTS: 'students',
  RFID_CARDS: 'rfidCards',
  ATTENDANCE: 'attendance',
  PERFORMANCE: 'performance',
  FETCHERS: 'fetchers',
  DISMISSAL_RECORDS: 'dismissalRecords',
  ANNOUNCEMENTS: 'announcements',
  NOTIFICATIONS: 'notifications', // SMS records (server only)
  AUDIT_LOGS: 'auditLogs',
  SYSTEM_SETTINGS: 'systemSettings',
  // Subcollection users/{uid}/inbox: in-app notifications for that account (the bell).
  USER_INBOX: 'inbox',
});
