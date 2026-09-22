/**
 * Path notation used for schema entries (a small JSONPath-like format):
 *
 *   $                  the root of the response
 *   $.data.temp        object key
 *   $.items[]          "every element of the array at $.items"
 *   $.items[].price    key inside array elements
 *   $["first-name"]    keys that aren't plain identifiers are bracket-quoted,
 *                      so a key like "a.b" can never be confused with a nested path
 */

export const ROOT = '$';

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function childPath(parent, key) {
  return PLAIN_KEY.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

export function itemPath(parent) {
  return `${parent}[]`;
}

/**
 * True when `path` is `ancestor` itself or lives somewhere underneath it.
 * The boundary check stops "$.prices" from matching "$.pricesTotal".
 */
export function isSameOrDescendant(path, ancestor) {
  if (path === ancestor) return true;
  if (!path.startsWith(ancestor)) return false;
  const next = path[ancestor.length];
  return next === '.' || next === '[';
}

/**
 * Yields every "prefix" of a path that could be a parent, together with the
 * kind of container the path needs that parent to be:
 *
 *   "$.items[].id"  ->  { ancestor: "$",         needs: "object" }
 *                       { ancestor: "$.items",    needs: "array"  }
 *                       { ancestor: "$.items[]",  needs: "object" }
 *
 * Some prefixes may not be real paths (e.g. a "." inside a quoted key), so
 * callers must check that the prefix actually exists in a schema.
 */
export function* candidateParents(path) {
  for (let i = 1; i < path.length; i++) {
    const ch = path[i];
    if (ch !== '.' && ch !== '[') continue;
    const needs = ch === '[' && path[i + 1] === ']' ? 'array' : 'object';
    yield { ancestor: path.slice(0, i), needs };
  }
}