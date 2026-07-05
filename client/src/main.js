// Cortes Island — a living portrait.
// Boot order: config+socket → scene → sky/ocean/clouds/weather → tiles →
// cards → life → lights → sound.
//
// config.json (server) sets defaults; URL params override:
//   ?t=HH:MM  pin time of day        ?ex=2.2   elevation exaggeration
//   ?wx=rain|snow|storm|clear        ?carve=1  carve the island out
// Keys: [ ] scrub time, 0 reset, C toggle carve, Esc close detail.
// Double-click/tap the ground to re-center the orbit there.

import * as THREE from 'three';
import { createScene } from './world/scene.js';
import { makeFrame } from './world/geo.js';
import { createTiles } from './world/tiles.js';
import { createSky } from './world/sky.js';
import { createOcean } from './world/ocean.js';
import { createClouds } from './world/clouds.js';
import { createLife } from './world/life.js';
import { createWeather } from './world/weather.js';
import { createNightLights } from './world/lights.js';
import { createSound } from './world/sound.js';
import { createCards, CATEGORY_COLORS, CATEGORY_ORDER } from './cards.js';
import { connect } from './net.js';

const canvas = document.getElementById('scene');
const cardsEl = document.getElementById('cards');
const detailEl = document.getElementById('detail');
const loadingEl = document.getElementById('loading');
const clockEl = document.getElementById('clock');
const weatherEl = document.getElementById('weather');
const legendEl = document.getElementById('legend');
const audioEl = document.getElementById('audio-controls');
const lifeEl = document.getElementById('life-markers');

const params = new URLSearchParams(location.search);
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

const { renderer, scene, camera, controls, flyTo, updateFlight } = createScene(canvas, { mobile: IS_MOBILE });

let world = null;

// time control: real island time by default; [ and ] scrub, 0 resets.
let timeOffsetMs = 0;
const urlT = params.get('t');
if (urlT) {
  const [h, m] = urlT.split(':').map(Number);
  const now = new Date();
  timeOffsetMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m ?? 0) - now;
}
window.addEventListener('keydown', (e) => {
  if (e.key === ']') timeOffsetMs += 15 * 60000;
  if (e.key === '[') timeOffsetMs -= 15 * 60000;
  if (e.key === '0') timeOffsetMs = 0;
  if (e.key === 'c' || e.key === 'C') {
    if (world) {
      const on = !world.tiles.carved;
      world.tiles.setCarve(on);
      world.ocean.setOpaque(on);
    }
  }
});
const worldNow = () => new Date(Date.now() + timeOffsetMs);

