// Admin-only, read-only audit log viewer (Phase 11): GET /api/admin/audit-logs.
//
// Query strategy (developer decision): ONE single-field range query on `occurredAt` (newest
// first, no composite index needed), read in batches; the other filters are applied in memory.
// A request reads at most AUDIT_MAX_SCAN documents. When that cap is reached before the page is
// full, the response says so (`scanLimitReached`) and returns a cursor to continue from.
import {
  AUDIT_CATEGORIES,
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_DEFAULT_RANGE_DAYS,
  AUDIT_EVENT_TYPES,
  AUDIT_MAX_PAGE_SIZE,
  AUDIT_MAX_SCAN,
  AUDIT_OUTCOMES,
  AUDIT_TARGET_TYPES,
} from '@led/shared';
import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env.js';
import { AUDIT_ID_PATTERN, auditLogsCollection, toAuditView } from '../models/auditLog.model.js';
import { UID_PATTERN, findUsersByIds } from '../models/user.model.js';
import { addDays, schoolDateOf, startOfSchoolDay } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';
import { parseDateRange, readQuery } from './report.service.js';

const BATCH_SIZE = 200;
const TARGET_ID_PATTERN = /^[\w .:/-]{1,128}$/;

const badRequest = (code, message) => new HttpError(400, code, message);

function oneOf(value, allowed, name) {
  if (value === undefined) return null;
  if (!allowed.includes(value)) throw badRequest('validation/invalid-parameter', `The "${name}" filter is invalid.`);
  return value;
}

function matching(value, pattern, name) {
  if (value === undefined) return null;
  if (!pattern.test(value)) throw badRequest('validation/invalid-parameter', `The "${name}" filter is invalid.`);
  return value;
}

function parseLimit(value) {
  if (value === undefined) return AUDIT_DEFAULT_PAGE_SIZE;
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > AUDIT_MAX_PAGE_SIZE) {
    throw badRequest('validation/invalid-limit', `limit must be a whole number from 1 to ${AUDIT_MAX_PAGE_SIZE}.`);
  }
  return n;
}

/** Validates the query. Default range: the last AUDIT_DEFAULT_RANGE_DAYS days including today. */
export function parseAuditQuery(query, today = schoolDateOf()) {
  const q = readQuery(query, ['from', 'to', 'category', 'eventType', 'outcome', 'actorUid', 'targetType', 'targetId', 'limit', 'cursor']);
  const range = parseDateRange(
    q.from || q.to ? q : { from: addDays(today, -(AUDIT_DEFAULT_RANGE_DAYS - 1)), to: today },
    today,
  );
  return {
    from: range.from,
    to: range.to,
    filters: {
      category: oneOf(q.category, Object.values(AUDIT_CATEGORIES), 'category'),
      eventType: oneOf(q.eventType, AUDIT_EVENT_TYPES, 'eventType'),
      outcome: oneOf(q.outcome, Object.values(AUDIT_OUTCOMES), 'outcome'),
      actorUid: matching(q.actorUid, UID_PATTERN, 'actorUid'),
      targetType: oneOf(q.targetType, AUDIT_TARGET_TYPES, 'targetType'),
      targetId: matching(q.targetId, TARGET_ID_PATTERN, 'targetId'),
    },
    limit: parseLimit(q.limit),
    cursor: matching(q.cursor, AUDIT_ID_PATTERN, 'cursor'),
  };
}

function matchesFilters(entry, f) {
  return (!f.category || entry.category === f.category)
    && (!f.eventType || entry.eventType === f.eventType)
    && (!f.outcome || entry.outcome === f.outcome)
    && (!f.actorUid || entry.actor?.uid === f.actorUid)
    && (!f.targetType || entry.target?.type === f.targetType)
    && (!f.targetId || entry.target?.id === f.targetId);
}

/**
 * GET /api/admin/audit-logs?from&to&category&eventType&outcome&actorUid&targetType&targetId&limit&cursor
 * Newest first. `nextCursor` is null when there is nothing more in the date range.
 */
export async function listAuditLogs(query) {
  const { from, to, filters, limit, cursor } = parseAuditQuery(query);
  const start = Timestamp.fromMillis(startOfSchoolDay(from));
  const end = Timestamp.fromMillis(startOfSchoolDay(addDays(to, 1)));
  const base = auditLogsCollection()
    .where('occurredAt', '>=', start)
    .where('occurredAt', '<', end)
    .orderBy('occurredAt', 'desc');

  let last = null;
  if (cursor) {
    last = await auditLogsCollection().doc(cursor).get();
    if (!last.exists) throw badRequest('validation/invalid-cursor', 'This page link has expired. Search again.');
  }

  const page = [];
  let scanned = 0;
  let more = true; // false once the range is fully read
  while (page.length < limit && scanned < AUDIT_MAX_SCAN && more) {
    const take = Math.min(BATCH_SIZE, AUDIT_MAX_SCAN - scanned);
    const snapshot = await (last ? base.startAfter(last) : base).limit(take).get();
    const docs = snapshot.docs;
    if (docs.length < take) more = false;
    for (let i = 0; i < docs.length; i += 1) {
      scanned += 1;
      last = docs[i];
      if (matchesFilters(docs[i].data(), filters)) page.push(docs[i]);
      if (page.length === limit) {
        if (i < docs.length - 1) more = true; // unread documents remain in this batch
        break;
      }
    }
  }

  const scanLimitReached = more && page.length < limit && scanned >= AUDIT_MAX_SCAN;
  const uids = [...new Set(page.map((d) => d.data().actor?.uid).filter(Boolean))];
  const names = new Map((await findUsersByIds(uids)).map((u) => [u.uid, u.displayName]));

  return {
    from,
    to,
    today: schoolDateOf(),
    timeZone: env.schoolTimeZone,
    filters,
    entries: page.map((d) => toAuditView(d.id, d.data(), names)),
    nextCursor: more && last ? last.id : null,
    scanned,
    scanLimitReached,
    maxScan: AUDIT_MAX_SCAN,
  };
}
