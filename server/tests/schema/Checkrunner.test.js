import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/fetcher.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchJson: vi.fn() };
});
vi.mock('../../src/models/CheckLog.js', () => ({
  default: { create: vi.fn(async (doc) => ({ _id: 'log-' + Math.random().toString(36).slice(2), ...doc })) },
}));
// Mocked only at the actual I/O boundary — decideAlertKind, dispatchAlert,
// and the email templates all run for real, so these tests prove the
// wiring, not just that some mock was called.
vi.mock('../../src/services/alerts/emailDispatcher.js', () => ({
  sendAlertEmail: vi.fn().mockResolvedValue({ sent: true }),
}));

import { fetchJson, FetchError } from '../../src/services/fetcher.js';
import CheckLog from '../../src/models/CheckLog.js';
import { sendAlertEmail } from '../../src/services/alerts/emailDispatcher.js';
import { runCheck, computeBreakingFingerprint } from '../../src/services/checkRunner.js';

/** A fake Monitor document — a plain object with the fields runCheck reads/writes, plus a spy-able save(). */
function makeMonitor(overrides = {}) {
  return {
    _id: 'monitor-1',
    name: 'Weather API',
    url: 'https://api.example.com/weather',
    headers: new Map(),
    ignorePaths: [],
    intervalMinutes: 15,
    baselineSchema: [
      { path: '$', types: ['object'] },
      { path: '$.temp', types: ['number'] },
    ],
    latestSchema: [
      { path: '$', types: ['object'] },
      { path: '$.temp', types: ['number'] },
    ],
    status: 'HEALTHY',
    lastBreakingFingerprint: null,
    lastCheckedAt: null,
    nextCheckAt: null,
    alerts: { email: 'ops@example.com', notifyOnRecovery: true },
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runCheck: success, no drift', () => {
  it('logs OK and keeps the monitor HEALTHY', async () => {
    fetchJson.mockResolvedValue({ json: { temp: -4 }, status: 200, responseTimeMs: 12 });
    const monitor = makeMonitor();

    const { checkLog, outcome } = await runCheck(monitor);

    expect(outcome).toBe('OK');
    expect(checkLog.outcome).toBe('OK');
    expect(checkLog.changes).toEqual([]);
    expect(checkLog.httpStatus).toBe(200);
    expect(checkLog.monitorId).toBe('monitor-1');

    expect(monitor.status).toBe('HEALTHY');
    expect(monitor.lastBreakingFingerprint).toBeNull();
    expect(monitor.latestSchema).toEqual(monitor.baselineSchema);
    expect(monitor.lastCheckedAt).toBeInstanceOf(Date);
    expect(monitor.nextCheckAt.getTime() - monitor.lastCheckedAt.getTime()).toBe(15 * 60_000);
    expect(monitor.save).toHaveBeenCalledTimes(1);
  });

  it('ignores scalar-only value changes (the core drift rule)', async () => {
    fetchJson.mockResolvedValue({ json: { temp: 100 }, status: 200 });
    const monitor = makeMonitor();

    const { outcome } = await runCheck(monitor);
    expect(outcome).toBe('OK');
  });
});

describe('runCheck: success, non-breaking drift', () => {
  it('logs NON_BREAKING and keeps the monitor HEALTHY', async () => {
    fetchJson.mockResolvedValue({ json: { temp: -4, humidity: 60 }, status: 200 });
    const monitor = makeMonitor();

    const { checkLog, outcome } = await runCheck(monitor);

    expect(outcome).toBe('NON_BREAKING');
    expect(checkLog.outcome).toBe('NON_BREAKING');
    expect(checkLog.changes).toEqual([
      { path: '$.humidity', kind: 'ADDED', from: [], to: ['number'], breaking: false },
    ]);

    expect(monitor.status).toBe('HEALTHY');
    expect(monitor.lastBreakingFingerprint).toBeNull();
    expect(monitor.latestSchema).toEqual(
      expect.arrayContaining([{ path: '$.humidity', types: ['number'] }])
    );
  });
});

