import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { notFound } from '../middleware/notFound.js';
import { parseStudentId } from '../services/student.service.js';
import { getDevOtpForParent } from '../services/dismissal.service.js';
import { isDevOtpOutboxEnabled } from '../services/sms/devOtpOutbox.js';

// DEVELOPMENT-ONLY helpers for local manual testing. Mounted by routes/index.js only when
// NODE_ENV is not "production" and SMS_PROVIDER=mock, and every request re-checks that here
// (the provider in use must also be the mock), so it can never answer in production or when
// real SMS is configured. There are no public or unauthenticated routes in this file.
const router = Router();

// Behaves exactly like an unknown route while disabled.
router.use((req, res, next) => (isDevOtpOutboxEnabled() ? next() : notFound(req, res)));
router.use(requireAuth, requireRole(ROLES.PARENT));

// GET /api/dev/dismissal-otp/:studentId - the code the MOCK provider "texted" to the caller
// for their OWN child's current request (the caller must be the parent who requested it).
router.get('/dismissal-otp/:studentId', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    devOnly: true,
    notice: 'Development only (SMS_PROVIDER=mock). Never available in production.',
    ...(await getDevOtpForParent(req.user.uid, parseStudentId(req.params.studentId))),
  });
});

export default router;
