import { Router } from 'express';
import { ROLES, SCAN_OUTCOMES, SCAN_SOURCES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getDailyAttendance, processRfidScan } from '../services/attendance.service.js';
import { auditContext } from '../services/audit.service.js';
import { HttpError } from '../utils/httpError.js';

// Daily Attendance for staff (admin and teacher). Parents read their own child's
// attendance through /api/parent/children/:studentId/attendance instead.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.TEACHER));

const HTTP_STATUS_BY_OUTCOME = {
  [SCAN_OUTCOMES.TIME_IN]: 201,
  [SCAN_OUTCOMES.TIME_OUT]: 200,
  [SCAN_OUTCOMES.DUPLICATE_IGNORED]: 200,
  [SCAN_OUTCOMES.ALREADY_COMPLETED]: 409,
  [SCAN_OUTCOMES.UNKNOWN_RFID]: 404,
  [SCAN_OUTCOMES.RFID_INACTIVE]: 409,
  [SCAN_OUTCOMES.RFID_UNASSIGNED]: 409,
  [SCAN_OUTCOMES.STUDENT_INACTIVE]: 409,
};

// GET /api/attendance?date=YYYY-MM-DD&q=<search>&status=absent|checked-in|checked-out
router.get('/', async (req, res) => {
  const { date, q, status } = req.query;
  res.json(await getDailyAttendance({ date, q, status }));
});

// POST /api/attendance/scan  { "uid": "3008 33b2-ddd9:01c4 0a00 0001" }
// Used by the staff Attendance page for BOTH the UHF RFID reader (keyboard emulation: the
// reader types the UID into the page) and the manual UID fallback. Only the UID is accepted;
// the server decides the student, the date, the time and the source. The browser cannot
// prove which of the two produced a UID, so the recorded source stays MANUAL_TEST.
router.post('/scan', async (req, res) => {
  const scan = await processRfidScan({ rawUid: req.body?.uid, source: SCAN_SOURCES.MANUAL_TEST, ctx: auditContext(req) });
  const status = HTTP_STATUS_BY_OUTCOME[scan.outcome] ?? 500;
  if (status >= 400) throw new HttpError(status, `attendance/${scan.outcome}`, scan.message, { scan });
  res.status(status).json({ scan });
});

export default router;
