import type { RaccoonType } from '../../shared/settings';
import { createArenaRaccoon } from './arenaRaccoon';
import { createBlackCat } from './blackCat';
import { createCartoonRaccoon } from './cartoonRaccoon';
import { CAT_BUILD, RACCOON_BUILD } from './critter/build';
import { catAct } from './critter/catAct';
import { createCritter } from './critter';
import { raccoonAct } from './critter/raccoonAct';
import { createSvgRaccoon } from './svgRaccoon';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export { poseFor } from './pose';
export { createArenaRaccoon, createBlackCat, createCartoonRaccoon, createSvgRaccoon };
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type Species = 'raccoon' | 'cat';

export interface PetStyle {
  label: string;
  description: string;
  species: Species;
  create: (doc?: Document) => RaccoonRenderer;
}

const lifelikeCat = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, CAT_BUILD, catAct, look, label);
const lifelikeRaccoon = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, RACCOON_BUILD, raccoonAct, look, label);

/** Every pet the settings offer, with its label and renderer. */
export const RACCOON_STYLES: Record<RaccoonType, PetStyle> = {
  arena: { species: 'raccoon', label: 'Arena (3D)', description: 'Seen from above like a strategy game, turning any way he goes.', create: (doc) => createArenaRaccoon(doc) },
  'raccoon-storybook': {
    species: 'raccoon',
    label: 'Storybook raccoon',
    description: 'Drawn like a picture book, and moves like the real thing: a rolling waddle and busy hands.',
    create: lifelikeRaccoon('look-paint coat-raccoon', 'raccoon'),
  },
  'raccoon-sketch': {
    species: 'raccoon',
    label: 'Ink sketch raccoon',
    description: 'A pen-and-ink drawing come to life.',
    create: lifelikeRaccoon('look-ink coat-raccoon-ink', 'raccoon'),
  },
  cartoon: { species: 'raccoon', label: 'Cartoon', description: 'Round, chubby and bouncy.', create: (doc) => createCartoonRaccoon(doc) },
  plush: { species: 'raccoon', label: 'Plush', description: 'A big-headed, big-eyed cuddly toy.', create: (doc) => createCartoonRaccoon(doc, 'plush') },
  classic: { species: 'raccoon', label: 'Classic', description: 'The original, simpler raccoon.', create: createSvgRaccoon },
  'cat-storybook': {
    species: 'cat',
    label: 'Storybook tabby',
    description: 'A ginger tabby drawn like a picture book, moving like a real cat.',
    create: lifelikeCat('look-paint coat-ginger', 'ginger cat'),
  },
  'cat-sketch': {
    species: 'cat',
    label: 'Ink sketch cat',
    description: 'A few lines of ink, all observation: the walk, the sit, the slow blink.',
    create: lifelikeCat('look-ink coat-ink', 'cat'),
  },
  'cat-shadow': {
    species: 'cat',
    label: 'Shadow cat',
    description: 'A black silhouette with glowing eyes, all in the movement.',
    create: lifelikeCat('look-shadow coat-black', 'black cat'),
  },
  cat: { species: 'cat', label: 'Cartoon black cat', description: 'A hand-drawn cartoon cat with smooth, springy moves.', create: (doc) => createBlackCat(doc) },
};
