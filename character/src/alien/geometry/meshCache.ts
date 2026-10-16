import type { AnatomySpec } from './anatomy';
import { buildBodyMesh, CELL_SIZE, type BodyMeshData } from './bodyMesh';
import type { RenderQuality } from '../types';

/**
 * Builds body meshes off the main thread (falling back to synchronous builds
 * where workers are unavailable) and memoises them per anatomy + quality.
 */
const cache = new Map<string, Promise<BodyMeshData>>();
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (d: BodyMeshData) => void>();

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./mesh.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; data: BodyMeshData }>) => {
      pending.get(e.data.id)?.(e.data.data);
      pending.delete(e.data.id);
    };
  } catch {
    worker = null;
  }
  return worker;
}

export const anatomyKey = (spec: AnatomySpec, quality: RenderQuality) =>
  `${spec.head}|${spec.ears}|${spec.crown}|${quality}`;

export function requestBodyMesh(spec: AnatomySpec, quality: RenderQuality): Promise<BodyMeshData> {
  const key = anatomyKey(spec, quality);
  const hit = cache.get(key);
  if (hit) return hit;
  const cell = CELL_SIZE[quality];
  const w = getWorker();
  const promise = w
    ? new Promise<BodyMeshData>((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        w.postMessage({ id, spec, cell });
      })
    : Promise.resolve().then(() => buildBodyMesh(spec, cell));
  cache.set(key, promise);
  return promise;
}
