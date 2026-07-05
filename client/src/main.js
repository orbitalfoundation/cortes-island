// Cortes Island — a living portrait.
// Boot order: config+socket → scene → sky/ocean/clouds → tiles → cards → life.

import { createScene } from './world/scene.js';
import { makeFrame } from './world/geo.js';
import { createTiles } from './world/tiles.js';
import { createSky } from './world/sky.js';
import { createOcean } from './world/ocean.js';
import { createClouds } from './world/clouds.js';
import { createLife } from './world/life.js';
import { createCards, CATEGORY_COLORS, CATEGORY_ORDER } from './cards.js';
import { connect } from './net.js';

const canvas = document.getElementById('scene');
const cardsEl = document.getElementById('cards');
const detailEl = document.getElementById('detail');
const loadingEl = document.getElementById('loading');
const clockEl = document.getElementById('clock');
const legendEl = document.getElementById('legend');

const { renderer, scene, camera, controls, flyTo, updateFlight } = createScene(canvas);

let world = null;

// time control: real island time by default; [ and ] scrub, 0 resets —
// handy for watching sunset without waiting for one.
let timeOffsetMs = 0;
const urlT = new URLSearchParams(location.search).get('t');
if (urlT) {
  const [h, m] = urlT.split(':').map(Number);
  const now = new Date();
  timeOffsetMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m ?? 0) - now;
}
window.addEventListener('keydown', (e) => {
  if (e.key === ']') timeOffsetMs += 15 * 60000;
  if (e.key === '[') timeOffsetMs -= 15 * 60000;
  if (e.key === '0') timeOffsetMs = 0;
});
const worldNow = () => new Date(Date.now() + timeOffsetMs);

async function boot() {
  const pending = [];
  const { config } = await connect({
    onItem: (item) => { if (world) world.cards.upsert(item); else pending.push(item); },
  });

  const frame = makeFrame(config.island.lat, config.island.lon);
  const sky = createSky({ scene, renderer, island: config.island });
  const ocean = createOcean({ scene });
  const clouds = createClouds({ scene });
  const life = createLife({ scene, frame, config });

  const tiles = createTiles({
    scene, camera, renderer, frame,
    cesiumKey: config.cesiumKey,
    onReady: () => loadingEl.classList.add('done'),
  });
  if (!config.cesiumKey) {
    loadingEl.querySelector('span').textContent = 'no CESIUM_KEY configured — sky and data only';
    setTimeout(() => loadingEl.classList.add('done'), 2500);
  }

  const cards = createCards({
    scene, camera, frame,
    container: cardsEl, detailEl,
    onFocus: (pos) => flyTo(pos),
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

  world = { frame, sky, ocean, clouds, life, tiles, cards, camera, controls };
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
    if (Math.floor(t * 2) % 4 === 0 || !skyState) skyState = sky.update(date);
    ocean.update(t, skyState);
    clouds.update(dt, skyState);
    life.update(t, date);
    tiles.update();
    cards.update(t, tiles.tiles.group);
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
