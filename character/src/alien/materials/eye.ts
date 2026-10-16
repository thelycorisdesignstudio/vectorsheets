import * as THREE from 'three';
import { TOON_LIGHT } from './toon';

/**
 * A complete eye in one shader, drawn on a shallow dome: white sclera, a
 * large soft-edged pupil that slides with the gaze, and upper / lower lids
 * painted in skin colour with curved, tiltable edges. Because the lids are
 * part of the same surface, blinks, squints and "^ ^" smiles stay perfectly
 * clean at any size.
 */
export type EyeMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uSclera: { value: THREE.Color };
    uPupil: { value: THREE.Color };
    uSkin: { value: THREE.Color };
    uShadowMul: { value: THREE.Color };
    uPupilPos: { value: THREE.Vector2 };
    uPupilSize: { value: number };
    /** x: upper lid height (-1..1), y: lower lid height, z: upper curve, w: lower curve */
    uLids: { value: THREE.Vector4 };
    uLidTilt: { value: number };
    uSide: { value: number };
    uAspect: { value: number };
    uLight: { value: THREE.Vector3 };
  };
};

export function createEyeMaterial(side: 1 | -1, aspect: number): EyeMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSclera: { value: new THREE.Color('#ffffff') },
      uPupil: { value: new THREE.Color('#3b3a4a') },
      uSkin: { value: new THREE.Color('#8a63ff') },
      uShadowMul: { value: new THREE.Color(0.8, 0.8, 0.9) },
      uPupilPos: { value: new THREE.Vector2() },
      uPupilSize: { value: 0.58 },
      uLids: { value: new THREE.Vector4(1.2, -1.2, 0.2, 0.15) },
      uLidTilt: { value: 0 },
      uSide: { value: side },
      uAspect: { value: aspect },
      uLight: { value: TOON_LIGHT },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv2;
      varying vec3 vN;
      void main() {
        vUv2 = position.xy;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSclera;
      uniform vec3 uPupil;
      uniform vec3 uSkin;
      uniform vec3 uShadowMul;
      uniform vec2 uPupilPos;
      uniform float uPupilSize;
      uniform vec4 uLids;
      uniform float uLidTilt;
      uniform float uSide;
      uniform float uAspect;
      uniform vec3 uLight;
      varying vec2 vUv2;
      varying vec3 vN;
      void main() {
        // Unit-disc coordinates of the eye (geometry is a unit dome scaled by the mesh).
        vec2 p = vUv2;
        float aa = fwidth(p.y) * 1.25;
        // Lid lines: curved, with an outward tilt mirrored per eye.
        float tilt = uLidTilt * p.x * uSide;
        float upper = uLids.x - uLids.z * (p.x * p.x) + tilt;
        float lower = uLids.y + uLids.w * (1.0 - p.x * p.x) + tilt * 0.4;
        float lidU = smoothstep(upper - aa, upper + aa, p.y);
        float lidL = 1.0 - smoothstep(lower - aa, lower + aa, p.y);
        float lid = max(lidU, lidL);
        // Pupil (round in screen space: correct for the eye's aspect).
        vec2 d = (p - uPupilPos) * vec2(1.0, uAspect);
        float r = length(d);
        float pa = fwidth(r) * 1.25;
        float pupil = 1.0 - smoothstep(uPupilSize - pa, uPupilSize + pa, r);
        vec3 eye = mix(uSclera, uPupil, pupil);
        // Gentle shadow cast by the upper lid onto the eyeball.
        float lidShade = smoothstep(upper - 0.32, upper, p.y) * (1.0 - lidU);
        eye *= mix(1.0, 0.86, lidShade);
        // Thin darker crease where the lid meets the eye.
        float creaseU = smoothstep(upper + aa, upper + aa + 0.06, p.y);
        vec3 skin = mix(uSkin * uShadowMul, uSkin, max(creaseU, lidL));
        vec3 col = mix(eye, skin, lid);
        vec3 N = normalize(vN);
        float light = mix(0.82, 1.0, smoothstep(-0.55, 0.95, dot(N, uLight)));
        col *= mix(uShadowMul, vec3(1.0), light);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }) as EyeMaterial;
}