describe('runCheck: success, breaking drift', () => {
  it('logs BREAKING, flips the monitor to BREAKING, and sets a fingerprint', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 }); // number -> string
    const monitor = makeMonitor();

    const { checkLog, outcome } = await runCheck(monitor);

    expect(outcome).toBe('BREAKING');
    expect(checkLog.outcome).toBe('BREAKING');
    expect(checkLog.changes).toEqual([
      { path: '$.temp', kind: 'TYPE_CHANGED', from: ['number'], to: ['string'], breaking: true },
    ]);

    expect(monitor.status).toBe('BREAKING');
    expect(typeof monitor.lastBreakingFingerprint).toBe('string');
    expect(monitor.lastBreakingFingerprint).toHaveLength(64); // sha256 hex
  });

  it('does not touch the baseline, only latestSchema', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();
    const originalBaseline = monitor.baselineSchema;

    await runCheck(monitor);

    expect(monitor.baselineSchema).toBe(originalBaseline); // untouched, same reference
  });

  it('keeps the same fingerprint across repeated checks with the same break', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();

    await runCheck(monitor);
    const first = monitor.lastBreakingFingerprint;

    await runCheck(monitor); // same broken response again
    const second = monitor.lastBreakingFingerprint;

    expect(second).toBe(first);
  });

  it('changes the fingerprint when new damage appears on top of an existing break', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();
    await runCheck(monitor);
    const first = monitor.lastBreakingFingerprint;

    fetchJson.mockResolvedValue({ json: {} }); // temp now also missing entirely
    await runCheck(monitor);
    const second = monitor.lastBreakingFingerprint;

    expect(second).not.toBe(first);
  });

  it('recovers to HEALTHY and clears the fingerprint once the response matches baseline again', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();
    await runCheck(monitor);
    expect(monitor.status).toBe('BREAKING');

    fetchJson.mockResolvedValue({ json: { temp: 32 }, status: 200 });
    const { outcome } = await runCheck(monitor);

    expect(outcome).toBe('OK');
    expect(monitor.status).toBe('HEALTHY');
    expect(monitor.lastBreakingFingerprint).toBeNull();
  });
});

describe('runCheck: fetch failure', () => {
  it('logs ERROR with the failure code’s status/message and does not touch either schema', async () => {
    fetchJson.mockRejectedValue(
      new FetchError('TIMEOUT', 'No response within 10000ms')
    );
    const monitor = makeMonitor();
    const originalBaseline = monitor.baselineSchema;
    const originalLatest = monitor.latestSchema;

    const { checkLog, outcome } = await runCheck(monitor);

    expect(outcome).toBe('ERROR');
    expect(checkLog.outcome).toBe('ERROR');
    expect(checkLog.errorMessage).toBe('No response within 10000ms');
    expect(checkLog.httpStatus).toBeNull();
    expect(checkLog.changes).toEqual([]);

    expect(monitor.status).toBe('ERROR');
    expect(monitor.baselineSchema).toBe(originalBaseline);
    expect(monitor.latestSchema).toBe(originalLatest);
    expect(monitor.lastCheckedAt).toBeInstanceOf(Date);
    expect(monitor.save).toHaveBeenCalledTimes(1);
  });

  it('carries the HTTP status through when the fetch failure had one', async () => {
    fetchJson.mockRejectedValue(new FetchError('HTTP_ERROR', 'Endpoint returned HTTP 500', { status: 500 }));
    const monitor = makeMonitor();

    const { checkLog } = await runCheck(monitor);
    expect(checkLog.httpStatus).toBe(500);
  });

  it('overrides a prior BREAKING status with ERROR (fetch failure takes priority for visibility)', async () => {
    const monitor = makeMonitor({ status: 'BREAKING', lastBreakingFingerprint: 'abc123' });
    fetchJson.mockRejectedValue(new FetchError('NETWORK_ERROR', 'getaddrinfo ENOTFOUND'));

    await runCheck(monitor);

    expect(monitor.status).toBe('ERROR');
    // fingerprint from the prior break is left as-is; it's not what ERROR is about
    expect(monitor.lastBreakingFingerprint).toBe('abc123');
  });

  it('does not call CheckLog.create with an ERROR log missing a message', async () => {
    fetchJson.mockRejectedValue(new FetchError('BAD_CONTENT_TYPE', 'Expected JSON, got text/html'));
    await runCheck(makeMonitor());

    expect(CheckLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'ERROR', errorMessage: 'Expected JSON, got text/html' })
    );
  });
});

describe('runCheck: request shape', () => {
  it('sends the monitor’s headers as a plain object', async () => {
    fetchJson.mockResolvedValue({ json: { temp: 1 }, status: 200 });
    const monitor = makeMonitor({ headers: new Map([['x-api-key', 'secret']]) });

    await runCheck(monitor);

    expect(fetchJson).toHaveBeenCalledWith(
      expect.objectContaining({ url: monitor.url, headers: { 'x-api-key': 'secret' } })
    );
  });

  it('respects ignorePaths when diffing', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor({ ignorePaths: ['$.temp'] });

    const { outcome } = await runCheck(monitor);
    expect(outcome).toBe('OK');
  });
});

