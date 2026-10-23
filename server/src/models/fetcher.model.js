// `fetchers/{fetcherId}` document (auto ID): a person a parent authorizes to collect one or
// more of their children. A Fetcher has NO application account and NO role; they are
// verified at dismissal with a one-time code that the parent receives by SMS.
//
//   fetcherId     string    document ID
//   parentId      string    uid of the parent account that registered (owns) this Fetcher
//   fullName      string    e.g. "Maria Santos"
//   relationship  string    e.g. "Grandmother", "Aunt", "Family driver"
//   studentIds    string[]  the owning parent's children this Fetcher may collect
//   active        boolean   inactive Fetchers can never be used for dismissal
//   deactivatedAt Timestamp?
//   createdAt, updatedAt
//
// Invariant (checked by fetcher.service on every write, and again at dismissal time):
// every studentId is an active student whose parentIds contain parentId.
// No phone number or other contact data of the Fetcher is collected.
import { COLLECTIONS, MAX_FETCHER_NAME_LENGTH, MAX_FETCHER_RELATIONSHIP_LENGTH } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';
import { normalizeStudentId } from './student.model.js';

export const fetchersCollection = () => db.collection(COLLECTIONS.FETCHERS);

// Firestore auto IDs: 20 letters/digits. Anything else cannot be a Fetcher ID.
export const FETCHER_ID_PATTERN = /^[A-Za-z0-9]{20}$/;

// Letters (any language), spaces, periods, apostrophes and hyphens.
const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;
const MAX_CHILDREN = 10;

const cleanText = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

function validateFullName(value) {
  const name = cleanText(value);
  if (!name) return { error: 'Full name is required.' };
  if (name.length < 2 || name.length > MAX_FETCHER_NAME_LENGTH) {
    return { error: `Full name must be 2-${MAX_FETCHER_NAME_LENGTH} characters.` };
  }
  if (!NAME_PATTERN.test(name)) return { error: 'Full name may only contain letters, spaces, periods, apostrophes and hyphens.' };
  return { value: name };
}

function validateRelationship(value) {
  const text = cleanText(value);
  if (!text) return { error: 'Relationship is required.' };
  if (text.length > MAX_FETCHER_RELATIONSHIP_LENGTH) {
    return { error: `Relationship must be ${MAX_FETCHER_RELATIONSHIP_LENGTH} characters or fewer.` };
  }
  if (!NAME_PATTERN.test(text)) return { error: 'Relationship may only contain letters, spaces, periods, apostrophes and hyphens.' };
  return { value: text };
}

/** Shape only; ownership of each child is checked by the service. */
function validateStudentIds(value) {
  if (!Array.isArray(value) || value.length === 0) return { error: 'Select at least one child.' };
  const ids = [...new Set(value.map(normalizeStudentId))];
  if (ids.includes(null)) return { error: 'One or more selected children are invalid.' };
  if (ids.length > MAX_CHILDREN) return { error: `Select at most ${MAX_CHILDREN} children.` };
  return { value: ids.sort() };
}

export const FETCHER_FIELDS = Object.freeze(['fullName', 'relationship', 'studentIds']);

const VALIDATORS = { fullName: validateFullName, relationship: validateRelationship, studentIds: validateStudentIds };

/** Same contract as validateStudentFields: { data, errors }; `partial` checks only given fields. */
export function validateFetcherFields(input, { partial = false } = {}) {
  const data = {};
  const errors = {};
  for (const field of FETCHER_FIELDS) {
    if (partial && !(field in input)) continue;
    const result = VALIDATORS[field](input[field]);
    if (result.error) errors[field] = result.error;
    else data[field] = result.value;
  }
  return { data, errors };
}

export async function findFetcherById(fetcherId) {
  const snapshot = await fetchersCollection().doc(fetcherId).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function findFetchersByParent(parentUid) {
  const snapshot = await fetchersCollection().where('parentId', '==', parentUid).get();
  return snapshot.docs.map((doc) => doc.data());
}

export async function findAllFetchers() {
  const snapshot = await fetchersCollection().get();
  return snapshot.docs.map((doc) => doc.data());
}

/** True only if this Fetcher may collect this student for this parent right now. */
export function fetcherAuthorizedFor(fetcher, student) {
  return Boolean(
    fetcher?.active === true
    && student?.active === true
    && fetcher.studentIds?.includes(student.studentId)
    && student.parentIds?.includes(fetcher.parentId),
  );
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

/** What the owning parent (and staff) see. */
export function toFetcherView(f) {
  return {
    fetcherId: f.fetcherId,
    fullName: f.fullName,
    relationship: f.relationship,
    studentIds: f.studentIds ?? [],
    active: f.active,
    createdAt: iso(f.createdAt),
    updatedAt: iso(f.updatedAt),
    deactivatedAt: iso(f.deactivatedAt),
  };
}
