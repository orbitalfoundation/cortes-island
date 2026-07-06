// Cross-source dedupe. The same real-world thing arrives as an OSM POI, a
// Wikipedia page, a curated seed, a Claude fact, and sometimes a news story —
// each with its own URL, so id-hashing can't catch it. Instead:
//
//   duplicate  =  title-token Jaccard ≥ 0.6
//              OR (within 300 m AND Jaccard ≥ 0.34)
//
// The survivor is whichever copy is richer (image > long summary > source
// rank); the loser's URL is kept in source.alternates so nothing is lost.

const STOP = new Set(['the', 'a', 'an', 'of', 'at', 'in', 'on', 'and', 'or',
  'island', 'cortes', 'bc', 'british', 'columbia', 'canada', 'first', 'nation',
  'provincial', 'regional', 'park', 'community']);

export function titleTokens(title) {
  return new Set(
    (title ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // fold diacritics
      .replace(/\s+[-–—|]\s+[^-–—|]+$/, '')             // strip " - Publisher" suffixes
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/'s\b/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

function distM(a, b) {
  if (!a?.geo || !b?.geo) return Infinity;
  const dLat = (a.geo.lat - b.geo.lat) * 111320;
  const dLon = (a.geo.lon - b.geo.lon) * 111320 * Math.cos(a.geo.lat * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}

export function isDupe(a, b) {
  // a source is internally consistent (distinct URLs = distinct items):
  // two iNaturalist sightings of the same species must never merge
  const aa = a.source?.adapter ?? a.adapter, ba = b.source?.adapter ?? b.adapter;
  if (aa && ba && aa === ba) return false;
  const ta = a.tokens ?? titleTokens(a.content.title);
  const tb = b.tokens ?? titleTokens(b.content.title);
  const j = jaccard(ta, tb);
  if (j >= 0.6) return true;
  return j >= 0.34 && distM(a, b) < 300;
}

// prefer curated > exact-located > pictured > wordy
const SOURCE_RANK = { seeds: 5, facts: 4, wikipedia: 3, osm: 2 };
function richness(item) {
  let s = SOURCE_RANK[item.source.adapter.split(':')[0]] ?? 1;
  if (item.content.image) s += 2;
  s += Math.min(1.5, (item.content.summary ?? '').length / 300);
  if (item.geo?.method === 'exact') s += 1;
  return s;
}

// merge `loser` into `winner` in place; returns winner
export function merge(winner, loser) {
  winner.content.image ??= loser.content.image;
  if ((loser.content.summary ?? '').length > (winner.content.summary ?? '').length * 1.6) {
    winner.content.summary = loser.content.summary;
  }
  winner.content.publishedAt ??= loser.content.publishedAt;
  const topics = new Set([...(winner.meta.topics ?? []), ...(loser.meta.topics ?? [])]);
  winner.meta.topics = [...topics].slice(0, 8);
  winner.meta.importance = Math.max(winner.meta.importance ?? 0, loser.meta.importance ?? 0);
  if (winner.geo?.method !== 'exact' && loser.geo?.method === 'exact') winner.geo = loser.geo;
  const alts = new Set([...(winner.source.alternates ?? []), loser.source.url,
    ...(loser.source.alternates ?? [])]);
  alts.delete(winner.source.url);
  winner.source.alternates = [...alts].slice(0, 10);
  return winner;
}

export function pickWinner(a, b) {
  return richness(a) >= richness(b) ? [a, b] : [b, a];
}
