import * as THREE from 'three';
import type { Palette } from '../types';

/**
 * Mouth decal. Its geometry is regenerated from expression parameters every
 * frame; this shader paints a closed mouth as a crisp coloured stroke and an
 * open mouth as a dark cavity with a strip of teeth along the top and a
 * tongue rising from the bottom.
 */
export function createMouthMaterial(p: Palette) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLip: { value: new THREE.Color(p.lip) },
      uMouth: { value: new THREE.Color(p.mouth) },
      uTongue: { value: new THREE.Color(p.tongue) },
      uTeeth: { value: new THREE.Color(p.teeth) },
      uOpen: { value: 0 },
      uTeethAmount: { value: 1 },
      uTongueUp: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uLip;
      uniform vec3 uMouth;
      uniform vec3 uTongue;
      uniform vec3 uTeeth;
      uniform float uOpen;
      uniform float uTeethAmount;
      uniform float uTongueUp;
      varying vec2 vUv;
      void main() {
        float s = abs(vUv.x);
        float t = vUv.y; // 0 upper edge -> 1 lower edge
        float openness = smoothstep(0.04, 0.2, uOpen);
        vec3 c = uMouth;
        // Tongue: a soft mound filling the lower half.
        float tongueTop = 0.55 - 0.3 * uTongueUp + 0.25 * s * s;
        float tongue = smoothstep(tongueTop - 0.04, tongueTop + 0.04, t) * smoothstep(0.98, 0.7, s);
        c = mix(c, uTongue, tongue);
        // Teeth: a white band under the upper edge, rounded at its ends.
        float band = 0.2 - 0.06 * s * s;
        float teeth = (1.0 - smoothstep(band - 0.03, band + 0.03, t)) * (1.0 - smoothstep(0.62, 0.7, s));
        c = mix(c, uTeeth, teeth * uTeethAmount * smoothstep(0.08, 0.25, uOpen));
        c = mix(uLip, c, openness);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }
    `,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
