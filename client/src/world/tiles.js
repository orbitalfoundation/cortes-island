// Google Photorealistic 3D Tiles via Cesium ion (asset 2275207), rendered in
// the local island frame. Pattern follows terratwin's proven plugin stack.
// Adds: vertical exaggeration (Y-scale on the tile group) and an island
// carve-out (fragments outside the Cortes mask are discarded).

import { Matrix4 } from 'three';
import { TilesRenderer } from '3d-tiles-renderer';
import {
  CesiumIonAuthPlugin, TileCompressionPlugin, UpdateOnChangePlugin,
  UnloadTilesPlugin, GLTFExtensionsPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { buildMask, MASK_EXTENT } from './mask.js';

export function createTiles({ scene, camera, renderer, frame, cesiumKey, exaggeration = 1, carve = true, perimeter = [], onReady }) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: cesiumKey, assetId: '2275207', autoRefreshToken: true }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  // (no TilesFadePlugin: it wraps tile materials with its own onBeforeCompile,
  // which would clobber the carve shader patch below)
  tiles.registerPlugin(new GLTFExtensionsPlugin({
    dracoLoader: new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'),
  }));

  tiles.setResolutionFromRenderer(camera, renderer);
  tiles.setCamera(camera);
  tiles.errorTarget = 8;

  // ECEF -> local island frame, stretched vertically for drama
  tiles.group.matrixAutoUpdate = false;
  tiles.group.matrix.copy(new Matrix4().makeScale(1, exaggeration, 1).multiply(frame.inverse));
  tiles.group.matrixWorldNeedsUpdate = true;
  scene.add(tiles.group);

  // --- carve-out: shared uniforms patched into every tile material ---
  const maskUniform = { value: buildMask(frame, perimeter) };
  const carveUniform = { value: carve ? 1 : 0 };

  function patchMaterial(mat) {
    if (mat.userData.cortesPatched) return;
    mat.userData.cortesPatched = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev?.(shader, r);
      shader.uniforms.uMask = maskUniform;
      shader.uniforms.uCarve = carveUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMaskWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMaskWorld = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nuniform float uCarve;\nvarying vec3 vMaskWorld;')
        .replace('void main() {', `void main() {
          if (uCarve > 0.5) {
            float m = texture2D(uMask, vMaskWorld.xz / ${MASK_EXTENT.toFixed(1)} + 0.5).r;
            // stochastic threshold feathers the cut into a dissolve band
            float n = fract(sin(dot(vMaskWorld.xz * 0.37, vec2(12.9898, 78.233))) * 43758.5453);
            if (m < 0.32 + n * 0.3) discard;
          }`);
    };
    mat.needsUpdate = true;
  }

  function patchModel(sceneObj) {
    sceneObj.traverse((o) => {
      if (o.isMesh && o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(patchMaterial);
      }
    });
  }
  tiles.addEventListener('load-model', (e) => patchModel(e.scene));
  tiles.forEachLoadedModel?.((s) => patchModel(s));

  let ready = false;
  const markReady = () => { if (!ready) { ready = true; onReady?.(); } };
  tiles.addEventListener('load-tileset', markReady);

  return {
    tiles,
    setCarve(on) { carveUniform.value = on ? 1 : 0; },
    get carved() { return carveUniform.value > 0.5; },
    update() {
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.setCamera(camera);
      camera.updateMatrixWorld();
      tiles.update();
    },
    dispose() { tiles.dispose(); },
  };
}