describe('computeBreakingFingerprint', () => {
  it('returns null when there are no breaking changes', () => {
    expect(computeBreakingFingerprint([])).toBeNull();
    expect(
      computeBreakingFingerprint([{ path: '$.x', kind: 'ADDED', from: [], to: ['number'], breaking: false }])
    ).toBeNull();
  });

  it('is deterministic regardless of input order', () => {
    const a = { path: '$.a', kind: 'REMOVED', from: ['string'], to: [], breaking: true };
    const b = { path: '$.b', kind: 'TYPE_CHANGED', from: ['number'], to: ['string'], breaking: true };

    expect(computeBreakingFingerprint([a, b])).toBe(computeBreakingFingerprint([b, a]));
  });

  it('differs when the breaking changes differ', () => {
    const fp1 = computeBreakingFingerprint([{ path: '$.a', kind: 'REMOVED', from: ['string'], to: [], breaking: true }]);
    const fp2 = computeBreakingFingerprint([{ path: '$.b', kind: 'REMOVED', from: ['string'], to: [], breaking: true }]);
    expect(fp1).not.toBe(fp2);
  });

  it('differs when the same path breaks in a different way', () => {
    const fp1 = computeBreakingFingerprint([
      { path: '$.a', kind: 'TYPE_CHANGED', from: ['number'], to: ['string'], breaking: true },
    ]);
    const fp2 = computeBreakingFingerprint([
      { path: '$.a', kind: 'TYPE_CHANGED', from: ['number'], to: ['boolean'], breaking: true },
    ]);
    expect(fp1).not.toBe(fp2);
  });
});

describe('runCheck: alert integration (real decision logic + templates, mocked email transport)', () => {
  it('sends an initial breaking alert on HEALTHY -> BREAKING', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 }); // number -> string
    const monitor = makeMonitor();

    const { checkLog } = await runCheck(monitor);

    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        subject: expect.stringContaining('Breaking Schema Drift Detected'),
      })
    );
    expect(checkLog.alertSent).toBe('BREAKING');
  });

  it('does not alert on a normal OK check', async () => {
    fetchJson.mockResolvedValue({ json: { temp: 40 }, status: 200 });
    const { checkLog } = await runCheck(makeMonitor());

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(checkLog.alertSent).toBeUndefined();
  });

  it('does not alert on NON_BREAKING drift', async () => {
    fetchJson.mockResolvedValue({ json: { temp: 40, humidity: 60 }, status: 200 });
    const { checkLog } = await runCheck(makeMonitor());

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(checkLog.alertSent).toBeUndefined();
  });

  it('never alerts on a fetch/ERROR outcome', async () => {
    fetchJson.mockRejectedValue(new FetchError('TIMEOUT', 'No response within 10000ms'));
    const { checkLog } = await runCheck(makeMonitor());

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(checkLog.alertSent).toBeUndefined();
  });

  it('stays silent on a repeated check with the identical break', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();

    await runCheck(monitor); // initial break — 1 email
    await runCheck(monitor); // same break again — should NOT alert again

    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
  });

  it('sends a follow-up alert when new damage appears on top of an existing break', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();
    await runCheck(monitor); // initial break

    fetchJson.mockResolvedValue({ json: {} }); // temp now also missing entirely: new damage
    const { checkLog } = await runCheck(monitor);

    expect(sendAlertEmail).toHaveBeenCalledTimes(2);
    expect(sendAlertEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ subject: expect.stringContaining('New Breaking Changes Detected') })
    );
    expect(checkLog.alertSent).toBe('BREAKING');
  });

  it('sends a recovery alert once the endpoint matches baseline again', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor();
    await runCheck(monitor); // break

    fetchJson.mockResolvedValue({ json: { temp: 32 }, status: 200 }); // back to normal
    const { checkLog } = await runCheck(monitor);

    expect(sendAlertEmail).toHaveBeenCalledTimes(2);
    expect(sendAlertEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'ops@example.com', subject: expect.stringContaining('API Recovered') })
    );
    expect(checkLog.alertSent).toBe('RECOVERY');
  });

  it('does not send a recovery alert when notifyOnRecovery is false', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor({ alerts: { email: 'ops@example.com', notifyOnRecovery: false } });
    await runCheck(monitor); // break (still alerts — recovery-only setting)

    fetchJson.mockResolvedValue({ json: { temp: 32 }, status: 200 });
    const { checkLog } = await runCheck(monitor);

    expect(sendAlertEmail).toHaveBeenCalledTimes(1); // only the initial break, no recovery
    expect(checkLog.alertSent).toBeUndefined();
  });

  it('does not crash when the monitor has no alert email configured', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    const monitor = makeMonitor({ alerts: {} });

    await expect(runCheck(monitor)).resolves.toMatchObject({ outcome: 'BREAKING' });
    expect(sendAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ to: undefined }));
  });

  it('does not let an email dispatch failure affect the returned result', async () => {
    fetchJson.mockResolvedValue({ json: { temp: '32' }, status: 200 });
    sendAlertEmail.mockRejectedValueOnce(new Error('smtp down'));

    // dispatchAlert (the real, unmocked function) wraps sendAlertEmail in its
    // own try/catch, so even a rejection here must not reach runCheck.
    await expect(runCheck(makeMonitor())).resolves.toMatchObject({ outcome: 'BREAKING' });
  });
});