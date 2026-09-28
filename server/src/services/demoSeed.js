import Monitor from '../models/Monitor.js';

const DEMO_MONITORS = [
  {
    name: 'Sandbox Weather API',
    url: 'https://demo.chronogit.dev/weather',
    baselineSchema: [
      { path: '$', types: ['object'] },
      { path: '$.temperature', types: ['number'] },
      { path: '$.status', types: ['string'] },
    ],
    latestSchema: [
      { path: '$', types: ['object'] },
      { path: '$.temperature', types: ['string'] },
      { path: '$.status', types: ['string'] },
    ],
    status: 'BREAKING',
  },
  {
    name: 'Sandbox Products API',
    url: 'https://demo.chronogit.dev/products',
    baselineSchema: [
      { path: '$', types: ['object'] },
      { path: '$.products', types: ['array'] },
    ],
    latestSchema: [
      { path: '$', types: ['object'] },
      { path: '$.products', types: ['array'] },
      { path: '$.requestId', types: ['string'] },
    ],
    status: 'HEALTHY',
  },
];

/** Idempotently creates read-only examples for the shared demo account. */
export async function ensureDemoMonitors(userId) {
  const now = new Date();
  for (const seed of DEMO_MONITORS) {
    await Monitor.updateOne(
      { userId, url: seed.url },
      {
        $setOnInsert: {
          ...seed,
          userId,
          intervalMinutes: 60,
          isActive: false,
          alerts: { email: 'demo@chronogit.dev', notifyOnRecovery: false },
          lastCheckedAt: now,
          nextCheckAt: null,
        },
      },
      { upsert: true }
    );
  }
}