async function boot() {
  const pending = [];
  const { config } = await connect({
    onItem: (item) => { if (world) world.cards.upsert(item); else pending.push(item); },
  });

  const EXAG = Math.max(1, Math.min(4, Number(params.get('ex')) || config.exaggeration || 1.6));
  const CARVE = params.has('carve') ? params.get('carve') !== '0' : Boolean(config.carve);

  const frame = makeFrame(config.island.lat, config.island.lon);
  const sky = createSky({ scene, renderer, island: config.island });
  const ocean = createOcean({ scene, exaggeration: EXAG, opaque: CARVE });
  const clouds = createClouds({ scene, count: IS_MOBILE ? 24 : 46 });
  const weather = createWeather({ scene, island: config.island, hudEl: weatherEl });
  const life = createLife({ scene, frame, config, seaY: ocean.seaY });
  const nightLights = createNightLights({ scene, frame, places: config.places, exaggeration: EXAG });
  const sound = createSound({ config });

  const tiles = createTiles({
    scene, camera, renderer, frame,
    cesiumKey: config.cesiumKey,
    exaggeration: EXAG,
    carve: CARVE,
    perimeter: config.perimeter ?? [],
    onReady: () => loadingEl.classList.add('done'),
  });
  if (!config.cesiumKey) {
    loadingEl.querySelector('span').textContent = 'no CESIUM_KEY configured — sky and data only';
    setTimeout(() => loadingEl.classList.add('done'), 2500);
  }

  // faint coastline ring from the real OSM perimeter — shows the carve
  // boundary when the island stands alone
  let ringLine = null;
  {
    const cortesRing = (config.perimeter ?? []).find((p) => p.name === 'Cortes Island');
    if (cortesRing) {
      const { LineMaterial } = await import('three/examples/jsm/lines/LineMaterial.js');
      const { LineGeometry } = await import('three/examples/jsm/lines/LineGeometry.js');
      const { Line2 } = await import('three/examples/jsm/lines/Line2.js');
      const pts = [];
      for (const [lat, lon] of cortesRing.ring) {
        const v = frame.toLocal(lat, lon, 0);
        pts.push(v.x, ocean.seaY + 3, v.z);
      }
      pts.push(pts[0], pts[1], pts[2]);
      const g = new LineGeometry();
      g.setPositions(pts);
      const m = new LineMaterial({
        color: 0x9fd8e8, linewidth: 1.5, transparent: true, opacity: 0.35, depthWrite: false,
      });
      m.resolution.set(innerWidth, innerHeight);
      window.addEventListener('resize', () => m.resolution.set(innerWidth, innerHeight));
      ringLine = new Line2(g, m);
      ringLine.frustumCulled = false;
      scene.add(ringLine);
    }
  }

  const cards = createCards({
    scene, camera, frame,
    container: cardsEl, detailEl,
    onFocus: (pos) => flyTo(pos),
    exaggeration: EXAG,
    maxCards: IS_MOBILE ? 46 : 110,
  });

  // legend chips double as category filters
  for (const cat of CATEGORY_ORDER) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.style.setProperty('--cat', CATEGORY_COLORS[cat]);
    chip.innerHTML = `<span class="dot"></span>${cat}`;
    chip.addEventListener('click', () => {
      chip.classList.toggle('off', !cards.toggleCategory(cat));
    });
    legendEl.appendChild(chip);
  }

  // --- sound controls: ambience + CKTZ live radio ---
  if (config.sound !== false) {
    const amb = document.createElement('button');
    amb.className = 'chip audio';
    amb.textContent = '🔈 sound';
    amb.title = 'ambient surf, wind and gulls';
    amb.addEventListener('click', () => {
      sound.start();
      sound.setMuted(amb.classList.toggle('off'));
    });
    audioEl.appendChild(amb);
    // start ambience quietly on the first interaction anywhere
    const kick = () => { sound.start(); window.removeEventListener('pointerdown', kick); };
    window.addEventListener('pointerdown', kick);
  }
  if (config.radioStream) {
    const radio = document.createElement('button');
    radio.className = 'chip audio off';
    radio.textContent = `📻 ${config.radioName ?? 'island radio'}`;
    radio.title = 'live community radio stream';
    radio.addEventListener('click', () => {
      radio.classList.toggle('off', !sound.toggleRadio());
    });
    audioEl.appendChild(radio);
  }

  // --- life markers: always know where the ferry and the whale are ---
  const markers = [];
  function addMarker({ icon, get }) {
    const el = document.createElement('button');
    el.className = 'life-marker';
    lifeEl.appendChild(el);
    markers.push({ el, icon, get });
    el.addEventListener('click', () => {
      const m = get();
      flyTo(new THREE.Vector3(m.pos.x, Math.max(m.pos.y, 0) + 120, m.pos.z));
    });
  }
  addMarker({
    icon: '⛴',
    get: () => ({
      pos: life.ferry.pos,
      label: life.ferry.sailing ? 'ferry · crossing Sutil Channel' : 'ferry · at dock',
      show: true,
    }),
  });
  addMarker({
    icon: '🐋',
    get: () => ({
      pos: life.whale.pos,
      label: life.whale.surfacing ? 'humpback · surfacing!' : 'humpback · out here somewhere',
      show: true,
    }),
  });
  const mv = new THREE.Vector3();
  function updateMarkers() {
    for (const m of markers) {
      const s = m.get();
      mv.copy(s.pos).setY(Math.max(s.pos.y, 0) + 30).project(camera);
      const behind = mv.z > 1;
      const x = (mv.x * 0.5 + 0.5) * innerWidth, y = (-mv.y * 0.5 + 0.5) * innerHeight;
      const on = s.show && !behind && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
      m.el.style.display = on ? '' : 'none';
      if (!on) continue;
      m.el.textContent = `${m.icon} ${s.label}`;
      m.el.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -130%)`;
    }
  }

  // --- double-click / double-tap: re-center the orbit on the ground ---
  const pickRay = new THREE.Raycaster();
  function recenter(clientX, clientY) {
    const nd = new THREE.Vector2(
      (clientX / innerWidth) * 2 - 1,
      -(clientY / innerHeight) * 2 + 1,
    );
    pickRay.setFromCamera(nd, camera);
    const hit = pickRay.intersectObject(tiles.tiles.group, true)[0];
    const point = hit?.point;
    if (!point) return;
    flyTo(point.clone().setY(Math.max(point.y, 0)));
  }
  canvas.addEventListener('dblclick', (e) => recenter(e.clientX, e.clientY));
  let lastTap = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const now = performance.now();
    if (now - lastTap < 320) recenter(e.clientX, e.clientY);
    lastTap = now;
  });

  world = { frame, sky, ocean, clouds, weather, life, tiles, cards, nightLights, sound, camera, controls };
  window.__world = world; // debug hook
  for (const item of pending) cards.upsert(item);

  const clockFmt = new Intl.DateTimeFormat('en-CA', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver',
  });

  const start = performance.now();
  let last = start;
  let skyState = null;
  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const t = (nowMs - start) / 1000;
    const dt = Math.min(0.1, (nowMs - last) / 1000);
    last = nowMs;
    const date = worldNow();

    controls.update();
    updateFlight(dt);
    skyState = sky.update(date, weather.state);
    ocean.update(t, skyState, weather.state);
    clouds.update(dt, skyState, weather.state);
    weather.update(dt, camera, skyState);
    life.update(t, date, dt);
    nightLights.update(skyState, tiles.tiles.group);
    sound.update(dt, { camY: camera.position.y, skyState, wx: weather.state });
    tiles.update();
    cards.update(t, tiles.tiles.group);
    updateMarkers();
    if (ringLine) ringLine.visible = tiles.carved;
    renderer.render(scene, camera);

    if (!clockEl.dataset.m || clockEl.dataset.m !== String(date.getMinutes())) {
      clockEl.dataset.m = String(date.getMinutes());
      clockEl.textContent = `${clockFmt.format(date)} on the island${timeOffsetMs ? ' (scrubbed)' : ''}`;
    }
  });
}

boot().catch((err) => {
  console.error(err);
  loadingEl.querySelector('span').textContent = `failed to start: ${err.message}`;
});
