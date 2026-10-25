import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { scopeFor } from '../utils/sectionScope.js';
import { getAttendanceReport, getPerformanceReport, getTodaySummary } from '../services/report.service.js';

// Reports for staff (admin and teacher). Read-only. Parents never use these routes: they see
// their own children through /api/parent/*, which checks the parent-child link.
// Dates are YYYY-MM-DD school dates (SCHOOL_TIME_ZONE); a range covers at most 31 days.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.TEACHER));

// GET /api/reports/today - today's attendance, evaluation and dismissal counts.
router.get('/today', async (req, res) => {
  res.json(await getTodaySummary({ scope: scopeFor(req) }));
});

// GET /api/reports/attendance?from=&to=&section=&studentId=
router.get('/attendance', async (req, res) => {
  res.json(await getAttendanceReport(req.query, { scope: scopeFor(req) }));
});

// GET /api/reports/performance?from=&to=&section=&studentId=&area=
router.get('/performance', async (req, res) => {
  res.json(await getPerformanceReport(req.query, { scope: scopeFor(req) }));
});

export default router;
