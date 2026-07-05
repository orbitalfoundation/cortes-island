// Cortes Island gazetteer — place names with coordinates, used to geolocate
// text that mentions a place, and to gently scatter items that only resolve
// to "somewhere on Cortes". Coordinates are approximate (good to ~100m, which
// is all a floating card needs).

export const ISLAND = {
  name: 'Cortes Island',
  lat: 50.062,
  lon: -124.968,
  // loose bounding box used by the geo-search adapters (includes Marina,
  // Hernando, Twin Islands, Mitlenatch and the surrounding water)
  bbox: { south: 49.93, west: -125.13, north: 50.21, east: -124.84 },
};

export const PLACES = [
  { name: 'Mansons Landing', lat: 50.0667, lon: -124.9833, aliases: ["manson's landing", 'mansons'] },
  { name: 'Whaletown', lat: 50.1036, lon: -125.0521, aliases: ['whaletown bay'] },
  { name: 'Squirrel Cove', lat: 50.1187, lon: -124.9202, aliases: ['klahoose', "tork", "t'ork"] },
  { name: 'Smelt Bay', lat: 50.0322, lon: -124.9942, aliases: ['smelt bay provincial park'] },
  { name: 'Cortes Bay', lat: 50.0623, lon: -124.9268, aliases: [] },
  { name: 'Gorge Harbour', lat: 50.0938, lon: -125.0173, aliases: ['gorge harbor', 'the gorge'] },
  { name: 'Hollyhock', lat: 50.0343, lon: -124.9761, aliases: ['hollyhock retreat'] },
  { name: 'Von Donop Inlet', lat: 50.1572, lon: -124.9553, aliases: ['von donop', 'háthayim', 'hathayim'] },
  { name: 'Carrington Bay', lat: 50.1441, lon: -125.0078, aliases: [] },
  { name: 'Hague Lake', lat: 50.0561, lon: -124.9664, aliases: [] },
  { name: 'Gunflint Lake', lat: 50.0629, lon: -124.9557, aliases: [] },
  { name: 'Cortes Island School', lat: 50.0561, lon: -124.9797, aliases: ['cortes school'] },
  { name: 'Linnaea Farm', lat: 50.0655, lon: -124.9548, aliases: ['linnaea'] },
  { name: 'Tiber Bay', lat: 50.0751, lon: -124.9047, aliases: [] },
  { name: 'Sutil Point', lat: 50.0211, lon: -124.9793, aliases: ['sutil'] },
  { name: 'Bullock Bluff', lat: 50.1761, lon: -124.9724, aliases: [] },
  { name: 'Twin Islands', lat: 50.0292, lon: -124.9311, aliases: [] },
  { name: 'Marina Island', lat: 50.0602, lon: -125.0409, aliases: ['shark spit'] },
  { name: 'Hernando Island', lat: 49.9855, lon: -124.9339, aliases: ['hernando'] },
  { name: 'Mitlenatch Island', lat: 49.9506, lon: -125.0025, aliases: ['mitlenatch'] },
  { name: 'Heriot Bay', lat: 50.1058, lon: -125.2153, aliases: ['heriot bay ferry'] },
  { name: 'Refuge Cove', lat: 50.1236, lon: -124.8422, aliases: [] },
  { name: 'Read Island', lat: 50.1900, lon: -125.0850, aliases: [] },
];

// Ferry route: Heriot Bay (Quadra) <-> Whaletown Bay (Cortes), Sutil Channel.
export const FERRY_ROUTE = [
  { lat: 50.1058, lon: -125.2153 }, // Heriot Bay terminal
  { lat: 50.0980, lon: -125.1750 },
  { lat: 50.0930, lon: -125.1200 },
  { lat: 50.0960, lon: -125.0800 },
  { lat: 50.1036, lon: -125.0521 }, // Whaletown terminal
];

const norm = (s) => (s ?? '').toLowerCase();

// Find the most specific place mentioned in a piece of text.
// Returns { lat, lon, place } or null.
export function locateInText(text) {
  const t = norm(text);
  if (!t) return null;
  let best = null;
  for (const p of PLACES) {
    for (const candidate of [p.name.toLowerCase(), ...p.aliases]) {
      if (candidate && t.includes(candidate)) {
        // longer matches win (e.g. "smelt bay provincial park" over "smelt bay")
        if (!best || candidate.length > best.len) best = { lat: p.lat, lon: p.lon, place: p.name, len: candidate.length };
      }
    }
  }
  if (best) return { lat: best.lat, lon: best.lon, place: best.place };
  return null;
}

export function mentionsIsland(text) {
  const t = norm(text);
  return t.includes('cortes island') || t.includes('cortes bc') || t.includes('#cortesisland') || locateInText(t) != null;
}

export function insideBbox(lat, lon) {
  const b = ISLAND.bbox;
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

// Deterministic scatter for items that only geolocate to "the island".
// The island's geographic center is Hague Lake, so instead of scattering
// around the centroid (cards in the water), placeless items land near one of
// the settlements — hash-picked so each item keeps a stable spot.
const LAND_ANCHORS = ['Mansons Landing', 'Whaletown', 'Squirrel Cove', 'Smelt Bay',
  'Cortes Bay', 'Gorge Harbour', 'Hollyhock', 'Linnaea Farm', 'Cortes Island School'];

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function scatterAround(id) {
  const h = hashId(id);
  const anchor = PLACES.find((p) => p.name === LAND_ANCHORS[h % LAND_ANCHORS.length]) ?? ISLAND;
  const a = (h % 3600) / 3600 * Math.PI * 2;
  const r = 0.0012 + ((h >> 8) % 1000) / 1000 * 0.0035; // ~130–520 m inland spread
  return { lat: anchor.lat + Math.sin(a) * r, lon: anchor.lon + Math.cos(a) * r * 1.55 };
}
