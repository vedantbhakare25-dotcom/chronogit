import { sendAlertEmail } from './emailDispatcher.js';
import { buildBreakingAlertEmail, buildRecoveryAlertEmail } from './emailTemplate.js';

export const ALERT_KIND = Object.freeze({
  INITIAL_BREAK: 'INITIAL_BREAK',
  FOLLOWUP_BREAK: 'FOLLOWUP_BREAK',
  RECOVERY: 'RECOVERY',
});

/**
 * The "no spam" state machine, as a pure function — no I/O, so every
 * transition can be tested directly without mocking email or the database.
 *
 *   (not BREAKING) -> BREAKING              INITIAL_BREAK
 *   BREAKING -> BREAKING, same fingerprint  null (silent — still the same open issue)
 *   BREAKING -> BREAKING, new fingerprint   FOLLOWUP_BREAK (new damage on top)
 *   BREAKING -> HEALTHY                     RECOVERY, if notifyOnRecovery
 *   anything -> ERROR                       never called for this case — see runCheck
 *
 * @param {Object} params
 * @param {string} params.previousStatus        monitor.status before this check
 * @param {string|null} params.previousFingerprint
 * @param {'BREAKING'|'HEALTHY'} params.newStatus
 * @param {string|null} params.newFingerprint
 * @param {boolean} params.notifyOnRecovery
 * @returns {'INITIAL_BREAK'|'FOLLOWUP_BREAK'|'RECOVERY'|null}
 */
export function decideAlertKind({ previousStatus, previousFingerprint, newStatus, newFingerprint, notifyOnRecovery }) {
  if (newStatus === 'BREAKING') {
    if (previousStatus !== 'BREAKING') return ALERT_KIND.INITIAL_BREAK;
    return newFingerprint !== previousFingerprint ? ALERT_KIND.FOLLOWUP_BREAK : null;
  }

  if (newStatus === 'HEALTHY' && previousStatus === 'BREAKING') {
    return notifyOnRecovery ? ALERT_KIND.RECOVERY : null;
  }

  return null;
}

/** Maps a decided alert kind to the value CheckLog.alertSent expects, or undefined for "no alert". */
export function toCheckLogAlertSent(alertKind) {
  if (alertKind === ALERT_KIND.RECOVERY) return 'RECOVERY';
  if (alertKind) return 'BREAKING'; // both INITIAL_BREAK and FOLLOWUP_BREAK are "a breaking alert" in the log
  return undefined;
}

/**
 * Builds the right email for a decided alert kind and sends it. Never
 * throws — sendAlertEmail already guarantees that, and this adds one more
 * layer of defense since a caller (runCheck) must never fail because of it.
 *
 * @param {'INITIAL_BREAK'|'FOLLOWUP_BREAK'|'RECOVERY'} alertKind
 * @param {Object} context
 * @param {{ name: string, url: string, alerts?: { email?: string } }} context.monitor
 * @param {import('../schema/diffSchemas.js').SchemaChange[]} context.changes
 * @param {number} [context.responseTimeMs]
 */
export async function dispatchAlert(alertKind, { monitor, changes, responseTimeMs }) {
  try {
    const email =
      alertKind === ALERT_KIND.RECOVERY
        ? buildRecoveryAlertEmail({ monitor, responseTimeMs })
        : buildBreakingAlertEmail({
            monitor,
            changes,
            responseTimeMs,
            isFollowUp: alertKind === ALERT_KIND.FOLLOWUP_BREAK,
          });

    return await sendAlertEmail({ to: monitor.alerts?.email, ...email });
  } catch (err) {
    console.error('[alerts] unexpected error while dispatching alert email:', err);
    return { sent: false, reason: 'UNEXPECTED_ERROR', error: err.message };
  }
}