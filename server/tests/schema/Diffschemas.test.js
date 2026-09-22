import { describe, it, expect } from 'vitest';
import { extractSchema } from '../../src/services/schema/extractSchema.js';
import { diffSchemas, hasBreakingChanges } from '../../src/services/schema/diffSchemas.js';

/** Diff two raw JSON responses (extract + diff in one go). */
const diff = (baselineJson, latestJson, options) =>
  diffSchemas(extractSchema(baselineJson), extractSchema(latestJson), options);

/** Compact "KIND path" strings make assertions easy to read. */
const summary = (changes) => changes.map((c) => `${c.kind} ${c.path}`);

describe('no drift', () => {
  it('returns nothing for identical responses', () => {
    const body = { temp: 32, city: 'Pune', tags: ['a'] };
    expect(diff(body, body)).toEqual([]);
  });

  it('ignores scalar value changes (prices, timestamps, temperatures)', () => {
    const before = { temp: 32, price: '9.99', at: '2026-09-22T10:00:00Z', ok: true };
    const after = { temp: -4.5, price: '12.50', at: '2026-09-23T18:30:00Z', ok: false };
    expect(diff(before, after)).toEqual([]);
  });

  it('does not depend on how the stored types happen to be ordered', () => {
    const a = [{ path: '$', types: ['object'] }, { path: '$.x', types: ['string', 'null'] }];
    const b = [{ path: '$', types: ['object'] }, { path: '$.x', types: ['null', 'string'] }];
    expect(diffSchemas(a, b)).toEqual([]);
  });
});

describe('non-breaking drift', () => {
  it('reports a new key as ADDED (non-breaking)', () => {
    const changes = diff({ temp: 32 }, { temp: 32, humidity: 60 });

    expect(changes).toEqual([
      { path: '$.humidity', kind: 'ADDED', from: [], to: ['number'], breaking: false },
    ]);
    expect(hasBreakingChanges(changes)).toBe(false);
  });

  it('treats a type that disappeared as non-breaking (string|null -> string)', () => {
    const before = { items: [{ n: 'a' }, { n: null }] };
    const after = { items: [{ n: 'a' }] };

    expect(diff(before, after)).toEqual([
      { path: '$.items[].n', kind: 'TYPE_CHANGED', from: ['null', 'string'], to: ['string'], breaking: false },
    ]);
  });

  it('treats a null-only baseline as "type not learned yet", so filling it in is non-breaking', () => {
    const changes = diff({ nick: null }, { nick: 'bob' });

    expect(changes).toEqual([
      { path: '$.nick', kind: 'TYPE_CHANGED', from: ['null'], to: ['string'], breaking: false },
    ]);
  });
});

