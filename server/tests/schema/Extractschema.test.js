import { describe, it, expect } from 'vitest';
import { extractSchema } from '../../src/services/schema/extractSchema.js';

/** Small helper: { path: types } is easier to read than the raw entry list. */
const asMap = (schema) => Object.fromEntries(schema.map((e) => [e.path, e.types]));

describe('extractSchema: basic shapes', () => {
  it('records the type of every key, plus the root', () => {
    const schema = extractSchema({ id: 1, name: 'Asha', active: true, nickname: null });

    expect(schema).toEqual([
      { path: '$', types: ['object'] },
      { path: '$.active', types: ['boolean'] },
      { path: '$.id', types: ['number'] },
      { path: '$.name', types: ['string'] },
      { path: '$.nickname', types: ['null'] },
    ]);
  });

  it('walks nested objects using dotted paths', () => {
    const schema = asMap(extractSchema({ data: { user: { id: 7 } } }));

    expect(schema).toEqual({
      $: ['object'],
      '$.data': ['object'],
      '$.data.user': ['object'],
      '$.data.user.id': ['number'],
    });
  });

  it('treats integers and floats as the same "number" type', () => {
    const schema = asMap(extractSchema({ a: 1, b: 1.5, c: -0.25, d: 1e21 }));
    expect(schema['$.a']).toEqual(['number']);
    expect(schema['$.b']).toEqual(['number']);
    expect(schema['$.c']).toEqual(['number']);
    expect(schema['$.d']).toEqual(['number']);
  });

  it('handles an empty object', () => {
    expect(extractSchema({})).toEqual([{ path: '$', types: ['object'] }]);
  });

  it('handles primitive and array roots', () => {
    expect(extractSchema(42)).toEqual([{ path: '$', types: ['number'] }]);
    expect(extractSchema('ok')).toEqual([{ path: '$', types: ['string'] }]);
    expect(extractSchema(null)).toEqual([{ path: '$', types: ['null'] }]);
    expect(asMap(extractSchema([{ id: 1 }]))).toEqual({
      $: ['array'],
      '$[]': ['object'],
      '$[].id': ['number'],
    });
  });
});

describe('extractSchema: values never matter, only structure', () => {
  it('produces identical schemas when only scalar values change', () => {
    const monday = { temp: 32, city: 'Pune', at: '2026-09-22T10:00:00Z', ok: true };
    const tuesday = { temp: -5.5, city: 'Delhi', at: '2027-01-01T00:00:00Z', ok: false };

    expect(extractSchema(monday)).toEqual(extractSchema(tuesday));
  });

  it('does not depend on key order', () => {
    expect(extractSchema({ a: 1, b: 'x' })).toEqual(extractSchema({ b: 'y', a: 2 }));
  });
});

describe('extractSchema: arrays', () => {
  it('merges the keys of all elements into one "[]" path', () => {
    const schema = asMap(
      extractSchema({ items: [{ id: 1, name: 'a' }, { id: 2, price: 9.5 }] })
    );

    expect(schema).toEqual({
      $: ['object'],
      '$.items': ['array'],
      '$.items[]': ['object'],
      '$.items[].id': ['number'],
      '$.items[].name': ['string'],
      '$.items[].price': ['number'],
    });
  });

  it('unions the types of mixed elements (sorted)', () => {
    const schema = asMap(extractSchema({ values: [1, 'two', null, 3] }));
    expect(schema['$.values[]']).toEqual(['null', 'number', 'string']);
  });

  it('unions types of the same key across elements, including null', () => {
    const schema = asMap(extractSchema({ items: [{ note: null }, { note: 'hi' }] }));
    expect(schema['$.items[].note']).toEqual(['null', 'string']);
  });

  it('supports nested arrays', () => {
    const schema = asMap(extractSchema({ matrix: [[1, 2], [3]] }));
    expect(schema).toEqual({
      $: ['object'],
      '$.matrix': ['array'],
      '$.matrix[]': ['array'],
      '$.matrix[][]': ['number'],
    });
  });

  it('marks the elements of an empty array as "unknown"', () => {
    const schema = asMap(extractSchema({ results: [] }));
    expect(schema).toEqual({
      $: ['object'],
      '$.results': ['array'],
      '$.results[]': ['unknown'],
    });
  });

  it('drops "unknown" when another element of the same path has real data', () => {
    const schema = asMap(extractSchema({ users: [{ tags: [] }, { tags: ['a'] }] }));
    expect(schema['$.users[].tags[]']).toEqual(['string']);
  });

  it('copes with a large array', () => {
    const big = { rows: Array.from({ length: 20000 }, (_, i) => ({ id: i, label: `row-${i}` })) };
    expect(asMap(extractSchema(big))).toEqual({
      $: ['object'],
      '$.rows': ['array'],
      '$.rows[]': ['object'],
      '$.rows[].id': ['number'],
      '$.rows[].label': ['string'],
    });
  });
});

describe('extractSchema: awkward keys', () => {
  it('bracket-quotes keys that are not plain identifiers', () => {
    const schema = asMap(extractSchema({ 'first-name': 'A', 'a.b': 1, '': true }));
    expect(schema).toEqual({
      $: ['object'],
      '$[""]': ['boolean'],
      '$["a.b"]': ['number'],
      '$["first-name"]': ['string'],
    });
  });

  it('keeps a key like "__proto__" as ordinary data', () => {
    const parsed = JSON.parse('{"__proto__": {"x": 1}}');
    const schema = asMap(extractSchema(parsed));
    expect(schema['$.__proto__.x']).toEqual(['number']);
  });
});

describe('extractSchema: output guarantees', () => {
  it('returns entries sorted by path', () => {
    const paths = extractSchema({ z: 1, a: { y: 1, b: [1] }, m: 'x' }).map((e) => e.path);
    expect(paths).toEqual([...paths].sort());
  });

  it('throws a TypeError for values that cannot come from JSON', () => {
    expect(() => extractSchema(undefined)).toThrow(TypeError);
    expect(() => extractSchema({ a: undefined })).toThrow(TypeError);
    expect(() => extractSchema({ a: () => 1 })).toThrow(TypeError);
  });
});