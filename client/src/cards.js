// The information cloud: geotagged items float above the island as cards,
// tethered to their surface location by a thin colored line. Hover to
// preview, click to focus. Color = category, height ∝ importance,
// opacity ∝ recency.

import * as THREE from 'three';

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

export function createCards({ scene, camera, frame, container, detailEl, onFocus }) {
  const entries = new Map(); // id -> entry
  const hidden = new Set();  // categories toggled off
  let focused = null;

  // --- tether lines (one segment per carded item) ---
  const lineGeo = new THREE.BufferGeometry();
  let linePos = new Float32Array(0), lineCol = new Float32Array(0);
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false,
  }));
  lines.frustumCulled = false;
  scene.add(lines);

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
    e.floatY = 300 + e.imp * 950 + e.jitter * 180;
    e.color = new THREE.Color(CATEGORY_COLORS[item.meta.category] ?? '#9aa4ad');
    rebuild();
  }

  function makeCardEl(e) {
    const el = document.createElement('div');
    el.className = 'card';
    el.style.setProperty('--cat', CATEGORY_COLORS[e.item.meta.category] ?? '#9aa4ad');
    const img = e.item.content.image ? `<img loading="lazy" src="${e.item.content.image}" alt="" />` : '';
    el.innerHTML = `
      <div class="card-head"><span class="dot"></span><span class="cat">${e.item.meta.category}</span>
        <span class="when">${timeago(e.item)}</span></div>
      <div class="card-title">${escapeHtml(e.item.content.title)}</div>
      <div class="card-more">${img}<div class="card-summary">${escapeHtml((e.item.content.summary ?? '').slice(0, 180))}</div></div>`;
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

  // choose which items get DOM cards vs glow points, rebuild buffers
  function rebuild() {
    const all = [...entries.values()].filter((e) => !hidden.has(e.item.meta.category));
    all.sort((a, b) => (b.imp * b.rec) - (a.imp * a.rec));
    const carded = new Set(all.slice(0, MAX_CARDS));

    for (const e of entries.values()) {
      const want = carded.has(e);
      if (want && !e.el) e.el = makeCardEl(e);
      if (!want && e.el) { e.el.remove(); e.el = null; }
      e.carded = want;
    }

    // tether lines for carded items
    linePos = new Float32Array(carded.size * 6);
    lineCol = new Float32Array(carded.size * 6);
    let i = 0;
    for (const e of carded) {
      e.lineIndex = i;
      const y0 = e.groundY ?? 0;
      linePos.set([e.anchor.x, y0, e.anchor.z, e.anchor.x, y0 + e.floatY, e.anchor.z], i * 6);
      const c = e.color;
      lineCol.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      i++;
    }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3));

    // points for everything visible (carded ones too — reads as a glowing node)
    const pp = new Float32Array(all.length * 3);
    const pc = new Float32Array(all.length * 3);
    all.forEach((e, j) => {
      pp.set([e.anchor.x, (e.groundY ?? 0) + e.floatY, e.anchor.z], j * 3);
      pc.set([e.color.r * e.rec, e.color.g * e.rec, e.color.b * e.rec], j * 3);
    });
    pointGeo.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pointGeo.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  }

  // --- ground snapping: a few raycasts per frame against loaded tiles ---
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  let snapQueue = [];
  function snapSome(tilesGroup) {
    if (!snapQueue.length) snapQueue = [...entries.values()].filter((e) => e.groundY == null);
    let n = 0, tries = 0;
    while (snapQueue.length && n < 3 && tries < 8) {
      const e = snapQueue.pop();
      tries++;
      if (e.groundY == null) e.snapTries = (e.snapTries ?? 0) + 1;
      else continue;
      ray.set(new THREE.Vector3(e.anchor.x, 2500, e.anchor.z), down);
      const hit = ray.intersectObject(tilesGroup, true)[0];
      // only trust hits near the real surface — early coarse-LOD geometry can
      // sit tens of km below and must not be cached
      if (hit && hit.point.y > e.anchor.y - 80 && hit.point.y < e.anchor.y + 900) {
        e.groundY = hit.point.y; n++;
      } else if (e.snapTries > 40) {
        e.groundY = Math.max(e.anchor.y, 0); n++; // give up: use ellipsoid surface
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
    if (tilesGroup) snapSome(tilesGroup);
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
      const bob = Math.sin(t * 0.4 + e.jitter * 6.28) * 6;
      const worldY = (e.groundY ?? 0) + e.floatY + bob;
      v.set(e.anchor.x, worldY, e.anchor.z).project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const dist = camera.position.distanceTo(camTo.set(e.anchor.x, worldY, e.anchor.z));
      let visible = !behind && x > -260 && x < w + 60 && y > -120 && y < h + 60 && dist < 42000;
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
      e.el.style.opacity = (e.rec * (focused && focused !== e ? 0.35 : 1)).toFixed(2);
      e.el.style.zIndex = String(100000 - Math.round(dist));
    }
  }

  function toggleCategory(cat) {
    if (hidden.has(cat)) hidden.delete(cat); else hidden.add(cat);
    rebuild();
    return !hidden.has(cat);
  }

  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') unfocus(); });

  return { upsert, update, toggleCategory, unfocus, entries, get size() { return entries.size; } };
}
