import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Monitor.find().select().sort().lean() is a chained query — mock it the
// same shape Mongoose returns, with .lean() resolving to PLAIN objects,
// exactly like the real driver does (this is what the bug was about).
const leanDocs = [
  {
    _id: 'm1',
    name: 'Weather API',
    url: 'https://api.example.com/weather',
    headers: { 'x-api-key': 'secret123' }, // plain object, NOT a Map — this is the point
    ignorePaths: [],
    intervalMinutes: 15,
    isActive: true,
    status: 'HEALTHY',
  },
  {
    _id: 'm2',
    name: 'No-headers monitor',
    url: 'https://api.example.com/ping',
    // headers omitted entirely, like a doc created before headers existed
    ignorePaths: [],
    intervalMinutes: 30,
    isActive: true,
    status: 'PENDING',
  },
];

vi.mock('../../src/models/Monitor.js', () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(leanDocs),
  };
  return {
    default: {
      find: vi.fn(() => chain),
      findOneAndUpdate: vi.fn(async (filter, update) => {
        const monitor = leanDocs.find((item) => item._id === String(filter._id));
        return monitor ? { ...monitor, userId: update.$set.userId } : null;
      }),
    },
  };
});

const { createApp } = await import('../../src/app.js');

let server;
let baseUrl;

beforeAll(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('GET /api/monitors', () => {
  it('does not crash on lean() results, whose headers are already a plain object', async () => {
    const res = await fetch(`${baseUrl}/api/monitors`);
    expect(res.status).toBe(200);
  });

  it('returns each monitor’s headers as a plain object, unchanged', async () => {
    const res = await fetch(`${baseUrl}/api/monitors`);
    const body = await res.json();

    expect(body[0].headers).toEqual({ 'x-api-key': 'secret123' });
  });

  it('defaults a missing headers field to {} instead of throwing', async () => {
    const res = await fetch(`${baseUrl}/api/monitors`);
    const body = await res.json();

    expect(body[1].headers).toEqual({});
  });

  it('still returns the rest of each monitor’s fields untouched', async () => {
    const res = await fetch(`${baseUrl}/api/monitors`);
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ name: 'Weather API', status: 'HEALTHY' });
    expect(body[1]).toMatchObject({ name: 'No-headers monitor', status: 'PENDING' });
  });
});
