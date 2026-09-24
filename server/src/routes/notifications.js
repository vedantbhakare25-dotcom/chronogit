import { Router } from 'express';
import mongoose from 'mongoose';

import Notification from '../models/Notification.js';
import { requireInternalAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';

const router = Router();
router.use(requireInternalAuth());

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.userId)) throw badRequest('Invalid authenticated user ID');
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(20).lean(),
      Notification.countDocuments({ userId: req.userId, isRead: false }),
    ]);
    res.json({ notifications, unreadCount });
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.userId)) throw badRequest('Invalid authenticated user ID');
    if (!mongoose.isValidObjectId(req.params.id)) throw badRequest('Invalid notification id');
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) throw notFound('Notification not found');
    res.json(notification);
  })
);

router.post(
  '/mark-all-read',
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.userId)) throw badRequest('Invalid authenticated user ID');
    const result = await Notification.updateMany(
      { userId: req.userId, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ modifiedCount: result.modifiedCount ?? result.nModified ?? 0 });
  })
);

export default router;
