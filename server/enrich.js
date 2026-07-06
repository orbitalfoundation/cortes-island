// Enrichment — decorate items with geo, category, importance and topics.
//
// Two tiers:
//  1. Heuristics (always run): gazetteer geolocation from text, category
//     defaults from the adapter, importance from source weight + richness.
//  2. Claude (when ANTHROPIC_API_KEY is set): batch-refines items whose
//     geolocation or categorization the heuristics couldn't pin down, and
//     scores importance with actual judgement.

import Anthropic from '@anthropic-ai/sdk';
import { locateInText, mentionsIsland, insideBbox, scatterAround, ISLAND, PLACES } from './gazetteer.js';
import { CATEGORIES } from './schema.js';

const SOURCE_WEIGHT = {
  'rss:cortes-currents': 0.75, 'rss:google-news': 0.65, 'rss:cr-mirror': 0.6,
  inaturalist: 0.45, wikipedia: 0.5, flickr: 0.4, reddit: 0.5, twitter: 0.5,
};

function heuristicImportance(item) {
  let score = SOURCE_WEIGHT[item.source.adapter] ?? SOURCE_WEIGHT[item.source.adapter.split(':')[0]] ?? 0.45;
  if (item.content.image) score += 0.08;
  if ((item.content.summary ?? '').length > 300) score += 0.07;
  if (/research-grade/i.test(item.content.summary ?? '')) score += 0.1;
  if (/fire|emergency|rescue|storm|ferry cancell|earthquake|evacuat/i.test(item.content.title)) score += 0.25;
  return Math.max(0.05, Math.min(1, score));
}

function heuristicCategory(item) {
  if (item.meta.category) return item.meta.category;
  const t = `${item.content.title} ${item.content.summary ?? ''}`.toLowerCase();
  if (/whale|orca|humpback|wolf|bear|eagle|heron|salmon|bird|otter|seal/.test(t)) return 'wildlife';
  if (/concert|festival|market|workshop|gathering|potluck|dance|event/.test(t)) return 'event';
  if (/ferry|tide|boat|marina|harbour|harbor|sailing|kayak/.test(t)) return 'marine';
  if (/art|music|film|poetry|writer|gallery|klahoose|culture/.test(t)) return 'culture';
  return 'community';
}

// Heuristic pass — returns the item decorated, plus a flag for whether the
// LLM should take a look (geo unresolved or category guessed).
export function enrichHeuristic(item) {
  let needsLLM = false;

  if (!item.geo) {
    const hit = locateInText(`${item.content.title} ${item.content.summary ?? ''}`);
    if (hit) {
      item.geo = { ...hit, method: 'gazetteer' };
    } else if (mentionsIsland(`${item.content.title} ${item.content.summary ?? ''} ${item.meta.topics.join(' ')}`)) {
      const p = scatterAround(item.id);
      item.geo = { ...p, place: ISLAND.name, method: 'scatter' };
      needsLLM = true; // an LLM might read a real place out of the prose
    } else {
      // not clearly about Cortes and no coordinates: keep only if a trusted
      // island-focused source produced it
      if (item.source.adapter.startsWith('rss:cortes-currents') || item.source.adapter === 'flickr') {
        const p = scatterAround(item.id);
        item.geo = { ...p, place: ISLAND.name, method: 'scatter' };
        needsLLM = true;
      } else {
        return { item, drop: true };
      }
    }
  } else if (!insideBbox(item.geo.lat, item.geo.lon)
    && !['facts', 'seeds'].includes(item.source.adapter)) {
    // curated layers may deliberately sit in the wider storyshed (Toba,
    // Quadra, Church House); everything else must be on/near the island
    return { item, drop: true };
  }

  if (!item.meta.category) { item.meta.category = heuristicCategory(item); needsLLM = true; }
  if (item.meta.importance == null) item.meta.importance = heuristicImportance(item);
  return { item, needsLLM, drop: false };
}

// ---- Claude tier ----

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'category', 'importance', 'topics', 'about_cortes'],
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          importance: { type: 'number' },
          topics: { type: 'array', items: { type: 'string' } },
          about_cortes: { type: 'boolean' },
          place: { type: ['string', 'null'], description: 'Named place on/near Cortes Island if one is identifiable, else null' },
          lat: { type: ['number', 'null'] },
          lon: { type: ['number', 'null'] },
        },
      },
    },
  },
};

const SYSTEM = `You enrich a live map of Cortes Island, BC, Canada (50.06N, -124.97W).
For each item: judge whether it is genuinely about Cortes Island or its immediate waters/islands (about_cortes);
pick the best category; rate importance 0..1 for a resident (emergencies/major community news near 1, routine photos near 0.2);
extract up to 5 short topical tags; and if the text names a locatable spot on or near the island, give its name and best-estimate lat/lon.
Known places: ${PLACES.map((p) => `${p.name} (${p.lat.toFixed(3)},${p.lon.toFixed(3)})`).join('; ')}.`;

export async function enrichWithClaude(items, log = console) {
  if (!client || !items.length) return items;
  const batch = items.slice(0, 40); // keep prompts sane
  try {
    const payload = batch.map((i) => ({
      id: i.id, adapter: i.source.adapter, title: i.content.title,
      summary: i.content.summary?.slice(0, 400) ?? null, topics: i.meta.topics,
    }));
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    if (response.stop_reason === 'refusal') return items;
    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const result = JSON.parse(text);
    const byId = new Map((result.items ?? []).map((r) => [r.id, r]));
    for (const item of batch) {
      const r = byId.get(item.id);
      if (!r) continue;
      if (!r.about_cortes) { item.meta.dropped = true; continue; }
      item.meta.category = CATEGORIES.includes(r.category) ? r.category : item.meta.category;
      item.meta.importance = Math.max(0, Math.min(1, (r.importance + (item.meta.importance ?? r.importance)) / 2));
      if (r.topics?.length) item.meta.topics = r.topics.slice(0, 5).map((t) => String(t).toLowerCase());
      if (r.lat != null && r.lon != null && insideBbox(r.lat, r.lon) && item.geo?.method !== 'exact') {
        item.geo = { lat: r.lat, lon: r.lon, place: r.place ?? item.geo?.place ?? null, method: 'llm' };
      }
    }
    log.info?.(`[enrich] claude refined ${byId.size}/${batch.length} items`);
  } catch (err) {
    log.warn?.(`[enrich] claude pass skipped: ${err.message}`);
  }
  return items.filter((i) => !i.meta.dropped);
}
