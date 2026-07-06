// Real island weather from Open-Meteo (no key): overcast darkens the day,
// wind drives the clouds and the sea state, rain and snow fall as particles
// around the camera. Test overrides: ?wx=rain|snow|storm|clear

import * as THREE from 'three';

const REFRESH_MS = 15 * 60000;

function dirLabel(deg) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) / 45)) % 8];
}

function makePrecip({ scene, count, color, size }) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 5000;
    pos[i * 3 + 1] = Math.random() * 1600;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 5000;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { points, pos, geo, mat, count };
}

export function createWeather({ scene, island, hudEl }) {
  const state = {
    cloud: 0.35, rain: 0, snow: 0, windKmh: 10, windDir: 300, temp: 15,
    storm: 0, label: '',
  };

  const rain = makePrecip({ scene, count: 3200, color: 0x9fb6c8, size: 9 });
  const snow = makePrecip({ scene, count: 2200, color: 0xf4f7fb, size: 16 });

  const override = new URLSearchParams(location.search).get('wx');
  function applyOverride() {
    if (!override) return false;
    if (override === 'rain') Object.assign(state, { cloud: 0.9, rain: 2.5, snow: 0, windKmh: 22 });
    if (override === 'snow') Object.assign(state, { cloud: 0.85, rain: 0, snow: 1.5, windKmh: 12, temp: -1 });
    if (override === 'storm') Object.assign(state, { cloud: 1, rain: 6, snow: 0, windKmh: 65, windDir: 135, temp: 9 });
    if (override === 'clear') Object.assign(state, { cloud: 0.04, rain: 0, snow: 0, windKmh: 6 });
    state.label = `test weather: ${override}`;
    derive();
    return true;
  }

  // tide state from the Whaletown DFO station, folded into the HUD line
  state.tide = null;
  async function refreshTides() {
    try {
      const data = await (await fetch('/api/tides')).json();
      if (!data.ok) return;
      const now = Date.now();
      const series = data.series.map((p) => ({ t: Date.parse(p.t), v: p.v }));
      const i = Math.max(1, series.findIndex((p) => p.t > now));
      const cur = series[i - 1], next = series[i];
      if (!cur || !next) return;
      const rising = next.v > cur.v;
      // walk forward to the turning point
      let peak = next;
      for (let j = i; j < series.length - 1; j++) {
        if (rising ? series[j + 1].v < series[j].v : series[j + 1].v > series[j].v) { peak = series[j]; break; }
      }
      const when = new Date(peak.t).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Vancouver' });
      state.tide = `tide ${cur.v.toFixed(1)} m ${rising ? 'rising' : 'falling'} · ${rising ? 'high' : 'low'} ~${when}`;
      derive();
    } catch { /* tide line just stays absent */ }
  }
  refreshTides();
  setInterval(refreshTides, 30 * 60000);

  function derive() {
    state.storm = Math.min(1, state.windKmh / 60 + state.rain / 8 + state.snow / 6);
    const parts = [`${Math.round(state.temp)}°C`];
    if (state.snow > 0.05) parts.push(state.snow > 1 ? 'snowing' : 'light snow');
    else if (state.rain > 2) parts.push('heavy rain');
    else if (state.rain > 0.1) parts.push('rain');
    else if (state.cloud > 0.75) parts.push('overcast');
    else if (state.cloud > 0.35) parts.push('partly cloudy');
    else parts.push('clear');
    parts.push(`wind ${Math.round(state.windKmh)} km/h ${dirLabel(state.windDir)}`);
    if (state.tide) parts.push(state.tide);
    if (!override) state.label = parts.join(' · ');
  }

  async function refresh() {
    if (applyOverride()) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${island.lat}&longitude=${island.lon}` +
        `&current=temperature_2m,precipitation,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto`;
      const data = await (await fetch(url)).json();
      const c = data.current ?? {};
      state.temp = c.temperature_2m ?? state.temp;
      state.rain = c.precipitation ?? 0;
      state.snow = c.snowfall ?? 0;
      state.cloud = (c.cloud_cover ?? 40) / 100;
      state.windKmh = c.wind_speed_10m ?? 10;
      state.windDir = c.wind_direction_10m ?? 300;
      derive();
    } catch { /* keep last state */ }
  }
  refresh();
  setInterval(refresh, REFRESH_MS);
  derive();

  const windVec = new THREE.Vector3();
  state.windVec = windVec;
  function update(dt, camera, skyState) {
    // wind vector in scene space (dir = where wind comes FROM; blows opposite)
    const a = (state.windDir + 180) * Math.PI / 180;
    const speed = state.windKmh / 3.6;
    windVec.set(Math.sin(a), 0, -Math.cos(a)).multiplyScalar(speed);

    for (const sys of [[rain, state.rain, 90], [snow, state.snow, 14]]) {
      const [p, rate, fall] = sys;
      const active = rate > 0.05;
      p.points.visible = active;
      if (!active) continue;
      p.mat.opacity = Math.min(0.55, 0.15 + rate * 0.12) * (0.4 + 0.6 * (skyState?.day ?? 1));
      const arr = p.pos;
      const wob = p === snow ? 1 : 0;
      for (let i = 0; i < p.count; i++) {
        arr[i * 3 + 1] -= fall * dt * (0.7 + (i % 7) * 0.09);
        arr[i * 3] += (windVec.x * 2 + wob * Math.sin(performance.now() / 900 + i)) * dt;
        arr[i * 3 + 2] += windVec.z * 2 * dt;
        if (arr[i * 3 + 1] < -40) {
          arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 5000;
          arr[i * 3 + 1] = camera.position.y + 400 + Math.random() * 1200;
          arr[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 5000;
        }
      }
      p.geo.attributes.position.needsUpdate = true;
    }

    if (hudEl && hudEl.dataset.label !== state.label) {
      hudEl.dataset.label = state.label;
      hudEl.textContent = state.label;
    }
  }

  return { state, windVec, update };
}
