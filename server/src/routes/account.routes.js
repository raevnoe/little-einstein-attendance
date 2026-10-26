import { Router } from 'express';
import { ALL_ROLES, ROLES } from '@led/shared';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { findUserById, toPublicUser } from '../models/user.model.js';
import { getSmsSettings } from '../models/systemSettings.model.js';
import { setOwnAttendanceSms, signOutEverywhere } from '../services/userAccount.service.js';
import { auditContext } from '../services/audit.service.js';
import { HttpError } from '../utils/httpError.js';

// Settings -> My Account, for every role. Each route acts ONLY on the caller's own account: the uid
// comes from the verified token, never from the URL or body.
const router = Router();
router.use(requireAuth, requireRole(...ALL_ROLES));

// GET /api/account - own profile, plus (parents) whether the school lets them turn off
// arrival/departure SMS.
router.get('/', async (req, res) => {
  const profile = toPublicUser(await findUserById(req.user.uid));
  let sms = null;
  if (req.profile.role === ROLES.PARENT) {
    const { attendanceSmsEnabled, allowParentSmsOptOut } = await getSmsSettings();
    sms = { attendanceSmsEnabled, allowParentSmsOptOut };
  }
  res.json({ profile, sms });
});

// PATCH /api/account/preferences { attendanceSms: boolean } - parents only.
router.patch('/preferences', requireRole(ROLES.PARENT), async (req, res) => {
  const body = req.body ?? {};
  const unknown = Object.keys(body).filter((key) => key !== 'attendanceSms');
  if (unknown.length || !('attendanceSms' in body)) {
    throw new HttpError(400, 'validation/unknown-fields', 'Only attendanceSms can be changed here.');
  }
  if (body.attendanceSms === false && !(await getSmsSettings()).allowParentSmsOptOut) {
    throw new HttpError(409, 'account/sms-opt-out-not-allowed',
      'The school requires arrival and departure SMS for every parent.');
  }
  res.json({ profile: await setOwnAttendanceSms(auditContext(req), req.user.uid, body.attendanceSms) });
});

// POST /api/account/sign-out-everywhere - ends every session of the caller, including this one.
router.post('/sign-out-everywhere', async (req, res) => {
  await signOutEverywhere(auditContext(req), req.user.uid);
  res.json({ signedOut: true });
});

export default router;