describe('breaking drift', () => {
  it('reports a missing key as REMOVED (breaking)', () => {
    const changes = diff({ temp: 32, city: 'Pune' }, { temp: 32 });

    expect(changes).toEqual([
      { path: '$.city', kind: 'REMOVED', from: ['string'], to: [], breaking: true },
    ]);
    expect(hasBreakingChanges(changes)).toBe(true);
  });

  it('reports a type mutation as TYPE_CHANGED (breaking)', () => {
    const changes = diff({ temp: 32 }, { temp: '32' });

    expect(changes).toEqual([
      { path: '$.temp', kind: 'TYPE_CHANGED', from: ['number'], to: ['string'], breaking: true },
    ]);
  });

  it('sees a rename as REMOVED (breaking) + ADDED (non-breaking)', () => {
    const changes = diff({ temp: 32 }, { temperature: 32 });

    expect(summary(changes)).toEqual(['REMOVED $.temp', 'ADDED $.temperature']);
    expect(changes.map((c) => c.breaking)).toEqual([true, false]);
  });

  it('treats a field that becomes null as breaking', () => {
    const changes = diff({ name: 'Asha' }, { name: null });

    expect(changes).toEqual([
      { path: '$.name', kind: 'TYPE_CHANGED', from: ['string'], to: ['null'], breaking: true },
    ]);
  });

  it('treats null appearing in only SOME array items as breaking', () => {
    const before = { items: [{ n: 'a' }] };
    const after = { items: [{ n: 'a' }, { n: null }] };

    expect(diff(before, after)).toEqual([
      { path: '$.items[].n', kind: 'TYPE_CHANGED', from: ['string'], to: ['null', 'string'], breaking: true },
    ]);
  });

  it('detects a key removed from array items', () => {
    const before = { items: [{ id: 1, price: 5 }] };
    const after = { items: [{ id: 2 }] };

    expect(summary(diff(before, after))).toEqual(['REMOVED $.items[].price']);
  });

  it('detects keys with special characters being removed', () => {
    expect(summary(diff({ 'first-name': 'A', keep: 1 }, { keep: 1 }))).toEqual([
      'REMOVED $["first-name"]',
    ]);
    // a "." inside a quoted key must not confuse the parent lookup
    expect(summary(diff({ 'a.b': 1, keep: 1 }, { keep: 1 }))).toEqual(['REMOVED $["a.b"]']);
  });

  it('detects the response root changing shape (object -> array)', () => {
    const changes = diff({ a: 1 }, [{ a: 1 }]);

    expect(summary(changes)).toEqual(['TYPE_CHANGED $', 'ADDED $[]', 'ADDED $[].a']);
    expect(changes[0].breaking).toBe(true);
    // "$.a" is not listed separately: the root change already explains it
  });
});

describe('noise reduction', () => {
  it('reports a removed object once, not once per child', () => {
    const before = { user: { name: 'a', email: 'b', address: { city: 'c' } }, ok: true };
    const after = { ok: true };

    expect(diff(before, after)).toEqual([
      { path: '$.user', kind: 'REMOVED', from: ['object'], to: [], breaking: true },
    ]);
  });

  it('reports object -> string once, without listing the lost children', () => {
    const changes = diff({ user: { name: 'a' } }, { user: 'anonymous' });

    expect(changes).toEqual([
      { path: '$.user', kind: 'TYPE_CHANGED', from: ['object'], to: ['string'], breaking: true },
    ]);
  });

  it('keeps comparing children when the parent is still an object (object -> object|null)', () => {
    const before = { items: [{ user: { name: 'a' } }] };
    const after = { items: [{ user: { name: 'a' } }, { user: null }] };

    expect(diff(before, after)).toEqual([
      { path: '$.items[].user', kind: 'TYPE_CHANGED', from: ['object'], to: ['null', 'object'], breaking: true },
    ]);
  });

  it('does not flag a key that is still present in at least one array item', () => {
    const before = { items: [{ id: 1, discount: 5 }] };
    const after = { items: [{ id: 2 }, { id: 3, discount: 1 }] };

    expect(diff(before, after)).toEqual([]);
  });
});

describe('empty arrays', () => {
  it('does not treat a list that became empty as drift', () => {
    const before = { items: [{ id: 1, name: 'x' }] };
    const after = { items: [] };

    expect(diff(before, after)).toEqual([]);
  });

  it('reports a baseline learned from an empty list as ADDED (non-breaking) once data shows up', () => {
    const changes = diff({ items: [] }, { items: [{ id: 1 }] });

    expect(changes).toEqual([
      { path: '$.items[]', kind: 'ADDED', from: ['unknown'], to: ['object'], breaking: false },
      { path: '$.items[].id', kind: 'ADDED', from: [], to: ['number'], breaking: false },
    ]);
    expect(hasBreakingChanges(changes)).toBe(false);
  });

  it('still flags a real change next to an empty list', () => {
    const before = { items: [], total: 3 };
    const after = { items: [], total: '3' };

    expect(summary(diff(before, after))).toEqual(['TYPE_CHANGED $.total']);
  });
});

