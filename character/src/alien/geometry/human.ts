import { Anatomy, type AnatomySpec, type Bangle, type FaceLayout, type HeadDef, PART, type RestPose } from './anatomy';
import { type V3, makeLeaf, sdEllipsoid, sdRoundCone, smax, smin, sstep } from './sdf';
import type { HairStyle, Outfit } from '../types';

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
  /** bare legs under shorts, leggings and skirts */
  legs: { x: number; thighR: number; kneeY: number; kneeR: number; ankleR: number; calfR: number };
}

interface Tube { top: V3; bottom: V3; r1: number; r2: number }

/** What a figure wears: clothing volumes and where each colour region starts and ends. */
interface OutfitDef {
  sleeve: { a: V3; b: V3; r1: number; r2: number } | null;
  /** loose trouser legs (hide the legs) */
  trousers: Tube | null;
  shorts: Tube | null;
  /** one cone around both legs (x of top and bottom is 0) */
  skirt: Tube | null;
  bareLegs: boolean;
  /** thickness of tight leggings over the legs */
  leggings: number;
  /** torso width factor: fitted tops are slimmer than a boxy tee */
  fit: number;
  shoe: { c: V3; r: V3 };
  /** trainers (sole, toe box, heel collar) instead of a simple flat shoe */
  sneaker?: boolean;
  shirtTop: number;
  /** shoulder straps: [inner x, outer x, top y] */
  strap: [number, number, number] | null;
  shirtBottom: number;
  pantsTop: number;
  pantsBottom: number;
  shoeTop: number;
  folds: number;
  blouse: boolean;
  bangles: Bangle[];
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
    nose: { c: [0, 2.825, 0.248], r: [0.016, 0.02, 0.019] },
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
    legs: { x: 0.13, thighR: 0.125, kneeY: 0.95, kneeR: 0.068, ankleR: 0.045, calfR: 0.074 },
    // Weight on one hip: left hand on the hip, right forearm raised and turned
    // palm-up in an open, presenting gesture, head tipped a little.
    restPose: { armLx: 0.14, armLz: 0.55, elbowLx: 0, elbowL: -1.26, armRx: -0.05, armRz: -0.24, armRy: -0.75, elbowRx: -1.3, elbowR: 0, elbowRy: -0.45, handRy: -1.1, headRz: 0.09 },
    face: { scale: 0.36, eyeSpread: 0.112, eyeLift: 0.02, browOffset: 0.1, mouthOffset: 0.168, blush: { dx: 0.135, dy: -0.06, rx: 0.04, ry: 0.024 }, liner: 1, lidRest: 0.97, pupilBase: 0.34, mouthScale: 0.8, eyeStyle: 'flat', irisLift: 0.03, eyeAspect: 0.95, eyeSize: 1.18, browSize: 1.35, lipWeight: 0.7, freckles: 0.6 },
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
    nose: { c: [0, 2.845, 0.258], r: [0.022, 0.027, 0.025] },
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
    legs: { x: 0.15, thighR: 0.14, kneeY: 0.95, kneeR: 0.08, ankleR: 0.055, calfR: 0.088 },
    restPose: { armLx: -0.04, armLz: -0.07, elbowLx: -0.24, elbowL: 0.04, armRx: -0.04, armRz: 0.07, elbowRx: -0.24, elbowR: -0.04 },
    face: { scale: 0.36, eyeSpread: 0.112, eyeLift: 0.02, browOffset: 0.098, mouthOffset: 0.165, blush: { dx: 0.14, dy: -0.06, rx: 0.04, ry: 0.024 }, liner: 0.6, lidRest: 0.97, pupilBase: 0.34, eyeStyle: 'flat', irisLift: 0.03, eyeAspect: 0.95, eyeSize: 1.12, browSize: 1.3, lipWeight: 0.75 },
    bangles: [],
  },
  // A rounder face and fuller figure: curly hair gathered into a high puff,
  // a short-sleeved tee and wide, straight trousers. Hands loosely clasped.
  noor: {
    head: { c: [0, 2.84, 0], rx: 0.285, ry: 0.32, depth: 0.27, round: 0.12, bulge: 0, backBulge: 0, squircle: 2 },
    cranium: { c: [0, 2.9, -0.02], r: [0.27, 0.28, 0.275] },
    jaw: { c: [0, 2.78, 0.02], r: [0.255, 0.2, 0.235] },
    chin: { c: [0, 2.655, 0.07], r: [0.095, 0.065, 0.085] },
    nose: { c: [0, 2.805, 0.252], r: [0.021, 0.024, 0.022] },
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
    legs: { x: 0.16, thighR: 0.155, kneeY: 0.95, kneeR: 0.085, ankleR: 0.055, calfR: 0.092 },
    restPose: { armLx: -0.1, armLz: -0.05, elbowLx: -1.05, elbowL: -1.0, armRx: -0.1, armRz: 0.05, elbowRx: -1.05, elbowR: 1.0, headRz: -0.05 },
    face: { scale: 0.38, eyeSpread: 0.116, eyeLift: 0.02, browOffset: 0.1, mouthOffset: 0.16, blush: { dx: 0.15, dy: -0.06, rx: 0.045, ry: 0.026 }, liner: 1, lidRest: 0.97, pupilBase: 0.34, mouthScale: 0.85, eyeStyle: 'flat', irisLift: 0.03, eyeAspect: 0.95, eyeSize: 1.16, browSize: 1.3, lipWeight: 0.75 },
    bangles: [],
  },
};

