import type { RaccoonType } from '../../shared/settings';
import { createPixel } from './pixel';
import { createBlob } from './pixel/blob';
import { PIXEL_COATS, type Palette } from './pixel/palette';
import { PIXEL_BUNNY, PIXEL_CAT, PIXEL_FOX, PIXEL_FROG, PIXEL_HEDGEHOG, PIXEL_OTTER, PIXEL_RACCOON, type PixelBuild } from './pixel/species';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type { Species } from './critter/build';
import type { ChibiSpecies } from './chibi/species';

export interface PetStyle {
  label: string;
  description: string;
  species: ChibiSpecies;
  create: (doc?: Document) => RaccoonRenderer;
}

const pixel = (build: PixelBuild, palette: Palette, coat: string, label: string) => (doc: Document = document) =>
  createPixel(doc, build, palette, coat, label);

/**
 * Every pet the settings offer, with its label and renderer. For now that's the pixel pets
 * (the puffball, in beta, draws itself its own way: see ./pixel/blob; the bunny, hedgehog,
 * fox and frog, in beta too, are drawn like the others).
 * The lifelike and chibi drawings (./critter, ./chibi) are still here, and the pixel pets
 * move with the chibis' poses; retired drawings are in ./archive.
 */
export const RACCOON_STYLES: Record<RaccoonType, PetStyle> = {
  'raccoon-pixel': {
    species: 'raccoon',
    label: 'Pixel raccoon',
    description: 'A little bandit straight out of an old video game, every pixel placed.',
    create: pixel(PIXEL_RACCOON, PIXEL_COATS.raccoon, 'pixel-coat-raccoon', 'raccoon'),
  },
  'cat-pixel': {
    species: 'cat',
    label: 'Pixel tabby',
    description: 'A ginger kitten in chunky pixels, ready to swat things off your desk.',
    create: pixel(PIXEL_CAT, PIXEL_COATS.ginger, 'pixel-coat-ginger', 'ginger cat'),
  },
  'otter-pixel': {
    species: 'otter',
    label: 'Pixel otter',
    description: 'Paddles about in a pixel pond and floats on its back with its shell.',
    create: pixel(PIXEL_OTTER, PIXEL_COATS.otter, 'pixel-coat-otter', 'otter'),
  },
  'blob-pixel': {
    species: 'blob',
    label: 'Pixel puffball',
    description: 'A round pink puff that floats about instead of walking, flapping its little arms.',
    create: (doc: Document = document) => createBlob(doc, PIXEL_COATS.puff, 'pixel-coat-puff', 'puffball'),
  },
  'bunny-pixel': {
    species: 'bunny',
    label: 'Pixel bunny',
    description: 'Hops everywhere, ears laid back, and sits up now and then to have a look round.',
    create: pixel(PIXEL_BUNNY, PIXEL_COATS.bunny, 'pixel-coat-bunny', 'bunny'),
  },
  'hedgehog-pixel': {
    species: 'hedgehog',
    label: 'Pixel hedgehog',
    description: 'Snuffles about on little legs, and rolls up into a spiky ball to go fast, to nap, or when you startle it.',
    create: pixel(PIXEL_HEDGEHOG, PIXEL_COATS.hedgehog, 'pixel-coat-hedgehog', 'hedgehog'),
  },
  'fox-pixel': {
    species: 'fox',
    label: 'Pixel fox',
    description: 'A red fox in black socks, with a big white-tipped tail and a nose-first pounce.',
    create: pixel(PIXEL_FOX, PIXEL_COATS.fox, 'pixel-coat-fox', 'fox'),
  },
  'frog-pixel': {
    species: 'frog',
    label: 'Pixel frog',
    description: 'Takes great big hops, and shoots its tongue out after flies.',
    create: pixel(PIXEL_FROG, PIXEL_COATS.frog, 'pixel-coat-frog', 'frog'),
  },
};
