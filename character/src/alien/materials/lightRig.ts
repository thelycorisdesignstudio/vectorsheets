import * as THREE from 'three';

/**
 * Shared stylised light rig, defined in view space so the character is
 * always lit like a composed shot: a soft key from upper-left-front, a cool
 * fill from the right, a warm rim from behind-right and a controlled satin
 * highlight. Every character material references these same uniform objects,
 * so one change re-lights the whole character.
 */
export const LIGHT_RIG = {
  uKeyDir: { value: new THREE.Vector3(-0.42, 0.62, 0.66).normalize() },
  /** view-space position of the soft box (updated per frame by the rig) */
  uKeyPos: { value: new THREE.Vector3(-3, 3.5, -3.5) },
  uFillDir: { value: new THREE.Vector3(0.75, -0.05, 0.45).normalize() },
  uRimDir: { value: new THREE.Vector3(0.55, 0.55, -0.62).normalize() },
  uFillTint: { value: new THREE.Color('#9fb6ff') },
  uRimTint: { value: new THREE.Color('#fff1dc') },
  /** satin highlight strength (0 = fully matte) */
  uSpec: { value: 0.3 },
  /** global AO strength */
  uAOStrength: { value: 1 },
  /** hand-drawn look (0 = soft 3D, 1 = illustrated): painted shadow shapes, pencil edges, paper grain */
  uIllustrate: { value: 1 },
  /** cel shading for the human cast: crisp light/shadow shapes with a warm band where skin turns into shadow */
  uCel: { value: 0 },
};

export type LightRigUniforms = typeof LIGHT_RIG;

export const LIGHT_RIG_GLSL = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyPos;
uniform vec3 uFillDir;
uniform vec3 uRimDir;
uniform vec3 uFillTint;
uniform vec3 uRimTint;
uniform float uSpec;
uniform float uAOStrength;
uniform float uIllustrate;
uniform float uCel;

float rigHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Stylised lighting: returns the lit colour for an albedo.
// warm: 1 on skin (gets the warm terminator band in cel mode), 0 on cloth and hair.
vec3 rigLightW(vec3 albedo, vec3 N, vec3 V, vec3 viewPos, vec3 shadowMul, float ao, float shade, float specScale, float warm) {
  // Soft box: a large close light, so even flat planes get a gentle falloff.
  vec3 toKey = uKeyPos - viewPos;
  float dKey = length(toKey);
  vec3 Lk = toKey / dKey;
  float falloff = mix(0.6, 1.0, smoothstep(5.2, 2.2, dKey));
  float key = smoothstep(-0.55, 0.95, dot(N, Lk)) * falloff;
  // Illustrated: the light/shadow split becomes a painted shape with a soft, brushed edge.
  key = mix(key, smoothstep(0.32, 0.6, key) * mix(0.82, 1.0, key), 0.6 * uIllustrate);
  // Cel: one clean shadow shape that follows the form (only surfaces turned from the light).
  float nl = dot(N, uKeyDir);
  key = mix(key, smoothstep(-0.32, -0.24, nl) * mix(0.9, 1.0, smoothstep(0.0, 0.6, nl)), uCel);
  float fill = max(dot(N, uFillDir), 0.0);
  float sky = 0.5 + 0.5 * N.y;
  float light = mix(0.2, 1.0, key) * mix(0.86, 1.0, sky);
  light += fill * 0.14 * (1.0 - key);
  light = mix(1.0, clamp(light, 0.0, 1.0), shade);
  float occl = mix(1.0, ao, shade * uAOStrength);
  vec3 col = albedo * mix(shadowMul, vec3(1.0), light * occl);
  col += albedo * uFillTint * fill * 0.06 * shade * (1.0 - key);
  float facing = clamp(dot(N, V), 0.0, 1.0);
  // Edges turning away deepen slightly; the rim side catches a warm edge light.
  col *= mix(vec3(1.0), shadowMul, pow(1.0 - facing, 2.5) * 0.4 * shade);
  float rim = pow(1.0 - facing, 3.0) * smoothstep(-0.1, 0.7, dot(N, uRimDir));
  col += uRimTint * rim * 0.28 * shade;
  // Bevels and rounded edges facing the soft box catch a soft glow.
  float edge = pow(1.0 - facing, 1.6) * smoothstep(0.15, 0.85, dot(N, Lk)) * falloff;
  col += mix(albedo, vec3(1.0), 0.35) * edge * 0.14 * shade;
  // Broad satin highlight: soft, low, never glossy.
  vec3 H = normalize(Lk + V);
  float spec = pow(max(dot(N, H), 0.0), 10.0) * uSpec * occl * specScale * 0.7 * smoothstep(0.25, 0.65, facing) * (1.0 - 0.55 * uIllustrate) * (1.0 - 0.6 * uCel);
  col += vec3(spec) * 0.16 * shade;
  // Illustrated: a soft coloured pencil line where forms turn away, and paper grain.
  // Where skin turns from light into shadow it glows warm, like light through skin.
  float term = smoothstep(-0.44, -0.3, nl) * (1.0 - smoothstep(-0.26, -0.12, nl));
  col = mix(col, col * vec3(1.2, 0.74, 0.64) + vec3(0.04, 0.0, 0.0), term * warm * uCel * 0.6 * shade);
  // Planes facing down (under the jaw, under the arms) take a saturated warm shade.
  float under = smoothstep(-0.4, -0.65, N.y);
  col = mix(col, albedo * vec3(1.02, 0.56, 0.46), under * warm * uCel * 0.62 * shade);
  float line = smoothstep(0.24, 0.07, facing) * shade * (1.0 - 0.6 * uCel);
  col = mix(col, albedo * shadowMul * 0.62, line * 0.7 * uIllustrate);
  float grain = rigHash(floor(gl_FragCoord.xy / 1.6)) - 0.5;
  col *= 1.0 + grain * 0.055 * uIllustrate;
  // Gentle shoulder so highlights never clip harshly.
  col -= max(col - 0.92, 0.0) * 0.55;
  return col;
}

vec3 rigLight(vec3 albedo, vec3 N, vec3 V, vec3 viewPos, vec3 shadowMul, float ao, float shade, float specScale) {
  return rigLightW(albedo, N, V, viewPos, shadowMul, ao, shade, specScale, 0.0);
}
`;
