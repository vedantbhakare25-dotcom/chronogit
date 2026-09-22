import { candidateParents, isSameOrDescendant } from './paths.js';

/**
 * @typedef {import('./extractSchema.js').SchemaEntry} SchemaEntry
 *
 * @typedef {Object} SchemaChange
 * @property {string}   path
 * @property {'ADDED'|'REMOVED'|'TYPE_CHANGED'} kind
 * @property {string[]} from       types in the baseline ([] if the path is new)
 * @property {string[]} to         types in the latest response ([] if the path is gone)
 * @property {boolean}  breaking
 */

const isUnknown = (types) => types.length === 1 && types[0] === 'unknown';
const isNullOnly = (types) => types.length === 1 && types[0] === 'null';
const sameTypes = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

function toMap(schema, label) {
  if (!Array.isArray(schema)) {
    throw new TypeError(`${label} schema must be an array of { path, types } entries`);
  }
  return new Map(schema.map(({ path, types }) => [path, [...types].sort()]));
}

function isIgnored(path, ignorePaths) {
  return ignorePaths.some((ignored) => isSameOrDescendant(path, ignored));
}

/** Decide what (if anything) changed for one path. */
function classify(path, from, to) {
  if (!from) return { path, kind: 'ADDED', from: [], to, breaking: false };
  if (!to) return { path, kind: 'REMOVED', from, to: [], breaking: true };
  if (sameTypes(from, to)) return null;

  // Latest was an empty array: we learned nothing, so we can't call it drift.
  if (isUnknown(to)) return null;

  // Baseline was an empty array and now has data: the shape is being learned.
  if (isUnknown(from)) return { path, kind: 'ADDED', from, to, breaking: false };

  // A type the baseline never had is breaking (number -> string, string -> null, ...).
  // A type that merely disappeared (string|null -> string) is not.
  // Exception: a baseline of only "null" tells us nothing about the real type.
  const gained = to.filter((t) => !from.includes(t));
  const breaking = gained.length > 0 && !isNullOnly(from);
  return { path, kind: 'TYPE_CHANGED', from, to, breaking };
}

/**
 * A change is "covered" (redundant) when an ancestor already explains it:
 * the parent was removed, or the parent is no longer the kind of container
 * the path lives in (object -> string, or an array that is now empty).
 * Without this, deleting `user` would report user.name, user.email, ... too.
 */
function isCoveredByAncestor(path, base, next) {
  for (const { ancestor, needs } of candidateParents(path)) {
    const latestTypes = next.get(ancestor);
    if (latestTypes) {
      if (!latestTypes.includes(needs)) return true;
    } else if (base.has(ancestor)) {
      return true; // ancestor existed in the baseline and is gone now
    }
    // Not in either schema: just a "." or "[" inside a quoted key, skip it.
  }
  return false;
}

/**
 * Compares the accepted baseline schema with the latest one.
 *
 *   BREAKING      a path disappeared, or gained a type the baseline never had
 *   NON-BREAKING  a new path appeared, or a type disappeared
 *
 * @param {SchemaEntry[]} baseline
 * @param {SchemaEntry[]} latest
 * @param {{ ignorePaths?: string[] }} [options]  paths (and everything under them) to skip
 * @returns {SchemaChange[]} sorted by path
 */
export function diffSchemas(baseline, latest, { ignorePaths = [] } = {}) {
  const base = toMap(baseline, 'baseline');
  const next = toMap(latest, 'latest');

  const changes = [];
  for (const path of new Set([...base.keys(), ...next.keys()])) {
    if (isIgnored(path, ignorePaths)) continue;
    const change = classify(path, base.get(path), next.get(path));
    if (change) changes.push(change);
  }

  return changes
    .filter((change) => !isCoveredByAncestor(change.path, base, next))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** @param {SchemaChange[]} changes */
export function hasBreakingChanges(changes) {
  return changes.some((change) => change.breaking);
}