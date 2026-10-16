import type { CrownFeature, EarStyle, HeadShape } from '../types';
import {
  type Leaf, type V3, add, makeLeaf, normalize, sdEllipsoid, sdLeaf, sdRoundCone, smin,
} from './sdf';

/**
 * The species' anatomy as a signed distance field.
 *
 * Silhouette: a big, soft "puck" head (flat, friendly face plane with thick
 * rounded edges) crowned by chunky rounded lobes, sitting on a small blobby
 * body with rubber-hose arms and stubby legs. Every part is a soft clay-like
 * blend, so there are no seams anywhere.
 *
 * Parts are kept separate so the extracted mesh can be skinned by proximity.
 */

export const PART = { body: 0, head: 1, armL: 2, armR: 3, earL: 4, earR: 5, crown: 6 } as const;
export const PART_COUNT = 7;
/** Bone slots: parts plus forearms (split from the arm part by the elbow). */
export const BONE = { hips: 0, head: 1, armL: 2, armR: 3, earL: 4, earR: 5, crown: 6, foreL: 7, foreR: 8 } as const;

export interface AnatomySpec {
  head: HeadShape;
  ears: EarStyle;
  crown: CrownFeature;
}

interface HeadDef {
  c: V3;
  rx: number;
  ry: number;
  depth: number;
  round: number;
  bulge: number;
  /** extra rounding of the back of the head */
  backBulge: number;
  jowl?: { c: V3; r: V3; k: number };
}

const HEADS: Record<HeadShape, HeadDef> = {
  puck: { c: [0, 1.5, 0], rx: 0.72, ry: 0.56, depth: 0.2, round: 0.15, bulge: 0.05, backBulge: 0.16 },
  pebble: { c: [0, 1.52, 0], rx: 0.62, ry: 0.62, depth: 0.25, round: 0.22, bulge: 0.08, backBulge: 0.14 },
  bun: { c: [0, 1.53, 0], rx: 0.64, ry: 0.53, depth: 0.21, round: 0.17, bulge: 0.05, backBulge: 0.15, jowl: { c: [0, 1.31, 0.02], r: [0.62, 0.32, 0.3], k: 0.14 } },
};

/** A crown lobe: a round cone, optionally flattened front-to-back. */
export interface Lobe {
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  flat: number;
}

export interface EyeLandmark {
  center: V3;
  normal: V3;
  side: 1 | -1;
}

export class Anatomy {
  readonly spec: AnatomySpec;
  readonly head: HeadDef;
  readonly headCenter: V3;
  readonly neck: V3 = [0, 0.98, 0];
  readonly crownPivot: V3;
  lobes: Lobe[] = [];
  ears: Leaf[] = [];
  eyes: EyeLandmark[] = [];
  /** Eye ellipse half-size on the face plane */
  readonly eyeSize: [number, number] = [0.1, 0.122];
  readonly shoulders: [V3, V3] = [[0.27, 0.86, 0], [-0.27, 0.86, 0]];
  readonly elbows: [V3, V3] = [[0.43, 0.63, 0.03], [-0.43, 0.63, 0.03]];
  readonly hands: [V3, V3] = [[0.49, 0.41, 0.07], [-0.49, 0.41, 0.07]];
  private partBounds: [number, number, number, number][] = [];
  private scratch = new Float32Array(PART_COUNT);

  constructor(spec: AnatomySpec) {
    this.spec = spec;
    this.head = HEADS[spec.head] ?? HEADS.puck;
    this.headCenter = this.head.c;
    this.crownPivot = [0, this.head.c[1] + this.head.ry * 0.7, -0.05];
    this.buildCrown();
    this.buildEars();
    this.computeBounds();
    this.placeEyes();
  }

  private buildCrown() {
    const h = this.head;
    const [cx, cy] = h.c;
    const rim = (deg: number, inset = 0.78, z = -0.1): V3 => {
      const a = (deg * Math.PI) / 180;
      return [cx + Math.sin(a) * h.rx * inset, cy + Math.cos(a) * h.ry * inset, z];
    };
    const lobe = (deg: number, len: number, r1: number, r2: number, flat = 0.78, lean = -0.12, inset = 0.78) => {
      const a = rim(deg, inset);
      const rad = (deg * Math.PI) / 180;
      const dir = normalize([Math.sin(rad), Math.cos(rad), lean]);
      this.lobes.push({ a, b: add(a, dir, len), r1, r2, flat });
    };
    switch (this.spec.crown) {
      case 'fronds':
        // Five chunky fingers, deliberately uneven so the silhouette has personality.
        lobe(-68, 0.3, 0.12, 0.14, 0.72, -0.2, 0.7);
        lobe(-36, 0.4, 0.125, 0.152, 0.72, -0.18, 0.66);
        lobe(-3, 0.45, 0.13, 0.158, 0.72, -0.16, 0.62);
        lobe(31, 0.38, 0.125, 0.15, 0.72, -0.18, 0.66);
        lobe(63, 0.28, 0.115, 0.138, 0.72, -0.2, 0.7);
        break;
      case 'buds':
        for (const [deg, len, r] of [[-78, 0.1, 0.13], [-52, 0.14, 0.15], [-24, 0.17, 0.16], [6, 0.18, 0.165], [34, 0.15, 0.155], [60, 0.12, 0.14], [82, 0.08, 0.12]] as const) {
          lobe(deg, len, r * 0.9, r, 0.82, -0.05, 0.86);
        }
        break;
      case 'ears':
        lobe(-36, 0.36, 0.17, 0.07, 0.6, -0.05, 0.8);
        lobe(36, 0.36, 0.17, 0.07, 0.6, -0.05, 0.8);
        break;
      case 'sprout': {
        const a = rim(-6, 0.9, -0.02);
        const b = add(a, normalize([-0.15, 1, 0]), 0.16);
        this.lobes.push({ a, b, r1: 0.055, r2: 0.045, flat: 1 });
        const c = add(b, normalize([0.9, 0.55, 0]), 0.26);
        this.lobes.push({ a: b, b: c, r1: 0.05, r2: 0.12, flat: 0.45 });
        const d = add(b, normalize([-0.9, 0.35, 0]), 0.16);
        this.lobes.push({ a: b, b: d, r1: 0.04, r2: 0.08, flat: 0.45 });
        break;
      }
      case 'antennae':
        break;
    }
  }

