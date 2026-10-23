import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

// Every route in this file is teacher-only.
const router = Router();
router.use(requireAuth, requireRole(ROLES.TEACHER));

// GET /api/teacher/test - authorization check.
router.get('/test', (req, res) => {
  res.json({ message: 'Teacher access granted' });
});

export default router;
