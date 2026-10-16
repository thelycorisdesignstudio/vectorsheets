/// <reference lib="webworker" />
import { buildBodyMesh } from './bodyMesh';
import type { AnatomySpec } from './anatomy';

self.onmessage = (event: MessageEvent<{ id: number; spec: AnatomySpec; cell: number }>) => {
  const { id, spec, cell } = event.data;
  const data = buildBodyMesh(spec, cell);
  (self as unknown as Worker).postMessage({ id, data }, [
    data.positions.buffer, data.normals.buffer, data.indices.buffer,
    data.skinIndex.buffer, data.skinWeight.buffer, data.masks.buffer, data.ao.buffer,
  ]);
};
