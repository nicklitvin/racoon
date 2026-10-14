import { CHIBI_CAT, CHIBI_OTTER, CHIBI_RACCOON, type ChibiBuild } from '../chibi/species';

/** The animals there are pixel versions of. */
export type PixelSpecies = 'raccoon' | 'cat' | 'otter';
export type PixelBuild = ChibiBuild & { species: PixelSpecies };

/**
 * The pixel pets are built like the chibis, but drawn this small, with a whole pixel of
 * outline round every part, a chibi's head ends up looking small for its body and the
 * tail too big. Pixel sprites want an even bigger head on a smaller, rounder body, so
 * these are the chibi builds with those proportions.
 */
export const PIXEL_RACCOON: PixelBuild = {
  ...CHIBI_RACCOON,
  species: 'raccoon',
  body: { rx: 14, ry: 11, at: { x: -2.5, y: -14.5 } },
  head: { rx: 18.5, ry: 15.5, at: { x: 12.5, y: -17 } },
  shoulder: { x: 7.5, y: 5 },
  hip: { x: -8, y: 5 },
  legWidth: 7.4,
  tail: {
    root: { x: -11.5, y: -1.5 },
    length: 19,
    radius: (s) => 3.8 + 2.6 * Math.sin(Math.PI * Math.min(1, s * 1.15)) - 1 * s,
    angle: 162,
    curl: -20,
  },
};

export const PIXEL_CAT: PixelBuild = {
  ...CHIBI_CAT,
  species: 'cat',
  body: { rx: 13, ry: 10, at: { x: -2.5, y: -14.5 } },
  head: { rx: 17.5, ry: 14.8, at: { x: 12.5, y: -17 } },
  shoulder: { x: 7, y: 5 },
  hip: { x: -7.5, y: 5 },
  legWidth: 6.4,
  tail: {
    root: { x: -11, y: -3 },
    length: 23,
    radius: (s) => 2.8 - 0.5 * s,
    angle: 128,
    curl: -80,
  },
};

export const PIXEL_OTTER: PixelBuild = { ...CHIBI_OTTER, species: 'otter' };
