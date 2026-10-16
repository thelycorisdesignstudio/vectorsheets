import * as THREE from 'three';

/**
 * Sweeps an elliptical cross-section along a curve with a radius profile.
 * When the radius falls to zero at the ends, the tube closes into soft
 * rounded tips — used for brows, antenna stalks and accessory details.
 * `arc` (0..1 along the curve) is stored in uv.x for skinning.
 */
export function sweptTube(
  curve: THREE.Curve<THREE.Vector3>,
  radius: (t: number) => number,
  opts: { segments?: number; radial?: number; flatten?: number; up?: THREE.Vector3 } = {},
) {
  const segments = opts.segments ?? 48;
  const radial = opts.radial ?? 16;
  const flatten = opts.flatten ?? 1;
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const up = opts.up;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, p);
    const T = frames.tangents[i];
    if (up) {
      // Stable frame relative to a fixed up vector (planar curves).
      B.crossVectors(T, up).normalize();
      N.crossVectors(B, T).normalize();
    } else {
      N.copy(frames.normals[i]);
      B.copy(frames.binormals[i]);
    }
    const r = Math.max(radius(t), 1e-4);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      positions.push(p.x + (N.x * c * flatten + B.x * s) * r, p.y + (N.y * c * flatten + B.y * s) * r, p.z + (N.z * c * flatten + B.z * s) * r);
      // Normal of an ellipse: scale the offset by the inverse axes.
      const nn = new THREE.Vector3().addScaledVector(N, c / flatten).addScaledVector(B, s).normalize();
      normals.push(nn.x, nn.y, nn.z);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** Radius profile that rounds both ends like a capsule tip. */
export const roundedProfile = (r0: number, r1: number, capStart = 0.08, capEnd = 0.08) => (t: number) => {
  const base = r0 + (r1 - r0) * t;
  const a = t < capStart ? Math.sqrt(Math.max(0, 1 - ((capStart - t) / capStart) ** 2)) : 1;
  const b = t > 1 - capEnd ? Math.sqrt(Math.max(0, 1 - ((t - (1 - capEnd)) / capEnd) ** 2)) : 1;
  return base * Math.min(a, b);
};