  private buildEars() {
    const h = this.head;
    for (const side of [1, -1] as const) {
      if (this.spec.ears === 'fins') {
        this.ears.push(makeLeaf([h.rx * 0.88 * side, h.c[1] - 0.02, -0.06], [0.92 * side, -0.25, -0.2], [0.1 * side, 0.3, 1], 0.42, 0.13, 0.06, 0.4, 0));
      } else if (this.spec.ears === 'nubs') {
        this.ears.push(makeLeaf([h.rx * 0.9 * side, h.c[1] + 0.02, -0.04], [1 * side, 0.1, -0.1], [0, 0, 1], 0.2, 0.1, 0.075, 0.2, 0));
      } else {
        // Placeholder far inside the head; contributes nothing.
        this.ears.push(makeLeaf([0, h.c[1], 0], [side, 0, 0], [0, 0, 1], 0.01, 0.001, 0.001, 0, 0));
      }
    }
  }

  private placeEyes() {
    const [cx, cy] = this.head.c;
    for (const side of [1, -1] as const) {
      const x = cx + 0.235 * side;
      const y = cy + 0.04;
      const hit = this.raycast([x, y, 2], [0, 0, -1], this.headOnly);
      const p = hit ? hit.p : ([x, y, 0.3] as V3);
      const n = hit ? hit.n : ([0, 0, 1] as V3);
      this.eyes.push({ center: p, normal: n, side });
    }
  }

  // --- Field ----------------------------------------------------------------

  private headField(x: number, y: number, z: number) {
    const h = this.head;
    const px = x - h.c[0], py = y - h.c[1], pz = z - h.c[2];
    const er = Math.sqrt((px / h.rx) ** 2 + (py / h.ry) ** 2);
    // Distance to an elliptical rim (approximate, scaled by the minor radius).
    const radial = (er - 1) * Math.min(h.rx, h.ry) * (er > 1 ? 1 : 0.92);
    // Face and back of the head are gently domed.
    const dome = (pz > 0 ? h.bulge : h.backBulge) * Math.max(0, 1 - er * er);
    const az = Math.abs(pz) - dome;
    const dx = radial + h.round;
    const dz = az - h.depth + h.round;
    const ox = Math.max(dx, 0), oz = Math.max(dz, 0);
    let d = Math.min(Math.max(dx, dz), 0) + Math.sqrt(ox * ox + oz * oz) - h.round;
    if (h.jowl) {
      const j = h.jowl;
      d = smin(d, sdEllipsoid(x - j.c[0], y - j.c[1], z - j.c[2], j.r[0], j.r[1], j.r[2]), j.k);
    }
    return d;
  }

