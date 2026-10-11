import type { Point } from '../../core/geometry';
import type { Gait } from './gait';

/**
 * Body plans for the lifelike animals: bone lengths, standing posture, gaits and the
 * thickness of each part, in drawing units (the animal faces right, feet at y = 0).
 * Proportions follow the real animals: a cat is long-legged and level-backed with a
 * small head; a raccoon is low at the shoulder, humped at the hips, with flat hind feet.
 */
export interface Build {
  species: 'cat' | 'raccoon';
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
}

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
  scapula: 3.6,
  pawFront: [2.9, 2],
  pawBack: [3.2, 2.1],
  tail: { segments: 14, segment: 3.1, base: 3, tip: 2.2, root: { x: -7.5, y: -1.8 } },
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
  // A bounding run: back paws close together, front paws one after the other.
  run: {
    stride: 74,
    speed: 300,
    duty: 0.34,
    offsets: { backNear: 0, backFar: 0.07, frontNear: 0.5, frontFar: 0.6 },
    lift: [7, 6],
    curl: [110, 70],
    bob: 2.2,
    peak: [0.4, 0.45],
  },
  chase: {
    stride: 96,
    speed: 560,
    duty: 0.28,
    offsets: { backNear: 0, backFar: 0.06, frontNear: 0.5, frontFar: 0.58 },
    lift: [8, 7],
    curl: [115, 75],
    bob: 3,
    peak: [0.4, 0.45],
  },
  peekSink: 30,
  peekEdge: -30,
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
  scapula: 2.6,
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
  run: {
    stride: 58,
    speed: 300,
    duty: 0.36,
    offsets: { backNear: 0, backFar: 0.08, frontNear: 0.48, frontFar: 0.58 },
    lift: [5, 5],
    curl: [70, 50],
    bob: 2.4,
    peak: [0.4, 0.45],
  },
  chase: {
    stride: 74,
    speed: 560,
    duty: 0.3,
    offsets: { backNear: 0, backFar: 0.07, frontNear: 0.48, frontFar: 0.57 },
    lift: [6, 6],
    curl: [80, 55],
    bob: 3,
    peak: [0.4, 0.45],
  },
  peekSink: 26,
  peekEdge: -26,
};
