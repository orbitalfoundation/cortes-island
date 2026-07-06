// Mongo-backed item store, attached to the bus in the orbital style:
// sources publish { item } blobs; the store listener persists them (dedupe by
// id, merge enrichment) and re-publishes { item_changed } for fan-out.
//
// Degrades to an in-memory Map when mongo is unreachable, so `npm start`
// works on a bare laptop; the docker-compose deployment always has mongo.

import { MongoClient } from 'mongodb';
import { isDupe, merge, pickWinner, titleTokens } from './dedupe.js';

export async function attachStore(bus, { mongoUrl, dbName = 'cortes', log = console } = {}) {
  let col = null;
  const mem = new Map(); // fallback + read-through cache is not needed; mem only when no mongo

  if (mongoUrl) {
    try {
      const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 3000 });
      await client.connect();
      col = client.db(dbName).collection('items');
      await col.createIndex({ 'content.publishedAt': -1 });
      await col.createIndex({ 'meta.category': 1 });
      log.info?.(`[store] mongo connected: ${dbName}.items`);
    } catch (err) {
      log.warn?.(`[store] mongo unavailable (${err.message}) — using in-memory store`);
    }
  }

  async function get(id) {
    if (col) return await col.findOne({ id }, { projection: { _id: 0 } });
    return mem.get(id) ?? null;
  }

  async function put(item) {
    if (col) await col.replaceOne({ id: item.id }, item, { upsert: true });
    else mem.set(item.id, item);
  }

  async function query({ limit = 500, category = null, since = null } = {}) {
    if (col) {
      const q = {};
      if (category) q['meta.category'] = category;
      if (since) q['content.publishedAt'] = { $gte: since };
      return await col.find(q, { projection: { _id: 0 } })
        .sort({ 'content.publishedAt': -1 })
        .limit(Math.min(limit, 2000))
        .toArray();
    }
    let all = [...mem.values()];
    if (category) all = all.filter((i) => i.meta.category === category);
    if (since) all = all.filter((i) => (i.content.publishedAt ?? '') >= since);
    all.sort((a, b) => (b.content.publishedAt ?? '').localeCompare(a.content.publishedAt ?? ''));
    return all.slice(0, limit);
  }

  async function count() {
    return col ? await col.countDocuments() : mem.size;
  }

  async function remove(id) {
    if (col) await col.deleteOne({ id });
    else mem.delete(id);
    index.delete(id);
  }

  // in-memory dedupe index: id -> {id, tokens, geo, ...skeleton}
  const index = new Map();
  let indexReady = false;
  async function ensureIndex() {
    if (indexReady) return;
    indexReady = true;
    for (const it of await query({ limit: 10000 })) {
      index.set(it.id, { id: it.id, tokens: titleTokens(it.content.title), geo: it.geo, adapter: it.source.adapter });
    }
  }
  function indexPut(item) {
    index.set(item.id, { id: item.id, tokens: titleTokens(item.content.title), geo: item.geo, adapter: item.source.adapter });
  }

  // find an existing different-id item that is the same real-world thing
  async function findDupe(item) {
    await ensureIndex();
    const probe = { content: item.content, geo: item.geo, tokens: titleTokens(item.content.title), adapter: item.source.adapter };
    for (const c of index.values()) {
      if (c.id === item.id) continue;
      if (isDupe(probe, { content: { title: '' }, tokens: c.tokens, geo: c.geo, adapter: c.adapter })) {
        const full = await get(c.id);
        if (full) return full;
      }
    }
    return null;
  }

  const store = {
    get, put, query, count, remove, findDupe, indexPut,
    get backend() { return col ? 'mongo' : 'memory'; },
  };

  bus.register({
    id: 'store.persist',
    resolve: async (event) => {
      const item = event?.item;
      if (!item || item.kind !== 'item') return;
      const existing = await get(item.id);
      if (existing) {
        // keep the earliest fetchedAt; refresh volatile fields; keep enrichment
        // unless the new copy carries it (re-enrichment overwrites)
        const merged = {
          ...existing,
          content: { ...existing.content, ...item.content },
          geo: item.geo ?? existing.geo,
          meta: {
            category: item.meta.category ?? existing.meta.category,
            importance: item.meta.importance ?? existing.meta.importance,
            topics: item.meta.topics?.length ? item.meta.topics : existing.meta.topics,
          },
          updatedAt: new Date().toISOString(),
        };
        const changed = JSON.stringify(merged) !== JSON.stringify(existing);
        if (changed) {
          await put(merged);
          bus.resolve({ item_changed: merged, novel: false });
        }
      } else {
        // same story/place from another source? merge instead of duplicating
        const twin = await findDupe(item);
        if (twin) {
          const [winner, loser] = pickWinner(twin, item);
          merge(winner, loser);
          winner.updatedAt = new Date().toISOString();
          if (winner.id !== twin.id) await remove(twin.id);
          await put(winner);
          indexPut(winner);
          bus.resolve({ item_changed: winner, novel: false });
        } else {
          await put(item);
          indexPut(item);
          bus.resolve({ item_changed: item, novel: true });
        }
      }
    },
  });

  bus.install('store', store);
  return store;
}
