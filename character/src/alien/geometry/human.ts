import { Anatomy, type AnatomySpec, type Bangle, type FaceLayout, type HeadDef, PART, type RestPose } from './anatomy';
import { type V3, makeLeaf, sdEllipsoid, sdRoundCone, smax, smin, sstep } from './sdf';

/**
 * Stylised human figures in the same soft, clay-like language as Oru:
 * an egg-shaped head with soft cheeks, chin and a button nose; sculpted hair
 * as one volume; slim skin arms with relaxed, fingered hands; clothing modelled as
 * volume (puff-sleeved tee, flared trousers, shoes) and coloured by region.
 * Original designs — inspired by the look, not copied from any character.
 */
type Figure = 'lady' | 'man' | 'noor';

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
  sleeve: { a: V3; b: V3; r1: number; r2: number };
  arm: { shoulder: V3; elbow: V3; hand: V3; r: [number, number, number] };
  leg: { top: V3; bottom: V3; r1: number; r2: number };
  shoe: { c: V3; r: V3 };
  waistY: number;
  hemY: number;
  neckline: number;
  ears: boolean;
  face: FaceLayout;
  bangles: Bangle[];
  /** uniform scale of head and hair about the chin (1 = as sculpted) */
  headScale?: number;
  /** hand size (1 = lady) */
  handScale: number;
  restPose: RestPose;
  /** depth of trouser folds */
  folds: number;
  blush: number;
}

