// `auditLogs/{autoId}` document: one important security or operational event.
//
//   eventType   string    key of AUDIT_EVENTS (shared/src/audit.js)
//   category    string    from AUDIT_EVENTS[eventType]
//   outcome     string    success | failure | denied
//   occurredAt  Timestamp server time of the event (exact)
//   schoolDate  string    "YYYY-MM-DD" in the school's time zone (a DATE only, for display/filters)
//   actor       { type: user|system|cli, uid, role }   from the verified token + profile, never the request
//   target      { type, id } | null                      what the event is about
//   reason      string?   stable error/result code, e.g. "dismissal/incorrect-code"
//   details     object    small, allow-listed per event type (see DETAIL_FIELDS)
//   route       string?   method + route PATTERN, e.g. "POST /api/rfid-cards/:uid/assign"
//
// NEVER stored: passwords, tokens, Authorization headers, request bodies, OTPs or their
// hashes/salts, SMS text, provider secrets, phone numbers, emails, birth dates, observation
// text, Fetcher names, IP addresses or user agents. Only allow-listed detail fields are kept,
// and every string is checked again for anything that looks like a phone number or email.
//
// Firestore rules deny all client access and the API has no update/delete route, but these
// records are NOT tamper-proof: anyone with the service account or Firebase console access
// can change or delete them. There is no automatic deletion; the school decides retention.
import { AUDIT_EVENTS, AUDIT_OUTCOMES, AUDIT_TARGET_TYPES, COLLECTIONS } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { schoolDateOf } from '../utils/schoolDate.js';

export const auditLogsCollection = () => db.collection(COLLECTIONS.AUDIT_LOGS);

export const AUDIT_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

const RFID = ['studentId', 'fromStudentId', 'toStudentId'];
const DISMISSAL = ['studentId', 'fetcherId', 'requestNumber', 'attemptsRemaining', 'smsStatus', 'smsErrorCode'];
const PERFORMANCE = ['studentId', 'evaluationDate', 'area', 'starRating', 'previousStarRating', 'observationChanged'];
const FETCHER = ['changedFields', 'studentIds', 'by'];

// The ONLY detail fields kept for each event type.
const DETAIL_FIELDS = {
  'auth.access-denied': ['code'],
  'auth.ownership-denied': ['resource'],
  'user.created': ['role'],
  'user.role-changed': ['fromRole', 'toRole'],
  'user.deactivated': ['step'],
  'user.reactivated': ['step'],
  'user.mobile-number-changed': ['hasNumber'],
  'user.sections-changed': ['sections', 'count'],
  'user.sms-preference-changed': ['attendanceSms'],
  'user.signed-out-everywhere': [],
  'student.created': ['section', 'parentCount'],
  'student.updated': ['changedFields', 'parentsLinked', 'parentsUnlinked'],
  'student.deactivated': [],
  'student.reactivated': [],
  'section.added': ['section'],
  'section.removed': ['section'],
  'rfid.card.registered': [],
  'rfid.card.assigned': RFID,
  'rfid.card.reassigned': RFID,
  'rfid.card.unassigned': RFID,
  'rfid.card.deactivated': RFID,
  'rfid.card.reactivated': [],
  'rfid.scan.rejected': ['scanOutcome', 'studentId', 'source'],
  'attendance.time-in': ['studentId', 'schoolDate', 'source'],
  'attendance.time-out': ['studentId', 'schoolDate', 'source'],
  'performance.created': PERFORMANCE,
  'performance.updated': PERFORMANCE,
  'fetcher.created': FETCHER,
  'fetcher.updated': FETCHER,
  'fetcher.deactivated': FETCHER,
  'dismissal.code-requested': DISMISSAL,
  'dismissal.verify-failed': DISMISSAL,
  'dismissal.verified': DISMISSAL,
  'dismissal.released': DISMISSAL,
  'dismissal.release-failed': DISMISSAL,
  'sms.attendance-notification': ['event', 'studentId', 'status', 'sent', 'failed', 'skipped', 'errorCodes'],
  'settings.changed': ['group', 'changes'],
};

const MAX_TEXT = 100;
const MAX_LIST = 20;
// Defense in depth: a value that looks like a phone number or an email is never stored.
const PHONE_LIKE = /(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/g;

function safeText(value, max = MAX_TEXT) {
  const text = String(value).replace(CONTROL, ' ').trim().slice(0, max);
  return PHONE_LIKE.test(text) || EMAIL_LIKE.test(text) ? '[redacted]' : text;
}

// IDs (uids, Student IDs, RFID UIDs, document IDs) are server-validated identifiers: control
// characters and length only. The phone check would misfire on hex RFID UIDs.
function safeId(value) {
  return String(value).replace(CONTROL, '').trim().slice(0, 128);
}

// Detail fields that hold identifiers (see safeId).
const ID_KEYS = new Set(['studentId', 'fromStudentId', 'toStudentId', 'fetcherId', 'studentIds']);

function safeValue(value, isId = false) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return isId ? safeId(value) : safeText(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_LIST).filter((v) => typeof v === 'string' || typeof v === 'number').map((v) => safeValue(v, isId));
  }
  return undefined; // objects and anything else are dropped
}

/** Keeps only the allow-listed detail fields of `eventType`, as plain safe values. */
export function sanitizeDetails(eventType, details = {}) {
  const clean = {};
  for (const key of DETAIL_FIELDS[eventType] ?? []) {
    if (!(key in (details ?? {}))) continue;
    const value = safeValue(details[key], ID_KEYS.has(key));
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

function safeActor(actor) {
  const type = ['user', 'system', 'cli'].includes(actor?.type) ? actor.type : 'system';
  return {
    type,
    uid: type === 'user' && typeof actor.uid === 'string' ? safeId(actor.uid) : null,
    role: type === 'user' && typeof actor.role === 'string' ? safeText(actor.role, 20) : null,
  };
}

function safeTarget(target) {
  if (!target || !AUDIT_TARGET_TYPES.includes(target.type)) return null;
  return { type: target.type, id: target.id === undefined || target.id === null ? null : safeId(target.id) };
}

/**
 * The Firestore document for one event. Throws on an unknown event type or outcome (a
 * programming error, so it fails tests instead of writing an unclassified entry).
 */
export function buildAuditEntry({ eventType, outcome = AUDIT_OUTCOMES.SUCCESS, actor, target, reason, details, route }) {
  const definition = AUDIT_EVENTS[eventType];
  if (!definition) throw new Error(`Unknown audit event type: ${eventType}`);
  if (!Object.values(AUDIT_OUTCOMES).includes(outcome)) throw new Error(`Unknown audit outcome: ${outcome}`);
  return {
    eventType,
    category: definition.category,
    outcome,
    occurredAt: FieldValue.serverTimestamp(),
    schoolDate: schoolDateOf(),
    actor: safeActor(actor),
    target: safeTarget(target),
    reason: typeof reason === 'string' ? safeText(reason, 80) : null,
    details: sanitizeDetails(eventType, details),
    route: typeof route === 'string' ? safeText(route, 120) : null,
  };
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

/** API view for the admin audit viewer. `names` maps uid -> display name. */
export function toAuditView(id, entry, names = new Map()) {
  return {
    id,
    eventType: entry.eventType,
    category: entry.category,
    outcome: entry.outcome,
    occurredAt: iso(entry.occurredAt),
    schoolDate: entry.schoolDate,
    actor: { ...entry.actor, name: entry.actor?.uid ? names.get(entry.actor.uid) ?? null : null },
    target: entry.target ?? null,
    reason: entry.reason ?? null,
    details: entry.details ?? {},
    route: entry.route ?? null,
  };
}
