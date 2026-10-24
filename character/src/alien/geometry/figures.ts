import { Anatomy, type AnatomySpec } from './anatomy';
import { HumanAnatomy, humanHeadY } from './human';
import type { HumanFigure } from '../types';

/** Builds the anatomy for a spec: the alien species or a human figure. */
export function createAnatomy(spec: AnatomySpec): Anatomy {
  return spec.kind === 'human' ? new HumanAnatomy(spec) : new Anatomy(spec);
}

/** Head-centre height used to frame the camera on a character. */
export function headHeight(kind: 'alien' | 'human' | undefined, figure: HumanFigure | undefined) {
  return kind === 'human' ? humanHeadY(figure ?? 'lady') : 1.86;
}
