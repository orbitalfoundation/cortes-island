// Sky, sun, moon, stars, and scene lighting driven by the real time of day
// on Cortes Island. Exposure follows the sun so the photorealistic tiles
// (baked daylight textures) dim convincingly at dusk and by night the island
// reads as moonlit silhouette under stars.

import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { sunPosition, moonPosition, moonIllumination, toDirection } from './astro.js';

const SKY_SCALE = 500000;

function makeMoonTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,252,240,1)');
  grad.addColorStop(0.8, 'rgba(240,238,228,0.9)');
  grad.addColorStop(1, 'rgba(240,238,228,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeStars() {
  const N = 2600;
  const pos = new Float32Array(N * 3);
  const size = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // random points on the upper hemisphere
    const a = Math.random() * Math.PI * 2;
    const z = Math.random() * 0.95 + 0.05;
    const r = Math.sqrt(1 - z * z);
    pos[i * 3] = Math.cos(a) * r * SKY_SCALE * 0.9;
    pos[i * 3 + 1] = z * SKY_SCALE * 0.9;
    pos[i * 3 + 2] = Math.sin(a) * r * SKY_SCALE * 0.9;
    size[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xdde4ff, size: 900, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -1;
  return points;
}

export function createSky({ scene, renderer, island }) {
  // atmospheric haze — distance fades toward the horizon color
  scene.fog = new THREE.FogExp2(0xb9cddb, 1.35e-5);
  const sky = new Sky();
  sky.scale.setScalar(SKY_SCALE);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.6;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.0018;
  u.mieDirectionalG.value = 0.8;
  scene.add(sky);

  const stars = makeStars();
  scene.add(stars);

  const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeMoonTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  moonSprite.scale.setScalar(18000);
  scene.add(moonSprite);

  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  const moonLight = new THREE.DirectionalLight(0xb8c4e0, 0);
  scene.add(moonLight, moonLight.target);
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a4438, 0.7);
  scene.add(hemi);

  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  const fogDay = new THREE.Color(0xb9cddb), fogDusk = new THREE.Color(0x8a6a58), fogNight = new THREE.Color(0x060a12);

  function update(date, wx) {
    const sp = sunPosition(date, island.lat, island.lon);
    const mp = moonPosition(date, island.lat, island.lon);
    toDirection(sp, sunDir);
    toDirection(mp, moonDir);
    u.sunPosition.value.copy(sunDir);

    const altDeg = sp.altitude * 180 / Math.PI;
    const day = smooth(-8, 12, altDeg);          // 0 night → 1 day
    const dusk = smooth(-10, 2, altDeg) * (1 - smooth(4, 14, altDeg)); // golden band
    const overcast = wx?.cloud ?? 0;

    renderer.toneMappingExposure = (0.14 + 0.78 * day) * (1 - 0.32 * overcast * day);

    // haze thickens in weather; color follows the light
    scene.fog.color.copy(fogNight).lerp(fogDay, day).lerp(fogDusk, dusk * 0.55)
      .multiplyScalar(1 - 0.35 * overcast * day);
    scene.fog.density = 1.35e-5 * (1 + overcast * 1.6 + (wx?.storm ?? 0) * 2.2);

    sun.position.copy(sunDir).multiplyScalar(80000);
    sun.intensity = 2.4 * day * (1 - 0.65 * overcast);
    sun.color.setHSL(0.09 + 0.045 * day, dusk > 0.3 ? 0.85 : 0.25, 0.6 + 0.3 * day);

    const moonUp = Math.max(0, Math.sin(mp.altitude));
    const illum = moonIllumination(date).fraction;
    moonSprite.position.copy(moonDir).multiplyScalar(SKY_SCALE * 0.85);
    moonSprite.material.opacity = moonUp * (1 - day) * 0.95;
    moonLight.position.copy(moonDir).multiplyScalar(60000);
    moonLight.intensity = 0.5 * moonUp * illum * (1 - day);

    hemi.intensity = 0.15 + 0.65 * day;
    stars.material.opacity = (1 - day) * 0.9;

    // sky shader handles twilight; deepen night by pushing rayleigh down
    u.rayleigh.value = 0.35 + 0.9 * day;

    return { day, dusk, sunDir, moonDir, altDeg };
  }

  return { update, sunDir };
}
