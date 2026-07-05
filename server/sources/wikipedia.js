// Wikipedia geosearch — durable reference layer: parks, landmarks, islands
// with exact coordinates and lead-paragraph summaries + images.

import { get } from './util.js';
import { ISLAND } from '../gazetteer.js';

export default {
  name: 'wikipedia',
  async fetch() {
    const geo = await get(
      `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${ISLAND.lat}%7C${ISLAND.lon}&gsradius=10000&gslimit=30&format=json&origin=*`,
      { as: 'json' },
    );
    const pages = geo?.query?.geosearch ?? [];
    const out = [];
    for (const p of pages) {
      try {
        const s = await get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
          { as: 'json' },
        );
        out.push({
          adapter: 'wikipedia',
          title: p.title,
          link: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
          summary: s.extract ?? null,
          image: s.thumbnail?.source?.replace(/\/\d+px-/, '/640px-') ?? null,
          author: 'Wikipedia',
          publishedAt: s.timestamp ?? null,
          lat: p.lat, lon: p.lon,
          place: p.title,
          category: 'reference',
        });
      } catch { /* single page failure is fine */ }
    }
    return out;
  },
};
