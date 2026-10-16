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
  uFillDir: { value: new THREE.Vector3(0.75, -0.05, 0.45).normalize() },
  uRimDir: { value: new THREE.Vector3(0.55, 0.55, -0.62).normalize() },
  uFillTint: { value: new THREE.Color('#9fb6ff') },
  uRimTint: { value: new THREE.Color('#fff1dc') },
  /** satin highlight strength (0 = fully matte) */
  uSpec: { value: 0.3 },
  /** global AO strength */
  uAOStrength: { value: 1 },
};

export type LightRigUniforms = typeof LIGHT_RIG;

export const LIGHT_RIG_GLSL = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uRimDir;
uniform vec3 uFillTint;
uniform vec3 uRimTint;
uniform float uSpec;
uniform float uAOStrength;

// Stylised lighting: returns the lit colour for an albedo.
vec3 rigLight(vec3 albedo, vec3 N, vec3 V, vec3 shadowMul, float ao, float shade, float specScale) {
  float key = smoothstep(-0.55, 0.95, dot(N, uKeyDir));
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
  // Broad satin highlight: soft, low, never glossy.
  vec3 H = normalize(uKeyDir + V);
  float spec = pow(max(dot(N, H), 0.0), 18.0) * uSpec * occl * specScale;
  col += vec3(spec) * 0.16 * shade;
  // Gentle shoulder so highlights never clip harshly.
  col -= max(col - 0.92, 0.0) * 0.55;
  return col;
}
`;