const DEFAULT_HAIR: Record<Figure, HairStyle> = { lady: 'bob', man: 'crop', noor: 'puff' };

/** Builds the clothing for a figure. The man has no dress; he gets his casual clothes. */
function outfitFor(fig: Figure, outfit: Outfit, d: FigureDef): OutfitDef {
  const L = d.legs;
  const casual: OutfitDef = {
    sleeve: d.sleeve, trousers: d.leg, shorts: null, skirt: null, bareLegs: false, leggings: 0, fit: 1, shoe: d.shoe,
    shirtTop: d.neckline, strap: null, shirtBottom: d.waistY, pantsTop: d.waistY, pantsBottom: d.hemY, shoeTop: d.hemY,
    folds: d.folds, blouse: true, bangles: d.bangles,
  };
  if (outfit === 'casual' || (outfit === 'dress' && fig === 'man')) return casual;
  const sneaker = { c: [L.x * 0.98, 0.075, 0.06] as V3, r: [0.095, 0.08, 0.18] as V3 };
  const base: OutfitDef = { ...casual, sleeve: null, trousers: null, bareLegs: true, blouse: false, shoe: sneaker, sneaker: true, shoeTop: 0.15, folds: 0 };
  if (outfit === 'workout') {
    if (fig === 'man') {
      // Gym: a vest with wide straps, loose shorts to just above the knee, trainers.
      return {
        ...base, fit: 0.95, shorts: { top: [L.x, 1.74, 0], bottom: [L.x + 0.015, 1.12, 0.01], r1: 0.185, r2: 0.165 },
        shirtTop: d.neckline - 0.03, strap: [0.1, 0.25, 2.75], shirtBottom: 1.8, pantsTop: 1.82, pantsBottom: 1.06, folds: 0.004, bangles: [],
        // White crew socks above the trainers.
        shoeTop: 0.3,
      };
    }
    if (fig === 'noor') {
      // A boxy cropped tee with wide half sleeves over high-waisted leggings.
      return {
        ...base, sleeve: d.sleeve, fit: 1, leggings: 0.007, shirtTop: d.neckline, strap: null, shirtBottom: 1.96,
        pantsTop: 1.92, pantsBottom: 0.2, bangles: [{ arm: 0, t: 0.9, color: '#2b2c36', tube: 0.017 }],
      };
    }
    // Studio: a sports top with a bare midriff, high-waisted leggings, trainers and a fitness band.
    const lady = fig === 'lady';
    return {
      ...base, fit: lady ? 0.9 : 0.95, leggings: 0.007,
      shirtTop: d.neckline - (lady ? 0.06 : 0.03), strap: lady ? [0.09, 0.17, 2.75] : [0.11, 0.22, 2.75],
      shirtBottom: lady ? 2.15 : 1.98, pantsTop: lady ? 1.98 : 1.9, pantsBottom: lady ? 0.2 : 0.42,
      bangles: [{ arm: 0, t: 0.9, color: '#2b2c36', tube: 0.017 }],
    };
  }
  // Sundress: fitted strappy bodice, an A-line skirt to the knee, flat sandals.
  return {
    ...base, fit: 0.92, skirt: { top: [0, d.waistY + 0.02, 0], bottom: [0, 0.95, 0.02], r1: d.waist.r[0] * 0.86, r2: fig === 'noor' ? 0.42 : 0.37 },
    shirtTop: d.neckline - 0.05, strap: [0.09, 0.17, 2.75], shirtBottom: 0.93, pantsTop: -1, pantsBottom: -1,
    shoe: { c: [L.x, 0.04, 0.06], r: [0.072, 0.042, 0.135] }, sneaker: false, shoeTop: 0.09, folds: 0.006, bangles: d.bangles,
  };
}