describe('ignorePaths', () => {
  const before = { prices: { '2026-09-21': 1.5 }, pricesTotal: 1.5 };
  const after = { prices: { '2026-09-22': 1.7 }, pricesTotal: '1.7' };

  it('reports dynamic-key churn when nothing is ignored', () => {
    expect(summary(diff(before, after))).toEqual([
      'TYPE_CHANGED $.pricesTotal',
      'REMOVED $.prices["2026-09-21"]',
      'ADDED $.prices["2026-09-22"]',
    ]);
  });

  it('skips the ignored path and everything under it, but not siblings with the same prefix', () => {
    const changes = diff(before, after, { ignorePaths: ['$.prices'] });
    expect(summary(changes)).toEqual(['TYPE_CHANGED $.pricesTotal']);
  });
});

describe('input handling', () => {
  it('throws a TypeError when a schema is not an array', () => {
    expect(() => diffSchemas(null, [])).toThrow(TypeError);
    expect(() => diffSchemas([], undefined)).toThrow(TypeError);
  });

  it('does not mutate its inputs', () => {
    const freeze = (schema) => {
      schema.forEach((entry) => {
        Object.freeze(entry.types);
        Object.freeze(entry);
      });
      return Object.freeze(schema);
    };
    const base = freeze(extractSchema({ a: 1, b: [1, 'x'] }));
    const next = freeze(extractSchema({ a: 'x', c: true }));

    expect(() => diffSchemas(base, next)).not.toThrow();
  });

  it('returns changes sorted by path', () => {
    const paths = diff({ b: 1, a: 1, c: 1 }, { d: 1, c: 'x' }).map((c) => c.path);
    expect(paths).toEqual([...paths].sort());
  });
});

describe('hasBreakingChanges', () => {
  it('is false for an empty list and for only non-breaking changes', () => {
    expect(hasBreakingChanges([])).toBe(false);
    expect(hasBreakingChanges(diff({ a: 1 }, { a: 1, b: 2 }))).toBe(false);
  });

  it('is true as soon as one change is breaking', () => {
    expect(hasBreakingChanges(diff({ a: 1, b: 2 }, { a: 1, c: 3 }))).toBe(true);
  });
});

describe('after "Accept Changes"', () => {
  it('shows no drift once the latest schema becomes the baseline', () => {
    const before = { temp: 32, humidity: 60 };
    const after = { temp: '32' };

    expect(hasBreakingChanges(diff(before, after))).toBe(true);
    // user clicks "Accept": latest schema replaces the baseline
    expect(diff(after, after)).toEqual([]);
  });
});

describe('realistic scenario: weather API', () => {
  const baseline = {
    location: { city: 'Pune', lat: 18.52, lon: 73.85 },
    current: {
      temp: 31.2,
      humidity: 64,
      wind_speed: 12,
      condition: 'Cloudy',
      observed_at: '2026-09-22T10:00:00Z',
    },
    forecast: [
      { day: 'Wed', high: 33, low: 24, rain_chance: 0.4 },
      { day: 'Thu', high: 32, low: 23, rain_chance: 0.6 },
    ],
  };

  const latest = {
    location: { city: 'Pune', lat: 18.52, lon: 73.85 },
    current: {
      temp: 27.8, // value changed: ignored
      wind_speed: '14 km/h', // number -> string
      condition: 'Rain', // value changed: ignored
      observed_at: '2026-09-22T10:30:00Z', // value changed: ignored
      uv_index: 3, // new key
      // humidity is gone
    },
    forecast: [{ day: 'Wed', high: 30, low: 22, chance_of_rain: 0.8 }], // rain_chance renamed
  };

  it('finds exactly the structural changes and nothing else', () => {
    const changes = diff(baseline, latest);

    expect(summary(changes)).toEqual([
      'REMOVED $.current.humidity',
      'ADDED $.current.uv_index',
      'TYPE_CHANGED $.current.wind_speed',
      'ADDED $.forecast[].chance_of_rain',
      'REMOVED $.forecast[].rain_chance',
    ]);
  });

  it('marks only the crash-causing changes as breaking', () => {
    const breakingPaths = diff(baseline, latest)
      .filter((c) => c.breaking)
      .map((c) => c.path);

    expect(breakingPaths).toEqual([
      '$.current.humidity',
      '$.current.wind_speed',
      '$.forecast[].rain_chance',
    ]);
  });
});