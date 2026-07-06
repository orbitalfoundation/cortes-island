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

// Deliberately cartoonish and ~3x life size — a toy ferry you can actually
// spot from the default aerial view.
function buildFerry() {
  const ferry = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d5c8f, roughness: 0.55 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe0452a, roughness: 0.5 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(46, 7, 16), blue);
  hull.position.y = 3;
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 7, 16, 1, false, 0, Math.PI), blue);
  bow.rotation.z = Math.PI / 2; bow.rotation.y = Math.PI / 2;
  bow.position.set(23, 3, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 14), white);
  deck.position.y = 9.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 11), white);
  cabin.position.y = 15.5;
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 9), red);
  stack.position.set(-6, 22, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(46.6, 1.6, 16.4), red);
  stripe.position.y = 6.6;
  ferry.add(hull, bow, deck, cabin, stack, stripe);
  // running lights for night
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b8 });
  for (const x of [-16, -6, 4, 14]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.1), lightMat);
    lamp.position.set(x, 12.5, 7.4);
    const lamp2 = lamp.clone(); lamp2.position.z = -7.4;
    ferry.add(lamp, lamp2);
  }
  ferry.scale.setScalar(3);
  return ferry;
}

function createFerry({ scene, frame, ferryRoute, seaY }) {
  const pts = ferryRoute.map((p) => {
    const v = frame.toLocal(p.lat, p.lon, 0);
    v.y = seaY;
    return v;
  });
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.9);
  const mesh = buildFerry();
  scene.add(mesh);
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3();

  // wake: a fading trail of foam sprites dropped astern while underway
  const foamTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(235,245,250,0.65)');
    grad.addColorStop(1, 'rgba(235,245,250,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const WAKE_N = 42;
  const wake = [];
  for (let i = 0; i < WAKE_N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: foamTex, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    s.position.y = seaY + 0.5;
    scene.add(s);
    wake.push({ s, age: 99 });
  }
  let wakeI = 0, wakeClock = 0;

  function update(date, dt = 0.016) {
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

    state.sailing = t != null;
    state.progress = t;
    // wake bookkeeping
    wakeClock += dt;
    if (t != null && wakeClock > 0.45) {
      wakeClock = 0;
      const slot = wake[wakeI++ % WAKE_N];
      slot.age = 0;
      slot.s.position.set(pos.x, seaY + 0.5, pos.z);
    }
    for (const f of wake) {
      f.age += dt;
      const k = f.age / 14; // seconds to fade
      if (k >= 1) { f.s.material.opacity = 0; continue; }
      f.s.material.opacity = 0.5 * (1 - k);
      const sz = 14 + k * 120;
      f.s.scale.set(sz, sz * 0.55, 1);
    }
  }
  const state = { sailing: false, progress: null, pos: mesh.position };
  return { update, state };
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
function createWhale({ scene, frame, seaY }) {
  // surfacing line in Sutil Channel, west of the island
  const a = frame.toLocal(50.045, -125.06, 0);
  const b = frame.toLocal(50.13, -125.09, 0);

  // cartoon whale: big, glossy, with a proper tail fluke — visible from altitude
  const whaleMat = new THREE.MeshStandardMaterial({ color: 0x2b3a47, roughness: 0.3 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: 0xb9c8d2, roughness: 0.5 });
  const body = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), whaleMat);
  torso.scale.set(40, 11, 12);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), bellyMat);
  belly.scale.set(34, 8, 10.5);
  belly.position.y = -3;
  const fluke = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 14, 3, 3), whaleMat);
  fluke.rotation.x = Math.PI / 2;
  fluke.rotation.z = Math.PI;
  fluke.scale.set(1.6, 1, 0.5);
  fluke.position.set(-44, 6, 0);
  body.add(torso, belly, fluke);
  body.visible = false;
  scene.add(body);

  const spout = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xeaf3f8, transparent: true, opacity: 0, depthWrite: false,
  }));
  spout.scale.set(18, 42, 1);
  scene.add(spout);

  const CYCLE = 55; // seconds between surfacings
  const pos = new THREE.Vector3();

  function update(t) {
    const cyc = t % CYCLE;
    const which = Math.floor(t / CYCLE) * 0.37;
    pos.lerpVectors(a, b, (Math.sin(which) + 1) / 2);
    if (cyc < 12) {
      // arc up, blow, roll under
      const k = cyc / 12;
      const arc = Math.sin(k * Math.PI);
      body.visible = true;
      body.position.set(pos.x + cyc * 9, seaY - 13 + arc * 15, pos.z);
      body.rotation.z = (k - 0.5) * -0.55;
      spout.position.set(body.position.x + 26, body.position.y + 32, body.position.z);
      spout.material.opacity = k < 0.35 ? arc * 0.85 : Math.max(0, 0.85 - (k - 0.35) * 2.4);
      state.surfacing = true;
      state.pos.copy(body.position);
    } else {
      body.visible = false;
      spout.material.opacity = 0;
      state.surfacing = false;
      // where it will surface next, so the marker can point ahead of time
      state.pos.lerpVectors(a, b, (Math.sin((Math.floor(t / CYCLE) + 1) * 0.37) + 1) / 2);
      state.pos.y = SEA_LEVEL;
    }
  }
  const state = { surfacing: false, pos: new THREE.Vector3() };
  return { update, state };
}

export function createLife({ scene, frame, config, seaY = SEA_LEVEL + 2 }) {
  const ferry = createFerry({ scene, frame, ferryRoute: config.ferryRoute, seaY });
  const birds = createBirds({ scene, frame, places: config.places });
  const whale = createWhale({ scene, frame, seaY });
  return {
    ferry: ferry.state,
    whale: whale.state,
    update(t, date, dt) {
      ferry.update(date, dt);
      birds.update(t);
      whale.update(t);
    },
  };
}
