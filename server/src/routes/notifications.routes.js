import { Router } from 'express';
import { ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listInbox, markSeen } from '../services/inbox.service.js';

// In-app notifications (the bell). Every account reads ONLY its own inbox: the uid and role come
// from the verified token (req.user), never from the request. There is no route that creates,
// changes or deletes notifications; the server writes them when events happen.
const router = Router();
router.use(requireAuth, requireRole(ROLES.ADMIN, ROLES.TEACHER, ROLES.PARENT));

// GET /api/notifications?after=<ISO time> - newest first; with `after`, only newer items.
router.get('/', async (req, res) => {
  res.json(await listInbox({ uid: req.user.uid, role: req.user.role, profile: req.profile }, req.query));
});

// POST /api/notifications/seen  { upTo: <ISO time> } - marks items up to that time as seen.
router.post('/seen', async (req, res) => {
  res.json(await markSeen(req.user.uid, req.body));
});

export default router;
