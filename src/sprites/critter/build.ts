import type { Point } from '../../core/geometry';
import type { Gait } from './gait';

/**
 * Body plans for the lifelike animals: bone lengths, standing posture, gaits and the
 * thickness of each part, in drawing units (the animal faces right, feet at y = 0).
 * Proportions follow the real animals: a cat is long-legged and level-backed with a
 * small head; a raccoon is low at the shoulder, humped at the hips, with flat hind feet; a
 * fox is a cat on longer legs with a brush of a tail; an otter is a long, low tube of a body
 * on short legs, with a thick tail that tapers like a rudder.
 */
export type Species = 'cat' | 'raccoon' | 'fox' | 'otter';

export interface Build {
  species: Species;
  /**
   * Lives in the water: the floor is the surface of a pond, the paws paddle under it, and
   * whatever is below it is seen through the water.
   */
  swims?: boolean;
  /** Drawing box around the feet. */
  view: { x: number; y: number; width: number; height: number };
  pelvis: Point;
  shoulder: Point;
  /** Upper arm, forearm and hand. */
  front: [number, number, number];
  /** Thigh, shin and foot. */
  back: [number, number, number];
  /** Standing lean of the hand and foot bones (degrees from upright, + = joint behind the paw). */
  frontLean: number;
  backLean: number;
  /** The far legs stand this much behind the near ones, so both pairs show. */
  farOffset: number;
  /** Limb radii from the top joint down to the paw: [top, middle joint, lower joint, paw]. */
  frontWidth: [number, number, number, number];
  backWidth: [number, number, number, number];
  /**
   * Sideways, from the middle of the body: where the legs hang from and where the paws fall
   * (cats walk with their paws almost in a line), and the body's width as a fraction of its depth.
   */
  stance: { shoulder: number; hip: number; frontPaw: number; backPaw: number; girth: number };
  /** How far the spine bends round sideways in a turn, shoulders against hips (radians). */
  flex: number;
  /**
   * Sat or stood up on the hind legs, how far down the chest the arms hang from, below the
   * top of the spine (units). A raccoon's arms are free hands; a cat sits on straight front legs.
   */
  uprightShoulder: number;
  /**
   * How far the shoulder blade can slide to reach a paw (units). An animal's shoulder blade
   * isn't joined to the skeleton, only held by muscle, so it rolls forward as the paw reaches
   * out and back as it pushes off: that's where a long stride comes from.
   */
  scapula: number;
  /** Paw size (half length, half height). */
  pawFront: [number, number];
  pawBack: [number, number];
  tail: { segments: number; segment: number; base: number; tip: number; root: Point };
  head: { r: number };
  walk: Gait;
  run: Gait;
  chase: Gait;
  /** Peeking: feet this far below the screen edge, paws resting on it at `peekEdge`. */
  peekSink: number;
  peekEdge: number;
  /** How far in front of his feet a toy block sits (its middle) for him to swat or pick up. */
  toyReach: number;
  /** Where his front paws rest on a keyboard, typing at his desk (the middle of the keys). */
  desk: { x: number; y: number };
}

/** Edge of a toy block, in drawing units. */
export const CRITTER_TOY = 13.5;

