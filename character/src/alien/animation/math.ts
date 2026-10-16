/** Small numeric helpers shared by the animation system. */

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Deterministic seeded PRNG (mulberry32) so idle behaviour is varied but reproducible. */
export function createRandom(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise in [-1, 1]. Layered sines would look periodic; this does not. */
const PERM = (() => {
  const rnd = createRandom(1337);
  const p = new Float32Array(256);
  for (let i = 0; i < 256; i++) p[i] = rnd() * 2 - 1;
  return p;
})();
export function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return lerp(PERM[i & 255], PERM[(i + 1) & 255], u);
}
/** Two-octave fractal noise, still roughly in [-1, 1]. */
export const fbm1 = (x: number) => noise1(x) * 0.68 + noise1(x * 2.13 + 17.1) * 0.32;
