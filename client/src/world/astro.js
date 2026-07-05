// Sun & moon positions for a given time and place — compact port of the
// SunCalc formulas (Agafonkin, BSD). Good to a fraction of a degree, which is
// plenty for lighting a scene.

const rad = Math.PI / 180;
const dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
const e = rad * 23.4397; // obliquity

const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
const toDays = (date) => toJulian(date) - J2000;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }
function eclipticLongitude(M) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + Math.PI;
}

// azimuth: 0 = south, positive westward (SunCalc convention)
export function sunPosition(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date);
  const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  const dec = declination(L, 0), ra = rightAscension(L, 0);
  const H = siderealTime(d, lw) - ra;
  return { azimuth: azimuth(H, phi, dec), altitude: altitude(H, phi, dec) };
}

function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.229350 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export function moonPosition(date, lat, lon) {
  const lw = rad * -lon, phi = rad * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  h += rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10)); // refraction
  return { azimuth: azimuth(H, phi, c.dec), altitude: h };
}

export function moonIllumination(date) {
  const d = toDays(date);
  const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
  const s = { ra: rightAscension(L, 0), dec: declination(L, 0) };
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * Math.sign(angle) / Math.PI, angle };
}

// Convert SunCalc az/alt to a unit direction in the local ENU scene frame
// (+X east, +Y up, -Z north). SunCalc azimuth 0 = south, + westward.
export function toDirection({ azimuth: az, altitude: alt }, target) {
  const cosAlt = Math.cos(alt);
  target.set(
    -Math.sin(az) * cosAlt,   // east component (az 0=south, +west → east = -sin)
    Math.sin(alt),
    Math.cos(az) * cosAlt,    // scene +Z = south
  );
  return target;
}
