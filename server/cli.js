// One-shot pipeline run: `npm run fetch` — fetches all sources, enriches,
// persists to the store, prints stats. Useful for seeding and debugging.

import { createBus } from '@orbitalfoundation/bus';
import { attachStore } from './store.js';
import { runOnce } from './scheduler.js';

const bus = createBus({ description: 'cortes-cli' });
const store = await attachStore(bus, {
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017',
  dbName: process.env.MONGO_DB ?? 'cortes',
});

const stats = await runOnce(bus);
// give queued store writes a beat to settle
await new Promise((r) => setTimeout(r, 500));
console.log(`store backend: ${store.backend}, total items: ${await store.count()}`);
console.log(stats);
process.exit(0);
