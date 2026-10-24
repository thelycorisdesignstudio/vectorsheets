import type { CrownFeature, EarStyle, HeadShape } from '../types';
import {
  type Leaf, type V3, add, cross, makeLeaf, normalize, sdEllipsoid, sdLeaf, sdRoundCone, smax, smin,
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
/** Each crown lobe gets its own bone after the fixed ones. */
export const LOBE_BONE_BASE = 9;
export const MAX_LOBES = 8;

export interface AnatomySpec {
  head: HeadShape;
  ears: EarStyle;
  crown: CrownFeature;
  /** species: the alien (default) or a stylised human */
  kind?: 'alien' | 'human';
  /** human figure */
  figure?: 'lady' | 'man';
}

/** A bangle worn on a forearm: arm index, position along elbow→hand (0..1), colour, tube radius. */
export interface Bangle {
  arm: 0 | 1;
  t: number;
  color: string;
  tube: number;
}

export interface HeadDef {
  c: V3;
  rx: number;
  ry: number;
  depth: number;
  round: number;
  bulge: number;
  /** extra rounding of the back of the head */
  backBulge: number;
  /** squircle exponent of the face outline (2 = ellipse, higher = squarer) */
  squircle: number;
  jowl?: { c: V3; r: V3; k: number };
}

const HEADS: Record<HeadShape, HeadDef> = {
  // A thick disc: flat friendly face plane, crisp but soft bevel, fuller back.
  puck: { c: [0, 1.86, 0], rx: 0.76, ry: 0.6, depth: 0.29, round: 0.15, bulge: 0.025, backBulge: 0.13, squircle: 2.25 },
  pebble: { c: [0, 1.88, 0], rx: 0.67, ry: 0.66, depth: 0.28, round: 0.2, bulge: 0.06, backBulge: 0.13, squircle: 2 },
  bun: { c: [0, 1.89, 0], rx: 0.7, ry: 0.56, depth: 0.25, round: 0.15, bulge: 0.03, backBulge: 0.13, squircle: 2.2, jowl: { c: [0, 1.66, 0.02], r: [0.66, 0.33, 0.3], k: 0.14 } },
};

/** A crown lobe: a round cone, optionally flattened front-to-back. */
export interface Lobe {
  a: V3;
  b: V3;
  r1: number;
  r2: number;
  flat: number;
  /** thin axis for paddle-shaped lobes (flattened in the lobe's own frame) */
  n?: V3;
}

export interface EyeLandmark {
  center: V3;
  normal: V3;
  side: 1 | -1;
}

/** Face layout relative to the head centre (scaled per character). */
export interface FaceLayout {
  /** overall scale of eyes, brows and mouth (1 = Oru) */
  scale: number;
  eyeSpread: number;
  eyeLift: number;
  /** brow height above the eye centre */
  browOffset: number;
  /** mouth distance below the head centre */
  mouthOffset: number;
  blush: { dx: number; dy: number; rx: number; ry: number };
  /** strength of a drawn upper lash line (0 = none) */
  liner?: number;
  /** resting openness of the upper lids (1 = fully open) */
  lidRest?: number;
}

export class Anatomy {
  readonly spec: AnatomySpec;
  head: HeadDef;
  headCenter: V3;
  neck: V3 = [0, 1.3, 0];
  crownPivot: V3;
  face: FaceLayout = {
    scale: 1, eyeSpread: 0.29, eyeLift: 0.05, browOffset: 0.232, mouthOffset: 0.165,
    blush: { dx: 0.45, dy: -0.12, rx: 0.125, ry: 0.08 },
  };
  /** touch collider for the body: centre + radii */
  bellyCollider: { c: V3; r: V3 } = { c: [0, 0.75, 0.02], r: [0.42, 0.5, 0.34] };
  /** foot x offset (for contact shadows) */
  footX = 0.185;
  /** model-space height range that jiggles like soft jelly */
  wobbleRange: [number, number] = [1.5, 3.1];
  lobes: Lobe[] = [];
  /** bangles on the forearms (separate rings, coloured individually) */
  bangles: Bangle[] = [];
  ears: Leaf[] = [];
  eyes: EyeLandmark[] = [];
  /** Eye ellipse half-size on the face plane */
  readonly eyeSize: [number, number] = [0.1, 0.122];
  // Thick, straight arms from broad shoulders, hanging out about 25 degrees.
  // The elbow lies on the straight line so the rest pose shows no kink.
  shoulders: [V3, V3] = [[0.25, 1.13, 0], [-0.25, 1.13, 0]];
  elbows: [V3, V3] = [[0.425, 0.88, 0.035], [-0.425, 0.88, 0.035]];
  hands: [V3, V3] = [[0.6, 0.63, 0.07], [-0.6, 0.63, 0.07]];
  protected partBounds: [number, number, number, number][] = [];
  private scratch = new Float32Array(PART_COUNT);

  constructor(spec: AnatomySpec) {
    this.spec = spec;
    this.head = HEADS[spec.head] ?? HEADS.puck;
    this.headCenter = this.head.c;
    this.crownPivot = [0, this.head.c[1] + 0.08, -0.12];
    this.setup();
  }

  /** (Re)builds derived landmarks; subclasses call it after setting their own dimensions. */
  protected setup() {
    this.lobes = [];
    this.ears = [];
    this.eyes = [];
    this.buildCrown();
    this.buildEars();
    this.computeBounds();
    this.placeEyes();
  }

  /**
   * Colour regions for clothed characters: writes [hair, shirt, pants, shoes]
   * weights into `out` and returns true, or returns false (no regions).
   */
  regions(_x: number, _y: number, _z: number, _w: Float32Array, _out: Float32Array): boolean {
    return false;
  }

  protected buildCrown() {
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
      case 'fronds': {
        // Six long, flat paddles fanning out from behind the head, overlapping at
        // the base and widening toward rounded tips. Lengths are deliberately uneven.
        const P = this.crownPivot;
        // Seven wide, flat paddles that touch and merge into one continuous fan.
        const fan: [number, number, number][] = [[-96, 0.88, 0.17], [-65, 1.0, 0.185], [-34, 1.1, 0.195], [-3, 1.14, 0.2], [28, 1.09, 0.195], [58, 1.0, 0.185], [87, 0.87, 0.17]];
        for (const [deg, len, rTip] of fan) {
          const rad = (deg * Math.PI) / 180;
          // Lean back more toward the top so the mane frames the face from behind.
          const back = -0.3 - 0.25 * Math.cos(rad);
          const dir = normalize([Math.sin(rad), Math.cos(rad) * 0.95, back]);
          const side: V3 = [Math.cos(rad), -Math.sin(rad), 0];
          const n = normalize(cross(dir, side));
          this.lobes.push({ a: add(P, dir, 0.3), b: add(P, dir, len), r1: 0.1, r2: rTip, flat: 0.4, n });
        }
        break;
      }
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

  protected buildEars() {
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

  protected placeEyes() {
    const [cx, cy] = this.head.c;
    for (const side of [1, -1] as const) {
      const x = cx + this.face.eyeSpread * side;
      const y = cy + this.face.eyeLift;
      const hit = this.raycast([x, y, 2], [0, 0, -1], this.headOnly);
      const p = hit ? hit.p : ([x, y, 0.3] as V3);
      const n = hit ? hit.n : ([0, 0, 1] as V3);
      this.eyes.push({ center: p, normal: n, side });
    }
  }

  // --- Field ----------------------------------------------------------------

  protected headField(x: number, y: number, z: number) {
    const h = this.head;
    const px = x - h.c[0], py = y - h.c[1], pz = z - h.c[2];
    // Squircle outline: rounder-square than an ellipse, like a soft disc.
    const q = h.squircle;
    const er = (Math.abs(px / h.rx) ** q + Math.abs(py / h.ry) ** q) ** (1 / q);
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

  protected crownField(x: number, y: number, z: number) {
    if (!this.lobes.length) return 1e3;
    let d = 1e9;
    for (const l of this.lobes) {
      let dl: number;
      if (l.n) {
        // Paddle: flatten along the lobe's own thin axis.
        const px = x - l.a[0], py = y - l.a[1], pz = z - l.a[2];
        const pn = px * l.n[0] + py * l.n[1] + pz * l.n[2];
        const s = (1 / l.flat - 1) * pn;
        dl = sdRoundCone(x + l.n[0] * s, y + l.n[1] * s, z + l.n[2] * s, l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], l.b[2], l.r1, l.r2) * l.flat;
      } else {
        // Flatten front-to-back around the lobe's own origin.
        const zz = l.a[2] + (z - l.a[2]) / l.flat;
        const bz = l.a[2] + (l.b[2] - l.a[2]) / l.flat;
        dl = sdRoundCone(x, y, zz, l.a[0], l.a[1], l.a[2], l.b[0], l.b[1], bz, l.r1, l.r2) * l.flat;
      }
      d = d === 1e9 ? dl : smin(d, dl, l.n ? 0.04 : 0.05);
    }
    return d;
  }

  protected bodyField(x: number, y: number, z: number) {
    // Gummy-bear torso: broad rounded shoulders, a soft belly, wide hips.
    let d = sdEllipsoid(x, y - 1.0, z, 0.37, 0.34, 0.29);
    d = smin(d, sdEllipsoid(x, y - 0.8, z - 0.03, 0.37, 0.28, 0.3), 0.12);
    d = smin(d, sdEllipsoid(x, y - 0.63, z, 0.36, 0.2, 0.28), 0.1);
    d = smin(d, sdRoundCone(x, y, z, 0, 1.18, 0, 0, 1.42, 0, 0.17, 0.15), 0.08);
    // Two thick columns for legs, almost as wide as the hips, with a small gap.
    const ax = Math.abs(x);
    d = smin(d, sdRoundCone(ax, y, z, 0.18, 0.62, 0, 0.185, 0.17, 0.02, 0.168, 0.165), 0.08);
    // Feet: the leg end turns gently forward onto a flat sole.
    d = smin(d, sdEllipsoid(ax - 0.185, y - 0.09, z - 0.07, 0.17, 0.095, 0.2), 0.08);
    d = Math.max(d, -y);
    // A small V crease where the legs meet the belly.
    const groove = Math.min(
      sdRoundCone(ax, y, z, 0.16, 0.69, 0.25, 0, 0.575, 0.285, 0.009, 0.009),
      sdRoundCone(ax, y, z, 0, 0.575, 0.285, 0, 0.5, 0.27, 0.009, 0.006),
    );
    return smax(d, -groove, 0.035);
  }

  protected armField(x: number, y: number, z: number, i: 0 | 1) {
    const s = this.shoulders[i], e = this.elbows[i], h = this.hands[i];
    // Thick tube, barely tapering, ending in a rounded, slightly flattened paddle.
    let d = sdRoundCone(x, y, z, s[0], s[1], s[2], e[0], e[1], e[2], 0.15, 0.135);
    d = smin(d, sdRoundCone(x, y, z, e[0], e[1], e[2], h[0], h[1], h[2], 0.135, 0.128), 0.04);
    d = smin(d, sdEllipsoid(x - h[0] - 0.012 * Math.sign(h[0]), y - h[1] + 0.03, z - h[2], 0.145, 0.15, 0.105), 0.06);
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
        default: out[i] = this.crownField(x, y, z);
      }
    }
    return out;
  }

  protected computeBounds() {
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
      [0, 0.75, 0, 0.86],
      [h.c[0], h.c[1] - (h.jowl ? 0.05 : 0), h.c[2], Math.hypot(Math.max(h.rx, h.ry), h.depth + h.bulge) + 0.08],
      sphereOf([this.shoulders[0], this.elbows[0], this.hands[0]], 0.13),
      sphereOf([this.shoulders[1], this.elbows[1], this.hands[1]], 0.13),
      leaf(this.ears[0]),
      leaf(this.ears[1]),
      crownPts.length ? sphereOf(crownPts, Math.max(...this.lobes.map((l) => l.r2)) + 0.08) : [0, -50, 0, 0.1],
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

  /** Forearm radius at fraction t from elbow to hand (used to fit bangles). */
  armRadiusAt(_arm: 0 | 1, t: number) {
    return 0.135 + (0.128 - 0.135) * t;
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
    return { min: [-1.14, -0.03, -0.82], max: [1.14, 3.2, 0.6] };
  }
}