/** Model-space height of each figure's head centre (after head scaling), for camera framing. */
export function humanHeadY(figure: Figure) {
  const d = FIGURES[figure];
  const pivot = d.neck.b[1] - 0.1;
  return pivot + (d.head.c[1] - pivot) * (d.headScale ?? 1);
}

export class HumanAnatomy extends Anatomy {
  readonly figure: Figure;
  readonly def: FigureDef;
  hair!: HairStyle;
  outfit!: OutfitDef;

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
    this.hair = spec.hair ?? DEFAULT_HAIR[this.figure];
    this.outfit = outfitFor(this.figure, spec.outfit ?? 'casual', d);
    this.bangles = this.outfit.bangles;
    this.restPose = d.restPose;
    this.armSwing = 1.35;
    this.blushStrength = d.blush;
    const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];
    this.shoulders = [d.arm.shoulder, mirror(d.arm.shoulder)];
    this.elbows = [d.arm.elbow, mirror(d.arm.elbow)];
    this.hands = [d.arm.hand, mirror(d.arm.hand)];
    this.bellyCollider = { c: [0, (d.waistY + d.neckline) / 2, 0.02], r: [0.36, 0.6, 0.26] };
    this.footX = this.outfit.shoe.c[0];
    if (this.outfit.sneaker) this.footwear = { soleY: 0.036, sockY: this.outfit.shoeTop > 0.2 ? 0.15 : 99 };
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
    h = smin(h, sdRoundCone(x, y, z, 0, n[1] + 0.08, n[2] - 0.03, n[0], n[1] + 0.01, n[2] - 0.006, 0.008, 0.013), 0.03);
    const ax = Math.abs(x);
    h = smin(h, sdEllipsoid(ax - d.jaw.r[0] * 0.58, y - (n[1] - 0.005), z - d.jaw.c[2] - d.jaw.r[2] * 0.6, 0.075, 0.048, 0.07), 0.05);
    return h;
  }

  /** Hair: one of several sculpted styles, modelled for the lady's head and scaled to fit. */
  private rawHair(x: number, y: number, z: number) {
    const d = this.def;
    if (!d || !this.hair) return 1e3;
    const c = d.head.c[1];
    const k = d.cranium.r[0] / 0.255;
    // The skull (in hair units) lets caps sit a uniform thickness proud of the real head.
    const skull = this.rawHead(x, y, z) / k;
    return this.hairStyle(x / k, c + (y - c) / k, z / k, c, skull) * k;
  }

  private hairStyle(x: number, y: number, z: number, c: number, skull: number) {
    // A cap a uniform thickness proud of the head itself (never thin anywhere).
    const cap = (t: number) => skull - t;
    // Never let hair wrap the jaw or chin: clear everything low and in front.
    const clearJaw = (h: number) => smax(h, -Math.max(y - (c - 0.1), -0.05 - z), 0.03);
    // Shared cuts: the face opening and the nape line (higher at the sides than the back).
    const face = (top = 0.272, k = 0.025) => (h: number) => smax(h, -sdEllipsoid(x, y - (c - 0.05), z - 0.245, 0.222, top, 0.205), k);
    // The line rises from the nape to clear the ears at the sides, then on to the temples.
    const nape = (back: number, rise: number) => (h: number) => smax(h, c + back + rise * sstep(-0.24, -0.04, z) + 0.04 * sstep(0.05, 0.2, z) - y, 0.025);
    switch (this.hair) {
      case 'bob': {
        // Straight, chin-length bob: a smooth cap falling into straight sides,
        // parted on one side and swept across the forehead; the ends flick out.
        let h = sdEllipsoid(x, y - (c + 0.09), z + 0.02, 0.295, 0.32, 0.3);
        h = smin(h, sdRoundCone(x, y, z, 0, c + 0.06, -0.03, 0, c - 0.16, -0.045, 0.305, 0.322), 0.06);
        const fy = y - (c - 0.05) + 0.12 * Math.max(0, x + 0.04);
        const cut = -sdEllipsoid(x - 0.005, fy, z - 0.25, 0.212, 0.265, 0.2);
        h = smax(h, cut, 0.03);
        h = smin(h, sdEllipsoid(x, y - (c - 0.215), z + 0.05, 0.338, 0.04, 0.3), 0.04);
        h = smax(h, c - 0.25 - y, 0.02);
        h = smax(h, cut, 0.03);
        // Soft strand clumps running down the length (stronger toward the ends).
        const ang = Math.atan2(x, z + 0.03);
        // Big, chunky locks (drawn hair) rather than fine strands.
        h += 0.0055 * Math.sin(ang * 12 + 0.9 * Math.sin(y * 7)) * sstep(c + 0.22, c - 0.05, y);
        return h;
      }
      case 'lob': {
        // Shoulder-length, straight and sleek, covering the ears, the ends
        // tucking in a touch, with a side-swept fringe lock across one brow.
        let h = smin(cap(0.035), sdRoundCone(x, y, z, 0, c + 0.05, -0.045, 0, c - 0.36, -0.065, 0.3, 0.33), 0.06);
        h = smax(h, -sdEllipsoid(x, y - (c - 0.05), z - 0.25, 0.214, 0.29, 0.205), 0.03);
        h = smax(h, c - 0.42 - y + 0.04 * Math.max(0, z + 0.05), 0.025);
        h = smax(h, Math.abs(x) - (0.335 - 0.03 * sstep(c - 0.25, c - 0.42, y)), 0.03);
        h = smin(h, sdRoundCone(x, y, z, -0.07, c + 0.3, 0.19, 0.19, c + 0.115, 0.232, 0.052, 0.042), 0.045);
        h += 0.004 * Math.sin(Math.atan2(x, z + 0.04) * 10 + 0.8 * Math.sin(y * 6)) * sstep(c + 0.15, c - 0.1, y);
        return clearJaw(h);
      }
      case 'waves': {
        // Long, flowing waves: volume on top, a centre part, two big front
        // locks that sweep over the temples and flick out in wings, and broad
        // panels falling behind the shoulders to the chest.
        let h = smin(cap(0.03), sdEllipsoid(x, y - (c + 0.1), z + 0.02, 0.31, 0.3, 0.31), 0.05);
        h = smax(h, -sdEllipsoid(x, y - (c - 0.04), z - 0.25, 0.2, 0.25, 0.2), 0.03);
        h = clearJaw(h);
        // Back panel: a thick sheet draping behind the shoulders.
        const zz = (z + 0.3) / 0.38;
        let back = sdRoundCone(x, y, zz, 0, c - 0.02, 0, 0, c - 0.74, -0.05, 0.3, 0.37) * 0.38;
        back = smax(back, c - 0.82 - y, 0.04);
        back += 0.006 * Math.sin(x * 26 + 1.2 * Math.sin(y * 5)) * sstep(c - 0.1, c - 0.4, y);
        h = smin(h, back, 0.08);
        // Side falls behind the ears, onto the shoulders.
        const ax = Math.abs(x);
        h = smin(h, sdRoundCone(ax, y, z, 0.25, c - 0.02, -0.06, 0.34, c - 0.46, -0.12, 0.1, 0.12), 0.06);
        // Front wings, mirrored: from the part over the temple, flicking out.
        const wing = Math.min(
          sdRoundCone(ax, y, z, 0.03, c + 0.27, 0.2, 0.25, c + 0.11, 0.19, 0.07, 0.092),
          sdRoundCone(ax, y, z, 0.25, c + 0.11, 0.19, 0.37, c - 0.05, 0.08, 0.092, 0.07),
          sdRoundCone(ax, y, z, 0.37, c - 0.05, 0.08, 0.44, c - 0.03, 0.02, 0.07, 0.04),
        );
        h = smin(h, wing, 0.045);
        // A soft centre part.
        h = smax(h, -sdEllipsoid(x, y - (c + 0.33), z - 0.12, 0.012, 0.06, 0.16), 0.015);
        return h;
      }
      case 'ponytail': {
        // Sleek, combed back from the face into a high tie, with a full tail.
        let h = cap(0.018);
        h = face(0.29)(h);
        h = nape(-0.2, 0.25)(h);
        h -= 0.0022 * Math.sin(x * 95 + 0.6 * Math.sin(z * 7));
        const ty = c + 0.11, tz = -0.275;
        h = smin(h, sdEllipsoid(x, y - ty, z - tz, 0.056, 0.05, 0.042), 0.025);
        const p1y = c - 0.03, p1z = -0.39;
        let tail = Math.min(
          sdRoundCone(x, y, z, 0, ty - 0.01, tz - 0.03, 0, p1y, p1z, 0.048, 0.074),
          sdRoundCone(x, y, z, 0, p1y, p1z, 0.025, c - 0.3, -0.37, 0.074, 0.026),
        );
        tail -= 0.003 * Math.sin(Math.atan2(x, z + 0.38) * 14 + y * 4);
        return smin(h, tail, 0.03);
      }
      case 'crop': {
        // Short back and sides, a longer textured top swept up and to one side, sideburns.
        let h = cap(0.02);
        h = smin(h, sdEllipsoid(x + 0.02, y - (c + 0.25), z - 0.03, 0.215, 0.1, 0.235), 0.07);
        h = smin(h, sdEllipsoid(x + 0.05, y - (c + 0.245), z - 0.19, 0.15, 0.075, 0.085), 0.05);
        h = face(0.27, 0.035)(h);
        h = nape(-0.2, 0.25)(h);
        h = Math.min(h, sdEllipsoid(Math.abs(x) - 0.262, y - c, z - 0.1, 0.014, 0.055, 0.025));
        h -= 0.006 * sstep(c + 0.12, c + 0.3, y) * Math.sin(x * 48 + 0.8 * Math.sin(z * 9));
        return h;
      }
      case 'curls': {
        // Short tight curls with tidy sides.
        let h = smin(cap(0.03), sdEllipsoid(x, y - (c + 0.12), z + 0.0, 0.25, 0.25, 0.26), 0.05);
        h = face(0.27)(h);
        h = nape(-0.2, 0.25)(h);
        const n1 = Math.sin(x * 62) * Math.sin(y * 62 + 1.3) * Math.sin(z * 62 + 2.1);
        const n2 = Math.sin(x * 101 + 0.7) * Math.sin(y * 95 + 2.4) * Math.sin(z * 107 + 0.2);
        return h - 0.008 * n1 - 0.004 * n2;
      }
      case 'buzz': {
        // Close-cropped all over, following the skull.
        let h = cap(0.014);
        h = face(0.27, 0.015)(h);
        return nape(-0.2, 0.25)(h);
      }
      case 'puff':
      default: {
        // Curls pulled back from the face into a big high puff.
        let h = smin(cap(0.03), sdEllipsoid(x, y - (c + 0.06), z + 0.025, 0.28, 0.29, 0.28), 0.04);
        h = smax(h, -sdEllipsoid(x, y - (c - 0.07), z - 0.24, 0.235, 0.31, 0.215), 0.03);
        h = smax(h, c - 0.12 - y - 0.1 * Math.max(0, -z), 0.04);
        h = smin(h, sdEllipsoid(x, y - (c + 0.43), z + 0.09, 0.2, 0.18, 0.19), 0.035);
        const n1 = Math.sin(x * 58) * Math.sin(y * 58 + 1.3) * Math.sin(z * 58 + 2.1);
        const n2 = Math.sin(x * 97 + 0.7) * Math.sin(y * 91 + 2.4) * Math.sin(z * 103 + 0.2);
        return h - 0.009 * n1 - 0.0045 * n2;
      }
    }
  }

  protected bodyField(x: number, y: number, z: number) {
    const d = this.def ?? FIGURES.lady;
    const o = this.outfit;
    if (!o) return 1e3;
    const f = o.fit;
    const e = (q: { c: V3; r: V3 }, fx = 1) => sdEllipsoid(x - q.c[0], y - q.c[1], z - q.c[2], q.r[0] * fx, q.r[1], q.r[2] * fx);
    let b = e(d.chest, f);
    b = smin(b, e(d.waist, f), 0.14);
    b = smin(b, e(d.hips, o.trousers ? 1 : Math.max(f, 0.95)), 0.1);
    b = smin(b, sdRoundCone(x, y, z, d.neck.a[0], d.neck.a[1], d.neck.a[2], d.neck.b[0], d.neck.b[1], d.neck.b[2], d.neck.r, d.neck.r * 0.95), 0.05);
    const ax = Math.abs(x);
    if (o.trousers) {
      const L = o.trousers;
      let leg = sdRoundCone(ax, y, z, L.top[0], L.top[1], L.top[2], L.bottom[0], L.bottom[1], L.bottom[2], L.r1, L.r2);
      // Fabric: long soft folds down the trouser legs, gathering toward the hem.
      const t = sstep(L.top[1], L.bottom[1], y);
      const lx = L.top[0] + (L.bottom[0] - L.top[0]) * t;
      const fa = Math.atan2(z - L.top[2], ax - lx);
      leg += o.folds * Math.sin(fa * 5 + y * 2.2 + Math.sin(fa * 3) * 0.8) * sstep(d.waistY - 0.05, d.waistY - 0.35, y);
      b = smin(b, leg, 0.06);
    }
    if (o.bareLegs) b = smin(b, this.legField(ax, y, z) - o.leggings, 0.06);
    if (o.shorts) {
      const S = o.shorts;
      let sh = sdRoundCone(ax, y, z, S.top[0], S.top[1], S.top[2], S.bottom[0], S.bottom[1], S.bottom[2], S.r1, S.r2);
      sh += o.folds * Math.sin(Math.atan2(z, ax - S.top[0]) * 5 + y * 3);
      b = smin(b, sh, 0.04);
    }
    if (o.skirt) {
      // A soft A-line skirt, slightly oval, with loose folds toward the hem.
      const S = o.skirt;
      const zz = z / 0.82;
      let sk = sdRoundCone(x, y, zz, 0, S.top[1], S.top[2], 0, S.bottom[1], S.bottom[2], S.r1, S.r2) * 0.82;
      sk += o.folds * Math.sin(Math.atan2(zz, x) * 9 + y * 1.5) * sstep(S.top[1], S.bottom[1], y);
      // A clean, flat hem (the cone's round cap would read as a bulb).
      sk = smax(sk, S.bottom[1] - y, 0.012);
      b = smin(b, sk, 0.03);
    }
    const s = o.shoe;
    b = smin(b, o.sneaker ? this.sneakerField(ax, y, z, s) : sdEllipsoid(ax - s.c[0], y - s.c[1], z - s.c[2], s.r[0], s.r[1], s.r[2]), 0.04);
    // A loose tee blouses softly over the waistband.
    if (o.blouse) b = smin(b, sdEllipsoid(x, y - (d.waistY + 0.045), z - d.waist.c[2], d.waist.r[0] * 1.02, 0.055, d.waist.r[2] * 1.06), 0.03);
    return Math.max(b, -y);
  }

  /** A trainer: a flat sole with a slight lip, a rounded toe box and a raised heel collar. */
  private sneakerField(ax: number, y: number, z: number, s: { c: V3; r: V3 }) {
    const x = ax - s.c[0], zz = z - s.c[2];
    const w = s.r[0], len = s.r[2];
    let d = sdEllipsoid(x, y - 0.03, zz, w * 1.06, 0.032, len * 1.03);
    d = smin(d, sdEllipsoid(x, y - 0.062, zz + len * 0.08, w, 0.06, len * 0.86), 0.025);
    d = smin(d, sdEllipsoid(x, y - 0.048, zz - len * 0.5, w * 0.94, 0.042, len * 0.48), 0.02);
    d = smin(d, sdEllipsoid(x, y - 0.1, zz + len * 0.55, w * 0.88, 0.055, len * 0.32), 0.02);
    return Math.max(d, -y);
  }

  /** Anatomical legs (for shorts, leggings and skirts): thigh, knee, calf and ankle. */
  private legField(ax: number, y: number, z: number) {
    const L = this.def.legs;
    let l = sdRoundCone(ax, y, z, L.x, 1.72, 0, L.x * 0.96, L.kneeY, 0.012, L.thighR, L.kneeR);
    l = smin(l, sdRoundCone(ax, y, z, L.x * 0.96, L.kneeY, 0.012, L.x * 0.93, 0.17, 0, L.kneeR, L.ankleR), 0.04);
    l = smin(l, sdEllipsoid(ax - L.x * 0.95, y - (L.kneeY - 0.3), z + 0.02, L.calfR, 0.22, L.calfR * 1.05), 0.08);
    return smin(l, sdEllipsoid(ax - L.x * 0.93, y - 0.06, z - 0.05, 0.055, 0.05, 0.12), 0.05);
  }

  protected armField(x: number, y: number, z: number, i: 0 | 1) {
    const d = this.def ?? FIGURES.lady;
    const s = this.shoulders[i], el = this.elbows[i], h = this.hands[i];
    const [r0, r1, r2] = d.arm.r;
    const side = Math.sign(s[0]);
    let a = sdRoundCone(x, y, z, s[0], s[1], s[2], el[0], el[1], el[2], r0, r1);
    a = smin(a, sdRoundCone(x, y, z, el[0], el[1], el[2], h[0], h[1], h[2], r1, r2), 0.025);
    // Loose sleeve rides with the upper arm.
    if (this.outfit?.sleeve) a = smin(a, this.sleeveField(x, y, z, side), 0.04);
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
    // Long, slender and slightly apart, like a drawn hand.
    const fingers: [number, number, number][] = [[0.028, 0.06, 0.0136], [0.0095, 0.066, 0.014], [-0.0095, 0.062, 0.0136], [-0.027, 0.05, 0.0124]];
    for (const [fv, len, r] of fingers) {
      const u0 = 0.082, mid = u0 + len * 0.55;
      const seg1 = sdRoundCone(u, v, w, u0, fv, 0, mid, fv * 1.05, 0.006, r, r * 0.95);
      const seg2 = sdRoundCone(u, v, w, mid, fv * 1.05, 0.006, u0 + len, fv * 1.08, 0.02, r * 0.95, r * 0.86);
      d0 = smin(d0, Math.min(seg1, seg2), 0.011);
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
    const s = this.outfit.sleeve ?? this.def.sleeve;
    return sdRoundCone(x * side, y, z, s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.r1, s.r2);
  }


  /** The head casts a soft shadow onto the neck, just under the jaw. */
  castShade(x: number, y: number, z: number) {
    const chin = this.head.c[1] - this.head.ry * 0.78;
    if (y > chin + 0.03 || Math.abs(x) > 0.16) return 1;
    const d = sstep(chin + 0.03, chin - 0.02, y) * (1 - sstep(chin - 0.12, chin - 0.2, y)) * sstep(-0.08, 0.02, z);
    return 1 - 0.5 * d;
  }

  regions(x: number, y: number, z: number, w: Float32Array, out: Float32Array) {
    const o = this.outfit;
    const ax = Math.abs(x);
    const body = w[PART.body];
    const arm = w[PART.armL] + w[PART.armR];
    // Hair wherever the hair surface is the outermost one: exact and crisp even
    // for thin styles, where the soft skinning weights would blur into skin.
    out[0] = w[PART.body] + arm > 0.6 ? 0 : 1 - sstep(-0.007, 0.007, this.crownField(x, y, z) - this.headField(x, y, z) + 0.006);
    // Top: below the neckline (plus straps over the shoulders) and above its hem.
    let upper = 1 - sstep(o.shirtTop - 0.02, o.shirtTop + 0.02, y);
    if (o.strap) {
      const [s0, s1, s2] = o.strap;
      upper = Math.max(upper, sstep(s0 - 0.012, s0 + 0.012, ax) * (1 - sstep(s1 - 0.012, s1 + 0.012, ax)) * (1 - sstep(s2 - 0.02, s2 + 0.02, y)));
    }
    out[1] = body * sstep(o.shirtBottom - 0.02, o.shirtBottom + 0.02, y) * upper;
    if (o.sleeve) {
      // Arm skin inside (or on) the sleeve is shirt; above the sleeve end too,
      // so the shoulder never shows skin.
      const sl = o.sleeve;
      out[1] += arm * Math.max(1 - sstep(0.004, 0.014, this.sleeveField(x, y, z, x >= 0 ? 1 : -1)), sstep(sl.b[1] + 0.02, sl.b[1] + 0.06, y));
    }
    out[2] = o.pantsTop > 0 ? body * (1 - sstep(o.pantsTop - 0.02, o.pantsTop + 0.02, y)) * sstep(o.pantsBottom - 0.02, o.pantsBottom + 0.01, y) : 0;
    out[3] = body * (1 - sstep(o.shoeTop - 0.02, o.shoeTop + 0.01, y));
    return true;
  }

  protected computeBounds() {
    const d = this.def;
    if (!d) return super.computeBounds();
    super.computeBounds();
    const c = this.head.c;
    this.partBounds[PART.body] = [0, d.neckline / 2, 0, d.neckline / 2 + 0.2];
    this.partBounds[PART.head] = [c[0], c[1], c[2], this.head.ry * 1.25];
    this.partBounds[PART.crown] = [0, c[1] - 0.1, -0.05, this.head.ry * 3.4];
    for (const i of [0, 1] as const) {
      const s = this.shoulders[i], h = this.hands[i];
      this.partBounds[PART.armL + i] = [(s[0] + h[0]) / 2, (s[1] + h[1]) / 2, 0.03, 0.42];
    }
  }

  bounds(): { min: V3; max: V3 } {
    return { min: [-0.72, -0.03, -0.6], max: [0.72, 3.62, 0.62] };
  }
}
