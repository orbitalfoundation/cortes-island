// The sea around Cortes — a large animated shader plane sitting just above
// the tiles' baked ocean. Sum-of-sines normal perturbation, sky/fresnel
// tinting and a sun glitter path. Self-contained (no textures).

import * as THREE from 'three';

// Google tiles are ellipsoid-referenced; local sea surface sits near the geoid
// (~ -18 m around northern Georgia Strait). +2 m so our water covers theirs.
export const SEA_LEVEL = -16;

export function createOcean({ scene }) {
  const geo = new THREE.PlaneGeometry(90000, 90000, 1, 1);
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDay: { value: 1 },
    uDeep: { value: new THREE.Color(0x061826) },
    uShallow: { value: new THREE.Color(0x0d3040) },
    uSkyDay: { value: new THREE.Color(0x44607a) },
    uSkyNight: { value: new THREE.Color(0x05070d) },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDay;
      uniform vec3 uSunDir, uDeep, uShallow, uSkyDay, uSkyNight;
      varying vec3 vWorld;

      // layered gerstner-ish normals
      vec3 waveNormal(vec2 p, float t) {
        float n = 0.0; vec2 g = vec2(0.0);
        mat2 rot = mat2(0.54, -0.84, 0.84, 0.54);
        vec2 q = p * 0.06; float amp = 0.55; float speed = 0.8;
        for (int i = 0; i < 5; i++) {
          float ph = q.x + t * speed;
          n += sin(ph) * amp;
          g += vec2(cos(ph) * amp * 0.6, 0.0);
          q = rot * q * 1.7; amp *= 0.55; speed *= 1.25;
          g = rot * g;
        }
        return normalize(vec3(-g.x, 1.0, -g.y));
      }

      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        vec3 N = waveNormal(vWorld.xz, uTime);
        // soften normals with distance so the far sea is calm glass
        N = normalize(mix(vec3(0.0, 1.0, 0.0), N, clamp(220.0 / (1.0 + dist * 0.004), 0.05, 1.0)));

        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 skyCol = mix(uSkyNight, uSkyDay, uDay);
        vec3 water = mix(uDeep, uShallow, uDay * 0.7) * (0.25 + 0.75 * uDay);
        vec3 col = mix(water, skyCol, fresnel * 0.75);

        // sun / moon glitter
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + V);
        float spec = pow(max(dot(N, H), 0.0), 240.0) * smoothstep(0.0, 0.08, L.y);
        col += vec3(1.0, 0.85, 0.6) * spec * (2.2 * uDay + 0.35);

        // fade the plane edge so it never shows a hard rim
        float edge = smoothstep(45000.0, 38000.0, max(abs(vWorld.x), abs(vWorld.z)));
        gl_FragColor = vec4(col, 0.8 * edge);
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = SEA_LEVEL + 2;
  mesh.renderOrder = 1;
  scene.add(mesh);

  return {
    update(t, skyState) {
      uniforms.uTime.value = t;
      if (skyState) {
        uniforms.uDay.value = skyState.day;
        // at night the glitter path follows the moon
        uniforms.uSunDir.value.copy(skyState.day > 0.12 ? skyState.sunDir : skyState.moonDir);
      }
    },
  };
}
