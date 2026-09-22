import 'dotenv/config';

import { createApp } from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB();
  const app = createApp();
  app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});