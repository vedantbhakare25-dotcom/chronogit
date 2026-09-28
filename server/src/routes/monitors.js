import { Router } from 'express';
import mongoose from 'mongoose';

import Monitor from '../models/Monitor.js';
import User from '../models/User.js';
import CheckLog from '../models/CheckLog.js';
import Notification from '../models/Notification.js';
import { fetchJson } from '../services/fetcher.js';
import { extractSchema, diffSchemas } from '../services/schema/index.js';
import { runCheck } from '../services/checkRunner.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError, badRequest, notFound } from '../utils/AppError.js';
import { parseCreateMonitorInput, parseUpdateMonitorInput, parsePagination } from '../utils/validators.js';
import { requireInternalAuth } from '../middlewares/auth.js';
import { computeDriftFingerprint, getVisiblePendingChanges } from '../services/driftState.js';

const router = Router();

// Apply auth middleware to all monitor operations
router.use(requireInternalAuth());

/** Loads monitor scoped to req.userId if available, or throws 400/404 */
async function getRequestUser(userId) {
  if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid authenticated user ID');
  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');
  return user;
}

async function loadMonitor(id, userId, { writable = false } = {}) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid monitor id');
  const user = await getRequestUser(userId);
  if (writable && user.isDemo) throw new AppError(403, 'The demo sandbox is read-only');
  const filter = user.isDemo
    ? { _id: id, userId }
    : { _id: id, $or: [{ userId }, { userId: null }] };
  const monitor = await Monitor.findOne(filter);
  if (!monitor) throw notFound('Monitor not found');
  if (!monitor.userId) {
    const claimed = await Monitor.findOneAndUpdate(
      { _id: monitor._id, userId: null },
      { $set: { userId } },
      { new: true }
    );
    if (!claimed) throw notFound('Monitor not found');
    return claimed;
  }
  return monitor;
}

/**
 * POST /api/monitors
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getRequestUser(req.userId);
    if (user.isDemo) throw new AppError(403, 'The demo sandbox is read-only');
    const input = parseCreateMonitorInput(req.body);
    const alerts = { ...input.alerts };

    // An explicit non-empty monitor recipient wins. Otherwise inherit the
    // user's saved preference so every new monitor is alert-ready by default.
    if (typeof alerts.email !== 'string' || !alerts.email.trim()) {
      alerts.email = user.getEffectiveAlertEmail?.() || user.email;
    } else {
      alerts.email = alerts.email.trim();
    }
    if (!alerts.email) throw badRequest('No alert email is configured for this user');

    let fetchResult;
    try {
      fetchResult = await fetchJson({ url: input.url, headers: input.headers });
    } catch (err) {
      throw badRequest(`Could not establish a baseline: ${err.message}`, { code: err.code });
    }

    const schema = extractSchema(fetchResult.json);
    const now = new Date();

    const monitor = await Monitor.create({
      ...input,
      alerts,
      userId: req.userId,
      baselineSchema: schema,
      latestSchema: schema,
      status: 'HEALTHY',
      lastCheckedAt: now,
      nextCheckAt: new Date(now.getTime() + input.intervalMinutes * 60_000),
    });

    res.status(201).json(monitor.toClientJSON());
  })
);

/** GET /api/monitors — list user monitors */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = await getRequestUser(req.userId);
    const filter = user.isDemo
      ? { userId: req.userId }
      : { $or: [{ userId: req.userId }, { userId: null }] };
    const monitors = await Monitor.find(filter)
      .select('_id userId name url status intervalMinutes isActive lastCheckedAt nextCheckAt createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const scopedMonitors = [];
    for (const monitor of monitors) {
      if (!user.isDemo && !monitor.userId) {
        const claimed = await Monitor.findOneAndUpdate(
          { _id: monitor._id, userId: null },
          { $set: { userId: req.userId } },
          { new: true }
        );
        if (!claimed) continue;
      }
      scopedMonitors.push({
        _id: monitor._id,
        name: monitor.name,
        url: monitor.url,
        status: monitor.status,
        intervalMinutes: monitor.intervalMinutes,
        isActive: monitor.isActive,
        lastCheckedAt: monitor.lastCheckedAt,
        nextCheckAt: monitor.nextCheckAt,
        createdAt: monitor.createdAt,
      });
    }

    res.json(scopedMonitors);
  })
);

/** GET /api/monitors/:id — full detail */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId);
    res.json({
      ...monitor.toClientJSON(),
      pendingChanges: getVisiblePendingChanges(monitor),
    });
  })
);

/** PUT /api/monitors/:id */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId, { writable: true });
    const update = parseUpdateMonitorInput(req.body);

    Object.assign(monitor, update);
    if (update.headers) monitor.headers = new Map(Object.entries(update.headers));
    if (update.intervalMinutes) {
      const base = monitor.lastCheckedAt ?? new Date();
      monitor.nextCheckAt = new Date(base.getTime() + update.intervalMinutes * 60_000);
    }

    await monitor.save();
    res.json(monitor.toClientJSON());
  })
);

/** DELETE /api/monitors/:id */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId, { writable: true });
    await Promise.all([CheckLog.deleteMany({ monitorId: monitor._id }), monitor.deleteOne()]);
    res.status(204).send();
  })
);

/** POST /api/monitors/:id/check */
router.post(
  '/:id/check',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId, { writable: true });
    const { checkLog, outcome } = await runCheck(monitor);
    res.json({
      monitor: {
        ...monitor.toClientJSON(),
        pendingChanges: getVisiblePendingChanges(monitor),
      },
      checkLog,
      outcome,
    });
  })
);

/** POST /api/monitors/:id/dismiss-drift */
router.post(
  '/:id/dismiss-drift',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId, { writable: true });
    const changes = diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
      ignorePaths: monitor.ignorePaths,
    });

    // Suppress this exact observed diff without accepting it as the baseline.
    monitor.dismissedDriftFingerprint = computeDriftFingerprint(changes);
    monitor.lastBreakingFingerprint = null;
    monitor.lastNonBreakingFingerprint = null;
    monitor.status = 'HEALTHY';
    await monitor.save();

    await Notification.updateMany(
      {
        monitorId: monitor._id,
        userId: req.userId,
        type: 'BREAKING_DRIFT',
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    res.json({ ...monitor.toClientJSON(), pendingChanges: [] });
  })
);

/** POST /api/monitors/:id/accept */
router.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId, { writable: true });
    const pending = diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
      ignorePaths: monitor.ignorePaths,
    });
    if (pending.length === 0) {
      throw badRequest('Nothing to accept — the baseline already matches the latest schema');
    }

    monitor.baselineSchema = monitor.latestSchema;
    monitor.lastBreakingFingerprint = null;
    monitor.lastNonBreakingFingerprint = null;
    monitor.dismissedDriftFingerprint = null;
    monitor.status = 'HEALTHY';
    await monitor.save();

    res.json(monitor.toClientJSON());
  })
);

/** GET /api/monitors/:id/logs */
router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId);
    const { limit, before } = parsePagination(req.query);

    const filter = { monitorId: monitor._id, ...(before && { checkedAt: { $lt: before } }) };
    const logs = await CheckLog.find(filter)
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    const nextCursor = logs.length === limit ? logs[logs.length - 1].checkedAt.toISOString() : null;
    res.json({ logs, nextCursor });
  })
);

export default router;
