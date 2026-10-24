import * as THREE from 'three';
import { LIGHT_RIG, LIGHT_RIG_GLSL } from './lightRig';

/**
 * Soft-vinyl toon shading — the core of the look.
 *
 * Colour stays saturated and almost flat; form is described by a very soft
 * wrapped terminator whose shadow side is multiplied by a tinted colour (so
 * shadows read violet / teal / rose instead of grey), plus baked ambient
 * occlusion, a faint sky/ground bounce and a whisper of rim light. No glossy
 * highlights: the surface should feel like matte painted vinyl.
 *
 * Lighting is defined in view space so the character always presents its
 * best side to the camera, like a hand-lit animation frame.
 */
export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  colorLow?: THREE.ColorRepresentation;
  /** model-space y range for the vertical gradient */
  gradient?: [number, number];
  /** horizontal (x) gradient instead of vertical */
  gradientAxis?: 'y' | 'x';
  shadow?: THREE.ColorRepresentation;
  /** uses aMask / aAO attributes */
  masks?: boolean;
  /** brow: bends in the vertex shader (inner / outer / arch) */
  brow?: boolean;
  /** strength of the shading (0 = flat) */
  shade?: number;
  side?: THREE.Side;
}

export type ToonMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uColor: { value: THREE.Color };
    uColorLow: { value: THREE.Color };
    uTip: { value: THREE.Color };
    uBlush: { value: THREE.Color };
    uBlushAmount: { value: number };
    uShadowMul: { value: THREE.Color };
    uGradient: { value: THREE.Vector2 };
    uShade: { value: number };
    uOpacity: { value: number };
    uSpecScale: { value: number };
    uJaw: { value: number };
    uCheek: { value: number };
    uBrowInner: { value: number };
    uBrowOuter: { value: number };
    uBrowArch: { value: number };
    uBrowSide: { value: number };
    uBrowHalf: { value: number };
    uWobble: { value: THREE.Vector3 };
    uWobbleRange: { value: THREE.Vector2 };
    uHair: { value: THREE.Color };
    uShirt: { value: THREE.Color };
    uPants: { value: THREE.Color };
    uShoes: { value: THREE.Color };
    uClothShadow: { value: THREE.Color };
  };
};


