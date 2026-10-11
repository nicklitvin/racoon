import type { Point } from '../../core/geometry';
import type { LegName } from './pose';
import type { Build } from './build';
import { add, angleOf, DEG, dir, ik, lerp, rotate, scale, sub, unit } from './kit';
import { LEGS, paw, setPaw, type Pose } from './pose';

/**
 * Turns a pose into joint positions: the spine frame between hip and shoulder, each leg's
 * knee or elbow, and where the tail starts.
 */

export interface Frame {
  /** Hip and shoulder joints. */
  p: Point;
  s: Point;
  /** Along the spine (hip → shoulder) and up from it. */
  along: Point;
  up: Point;
  length: number;
  /** Angle of the spine, screen degrees. */
  angle: number;
}

export function spineFrame(pose: Pose): Frame {
  const p = { x: pose.px, y: pose.py };
  const s = { x: pose.sx, y: pose.sy };
  const v = sub(s, p);
  const along = unit(v);
  return { p, s, along, up: { x: along.y, y: -along.x }, length: Math.hypot(v.x, v.y), angle: angleOf(v) };
}

/**
 * A point on the body, `a` units along the spine from the hip and `b` up from it. The spine
 * bows up by `arch` in the middle, so the back curves and the belly follows.
 */
export function bodyAt(frame: Frame, pose: Pose, a: number, b: number): Point {
  const t = a / (frame.length || 1);
  const bow = t > 0 && t < 1 ? 4 * t * (1 - t) * pose.arch : 0;
  return add(frame.p, add(scale(frame.along, a), scale(frame.up, b + bow)));
}

export function tailRoot(build: Build, pose: Pose): Point {
  const frame = spineFrame(pose);
  return bodyAt(frame, pose, build.tail.root.x, -build.tail.root.y);
}

/** Rest shape of the tail as absolute segment angles, before physics. */
export function tailRest(build: Build, pose: Pose): number[] {
  const frame = spineFrame(pose);
  const count = build.tail.segments;
  const angles: number[] = [];
  let a = pose.tailA + frame.angle;
  for (let i = 0; i < count; i++) {
    const tipward = i / (count - 1);
    a += pose.tailBend + pose.tailCurl * Math.max(0, tipward - 0.55) * 2.2 + (tipward < 0.3 ? pose.tailKink : 0);
    angles.push(a);
  }
  return angles;
}

export interface LegJoints {
  /** Where the leg hangs from: hip or shoulder (shifted for the far side). */
  root: Point;
  /** Sideways position of each joint (out of the right side), root to paw. */
  z: { root: number; mid: number; low: number; paw: number };
  /** Knee or elbow. */
  mid: Point;
  /** Hock or wrist. */
  low: Point;
  paw: Point;
  /** Lean of the hand or foot bone. */
  lean: number;
}

export function legJoints(build: Build, pose: Pose, leg: LegName): LegJoints {
  const front = leg.startsWith('front');
  const far = leg.endsWith('Far');
  const frame = spineFrame(pose);
  const [upper, lower, end] = front ? build.front : build.back;
  const p = paw(pose, leg);
  // The hand or foot bone runs from the paw up to the wrist or hock at the given lean.
  const low = add(p, scale(dir(-90 - p.a), end));
  let root = front ? shoulderJoint(build, frame) : frame.p;
  if (front) {
    // The shoulder blade slides towards a paw that's further than the leg reaches.
    const gap = sub(low, root);
    const short = Math.hypot(gap.x, gap.y) - (upper + lower) * 0.995;
    if (short > 0) root = add(root, scale(unit(gap), Math.min(short, build.scapula)));
  }
  // Elbows point back, knees point forward.
  const mid = ik(root, low, upper, lower, front ? 1 : -1);
  const side = far ? -1 : 1;
  const { stance } = build;
  const rootZ = side * (front ? stance.shoulder : stance.hip);
  const pawZ = side * ((front ? stance.frontPaw : stance.backPaw) + (front ? pose.fspread : pose.bspread));
  const z = { root: rootZ, mid: lerp(rootZ, pawZ, 0.55), low: lerp(rootZ, pawZ, 0.9), paw: pawZ };
  return { root, z, mid, low, paw: p, lean: p.a };
}

/**
 * Keeps every leg within its length. Where a paw is too far from the hip or shoulder to
 * reach (the end of a long step, a stretch), the hand or foot tips up about the paw, as
 * the heel or wrist lifts on a real animal, until the leg can reach it. The paw itself
 * never moves, so a planted paw stays planted.
 */
export function keepInReach(build: Build, pose: Pose): void {
  const frame = spineFrame(pose);
  for (const leg of LEGS) {
    const front = leg.startsWith('front');
    const [upper, lower, end] = front ? build.front : build.back;
    // The shoulder blade can slide a little way to help (see `legJoints`).
    const reach = (upper + lower) * 0.995 + (front ? build.scapula : 0);
    const root = front ? shoulderJoint(build, frame) : frame.p;
    const p = paw(pose, leg);
    const low = add(p, scale(dir(-90 - p.a), end));
    if (Math.hypot(low.x - root.x, low.y - root.y) <= reach) continue;
    // The hand or foot bone turned about the paw so the wrist or hock is just in reach,
    // the least turn that does it; out of reach even so, it points straight at the joint.
    const toRoot = sub(root, p);
    const d = Math.hypot(toRoot.x, toRoot.y);
    const base = angleOf(toRoot);
    const cos = (d * d + end * end - reach * reach) / (2 * d * end);
    const now = -90 - p.a;
    let angle = base;
    if (cos <= 1) {
      const spread = Math.acos(Math.max(-1, cos)) / DEG;
      const nearest = (a: number) => Math.abs(((((a - now + 180) % 360) + 360) % 360) - 180);
      angle = nearest(base + spread) < nearest(base - spread) ? base + spread : base - spread;
    }
    setPaw(pose, leg, p.x, p.y, -90 - angle);
  }
}

/**
 * Where the arms hang from. On all fours that's the top of the spine; sat or stood up, the
 * shoulder joints sit lower down the front of the chest, below the neck, so the arms come
 * from the chest rather than from under the chin.
 */
export function shoulderJoint(build: Build, frame: Frame): Point {
  const drop = build.uprightShoulder * uprightness(frame);
  return add(frame.s, add(scale(frame.along, -drop), scale(frame.up, -drop * 0.33)));
}

/** How upright the body is: 0 on all fours (or anything flatter than about 30° up), 1 straight up. */
export function uprightness(frame: Frame): number {
  return Math.min(1, Math.max(0, (-Math.sin(frame.angle * DEG) - 0.5) / 0.4));
}

/**
 * The scruff: the loose skin at the back of the neck, between the shoulders and the back
 * of the skull. Where a mother cat carries a kitten, and where he's held when picked up.
 */
export function scruffAt(build: Build, pose: Pose): Point {
  const frame = spineFrame(pose);
  const shoulderTop = bodyAt(frame, pose, frame.length + 1, 7);
  const R = build.head.r;
  const headBack = { x: pose.hx - R * 0.75, y: pose.hy - R * 0.35 };
  return { x: lerp(shoulderTop.x, headBack.x, 0.45), y: lerp(shoulderTop.y, headBack.y, 0.45) };
}

export const radians = (deg: number) => deg * DEG;

export { rotate };
