import { describe, it, expect } from 'vitest';
import { ALERT_KIND, decideAlertKind, toCheckLogAlertSent } from '../../src/services/alerts/alertEngine.js';

const FP_A = 'fingerprint-a';
const FP_B = 'fingerprint-b';

describe('decideAlertKind: becoming BREAKING', () => {
  it('is INITIAL_BREAK when coming from HEALTHY', () => {
    expect(
      decideAlertKind({ previousStatus: 'HEALTHY', previousFingerprint: null, newStatus: 'BREAKING', newFingerprint: FP_A, notifyOnRecovery: true })
    ).toBe(ALERT_KIND.INITIAL_BREAK);
  });

  it('is INITIAL_BREAK when coming from ERROR (a fetch failure does not count as an open break)', () => {
    expect(
      decideAlertKind({ previousStatus: 'ERROR', previousFingerprint: null, newStatus: 'BREAKING', newFingerprint: FP_A, notifyOnRecovery: true })
    ).toBe(ALERT_KIND.INITIAL_BREAK);
  });

  it('is INITIAL_BREAK when coming from PENDING (a brand-new monitor’s first bad check)', () => {
    expect(
      decideAlertKind({ previousStatus: 'PENDING', previousFingerprint: null, newStatus: 'BREAKING', newFingerprint: FP_A, notifyOnRecovery: true })
    ).toBe(ALERT_KIND.INITIAL_BREAK);
  });

  it('is silent (null) when still BREAKING with the same fingerprint', () => {
    expect(
      decideAlertKind({ previousStatus: 'BREAKING', previousFingerprint: FP_A, newStatus: 'BREAKING', newFingerprint: FP_A, notifyOnRecovery: true })
    ).toBeNull();
  });

  it('is FOLLOWUP_BREAK when still BREAKING but the fingerprint changed (new damage)', () => {
    expect(
      decideAlertKind({ previousStatus: 'BREAKING', previousFingerprint: FP_A, newStatus: 'BREAKING', newFingerprint: FP_B, notifyOnRecovery: true })
    ).toBe(ALERT_KIND.FOLLOWUP_BREAK);
  });

  it('notifyOnRecovery has no bearing on breaking alerts either way', () => {
    expect(
      decideAlertKind({ previousStatus: 'HEALTHY', previousFingerprint: null, newStatus: 'BREAKING', newFingerprint: FP_A, notifyOnRecovery: false })
    ).toBe(ALERT_KIND.INITIAL_BREAK);
  });
});

describe('decideAlertKind: recovering to HEALTHY', () => {
  it('is RECOVERY when coming from BREAKING and notifyOnRecovery is true', () => {
    expect(
      decideAlertKind({ previousStatus: 'BREAKING', previousFingerprint: FP_A, newStatus: 'HEALTHY', newFingerprint: null, notifyOnRecovery: true })
    ).toBe(ALERT_KIND.RECOVERY);
  });

  it('is silent (null) when coming from BREAKING but notifyOnRecovery is false', () => {
    expect(
      decideAlertKind({ previousStatus: 'BREAKING', previousFingerprint: FP_A, newStatus: 'HEALTHY', newFingerprint: null, notifyOnRecovery: false })
    ).toBeNull();
  });

  it('is silent (null) when already HEALTHY (nothing to recover from)', () => {
    expect(
      decideAlertKind({ previousStatus: 'HEALTHY', previousFingerprint: null, newStatus: 'HEALTHY', newFingerprint: null, notifyOnRecovery: true })
    ).toBeNull();
  });

  it('is silent (null) when coming from ERROR (an error clearing up is not a "recovery" from drift)', () => {
    expect(
      decideAlertKind({ previousStatus: 'ERROR', previousFingerprint: null, newStatus: 'HEALTHY', newFingerprint: null, notifyOnRecovery: true })
    ).toBeNull();
  });
});

describe('toCheckLogAlertSent', () => {
  it('maps both breaking alert kinds to "BREAKING"', () => {
    expect(toCheckLogAlertSent(ALERT_KIND.INITIAL_BREAK)).toBe('BREAKING');
    expect(toCheckLogAlertSent(ALERT_KIND.FOLLOWUP_BREAK)).toBe('BREAKING');
  });

  it('maps RECOVERY to "RECOVERY"', () => {
    expect(toCheckLogAlertSent(ALERT_KIND.RECOVERY)).toBe('RECOVERY');
  });

  it('maps null/undefined (no alert) to undefined', () => {
    expect(toCheckLogAlertSent(null)).toBeUndefined();
    expect(toCheckLogAlertSent(undefined)).toBeUndefined();
  });
});