import { describe, it, expect } from 'vitest';
import {
  ROOT,
  childPath,
  itemPath,
  isSameOrDescendant,
  candidateParents,
} from '../../src/services/schema/paths.js';

describe('childPath', () => {
  it('uses dot notation for plain identifiers', () => {
    expect(childPath(ROOT, 'temp')).toBe('$.temp');
    expect(childPath('$.data', 'user_id')).toBe('$.data.user_id');
  });

  it('bracket-quotes keys that are not plain identifiers', () => {
    expect(childPath(ROOT, 'first-name')).toBe('$["first-name"]');
    expect(childPath(ROOT, 'a.b')).toBe('$["a.b"]');
    expect(childPath(ROOT, '2026-09-22')).toBe('$["2026-09-22"]');
    expect(childPath(ROOT, '')).toBe('$[""]');
  });

  it('escapes quotes inside keys', () => {
    expect(childPath(ROOT, 'say "hi"')).toBe('$["say \\"hi\\""]');
  });
});

describe('itemPath', () => {
  it('appends [] to the array path', () => {
    expect(itemPath('$.items')).toBe('$.items[]');
    expect(itemPath(itemPath('$.matrix'))).toBe('$.matrix[][]');
  });
});

describe('isSameOrDescendant', () => {
  it('matches the path itself and anything beneath it', () => {
    expect(isSameOrDescendant('$.prices', '$.prices')).toBe(true);
    expect(isSameOrDescendant('$.prices.usd', '$.prices')).toBe(true);
    expect(isSameOrDescendant('$.prices[].usd', '$.prices')).toBe(true);
    expect(isSameOrDescendant('$.prices["2026-09-22"]', '$.prices')).toBe(true);
  });

  it('does not match siblings that merely share a prefix', () => {
    expect(isSameOrDescendant('$.pricesTotal', '$.prices')).toBe(false);
    expect(isSameOrDescendant('$.price', '$.prices')).toBe(false);
  });
});

describe('candidateParents', () => {
  it('lists each prefix with the container type the path needs', () => {
    expect([...candidateParents('$.items[].id')]).toEqual([
      { ancestor: '$', needs: 'object' },
      { ancestor: '$.items', needs: 'array' },
      { ancestor: '$.items[]', needs: 'object' },
    ]);
  });

  it('yields nothing for the root', () => {
    expect([...candidateParents('$')]).toEqual([]);
  });
});