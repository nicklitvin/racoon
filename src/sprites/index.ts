import { asciiRaccoon } from './asciiRaccoon';
import { normalizeSheet } from './render';

/** The sprite sheet in use. Point this at another sheet to change the art style. */
export const activeSheet = normalizeSheet(asciiRaccoon);

export { renderFrame } from './render';
export type { AnimationName, EyeStyle, SpriteSheet } from './types';
