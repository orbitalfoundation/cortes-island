// iNaturalist — geotagged wildlife observations with photos inside the Cortes
// bounding box. The richest "sense of life" source: real animals, real spots,
// real photos, no API key.

import { get } from './util.js';
import { ISLAND } from '../gazetteer.js';

export default {
  name: 'inaturalist',
  async fetch() {
    const b = ISLAND.bbox;
    const url = `https://api.inaturalist.org/v1/observations?nelat=${b.north}&nelng=${b.east}&swlat=${b.south}&swlng=${b.west}` +
      `&per_page=60&order_by=observed_on&order=desc&photos=true&geoprivacy=open`;
    const data = await get(url, { as: 'json' });
    return (data.results ?? []).map((o) => {
      const [lat, lon] = (o.location ?? '').split(',').map(Number);
      const taxon = o.taxon ?? {};
      const common = taxon.preferred_common_name;
      const sci = taxon.name;
      const name = common ? (sci ? `${common} (${sci})` : common) : (sci ?? o.species_guess ?? 'Unidentified observation');
      const photo = o.photos?.[0]?.url?.replace('square', 'medium') ?? null;
      return {
        adapter: 'inaturalist',
        title: name,
        link: o.uri ?? `https://www.inaturalist.org/observations/${o.id}`,
        summary: [
          o.description,
          o.place_guess ? `Seen at ${o.place_guess}` : null,
          o.quality_grade === 'research' ? 'Research-grade identification' : null,
        ].filter(Boolean).join(' — ') || `Observed on ${o.observed_on ?? 'an unknown date'}.`,
        image: photo,
        author: o.user?.name || o.user?.login || null,
        publishedAt: o.time_observed_at ?? o.observed_on ?? o.created_at,
        lat, lon,
        place: o.place_guess ?? null,
        category: 'wildlife',
        topics: [taxon.iconic_taxon_name, common].filter(Boolean).map((s) => s.toLowerCase()),
      };
    }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  },
};
