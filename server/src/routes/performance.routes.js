import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  getEvaluation,
  listEvaluations,
  parsePerformanceId,
  saveEvaluation,
  updateEvaluation,
} from '../services/performance.service.js';
import { auditContext } from '../services/audit.service.js';

// Student Performance Evaluation for staff (admin and teacher). The evaluator is always
// the verified caller (req.user.uid). Parents read their own child's evaluations through
// /api/parent/children/:studentId/performance instead.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.TEACHER));

// GET /api/performance?studentId=&date=YYYY-MM-DD&area=  (no studentId and no date = today)
router.get('/', async (req, res) => {
  const { studentId, date, area } = req.query;
  res.json(await listEvaluations({ studentId, date, area }));
});

// GET /api/performance/:id  (id = {studentId}_{YYYY-MM-DD}_{area})
router.get('/:id', async (req, res) => {
  res.json({ evaluation: await getEvaluation(parsePerformanceId(req.params.id)) });
});

// POST /api/performance  { studentId, evaluationDate, area, starRating, observation }
// Saves the ONE evaluation for student/date/area: 201 when created, 200 when it updated
// the existing one.
router.post('/', async (req, res) => {
  const { created, evaluation } = await saveEvaluation(auditContext(req), req.body);
  res.status(created ? 201 : 200).json({ evaluation });
});

// PATCH /api/performance/:id  { starRating?, observation? }
router.patch('/:id', async (req, res) => {
  res.json({ evaluation: await updateEvaluation(auditContext(req), parsePerformanceId(req.params.id), req.body) });
});

export default router;
