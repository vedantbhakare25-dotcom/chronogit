import { Router } from 'express';
import mongoose from 'mongoose';

import Monitor from '../models/Monitor.js';
import CheckLog from '../models/CheckLog.js';
import { fetchJson } from '../services/fetcher.js';
import { extractSchema } from '../services/schema/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, notFound } from '../utils/AppError.js';
import { parseCreateMonitorInput, parseUpdateMonitorInput, parsePagination } from '../utils/validators.js';

const router = Router();

/** Loads req.params.id as a Monitor doc, or throws 400/404. Shared by the routes below. */
async function loadMonitor(id) {
  if (!mongoose.isValidObjectId(id)) throw badRequest('Invalid monitor id');
  const monitor = await Monitor.findById(id);
  if (!monitor) throw notFound('Monitor not found');
  return monitor;
}

/**
 * POST /api/monitors
 * Registers a new monitor: fetches the endpoint right away and stores the
 * resulting schema as both the baseline and the latest schema. Registration
 * fails (400) if the endpoint can't be reached or isn't valid JSON — there's
 * no useful baseline to save otherwise.
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
      baselineSchema: schema,
      latestSchema: schema,
      status: 'HEALTHY',
      lastCheckedAt: now,
      nextCheckAt: new Date(now.getTime() + input.intervalMinutes * 60_000),
    });

    res.status(201).json(monitor.toClientJSON());
  })
);

/** GET /api/monitors — list monitors, newest first. Baseline/latest schemas omitted (can be large). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const monitors = await Monitor.find()
      .select('-baselineSchema -latestSchema')
      .sort({ createdAt: -1 })
      .lean();
    res.json(monitors.map((m) => ({ ...m, headers: m.headers ? Object.fromEntries(m.headers) : {} })));
  })
);

/** GET /api/monitors/:id — full detail, including both schemas (for the diff viewer). */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id);
    res.json(monitor.toClientJSON());
  })
);

/** PUT /api/monitors/:id — update mutable settings. Not for url or schema fields — see /accept for the baseline. */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id);
    const update = parseUpdateMonitorInput(req.body);

    Object.assign(monitor, update);
    if (update.headers) monitor.headers = new Map(Object.entries(update.headers));
    if (update.intervalMinutes) {
      // Re-anchor the schedule so a shorter interval takes effect immediately
      // instead of waiting out however much of the old interval is left.
      const base = monitor.lastCheckedAt ?? new Date();
      monitor.nextCheckAt = new Date(base.getTime() + update.intervalMinutes * 60_000);
    }

    await monitor.save();
    res.json(monitor.toClientJSON());
  })
);

/** DELETE /api/monitors/:id — removes the monitor and its check history. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id);
    await Promise.all([CheckLog.deleteMany({ monitorId: monitor._id }), monitor.deleteOne()]);
    res.status(204).send();
  })
);

/**
 * GET /api/monitors/:id/logs?limit=20&before=<ISO date>
 * Cursor-paginated check history, newest first.
 */
router.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const monitor = await loadMonitor(req.params.id);
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