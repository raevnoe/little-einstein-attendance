import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { assignRole, createAccount, listAccounts, setAccountActive, setParentMobileNumber } from '../services/userAccount.service.js';
import { findUsersByRole, UID_PATTERN } from '../models/user.model.js';
import { adminDeactivateFetcher, listAllFetchers, parseFetcherId } from '../services/fetcher.service.js';
import { getAdminOverview } from '../services/report.service.js';
import { auditContext } from '../services/audit.service.js';
import { listAuditLogs } from '../services/auditQuery.service.js';
import { HttpError } from '../utils/httpError.js';

function targetUid(req) {
  if (!UID_PATTERN.test(req.params.uid)) {
    throw new HttpError(400, 'validation/invalid-uid', 'Invalid user id.');
  }
  return req.params.uid;
}

// Every route in this file is admin-only.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN));

// GET /api/admin/test - authorization check.
router.get('/test', (req, res) => {
  res.json({ message: 'Admin access granted' });
});

// GET /api/admin/overview - counts for the admin dashboard (students, RFID cards, parents,
// today's SMS sent/failed/skipped). Counts only: no names, numbers or message contents.
router.get('/overview', async (req, res) => {
  res.json(await getAdminOverview());
});

// GET /api/admin/audit-logs?from&to&category&eventType&outcome&actorUid&targetType&targetId&limit&cursor
// Read-only. There is deliberately no route that updates or deletes audit entries.
router.get('/audit-logs', async (req, res) => {
  res.json(await listAuditLogs(req.query));
});

// GET /api/admin/parents - parent accounts, for linking parents to students.
router.get('/parents', async (req, res) => {
  const parents = (await findUsersByRole(ROLES.PARENT))
    .map(({ uid, displayName, email, active }) => ({ uid, displayName, email, active }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  res.json({ parents });
});

// GET /api/admin/users - every account (admin, teacher, parent) for the Accounts screen.
router.get('/users', async (req, res) => {
  res.json({ users: await listAccounts() });
});

// POST /api/admin/users  { email, firstName, lastName, role, mobileNumber? }
// Creates the account with a random password nobody sees; the person sets their own
// through the password-reset email the admin's browser asks Firebase to send.
router.post('/users', async (req, res) => {
  res.status(201).json({ user: await createAccount(auditContext(req), req.body) });
});

// PATCH /api/admin/users/:uid/role  { "role": "teacher" }
router.patch('/users/:uid/role', async (req, res) => {
  const uid = targetUid(req);
  const user = await assignRole(auditContext(req), uid, req.body?.role);
  res.json({ user });
});

// POST /api/admin/users/:uid/deactivate - blocks sign-in and revokes sessions. Nothing is deleted.
router.post('/users/:uid/deactivate', async (req, res) => {
  const user = await setAccountActive(auditContext(req), targetUid(req), false);
  res.json({ user });
});

// PATCH /api/admin/users/:uid/mobile-number  { "mobileNumber": "09171234567" | null }
// Parent accounts only; used for attendance SMS.
router.patch('/users/:uid/mobile-number', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const unknown = Object.keys(body).filter((key) => key !== 'mobileNumber');
  if (unknown.length || !('mobileNumber' in body)) {
    throw new HttpError(400, 'validation/invalid-request', 'Send only { "mobileNumber": "..." } (or null to remove it).');
  }
  res.json({ user: await setParentMobileNumber(auditContext(req), targetUid(req), body.mobileNumber) });
});

// POST /api/admin/users/:uid/reactivate - undoes a deactivation.
router.post('/users/:uid/reactivate', async (req, res) => {
  const user = await setAccountActive(auditContext(req), targetUid(req), true);
  res.json({ user });
});

// GET /api/admin/fetchers?status=active|inactive|all - every Fetcher, with parent and children names.
router.get('/fetchers', async (req, res) => {
  res.json({ fetchers: await listAllFetchers({ status: req.query.status }) });
});

// POST /api/admin/fetchers/:fetcherId/deactivate - e.g. when the school is told this person
// must no longer collect a child. Any code already sent for them fails at verification.
router.post('/fetchers/:fetcherId/deactivate', async (req, res) => {
  res.json({ fetcher: await adminDeactivateFetcher(auditContext(req), parseFetcherId(req.params.fetcherId)) });
});

export default router;
