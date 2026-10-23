import type { Species } from '../critter/build';

/** Every animal there's a build for: the chibis', and the ones only drawn in pixels. */
export type ChibiSpecies = Species | 'bunny' | 'hedgehog';

/** A point in drawing units: x forward (he faces right), y down, the floor at y = 0. */
export interface Pt {
  x: number;
  y: number;
}

/**
 * How one chibi animal is put together: a bean of a body, a big round head, stubby legs
 * and a tail, all flat shapes. Body-relative points are from the body's middle, before
 * it's turned; everything else is from his feet.
 */
export interface ChibiBuild {
  species: ChibiSpecies;
  /** Half the body's length and height, and where its middle is when he stands. */
  body: { rx: number; ry: number; at: Pt };
  /** Half the head's width and height, and where it sits from the body's middle. */
  head: { rx: number; ry: number; at: Pt };
  /** Where the legs join the body, from its middle. */
  shoulder: Pt;
  hip: Pt;
  /** How far the far legs sit behind the near ones on screen. */
  farOffset: number;
  legWidth: number;
  /** One step: how far the paws swing either way, and how far a full stride carries him. */
  stride: { walk: number; walkCycle: number; runCycle: number };
  tail: {
    root: Pt;
    length: number;
    /** Radius along the tail, 0 at the root to 1 at the tip. */
    radius: (s: number) => number;
    /** Angle it leaves the body at (degrees, 0 = forward, 90 = up) and how far it curls. */
    angle: number;
    curl: number;
  };
  /** Feet this far below the screen edge while peeking. */
  peekSink: number;
  /** How far in front of his feet a toy block sits for him to swat or pick up (its middle). */
  toyReach: number;
  /** Where his front paws rest on a keyboard, typing at his desk (the middle of the keys), and on the mouse. */
  desk: Pt;
  mouse: Pt;
  swims?: boolean;
  /** Gets about in hops, both hind feet together (a bunny), rather than trotting. */
  gait?: 'hop';
  /** Rolls up into a spiky ball: to go fast, to sleep, when startled or picked up (a hedgehog). */
  curls?: boolean;
}

/** Edge of a toy block, in drawing units. */
export const CHIBI_TOY = 15;

export const CHIBI_RACCOON: ChibiBuild = {
  species: 'raccoon',
  body: { rx: 16, ry: 12, at: { x: -3, y: -15 } },
  head: { rx: 17, ry: 14.5, at: { x: 13.5, y: -18 } },
  shoulder: { x: 8.5, y: 5 },
  hip: { x: -9, y: 5 },
  farOffset: 4.5,
  legWidth: 6.6,
  stride: { walk: 4.2, walkCycle: 24, runCycle: 46 },
  tail: {
    root: { x: -13, y: -2 },
    length: 25,
    radius: (s) => 4.4 + 3.4 * Math.sin(Math.PI * Math.min(1, s * 1.15)) - 1.2 * s,
    angle: 150,
    curl: -24,
  },
  peekSink: 28,
  toyReach: 26,
  desk: { x: 15, y: -16 },
  mouse: { x: 27, y: -15 },
};

export const CHIBI_CAT: ChibiBuild = {
  species: 'cat',
  body: { rx: 14.5, ry: 10.5, at: { x: -3, y: -15 } },
  head: { rx: 16, ry: 13.5, at: { x: 13, y: -17.5 } },
  shoulder: { x: 8, y: 5 },
  hip: { x: -8, y: 5 },
  farOffset: 4,
  legWidth: 5.4,
  stride: { walk: 4.4, walkCycle: 26, runCycle: 50 },
  tail: {
    root: { x: -12.5, y: -3 },
    length: 27,
    radius: (s) => 2.7 - 0.5 * s,
    angle: 112,
    curl: -70,
  },
  peekSink: 26,
  toyReach: 25,
  desk: { x: 14.5, y: -15 },
  mouse: { x: 26.5, y: -14 },
};

export const CHIBI_FOX: ChibiBuild = {
  species: 'fox',
  body: { rx: 15, ry: 10.5, at: { x: -3, y: -16.5 } },
  head: { rx: 15.5, ry: 13, at: { x: 14, y: -17 } },
  shoulder: { x: 8.5, y: 5 },
  hip: { x: -8.5, y: 5 },
  farOffset: 4,
  legWidth: 5,
  stride: { walk: 4.8, walkCycle: 28, runCycle: 54 },
  tail: {
    root: { x: -13, y: -2 },
    length: 29,
    radius: (s) => 3.4 + 4.6 * Math.sin(Math.PI * Math.min(1, s * 0.95 + 0.08)),
    angle: 196,
    curl: 46,
  },
  peekSink: 28,
  toyReach: 25.5,
  desk: { x: 15, y: -15.5 },
  mouse: { x: 27, y: -14.5 },
};

export const CHIBI_OTTER: ChibiBuild = {
  species: 'otter',
  body: { rx: 18, ry: 9.5, at: { x: -4, y: -12.5 } },
  head: { rx: 14, ry: 12.2, at: { x: 17.5, y: -11 } },
  shoulder: { x: 10.5, y: 4.5 },
  hip: { x: -11, y: 4.5 },
  farOffset: 4,
  legWidth: 5.2,
  stride: { walk: 3.6, walkCycle: 30, runCycle: 56 },
  tail: {
    root: { x: -16, y: 0 },
    length: 22,
    radius: (s) => 5 - 3.9 * s,
    angle: 186,
    curl: 10,
  },
  peekSink: 26,
  toyReach: 30,
  desk: { x: 12, y: -13 },
  mouse: { x: 21, y: -12 },
  swims: true,
};
