import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  createStudent,
  getStudent,
  listStudents,
  parseStudentId,
  setStudentActive,
  updateStudent,
} from '../services/student.service.js';
import { auditContext } from '../services/audit.service.js';

// Staff-only student records. Parents never use these routes: they read their own
// children through /api/parent/children, which is filtered by relationship.
const router = Router();
const staffOnly = requireRole(ROLES.ADMIN, ROLES.TEACHER);
const adminOnly = requireRole(ROLES.ADMIN);

router.use(requireAuth);

// GET /api/students?q=<search>&status=active|inactive|all
router.get('/', staffOnly, async (req, res) => {
  const students = await listStudents({ q: req.query.q, status: req.query.status });
  res.json({ students });
});

// GET /api/students/:studentId - parent email/mobile number only for admins (teachers see hasMobileNumber).
router.get('/:studentId', staffOnly, async (req, res) => {
  res.json({ student: await getStudent(parseStudentId(req.params.studentId), { includeContact: req.profile.role === ROLES.ADMIN }) });
});

// POST /api/students
router.post('/', adminOnly, async (req, res) => {
  res.status(201).json({ student: await createStudent(auditContext(req), req.body) });
});

// PATCH /api/students/:studentId - Student ID itself cannot be changed.
router.patch('/:studentId', adminOnly, async (req, res) => {
  res.json({ student: await updateStudent(auditContext(req), parseStudentId(req.params.studentId), req.body) });
});

// POST /api/students/:studentId/deactivate - keeps the record; nothing is deleted.
router.post('/:studentId/deactivate', adminOnly, async (req, res) => {
  res.json({ student: await setStudentActive(auditContext(req), parseStudentId(req.params.studentId), false) });
});

// POST /api/students/:studentId/reactivate
router.post('/:studentId/reactivate', adminOnly, async (req, res) => {
  res.json({ student: await setStudentActive(auditContext(req), parseStudentId(req.params.studentId), true) });
});

export default router;
