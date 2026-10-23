import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { findUserById, toPublicUser } from '../models/user.model.js';
import { HttpError } from '../utils/httpError.js';

const router = Router();

// GET /api/auth/me - the verified caller plus their users/{uid} profile (null if not provisioned yet).
router.get('/me', requireAuth, async (req, res, next) => {
  let profile;
  try {
    profile = await findUserById(req.user.uid);
  } catch (err) {
    console.error('[auth] Failed to load user profile:', err);
    return next(new HttpError(503, 'profile/unavailable', 'User profile is temporarily unavailable.'));
  }

  res.json({
    user: req.user,
    profile: profile ? toPublicUser(profile) : null,
  });
});

export default router;