  private crownField(x: number, y: number, z: number) {
    let d = 1e9;
    for (const l of this.lobes) {
      // Flatten front-to-back around the lobe's own origin.
      const zz = l.a[2] + (z - l.a[2]) / l.flat;
      const bz = l.a[2] + (l.b[2] - l.a[2]) / l.flat;
      const dl = sdRoundCone(x, y, zz, l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], bz, l.r1, l.r2) * l.flat;
      d = d === 1e9 ? dl : smin(d, dl, 0.05);
    }
    return d;
  }

  private bodyField(x: number, y: number, z: number) {
    let d = sdEllipsoid(x, y - 0.63, z, 0.33, 0.35, 0.27);
    d = smin(d, sdEllipsoid(x, y - 0.5, z - 0.025, 0.34, 0.25, 0.28), 0.1);
    d = smin(d, sdRoundCone(x, y, z, 0, 0.88, 0, 0, 1.08, 0, 0.16, 0.15), 0.08);
    const ax = Math.abs(x);
    d = smin(d, sdRoundCone(ax, y, z, 0.145, 0.42, 0, 0.16, 0.11, 0.02, 0.118, 0.122), 0.07);
    d = smin(d, sdEllipsoid(ax - 0.165, y - 0.075, z - 0.065, 0.128, 0.075, 0.16), 0.06);
    return d;
  }

  private armField(x: number, y: number, z: number, i: 0 | 1) {
    const s = this.shoulders[i], e = this.elbows[i], h = this.hands[i];
    let d = sdRoundCone(x, y, z, s[0], s[1], s[2], e[0], e[1], e[2], 0.1, 0.09);
    d = smin(d, sdRoundCone(x, y, z, e[0], e[1], e[2], h[0], h[1], h[2], 0.09, 0.094), 0.04);
    d = smin(d, sdEllipsoid(x - h[0], y - h[1] + 0.02, z - h[2], 0.108, 0.115, 0.1), 0.05);
    return d;
  }

  parts(x: number, y: number, z: number, out: Float32Array) {
    const B = this.partBounds;
    for (let i = 0; i < PART_COUNT; i++) {
      const b = B[i];
      const dx = x - b[0], dy = y - b[1], dz = z - b[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - b[3];
      if (d > 0.22) {
        out[i] = d;
        continue;
      }
      switch (i) {
        case PART.body: out[i] = this.bodyField(x, y, z); break;
        case PART.head: out[i] = this.headField(x, y, z); break;
        case PART.armL: out[i] = this.armField(x, y, z, 0); break;
        case PART.armR: out[i] = this.armField(x, y, z, 1); break;
        case PART.earL: out[i] = sdLeaf(x, y, z, this.ears[0]); break;
        case PART.earR: out[i] = sdLeaf(x, y, z, this.ears[1]); break;
        default: out[i] = this.lobes.length ? this.crownField(x, y, z) : 1e3;
      }
    }
    return out;
  }

  private computeBounds() {
    const h = this.head;
    const sphereOf = (pts: V3[], pad: number): [number, number, number, number] => {
      const c: V3 = [0, 0, 0];
      for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
      let r = 0;
      for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
      return [c[0], c[1], c[2], r + pad];
    };
    const crownPts: V3[] = this.lobes.flatMap((l) => [l.a, l.b]);
    const leaf = (L: Leaf) => sphereOf([L.root, add(L.root, L.u, L.length)], Math.max(L.width, L.length * 0.1) + 0.03);
    this.partBounds = [
      [0, 0.6, 0, 0.62],
      [h.c[0], h.c[1] - (h.jowl ? 0.05 : 0), h.c[2], Math.hypot(Math.max(h.rx, h.ry), h.depth + h.bulge) + 0.08],
      sphereOf([this.shoulders[0], this.elbows[0], this.hands[0]], 0.13),
      sphereOf([this.shoulders[1], this.elbows[1], this.hands[1]], 0.13),
      leaf(this.ears[0]),
      leaf(this.ears[1]),
      crownPts.length ? sphereOf(crownPts, 0.18) : [0, -50, 0, 0.1],
    ];
  }

  sdf = (x: number, y: number, z: number) => {
    const p = this.parts(x, y, z, this.scratch);
    let d = smin(p[PART.body], p[PART.head], 0.07);
    d = smin(d, p[PART.crown], 0.07);
    d = smin(d, Math.min(p[PART.armL], p[PART.armR]), 0.06);
    d = smin(d, Math.min(p[PART.earL], p[PART.earR]), 0.06);
    return d;
  };

  /** Head-only field, used to place facial features. */
  headOnly = (x: number, y: number, z: number) => this.headField(x, y, z);

  normal(x: number, y: number, z: number, field = this.sdf): V3 {
    const e = 0.0015;
    return normalize([
      field(x + e, y, z) - field(x - e, y, z),
      field(x, y + e, z) - field(x, y - e, z),
      field(x, y, z + e) - field(x, y, z - e),
    ]);
  }

  raycast(from: V3, dir: V3, field = this.headOnly): { p: V3; n: V3 } | null {
    let t = 0;
    for (let i = 0; i < 200; i++) {
      const p = add(from, dir, t);
      const d = field(p[0], p[1], p[2]);
      if (d < 1e-5) return { p, n: this.normal(p[0], p[1], p[2], field) };
      t += d * 0.9;
      if (t > 5) return null;
    }
    return null;
  }

  /** Antenna base points (crown 'antennae'). */
  antennaBases(): { base: V3; dir: V3 }[] {
    if (this.spec.crown !== 'antennae') return [];
    const h = this.head;
    return [1, -1].map((side) => {
      const a = (28 * Math.PI) / 180;
      const from: V3 = [h.c[0] + Math.sin(a) * side * 0.4, h.c[1] + 1.2, -0.05];
      const hit = this.raycast(from, [0, -1, 0]);
      const p = hit ? hit.p : ([from[0], h.c[1] + h.ry, -0.05] as V3);
      return { base: p, dir: normalize([side * 0.35, 1, -0.1]) };
    });
  }

  bounds(): { min: V3; max: V3 } {
    return { min: [-1.0, -0.03, -0.48], max: [1.0, 2.66, 0.52] };
  }
}

