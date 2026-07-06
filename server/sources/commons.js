// Wikimedia Commons — freely licensed geotagged photographs around the
// island: historic and contemporary, with exact coordinates.

import { get } from './util.js';
import { ISLAND } from '../gazetteer.js';

export default {
  name: 'commons',
  async fetch() {
    const data = await get(
      'https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch' +
      `&ggscoord=${ISLAND.lat}%7C${ISLAND.lon}&ggsradius=10000&ggslimit=40&ggsnamespace=6` +
      '&prop=imageinfo%7Ccoordinates&iiprop=url%7Cextmetadata&iiurlwidth=800&format=json',
      { as: 'json' },
    );
    const pages = Object.values(data?.query?.pages ?? {});
    return pages.map((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata ?? {};
      const coord = p.coordinates?.[0];
      const title = p.title.replace(/^File:/, '').replace(/\.[a-z]{3,4}$/i, '').replace(/_/g, ' ');
      return {
        adapter: 'commons',
        title,
        link: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
        summary: [
          meta.ImageDescription?.value?.replace(/<[^>]*>/g, '').trim(),
          meta.LicenseShortName?.value ? `License: ${meta.LicenseShortName.value}` : null,
        ].filter(Boolean).join(' — ') || null,
        image: info.thumburl ?? info.url,
        author: meta.Artist?.value?.replace(/<[^>]*>/g, '').trim() || 'Wikimedia Commons',
        publishedAt: meta.DateTimeOriginal?.value ?? null,
        lat: coord?.lat, lon: coord?.lon,
        category: 'photo',
        importance: 0.35,
      };
    }).filter(Boolean);
  },
};
