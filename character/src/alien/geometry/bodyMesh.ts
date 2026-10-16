import { Anatomy, type AnatomySpec, BONE, LOBE_BONE_BASE, MAX_LOBES, PART, PART_COUNT } from './anatomy';
import { sstep } from './sdf';
import { extractSurface } from './surfaceNets';

/** Plain-array output so it can cross a worker boundary with zero copies. */
export interface BodyMeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /** x: jaw region, y: tip gradient, z: blush signed field, w: vertical gradient */
  masks: Float32Array;
  ao: Float32Array;
}

/** Cell size (scene units) per quality tier. */
export const CELL_SIZE = { high: 0.0145, balanced: 0.018, low: 0.025 } as const;

/**
 * Builds the sculpted body: extracts the surface, then bakes skinning
 * weights (by proximity to each anatomical part), colour masks and ambient
 * occlusion straight from the distance field.
 */
export function buildBodyMesh(spec: AnatomySpec, cell: number): BodyMeshData {
  const anatomy = new Anatomy(spec);
  const { min, max } = anatomy.bounds();
  const { positions, normals, indices } = extractSurface(anatomy.sdf, min, max, cell);
  const count = positions.length / 3;

  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const masks = new Float32Array(count * 4);
  const ao = new Float32Array(count);

  const parts = new Float32Array(PART_COUNT);
  const w = new Float32Array(PART_COUNT);
  const boneCount = LOBE_BONE_BASE + MAX_LOBES;
  const bw = new Float32Array(boneCount);
  const order = Array.from({ length: boneCount }, (_, i) => i);
  const lobes = anatomy.lobes.slice(0, MAX_LOBES);
  const lobeW = new Float32Array(lobes.length);
  const softness = [0.04, 0.04, 0.025, 0.025, 0.03, 0.03, 0.035];
  const h = anatomy.head;
  const blushC = [1, -1].map((s) => [h.c[0] + 0.4 * s, h.c[1] - 0.1]);

  for (let v = 0; v < count; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    anatomy.parts(x, y, z, parts);

    // --- Skin weights ------------------------------------------------------
    let dmin = Infinity;
    for (let i = 0; i < PART_COUNT; i++) dmin = Math.min(dmin, parts[i]);
    let total = 0;
    for (let i = 0; i < PART_COUNT; i++) {
      w[i] = Math.exp(-(parts[i] - dmin) / softness[i]);
      total += w[i];
    }
    for (let i = 0; i < PART_COUNT; i++) w[i] /= total;
    bw.fill(0);
    bw[BONE.hips] = w[PART.body];
    bw[BONE.head] = w[PART.head];
    bw[BONE.earL] = w[PART.earL];
    bw[BONE.earR] = w[PART.earR];
    // Crown: split between the crown root (near the head) and each lobe's own bone.
    if (lobes.length && w[PART.crown] > 1e-4) {
      let lmin = Infinity;
      const ld = lobeW;
      for (let i = 0; i < lobes.length; i++) {
        const l = lobes[i];
        const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], dz = l.b[2] - l.a[2];
        const len2 = dx * dx + dy * dy + dz * dz;
        const t = Math.min(1, Math.max(0, ((x - l.a[0]) * dx + (y - l.a[1]) * dy + (z - l.a[2]) * dz) / len2));
        const d = Math.hypot(x - (l.a[0] + dx * t), y - (l.a[1] + dy * t), z - (l.a[2] + dz * t)) - (l.r1 + (l.r2 - l.r1) * t);
        ld[i] = d;
        lmin = Math.min(lmin, d);
      }
      let lt = 0;
      for (let i = 0; i < lobes.length; i++) {
        ld[i] = Math.exp(-(ld[i] - lmin) / 0.03);
        lt += ld[i];
      }
      // Near the head the crown root holds the lobe; further out the lobe bone takes over.
      for (let i = 0; i < lobes.length; i++) {
        const l = lobes[i];
        const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], dz = l.b[2] - l.a[2];
        const t = ((x - l.a[0]) * dx + (y - l.a[1]) * dy + (z - l.a[2]) * dz) / (dx * dx + dy * dy + dz * dz);
        const own = sstep(-0.25, 0.35, t);
        const share = (ld[i] / lt) * w[PART.crown];
        bw[LOBE_BONE_BASE + i] = share * own;
        bw[BONE.crown] += share * (1 - own);
      }
    } else bw[BONE.crown] = w[PART.crown];
    // Split each arm between upper arm and forearm around the elbow.
    for (const [part, upper, fore, i] of [[PART.armL, BONE.armL, BONE.foreL, 0], [PART.armR, BONE.armR, BONE.foreR, 1]] as const) {
      const s = anatomy.shoulders[i], e = anatomy.elbows[i];
      const dx = e[0] - s[0], dy = e[1] - s[1], dz = e[2] - s[2];
      const len = Math.hypot(dx, dy, dz);
      const t = ((x - e[0]) * dx + (y - e[1]) * dy + (z - e[2]) * dz) / len;
      const f = sstep(-0.07, 0.07, t);
      bw[upper] = w[part] * (1 - f);
      bw[fore] = w[part] * f;
    }
    order.sort((a, b) => bw[b] - bw[a]);
    let top = 0;
    for (let j = 0; j < 4; j++) top += bw[order[j]];
    for (let j = 0; j < 4; j++) {
      skinIndex[v * 4 + j] = order[j];
      skinWeight[v * 4 + j] = bw[order[j]] / top;
    }

    // --- Colour masks ------------------------------------------------------
    let tip = 0;
    for (const l of anatomy.lobes) {
      const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], dz = l.b[2] - l.a[2];
      const t = ((x - l.a[0]) * dx + (y - l.a[1]) * dy + (z - l.a[2]) * dz) / (dx * dx + dy * dy + dz * dz);
      tip = Math.max(tip, sstep(-0.2, 1.1, t) * sstep(0.4, 0.8, w[PART.crown]));
    }
    for (const ear of [0, 1] as const) {
      const L = anatomy.ears[ear];
      const t = ((x - L.root[0]) * L.u[0] + (y - L.root[1]) * L.u[1] + (z - L.root[2]) * L.u[2]) / L.length;
      tip = Math.max(tip, sstep(0.2, 1.0, t) * w[PART.earL + ear]);
    }
    masks[v * 4 + 1] = tip;

    // Blush: signed ellipse field on the face plane (crisp edge in the shader).
    let blush = -1;
    if (nz > 0.45 && w[PART.head] > 0.5) {
      for (const c of blushC) {
        const e = Math.sqrt(((x - c[0]) / 0.115) ** 2 + ((y - c[1]) / 0.072) ** 2);
        blush = Math.max(blush, 1 - e);
      }
    }
    masks[v * 4 + 2] = blush;
    // Jaw region: the face below the mouth drops when the jaw opens.
    const mouthY = h.c[1] - 0.135;
    masks[v * 4] = sstep(mouthY + 0.02, mouthY - 0.14, y) * sstep(0.2, 0.6, nz) * (1 - sstep(0.22, 0.48, Math.abs(x))) * w[PART.head];
    masks[v * 4 + 3] = w[PART.head] + w[PART.crown] + w[PART.earL] + w[PART.earR] > 0.5 ? 1 : sstep(0.0, 1.0, y);

    // --- Ambient occlusion -------------------------------------------------
    let occ = 0;
    let weight = 1;
    for (let i = 1; i <= 5; i++) {
      const hh = 0.03 * i;
      const d = anatomy.sdf(x + nx * hh, y + ny * hh, z + nz * hh);
      occ += (hh - Math.max(d, 0)) * weight;
      weight *= 0.6;
    }
    ao[v] = Math.min(1, Math.max(0, 1 - occ * 3.6));
  }

  return { positions, normals, indices, skinIndex, skinWeight, masks, ao };
}
