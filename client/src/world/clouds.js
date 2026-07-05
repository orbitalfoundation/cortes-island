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

export function createClouds({ scene, count = 26 }) {
  const tex = puffTexture();
  const group = new THREE.Group();
  const drift = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      opacity: 0.5 + Math.random() * 0.4, fog: false,
    }));
    const w = 2600 + Math.random() * 5200;
    s.scale.set(w, w * (0.28 + Math.random() * 0.2), 1);
    s.position.set(
      (Math.random() - 0.5) * 46000,
      1700 + Math.random() * 1500,
      (Math.random() - 0.5) * 46000,
    );
    drift.push(8 + Math.random() * 7);
    group.add(s);
  }
  scene.add(group);

  return {
    update(dt, skyState) {
      const tint = skyState ? 0.15 + 0.85 * skyState.day : 1;
      for (let i = 0; i < group.children.length; i++) {
        const s = group.children[i];
        s.position.x += drift[i] * dt;
        s.position.z += drift[i] * 0.55 * dt;
        if (s.position.x > 26000) s.position.x = -26000;
        if (s.position.z > 26000) s.position.z = -26000;
        s.material.color.setScalar(tint);
      }
    },
  };
}
