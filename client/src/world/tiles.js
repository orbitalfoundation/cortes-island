// Google Photorealistic 3D Tiles via Cesium ion (asset 2275207), rendered in
// the local island frame. Pattern follows terratwin's proven plugin stack.

import { TilesRenderer } from '3d-tiles-renderer';
import {
  CesiumIonAuthPlugin, TileCompressionPlugin, UpdateOnChangePlugin,
  UnloadTilesPlugin, TilesFadePlugin, GLTFExtensionsPlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export function createTiles({ scene, camera, renderer, frame, cesiumKey, onReady }) {
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new CesiumIonAuthPlugin({ apiToken: cesiumKey, assetId: '2275207', autoRefreshToken: true }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new UnloadTilesPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({
    dracoLoader: new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'),
  }));

  tiles.setResolutionFromRenderer(camera, renderer);
  tiles.setCamera(camera);
  tiles.errorTarget = 8;

  // Place the ECEF tile geometry into the local island frame
  tiles.group.matrixAutoUpdate = false;
  tiles.group.matrix.copy(frame.inverse);
  tiles.group.matrixWorldNeedsUpdate = true;
  scene.add(tiles.group);

  let ready = false;
  const markReady = () => { if (!ready) { ready = true; onReady?.(); } };
  tiles.addEventListener('load-tileset', markReady);
  tiles.addEventListener('load-tile-set', markReady); // older event name

  return {
    tiles,
    update() {
      tiles.setResolutionFromRenderer(camera, renderer);
      tiles.setCamera(camera);
      camera.updateMatrixWorld();
      tiles.update();
    },
    dispose() { tiles.dispose(); },
  };
}
