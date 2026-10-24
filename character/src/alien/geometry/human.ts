import { Anatomy, type AnatomySpec, type HeadDef, PART } from './anatomy';
import { type V3, makeLeaf, sdEllipsoid, sdRoundCone, smax, smin, sstep } from './sdf';

/**
 * Stylised human figures in the same soft, clay-like language as Oru:
 * an egg-shaped head with soft cheeks, chin and a button nose; sculpted hair
 * as one volume; slim skin arms with mitten hands; clothing modelled as
 * volume (puff-sleeved tee, flared trousers, shoes) and coloured by region.
 * Original designs — inspired by the look, not copied from any character.
 */
type Figure = 'lady' | 'man';

interface FigureDef {
  head: HeadDef;
  cranium: { c: V3; r: V3 };
  jaw: { c: V3; r: V3 };
  chin: { c: V3; r: V3 };
  nose: { c: V3; r: V3 };
  neck: { a: V3; b: V3; r: number };
  chest: { c: V3; r: V3 };
  waist: { c: V3; r: V3 };
  hips: { c: V3; r: V3 };
  sleeve: { dx: number; y: number; r: V3 };
  arm: { shoulder: V3; elbow: V3; hand: V3; r: [number, number, number] };
  mitten: V3;
  leg: { top: V3; bottom: V3; r1: number; r2: number };
  shoe: { c: V3; r: V3 };
  waistY: number;
  hemY: number;
  neckline: number;
  ears: boolean;
}

const FIGURES: Record<Figure, FigureDef> = {
  lady: {
    head: { c: [0, 2.76, 0], rx: 0.44, ry: 0.53, depth: 0.43, round: 0.2, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.83, -0.01], r: [0.42, 0.46, 0.43] },
    jaw: { c: [0, 2.63, 0.05], r: [0.36, 0.31, 0.37] },
    chin: { c: [0, 2.43, 0.14], r: [0.15, 0.1, 0.14] },
    nose: { c: [0, 2.67, 0.44], r: [0.045, 0.055, 0.048] },
    neck: { a: [0, 2.08, -0.01], b: [0, 2.42, -0.02], r: 0.07 },
    chest: { c: [0, 1.92, 0], r: [0.31, 0.22, 0.18] },
    waist: { c: [0, 1.6, 0], r: [0.25, 0.27, 0.165] },
    hips: { c: [0, 1.38, 0], r: [0.28, 0.19, 0.19] },
    sleeve: { dx: 0.32, y: 1.93, r: [0.15, 0.13, 0.135] },
    arm: { shoulder: [0.33, 1.97, 0], elbow: [0.43, 1.65, 0.03], hand: [0.47, 1.34, 0.06], r: [0.066, 0.058, 0.05] },
    mitten: [0.068, 0.092, 0.042],
    leg: { top: [0.135, 1.3, 0], bottom: [0.2, 0.2, 0.02], r1: 0.155, r2: 0.2 },
    shoe: { c: [0.2, 0.075, 0.05], r: [0.1, 0.075, 0.16] },
    waistY: 1.44,
    hemY: 0.2,
    neckline: 2.08,
    ears: false,
  },
  man: {
    head: { c: [0, 2.78, 0], rx: 0.45, ry: 0.53, depth: 0.43, round: 0.2, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.85, -0.01], r: [0.43, 0.47, 0.44] },
    jaw: { c: [0, 2.62, 0.04], r: [0.39, 0.3, 0.37] },
    chin: { c: [0, 2.43, 0.13], r: [0.17, 0.1, 0.14] },
    nose: { c: [0, 2.68, 0.445], r: [0.052, 0.064, 0.054] },
    neck: { a: [0, 2.08, -0.01], b: [0, 2.42, -0.02], r: 0.09 },
    chest: { c: [0, 1.92, 0], r: [0.34, 0.24, 0.2] },
    waist: { c: [0, 1.6, 0], r: [0.29, 0.28, 0.18] },
    hips: { c: [0, 1.38, 0], r: [0.29, 0.19, 0.19] },
    sleeve: { dx: 0.38, y: 1.92, r: [0.12, 0.15, 0.12] },
    arm: { shoulder: [0.38, 1.98, 0], elbow: [0.48, 1.66, 0.03], hand: [0.52, 1.34, 0.06], r: [0.078, 0.068, 0.06] },
    mitten: [0.078, 0.1, 0.05],
    leg: { top: [0.15, 1.3, 0], bottom: [0.16, 0.2, 0.02], r1: 0.15, r2: 0.135 },
    shoe: { c: [0.165, 0.08, 0.06], r: [0.115, 0.085, 0.18] },
    waistY: 1.44,
    hemY: 0.2,
    neckline: 2.08,
    ears: true,
  },
};

