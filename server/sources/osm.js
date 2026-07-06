// OpenStreetMap POIs — the everyday texture of the island: the co-op, cafés
// and food spots, trailheads, parks, marinas, viewpoints, halls and schools.
// One Overpass query per tick, exact coordinates, no key.

import { ISLAND } from '../gazetteer.js';

const UA = 'cortes-viz/0.1 (github.com/orbitalfoundation/cortez)';

function categorize(tags) {
  if (tags.tourism === 'museum' || tags.tourism === 'artwork' || tags.amenity === 'place_of_worship' ||
      tags.amenity === 'arts_centre') return 'culture';
  if (tags.leisure === 'marina' || tags.waterway) return 'marine';
  return 'reference';
}

function describe(tags) {
  const bits = [];
  if (tags.shop) bits.push(`${tags.shop.replace(/_/g, ' ')} shop`);
  if (tags.amenity) bits.push(tags.amenity.replace(/_/g, ' '));
  if (tags.tourism) bits.push(tags.tourism.replace(/_/g, ' '));
  if (tags.leisure) bits.push(tags.leisure.replace(/_/g, ' '));
  if (tags.highway === 'trailhead') bits.push('trailhead');
  if (tags.cuisine) bits.push(tags.cuisine.replace(/[;_]/g, ', '));
  if (tags.opening_hours) bits.push(`hours: ${tags.opening_hours}`);
  return bits.length ? bits.join(' · ') : null;
}

export default {
  name: 'osm',
  async fetch() {
    const b = ISLAND.bbox;
    const bbox = `${b.south},${b.west},${b.north},${b.east}`;
    const q = `[out:json][timeout:60];(
      nwr["shop"](${bbox});
      nwr["amenity"~"restaurant|cafe|pub|bar|fast_food|bakery|fuel|library|school|community_centre|place_of_worship|arts_centre|marketplace"](${bbox});
      nwr["tourism"~"attraction|viewpoint|museum|artwork|camp_site|picnic_site"](${bbox});
      nwr["leisure"~"marina|park|nature_reserve|beach_resort"](${bbox});
      node["highway"="trailhead"](${bbox});
    );out center 200;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(70000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}`);
    const data = await res.json();
    return (data.elements ?? [])
      .map((el) => {
        const tags = el.tags ?? {};
        if (!tags.name) return null; // unnamed geometry is noise, not flavor
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
        if (lat == null) return null;
        return {
          adapter: 'osm',
          tier: 'ground', // POIs are wayfinding, not news
          title: tags.name,
          link: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          summary: describe(tags),
          image: null,
          author: 'OpenStreetMap',
          publishedAt: null,
          lat, lon,
          place: tags.name,
          category: categorize(tags),
          importance: 0.3,
          topics: [tags.shop, tags.amenity, tags.tourism, tags.leisure, tags.highway]
            .filter(Boolean).map((t) => t.replace(/_/g, ' ')).slice(0, 4),
        };
      })
      .filter(Boolean);
  },
};