export const CAT_BUILD: Build = {
  species: 'cat',
  view: { x: -72, y: -88, width: 144, height: 94 },
  pelvis: { x: -15, y: -24.5 },
  shoulder: { x: 13.5, y: -23 },
  front: [9.5, 10.5, 4.2],
  back: [11, 11.5, 8],
  frontLean: 8,
  backLean: 26,
  farOffset: -3.2,
  frontWidth: [5.2, 3.2, 2.15, 2],
  backWidth: [7.6, 3.6, 2.3, 2],
  stance: { shoulder: 4.4, hip: 4.9, frontPaw: 3, backPaw: 3.5, girth: 0.95 },
  // Cats are famously bendy: one can turn round in its own length.
  flex: 1.3,
  uprightShoulder: 0,
  scapula: 4,
  pawFront: [2.9, 2],
  pawBack: [3.2, 2.1],
  tail: { segments: 14, segment: 3.1, base: 3, tip: 2.2, root: { x: -8, y: -1.3 } },
  head: { r: 9.2 },
  // A lateral-sequence walk: back left, front left, back right, front right.
  walk: {
    stride: 44,
    speed: 76,
    duty: 0.62,
    offsets: { backNear: 0, frontNear: 0.26, backFar: 0.5, frontFar: 0.76 },
    lift: [4.2, 3],
    curl: [95, 48],
    bob: 0.55,
    peak: [0.36, 0.5],
  },
  // Running, a cat gallops (a transverse gallop): one hind paw lands, then the other a
  // clear beat later, then one front paw and the other. No two paws land together.
  run: {
    stride: 74,
    speed: 300,
    duty: 0.34,
    offsets: { backNear: 0, backFar: 0.16, frontNear: 0.46, frontFar: 0.62 },
    lift: [7, 6],
    curl: [110, 70],
    bob: 2.2,
    peak: [0.4, 0.45],
  },
  chase: {
    stride: 96,
    speed: 560,
    duty: 0.28,
    offsets: { backNear: 0, backFar: 0.13, frontNear: 0.44, frontFar: 0.58 },
    lift: [8, 7],
    curl: [115, 75],
    bob: 3,
    peak: [0.4, 0.45],
  },
  peekSink: 30,
  peekEdge: -30,
  toyReach: 30,
  desk: { x: 13, y: -12 },
};

export const RACCOON_BUILD: Build = {
  species: 'raccoon',
  view: { x: -72, y: -88, width: 144, height: 94 },
  pelvis: { x: -14, y: -22 },
  shoulder: { x: 13, y: -17.5 },
  front: [8, 8.5, 4.5],
  back: [10, 10, 8.5],
  frontLean: 58,
  backLean: 74,
  farOffset: -3,
  frontWidth: [4.8, 3, 2.4, 2.2],
  backWidth: [7.4, 3.8, 2.6, 2.3],
  stance: { shoulder: 5.4, hip: 6.4, frontPaw: 4.4, backPaw: 5.2, girth: 1.1 },
  flex: 0.95,
  uprightShoulder: 5.5,
  scapula: 3,
  pawFront: [3.2, 1.9],
  pawBack: [3.6, 2],
  tail: { segments: 10, segment: 3.4, base: 5, tip: 4, root: { x: -8.5, y: -1.5 } },
  head: { r: 8.6 },
  // Raccoons amble: each side's back and front paws move nearly together, which gives the
  // famous rolling waddle.
  walk: {
    stride: 34,
    speed: 76,
    duty: 0.64,
    offsets: { backNear: 0, frontNear: 0.14, backFar: 0.5, frontFar: 0.64 },
    lift: [3.4, 2.8],
    curl: [55, 40],
    bob: 0.9,
    peak: [0.4, 0.45],
  },
  // Running, a transverse gallop like the cat's, each paw landing in turn.
  run: {
    stride: 58,
    speed: 300,
    duty: 0.36,
    offsets: { backNear: 0, backFar: 0.17, frontNear: 0.47, frontFar: 0.63 },
    lift: [5, 5],
    curl: [70, 50],
    bob: 2.4,
    peak: [0.4, 0.45],
  },
  chase: {
    stride: 74,
    speed: 560,
    duty: 0.3,
    offsets: { backNear: 0, backFar: 0.14, frontNear: 0.45, frontFar: 0.6 },
    lift: [6, 6],
    curl: [80, 55],
    bob: 3,
    peak: [0.4, 0.45],
  },
  peekSink: 26,
  peekEdge: -26,
  toyReach: 29,
  desk: { x: 11, y: -21 },
};

/**
 * A red fox moves much like a cat (they're often called the most cat-like of dogs), so it
 * shares the cat's poses, drawn this much longer and taller: a fox stands higher on its legs.
 */
export const FOX_SCALE = { x: 1.07, y: 1.12 };

const scaleGait = (gait: Gait, k: number): Gait => ({ ...gait, stride: gait.stride * k, lift: [gait.lift[0] * FOX_SCALE.y, gait.lift[1] * FOX_SCALE.y] });

