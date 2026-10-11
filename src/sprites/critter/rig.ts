import type { Point } from '../../core/geometry';
import type { LegName } from '../rig';
import type { Build } from './build';
import { add, angleOf, DEG, dir, ik, rotate, scale, sub, unit } from './kit';
import { paw, type Pose } from './pose';

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
  const base = front ? frame.s : frame.p;
  // The far shoulder and hip sit a touch higher and behind, as seen in perspective.
  const root = far ? add(base, add(scale(frame.along, build.farOffset * 0.6), scale(frame.up, 0.8))) : base;
  const [upper, lower, end] = front ? build.front : build.back;
  const p = paw(pose, leg);
  // The hand or foot bone runs from the paw up to the wrist or hock at the given lean.
  const low = add(p, scale(dir(-90 - p.a), end));
  // Elbows point back, knees point forward.
  const mid = ik(root, low, upper, lower, front ? 1 : -1);
  return { root, mid, low, paw: p, lean: p.a };
}

export const radians = (deg: number) => deg * DEG;

export { rotate };
