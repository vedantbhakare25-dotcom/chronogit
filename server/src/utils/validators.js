import { badRequest } from './AppError.js';

const URL_RE = /^https?:\/\/.+/i;

/** Fields a client may set when creating a monitor. */
export function parseCreateMonitorInput(body = {}) {
  const errors = [];

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) errors.push('name is required');

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!URL_RE.test(url)) errors.push('url must start with http:// or https://');

  const headers = normalizeHeaders(body.headers, errors);
  const ignorePaths = normalizeIgnorePaths(body.ignorePaths, errors);
  const intervalMinutes = normalizeInterval(body.intervalMinutes, errors);
  const alerts = normalizeAlerts(body.alerts, errors);

  if (errors.length > 0) throw badRequest('Invalid monitor input', errors);

  return { name, url, headers, ignorePaths, intervalMinutes, alerts };
}

/** Fields a client may change on an existing monitor (no url/baseline here on purpose). */
export function parseUpdateMonitorInput(body = {}) {
  const errors = [];
  const update = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) errors.push('name cannot be empty');
    else update.name = name;
  }

  if (body.headers !== undefined) update.headers = normalizeHeaders(body.headers, errors);
  if (body.ignorePaths !== undefined) update.ignorePaths = normalizeIgnorePaths(body.ignorePaths, errors);
  if (body.intervalMinutes !== undefined) update.intervalMinutes = normalizeInterval(body.intervalMinutes, errors);
  if (body.alerts !== undefined) update.alerts = normalizeAlerts(body.alerts, errors);
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') errors.push('isActive must be a boolean');
    else update.isActive = body.isActive;
  }

  if (errors.length > 0) throw badRequest('Invalid monitor update', errors);
  return update;
}

export function parsePagination(query = {}) {
  const parsed = parseInt(query.limit, 10);
  const limit = Number.isNaN(parsed) ? 20 : Math.min(Math.max(parsed, 1), 100);
  const before = query.before ? new Date(query.before) : null;
  if (before && Number.isNaN(before.getTime())) {
    throw badRequest('Invalid "before" query param', ['before must be an ISO date string']);
  }
  return { limit, before };
}

function normalizeHeaders(headers, errors) {
  if (headers === undefined) return {};
  if (typeof headers !== 'object' || headers === null || Array.isArray(headers)) {
    errors.push('headers must be an object of string -> string');
    return {};
  }
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') {
      errors.push(`headers.${key} must be a string`);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function normalizeIgnorePaths(paths, errors) {
  if (paths === undefined) return [];
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string')) {
    errors.push('ignorePaths must be an array of strings');
    return [];
  }
  const bad = paths.find((p) => !p.startsWith('$'));
  if (bad !== undefined) errors.push(`ignorePaths entries must start with "$" (got "${bad}")`);
  return paths;
}

function normalizeInterval(value, errors) {
  if (value === undefined) return 15;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 1440) {
    errors.push('intervalMinutes must be a number between 1 and 1440');
    return 15;
  }
  return Math.round(n);
}

function normalizeAlerts(alerts, errors) {
  if (alerts === undefined) return {};
  if (typeof alerts !== 'object' || alerts === null) {
    errors.push('alerts must be an object');
    return {};
  }
  const out = {};
  if (alerts.discordWebhookUrl !== undefined) {
    if (alerts.discordWebhookUrl !== null && !URL_RE.test(String(alerts.discordWebhookUrl))) {
      errors.push('alerts.discordWebhookUrl must be a valid URL');
    } else {
      out.discordWebhookUrl = alerts.discordWebhookUrl;
    }
  }
  if (alerts.email !== undefined) out.email = alerts.email;
  if (alerts.notifyOnRecovery !== undefined) {
    if (typeof alerts.notifyOnRecovery !== 'boolean') errors.push('alerts.notifyOnRecovery must be a boolean');
    else out.notifyOnRecovery = alerts.notifyOnRecovery;
  }
  return out;
}