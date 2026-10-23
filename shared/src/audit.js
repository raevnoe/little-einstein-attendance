// Audit log constants shared by client and server (the server is the authority).
// Audit entries are written ONLY by the server; clients can read them only through the
// admin-only API, and nothing in the application updates or deletes them.

export const AUDIT_CATEGORIES = Object.freeze({
  AUTH: 'auth',
  ACCOUNT: 'account',
  STUDENT: 'student',
  RFID: 'rfid',
  ATTENDANCE: 'attendance',
  PERFORMANCE: 'performance',
  FETCHER: 'fetcher',
  DISMISSAL: 'dismissal',
  SMS: 'sms',
});

export const AUDIT_CATEGORY_LABELS = Object.freeze({
  auth: 'Access',
  account: 'User accounts',
  student: 'Students',
  rfid: 'RFID cards & scans',
  attendance: 'Attendance',
  performance: 'Performance Evaluation',
  fetcher: 'Fetchers',
  dismissal: 'Dismissal Verification',
  sms: 'SMS',
});

export const AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure',
  DENIED: 'denied',
});

export const AUDIT_TARGET_TYPES = Object.freeze(['user', 'student', 'rfidCard', 'attendance', 'performance', 'fetcher', 'dismissal', 'route']);

// eventType -> { category, label }. Every event the server can record is listed here.
export const AUDIT_EVENTS = Object.freeze({
  'auth.access-denied': { category: 'auth', label: 'Access denied' },
  'auth.ownership-denied': { category: 'auth', label: 'Parent tried to open another family’s record' },

  'user.created': { category: 'account', label: 'User account created' },
  'user.role-changed': { category: 'account', label: 'Role changed' },
  'user.deactivated': { category: 'account', label: 'Account deactivated' },
  'user.reactivated': { category: 'account', label: 'Account reactivated' },
  'user.mobile-number-changed': { category: 'account', label: 'Parent mobile number changed' },

  'student.created': { category: 'student', label: 'Student created' },
  'student.updated': { category: 'student', label: 'Student updated' },
  'student.deactivated': { category: 'student', label: 'Student deactivated' },
  'student.reactivated': { category: 'student', label: 'Student reactivated' },

  'rfid.card.registered': { category: 'rfid', label: 'RFID card registered' },
  'rfid.card.assigned': { category: 'rfid', label: 'RFID card assigned' },
  'rfid.card.reassigned': { category: 'rfid', label: 'RFID card reassigned' },
  'rfid.card.unassigned': { category: 'rfid', label: 'RFID card unassigned' },
  'rfid.card.deactivated': { category: 'rfid', label: 'RFID card deactivated' },
  'rfid.card.reactivated': { category: 'rfid', label: 'RFID card reactivated' },
  'rfid.scan.rejected': { category: 'rfid', label: 'RFID scan not recorded' },

  'attendance.time-in': { category: 'attendance', label: 'Time in recorded' },
  'attendance.time-out': { category: 'attendance', label: 'Time out recorded' },

  'performance.created': { category: 'performance', label: 'Evaluation created' },
  'performance.updated': { category: 'performance', label: 'Evaluation updated' },

  'fetcher.created': { category: 'fetcher', label: 'Fetcher added' },
  'fetcher.updated': { category: 'fetcher', label: 'Fetcher updated' },
  'fetcher.deactivated': { category: 'fetcher', label: 'Fetcher deactivated' },

  'dismissal.code-requested': { category: 'dismissal', label: 'Dismissal code requested' },
  'dismissal.verify-failed': { category: 'dismissal', label: 'Dismissal code not accepted' },
  'dismissal.verified': { category: 'dismissal', label: 'Dismissal code verified' },
  'dismissal.released': { category: 'dismissal', label: 'Child released to Fetcher' },
  'dismissal.release-failed': { category: 'dismissal', label: 'Release not completed' },

  'sms.attendance-notification': { category: 'sms', label: 'Attendance SMS' },
});

export const AUDIT_EVENT_TYPES = Object.freeze(Object.keys(AUDIT_EVENTS));

export const auditEventLabel = (type) => AUDIT_EVENTS[type]?.label ?? type;

export const AUDIT_DEFAULT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 100;
// Hard cap on audit documents read by ONE viewer request (filters are applied in memory).
export const AUDIT_MAX_SCAN = 2000;
export const AUDIT_DEFAULT_RANGE_DAYS = 7;
