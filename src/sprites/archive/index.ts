import type { RaccoonRenderer } from '../types';
import { createArenaRaccoon } from './arenaRaccoon';
import { createBlackCat } from './blackCat';
import { createCartoonRaccoon } from './cartoonRaccoon';
import { createSvgRaccoon } from './svgRaccoon';

/**
 * Retired pets, kept working but no longer offered in the settings: the 3D arena raccoon,
 * the cartoon and plush raccoons, the original simple raccoon and the cartoon black cat.
 * To bring one back, give it a type in shared/settings.ts and an entry in RACCOON_STYLES.
 */
export const ARCHIVED_STYLES: Record<string, { label: string; create: (doc?: Document) => RaccoonRenderer }> = {
  arena: { label: 'Arena (3D)', create: (doc) => createArenaRaccoon(doc) },
  cartoon: { label: 'Cartoon', create: (doc) => createCartoonRaccoon(doc) },
  plush: { label: 'Plush', create: (doc) => createCartoonRaccoon(doc, 'plush') },
  classic: { label: 'Classic', create: (doc) => createSvgRaccoon(doc) },
  cat: { label: 'Cartoon black cat', create: (doc) => createBlackCat(doc) },
};

export { createArenaRaccoon, createBlackCat, createCartoonRaccoon, createSvgRaccoon };
