// Cortes Island — a living portrait.
// Boot order: config+socket → scene → sky/ocean/clouds/weather → tiles →
// cards → life → lights.
//
// URL params:  ?t=HH:MM  pin time of day     ?ex=1.6   elevation exaggeration
//              ?wx=rain|snow|storm|clear     ?carve=0  keep surrounding world
// Keys:        [ ] scrub time, 0 reset, C toggle carve, Esc close detail

import { createScene } from './world/scene.js';
import { makeFrame } from './world/geo.js';
import { createTiles } from './world/tiles.js';
import { createSky } from './world/sky.js';
import { createOcean } from './world/ocean.js';
import { createClouds } from './world/clouds.js';
import { createLife } from './world/life.js';
import { createWeather } from './world/weather.js';
import { createNightLights } from './world/lights.js';
import { createCards, CATEGORY_COLORS, CATEGORY_ORDER } from './cards.js';
import { connect } from './net.js';

const canvas = document.getElementById('scene');
const cardsEl = document.getElementById('cards');
const detailEl = document.getElementById('detail');
const loadingEl = document.getElementById('loading');
const clockEl = document.getElementById('clock');
const weatherEl = document.getElementById('weather');
const legendEl = document.getElementById('legend');

const params = new URLSearchParams(location.search);
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const EXAG = Math.max(1, Math.min(4, Number(params.get('ex')) || 1.6));
const CARVE = params.get('carve') !== '0';

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

  const frame = makeFrame(config.island.lat, config.island.lon);
  const sky = createSky({ scene, renderer, island: config.island });
  const ocean = createOcean({ scene, exaggeration: EXAG, opaque: CARVE });
  const clouds = createClouds({ scene, count: IS_MOBILE ? 24 : 46 });
  const weather = createWeather({ scene, island: config.island, hudEl: weatherEl });
  const life = createLife({ scene, frame, config, seaY: ocean.seaY });
  const nightLights = createNightLights({ scene, frame, places: config.places, exaggeration: EXAG });

  const tiles = createTiles({
    scene, camera, renderer, frame,
    cesiumKey: config.cesiumKey,
    exaggeration: EXAG,
    carve: CARVE,
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

  world = { frame, sky, ocean, clouds, weather, life, tiles, cards, nightLights, camera, controls };
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
