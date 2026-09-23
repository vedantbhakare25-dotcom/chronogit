import cron from 'node-cron';

import Monitor from '../models/Monitor.js';
import { runCheck } from '../services/checkRunner.js';

const DEFAULT_SCHEDULE = '* * * * *'; // every minute

let task = null;

// Guards against a tick starting while the previous one is still running —
// e.g. a batch of slow endpoints taking longer than 60s to all check.
// A module-level flag is enough here: this scheduler runs as one process,
// so there's no multi-instance race to worry about (see README notes on
// scope — a distributed lock would be overkill for this project).
let isRunning = false;

/**
 * Finds every active monitor whose nextCheckAt has arrived and checks them
 * all concurrently. Each monitor's failure is caught and logged individually
 * so one bad endpoint (or one throwing runCheck call) can never take the
 * rest of the batch — or the scheduler itself — down.
 *
 * Exported directly (not just reachable via the cron tick) so it can be
 * triggered on demand and unit-tested without waiting on a real timer.
 *
 * @returns {Promise<{ skipped: boolean } | { checked: number, succeeded: number, failed: number }>}
 */
export async function runDueChecks() {
  if (isRunning) {
    console.warn('[scheduler] previous tick is still running — skipping this tick');
    return { skipped: true };
  }

  isRunning = true;
  try {
    const dueMonitors = await Monitor.find({ isActive: true, nextCheckAt: { $lte: new Date() } });
    if (dueMonitors.length === 0) return { checked: 0, succeeded: 0, failed: 0 };

    const results = await Promise.allSettled(dueMonitors.map((monitor) => runCheck(monitor)));

    let succeeded = 0;
    let failed = 0;
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        succeeded += 1;
      } else {
        failed += 1;
        // A rejection here means runCheck itself threw (e.g. a save() error)
        // rather than a normal fetch failure — those are already captured
        // as an ERROR CheckLog by runCheck. This is the "something is
        // actually broken" case, so it goes to the console, not silently
        // swallowed.
        console.error(`[scheduler] runCheck threw for monitor ${dueMonitors[i]._id}:`, result.reason);
      }
    });

    console.log(`[scheduler] tick: ${dueMonitors.length} due, ${succeeded} ok, ${failed} failed`);
    return { checked: dueMonitors.length, succeeded, failed };
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the cron ticker. Idempotent — calling it again while already
 * running just returns the existing task instead of scheduling a second one.
 *
 * @param {Object} [options]
 * @param {string} [options.schedule] cron expression, default every minute
 * @returns {import('node-cron').ScheduledTask}
 */
export function startScheduler({ schedule = DEFAULT_SCHEDULE } = {}) {
  if (task) return task;

  task = cron.schedule(schedule, () => {
    runDueChecks().catch((err) => {
      // runDueChecks already catches per-monitor errors; this only fires for
      // something outside that — e.g. the Monitor.find() query itself failing.
      console.error('[scheduler] tick failed unexpectedly:', err);
    });
  });

  console.log(`[scheduler] started (schedule: "${schedule}")`);
  return task;
}

/** Stops the cron ticker. Safe to call even if it was never started. */
export function stopScheduler() {
  if (!task) return;
  task.stop();
  task = null;
  console.log('[scheduler] stopped');
}

/** True while a tick is actively running a batch of checks. Exposed for tests/health checks. */
export function isSchedulerTickRunning() {
  return isRunning;
}