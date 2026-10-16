/**
 * Signed distance primitives and blending operators (scalar form, allocation
 * free) used to sculpt Oru's body as one continuous organic surface.
 */

export type V3 = [number, number, number];

export function sdEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number) {
  const ax = px / rx, ay = py / ry, az = pz / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  if (k1 < 1e-9) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

export function sdSphere(px: number, py: number, pz: number, r: number) {
  return Math.sqrt(px * px + py * py + pz * pz) - r;
}

/** Capsule with different radii at each end (Inigo Quilez' round cone). */
export function sdRoundCone(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

/** Polynomial smooth minimum: a soft "clay" union of two shapes. */
export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth maximum, used for soft subtraction (eye sockets). */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

export const normalize = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * An oriented ellipsoid expressed in its own frame (u = long axis, w = width,
 * n = thickness). Used for leaf-like ear fins and petals.
 */
export interface Leaf {
  root: V3;
  u: V3;
  w: V3;
  n: V3;
  length: number;
  width: number;
  thickness: number;
  /** 0..1 how much the far end narrows */
  taper: number;
  /** Curl of the leaf toward n along its length */
  curl: number;
}

export function makeLeaf(root: V3, dir: V3, faceHint: V3, length: number, width: number, thickness: number, taper = 0.35, curl = 0): Leaf {
  const u = normalize(dir);
  const hintDot = dot(faceHint, u);
  const n = normalize([faceHint[0] - u[0] * hintDot, faceHint[1] - u[1] * hintDot, faceHint[2] - u[2] * hintDot]);
  const w = cross(n, u);
  return { root, u, w, n, length, width, thickness, taper, curl };
}

export function sdLeaf(px: number, py: number, pz: number, L: Leaf) {
  const dx = px - L.root[0], dy = py - L.root[1], dz = pz - L.root[2];
  const lu = dx * L.u[0] + dy * L.u[1] + dz * L.u[2];
  const lw = dx * L.w[0] + dy * L.w[1] + dz * L.w[2];
  let ln = dx * L.n[0] + dy * L.n[1] + dz * L.n[2];
  const half = L.length * 0.5;
  const t = Math.min(1, Math.max(0, lu / L.length));
  // Bend the leaf by offsetting its thin axis quadratically along its length.
  ln -= L.curl * t * t * L.length;
  // Narrow the tip end so the silhouette reads as a leaf, not an egg.
  const widthScale = 1 - L.taper * t * t;
  return sdEllipsoid(lu - half, lw / widthScale, ln, half, L.width, L.thickness) * Math.min(1, widthScale);
}

/** Smooth step helper used for masks. */
export const sstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
