// Soft drifting clouds — billboard sprites with a canvas-painted puff
// texture, riding a slow northwesterly.

import * as THREE from 'three';

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 22; i++) {
    const x = 40 + Math.random() * 176, y = 90 + Math.random() * 80;
    const r = 24 + Math.random() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(c);
}

export function createClouds({ scene, count = 46 }) {
  const tex = puffTexture();
  const group = new THREE.Group();
  const base = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      opacity: 0, fog: false,
    }));
    const w = 2600 + Math.random() * 5200;
    s.scale.set(w, w * (0.28 + Math.random() * 0.2), 1);
    s.position.set(
      (Math.random() - 0.5) * 46000,
      1700 + Math.random() * 1500,
      (Math.random() - 0.5) * 46000,
    );
    base.push({ op: 0.45 + Math.random() * 0.4, jitter: 0.6 + Math.random() * 0.8 });
    group.add(s);
  }
  scene.add(group);

  return {
    // cloud cover decides how many puffs show and how heavy they look;
    // wind decides where they go
    update(dt, skyState, wx) {
      const cover = wx?.cloud ?? 0.4;
      const storm = wx?.storm ?? 0;
      const visibleN = Math.round(6 + cover * (group.children.length - 6));
      const day = skyState ? skyState.day : 1;
      const tint = (0.15 + 0.85 * day) * (1 - storm * 0.55);
      const wv = wx?.windVec;
      for (let i = 0; i < group.children.length; i++) {
        const s = group.children[i];
        const b = base[i];
        const speed = wv ? 1 : 0;
        s.position.x += (wv ? wv.x * 3 * b.jitter : 8 * b.jitter) * dt;
        s.position.z += (wv ? wv.z * 3 * b.jitter : 5 * b.jitter) * dt;
        if (s.position.x > 26000) s.position.x = -26000;
        if (s.position.x < -26000) s.position.x = 26000;
        if (s.position.z > 26000) s.position.z = -26000;
        if (s.position.z < -26000) s.position.z = 26000;
        const target = i < visibleN ? b.op * (0.55 + 0.45 * cover) : 0;
        s.material.opacity += (target - s.material.opacity) * Math.min(1, dt * 0.5);
        s.material.color.setScalar(tint);
      }
    },
  };
}
