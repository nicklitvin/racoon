import type { RaccoonType } from '../../shared/settings';
import { createFloaty, type FloatyKind } from './floaty';
import { createPixel } from './pixel';
import { PIXEL_COATS, type Palette } from './pixel/palette';
import { PIXEL_BUNNY, PIXEL_CAT, PIXEL_HEDGEHOG, PIXEL_OTTER, PIXEL_RACCOON, type PixelBuild } from './pixel/species';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type { Species } from './critter/build';
import type { ChibiSpecies } from './chibi/species';

export interface PetStyle {
  label: string;
  description: string;
  /** The animal (none for a floaty, which isn't one). */
  species: ChibiSpecies | null;
  create: (doc?: Document) => RaccoonRenderer;
}

const floaty = (kind: FloatyKind, label: string) => (doc: Document = document) => createFloaty(doc, kind, label);

const pixel = (build: PixelBuild, palette: Palette, coat: string, label: string) => (doc: Document = document) =>
  createPixel(doc, build, palette, coat, label);

/**
 * Every pet the settings offer, with its label and renderer. For now that's the pixel pets
 * (the bunny and the hedgehog are in beta) and, in beta, the floaties.
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
  'blip-floaty': {
    species: null,
    label: 'Blip',
    description: 'A round little blue floaty with an antenna. Bobs about in the air and waves its floating hands.',
    create: floaty('blip', 'Blip'),
  },
  'mochi-floaty': {
    species: null,
    label: 'Mochi',
    description: 'A soft, squishy pink floaty with a leaf sprouting on top, drifting about wherever it likes.',
    create: floaty('mochi', 'Mochi'),
  },
  'ember-floaty': {
    species: null,
    label: 'Ember',
    description: 'A little orange drop of a floaty with a flickering tip, like a candle flame that wandered off.',
    create: floaty('ember', 'Ember'),
  },
};
