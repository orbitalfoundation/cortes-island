// The information cloud: geotagged items float above the island as cards,
// tethered to their surface location by a thin colored line. Hover to
// preview, click to focus. Color = category, height ∝ importance,
// opacity ∝ recency.

import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

// dataviz reference palette, dark-surface column (validated); legend order =
// slot order. Labels on every card are the secondary encoding.
export const CATEGORY_COLORS = {
  news: '#3987e5',
  marine: '#199e70',
  event: '#c98500',
  wildlife: '#2fae2f', // green slot, lifted one step for the darker scene backdrop
  culture: '#9085e9',
  community: '#e66767',
  photo: '#d55181',
  reference: '#d95926',
};
export const CATEGORY_ORDER = ['news', 'marine', 'event', 'wildlife', 'culture', 'community', 'photo', 'reference'];

const MAX_CARDS = 110;         // DOM cards; the rest render as glow points
const DAY = 86400000;

function hash01(s, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function ageDays(item) {
  const t = item.content.publishedAt ? Date.parse(item.content.publishedAt) : Date.parse(item.fetchedAt);
  return Math.max(0, (Date.now() - t) / DAY);
}

// recency weight: this week ≈ 1, fades to 0.25 over ~4 months; reference never fades
function recency(item) {
  if (item.meta.category === 'reference') return 0.8;
  return 0.25 + 0.75 * Math.exp(-ageDays(item) / 45);
}

export function createCards({ scene, camera, frame, container, detailEl, onFocus, exaggeration = 1, maxCards = MAX_CARDS }) {
  const entries = new Map(); // id -> entry
  const hidden = new Set();  // categories toggled off
  let focused = null;
  let searchQ = '';
  const ex = exaggeration;

  // --- tether lines: screen-space fat lines so they hold ~3px at any zoom ---
  const lineMat = new LineMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    linewidth: 3, depthWrite: false, // linewidth in pixels
  });
  lineMat.resolution.set(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => lineMat.resolution.set(window.innerWidth, window.innerHeight));
  let lines = null;

  // --- ground-contact spheres: soft translucent domes marking where each
  // tether actually touches the island ---
  const MAX_TOUCH = 1000;
  const touch = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 18, 14),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false }),
    MAX_TOUCH,
  );
  touch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  touch.count = 0;
  touch.frustumCulled = false;
  scene.add(touch);
  const touchDummy = new THREE.Object3D();

  // --- glow points for the long tail ---
  const pointGeo = new THREE.BufferGeometry();
  const points = new THREE.Points(pointGeo, new THREE.PointsMaterial({
    vertexColors: true, size: 46, sizeAttenuation: true, transparent: true,
    opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
    map: glowTexture(), alphaTest: 0.01,
  }));
  points.frustumCulled = false;
  scene.add(points);

  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function upsert(item) {
    if (!item.geo) return;
    let e = entries.get(item.id);
    if (!e) {
      e = { item, el: null, carded: false, groundY: null };
      e.anchor = frame.toLocal(item.geo.lat, item.geo.lon, 0);
      e.jitter = hash01(item.id, 7);
      entries.set(item.id, e);
    }
    e.item = item;
    e.rec = recency(item);
    e.imp = item.meta.importance ?? 0.4;
    e.ground = item.meta.tier === 'ground';
    e.floatY = e.ground ? 30 : 300 + e.imp * 950 + e.jitter * 180;
    e.color = new THREE.Color(CATEGORY_COLORS[item.meta.category] ?? '#9aa4ad');
    rebuild();
  }

  // emoji for ground markers — quick visual grammar for what's there
  function iconFor(item) {
    const t = `${item.content.title} ${item.meta.topics.join(' ')} ${item.content.summary ?? ''}`.toLowerCase();
    if (/whale|orca|humpback/.test(t)) return '🐋';
    if (/seal|sea lion/.test(t)) return '🦭';
    if (/salmon|trout|fish/.test(t)) return '🐟';
    if (/wolf|wolves/.test(t)) return '🐺';
    if (/eagle|heron|bird|loon|waterfowl|oystercatcher/.test(t)) return '🐦';
    if (/kayak|paddle|canoe/.test(t)) return '🛶';
    if (/camp/.test(t)) return '⛺';
    if (/trail|hik/.test(t)) return '🥾';
    if (/beach|swim/.test(t)) return '🏖️';
    if (/stargaz|dark-sky|night/.test(t)) return '🌌';
    if (/rock|reef|rapid|hazard|aground|shoal/.test(t)) return '⚠️';
    if (/marina|dock|anchor|moorage|wharf/.test(t)) return '⚓';
    if (/restaurant|cafe|food|pub|bakery|takeout/.test(t)) return '🍴';
    if (/store|shop|market|co-op|fuel/.test(t)) return '🏪';
    if (/school|academy/.test(t)) return '🎓';
    if (/library|book/.test(t)) return '📚';
    if (/museum|archive/.test(t)) return '🏛️';
    if (/church|cemetery/.test(t)) return '⛪';
    if (/viewpoint|bluff|lookout/.test(t)) return '🔭';
    if (/park|forest|reserve|nature/.test(t)) return '🌲';
    return '📍';
  }

  function makeCardEl(e) {
    const el = document.createElement('div');
    el.style.setProperty('--cat', CATEGORY_COLORS[e.item.meta.category] ?? '#9aa4ad');
    if (e.ground) {
      el.className = 'card ground';
      el.innerHTML = `<span class="g-icon">${iconFor(e.item)}</span><span class="g-name">${escapeHtml(e.item.content.title)}</span>`;
    } else {
      el.className = 'card';
      const img = e.item.content.image ? `<img loading="lazy" src="${e.item.content.image}" alt="" />` : '';
      el.innerHTML = `
        <div class="card-head"><span class="dot"></span><span class="cat">${e.item.meta.category}</span>
          <span class="when">${timeago(e.item)}</span></div>
        <div class="card-title">${escapeHtml(e.item.content.title)}</div>
        <div class="card-more">${img}<div class="card-summary">${escapeHtml((e.item.content.summary ?? '').slice(0, 180))}</div></div>`;
    }
    el.addEventListener('click', (ev) => { ev.stopPropagation(); focus(e); });
    container.appendChild(el);
    return el;
  }

  function timeago(item) {
    const d = ageDays(item);
    if (d < 1) return 'today';
    if (d < 2) return 'yesterday';
    if (d < 30) return `${Math.round(d)}d ago`;
    if (d < 365) return `${Math.round(d / 30)}mo ago`;
    return `${Math.round(d / 365)}y ago`;
  }

  function escapeHtml(s) {
    return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function matchesSearch(e) {
    if (!searchQ) return true;
    const it = e.item;
    const hay = `${it.content.title} ${it.content.summary ?? ''} ${it.geo?.place ?? ''} ` +
      `${it.meta.category} ${it.meta.topics.join(' ')} ${it.source.author ?? ''}`.toLowerCase();
    return searchQ.split(/\s+/).every((w) => hay.includes(w));
  }

  // choose which items get DOM cards vs glow points, rebuild buffers.
  // ground-tier items always get their small marker element; floating items
  // compete for the card budget.
  function rebuild() {
    const vis = [...entries.values()]
      .filter((e) => !hidden.has(e.item.meta.category) && matchesSearch(e));
    const all = vis.filter((e) => !e.ground);
    const grounds = vis.filter((e) => e.ground);
    all.sort((a, b) => (b.imp * b.rec) - (a.imp * a.rec));
    const carded = new Set(all.slice(0, maxCards));
    for (const g of grounds) carded.add(g);

    for (const e of entries.values()) {
      const want = carded.has(e);
      if (want && !e.el) e.el = makeCardEl(e);
      if (!want && e.el) { e.el.remove(); e.el = null; }
      e.carded = want;
    }

    // tether lines for carded items (ground markers need no tether)
    const linePos = [], lineCol = [];
    for (const e of carded) {
      if (e.ground) continue;
      const y0 = e.groundY ?? 0;
      linePos.push(e.anchor.x, y0, e.anchor.z, e.anchor.x, y0 + e.floatY, e.anchor.z);
      const c = e.color;
      lineCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    if (lines) { scene.remove(lines); lines.geometry.dispose(); }
    if (linePos.length) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(linePos);
      geo.setColors(lineCol);
      lines = new LineSegments2(geo, lineMat);
      lines.frustumCulled = false;
      scene.add(lines);
    } else {
      lines = null;
    }

    // points for everything visible (carded ones too — reads as a glowing node)
    const pp = new Float32Array(all.length * 3);
    const pc = new Float32Array(all.length * 3);
    all.forEach((e, j) => {
      pp.set([e.anchor.x, (e.groundY ?? 0) + e.floatY, e.anchor.z], j * 3);
      pc.set([e.color.r * e.rec, e.color.g * e.rec, e.color.b * e.rec], j * 3);
    });
    pointGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pointGeo.setAttribute('color', new THREE.BufferAttribute(pc, 3));

    // ground-contact domes for every visible item, ground markers included
    touch.count = Math.min(vis.length, MAX_TOUCH);
    vis.slice(0, MAX_TOUCH).forEach((e, j) => {
      const r = 20 + e.imp * 26;
      touchDummy.position.set(e.anchor.x, (e.groundY ?? e.anchor.y * ex) + 2, e.anchor.z);
      touchDummy.scale.set(r, r * 0.55, r); // squashed dome hugging the ground
      touchDummy.updateMatrix();
      touch.setMatrixAt(j, touchDummy.matrix);
      touch.setColorAt(j, e.color);
    });
    touch.instanceMatrix.needsUpdate = true;
    if (touch.instanceColor) touch.instanceColor.needsUpdate = true;
  }

  // --- ground snapping: a few raycasts per frame against loaded tiles ---
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  let snapQueue = [];
  let revalidateAt = 0;
  function snapSome(tilesGroup, t) {
    if (!snapQueue.length) {
      const unsnapped = [...entries.values()].filter((e) => e.groundY == null);
      if (unsnapped.length) {
        snapQueue = unsnapped;
      } else if (t > revalidateAt) {
        // tiles refine over time: coarse-LOD hits can be tens of meters off,
        // leaving a few tethers floating — re-check everything periodically
        revalidateAt = t + 12;
        snapQueue = [...entries.values()];
      }
    }
    let n = 0, tries = 0;
    while (snapQueue.length && n < 3 && tries < 8) {
      const e = snapQueue.pop();
      tries++;
      if (e.groundY == null) e.snapTries = (e.snapTries ?? 0) + 1;
      ray.set(new THREE.Vector3(e.anchor.x, 2500 * ex, e.anchor.z), down);
      const hit = ray.intersectObject(tilesGroup, true)[0];
      // only trust hits near the real surface — early coarse-LOD geometry can
      // sit tens of km below and must not be cached
      if (hit && hit.point.y > e.anchor.y * ex - 80 * ex && hit.point.y < e.anchor.y * ex + 900 * ex) {
        if (e.groundY == null || Math.abs(hit.point.y - e.groundY) > 3) { e.groundY = hit.point.y; n++; }
      } else if (e.groundY == null && e.snapTries > 40) {
        e.groundY = Math.max(e.anchor.y * ex, 0); n++; // give up: use ellipsoid surface
      }
    }
    if (n) rebuild();
  }

  // --- focus / detail panel ---
  function focus(e) {
    focused = e;
    const it = e.item;
    detailEl.classList.remove('hidden');
    detailEl.style.setProperty('--cat', CATEGORY_COLORS[it.meta.category] ?? '#9aa4ad');
    detailEl.innerHTML = `
      <button class="close" aria-label="close">×</button>
      ${it.content.image ? `<img src="${it.content.image}" alt="" />` : ''}
      <div class="detail-body">
        <div class="card-head"><span class="dot"></span><span class="cat">${it.meta.category}</span>
          <span class="when">${timeago(it)}${it.geo.place ? ` · ${escapeHtml(it.geo.place)}` : ''}</span></div>
        <h2>${escapeHtml(it.content.title)}</h2>
        ${it.source.author ? `<div class="byline">${escapeHtml(it.source.author)} · ${escapeHtml(it.source.adapter)}</div>` : ''}
        <p>${escapeHtml(it.content.summary ?? '')}</p>
        ${it.meta.topics?.length ? `<div class="topics">${it.meta.topics.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <a href="${it.content.link}" target="_blank" rel="noopener">open source ↗</a>
      </div>`;
    detailEl.querySelector('.close').addEventListener('click', unfocus);
    onFocus?.(new THREE.Vector3(e.anchor.x, (e.groundY ?? 0) + e.floatY * 0.5, e.anchor.z));
  }
  function unfocus() { focused = null; detailEl.classList.add('hidden'); }
  detailEl.addEventListener('click', (ev) => ev.stopPropagation());

  // --- per-frame DOM projection with screen-space declutter ---
  const v = new THREE.Vector3(), camTo = new THREE.Vector3();
  const occupied = new Map(); // grid cell -> priority
  const sorted = [];          // entries ordered by priority, refreshed on rebuild
  function update(t, tilesGroup) {
    if (tilesGroup) snapSome(tilesGroup, t);
    const w = container.clientWidth, h = container.clientHeight;
    if (sorted.length !== entries.size) {
      sorted.length = 0;
      sorted.push(...entries.values());
      sorted.sort((a, b) => (b.imp * b.rec) - (a.imp * a.rec));
    }
    occupied.clear();
    const CELL = 105;
    for (const e of sorted) {
      if (!e.el) continue;
      const bob = e.ground ? 0 : Math.sin(t * 0.4 + e.jitter * 6.28) * 6;
      const worldY = (e.groundY ?? 0) + e.floatY + bob;
      v.set(e.anchor.x, worldY, e.anchor.z).project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const dist = camera.position.distanceTo(camTo.set(e.anchor.x, worldY, e.anchor.z));
      const maxDist = e.ground ? 11000 : 42000; // markers reveal as you come down
      let visible = !behind && x > -260 && x < w + 60 && y > -120 && y < h + 60 && dist < maxDist;
      if (visible && e !== focused) {
        // one card per grid cell — higher priority wins, the rest stay glow points
        const cell = (Math.round(x / CELL) << 12) | (Math.round(y / CELL) & 0xfff);
        if (occupied.has(cell)) visible = false;
        else occupied.set(cell, e);
      }
      e.el.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const scale = Math.max(0.42, Math.min(1, 5200 / dist));
      e.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(8px,-50%) scale(${scale.toFixed(3)})`;
      // recency drives priority and glow, not legibility — cards stay solid
      e.el.style.opacity = focused && focused !== e ? '0.35' : '1';
      e.el.style.zIndex = String(100000 - Math.round(dist));
    }
  }

  function toggleCategory(cat) {
    if (hidden.has(cat)) hidden.delete(cat); else hidden.add(cat);
    rebuild();
    return !hidden.has(cat);
  }

  function setSearch(q) {
    searchQ = (q ?? '').trim().toLowerCase();
    rebuild();
  }

  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') unfocus(); });

  return { upsert, update, toggleCategory, setSearch, unfocus, entries, get size() { return entries.size; } };
}
