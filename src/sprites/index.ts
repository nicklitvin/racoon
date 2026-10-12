import type { RaccoonType } from '../../shared/settings';
import { CAT_BUILD, FOX_BUILD, OTTER_BUILD, RACCOON_BUILD } from './critter/build';
import { catAct } from './critter/catAct';
import { createChibi } from './chibi';
import { CHIBI_CAT, CHIBI_FOX, CHIBI_OTTER, CHIBI_RACCOON, type ChibiBuild } from './chibi/species';
import { createCritter } from './critter';
import { foxAct } from './critter/foxAct';
import { otterAct } from './critter/otterAct';
import { raccoonAct } from './critter/raccoonAct';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type { Species } from './critter/build';
import type { Species } from './critter/build';

export interface PetStyle {
  label: string;
  description: string;
  species: Species;
  /** The settings list them by species, except the chibis, which have a group of their own. */
  group?: 'chibi';
  create: (doc?: Document) => RaccoonRenderer;
}

const lifelikeCat = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, CAT_BUILD, catAct, look, label);
const lifelikeRaccoon = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, RACCOON_BUILD, raccoonAct, look, label);
const lifelikeFox = (look: string, label: string) => (doc: Document = document) => createCritter(doc, FOX_BUILD, foxAct, look, label);
const lifelikeOtter = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, OTTER_BUILD, otterAct, look, label);
const chibi = (build: ChibiBuild, coat: string, label: string) => (doc: Document = document) => createChibi(doc, build, coat, label);

/** Every pet the settings offer, with its label and renderer. Retired ones are in ./archive. */
export const RACCOON_STYLES: Record<RaccoonType, PetStyle> = {
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
  'fox-storybook': {
    species: 'fox',
    label: 'Storybook fox',
    description: 'A red fox in black stockings, with a white-tipped brush carried low behind.',
    create: lifelikeFox('look-paint coat-fox', 'red fox'),
  },
  'fox-arctic': {
    species: 'fox',
    label: 'Arctic fox',
    description: 'A snow-white fox in its winter coat.',
    create: lifelikeFox('look-paint coat-arctic', 'arctic fox'),
  },
  'fox-sketch': {
    species: 'fox',
    label: 'Ink sketch fox',
    description: 'A fox in pen and ink, all ears, legs and brush.',
    create: lifelikeFox('look-ink coat-fox-ink', 'fox'),
  },
  'otter-storybook': {
    species: 'otter',
    label: 'Storybook otter',
    description: 'Swims about your screen, floats on its back, and pops up to see what you’re doing.',
    create: lifelikeOtter('look-paint coat-otter', 'otter'),
  },
  'otter-sketch': {
    species: 'otter',
    label: 'Ink sketch otter',
    description: 'An otter in pen and ink, paddling through its own little pond.',
    create: lifelikeOtter('look-ink coat-otter-ink', 'otter'),
  },
  'raccoon-chibi': {
    species: 'raccoon',
    group: 'chibi',
    label: 'Chibi raccoon',
    description: 'A round little bandit with a big head, tiny paws and a stripy tail.',
    create: chibi(CHIBI_RACCOON, 'chibi-coat-raccoon', 'raccoon'),
  },
  'cat-chibi': {
    species: 'cat',
    group: 'chibi',
    label: 'Chibi tabby',
    description: 'A ginger kitten, all head and whiskers.',
    create: chibi(CHIBI_CAT, 'chibi-coat-ginger', 'ginger cat'),
  },
  'cat-chibi-tuxedo': {
    species: 'cat',
    group: 'chibi',
    label: 'Chibi tuxedo cat',
    description: 'Black and white and very proud of it.',
    create: chibi(CHIBI_CAT, 'chibi-coat-tuxedo', 'tuxedo cat'),
  },
  'fox-chibi': {
    species: 'fox',
    group: 'chibi',
    label: 'Chibi fox',
    description: 'Big ears, white cheeks and a brush almost as big as the rest of it.',
    create: chibi(CHIBI_FOX, 'chibi-coat-fox', 'fox'),
  },
  'otter-chibi': {
    species: 'otter',
    group: 'chibi',
    label: 'Chibi otter',
    description: 'Paddles round in its own little pond and floats on its back with its favourite shell.',
    create: chibi(CHIBI_OTTER, 'chibi-coat-otter', 'otter'),
  },
};
