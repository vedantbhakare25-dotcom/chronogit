import crypto from 'node:crypto';

import CheckLog from '../models/CheckLog.js';
import { fetchJson } from './fetcher.js';
import { extractSchema, diffSchemas, hasBreakingChanges } from './schema/index.js';

/**
 * A stable fingerprint for "the set of breaking changes right now". Used to
 * tell BREAKING -> BREAKING transitions apart (Phase 5): same fingerprint
 * means the same break is still open, a different one means new damage
 * happened on top of it, so a follow-up alert is warranted.
 *
 * Deliberately includes the from/to types, not just kind+path — a field
 * mutating twice (number -> string -> boolean) is two distinct breaks on
 * the same path, and should produce two different fingerprints.
 *
 * @param {import('./schema/diffSchemas.js').SchemaChange[]} changes
 * @returns {string|null} null when there is nothing breaking to fingerprint
 */
export function computeBreakingFingerprint(changes) {
  const breaking = changes
    .filter((change) => change.breaking)
    .map((change) => `${change.kind}:${change.path}:${change.from.join('|')}->${change.to.join('|')}`)
    .sort();

  if (breaking.length === 0) return null;
  return crypto.createHash('sha256').update(breaking.join('\n')).digest('hex');
}

/**
 * Runs one check for a single monitor: fetches the endpoint, compares its
 * shape against the accepted baseline, writes a CheckLog, and updates the
 * monitor's status fields. Used by the manual "check now" route and, in
 * Phase 4, by the scheduler.
 *
 * The caller owns loading and persisting the monitor elsewhere if needed —
 * this function calls `monitor.save()` itself once it has decided the new
 * state, so callers don't have to remember to.
 *
 * @param {import('mongoose').Document} monitor  a Monitor document
 * @returns {Promise<{ monitor: import('mongoose').Document, checkLog: import('mongoose').Document, outcome: 'OK'|'NON_BREAKING'|'BREAKING'|'ERROR' }>}
 */
export async function runCheck(monitor) {
  const startedAt = Date.now();
  let fetchResult = null;
  let fetchErr = null;

  try {
    fetchResult = await fetchJson({
      url: monitor.url,
      headers: Object.fromEntries(monitor.headers ?? new Map()),
    });
  } catch (err) {
    fetchErr = err;
  }

  const responseTimeMs = Date.now() - startedAt;
  const now = new Date();
  // Re-anchor the schedule from "now" rather than the old nextCheckAt, so a
  // check that ran late (or was triggered manually) doesn't fire again
  // immediately. Used by Phase 4's scheduler.
  const nextCheckAt = new Date(now.getTime() + monitor.intervalMinutes * 60_000);

  if (fetchErr) {
    const checkLog = await CheckLog.create({
      monitorId: monitor._id,
      checkedAt: now,
      outcome: 'ERROR',
      httpStatus: fetchErr.status ?? null,
      responseTimeMs,
      errorMessage: fetchErr.message,
      changes: [],
    });

    // Baseline AND latestSchema are left untouched: a failed fetch gave us
    // no new information about the endpoint's shape, so there is nothing
    // to compare or record beyond the failure itself.
    monitor.status = 'ERROR';
    monitor.lastCheckedAt = now;
    monitor.nextCheckAt = nextCheckAt;
    await monitor.save();

    return { monitor, checkLog, outcome: 'ERROR' };
  }

  const latestSchema = extractSchema(fetchResult.json);
  const changes = diffSchemas(monitor.baselineSchema, latestSchema, {
    ignorePaths: monitor.ignorePaths,
  });
  const breaking = hasBreakingChanges(changes);
  const outcome = breaking ? 'BREAKING' : changes.length > 0 ? 'NON_BREAKING' : 'OK';

  const checkLog = await CheckLog.create({
    monitorId: monitor._id,
    checkedAt: now,
    outcome,
    httpStatus: fetchResult.status,
    responseTimeMs,
    changes,
  });

  monitor.latestSchema = latestSchema;
  monitor.status = breaking ? 'BREAKING' : 'HEALTHY';
  monitor.lastBreakingFingerprint = breaking ? computeBreakingFingerprint(changes) : null;
  monitor.lastCheckedAt = now;
  monitor.nextCheckAt = nextCheckAt;
  await monitor.save();

  return { monitor, checkLog, outcome };
}