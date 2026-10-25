// One-time cleanup before a demo: removes all test records and every account NOT on a keep list.
// Used only by scripts/resetData.js (command line, with the server's own Firebase Admin
// credentials). There is NO API route for this: nobody can trigger it from the app.
//
//   planReset({ keepEmails })  -> what would be deleted (counts) and which accounts stay; changes nothing
//   runReset(plan, { backupPath }) -> writes a JSON backup of everything it deletes, THEN deletes
//
// Removed: students, RFID cards, attendance, Performance Evaluations, Fetchers, dismissal records,
// SMS records, announcements, the audit log, every notification bell (users/{uid}/inbox), the
// section list, and every account not kept (Firebase Auth user + users/{uid} profile).
// Kept: the listed accounts (role, name, email, parent mobile number; their teacher sections and
// "seen" marker are cleared because those records are gone) and the attendance / dismissal settings.
import { writeFile } from 'node:fs/promises';
import { COLLECTIONS, ROLES } from '@led/shared';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, db } from '../config/firebaseAdmin.js';
import { inboxCollection } from '../models/inbox.model.js';
import { sectionsRef } from '../models/section.model.js';
import { usersCollection } from '../models/user.model.js';

export const RESET_CONFIRM_PHRASE = 'DELETE TEST DATA';

const WIPED_COLLECTIONS = [
  COLLECTIONS.STUDENTS, COLLECTIONS.RFID_CARDS, COLLECTIONS.ATTENDANCE, COLLECTIONS.PERFORMANCE,
  COLLECTIONS.FETCHERS, COLLECTIONS.DISMISSAL_RECORDS, COLLECTIONS.NOTIFICATIONS, COLLECTIONS.ANNOUNCEMENTS,
  COLLECTIONS.AUDIT_LOGS,
];

const normalizeEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

async function allAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

/**
 * Works out the reset without changing anything. Refuses (throws) when a kept email has no account,
 * or when no ACTIVE admin would be kept (nobody could manage the system afterwards).
 */
export async function planReset({ keepEmails }) {
  const keep = new Set((keepEmails ?? []).map(normalizeEmail).filter(Boolean));
  if (keep.size === 0) throw new Error('List at least one account to keep (--keep email1,email2).');

  const [profilesSnap, authUsers] = await Promise.all([usersCollection().get(), allAuthUsers()]);
  const profiles = profilesSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const known = new Set([...profiles.map((p) => normalizeEmail(p.email)), ...authUsers.map((u) => normalizeEmail(u.email))]);
  const missing = [...keep].filter((email) => !known.has(email));
  if (missing.length) throw new Error(`No account found for: ${missing.join(', ')}. Nothing was changed.`);

  const keptProfiles = profiles.filter((p) => keep.has(normalizeEmail(p.email)));
  if (!keptProfiles.some((p) => p.role === ROLES.ADMIN && p.active === true)) {
    throw new Error('The keep list has no ACTIVE admin account: nobody could manage the system afterwards. Nothing was changed.');
  }
  const keptUids = new Set(keptProfiles.map((p) => p.uid));
  const deletedProfiles = profiles.filter((p) => !keptUids.has(p.uid));
  // Auth users without a profile, or whose email is not kept, are removed too (except kept ones).
  const deletedAuthUids = authUsers.filter((u) => !keptUids.has(u.uid) && !keep.has(normalizeEmail(u.email))).map((u) => u.uid);

  const collections = {};
  for (const name of WIPED_COLLECTIONS) collections[name] = (await db.collection(name).get()).size;
  let inboxItems = 0;
  for (const p of profiles) inboxItems += (await inboxCollection(p.uid).get()).size;

  return {
    projectId: process.env.FIREBASE_PROJECT_ID ?? null,
    kept: keptProfiles.map((p) => ({ uid: p.uid, email: p.email, role: p.role })),
    deleted: deletedProfiles.map((p) => ({ uid: p.uid, email: p.email, role: p.role })),
    deletedAuthUids: [...new Set([...deletedAuthUids, ...deletedProfiles.map((p) => p.uid)])],
    profileUids: profiles.map((p) => p.uid),
    collections,
    inboxItems,
    sectionList: (await sectionsRef().get()).exists,
  };
}

// ---- backup + delete

/** Timestamps become { __timestamp: ISO } so the backup stays readable JSON. */
function toJson(value) {
  if (value instanceof Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  return value;
}

const snapshotOf = (snap) => snap.docs.map((d) => ({ id: d.id, data: toJson(d.data()) }));

async function deleteRefs(refs) {
  for (let i = 0; i < refs.length; i += 50) await Promise.all(refs.slice(i, i + 50).map((ref) => ref.delete()));
}

/**
 * Carries out a plan from planReset(). Writes the backup file FIRST; if that fails, nothing is
 * deleted. `log` receives one line per step (no names, phone numbers or other record contents).
 */
export async function runReset(plan, { backupPath, log = () => {} }) {
  const backup = { createdAt: new Date().toISOString(), projectId: plan.projectId, collections: {}, inboxes: {}, users: [], sectionList: null };
  const snaps = {};
  for (const name of WIPED_COLLECTIONS) {
    snaps[name] = await db.collection(name).get();
    backup.collections[name] = snapshotOf(snaps[name]);
  }
  const inboxSnaps = {};
  for (const uid of plan.profileUids) {
    inboxSnaps[uid] = await inboxCollection(uid).get();
    if (inboxSnaps[uid].size) backup.inboxes[uid] = snapshotOf(inboxSnaps[uid]);
  }
  backup.users = snapshotOf(await usersCollection().get());
  const sections = await sectionsRef().get();
  backup.sectionList = sections.exists ? toJson(sections.data()) : null;
  await writeFile(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8', flag: 'wx' });
  log(`Backup written: ${backupPath}`);

  for (const name of WIPED_COLLECTIONS) {
    await deleteRefs(snaps[name].docs.map((d) => d.ref));
    log(`Deleted ${snaps[name].size} document(s) from ${name}`);
  }
  for (const uid of plan.profileUids) await deleteRefs(inboxSnaps[uid].docs.map((d) => d.ref));
  log(`Cleared ${plan.inboxItems} notification bell item(s)`);
  if (sections.exists) {
    await sectionsRef().delete();
    log('Removed the section list');
  }

  const keptUids = new Set(plan.kept.map((k) => k.uid));
  for (const uid of keptUids) {
    await usersCollection().doc(uid).update({
      sections: FieldValue.delete(),
      notificationsSeenAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  log(`Kept ${keptUids.size} account(s); cleared their teacher sections`);

  await deleteRefs(plan.deleted.map((d) => usersCollection().doc(d.uid)));
  let authDeleted = 0;
  for (const uid of plan.deletedAuthUids) {
    try {
      await adminAuth.deleteUser(uid);
      authDeleted += 1;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
    }
  }
  log(`Deleted ${plan.deleted.length} account profile(s) and ${authDeleted} sign-in account(s)`);
}
