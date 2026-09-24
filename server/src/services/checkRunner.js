import crypto from 'node:crypto';

import CheckLog from '../models/CheckLog.js';
import User from '../models/User.js';
import { fetchJson } from './fetcher.js';
import { extractSchema, diffSchemas, hasBreakingChanges } from './schema/index.js';
import { ALERT_KIND, decideAlertKind, toCheckLogAlertSent, dispatchAlert } from './alerts/index.js';
import { persistInAppNotification } from './notificationService.js';

export function computeBreakingFingerprint(changes) {
  const breaking = changes
    .filter((change) => change.breaking)
    .map((change) => `${change.kind}:${change.path}:${change.from.join('|')}->${change.to.join('|')}`)
    .sort();

  if (breaking.length === 0) return null;
  return crypto.createHash('sha256').update(breaking.join('\n')).digest('hex');
}

/**
 * Resolves effective recipient: monitor specific override > user preferred email
 */
async function resolveAlertRecipient(monitor) {
  if (monitor.alerts?.email !== undefined) return monitor.alerts.email;

  if (monitor.userId) {
    try {
      const user = await User.findById(monitor.userId);
      if (user && typeof user.getEffectiveAlertEmail === 'function') {
        return user.getEffectiveAlertEmail();
      }
    } catch {
      // safe fallback
    }
  }
  return undefined;
}

export async function runCheck(monitor) {
  const previousStatus = monitor.status;
  const previousFingerprint = monitor.lastBreakingFingerprint;

  const startedAt = Date.now();
  let fetchResult = null;
  let fetchErr = null;

  try {
    fetchResult = await fetchJson({
      url: monitor.url,
      headers: monitor.headers instanceof Map 
        ? Object.fromEntries(monitor.headers) 
        : (monitor.headers ?? {}),
    });
  } catch (err) {
    fetchErr = err;
  }

  const responseTimeMs = Date.now() - startedAt;
  const now = new Date();
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

    monitor.status = 'ERROR';
    monitor.lastNonBreakingFingerprint = null;
    monitor.lastCheckedAt = now;
    monitor.nextCheckAt = nextCheckAt;
    await monitor.save();

    if (previousStatus !== 'ERROR') {
      await persistInAppNotification({
        monitor,
        type: 'ENDPOINT_ERROR',
        title: 'Endpoint check failed',
        message: fetchErr.message || 'The endpoint could not be checked.',
      });
    }

    return { monitor, checkLog, outcome: 'ERROR' };
  }

  const latestSchema = extractSchema(fetchResult.json);
  const changes = diffSchemas(monitor.baselineSchema, latestSchema, {
    ignorePaths: monitor.ignorePaths,
  });
  const breaking = hasBreakingChanges(changes);
  const outcome = breaking ? 'BREAKING' : changes.length > 0 ? 'NON_BREAKING' : 'OK';
  const newFingerprint = breaking ? computeBreakingFingerprint(changes) : null;
  const nonBreakingFingerprint = changes.length
    ? crypto.createHash('sha256').update(JSON.stringify(changes)).digest('hex')
    : null;
  const shouldNotifyNonBreaking =
    outcome === 'NON_BREAKING' && nonBreakingFingerprint !== (monitor.lastNonBreakingFingerprint ?? null);

  const alertKind = decideAlertKind({
    previousStatus,
    previousFingerprint,
    newStatus: breaking ? 'BREAKING' : 'HEALTHY',
    newFingerprint,
    notifyOnRecovery: monitor.alerts?.notifyOnRecovery !== false,
  });

  const checkLog = await CheckLog.create({
    monitorId: monitor._id,
    checkedAt: now,
    outcome,
    httpStatus: fetchResult.status,
    responseTimeMs,
    changes,
    ...(toCheckLogAlertSent(alertKind) ? { alertSent: toCheckLogAlertSent(alertKind) } : {}),
  });

  monitor.latestSchema = latestSchema;
  monitor.status = breaking ? 'BREAKING' : 'HEALTHY';
  monitor.lastBreakingFingerprint = newFingerprint;
  monitor.lastNonBreakingFingerprint = outcome === 'NON_BREAKING' ? nonBreakingFingerprint : null;
  monitor.lastCheckedAt = now;
  monitor.nextCheckAt = nextCheckAt;
  await monitor.save();

  if (alertKind && alertKind !== ALERT_KIND.RECOVERY) {
    await persistInAppNotification({
      monitor,
      type: 'BREAKING_DRIFT',
      title: 'Breaking API changes detected',
      message: `${changes.length} schema change${changes.length === 1 ? '' : 's'} detected.`,
      diffSummary: changes,
    });
  } else if (shouldNotifyNonBreaking) {
    await persistInAppNotification({
      monitor,
      type: 'NON_BREAKING_DRIFT',
      title: 'Non-breaking API changes detected',
      message: `${changes.length} schema change${changes.length === 1 ? '' : 's'} detected.`,
      diffSummary: changes,
    });
  }

  if (alertKind) {
    const effectiveEmail = await resolveAlertRecipient(monitor);
    
    const baseMonitor = typeof monitor.toObject === 'function' 
      ? monitor.toObject() 
      : { ...monitor };

    const monitorWithResolvedEmail = {
      ...baseMonitor,
      alerts: {
        ...(baseMonitor.alerts ?? {}),
        email: effectiveEmail,
      },
    };

    await dispatchAlert(alertKind, {
      monitor: monitorWithResolvedEmail,
      changes,
      responseTimeMs,
    });
  }

  return { monitor, checkLog, outcome };
}
