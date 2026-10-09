import type { RaccoonType } from '../../shared/settings';
import { createArenaRaccoon } from './arenaRaccoon';
import { createCartoonRaccoon } from './cartoonRaccoon';
import { createSvgRaccoon } from './svgRaccoon';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export { poseFor } from './pose';
export { createArenaRaccoon, createCartoonRaccoon, createSvgRaccoon };
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

/** Every raccoon type the settings offer, with its label and renderer. */
export const RACCOON_STYLES: Record<RaccoonType, { label: string; description: string; create: (doc?: Document) => RaccoonRenderer }> = {
  arena: { label: 'Arena (3D)', description: 'Seen from above like a strategy game, turning any way he goes.', create: (doc) => createArenaRaccoon(doc) },
  cartoon: { label: 'Cartoon', description: 'Round, chubby and bouncy.', create: (doc) => createCartoonRaccoon(doc) },
  plush: { label: 'Plush', description: 'A big-headed, big-eyed cuddly toy.', create: (doc) => createCartoonRaccoon(doc, 'plush') },
  classic: { label: 'Classic', description: 'The original, simpler raccoon.', create: createSvgRaccoon },
};
