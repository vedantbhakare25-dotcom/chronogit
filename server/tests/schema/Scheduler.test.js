import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above imports, so anything they reference
// must go through vi.hoisted() to avoid a temporal-dead-zone error.
const { scheduleMock } = vi.hoisted(() => ({ scheduleMock: vi.fn() }));

vi.mock('node-cron', () => ({
  default: { schedule: (...args) => scheduleMock(...args) },
}));
vi.mock('../../src/models/Monitor.js', () => ({ default: { find: vi.fn() } }));
vi.mock('../../src/services/checkRunner.js', () => ({ runCheck: vi.fn() }));

import Monitor from '../../src/models/Monitor.js';
import { runCheck } from '../../src/services/checkRunner.js';
import {
  runDueChecks,
  startScheduler,
  stopScheduler,
  isSchedulerTickRunning,
} from '../../src/jobs/scheduler.js';

/** Flushes pending microtasks AND macrotasks — used after firing a "tick" callback
 *  that kicks off async work without being awaited itself (fire-and-forget). */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.resetAllMocks();
  scheduleMock.mockReturnValue({ stop: vi.fn() });
  stopScheduler(); // clear any task left registered by a previous test
});

describe('runDueChecks', () => {
  it('does nothing when no monitors are due', async () => {
    Monitor.find.mockResolvedValue([]);

    const result = await runDueChecks();

    expect(result).toEqual({ checked: 0, succeeded: 0, failed: 0 });
    expect(runCheck).not.toHaveBeenCalled();
  });

  it('queries only active monitors whose nextCheckAt has arrived', async () => {
    Monitor.find.mockResolvedValue([]);
    const before = Date.now();

    await runDueChecks();

    expect(Monitor.find).toHaveBeenCalledTimes(1);
    const [filter] = Monitor.find.mock.calls[0];
    expect(filter.isActive).toBe(true);
    expect(filter.nextCheckAt.$lte).toBeInstanceOf(Date);
    expect(filter.nextCheckAt.$lte.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('runs every due monitor and reports how many succeeded', async () => {
    Monitor.find.mockResolvedValue([{ _id: 'm1' }, { _id: 'm2' }, { _id: 'm3' }]);
    runCheck.mockResolvedValue({ outcome: 'OK' });

    const result = await runDueChecks();

    expect(runCheck).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ checked: 3, succeeded: 3, failed: 0 });
  });

  it('runs due monitors concurrently, not one at a time', async () => {
    Monitor.find.mockResolvedValue([{ _id: 'm1' }, { _id: 'm2' }]);
    const resolvers = [];
    runCheck.mockImplementation(
      () => new Promise((resolve) => resolvers.push(() => resolve({ outcome: 'OK' })))
    );

    const pending = runDueChecks();
    await flush();

    // Both calls must have been made before either resolved — proves they
    // were started together (Promise.allSettled), not awaited in sequence.
    expect(runCheck).toHaveBeenCalledTimes(2);

    resolvers.forEach((resolve) => resolve());
    await pending;
  });

  it('does not let one monitor’s failure stop or fail the others', async () => {
    Monitor.find.mockResolvedValue([{ _id: 'm1' }, { _id: 'm2' }]);
    runCheck.mockImplementation(async (monitor) => {
      if (monitor._id === 'm1') throw new Error('boom');
      return { outcome: 'OK' };
    });
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runDueChecks();

    expect(result).toEqual({ checked: 2, succeeded: 1, failed: 1 });
    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('m1'),
      expect.any(Error)
    );
  });

  it('never runs two ticks at once: a tick already in progress makes the next call skip', async () => {
    Monitor.find.mockResolvedValue([{ _id: 'm1' }]);
    let resolveRunCheck;
    runCheck.mockReturnValue(new Promise((resolve) => { resolveRunCheck = resolve; }));

    const first = runDueChecks();
    expect(isSchedulerTickRunning()).toBe(true); // set synchronously, before any await resolves

    const second = await runDueChecks();
    expect(second).toEqual({ skipped: true });
    expect(Monitor.find).toHaveBeenCalledTimes(1); // second call never even queried

    resolveRunCheck({ outcome: 'OK' });
    const firstResult = await first;

    expect(firstResult).toEqual({ checked: 1, succeeded: 1, failed: 0 });
    expect(isSchedulerTickRunning()).toBe(false); // released once the tick finishes
  });

  it('releases the running flag even when Monitor.find itself fails', async () => {
    Monitor.find.mockRejectedValue(new Error('connection lost'));

    await expect(runDueChecks()).rejects.toThrow('connection lost');
    expect(isSchedulerTickRunning()).toBe(false);
  });
});

describe('startScheduler / stopScheduler', () => {
  it('registers a cron task with the default every-minute schedule', () => {
    startScheduler();

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.calls[0][0]).toBe('* * * * *');
    expect(typeof scheduleMock.mock.calls[0][1]).toBe('function');
  });

  it('accepts a custom cron expression', () => {
    startScheduler({ schedule: '*/5 * * * *' });
    expect(scheduleMock.mock.calls[0][0]).toBe('*/5 * * * *');
  });

  it('is idempotent — a second call does not register a second task', () => {
    const first = startScheduler();
    const second = startScheduler();

    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('stop() stops the underlying task and clears it, so a later start creates a fresh one', () => {
    const fakeTask = { stop: vi.fn() };
    scheduleMock.mockReturnValue(fakeTask);

    startScheduler();
    stopScheduler();
    expect(fakeTask.stop).toHaveBeenCalledTimes(1);

    startScheduler();
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('stop() is a harmless no-op when nothing was ever started', () => {
    expect(() => stopScheduler()).not.toThrow();
  });

  it('the registered callback runs a real check pass when a tick fires', async () => {
    Monitor.find.mockResolvedValue([{ _id: 'm1' }]);
    runCheck.mockResolvedValue({ outcome: 'OK' });

    startScheduler();
    const tickCallback = scheduleMock.mock.calls[0][1];

    tickCallback(); // simulate node-cron firing a tick — no real timer needed
    await flush();

    expect(Monitor.find).toHaveBeenCalledTimes(1);
    expect(runCheck).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm1' }));
  });

  it('a failure inside a tick is logged, not thrown, so cron keeps ticking', async () => {
    Monitor.find.mockRejectedValue(new Error('db unreachable'));
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

    startScheduler();
    const tickCallback = scheduleMock.mock.calls[0][1];

    expect(() => tickCallback()).not.toThrow();
    await flush();

    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('tick failed'),
      expect.any(Error)
    );
  });
});