// Renderer, camera, controls, and the frame loop that ties the world together.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1420);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 8, 2_000_000);
  // arrive from the southwest, high enough to read the whole island
  camera.position.set(-9000, 9500, 14000);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 260;
  controls.maxDistance = 70000;
  controls.maxPolarAngle = Math.PI * 0.478; // never dip under the sea
  controls.enablePan = true;
  controls.panSpeed = 0.7;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // gentle camera fly-to used when a card is focused
  let flight = null;
  function flyTo(target) {
    const toTarget = controls.target.clone();
    const offset = camera.position.clone().sub(controls.target);
    const dist = Math.max(1600, target.y * 2.2);
    const dir = offset.normalize().multiplyScalar(dist);
    flight = {
      t: 0,
      fromT: toTarget, toT: target.clone(),
      fromP: camera.position.clone(), toP: target.clone().add(dir),
    };
  }

  function updateFlight(dt) {
    if (!flight) return;
    flight.t = Math.min(1, flight.t + dt * 0.9);
    const k = flight.t < 0.5 ? 2 * flight.t * flight.t : 1 - Math.pow(-2 * flight.t + 2, 2) / 2;
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    camera.position.lerpVectors(flight.fromP, flight.toP, k);
    if (flight.t >= 1) flight = null;
  }

  return { renderer, scene, camera, controls, flyTo, updateFlight };
}
