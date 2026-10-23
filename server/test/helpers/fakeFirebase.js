// In-memory stand-in for the parts of the Firebase Admin SDK this API uses (Firestore +
// Auth token verification). Used only by automated tests through node:test module mocking,
// so the real config/firebaseAdmin.js (and real credentials) are never loaded.
//
// Firestore behaviour that matters for the tests is kept:
//   - create() on an existing document fails with code 6 (ALREADY_EXISTS)
//   - update() on a missing document fails with code 5 (NOT_FOUND)
//   - FieldValue.serverTimestamp() / FieldValue.delete() are honoured
//   - transactions are serialized (Firestore locks the documents a transaction reads), their
//     writes are applied only at commit, and a read after a write throws (as in Firestore)
import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const SERVER_TIMESTAMP = FieldValue.serverTimestamp();
const DELETE = FieldValue.delete();
const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const firestoreError = (code, message) => Object.assign(new Error(message), { code });

const RANGE_OPS = {
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
};

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value instanceof Timestamp) return value;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}

/** Applies sentinels: serverTimestamp -> now, delete -> remove the field. */
function resolveFields(target, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof FieldValue && value.isEqual(DELETE)) delete target[key];
    else if (value instanceof FieldValue && value.isEqual(SERVER_TIMESTAMP)) target[key] = Timestamp.now();
    else target[key] = clone(value);
  }
  return target;
}

