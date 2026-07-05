// The aggregation loop: every tick, run each source adapter, normalize,
// enrich, and publish resulting items onto the bus (the store listener
// persists and fans out).

import { activeSources } from './sources/index.js';
import { makeItem } from './schema.js';
import { enrichHeuristic, enrichWithClaude } from './enrich.js';

export async function runOnce(bus, log = console) {
  const stats = {};
  for (const source of activeSources()) {
    try {
      const raws = await source.fetch();
      const items = [];
      const llmQueue = [];
      for (const raw of raws) {
        const item = makeItem(raw);
        if (!item) continue;
        const { item: enriched, needsLLM, drop } = enrichHeuristic(item);
        if (drop) continue;
        if (needsLLM) llmQueue.push(enriched);
        items.push(enriched);
      }
      // Claude refines the uncertain slice in one batched call per source
      const kept = new Set(await enrichWithClaude(llmQueue, log));
      const final = items.filter((i) => !llmQueue.includes(i) || kept.has(i));
      for (const item of final) await bus.resolve({ item });
      stats[source.name] = final.length;
    } catch (err) {
      stats[source.name] = `error: ${err.message}`;
      log.warn?.(`[scheduler] ${source.name} failed: ${err.message}`);
    }
  }
  log.info?.(`[scheduler] tick complete: ${JSON.stringify(stats)}`);
  return stats;
}

export function startScheduler(bus, { tickSeconds = 900, log = console } = {}) {
  if (!tickSeconds) return null;
  // first run shortly after boot so a fresh deploy fills itself
  const kickoff = setTimeout(() => runOnce(bus, log).catch(() => {}), 5000);
  const interval = setInterval(() => runOnce(bus, log).catch(() => {}), tickSeconds * 1000);
  interval.unref?.(); kickoff.unref?.();
  return { stop: () => { clearTimeout(kickoff); clearInterval(interval); } };
}
