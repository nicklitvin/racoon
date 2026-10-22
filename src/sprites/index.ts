import type { RaccoonType } from '../../shared/settings';
import { createPixel } from './pixel';
import { createBlob } from './pixel/blob';
import { PIXEL_COATS, type Palette } from './pixel/palette';
import { PIXEL_CAT, PIXEL_OTTER, PIXEL_RACCOON, type PixelBuild } from './pixel/species';
import type { RaccoonRenderer } from './types';

export { ANIMATIONS } from './animations';
export type { AnimationName, EyeStyle, RaccoonFrame, RaccoonRenderer } from './types';

export type { Species } from './critter/build';
import type { Species } from './critter/build';

export interface PetStyle {
  label: string;
  description: string;
  species: Species | 'blob';
  create: (doc?: Document) => RaccoonRenderer;
}

const pixel = (build: PixelBuild, palette: Palette, coat: string, label: string) => (doc: Document = document) =>
  createPixel(doc, build, palette, coat, label);

/**
 * Every pet the settings offer, with its label and renderer. For now that's the pixel pets
 * (the puffball, in beta, draws itself its own way: see ./pixel/blob).
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
};
