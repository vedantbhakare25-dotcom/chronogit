import { describe, it, expect } from 'vitest';
import {
  parseCreateMonitorInput,
  parseUpdateMonitorInput,
  parsePagination,
} from '../../src/utils/validators.js';
import { AppError } from '../../src/utils/AppError.js';

describe('parseCreateMonitorInput', () => {
  it('accepts a minimal valid input and fills in defaults', () => {
    const result = parseCreateMonitorInput({ name: 'Weather API', url: 'https://api.example.com/weather' });
    expect(result).toEqual({
      name: 'Weather API',
      url: 'https://api.example.com/weather',
      headers: {},
      ignorePaths: [],
      intervalMinutes: 15,
      alerts: {},
    });
  });

  it('trims the name and url', () => {
    const result = parseCreateMonitorInput({ name: '  Weather  ', url: '  https://api.example.com  ' });
    expect(result.name).toBe('Weather');
    expect(result.url).toBe('https://api.example.com');
  });

  it('rejects a missing name', () => {
    expect(() => parseCreateMonitorInput({ url: 'https://api.example.com' })).toThrow(AppError);
  });

  it('rejects a url without http/https', () => {
    expect(() => parseCreateMonitorInput({ name: 'x', url: 'ftp://api.example.com' })).toThrow(AppError);
    expect(() => parseCreateMonitorInput({ name: 'x', url: 'not-a-url' })).toThrow(AppError);
  });

  it('rejects headers that are not an object of strings', () => {
    expect(() =>
      parseCreateMonitorInput({ name: 'x', url: 'https://a.com', headers: 'nope' })
    ).toThrow(AppError);
    expect(() =>
      parseCreateMonitorInput({ name: 'x', url: 'https://a.com', headers: { key: 5 } })
    ).toThrow(AppError);
  });

  it('rejects ignorePaths that do not start with "$"', () => {
    expect(() =>
      parseCreateMonitorInput({ name: 'x', url: 'https://a.com', ignorePaths: ['data.prices'] })
    ).toThrow(AppError);
  });

  it('accepts valid ignorePaths', () => {
    const result = parseCreateMonitorInput({
      name: 'x',
      url: 'https://a.com',
      ignorePaths: ['$.prices', '$.items[].ts'],
    });
    expect(result.ignorePaths).toEqual(['$.prices', '$.items[].ts']);
  });

  it('rejects an intervalMinutes outside 1..1440', () => {
    expect(() =>
      parseCreateMonitorInput({ name: 'x', url: 'https://a.com', intervalMinutes: 0 })
    ).toThrow(AppError);
    expect(() =>
      parseCreateMonitorInput({ name: 'x', url: 'https://a.com', intervalMinutes: 5000 })
    ).toThrow(AppError);
  });

  it('rounds a fractional intervalMinutes', () => {
    const result = parseCreateMonitorInput({ name: 'x', url: 'https://a.com', intervalMinutes: 15.6 });
    expect(result.intervalMinutes).toBe(16);
  });

  it('validates alerts.discordWebhookUrl when present', () => {
    expect(() =>
      parseCreateMonitorInput({
        name: 'x',
        url: 'https://a.com',
        alerts: { discordWebhookUrl: 'not-a-url' },
      })
    ).toThrow(AppError);

    const result = parseCreateMonitorInput({
      name: 'x',
      url: 'https://a.com',
      alerts: { discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc' },
    });
    expect(result.alerts.discordWebhookUrl).toBe('https://discord.com/api/webhooks/123/abc');
  });

  it('collects every validation error at once', () => {
    try {
      parseCreateMonitorInput({ url: 'ftp://bad', intervalMinutes: -1 });
      throw new Error('expected parseCreateMonitorInput to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.details.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('parseUpdateMonitorInput', () => {
  it('only includes fields that were actually provided', () => {
    expect(parseUpdateMonitorInput({ name: 'New name' })).toEqual({ name: 'New name' });
    expect(parseUpdateMonitorInput({ isActive: false })).toEqual({ isActive: false });
  });

  it('does not accept a url change (immutable after creation)', () => {
    const result = parseUpdateMonitorInput({ url: 'https://different.com' });
    expect(result.url).toBeUndefined();
  });

  it('rejects an empty name', () => {
    expect(() => parseUpdateMonitorInput({ name: '   ' })).toThrow(AppError);
  });

  it('rejects a non-boolean isActive', () => {
    expect(() => parseUpdateMonitorInput({ isActive: 'yes' })).toThrow(AppError);
  });

  it('returns an empty object for an empty update', () => {
    expect(parseUpdateMonitorInput({})).toEqual({});
  });
});

describe('parsePagination', () => {
  it('defaults to a limit of 20 and no cursor', () => {
    expect(parsePagination({})).toEqual({ limit: 20, before: null });
  });

  it('clamps limit to the 1..100 range', () => {
    expect(parsePagination({ limit: '0' }).limit).toBe(1);
    expect(parsePagination({ limit: '500' }).limit).toBe(100);
    expect(parsePagination({ limit: 'not-a-number' }).limit).toBe(20);
  });

  it('parses a valid "before" cursor into a Date', () => {
    const { before } = parsePagination({ before: '2026-09-22T00:00:00.000Z' });
    expect(before).toBeInstanceOf(Date);
    expect(before.toISOString()).toBe('2026-09-22T00:00:00.000Z');
  });

  it('rejects an invalid "before" cursor', () => {
    expect(() => parsePagination({ before: 'not-a-date' })).toThrow(AppError);
  });
});