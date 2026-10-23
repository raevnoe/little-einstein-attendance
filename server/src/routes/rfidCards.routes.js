import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { parseStudentId } from '../services/student.service.js';
import {
  assignCard,
  deactivateCard,
  getCard,
  listCards,
  parseRfidUid,
  reactivateCard,
  registerCard,
  unassignCard,
} from '../services/rfidCard.service.js';
import { auditContext } from '../services/audit.service.js';

// UHF RFID card management. Staff can read; only admins can change cards.
// Parents have no access: they never need a physical card UID.
const router = Router();
const staffOnly = requireRole(ROLES.ADMIN, ROLES.TEACHER);
const adminOnly = requireRole(ROLES.ADMIN);

router.use(requireAuth);

// GET /api/rfid-cards?q=<uid/student>&status=active|inactive|all&assignment=assigned|unassigned|all
router.get('/', staffOnly, async (req, res) => {
  const { q, status, assignment } = req.query;
  res.json({ cards: await listCards({ q, status, assignment }) });
});

// GET /api/rfid-cards/:uid
router.get('/:uid', staffOnly, async (req, res) => {
  res.json({ card: await getCard(parseRfidUid(req.params.uid)) });
});

// POST /api/rfid-cards  { "uid": "300833B2DDD901C40A000001", "studentId"?: "K2026-001" } - registers a card;
// with studentId it is also assigned to that student in the same transaction.
router.post('/', adminOnly, async (req, res) => {
  res.status(201).json({ card: await registerCard(auditContext(req), req.body) });
});

// POST /api/rfid-cards/:uid/assign  { "studentId": "K2026-001" } - card must be unassigned.
router.post('/:uid/assign', adminOnly, async (req, res) => {
  const card = await assignCard(auditContext(req), parseRfidUid(req.params.uid), parseStudentId(req.body?.studentId));
  res.json({ card });
});

// POST /api/rfid-cards/:uid/reassign  { "studentId": "K2026-002" } - explicit move of an assigned card.
router.post('/:uid/reassign', adminOnly, async (req, res) => {
  const card = await assignCard(auditContext(req), parseRfidUid(req.params.uid), parseStudentId(req.body?.studentId), { reassign: true });
  res.json({ card });
});

// POST /api/rfid-cards/:uid/unassign
router.post('/:uid/unassign', adminOnly, async (req, res) => {
  res.json({ card: await unassignCard(auditContext(req), parseRfidUid(req.params.uid)) });
});

// POST /api/rfid-cards/:uid/deactivate - also unassigns the card.
router.post('/:uid/deactivate', adminOnly, async (req, res) => {
  res.json({ card: await deactivateCard(auditContext(req), parseRfidUid(req.params.uid)) });
});

// POST /api/rfid-cards/:uid/reactivate - card returns unassigned.
router.post('/:uid/reactivate', adminOnly, async (req, res) => {
  res.json({ card: await reactivateCard(auditContext(req), parseRfidUid(req.params.uid)) });
});

export default router;