function autoId() {
  return [...randomBytes(20)].map((b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join('');
}

function snapshot(id, data) {
  return { id, exists: data !== undefined, data: () => (data === undefined ? undefined : clone(data)) };
}

export function createFakeFirebase() {
  const store = new Map(); // collection -> Map(id -> data)
  const table = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };

  // Collections whose writes fail (to test how the app handles a failed audit write).
  const failing = new Set();
  const assertWritable = (ref) => {
    if (failing.has(ref._collection)) throw firestoreError(14, `UNAVAILABLE: ${ref.path}`);
  };

  // ---- writes (shared by direct calls and transaction commits)
  const write = {
    create(ref, data) {
      assertWritable(ref);
      if (table(ref._collection).has(ref.id)) throw firestoreError(6, `ALREADY_EXISTS: ${ref.path}`);
      table(ref._collection).set(ref.id, resolveFields({}, data));
    },
    set(ref, data, options) {
      assertWritable(ref);
      const base = options?.merge ? { ...table(ref._collection).get(ref.id) } : {};
      table(ref._collection).set(ref.id, resolveFields(base, data));
    },
    update(ref, data) {
      assertWritable(ref);
      const current = table(ref._collection).get(ref.id);
      if (!current) throw firestoreError(5, `NOT_FOUND: ${ref.path}`);
      table(ref._collection).set(ref.id, resolveFields({ ...current }, data));
    },
    delete(ref) {
      table(ref._collection).delete(ref.id);
    },
  };

  const readDoc = (ref) => snapshot(ref.id, table(ref._collection).get(ref.id));

  function docRef(collection, id) {
    const ref = {
      id,
      path: `${collection}/${id}`,
      _collection: collection,
      get: async () => readDoc(ref),
      create: async (data) => write.create(ref, data),
      set: async (data, options) => write.set(ref, data, options),
      update: async (data) => write.update(ref, data),
      delete: async () => write.delete(ref),
      // Subcollections are stored as their own table named by path, e.g. "users/u1/inbox".
      collection: (name) => collectionRef(`${collection}/${id}/${name}`),
    };
    return ref;
  }

  const comparable = (v) => (v instanceof Timestamp ? v.toMillis() : v);

  // Supports where(), orderBy() on ONE field (ties broken by document ID in the same direction,
  // as Firestore does), startAfter(documentSnapshot) and limit().
  function query(collection, filters = [], options = {}) {
    const run = () => {
      let entries = [...table(collection).entries()]
        .filter(([, data]) => filters.every(({ field, op, value }) => {
          if (op === '==') return data[field] === value;
          if (op === 'array-contains') return Array.isArray(data[field]) && data[field].includes(value);
          if (RANGE_OPS[op]) {
            // Like Firestore: a range filter only matches documents whose field has the same type.
            const a = comparable(data[field]);
            const b = comparable(value);
            return a !== undefined && a !== null && typeof a === typeof b && RANGE_OPS[op](a, b);
          }
          throw new Error(`fake Firestore: unsupported operator ${op}`);
        }));
      const { order } = options;
      const key = ([id, data]) => [order ? comparable(data[order.field]) : null, id];
      const compare = (x, y) => {
        const [xv, xid] = key(x);
        const [yv, yid] = key(y);
        const sign = order?.dir === 'desc' ? -1 : 1;
        if (order && xv !== yv) return (xv < yv ? -1 : 1) * sign;
        return xid.localeCompare(yid) * (order ? sign : 1);
      };
      entries.sort(compare);
      if (options.after) {
        const marker = [options.after.id, options.after.data()];
        entries = entries.filter((e) => compare(e, marker) > 0);
      }
      if (options.limit !== undefined) entries = entries.slice(0, options.limit);
      const docs = entries.map(([id, data]) => snapshot(id, data));
      return { docs, empty: docs.length === 0, size: docs.length };
    };
    return {
      _isQuery: true,
      where: (field, op, value) => query(collection, [...filters, { field, op, value }], options),
      orderBy: (field, dir = 'asc') => query(collection, filters, { ...options, order: { field, dir } }),
      startAfter: (snap) => query(collection, filters, { ...options, after: snap }),
      limit: (n) => query(collection, filters, { ...options, limit: n }),
      // Field projection is not simulated: callers must only use the fields they selected.
      select: () => query(collection, filters, options),
      get: async () => run(),
      _run: run,
    };
  }

  function collectionRef(name) {
    return {
      ...query(name),
      doc: (id) => docRef(name, id ?? autoId()),
    };
  }

  // Transactions run one at a time.
  let queue = Promise.resolve();

  async function runTransaction(fn) {
    const turn = queue.then(async () => {
      const writes = [];
      const assertNoWrites = () => {
        if (writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
      };
      const tx = {
        async get(refOrQuery) {
          assertNoWrites();
          return refOrQuery._isQuery ? refOrQuery._run() : readDoc(refOrQuery);
        },
        async getAll(...refs) {
          assertNoWrites();
          return refs.map(readDoc);
        },
        create: (ref, data) => { writes.push(() => write.create(ref, data)); return tx; },
        set: (ref, data, options) => { writes.push(() => write.set(ref, data, options)); return tx; },
        update: (ref, data) => { writes.push(() => write.update(ref, data)); return tx; },
        delete: (ref) => { writes.push(() => write.delete(ref)); return tx; },
      };
      const result = await fn(tx);
      // Validate every write before applying any (all-or-nothing commit).
      const backup = new Map([...store].map(([k, v]) => [k, new Map(v)]));
      try {
        for (const apply of writes) apply();
      } catch (err) {
        store.clear();
        for (const [k, v] of backup) store.set(k, v);
        throw err;
      }
      return result;
    });
    queue = turn.catch(() => {});
    return turn;
  }

  const db = {
    collection: collectionRef,
    getAll: async (...refs) => refs.map(readDoc),
    runTransaction,
  };

  // ---- Auth: tokens are opaque strings registered by the tests.
  const tokens = new Map(); // token -> decoded claims
  const adminAuth = {
    async verifyIdToken(token) {
      const decoded = tokens.get(token);
      if (!decoded) throw Object.assign(new Error('Decoding Firebase ID token failed.'), { code: 'auth/argument-error' });
      if (decoded.disabled) throw Object.assign(new Error('disabled'), { code: 'auth/user-disabled' });
      return { ...decoded };
    },
    async getUser(uid) {
      return authUsers.get(uid) ?? { uid, customClaims: {}, disabled: false };
    },
    // Users made through createUser() are kept (with their password) so tests can check
    // the account and that the password never leaves the server. Emails are unique.
    async createUser({ email, password, displayName }) {
      if (authFailure) throw Object.assign(new Error('auth unavailable'), { code: authFailure });
      if ([...authUsers.values()].some((u) => u.email === email)) {
        throw Object.assign(new Error('The email address is already in use by another account.'), { code: 'auth/email-already-exists' });
      }
      const user = { uid: autoId(), email, password, displayName, customClaims: {}, disabled: false };
      authUsers.set(user.uid, user);
      return { ...user };
    },
    async deleteUser(uid) {
      authUsers.delete(uid);
    },
    async setCustomUserClaims(uid, claims) {
      if (authUsers.has(uid)) authUsers.get(uid).customClaims = { ...claims };
    },
    async updateUser() {},
    async revokeRefreshTokens() {},
  };
  const authUsers = new Map(); // uid -> Auth user created through createUser()
  let authFailure = null;

  return {
    db,
    adminAuth,
    /** Raw stored document (with Timestamps), or undefined. */
    read: (collection, id) => clone(table(collection).get(id)),
    all: (collection) => [...table(collection).values()].map(clone),
    seed: (collection, id, data) => table(collection).set(id, resolveFields({}, data)),
    patch: (collection, id, fields) => write.update(docRef(collection, id), fields),
    clear: (collection) => table(collection).clear(),
    /** failWrites('auditLogs') makes every write to that collection fail; failWrites(name, false) undoes it. */
    failWrites: (collection, on = true) => (on ? failing.add(collection) : failing.delete(collection)),
    /** Registers a sign-in token for `uid` whose VERIFIED role claim is `role`. */
    addToken: (token, claims) => tokens.set(token, claims),
    /** Auth users created through adminAuth.createUser() (including their password). */
    authUsers: () => [...authUsers.values()].map((u) => ({ ...u })),
    /** failAuthCreate('auth/internal-error') makes createUser() fail with that code; null undoes it. */
    failAuthCreate: (code) => { authFailure = code; },
  };
}
