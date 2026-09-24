import { Router } from 'express';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { requireInternalAuth } from '../middlewares/auth.js';

const router = Router();

router.use(requireInternalAuth({ requireUserId: false }));

/**
 * POST /api/users/sync
 * Called by Next.js right after Google OAuth sign-in.
 * Creates the user if new, or updates their profile info.
 */
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const { googleId, email, name, avatar } = req.body;
    if (!googleId || !email) {
      throw badRequest('googleId and email are required');
    }

    const user = await User.findOneAndUpdate(
      { googleId },
      { $set: { email, name: name || '', avatar: avatar || '' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      alertEmailPreference: user.alertEmailPreference,
      effectiveAlertEmail: user.getEffectiveAlertEmail(),
    });
  })
);

/**
 * GET /api/users/me
 * Fetches current user profile and effective alert email
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.userId) throw badRequest('Missing authenticated user ID');
    const user = await User.findById(req.userId);
    if (!user) throw notFound('User not found');

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      alertEmailPreference: user.alertEmailPreference,
      effectiveAlertEmail: user.getEffectiveAlertEmail(),
    });
  })
);

/**
 * PUT /api/users/alert-preference
 * Updates email preference (ACCOUNT_EMAIL or CUSTOM_EMAIL)
 */
router.put(
  '/alert-preference',
  asyncHandler(async (req, res) => {
    if (!req.userId) throw badRequest('Missing authenticated user ID');
    const { type, customEmail } = req.body;
    if (!['ACCOUNT_EMAIL', 'CUSTOM_EMAIL'].includes(type)) {
      throw badRequest("type must be 'ACCOUNT_EMAIL' or 'CUSTOM_EMAIL'");
    }
    if (type === 'CUSTOM_EMAIL' &&
      (typeof customEmail !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(customEmail.trim()))) {
      throw badRequest('A valid customEmail is required when type is CUSTOM_EMAIL');
    }

    const user = await User.findById(req.userId);
    if (!user) throw notFound('User not found');

    user.alertEmailPreference = {
      type,
      customEmail: type === 'CUSTOM_EMAIL' ? customEmail.trim() : null,
      confirmedAt: new Date(),
    };
    await user.save();

    res.json({
      alertEmailPreference: user.alertEmailPreference,
      effectiveAlertEmail: user.getEffectiveAlertEmail(),
    });
  })
);

export default router;
