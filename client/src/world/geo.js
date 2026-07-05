// WGS84 <-> local scene frame. The scene is an ENU frame centered on Cortes
// Island: +X east, +Y up, -Z north, units in meters. The 3D tiles group
// (ECEF geometry) is transformed by the inverse of this frame.

import { Matrix4, Vector3 } from 'three';

const A = 6378137.0;             // WGS84 semi-major
const E2 = 6.69437999014e-3;     // first eccentricity squared
const D2R = Math.PI / 180;

export function ecef(latDeg, lonDeg, h = 0) {
  const lat = latDeg * D2R, lon = lonDeg * D2R;
  const sLat = Math.sin(lat), cLat = Math.cos(lat);
  const N = A / Math.sqrt(1 - E2 * sLat * sLat);
  return new Vector3(
    (N + h) * cLat * Math.cos(lon),
    (N + h) * cLat * Math.sin(lon),
    (N * (1 - E2) + h) * sLat,
  );
}

export function makeFrame(lat0, lon0) {
  const origin = ecef(lat0, lon0, 0);
  const lat = lat0 * D2R, lon = lon0 * D2R;
  const up = new Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
  const east = new Vector3(-Math.sin(lon), Math.cos(lon), 0);
  const north = new Vector3().crossVectors(up, east);
  // world matrix: local -> ECEF, with scene axes X=east, Y=up, Z=-north
  const world = new Matrix4().makeBasis(east, up, north.clone().negate()).setPosition(origin);
  const inverse = world.clone().invert();
  return {
    world, inverse,
    // lat/lon/height -> local scene coordinates
    toLocal(latDeg, lonDeg, h = 0, target = new Vector3()) {
      return target.copy(ecef(latDeg, lonDeg, h)).applyMatrix4(inverse);
    },
  };
}
