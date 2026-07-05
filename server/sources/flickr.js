// Flickr public tag feed — no key required. Tag-based (the public geo feed
// ignores lat/lon), so enrichment geolocates from title/tags.

import { get } from './util.js';

export default {
  name: 'flickr',
  async fetch() {
    const data = await get(
      'https://www.flickr.com/services/feeds/photos_public.gne?tags=cortesisland&format=json&nojsoncallback=1',
      { as: 'json' },
    );
    return (data.items ?? []).map((p) => ({
      adapter: 'flickr',
      title: p.title?.trim() || 'Photo from Cortes Island',
      link: p.link,
      summary: null,
      image: p.media?.m?.replace('_m.', '_b.') ?? null,
      author: (p.author ?? '').match(/\("?([^")]+)"?\)/)?.[1] ?? null,
      publishedAt: p.date_taken ?? p.published,
      category: 'photo',
      topics: (p.tags ?? '').split(' ').filter(Boolean).slice(0, 8),
    }));
  },
};
