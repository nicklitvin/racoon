import type { RaccoonType } from '../../shared/settings';
import { CAT_BUILD, FOX_BUILD, OTTER_BUILD, RACCOON_BUILD } from './critter/build';
import { catAct } from './critter/catAct';
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
  create: (doc?: Document) => RaccoonRenderer;
}

const lifelikeCat = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, CAT_BUILD, catAct, look, label);
const lifelikeRaccoon = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, RACCOON_BUILD, raccoonAct, look, label);
const lifelikeFox = (look: string, label: string) => (doc: Document = document) => createCritter(doc, FOX_BUILD, foxAct, look, label);
const lifelikeOtter = (look: string, label: string) => (doc: Document = document) =>
  createCritter(doc, OTTER_BUILD, otterAct, look, label);

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
};
