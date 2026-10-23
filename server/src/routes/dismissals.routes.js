import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listDismissals, parseDismissalId, releaseStudent, verifyDismissalCode } from '../services/dismissal.service.js';
import { auditContext } from '../services/audit.service.js';

// Dismissal Verification for staff (admin and teacher). The acting staff member is always the
// verified caller (req.user.uid); verifiedBy/releasedBy/status/timestamps sent by a client are
// rejected. Parents request codes through /api/parent/dismissals instead.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.TEACHER));

// GET /api/dismissals?date=YYYY-MM-DD (default today) - never includes codes or hashes.
router.get('/', async (req, res) => {
  res.json(await listDismissals({ date: req.query.date }));
});

// POST /api/dismissals/:dismissalId/verify  { otp: "123456", requestNumber }
// Step 1: checks the Fetcher's code. Does NOT release the child.
router.post('/:dismissalId/verify', async (req, res) => {
  res.json({ dismissal: await verifyDismissalCode(auditContext(req), parseDismissalId(req.params.dismissalId), req.body) });
});

// POST /api/dismissals/:dismissalId/release  { requestNumber }
// Step 2: the teacher confirms the verified Fetcher now has the child. Final.
router.post('/:dismissalId/release', async (req, res) => {
  res.json({ dismissal: await releaseStudent(auditContext(req), parseDismissalId(req.params.dismissalId), req.body) });
});

export default router;
