import type { Point } from './geometry';

/**
 * Which way the raccoon faces on the ground, for renderers that draw him from above
 * and can turn him any way. Angles are radians in screen axes: 0 = right, PI/2 = down
 * the screen (towards you), PI = left.
 */

/** Below this speed (px/s) he's standing, and keeps whatever way he faced. */
const MOVING_PX_PER_S = 15;
/** How quickly he turns towards a new heading, per second. Higher is snappier. */
const TURN_RATE = 9;
/** Close enough to count as facing the target. */
const SETTLED_RAD = 0.004;

/** Wraps an angle into -PI..PI. */
export function wrapAngle(a: number): number {
  const turn = Math.PI * 2;
  return a - turn * Math.floor((a + Math.PI) / turn);
}

export interface HeadingInput {
  velocity: Point;
  /** The behaviour's left/right facing (it turns him to look at things). */
  facing: 1 | -1;
  animation: string;
}

/** The heading he wants to turn to, given what he's doing. */
export function targetHeading(current: number, { velocity, facing, animation }: HeadingInput): number {
  // Dangling from the pointer: don't spin with the drag.
  if (animation === 'dangle') return current;
  // Peeking over the bottom edge: face you, so you see his eyes follow your typing.
  if (animation === 'peek') return Math.PI / 2;
  if (Math.hypot(velocity.x, velocity.y) > MOVING_PX_PER_S) return Math.atan2(velocity.y, velocity.x);
  // Standing, but the behaviour turned him round (to look about, or at the cursor):
  // mirror left/right and keep the same tilt towards or away from you.
  if (facing * Math.cos(current) < -0.2) return wrapAngle(Math.PI - current);
  return current;
}

/** Turns smoothly from `current` towards `target` the short way round. */
export function turnTowards(current: number, target: number, dtMs: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) < SETTLED_RAD) return wrapAngle(target);
  return wrapAngle(current + diff * (1 - Math.exp((-TURN_RATE * dtMs) / 1000)));
}

export function isTurning(current: number, target: number): boolean {
  return Math.abs(wrapAngle(target - current)) >= SETTLED_RAD;
}