const vertex = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uJaw;
uniform float uCheek;
uniform float uBrowInner;
uniform float uBrowOuter;
uniform float uBrowArch;
uniform float uBrowSide;
uniform float uBrowHalf;
uniform vec3 uWobble;
uniform vec2 uWobbleRange;
#ifdef USE_MASKS
attribute vec4 aMask;
attribute float aAO;
attribute vec4 aRegion;
varying vec4 vMask;
varying float vAO;
varying vec4 vRegion;
#endif
varying vec3 vNormalV;
varying vec3 vRest;
varying vec3 vViewDir;
varying vec3 vViewPos;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #ifdef BROW
  // Brows bend instead of rotating rigidly: each end moves on its own, plus an arch.
  float bs = clamp(position.x / uBrowHalf, -1.0, 1.0) * uBrowSide;
  float bt = smoothstep(-1.0, 1.0, bs);
  transformed.y += mix(uBrowInner, uBrowOuter, bt) + uBrowArch * (1.0 - bs * bs);
  #endif
  #ifdef USE_MASKS
  // Facial deformation: cheeks lift along the normal, the jaw drops the chin.
  float cheekMask = smoothstep(-0.9, 0.45, aMask.z);
  transformed += objectNormal * uCheek * cheekMask * 0.02;
  transformed.y -= uJaw * aMask.x * 0.032;
  // Soft-body lag: the head and crown trail motion like a firm jelly.
  float wob = smoothstep(uWobbleRange.x, uWobbleRange.y, position.y);
  transformed += uWobble * wob * wob;
  #endif
  #include <skinning_vertex>
  #include <project_vertex>
  vNormalV = normalize(transformedNormal);
  vRest = position;
  vViewDir = normalize(-mvPosition.xyz);
  vViewPos = mvPosition.xyz;
  #ifdef USE_MASKS
  vMask = aMask;
  vAO = aAO;
  vRegion = aRegion;
  #endif
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColorLow;
uniform vec3 uTip;
uniform vec3 uBlush;
uniform float uBlushAmount;
uniform vec3 uShadowMul;
uniform vec2 uGradient;
uniform float uShade;
uniform float uOpacity;
uniform float uSpecScale;
varying vec3 vNormalV;
varying vec3 vRest;
varying vec3 vViewDir;
varying vec3 vViewPos;
uniform vec3 uHair;
uniform vec3 uShirt;
uniform vec3 uPants;
uniform vec3 uShoes;
uniform vec3 uClothShadow;
#ifdef USE_MASKS
varying vec4 vMask;
varying float vAO;
varying vec4 vRegion;
#endif
${LIGHT_RIG_GLSL}
void main() {
  vec3 N = normalize(vNormalV);
  if (!gl_FrontFacing) N = -N;
  #ifdef GRADIENT_X
  float g = smoothstep(uGradient.x, uGradient.y, vRest.x);
  #else
  float g = smoothstep(uGradient.x, uGradient.y, vRest.y);
  #endif
  vec3 albedo = mix(uColorLow, uColor, g);
  float ao = 1.0;
  #ifdef USE_MASKS
  albedo = mix(uColorLow, uColor, vMask.w);
  albedo = mix(albedo, uTip, smoothstep(0.0, 1.0, vMask.y));
  float blushEdge = fwidth(vMask.z) * 1.2 + 0.004;
  albedo = mix(albedo, uBlush, smoothstep(-blushEdge, blushEdge, vMask.z) * uBlushAmount);
  ao = mix(0.5, 1.0, vAO);
  // Clothed characters: crisp colour regions for hair and clothes.
  vec4 rg = smoothstep(0.38, 0.62, vRegion);
  albedo = mix(albedo, uHair, rg.x);
  albedo = mix(albedo, uShirt, rg.y);
  albedo = mix(albedo, uPants, rg.z);
  albedo = mix(albedo, uShoes, rg.w);
  float cloth = max(max(rg.x, rg.y), max(rg.z, rg.w));
  vec3 shadowMul = mix(uShadowMul, uClothShadow, cloth);
  #else
  vec3 shadowMul = uShadowMul;
  #endif
  vec3 col = rigLight(albedo, N, normalize(vViewDir), vViewPos, shadowMul, ao, uShade, uSpecScale);
  gl_FragColor = vec4(col, uOpacity);
  #include <colorspace_fragment>
}
`;

/** Per-channel ratio shadow/base (linear), so shadows are a tinted version of the surface. */
export function shadowMultiplier(shadow: THREE.ColorRepresentation, base: THREE.ColorRepresentation, out = new THREE.Color()) {
  const s = new THREE.Color(shadow), b = new THREE.Color(base);
  const f = (a: number, c: number) => Math.min(1.05, Math.max(0.3, a / Math.max(c, 0.02)));
  return out.setRGB(f(s.r, b.r), f(s.g, b.g), f(s.b, b.b));
}

export function createToonMaterial(o: ToonOptions = {}): ToonMaterial {
  const color = new THREE.Color(o.color ?? '#ffffff');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uColorLow: { value: new THREE.Color(o.colorLow ?? color) },
      uTip: { value: new THREE.Color('#ffffff') },
      uBlush: { value: new THREE.Color('#ff7a9a') },
      uBlushAmount: { value: 1 },
      uShadowMul: { value: shadowMultiplier(o.shadow ?? color.clone().multiplyScalar(0.7), color) },
      uGradient: { value: new THREE.Vector2(...(o.gradient ?? [0, 1])) },
      uShade: { value: o.shade ?? 1 },
      uOpacity: { value: 1 },
      uSpecScale: { value: o.brow ? 0.15 : 1 },
      uJaw: { value: 0 },
      uCheek: { value: 0 },
      uBrowInner: { value: 0 },
      uBrowOuter: { value: 0 },
      uBrowArch: { value: 0 },
      uBrowSide: { value: 1 },
      uBrowHalf: { value: 0.11 },
      uWobble: { value: new THREE.Vector3() },
      uWobbleRange: { value: new THREE.Vector2(1.5, 3.1) },
      uHair: { value: new THREE.Color('#000000') },
      uShirt: { value: new THREE.Color('#ffffff') },
      uPants: { value: new THREE.Color('#000000') },
      uShoes: { value: new THREE.Color('#000000') },
      uClothShadow: { value: new THREE.Color(0.62, 0.64, 0.74) },
      ...LIGHT_RIG,
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: o.side ?? THREE.FrontSide,
    defines: {
      ...(o.masks ? { USE_MASKS: '' } : {}),
      ...(o.brow ? { BROW: '' } : {}),
      ...(o.gradientAxis === 'x' ? { GRADIENT_X: '' } : {}),
    },
  }) as ToonMaterial;
  mat.extensions = { clipCullDistance: false, multiDraw: false };
  return mat;
}
