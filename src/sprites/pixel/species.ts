import { CHIBI_CAT, CHIBI_OTTER, CHIBI_RACCOON, type ChibiBuild } from '../chibi/species';

/** The animals there are pixel versions of. */
export type PixelSpecies = 'raccoon' | 'cat' | 'otter' | 'bunny' | 'hedgehog';
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

/**
 * A bunny: a pear of a body with a big round haunch, its head held low in front, long
 * floppy ears, big flat hind feet, a cotton-ball tail, and it hops everywhere.
 */
export const PIXEL_BUNNY: PixelBuild = {
  ...CHIBI_CAT,
  species: 'bunny',
  gait: 'hop',
  body: { rx: 14.5, ry: 10.5, at: { x: -4, y: -12.5 } },
  head: { rx: 13.5, ry: 12, at: { x: 13.5, y: -7.5 } },
  shoulder: { x: 8.5, y: 6 },
  hip: { x: -8, y: 4 },
  legWidth: 5.6,
  stride: { walk: 4, walkCycle: 30, runCycle: 52 },
  tail: { root: { x: -13, y: -1.5 }, length: 3, radius: () => 4.2, angle: 160, curl: 0 },
};

/**
 * A hedgehog: a low dome of spines over its back and the top of its head, a pointed snout
 * with a shiny black nose out in front, tiny legs, and it rolls up into a ball.
 */
export const PIXEL_HEDGEHOG: PixelBuild = {
  ...CHIBI_CAT,
  species: 'hedgehog',
  curls: true,
  body: { rx: 16, ry: 9.5, at: { x: -3, y: -11 } },
  head: { rx: 11.5, ry: 9.5, at: { x: 15, y: 2 } },
  shoulder: { x: 9, y: 6 },
  hip: { x: -9, y: 6 },
  legWidth: 5,
  stride: { walk: 3, walkCycle: 20, runCycle: 44 },
  tail: { root: { x: -14, y: 0 }, length: 0, radius: () => 0, angle: 190, curl: 0 },
  peekSink: 20,
  toyReach: 27,
};


