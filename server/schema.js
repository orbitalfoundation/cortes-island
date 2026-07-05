// The item schema — ECS-flavored: an item is an entity blob whose components
// (source, content, geo, meta) are decorated on as it moves through the
// pipeline. Everything that flows over the bus and the wire is this shape.
//
//   {
//     id: 'item:ab12cd…',            stable hash of the canonical source URL
//     kind: 'item',
//     source:  { adapter, url, author },
//     content: { title, summary, image, link, publishedAt },
//     geo:     { lat, lon, place, method }    method: exact|gazetteer|llm|scatter
//     meta:    { category, importance, topics }
//     fetchedAt, updatedAt                    ISO strings
//   }

import { createHash } from 'node:crypto';

export const CATEGORIES = ['news', 'community', 'wildlife', 'photo', 'event', 'marine', 'culture', 'reference'];

export function itemId(url) {
  return 'item:' + createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
}

const clip = (s, n) => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, n) : null;
};

// Normalize a raw adapter product into a well-formed item (or null if unusable).
export function makeItem(raw) {
  const link = raw.link ?? raw.url;
  const title = clip(raw.title, 300);
  if (!link || !title) return null;
  const publishedAt = raw.publishedAt ? new Date(raw.publishedAt) : null;
  return {
    id: itemId(link),
    kind: 'item',
    source: {
      adapter: raw.adapter,
      url: link,
      author: clip(raw.author, 120),
    },
    content: {
      title,
      summary: clip(raw.summary, 900),
      image: raw.image ?? null,
      link,
      publishedAt: publishedAt && !isNaN(publishedAt) ? publishedAt.toISOString() : null,
    },
    geo: raw.lat != null && raw.lon != null
      ? { lat: Number(raw.lat), lon: Number(raw.lon), place: raw.place ?? null, method: 'exact' }
      : null, // enrichment fills this in
    meta: {
      category: raw.category ?? null, // enrichment fills / verifies
      importance: raw.importance ?? null,
      topics: Array.isArray(raw.topics) ? raw.topics.slice(0, 8) : [],
    },
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
