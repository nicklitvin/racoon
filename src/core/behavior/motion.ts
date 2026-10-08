import type { Point } from '../geometry';

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

/** Shrinks a vector's length toward zero by at most `maxDelta`, keeping its direction. */
export function brake2d(v: Point, maxDelta: number): Point {
  const length = Math.hypot(v.x, v.y);
  if (length <= maxDelta) return { x: 0, y: 0 };
  const k = (length - maxDelta) / length;
  return { x: v.x * k, y: v.y * k };
}

export function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
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
