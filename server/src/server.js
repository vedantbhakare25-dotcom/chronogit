import 'dotenv/config';

import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();
  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(`[server] listening on :${PORT}`);
    startScheduler();
  });

  // On SIGTERM/SIGINT: stop taking new work in the order that avoids
  // half-finished checks — cron first (no new ticks), then the HTTP server
  // (let in-flight requests finish), then the DB connection.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return; // a second Ctrl+C shouldn't re-enter this
    shuttingDown = true;
    console.log(`[server] received ${signal}, shutting down...`);

    stopScheduler();
    server.close(async (err) => {
      if (err) console.error('[server] error while closing HTTP server:', err);
      try {
        await disconnectDB();
      } catch (dbErr) {
        console.error('[server] error while disconnecting from MongoDB:', dbErr);
      }
      console.log('[server] shutdown complete');
      process.exit(err ? 1 : 0);
    });

    // Safety net: if something (a stuck connection, a slow-closing socket)
    // keeps server.close() from ever calling back, don't hang forever.
    setTimeout(() => {
      console.error('[server] shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});