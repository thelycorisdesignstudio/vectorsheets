import * as THREE from 'three';
import type { BrowShape, EyeShape } from '../types';
import { roundedProfile, sweptTube } from '../geometry/tube';

/** Eye shape presets: half-size of the eye on the face and a lid slant. */
export const EYE_SHAPES: Record<EyeShape, { size: [number, number]; lidTilt: number; label: string }> = {
  oval: { size: [0.136, 0.158], lidTilt: 0, label: 'Oval' },
  round: { size: [0.133, 0.133], lidTilt: 0, label: 'Round' },
  almond: { size: [0.146, 0.113], lidTilt: 0.14, label: 'Almond' },
  droplet: { size: [0.106, 0.158], lidTilt: -0.08, label: 'Droplet' },
};

export const BROW_LABELS: Record<BrowShape, string> = {
  pill: 'Pill',
  arched: 'Arched',
  tuft: 'Comma',
  dots: 'Moon dots',
  none: 'None',
};

/**
 * Brow geometry for the +x eye in brow-local space (x away from the nose,
 * y up, z out of the face). The -x side is mirrored by the caller.
 */
export function buildBrowGeometry(shape: BrowShape): THREE.BufferGeometry | null {
  const wrap = (x: number) => -(x * x) / (2 * 0.9);
  if (shape === 'none') return null;
  if (shape === 'dots') {
    const g = new THREE.SphereGeometry(1, 24, 16);
    g.scale(0.062, 0.046, 0.022);
    g.translate(-0.035, 0, 0);
    return g;
  }
  let pts: THREE.Vector3[];
  let profile: (t: number) => number;
  if (shape === 'pill') {
    pts = [-0.125, -0.0625, 0, 0.0625, 0.125].map((x) => new THREE.Vector3(x, 0.016 * (1 - (x / 0.125) ** 2), wrap(x)));
    profile = roundedProfile(0.05, 0.046, 0.28, 0.28);
  } else if (shape === 'arched') {
    pts = [-0.1, -0.05, 0, 0.05, 0.1].map((x) => new THREE.Vector3(x, 0.034 * (1 - (x / 0.1) ** 2) - 0.01, wrap(x)));
    profile = roundedProfile(0.025, 0.02, 0.2, 0.2);
  } else {
    pts = [-0.085, -0.045, 0, 0.045, 0.085].map((x) => {
      const u = (x + 0.085) / 0.17;
      return new THREE.Vector3(x, 0.03 * u * u - 0.008, wrap(x));
    });
    profile = (t) => 0.04 * (1 - 0.7 * t) * Math.sqrt(Math.sin(Math.PI * Math.min(1, t * 1.01)));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return sweptTube(curve, profile, { segments: 40, radial: 18, flatten: 0.5, up: new THREE.Vector3(0, 0, 1) });
}

/** Unit dome (disc of radius 1 bulging toward +z) used as the eye canvas. */
export function buildEyeDome(rings = 18, segments = 56) {
  const pos: number[] = [];
  const idx: number[] = [];
  pos.push(0, 0, 1);
  for (let r = 1; r <= rings; r++) {
    const rad = r / rings;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, Math.sin(a) * rad, Math.sqrt(Math.max(0, 1 - rad * rad)) * 0.92 + 0.08);
    }
  }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + (r - 1) * segments + s;
      const b = 1 + (r - 1) * segments + ((s + 1) % segments);
      const c = 1 + r * segments + s;
      const d = 1 + r * segments + ((s + 1) % segments);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Soft radial halo texture for antenna bulbs. */
export function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