export class HumanAnatomy extends Anatomy {
  readonly figure: Figure;
  readonly def: FigureDef;

  constructor(spec: AnatomySpec) {
    super(spec);
    this.figure = spec.figure ?? 'lady';
    this.def = FIGURES[this.figure];
    const d = this.def;
    this.head = d.head;
    this.headCenter = d.head.c;
    this.neck = [0, 2.34, 0];
    this.crownPivot = [0, d.head.c[1] + 0.3, -0.05];
    this.face = {
      scale: 0.55,
      eyeSpread: 0.165,
      eyeLift: -0.01,
      browOffset: 0.135,
      mouthOffset: 0.24,
      blush: { dx: 0.245, dy: -0.13, rx: 0.07, ry: 0.042 },
    };
    const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];
    this.shoulders = [d.arm.shoulder, mirror(d.arm.shoulder)];
    this.elbows = [d.arm.elbow, mirror(d.arm.elbow)];
    this.hands = [d.arm.hand, mirror(d.arm.hand)];
    this.bellyCollider = { c: [0, 1.5, 0.02], r: [0.34, 0.6, 0.26] };
    this.footX = d.shoe.c[0];
    this.wobbleRange = [2.5, 3.4];
    this.setup();
  }

  protected buildCrown() {
    // Hair is one sculpted volume (crownField); no separate lobes.
  }

  protected buildEars() {
    const c = this.head.c;
    for (const side of [1, -1] as const) {
      if (this.def?.ears) {
        this.ears.push(makeLeaf([0.4 * side, c[1] - 0.05, -0.01], [1 * side, 0.15, -0.25], [0.2 * side, 0, 1], 0.12, 0.08, 0.04, 0.1, 0));
      } else {
        this.ears.push(makeLeaf([0, c[1], 0], [side, 0, 0], [0, 0, 1], 0.01, 0.001, 0.001, 0, 0));
      }
    }
  }

  protected headField(x: number, y: number, z: number) {
    const d = this.def ?? FIGURES.lady;
    const e = (q: { c: V3; r: V3 }) => sdEllipsoid(x - q.c[0], y - q.c[1], z - q.c[2], q.r[0], q.r[1], q.r[2]);
    let h = e(d.cranium);
    h = smin(h, e(d.jaw), 0.12);
    h = smin(h, e(d.chin), 0.08);
    h = smin(h, e(d.nose), 0.03);
    return h;
  }

  /** Hair: a single sculpted volume with the face opening carved out. */
  protected crownField(x: number, y: number, z: number) {
    const d = this.def;
    if (!d) return 1e3;
    const c = d.head.c;
    if (this.figure === 'lady') {
      // Chin-length bob: full crown, flaring out at the jaw, framing the face,
      // with a side-swept fringe that leaves the forehead partly open.
      let h = sdEllipsoid(x, y - (c[1] + 0.12), z + 0.03, 0.5, 0.5, 0.5);
      h = smin(h, sdEllipsoid(x, y - (c[1] - 0.2), z + 0.03, 0.53, 0.24, 0.45), 0.12);
      // Face opening, tilted so the fringe sweeps from one side.
      const fx = x - 0.05, fy = y - (c[1] - 0.06) - 0.12 * Math.max(0, -x);
      const faceCut = sdEllipsoid(fx, fy, z - 0.38, 0.35, 0.4, 0.34);
      h = smax(h, -faceCut, 0.06);
      // Keep the hair outside the head shell so it reads as volume.
      h = smax(h, c[1] - 0.42 - y + 0.06 * Math.max(0, z), 0.06);
      // Swept fringe lock.
      // It sits proud of the forehead so it reads as hair, not a stain.
      h = smin(h, sdRoundCone(x, y, z, -0.3, c[1] + 0.33, 0.33, 0.1, c[1] + 0.21, 0.43, 0.09, 0.055), 0.07);
      return h;
    }
    // Short crop: tight at the sides and back, with volume and a quiff on top.
    let h = sdEllipsoid(x, y - (c[1] + 0.13), z + 0.01, 0.465, 0.42, 0.475);
    const faceCut = sdEllipsoid(x, y - (c[1] - 0.15), z - 0.32, 0.44, 0.4, 0.34);
    h = smax(h, -faceCut, 0.05);
    // Hairline: low at the back, higher at the sides and front (above the ears).
    const line = c[1] - 0.02 + 0.2 * sstep(-0.2, 0.35, z) + 0.05 * sstep(0.3, 0.42, Math.abs(x));
    h = smax(h, line - y, 0.04);
    // Side-parted quiff sweeping up and over.
    h = smin(h, sdEllipsoid(x - 0.08, y - (c[1] + 0.41), z - 0.2, 0.3, 0.14, 0.22), 0.1);
    h = smin(h, sdEllipsoid(x + 0.12, y - (c[1] + 0.36), z - 0.27, 0.2, 0.1, 0.14), 0.08);
    return h;
  }

  protected bodyField(x: number, y: number, z: number) {
    const d = this.def ?? FIGURES.lady;
    const e = (q: { c: V3; r: V3 }) => sdEllipsoid(x - q.c[0], y - q.c[1], z - q.c[2], q.r[0], q.r[1], q.r[2]);
    let b = e(d.chest);
    b = smin(b, e(d.waist), 0.14);
    b = smin(b, e(d.hips), 0.1);
    b = smin(b, sdRoundCone(x, y, z, d.neck.a[0], d.neck.a[1], d.neck.a[2], d.neck.b[0], d.neck.b[1], d.neck.b[2], d.neck.r, d.neck.r * 0.95), 0.05);
    const ax = Math.abs(x);
    const L = d.leg;
    b = smin(b, sdRoundCone(ax, y, z, L.top[0], L.top[1], L.top[2], L.bottom[0], L.bottom[1], L.bottom[2], L.r1, L.r2), 0.06);
    const s = d.shoe;
    b = smin(b, sdEllipsoid(ax - s.c[0], y - s.c[1], z - s.c[2], s.r[0], s.r[1], s.r[2]), 0.04);
    return Math.max(b, -y);
  }

  protected armField(x: number, y: number, z: number, i: 0 | 1) {
    const d = this.def ?? FIGURES.lady;
    const s = this.shoulders[i], el = this.elbows[i], h = this.hands[i];
    const [r0, r1, r2] = d.arm.r;
    const side = Math.sign(s[0]);
    let a = sdRoundCone(x, y, z, s[0], s[1], s[2], el[0], el[1], el[2], r0, r1);
    a = smin(a, sdRoundCone(x, y, z, el[0], el[1], el[2], h[0], h[1], h[2], r1, r2), 0.025);
    // Puffed sleeve rides with the upper arm.
    a = smin(a, sdEllipsoid(x - d.sleeve.dx * side, y - d.sleeve.y, z, d.sleeve.r[0], d.sleeve.r[1], d.sleeve.r[2]), 0.05);
    // Mitten hand with a small thumb.
    const m = d.mitten;
    a = smin(a, sdEllipsoid(x - h[0] - 0.008 * side, y - h[1] + 0.07, z - h[2], m[0], m[1], m[2]), 0.03);
    a = smin(a, sdRoundCone(x, y, z, h[0] - 0.03 * side, h[1] - 0.03, h[2] + 0.025, h[0] - 0.05 * side, h[1] - 0.075, h[2] + 0.05, 0.022, 0.018), 0.02);
    return a;
  }

  regions(x: number, y: number, z: number, w: Float32Array, out: Float32Array) {
    const d = this.def;
    const ax = Math.abs(x);
    const sl = d.sleeve;
    const sleeveE = Math.sqrt(((ax - sl.dx) / sl.r[0]) ** 2 + ((y - sl.y) / sl.r[1]) ** 2 + (z / sl.r[2]) ** 2);
    // Everything on the arm above the sleeve hem is shirt, so the shoulder never shows skin.
    const hem = sl.y - sl.r[1] * 0.8;
    const sleeve = Math.max(1 - sstep(1.0, 1.12, sleeveE), sstep(hem - 0.01, hem + 0.01, y));
    const body = w[PART.body];
    const arm = w[PART.armL] + w[PART.armR];
    out[0] = w[PART.crown];
    out[1] = body * sstep(d.waistY - 0.02, d.waistY + 0.02, y) * (1 - sstep(d.neckline - 0.02, d.neckline + 0.02, y)) + arm * sleeve;
    out[2] = body * (1 - sstep(d.waistY - 0.02, d.waistY + 0.02, y)) * sstep(d.hemY - 0.02, d.hemY + 0.01, y);
    out[3] = body * (1 - sstep(d.hemY - 0.02, d.hemY + 0.01, y));
    return true;
  }

  protected computeBounds() {
    const d = this.def;
    if (!d) return super.computeBounds();
    super.computeBounds();
    const c = d.head.c;
    this.partBounds[PART.body] = [0, 1.15, 0, 1.25];
    this.partBounds[PART.head] = [c[0], c[1], c[2], 0.65];
    this.partBounds[PART.crown] = [0, c[1] + 0.05, -0.02, 0.72];
    for (const i of [0, 1] as const) {
      const s = this.shoulders[i], h = this.hands[i];
      this.partBounds[PART.armL + i] = [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2, 0.03, 0.42];
    }
  }

  bounds(): { min: V3; max: V3 } {
    return { min: [-0.72, -0.03, -0.6], max: [0.72, 3.42, 0.62] };
  }
}
