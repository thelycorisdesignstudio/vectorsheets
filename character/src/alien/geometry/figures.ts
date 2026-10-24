import { Anatomy, type AnatomySpec } from './anatomy';
import { HumanAnatomy } from './human';

/** Builds the anatomy for a spec: the alien species or a human figure. */
export function createAnatomy(spec: AnatomySpec): Anatomy {
  return spec.kind === 'human' ? new HumanAnatomy(spec) : new Anatomy(spec);
}