export const FOX_BUILD: Build = {
  ...CAT_BUILD,
  species: 'fox',
  pelvis: { x: CAT_BUILD.pelvis.x * FOX_SCALE.x, y: CAT_BUILD.pelvis.y * FOX_SCALE.y },
  shoulder: { x: CAT_BUILD.shoulder.x * FOX_SCALE.x, y: CAT_BUILD.shoulder.y * FOX_SCALE.y },
  front: CAT_BUILD.front.map((b) => b * FOX_SCALE.y) as Build['front'],
  back: CAT_BUILD.back.map((b) => b * FOX_SCALE.y) as Build['back'],
  farOffset: CAT_BUILD.farOffset * FOX_SCALE.x,
  // Slender legs: a fox is all leg.
  frontWidth: [4.9, 2.9, 1.95, 1.8],
  backWidth: [7.4, 3.3, 2.1, 1.85],
  stance: { shoulder: 4.2, hip: 4.6, frontPaw: 2.8, backPaw: 3.2, girth: 0.9 },
  flex: 1.15,
  pawFront: [2.7, 1.9],
  pawBack: [3, 2],
  // A long brush, as long as the body, thick with fur.
  tail: { segments: 12, segment: 3.5, base: 3.4, tip: 2.6, root: { x: -8, y: -1.3 } },
  head: { r: 8.4 },
  walk: scaleGait(CAT_BUILD.walk, FOX_SCALE.x),
  run: scaleGait(CAT_BUILD.run, FOX_SCALE.x),
  chase: scaleGait(CAT_BUILD.chase, FOX_SCALE.x),
  peekSink: CAT_BUILD.peekSink * FOX_SCALE.y,
  peekEdge: CAT_BUILD.peekEdge * FOX_SCALE.y,
  toyReach: 30 * FOX_SCALE.x,
  desk: { x: 13 * FOX_SCALE.x, y: -12 * FOX_SCALE.y },
};

/**
 * An otter, posed in the water: the floor (y = 0) is the surface. It floats with its back
 * just out of the water and its legs below, paddling; out of the water (held up, peeking)
 * it's a long body on short legs. The gaits are paddling cycles rather than footfalls.
 */
export const OTTER_BUILD: Build = {
  species: 'otter',
  swims: true,
  view: { x: -72, y: -88, width: 144, height: 94 },
  pelvis: { x: -17, y: -1.5 },
  shoulder: { x: 15, y: -2 },
  front: [4.8, 4.6, 2.8],
  back: [5.6, 5.2, 5.2],
  frontLean: 20,
  backLean: 60,
  farOffset: -2.5,
  frontWidth: [4.4, 2.7, 2.1, 1.9],
  backWidth: [5.8, 3.2, 2.3, 2.2],
  stance: { shoulder: 4.6, hip: 5, frontPaw: 3.8, backPaw: 4.6, girth: 1.12 },
  // Otters can bend nearly double.
  flex: 1.6,
  uprightShoulder: 3,
  scapula: 2,
  pawFront: [2.3, 1.5],
  // Big webbed hind feet: the paddles.
  pawBack: [3.8, 1.5],
  // Thick where it leaves the body and tapering to a point: a rudder.
  tail: { segments: 12, segment: 2.8, base: 4.4, tip: 0.9, root: { x: -9, y: -0.5 } },
  head: { r: 7.4 },
  // Dog-paddling: the front paws stroke in turn, the hind feet kick in turn between them.
  walk: {
    stride: 30,
    speed: 76,
    duty: 0.5,
    offsets: { frontNear: 0, frontFar: 0.5, backNear: 0.25, backFar: 0.75 },
    lift: [0, 0],
    curl: [0, 0],
    bob: 0.4,
    peak: [0.5, 0.5],
  },
  // Swimming fast, the legs tuck in and the body and tail undulate up and down.
  run: {
    stride: 64,
    speed: 300,
    duty: 0.5,
    offsets: { frontNear: 0, frontFar: 0.5, backNear: 0, backFar: 0.08 },
    lift: [0, 0],
    curl: [0, 0],
    bob: 1.2,
    peak: [0.5, 0.5],
  },
  chase: {
    stride: 92,
    speed: 560,
    duty: 0.5,
    offsets: { frontNear: 0, frontFar: 0.5, backNear: 0, backFar: 0.08 },
    lift: [0, 0],
    curl: [0, 0],
    bob: 1.8,
    peak: [0.5, 0.5],
  },
  peekSink: 24,
  peekEdge: -24,
  toyReach: 36,
  desk: { x: 17, y: -12 },
};
