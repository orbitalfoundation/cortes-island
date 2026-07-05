// cortes server — fastify + socket.io transport over a bus, orbital-style:
// deliberately thin. Sources publish { item } onto the bus, the store
// persists, and this file only adds (1) a socket.io gateway that answers
// { query } shapes and (2) fan-out of item changes to connected clients.
// Plus static serving of the built client.

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server as SocketServer } from 'socket.io';
import { createBus } from '@orbitalfoundation/bus';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readJson(url, fallback) {
  try { return JSON.parse(readFileSync(new URL(url, import.meta.url), 'utf8')); }
  catch { return fallback; }
}
import { attachStore } from './store.js';
import { startScheduler, runOnce } from './scheduler.js';
import { FERRY_ROUTE, ISLAND, PLACES } from './gazetteer.js';

const clean = (v) => JSON.parse(JSON.stringify(v ?? null));

export async function createServer({
  port = Number(process.env.PORT ?? 8000),
  host = '0.0.0.0',
  mongoUrl = process.env.MONGO_URL ?? 'mongodb://localhost:27017',
  webDist = new URL('../client/dist', import.meta.url).pathname,
  tickSeconds = Number(process.env.TICK_SECONDS ?? 900),
  logger = true,
} = {}) {
  const bus = createBus({ description: 'cortes' });
  const app = Fastify({ logger });
  const log = app.log;

  const store = await attachStore(bus, { mongoUrl, dbName: process.env.MONGO_DB ?? 'cortes', log });

  app.get('/api/health', async () => ({
    ok: true, store: store.backend, items: await store.count(),
  }));

  // client bootstrap: keys + world constants + deploy config stay server-side
  app.get('/api/config', async () => ({
    cesiumKey: process.env.CESIUM_KEY ?? null,
    island: ISLAND,
    places: PLACES,
    ferryRoute: FERRY_ROUTE,
    perimeter: readJson('../data/perimeter.json', []), // real OSM coastlines
    ...readJson('../config.json', {}),                 // carve, exaggeration, radio…
  }));

  app.post('/api/fetch', async () => ({ ok: true, stats: await runOnce(bus, log) }));

  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: resolve(webDist) });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'not found' });
    });
  }

  await app.listen({ port, host });
  const actualPort = app.server.address().port;
  const io = new SocketServer(app.server, { cors: { origin: true } }); // vite dev runs on another port

  // --- gateway: an allowlist of shapes, never a pipe ---
  io.on('connection', (socket) => {
    socket.on('items', async (msg, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const q = msg?.query && typeof msg.query === 'object' ? msg.query : {};
        const items = await store.query({
          limit: Number(q.limit) || 500,
          category: typeof q.category === 'string' ? q.category : null,
          since: typeof q.since === 'string' ? q.since : null,
        });
        ack(clean({ ok: true, items }));
      } catch (err) {
        ack({ ok: false, error: err.message });
      }
    });
  });

  // --- fan-out: every persisted change goes to every client ---
  bus.register({
    id: 'server.fanout',
    resolve(event) {
      if (event?.item_changed) io.emit('item', clean(event.item_changed));
    },
  });

  const scheduler = startScheduler(bus, { tickSeconds, log });

  log.info(`cortes up on :${actualPort} (store=${store.backend}, tick=${tickSeconds}s)`);
  return {
    bus, store, app, io, port: actualPort,
    async close() { scheduler?.stop(); io.close(); await app.close(); },
  };
}
