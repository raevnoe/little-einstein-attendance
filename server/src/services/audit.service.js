// Audit recording. Two ways to write an entry (developer decision, Phase 11):
//
//   auditInTransaction(tx, event)  - inside the SAME Firestore transaction as the change it
//       describes. If the audit write fails, the whole transaction fails and nothing commits,
//       so a committed change always has its audit entry.
//   recordAudit(event, options)    - best effort, for security events and rejected scans that
//       change nothing. Never throws; a failure is logged without any event details.
//
// The actor always comes from the verified request (auditContext), never from a request body.
// Firebase Authentication changes cannot join a Firestore transaction; see userAccount.service.
import { auditLogsCollection, buildAuditEntry } from '../models/auditLog.model.js';

export const SYSTEM_ACTOR = Object.freeze({ type: 'system' });
export const CLI_ACTOR = Object.freeze({ type: 'cli' });

// Duplicate suppression windows (developer decision, Phase 11).
export const UNKNOWN_SCAN_WINDOW_MS = 10 * 60_000;
export const ACCESS_DENIED_WINDOW_MS = 5 * 60_000;
const MAX_SUPPRESSION_KEYS = 1000;

/**
 * { actor, route } for an authenticated request. The role is the profile role that
 * requireRole already checked against the token's custom claim.
 */
export function auditContext(req) {
  return {
    actor: { type: 'user', uid: req.user?.uid ?? null, role: req.profile?.role ?? req.user?.role ?? null },
    route: routeOf(req),
  };
}

/** "POST /api/rfid-cards/:uid/assign" - the route PATTERN, never the real URL or query. */
export function routeOf(req) {
  return `${req.method} ${req.baseUrl ?? ''}${req.route?.path ?? ''}`;
}

/** Adds the audit entry to `tx`. Must be called after all of the transaction's reads. */
export function auditInTransaction(tx, event) {
  tx.create(auditLogsCollection().doc(), buildAuditEntry(event));
}

// ---- best effort, with bounded duplicate suppression

const suppressedUntil = new Map(); // key -> expiry (ms); Map order = insertion order

function claimKey(key, windowMs, nowMs) {
  const until = suppressedUntil.get(key);
  if (until !== undefined && until > nowMs) return false;
  suppressedUntil.delete(key);
  if (suppressedUntil.size >= MAX_SUPPRESSION_KEYS) {
    for (const [k, expiry] of suppressedUntil) if (expiry <= nowMs) suppressedUntil.delete(k);
    // Still full: forget the oldest key (worst case one extra entry is written later).
    while (suppressedUntil.size >= MAX_SUPPRESSION_KEYS) suppressedUntil.delete(suppressedUntil.keys().next().value);
  }
  suppressedUntil.set(key, nowMs + windowMs);
  return true;
}

/**
 * Best-effort write. With `suppressKey`, the same key is recorded at most once per
 * `windowMs` (keys must include everything that makes two events materially different).
 * Returns true if an entry was written.
 */
export async function recordAudit(event, { suppressKey, windowMs = 0 } = {}) {
  let entry;
  try {
    entry = buildAuditEntry(event);
  } catch (err) {
    console.error(`[audit] invalid audit event: ${err.message}`);
    return false;
  }
  if (suppressKey && !claimKey(suppressKey, windowMs, Date.now())) return false;
  try {
    await auditLogsCollection().doc().create(entry);
    return true;
  } catch (err) {
    if (suppressKey) suppressedUntil.delete(suppressKey); // let the next occurrence try again
    console.error(`[audit] could not record ${entry.eventType} (${err?.code ?? 'error'})`);
    return false;
  }
}

/** Automated tests only. */
export function resetAuditSuppressionForTests() {
  suppressedUntil.clear();
}
