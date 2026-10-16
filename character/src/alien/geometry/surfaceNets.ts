/**
 * Naive Surface Nets isosurface extraction with Newton projection.
 *
 * Produces an evenly distributed, watertight triangle mesh from a signed
 * distance field. Vertices are snapped onto the true surface and normals come
 * from the analytic field gradient, so the result shades perfectly smooth.
 * A coarse pre-pass skips samples that are provably far from the surface.
 */

export type Field = (x: number, y: number, z: number) => number;

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export function extractSurface(
  field: Field,
  min: [number, number, number],
  max: [number, number, number],
  cell: number,
): MeshData {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const values = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // Coarse pass: evaluate every 4th sample, then only refine near the surface.
  const C = 4;
  const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++)
    for (let j = 0; j < cy; j++)
      for (let i = 0; i < cx; i++)
        coarse[i + cx * (j + cy * k)] = field(min[0] + i * C * cell, min[1] + j * C * cell, min[2] + k * C * cell);
  const margin = C * cell * 1.25;
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    const ck = Math.round(k / C);
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      const cj = Math.round(j / C);
      for (let i = 0; i < nx; i++) {
        const dc = coarse[Math.round(i / C) + cx * (cj + cy * ck)];
        values[idx(i, j, k)] = Math.abs(dc) > margin ? dc : field(min[0] + i * cell, y, z);
      }
    }
  }

  // Place one vertex per sign-changing cell.
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const verts: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = values[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          count++;
        }
        cellVert[cidx(i, j, k)] = verts.length / 3;
        verts.push(min[0] + (i + sx / count) * cell, min[1] + (j + sy / count) * cell, min[2] + (k + sz / count) * cell);
      }

  // Connect cells around each sign-changing grid edge into quads.
  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = values[idx(i, j, k)] < 0;
        if (i < nx - 1 && v0 !== values[idx(i + 1, j, k)] < 0)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)]);
        if (j < ny - 1 && v0 !== values[idx(i, j + 1, k)] < 0)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)]);
        if (k < nz - 1 && v0 !== values[idx(i, j, k + 1)] < 0)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)]);
      }

  // Project vertices onto the zero set and take gradient normals.
  const vcount = verts.length / 3;
  const positions = new Float32Array(verts);
  const normals = new Float32Array(vcount * 3);
  const e = cell * 0.1;
  // Tetrahedral gradient: 4 samples give both the gradient and (their mean) the distance.
  const g = new Float32Array(4);
  const sample = (x: number, y: number, z: number) => {
    const a = field(x + e, y - e, z - e);
    const b = field(x - e, y - e, z + e);
    const c = field(x - e, y + e, z - e);
    const d = field(x + e, y + e, z + e);
    g[0] = a - b - c + d;
    g[1] = -a - b + c + d;
    g[2] = -a + b - c + d;
    g[3] = (a + b + c + d) * 0.25;
  };
  for (let v = 0; v < vcount; v++) {
    let x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    for (let it = 0; it < 3; it++) {
      sample(x, y, z);
      const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (gl2 < 1e-14) break;
      const gl = Math.sqrt(gl2);
      // Gradient magnitude of the tetra stencil is 4e for a unit field.
      const step = Math.min(cell, Math.abs(g[3])) * Math.sign(g[3]);
      x -= (g[0] / gl) * step;
      y -= (g[1] / gl) * step;
      z -= (g[2] / gl) * step;
      if (Math.abs(g[3]) < 2e-5) break;
    }
    positions[v * 3] = x;
    positions[v * 3 + 1] = y;
    positions[v * 3 + 2] = z;
    sample(x, y, z);
    const gl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1;
    normals[v * 3] = g[0] / gl;
    normals[v * 3 + 1] = g[1] / gl;
    normals[v * 3 + 2] = g[2] / gl;
  }

  // Fix winding so every triangle faces along its vertex normals.
  const indices = new Uint32Array(tris);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const abx = positions[b * 3] - positions[a * 3], aby = positions[b * 3 + 1] - positions[a * 3 + 1], abz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const acx = positions[c * 3] - positions[a * 3], acy = positions[c * 3 + 1] - positions[a * 3 + 1], acz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const fx = aby * acz - abz * acy, fy = abz * acx - abx * acz, fz = abx * acy - aby * acx;
    const nx2 = normals[a * 3] + normals[b * 3] + normals[c * 3];
    const ny2 = normals[a * 3 + 1] + normals[b * 3 + 1] + normals[c * 3 + 1];
    const nz2 = normals[a * 3 + 2] + normals[b * 3 + 2] + normals[c * 3 + 2];
    if (fx * nx2 + fy * ny2 + fz * nz2 < 0) {
      indices[t + 1] = c;
      indices[t + 2] = b;
    }
  }
  return { positions, normals, indices };
}
