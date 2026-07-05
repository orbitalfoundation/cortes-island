// Night lights: warm window-glow points scattered around the island's
// settlements, appearing as the sun goes down. Snapped to the terrain with
// the same lazy raycast trick the cards use.

import * as THREE from 'three';

const SETTLEMENTS = [
  ['Mansons Landing', 18, 450], ['Whaletown', 14, 380], ['Squirrel Cove', 12, 380],
  ['Gorge Harbour', 10, 420], ['Smelt Bay', 8, 400], ['Cortes Bay', 8, 350],
  ['Hollyhock', 6, 220], ['Linnaea Farm', 4, 250], ['Cortes Island School', 6, 350],
  ['Tiber Bay', 3, 250], ['Refuge Cove', 5, 200],
];

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,220,160,1)');
  grad.addColorStop(0.4, 'rgba(255,200,120,0.5)');
  grad.addColorStop(1, 'rgba(255,190,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function hash01(n) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }

export function createNightLights({ scene, frame, places, exaggeration = 1 }) {
  const spots = [];
  for (const [name, count, radius] of SETTLEMENTS) {
    const p = places.find((q) => q.name === name);
    if (!p) continue;
    const center = frame.toLocal(p.lat, p.lon, 0);
    for (let i = 0; i < count; i++) {
      const a = hash01(spots.length * 3 + 1) * Math.PI * 2;
      const r = Math.sqrt(hash01(spots.length * 5 + 2)) * radius;
      spots.push({
        x: center.x + Math.cos(a) * r,
        z: center.z + Math.sin(a) * r,
        baseY: center.y * exaggeration,
        y: null,
        flicker: 0.75 + hash01(spots.length * 7 + 3) * 0.25,
      });
    }
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(spots.length * 3);
  spots.forEach((s, i) => pos.set([s.x, s.baseY + 4, s.z], i * 3));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: glowTex(), color: 0xffd9a6, size: 120, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, alphaTest: 0.01, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  // one soft halo per settlement so villages read from far away
  const haloGeo = new THREE.BufferGeometry();
  const haloPos = [];
  for (const [name] of SETTLEMENTS) {
    const p = places.find((q) => q.name === name);
    if (p) {
      const v = frame.toLocal(p.lat, p.lon, 0);
      haloPos.push(v.x, v.y * exaggeration + 60, v.z);
    }
  }
  haloGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(haloPos), 3));
  const haloMat = new THREE.PointsMaterial({
    map: glowTex(), color: 0xffc98e, size: 780, sizeAttenuation: true,
    transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, alphaTest: 0.01, fog: false,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.frustumCulled = false;
  scene.add(halos);

  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  let cursor = 0, done = false;

  return {
    update(skyState, tilesGroup) {
      mat.opacity = Math.max(0, (1 - (skyState?.day ?? 1)) - 0.08) * 0.95;
      haloMat.opacity = mat.opacity * 0.4;
      if (done || !tilesGroup) return;
      // snap lights to the ground, a couple per frame, retrying until the
      // tiles under each spot have actually streamed in
      let unresolved = false;
      for (let k = 0; k < 2; k++, cursor++) {
        const s = spots[cursor % spots.length];
        if (s.y != null) continue;
        unresolved = true;
        ray.set(new THREE.Vector3(s.x, 2500 * exaggeration, s.z), down);
        const hit = ray.intersectObject(tilesGroup, true)[0];
        if (hit && hit.point.y > s.baseY - 60 && hit.point.y < s.baseY + 600) {
          s.y = hit.point.y + 5;
          const i = spots.indexOf(s);
          geo.attributes.position.setY(i, s.y);
          geo.attributes.position.needsUpdate = true;
        }
      }
      if (!unresolved && cursor > spots.length) done = spots.every((s) => s.y != null);
    },
  };
}
