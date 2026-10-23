import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getChildOfParent, listChildrenOfParent, parseStudentId } from '../services/student.service.js';
import { getChildAttendance } from '../services/attendance.service.js';
import { getChildPerformance } from '../services/performance.service.js';
import { createFetcher, deactivateOwnFetcher, listOwnFetchers, parseFetcherId, updateFetcher } from '../services/fetcher.service.js';
import { listOwnDismissals, requestDismissalCode } from '../services/dismissal.service.js';
import { auditContext } from '../services/audit.service.js';

// Every route in this file is parent-only, and every student lookup is scoped to
// the verified caller's uid (req.user.uid) - never to an ID chosen by the client alone.
const router = Router();
router.use(requireAuth, requireRole(ROLES.PARENT));

// GET /api/parent/test - authorization check.
router.get('/test', (req, res) => {
  res.json({ message: 'Parent access granted' });
});

// GET /api/parent/children - the caller's own linked, active children.
router.get('/children', async (req, res) => {
  res.json({ children: await listChildrenOfParent(req.user.uid) });
});

// GET /api/parent/children/:studentId - 404 unless this is the caller's own child.
router.get('/children/:studentId', async (req, res) => {
  res.json({ child: await getChildOfParent(req.user.uid, parseStudentId(req.params.studentId)) });
});

// GET /api/parent/children/:studentId/attendance - own child's last 30 days (no RFID data).
router.get('/children/:studentId/attendance', async (req, res) => {
  res.json({ attendance: await getChildAttendance(req.user.uid, parseStudentId(req.params.studentId)) });
});

// GET /api/parent/children/:studentId/performance?date=YYYY-MM-DD - own child only (read-only).
// Without a date: the last 30 days. No teacher account data, no RFID data.
router.get('/children/:studentId/performance', async (req, res) => {
  const performance = await getChildPerformance(req.user.uid, parseStudentId(req.params.studentId), { date: req.query.date });
  res.json({ performance });
});

// ---- Fetchers (Phase 9). A Fetcher has no account; the owner is always the caller.

// GET /api/parent/fetchers - the caller's own Fetchers (active and deactivated).
router.get('/fetchers', async (req, res) => {
  res.json({ fetchers: await listOwnFetchers(req.user.uid) });
});

// POST /api/parent/fetchers  { fullName, relationship, studentIds: [own active children] }
router.post('/fetchers', async (req, res) => {
  res.status(201).json({ fetcher: await createFetcher(auditContext(req), req.user.uid, req.body) });
});

// PATCH /api/parent/fetchers/:fetcherId  { fullName?, relationship?, studentIds? } - own Fetcher only (else 404).
router.patch('/fetchers/:fetcherId', async (req, res) => {
  res.json({ fetcher: await updateFetcher(auditContext(req), req.user.uid, parseFetcherId(req.params.fetcherId), req.body) });
});

// POST /api/parent/fetchers/:fetcherId/deactivate - own Fetcher only. Nothing is deleted.
router.post('/fetchers/:fetcherId/deactivate', async (req, res) => {
  res.json({ fetcher: await deactivateOwnFetcher(auditContext(req), req.user.uid, parseFetcherId(req.params.fetcherId)) });
});

// ---- Dismissal Verification (Phase 9)

// GET /api/parent/dismissals - today's dismissal status for the caller's own children (never a code).
router.get('/dismissals', async (req, res) => {
  res.json(await listOwnDismissals(req.user.uid));
});

// POST /api/parent/dismissals  { studentId, fetcherId } - texts a one-time code to the CALLER's
// registered mobile number. The response never contains the code.
router.post('/dismissals', async (req, res) => {
  const dismissal = await requestDismissalCode({ uid: req.user.uid, profile: req.profile, ctx: auditContext(req) }, req.body);
  res.status(201).json({ dismissal });
});

export default router;
