// The life layer: the real ferry crossing Sutil Channel on its actual
// schedule, gulls wheeling over the shoreline, and — if you're patient — a
// humpback surfacing in the channel.

import * as THREE from 'three';
import { SEA_LEVEL } from './ocean.js';

// --- ferry -----------------------------------------------------------------
// BC Ferries route 24, Heriot Bay (Quadra) <-> Whaletown (Cortes).
// Approximate current schedule, local time; crossing ~45 min.
const DEPART_HERIOT = ['08:05', '10:15', '12:35', '15:05', '17:25', '19:35'];
const DEPART_WHALETOWN = ['07:05', '09:10', '11:25', '13:50', '16:15', '18:30'];
const CROSSING_MIN = 45;

function minutesNow(date) { return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60; }
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

function buildFerry() {
  const ferry = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f4f5, roughness: 0.6 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1c3d5c, roughness: 0.7 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(46, 6, 14), blue);
  hull.position.y = 3;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 12), white);
  deck.position.y = 8.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(18, 5, 9), white);
  cabin.position.y = 13.5;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0xc23b22 }));
  stack.position.set(-4, 18, 0);
  ferry.add(hull, deck, cabin, stack);
  // running lights for night
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b8 });
  for (const x of [-16, -6, 4, 14]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.8), lightMat);
    lamp.position.set(x, 11.5, 6.2);
    const lamp2 = lamp.clone(); lamp2.position.z = -6.2;
    ferry.add(lamp, lamp2);
  }
  return ferry;
}

function createFerry({ scene, frame, ferryRoute }) {
  const pts = ferryRoute.map((p) => {
    const v = frame.toLocal(p.lat, p.lon, 0);
    v.y = SEA_LEVEL + 2;
    return v;
  });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.9);
  const mesh = buildFerry();
  scene.add(mesh);
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3();

  function update(date) {
    const now = minutesNow(date);
    let t = null; // 0 at Heriot, 1 at Whaletown
    for (const dep of DEPART_HERIOT) {
      const d = toMin(dep);
      if (now >= d && now <= d + CROSSING_MIN) t = (now - d) / CROSSING_MIN;
    }
    for (const dep of DEPART_WHALETOWN) {
      const d = toMin(dep);
      if (now >= d && now <= d + CROSSING_MIN) t = 1 - (now - d) / CROSSING_MIN;
    }
    let u;
    if (t == null) {
      // docked at whichever terminal the last sailing ended at
      const all = [
        ...DEPART_HERIOT.map((s) => ({ m: toMin(s), end: 1 })),
        ...DEPART_WHALETOWN.map((s) => ({ m: toMin(s), end: 0 })),
      ].filter((x) => x.m + CROSSING_MIN <= now).sort((a, b) => b.m - a.m);
      u = all.length ? all[0].end : 1;
    } else {
      // ease in/out of the terminals
      u = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    curve.getPointAt(Math.min(0.999, Math.max(0.001, u)), pos);
    curve.getPointAt(Math.min(1, Math.max(0, u) + 0.002), ahead);
    mesh.position.copy(pos);
    mesh.position.y += Math.sin(date.valueOf() / 900) * 0.35; // gentle swell
    if (t != null) mesh.lookAt(ahead.x, mesh.position.y, ahead.z);
  }
  return { update };
}

// --- birds -------------------------------------------------------------------
function createBirds({ scene, frame, places }) {
  const FLOCKS = 4, PER = 12;
  const roosts = ['Sutil Point', 'Mansons Landing', 'Squirrel Cove', 'Mitlenatch Island']
    .map((name) => places.find((p) => p.name === name)).filter(Boolean)
    .map((p) => { const v = frame.toLocal(p.lat, p.lon, 0); v.y = 60; return v; });

  const geo = new THREE.BufferGeometry();
  // a simple chevron: two triangles meeting at the body
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 1.2, -3.4, 0.5, -1.2, -0.4, 0, -0.6,
    0, 0, 1.2, 0.4, 0, -0.6, 3.4, 0.5, -1.2,
  ]), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1c2126, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, FLOCKS * PER);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();
  const params = [];
  for (let f = 0; f < FLOCKS; f++) {
    for (let i = 0; i < PER; i++) {
      params.push({
        roost: roosts[f % roosts.length] ?? new THREE.Vector3(),
        r: 90 + Math.random() * 260,
        h: 40 + Math.random() * 110,
        speed: (0.10 + Math.random() * 0.08) * (Math.random() > 0.5 ? 1 : -1),
        phase: Math.random() * Math.PI * 2,
        flap: 5 + Math.random() * 4,
      });
    }
  }

  function update(t) {
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      const a = p.phase + t * p.speed;
      dummy.position.set(
        p.roost.x + Math.cos(a) * p.r,
        p.roost.y + p.h + Math.sin(t * 0.5 + p.phase) * 8,
        p.roost.z + Math.sin(a) * p.r,
      );
      dummy.rotation.set(0, -a - Math.PI / 2 * Math.sign(p.speed), 0);
      const flap = 1 + Math.abs(Math.sin(t * p.flap + p.phase)) * 0.9;
      dummy.scale.set(1.6, 1.6 * flap, 1.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { update };
}

// --- whale -------------------------------------------------------------------
function createWhale({ scene, frame }) {
  // surfacing line in Sutil Channel, west of the island
  const a = frame.toLocal(50.045, -125.06, 0);
  const b = frame.toLocal(50.13, -125.09, 0);

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: 0.35 }),
  );
  body.scale.set(13, 3.2, 3.4);
  body.visible = false;
  scene.add(body);

  const spout = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xdfe9ef, transparent: true, opacity: 0, depthWrite: false,
  }));
  spout.scale.set(6, 14, 1);
  scene.add(spout);

  const CYCLE = 95; // seconds between surfacings
  const pos = new THREE.Vector3();

  function update(t) {
    const cyc = t % CYCLE;
    const which = Math.floor(t / CYCLE) * 0.37;
    pos.lerpVectors(a, b, (Math.sin(which) + 1) / 2);
    if (cyc < 9) {
      // arc up, blow, roll under
      const k = cyc / 9;
      const arc = Math.sin(k * Math.PI);
      body.visible = true;
      body.position.set(pos.x + cyc * 6, SEA_LEVEL - 2.4 + arc * 3.4, pos.z);
      body.rotation.z = (k - 0.5) * -0.5;
      spout.position.set(body.position.x + 8, body.position.y + 9, body.position.z);
      spout.material.opacity = k < 0.35 ? arc * 0.75 : Math.max(0, 0.75 - (k - 0.35) * 2.4);
    } else {
      body.visible = false;
      spout.material.opacity = 0;
    }
  }
  return { update };
}

export function createLife({ scene, frame, config }) {
  const ferry = createFerry({ scene, frame, ferryRoute: config.ferryRoute });
  const birds = createBirds({ scene, frame, places: config.places });
  const whale = createWhale({ scene, frame });
  return {
    update(t, date) {
      ferry.update(date);
      birds.update(t);
      whale.update(t);
    },
  };
}
