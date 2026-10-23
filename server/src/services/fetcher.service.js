// Fetcher management. Parents manage ONLY their own Fetchers, and may authorize a Fetcher
// only for their own active children. Ownership is always decided from the verified caller's
// uid; a parentId in a request body is never accepted. Admins can view every Fetcher and
// deactivate one (e.g. when the school is told a person must no longer collect a child).
// Audit (Phase 11): every change is written with its audit entry in ONE transaction. Entries
// record changed field NAMES and child IDs only, never the Fetcher's name or relationship.
import { MAX_ACTIVE_FETCHERS_PER_PARENT } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import {
  FETCHER_FIELDS,
  FETCHER_ID_PATTERN,
  fetchersCollection,
  findAllFetchers,
  findFetcherById,
  findFetchersByParent,
  toFetcherView,
  validateFetcherFields,
} from '../models/fetcher.model.js';
import { findStudentsByParent, studentsCollection } from '../models/student.model.js';
import { findUsersByIds } from '../models/user.model.js';
import { db } from '../config/firebaseAdmin.js';
import { HttpError } from '../utils/httpError.js';
import { auditInTransaction } from './audit.service.js';
import { recordOwnershipDenied } from './student.service.js';

// Same message whether the Fetcher does not exist or belongs to another parent.
const FETCHER_NOT_FOUND = () => new HttpError(404, 'fetchers/not-found', 'This Fetcher could not be found.');
const invalid = (fields) => new HttpError(400, 'validation/invalid-fetcher', 'Please correct the highlighted fields.', { fields });

const fullName = (s) => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(' ');

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/** parentId, active, timestamps, etc. are decided by the server and are rejected if sent. */
function rejectUnknownFields(body) {
  const unknown = Object.keys(body).filter((key) => !FETCHER_FIELDS.includes(key));
  if (unknown.length) {
    throw new HttpError(400, 'validation/unknown-fields', `These fields cannot be set: ${unknown.join(', ')}.`);
  }
}

/** Parses a Fetcher ID from a URL; 404 (not 400) so probing reveals nothing. */
export function parseFetcherId(value) {
  if (typeof value !== 'string' || !FETCHER_ID_PATTERN.test(value)) throw FETCHER_NOT_FOUND();
  return value;
}

/** Every selected child must be an active student linked to this parent. */
async function assertOwnChildren(parentUid, studentIds) {
  const own = new Set((await findStudentsByParent(parentUid)).filter((s) => s.active).map((s) => s.studentId));
  if (!studentIds.every((id) => own.has(id))) {
    throw invalid({ studentIds: 'Select only your own children.' });
  }
}

async function ownFetcher(parentUid, fetcherId) {
  const fetcher = await findFetcherById(fetcherId);
  if (fetcher && fetcher.parentId !== parentUid) await recordOwnershipDenied(parentUid, 'fetcher', fetcherId);
  if (!fetcher || fetcher.parentId !== parentUid) throw FETCHER_NOT_FOUND();
  return fetcher;
}

const byActiveThenName = (a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName);

export async function listOwnFetchers(parentUid) {
  return (await findFetchersByParent(parentUid)).sort(byActiveThenName).map(toFetcherView);
}

