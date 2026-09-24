import { Router } from 'express';
import mongoose from 'mongoose';

import Monitor from '../models/Monitor.js';
import CheckLog from '../models/CheckLog.js';
import { fetchJson } from '../services/fetcher.js';
import { extractSchema, diffSchemas } from '../services/schema/index.js';
import { runCheck } from '../services/checkRunner.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { parseCreateMonitorInput, parseUpdateMonitorInput, parsePagination } from '../utils/validators.js';
import { requireInternalAuth } from '../middlewares/auth.js';

const router = Router();

// Apply auth middleware to all monitor operations
router.use(requireInternalAuth());

/** Loads monitor scoped to req.userId if available, or throws 400/404 */
async function loadMonitor(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid monitor id');
  if (!mongoose.isValidObjectId(userId)) throw badRequest('Invalid authenticated user ID');
  const monitor = await Monitor.findOne({ _id: id, $or: [{ userId }, { userId: null }] });
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
    const input = parseCreateMonitorInput(req.body);

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
    if (!mongoose.isValidObjectId(req.userId)) throw badRequest('Invalid authenticated user ID');
    const monitors = await Monitor.find({ $or: [{ userId: req.userId }, { userId: null }] })
      .select('-baselineSchema -latestSchema')
      .sort({ createdAt: -1 })
      .lean();

    const scopedMonitors = [];
    for (const monitor of monitors) {
      if (!monitor.userId) {
        const claimed = await Monitor.findOneAndUpdate(
          { _id: monitor._id, userId: null },
          { $set: { userId: req.userId } },
          { new: true }
        );
        if (!claimed) continue;
      }
      scopedMonitors.push({ ...monitor, userId: req.userId, headers: monitor.headers ?? {} });
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
      pendingChanges: diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
        ignorePaths: monitor.ignorePaths,
      }),
    });
  })
);

/** PUT /api/monitors/:id */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId);
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
    const monitor = await loadMonitor(req.params.id, req.userId);
    await Promise.all([CheckLog.deleteMany({ monitorId: monitor._id }), monitor.deleteOne()]);
    res.status(204).send();
  })
);

/** POST /api/monitors/:id/check */
router.post(
  '/:id/check',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId);
    const { checkLog, outcome } = await runCheck(monitor);
    res.json({
      monitor: {
        ...monitor.toClientJSON(),
        pendingChanges: diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
          ignorePaths: monitor.ignorePaths,
        }),
      },
      checkLog,
      outcome,
    });
  })
);

/** POST /api/monitors/:id/accept */
router.post(
  '/:id/accept',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id, req.userId);
    const pending = diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
      ignorePaths: monitor.ignorePaths,
    });
    if (pending.length === 0) {
      throw badRequest('Nothing to accept — the baseline already matches the latest schema');
    }

    monitor.baselineSchema = monitor.latestSchema;
    monitor.lastBreakingFingerprint = null;
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
