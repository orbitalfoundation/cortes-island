// One-shot: fetch the real Cortes Island perimeter (OSM relation 2143895)
// plus satellite islands, stitch the outer rings, simplify, and write
// data/perimeter.json. Run: node scripts/fetch-perimeter.mjs

import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'cortes-viz/0.1 (github.com/orbitalfoundation/cortez)';
const ISLANDS = [
  { name: 'Cortes Island', id: 2143895 },
  { name: 'Marina Island', query: 'way["place"="island"]["name"="Marina Island"](49.9,-125.2,50.2,-124.8)' },
  { name: 'Hernando Island', query: 'way["place"="island"]["name"="Hernando Island"](49.9,-125.2,50.2,-124.8)' },
  { name: 'Twin Islands', query: 'wr["place"~"island"]["name"~"Twin Island"](49.9,-125.1,50.1,-124.8)' },
  { name: 'Mitlenatch Island', query: 'way["name"="Mitlenatch Island"](49.9,-125.1,50.0,-124.9)' },
];

async function overpass(q) {
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: 'data=' + encodeURIComponent(`[out:json][timeout:90];${q}`),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  return await res.json();
}

// stitch member ways (role outer) into closed rings
function stitchRings(ways) {
  const pool = ways.map((w) => w.geometry.map((g) => [g.lat, g.lon]));
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i];
        const [rs, re] = [ring[0], ring[ring.length - 1]];
        const [ss, se] = [seg[0], seg[seg.length - 1]];
        const eq = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
        if (eq(re, ss)) { ring = ring.concat(seg.slice(1)); pool.splice(i, 1); grew = true; break; }
        if (eq(re, se)) { ring = ring.concat(seg.slice(0, -1).reverse()); pool.splice(i, 1); grew = true; break; }
        if (eq(rs, se)) { ring = seg.slice(0, -1).concat(ring); pool.splice(i, 1); grew = true; break; }
        if (eq(rs, ss)) { ring = seg.slice(1).reverse().concat(ring); pool.splice(i, 1); grew = true; break; }
      }
    }
    rings.push(ring);
  }
  return rings;
}

// Douglas-Peucker in degrees
function simplify(pts, eps = 0.0004) {
  if (pts.length < 3) return pts;
  const dmax = { d: 0, i: 0 };
  const [a, b] = [pts[0], pts[pts.length - 1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointLineDist(pts[i], a, b);
    if (d > dmax.d) { dmax.d = d; dmax.i = i; }
  }
  if (dmax.d > eps) {
    const left = simplify(pts.slice(0, dmax.i + 1), eps);
    const right = simplify(pts.slice(dmax.i), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}
function pointLineDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

const out = [];
for (const isl of ISLANDS) {
  try {
    const q = isl.id ? `rel(${isl.id});out geom;` : `(${isl.query};);out geom;`;
    const data = await overpass(q);
    for (const el of data.elements) {
      let rings = [];
      if (el.type === 'relation') {
        const outers = el.members.filter((m) => m.type === 'way' && m.role === 'outer' && m.geometry);
        rings = stitchRings(outers);
      } else if (el.type === 'way' && el.geometry) {
        rings = [el.geometry.map((g) => [g.lat, g.lon])];
      }
      for (const ring of rings) {
        const simple = simplify(ring).map(([lat, lon]) => [+lat.toFixed(5), +lon.toFixed(5)]);
        if (simple.length >= 4) out.push({ name: isl.name, ring: simple });
        console.log(`${isl.name}: ring ${ring.length} pts -> ${simple.length}`);
      }
    }
  } catch (err) {
    console.warn(`${isl.name}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // be polite to overpass
}

mkdirSync(new URL('../data', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/perimeter.json', import.meta.url), JSON.stringify(out));
console.log(`wrote data/perimeter.json with ${out.length} rings`);
