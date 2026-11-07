import { Router } from 'express';
import { ALL_ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listSubjects } from '../services/subject.service.js';

// GET /api/subjects - the school's subject list (key, label, hidden) for every signed-in role: the
// evaluation form, filters, reports and the parent's view show subject names from it.
// Changes are admin-only: /api/admin/subjects.
const router = Router();
router.use(requireAuth, requireRole(...ALL_ROLES));

router.get('/', async (req, res) => {
  res.json(await listSubjects());
});

export default router;