const FIGURES: Record<Figure, FigureDef> = {
  // Proportions after a stop-motion style figure: a small oval head with a
  // pointed chin, a short neck, a boxy tee with elbow-length sleeves, and
  // huge high-waisted balloon trousers that fall almost to the floor.
  lady: {
    head: { c: [0, 2.86, 0], rx: 0.27, ry: 0.32, depth: 0.26, round: 0.12, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.92, -0.02], r: [0.255, 0.28, 0.27] },
    jaw: { c: [0, 2.8, 0.02], r: [0.235, 0.185, 0.23] },
    chin: { c: [0, 2.665, 0.07], r: [0.062, 0.055, 0.08] },
    nose: { c: [0, 2.825, 0.252], r: [0.02, 0.026, 0.024] },
    neck: { a: [0, 2.44, -0.01], b: [0, 2.72, -0.02], r: 0.058 },
    chest: { c: [0, 2.3, 0], r: [0.33, 0.2, 0.19] },
    waist: { c: [0, 2.04, 0], r: [0.32, 0.25, 0.2] },
    hips: { c: [0, 1.8, 0], r: [0.3, 0.16, 0.21] },
    sleeve: { a: [0.28, 2.39, 0], b: [0.41, 2.17, 0.02], r1: 0.1, r2: 0.098 },
    arm: { shoulder: [0.3, 2.41, 0], elbow: [0.41, 2.1, 0.03], hand: [0.45, 1.77, 0.07], r: [0.052, 0.045, 0.039] },
    leg: { top: [0.15, 1.62, 0], bottom: [0.235, 0.33, 0.02], r1: 0.2, r2: 0.25 },
    shoe: { c: [0.24, 0.055, 0.1], r: [0.085, 0.055, 0.14] },
    waistY: 1.86,
    hemY: 0.1,
    neckline: 2.5,
    ears: false,
    headScale: 1.1,
    handScale: 1.08,
    folds: 0.007,
    blush: 0,
    // Weight on one hip: left hand on the hip, right forearm raised and turned
    // palm-up in an open, presenting gesture, head tipped a little.
    restPose: { armLx: 0.14, armLz: 0.55, elbowLx: 0, elbowL: -1.26, armRx: -0.05, armRz: -0.24, armRy: -0.75, elbowRx: -1.3, elbowR: 0, elbowRy: -0.45, handRy: -1.1, headRz: 0.09 },
    face: { scale: 0.36, eyeSpread: 0.102, eyeLift: 0.02, browOffset: 0.075, mouthOffset: 0.14, blush: { dx: 0.135, dy: -0.06, rx: 0.04, ry: 0.024 }, liner: 1, lidRest: 0.72, pupilBase: 0.2, mouthScale: 0.72 },
    bangles: [
      // A stack of beaded colours on the presenting wrist, one gold bangle on the other.
      { arm: 1, t: 0.8, color: '#3fa7a0', tube: 0.011 },
      { arm: 1, t: 0.85, color: '#7fd0c4', tube: 0.009 },
      { arm: 1, t: 0.895, color: '#e9b43c', tube: 0.01 },
      { arm: 1, t: 0.94, color: '#c79ad8', tube: 0.012 },
      { arm: 0, t: 0.9, color: '#d9a64a', tube: 0.008 },
    ],
  },
  man: {
    head: { c: [0, 2.9, 0], rx: 0.28, ry: 0.33, depth: 0.27, round: 0.12, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.95, -0.02], r: [0.265, 0.29, 0.28] },
    jaw: { c: [0, 2.81, 0.02], r: [0.248, 0.2, 0.24] },
    chin: { c: [0, 2.69, 0.07], r: [0.11, 0.07, 0.09] },
    nose: { c: [0, 2.845, 0.265], r: [0.03, 0.038, 0.034] },
    neck: { a: [0, 2.44, -0.01], b: [0, 2.74, -0.02], r: 0.075 },
    chest: { c: [0, 2.3, 0], r: [0.37, 0.2, 0.2] },
    waist: { c: [0, 2.02, 0], r: [0.33, 0.26, 0.2] },
    hips: { c: [0, 1.8, 0], r: [0.3, 0.16, 0.2] },
    sleeve: { a: [0.31, 2.37, 0], b: [0.45, 2.18, 0.02], r1: 0.092, r2: 0.094 },
    arm: { shoulder: [0.34, 2.41, 0], elbow: [0.46, 2.09, 0.03], hand: [0.5, 1.76, 0.07], r: [0.06, 0.053, 0.047] },
    leg: { top: [0.155, 1.65, 0], bottom: [0.17, 0.24, 0.02], r1: 0.165, r2: 0.135 },
    shoe: { c: [0.17, 0.07, 0.08], r: [0.1, 0.075, 0.17] },
    waistY: 1.86,
    hemY: 0.17,
    neckline: 2.5,
    ears: true,
    headScale: 1.1,
    handScale: 1.15,
    folds: 0.004,
    blush: 0.15,
    restPose: { armLx: -0.04, armLz: -0.07, elbowLx: -0.24, elbowL: 0.04, armRx: -0.04, armRz: 0.07, elbowRx: -0.24, elbowR: -0.04 },
    face: { scale: 0.36, eyeSpread: 0.106, eyeLift: 0.02, browOffset: 0.08, mouthOffset: 0.14, blush: { dx: 0.14, dy: -0.06, rx: 0.04, ry: 0.024 }, liner: 0, lidRest: 0.9, pupilBase: 0.44 },
    bangles: [],
  },
  // A rounder face and fuller figure: curly hair gathered into a high puff,
  // a short-sleeved tee and wide, straight trousers. Hands loosely clasped.
  noor: {
    head: { c: [0, 2.84, 0], rx: 0.285, ry: 0.32, depth: 0.27, round: 0.12, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.9, -0.02], r: [0.27, 0.28, 0.275] },
    jaw: { c: [0, 2.78, 0.02], r: [0.255, 0.2, 0.235] },
    chin: { c: [0, 2.655, 0.07], r: [0.095, 0.065, 0.085] },
    nose: { c: [0, 2.805, 0.258], r: [0.027, 0.03, 0.028] },
    neck: { a: [0, 2.42, -0.01], b: [0, 2.7, -0.02], r: 0.064 },
    chest: { c: [0, 2.28, 0.01], r: [0.37, 0.21, 0.22] },
    waist: { c: [0, 2.02, 0], r: [0.355, 0.26, 0.22] },
    hips: { c: [0, 1.8, 0], r: [0.37, 0.18, 0.235] },
    sleeve: { a: [0.3, 2.37, 0], b: [0.44, 2.2, 0.02], r1: 0.105, r2: 0.105 },
    arm: { shoulder: [0.33, 2.39, 0], elbow: [0.45, 2.08, 0.03], hand: [0.49, 1.76, 0.07], r: [0.062, 0.054, 0.046] },
    leg: { top: [0.18, 1.62, 0], bottom: [0.22, 0.3, 0.02], r1: 0.215, r2: 0.215 },
    shoe: { c: [0.22, 0.07, 0.08], r: [0.1, 0.075, 0.17] },
    waistY: 1.86,
    hemY: 0.12,
    neckline: 2.47,
    ears: true,
    headScale: 1.1,
    handScale: 1.12,
    folds: 0.005,
    blush: 0.25,
    restPose: { armLx: -0.1, armLz: -0.05, elbowLx: -1.05, elbowL: -1.0, armRx: -0.1, armRz: 0.05, elbowRx: -1.05, elbowR: 1.0, headRz: -0.05 },
    face: { scale: 0.38, eyeSpread: 0.108, eyeLift: 0.02, browOffset: 0.08, mouthOffset: 0.135, blush: { dx: 0.15, dy: -0.06, rx: 0.045, ry: 0.026 }, liner: 1, lidRest: 0.95, pupilBase: 0.3, mouthScale: 0.85 },
    bangles: [],
  },
};

