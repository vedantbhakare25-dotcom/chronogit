import crypto from 'node:crypto';
import { diffSchemas } from './schema/index.js';

export function computeDriftFingerprint(changes) {
  if (!changes?.length) return null;
  return crypto.createHash('sha256').update(JSON.stringify(changes)).digest('hex');
}

export function getVisiblePendingChanges(monitor) {
  const changes = diffSchemas(monitor.baselineSchema, monitor.latestSchema, {
    ignorePaths: monitor.ignorePaths,
  });
  if (computeDriftFingerprint(changes) === monitor.dismissedDriftFingerprint) return [];
  return changes;
}
