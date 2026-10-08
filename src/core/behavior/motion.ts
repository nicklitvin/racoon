import type { Point } from '../geometry';

/**
 * "Arrive" steering on one axis: accelerate toward the target at up to `maxSpeed`,
 * slowing down inside `slowRadius`. Velocity changes by at most `accel * dt`, which
 * is what gives movement its ease-in and ease-out.
 */
export function steer(
  position: number,
  velocity: number,
  target: number,
  maxSpeed: number,
  accel: number,
  dt: number,
  slowRadius = 120,
): number {
  const distance = target - position;
  const desiredSpeed = maxSpeed * Math.min(1, Math.abs(distance) / slowRadius);
  const desired = Math.sign(distance) * desiredSpeed;
  return approach(velocity, desired, accel * dt);
}

/** Moves `value` toward `target` by at most `maxDelta`. */
export function approach(value: number, target: number, maxDelta: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxDelta) return target;
  return value + Math.sign(delta) * maxDelta;
}

/** Two-dimensional arrive steering. */
export function steer2d(
  position: Point,
  velocity: Point,
  target: Point,
  maxSpeed: number,
  accel: number,
  dt: number,
  slowRadius = 120,
): Point {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  const desiredSpeed = maxSpeed * Math.min(1, distance / slowRadius);
  const desired = distance > 0 ? { x: (dx / distance) * desiredSpeed, y: (dy / distance) * desiredSpeed } : { x: 0, y: 0 };
  const change = { x: desired.x - velocity.x, y: desired.y - velocity.y };
  const changeLength = Math.hypot(change.x, change.y);
  const maxChange = accel * dt;
  if (changeLength <= maxChange) return desired;
  return { x: velocity.x + (change.x / changeLength) * maxChange, y: velocity.y + (change.y / changeLength) * maxChange };
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Deterministic random numbers for tests and reproducible behaviour. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