/** Model-space height of each figure's head centre (after head scaling), for camera framing. */
export function humanHeadY(figure: Figure) {
  const d = FIGURES[figure];
  const pivot = d.neck.b[1] - 0.1;
  return pivot + (d.head.c[1] - pivot) * (d.headScale ?? 1);
}

export class HumanAnatomy extends Anatomy {
  readonly figure: Figure;
  readonly def: FigureDef;

  constructor(spec: AnatomySpec) {
    super(spec);
    this.figure = spec.figure ?? 'lady';
    this.def = FIGURES[this.figure];
    const d = this.def;
    // Head and hair are sculpted at one size and scaled about the chin.
    const k = (this.headK = d.headScale ?? 1);
    this.pivotY = d.neck.b[1] - 0.1;
    const sy = (y: number) => this.pivotY + (y - this.pivotY) * k;
    const hd = d.head;
    this.head = { ...hd, c: [hd.c[0] * k, sy(hd.c[1]), hd.c[2] * k], rx: hd.rx * k, ry: hd.ry * k, depth: hd.depth * k, round: hd.round * k };
    this.headCenter = this.head.c;
    const f = d.face;
    this.face = {
      ...f, scale: f.scale * k, eyeSpread: f.eyeSpread * k, eyeLift: f.eyeLift * k, browOffset: f.browOffset * k, mouthOffset: f.mouthOffset * k,
      blush: { dx: f.blush.dx * k, dy: f.blush.dy * k, rx: f.blush.rx * k, ry: f.blush.ry * k },
    };
    this.neck = [0, this.head.c[1] - 0.42, 0];
    this.crownPivot = [0, this.head.c[1] + this.head.ry * 0.6, -0.05];
    this.bangles = d.bangles;
    this.restPose = d.restPose;
    this.blushStrength = d.blush;
    const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];
    this.shoulders = [d.arm.shoulder, mirror(d.arm.shoulder)];
    this.elbows = [d.arm.elbow, mirror(d.arm.elbow)];
    this.hands = [d.arm.hand, mirror(d.arm.hand)];
    this.bellyCollider = { c: [0, (d.waistY + d.neckline) / 2, 0.02], r: [0.36, 0.6, 0.26] };
    this.footX = d.shoe.c[0];
    this.wobbleRange = [d.neckline + 0.3, this.head.c[1] + 0.7];
    this.setup();
  }

  protected buildCrown() {
    // Hair is one sculpted volume (crownField); no separate lobes.
  }

  protected buildEars() {
    const c = this.head.c;
    for (const side of [1, -1] as const) {
      if (this.def?.ears) {
        const k = this.head.rx / 0.45;
        this.ears.push(makeLeaf([0.4 * k * side, c[1] - 0.05 * k, -0.01 * k], [1 * side, 0.15, -0.25], [0.2 * side, 0, 1], 0.12 * k, 0.08 * k, 0.04 * k, 0.1 * k, 0));
      } else {
        this.ears.push(makeLeaf([0, c[1], 0], [side, 0, 0], [0, 0, 1], 0.01, 0.001, 0.001, 0, 0));
      }
    }
  }

  private headK!: number;
  private pivotY = 0;

  /** Evaluates a head-space field at the scaled position. */
  private scaled(hair: boolean, x: number, y: number, z: number) {
    // The base constructor may sample before our fields are initialised.
    const k = this.headK ?? 1;
    const p = this.pivotY ?? 0;
    const qx = x / k, qy = p + (y - p) / k, qz = z / k;
    return (hair ? this.rawHair(qx, qy, qz) : this.rawHead(qx, qy, qz)) * k;
  }

  protected headField(x: number, y: number, z: number) {
    return this.scaled(false, x, y, z);
  }

  protected crownField(x: number, y: number, z: number) {
    return this.scaled(true, x, y, z);
  }

  private rawHead(x: number, y: number, z: number) {
    const d = this.def ?? FIGURES.lady;
    const e = (q: { c: V3; r: V3 }) => sdEllipsoid(x - q.c[0], y - q.c[1], z - q.c[2], q.r[0], q.r[1], q.r[2]);
    let h = e(d.cranium);
    h = smin(h, e(d.jaw), 0.12);
    h = smin(h, e(d.chin), 0.08);
    h = smin(h, e(d.nose), 0.03);
    // Soft nose bridge and cheekbones: the planes that make a face read as a face.
    const n = d.nose.c;
    h = smin(h, sdRoundCone(x, y, z, 0, n[1] + 0.085, n[2] - 0.035, n[0], n[1] + 0.01, n[2] - 0.004, 0.012, 0.019), 0.035);
    const ax = Math.abs(x);
    h = smin(h, sdEllipsoid(ax - d.jaw.r[0] * 0.58, y - (n[1] - 0.005), z - d.jaw.c[2] - d.jaw.r[2] * 0.6, 0.075, 0.048, 0.07), 0.05);
    return h;
  }

  /** Hair: a single sculpted volume with the face opening carved out. */
  private rawHair(x: number, y: number, z: number) {
    const d = this.def;
    if (!d) return 1e3;
    const c = d.head.c;
    if (this.figure === 'lady') {
      // Straight, chin-length bob: a smooth cap on top falling into straight
      // sides, parted on one side and swept across the forehead.
      let h = sdEllipsoid(x, y - (c[1] + 0.09), z + 0.02, 0.295, 0.32, 0.3);
      h = smin(h, sdRoundCone(x, y, z, 0, c[1] + 0.06, -0.03, 0, c[1] - 0.16, -0.045, 0.305, 0.322), 0.06);
      // Blunt cut just below the chin, the ends tipping in slightly.
      h = smax(h, c[1] - 0.25 - y + 0.03 * Math.max(0, z), 0.025);
      // Face opening; its top drops toward the swept side (+x).
      const fy = y - (c[1] - 0.05) + 0.12 * Math.max(0, x + 0.04);
      h = smax(h, -sdEllipsoid(x - 0.005, fy, z - 0.25, 0.212, 0.265, 0.2), 0.03);
      // Ends flick outward a little.
      h = smin(h, sdEllipsoid(x, y - (c[1] - 0.215), z + 0.05, 0.338, 0.04, 0.3), 0.04);
      h = smax(h, c[1] - 0.25 - y, 0.02);
      h = smax(h, -sdEllipsoid(x - 0.005, fy, z - 0.25, 0.212, 0.265, 0.2), 0.03);
      // Soft strand clumps running down the length (stronger toward the ends).
      const ang = Math.atan2(x, z + 0.03);
      h += 0.0022 * Math.sin(ang * 34 + 0.6 * Math.sin(y * 9)) * sstep(c[1] + 0.25, c[1] - 0.1, y);
      return h;
    }
    if (this.figure === 'noor') {
      // Curls pulled back from the face into a big high puff.
      let h = sdEllipsoid(x, y - (c[1] + 0.04), z + 0.025, 0.295, 0.3, 0.295);
      const fy = y - (c[1] - 0.07);
      h = smax(h, -sdEllipsoid(x, fy, z - 0.24, 0.235, 0.31, 0.215), 0.03);
      h = smax(h, c[1] - 0.12 - y - 0.1 * Math.max(0, -z), 0.04);
      // The puff: a round ball sitting on a short gathered base.
      h = smin(h, sdEllipsoid(x, y - (c[1] + 0.43), z + 0.09, 0.2, 0.18, 0.19), 0.035);
      // Curl texture: two interfering octaves of soft bumps.
      const n1 = Math.sin(x * 58) * Math.sin(y * 58 + 1.3) * Math.sin(z * 58 + 2.1);
      const n2 = Math.sin(x * 97 + 0.7) * Math.sin(y * 91 + 2.4) * Math.sin(z * 103 + 0.2);
      return h - 0.009 * n1 - 0.0045 * n2;
    }
    // Short crop, sculpted at the old head size (rx 0.45) and scaled to fit.
    const k = d.head.rx / 0.45;
    // Lifted a touch so the hairline clears the brows.
    return this.crop((x - c[0]) / k, c[1] + (y - c[1] - 0.045) / k, (z - c[2]) / k, c) * k;
  }

  private crop(x: number, y: number, z: number, c: V3) {
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
    let leg = sdRoundCone(ax, y, z, L.top[0], L.top[1], L.top[2], L.bottom[0], L.bottom[1], L.bottom[2], L.r1, L.r2);
    // Fabric: long soft folds down the trouser legs, gathering toward the hem.
    const t = sstep(L.top[1], L.bottom[1], y);
    const lx = L.top[0] + (L.bottom[0] - L.top[0]) * t;
    const fa = Math.atan2(z - L.top[2], ax - lx);
    leg += d.folds * Math.sin(fa * 5 + y * 2.2 + Math.sin(fa * 3) * 0.8) * sstep(d.waistY - 0.05, d.waistY - 0.35, y);
    b = smin(b, leg, 0.06);
    // The tee blouses softly over the waistband.
    b = smin(b, sdEllipsoid(x, y - (d.waistY + 0.045), z - d.waist.c[2], d.waist.r[0] * 1.02, 0.055, d.waist.r[2] * 1.06), 0.03);
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
    // Loose sleeve rides with the upper arm.
    a = smin(a, this.sleeveField(x, y, z, side), 0.04);
    return smin(a, this.handField(x, y, z, i), 0.018);
  }

  /**
   * A relaxed hand: palm, four slightly curled fingers of different lengths
   * and a thumb, modelled in the hand's own frame (down the forearm, palm
   * facing the body).
   */
  private handField(x: number, y: number, z: number, i: 0 | 1) {
    const d = this.def;
    const k = d.handScale;
    const el = this.elbows[i], h = this.hands[i];
    const side = Math.sign(h[0]);
    // Frame: u down the forearm, w toward the palm side (the body), v forward.
    let ux = h[0] - el[0], uy = h[1] - el[1], uz = h[2] - el[2];
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul; uy /= ul; uz /= ul;
    let wx = -side - ux * (-side * ux), wy = -uy * (-side * ux), wz = -uz * (-side * ux);
    const wl = Math.hypot(wx, wy, wz);
    wx /= wl; wy /= wl; wz /= wl;
    let vx = uy * wz - uz * wy, vy = uz * wx - ux * wz, vz = ux * wy - uy * wx;
    if (vz < 0) { vx = -vx; vy = -vy; vz = -vz; }
    const px = x - h[0], py = y - h[1], pz = z - h[2];
    const u = (px * ux + py * uy + pz * uz) / k;
    const v = (px * vx + py * vy + pz * vz) / k;
    const w = (px * wx + py * wy + pz * wz) / k;
    // Palm and back of the hand.
    let d0 = sdEllipsoid(u - 0.045, v, w, 0.054, 0.044, 0.021);
    // Fingers: index (front) to little finger (back), gently curled toward the palm.
    const fingers: [number, number, number][] = [[0.025, 0.047, 0.0148], [0.0085, 0.052, 0.0152], [-0.0085, 0.049, 0.0148], [-0.024, 0.04, 0.0135]];
    for (const [fv, len, r] of fingers) {
      const u0 = 0.082, mid = u0 + len * 0.55;
      const seg1 = sdRoundCone(u, v, w, u0, fv, 0, mid, fv * 1.05, 0.006, r, r * 0.95);
      const seg2 = sdRoundCone(u, v, w, mid, fv * 1.05, 0.006, u0 + len, fv * 1.08, 0.02, r * 0.95, r * 0.86);
      d0 = smin(d0, Math.min(seg1, seg2), 0.016);
    }
    // Thumb: from the heel of the palm, forward and down, resting against the index.
    const thumb = Math.min(
      sdRoundCone(u, v, w, 0.025, 0.03, 0.01, 0.065, 0.05, 0.02, 0.016, 0.0135),
      sdRoundCone(u, v, w, 0.065, 0.05, 0.02, 0.095, 0.052, 0.03, 0.0135, 0.0115),
    );
    d0 = smin(d0, thumb, 0.014);
    return d0 * k;
  }

  armRadiusAt(_arm: 0 | 1, t: number) {
    const r = this.def.arm.r;
    return r[1] + (r[2] - r[1]) * t;
  }

  private sleeveField(x: number, y: number, z: number, side: number) {
    const s = this.def.sleeve;
    return sdRoundCone(x * side, y, z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r1, s.r2);
  }


  regions(x: number, y: number, z: number, w: Float32Array, out: Float32Array) {
    const d = this.def;
    // Arm skin inside (or on) the sleeve is shirt; above the sleeve end too,
    // so the shoulder never shows skin.
    const sl = d.sleeve;
    const sleeve = Math.max(1 - sstep(0.004, 0.014, this.sleeveField(x, y, z, x >= 0 ? 1 : -1)), sstep(sl.b[1] + 0.02, sl.b[1] + 0.06, y));
    const body = w[PART.body];
    const arm = w[PART.armL] + w[PART.armR];
    // Crisp hairline: the blend weight is soft, the colour edge should not be.
    out[0] = sstep(0.3, 0.7, w[PART.crown]);
    out[1] = body * sstep(d.waistY - 0.02, d.waistY + 0.02, y) * (1 - sstep(d.neckline - 0.02, d.neckline + 0.02, y)) + arm * sleeve;
    out[2] = body * (1 - sstep(d.waistY - 0.02, d.waistY + 0.02, y)) * sstep(d.hemY - 0.02, d.hemY + 0.01, y);
    out[3] = body * (1 - sstep(d.hemY - 0.02, d.hemY + 0.01, y));
    return true;
  }

  protected computeBounds() {
    const d = this.def;
    if (!d) return super.computeBounds();
    super.computeBounds();
    const c = this.head.c;
    this.partBounds[PART.body] = [0, d.neckline / 2, 0, d.neckline / 2 + 0.2];
    this.partBounds[PART.head] = [c[0], c[1], c[2], this.head.ry * 1.25];
    this.partBounds[PART.crown] = [0, c[1] + 0.1, -0.02, this.head.ry * 2];
    for (const i of [0, 1] as const) {
      const s = this.shoulders[i], h = this.hands[i];
      this.partBounds[PART.armL + i] = [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2, 0.03, 0.42];
    }
  }

  bounds(): { min: V3; max: V3 } {
    return { min: [-0.72, -0.03, -0.6], max: [0.72, 3.62, 0.62] };
  }
}
