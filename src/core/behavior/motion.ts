import type { Point } from '../geometry';

/** Moves `value` toward `target` by at most `maxDelta`. */
export function approach(value: number, target: number, maxDelta: number): number {
  const delta = target - value;
  if (Math.abs(delta) <= maxDelta) return target;
  return value + Math.sign(delta) * maxDelta;
}

/**
 * The fastest he can be going this far from where he's stopping and still stop there,
 * braking with `accel` (with a little to spare), so he never overshoots and slides back.
 */
export function stoppingSpeed(distance: number, accel: number): number {
  return Math.sqrt(2 * accel * BRAKING * distance);
}
/** Of his acceleration, how much he brakes with when arriving somewhere. */
const BRAKING = 0.8;

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
  const desiredSpeed = Math.min(maxSpeed * Math.min(1, distance / slowRadius), stoppingSpeed(distance, accel));
  const desired = distance > 0 ? { x: (dx / distance) * desiredSpeed, y: (dy / distance) * desiredSpeed } : { x: 0, y: 0 };
  const change = { x: desired.x - velocity.x, y: desired.y - velocity.y };
  const changeLength = Math.hypot(change.x, change.y);
  const maxChange = accel * dt;
  if (changeLength <= maxChange) return desired;
  return { x: velocity.x + (change.x / changeLength) * maxChange, y: velocity.y + (change.y / changeLength) * maxChange };
}

/**
 * Arrive steering for an animal rather than a hovercraft: on the move, the direction of
 * travel can only swing round so fast (the faster he goes, the wider the turn), and he
 * slows down to turn sharply. So he runs round in curves to something behind him instead
 * of braking to a stop and reversing, and his body always points the way he's going.
 * From a standstill he sets off straight towards the target.
 */
export function steerArc(
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
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < STANDING_SPEED || distance < 1e-6) return steer2d(position, velocity, target, maxSpeed, accel, dt, slowRadius);
  const heading = Math.atan2(velocity.y, velocity.x);
  const want = Math.atan2(dy, dx);
  let off = want - heading;
  off -= Math.PI * 2 * Math.round(off / (Math.PI * 2));
  // Cornering: sideways grip limits the turn rate at speed; slowing down tightens the turn.
  const rate = Math.min(MAX_TURN_RATE, (accel * CORNER_GRIP) / speed);
  const turned = heading + Math.max(-rate * dt, Math.min(rate * dt, off));
  const facing = (1 + Math.cos(off)) / 2;
  const desired = Math.min(maxSpeed * Math.min(1, distance / slowRadius) * (0.2 + 0.8 * facing ** 1.5), stoppingSpeed(distance, accel));
  const next = approach(speed, desired, accel * dt);
  return { x: Math.cos(turned) * next, y: Math.sin(turned) * next };
}
/** Below this speed (px/s) he can set off in any direction. */
const STANDING_SPEED = 40;
/** The quickest he can swing round on the move, rad/s. */
const MAX_TURN_RATE = 9;
/** Sideways acceleration he can corner with, as a multiple of his forward acceleration. */
const CORNER_GRIP = 1.3;

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
