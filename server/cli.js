// One-shot pipeline run: `npm run fetch` — fetches all sources, enriches,
// persists to the store, prints stats. Useful for seeding and debugging.

import { createBus } from '@orbitalfoundation/bus';
import { attachStore } from './store.js';
import { runOnce } from './scheduler.js';
import { scatterAround } from './gazetteer.js';

const bus = createBus({ description: 'cortes-cli' });
const store = await attachStore(bus, {
  mongoUrl: process.env.MONGO_URL ?? 'mongodb://localhost:27017',
  dbName: process.env.MONGO_DB ?? 'cortes',
});

const cmd = process.argv[2] ?? 'fetch';

if (cmd === 'rescatter') {
  // migrate stored scatter positions onto the new land anchors
  const items = await store.query({ limit: 5000 });
  let n = 0;
  for (const item of items) {
    if (item.geo?.method !== 'scatter') continue;
    const p = scatterAround(item.id);
    item.geo = { ...item.geo, ...p };
    await store.put(item);
    n++;
  }
  console.log(`rescattered ${n} items`);
} else {
  const stats = await runOnce(bus);
  // give queued store writes a beat to settle
  await new Promise((r) => setTimeout(r, 500));
  console.log(`store backend: ${store.backend}, total items: ${await store.count()}`);
  console.log(stats);
}
process.exit(0);