/** `ctx` = auditContext(req) of the parent; `parentUid` is that same verified parent. */
export async function createFetcher(ctx, parentUid, input) {
  const body = asObject(input);
  rejectUnknownFields(body);
  const { data, errors } = validateFetcherFields(body);
  if (Object.keys(errors).length) throw invalid(errors);
  await assertOwnChildren(parentUid, data.studentIds);

  const activeCount = (await findFetchersByParent(parentUid)).filter((f) => f.active).length;
  if (activeCount >= MAX_ACTIVE_FETCHERS_PER_PARENT) {
    throw new HttpError(409, 'fetchers/limit-reached',
      `You can have at most ${MAX_ACTIVE_FETCHERS_PER_PARENT} active Fetchers. Deactivate one first.`);
  }

  const ref = fetchersCollection().doc();
  await db.runTransaction(async (tx) => {
    tx.create(ref, {
      fetcherId: ref.id,
      parentId: parentUid,
      ...data,
      active: true,
      deactivatedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, {
      ...ctx, eventType: 'fetcher.created', target: { type: 'fetcher', id: ref.id }, details: { studentIds: data.studentIds },
    });
  });
  return toFetcherView(await findFetcherById(ref.id));
}

export async function updateFetcher(ctx, parentUid, fetcherId, input) {
  const body = asObject(input);
  rejectUnknownFields(body);
  const { data, errors } = validateFetcherFields(body, { partial: true });
  if (Object.keys(errors).length) throw invalid(errors);
  if (Object.keys(data).length === 0) throw new HttpError(400, 'validation/empty-update', 'No changes were provided.');

  const fetcher = await ownFetcher(parentUid, fetcherId);
  if (!fetcher.active) {
    throw new HttpError(409, 'fetchers/inactive', 'This Fetcher has been deactivated and can no longer be edited.');
  }
  if (data.studentIds) await assertOwnChildren(parentUid, data.studentIds);

  const changedFields = Object.keys(data).filter((key) => JSON.stringify(fetcher[key]) !== JSON.stringify(data[key]));
  await db.runTransaction(async (tx) => {
    tx.update(fetchersCollection().doc(fetcherId), { ...data, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, {
      ...ctx,
      eventType: 'fetcher.updated',
      target: { type: 'fetcher', id: fetcherId },
      details: { changedFields, studentIds: data.studentIds ?? fetcher.studentIds },
    });
  });
  return toFetcherView(await findFetcherById(fetcherId));
}

async function deactivate(ctx, fetcher, by) {
  await db.runTransaction(async (tx) => {
    tx.update(fetchersCollection().doc(fetcher.fetcherId), {
      active: false,
      deactivatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    auditInTransaction(tx, {
      ...ctx, eventType: 'fetcher.deactivated', target: { type: 'fetcher', id: fetcher.fetcherId },
      details: { by, studentIds: fetcher.studentIds },
    });
  });
  return toFetcherView(await findFetcherById(fetcher.fetcherId));
}

/**
 * Deactivation keeps the record (dismissal history refers to it). A deactivated Fetcher can
 * never be used again: any code already sent for them fails at verification.
 */
export async function deactivateOwnFetcher(ctx, parentUid, fetcherId) {
  const fetcher = await ownFetcher(parentUid, fetcherId);
  return fetcher.active ? deactivate(ctx, fetcher, 'parent') : toFetcherView(fetcher);
}

export async function adminDeactivateFetcher(ctx, fetcherId) {
  const fetcher = await findFetcherById(fetcherId);
  if (!fetcher) throw FETCHER_NOT_FOUND();
  return fetcher.active ? deactivate(ctx, fetcher, 'admin') : toFetcherView(fetcher);
}

/** Admin view: every Fetcher with the owning parent's name and the children's names. */
export async function listAllFetchers({ status } = {}) {
  const wantActive = status === 'active' ? true : status === 'inactive' ? false : null;
  const fetchers = (await findAllFetchers()).filter((f) => wantActive === null || f.active === wantActive);
  const parentIds = [...new Set(fetchers.map((f) => f.parentId))];
  const studentIds = [...new Set(fetchers.flatMap((f) => f.studentIds ?? []))];
  const [parents, studentSnaps] = await Promise.all([
    findUsersByIds(parentIds),
    studentIds.length ? db.getAll(...studentIds.map((id) => studentsCollection().doc(id))) : [],
  ]);
  const parentNames = new Map(parents.map((p) => [p.uid, p.displayName]));
  const students = new Map(studentSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()]));

  return fetchers.sort(byActiveThenName).map((f) => ({
    ...toFetcherView(f),
    parentId: f.parentId,
    parentName: parentNames.get(f.parentId) ?? null,
    students: (f.studentIds ?? []).map((id) => {
      const s = students.get(id);
      return {
        studentId: id,
        name: s ? fullName(s) : null,
        active: s?.active ?? false,
        // The link counts only while the owning parent is still linked to the child.
        parentLinked: Boolean(s?.parentIds?.includes(f.parentId)),
      };
    }),
  }));
}
