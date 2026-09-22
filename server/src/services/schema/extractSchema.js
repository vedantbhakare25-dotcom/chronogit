import { ROOT, childPath, itemPath } from './paths.js';

/**
 * @typedef {Object} SchemaEntry
 * @property {string}   path   e.g. "$.data.items[].price"
 * @property {string[]} types  sorted, e.g. ["null", "string"]
 *
 * Type names: "string" | "number" | "boolean" | "null" | "object" | "array" | "unknown"
 * "unknown" only appears for the elements of an EMPTY array: we saw the array
 * but had nothing to learn the element shape from.
 */

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object') return t;
  throw new TypeError(`Unsupported value type in JSON: ${t}`);
}

/**
 * Walks a parsed JSON value and returns its structure (keys + types) as a
 * flat, sorted list. Scalar VALUES are never recorded, so { temp: 32 } and
 * { temp: -5.5 } produce the identical schema.
 *
 * Arrays are merged: every element is folded into the same "[]" path, so the
 * types of a path are the union across all elements.
 *
 * @param {unknown} json  the result of JSON.parse()
 * @returns {SchemaEntry[]}
 */
export function extractSchema(json) {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map();

  const record = (path, type) => {
    if (!seen.has(path)) seen.set(path, new Set());
    seen.get(path).add(type);
  };

  const walk = (node, path) => {
    const type = typeOf(node);
    record(path, type);

    if (type === 'object') {
      for (const [key, value] of Object.entries(node)) {
        walk(value, childPath(path, key));
      }
    } else if (type === 'array') {
      const elementPath = itemPath(path);
      if (node.length === 0) {
        record(elementPath, 'unknown');
      } else {
        for (const item of node) walk(item, elementPath);
      }
    }
  };

  walk(json, ROOT);

  return [...seen.entries()]
    .map(([path, types]) => {
      // "unknown" (from an empty array) only matters if nothing better was seen
      if (types.size > 1) types.delete('unknown');
      return { path, types: [...types].sort() };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}