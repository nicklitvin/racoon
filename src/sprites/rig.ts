import type { Point } from '../core/geometry';

/**
 * The raccoon's skeleton, in drawing units. The raccoon faces right with his feet at
 * (0, 0); negative y is up. Poses move these joints and the SVG renderer draws body
 * parts hanging off them, so a pose never needs to know what the parts look like.
 */
export const RIG = {
  /** Visible box around the feet origin. Tall enough for him standing up to peek. */
  view: { x: -64, y: -90, width: 128, height: 92 },
  /** Whole-body pitch pivots here. Back legs hang from it. */
  hip: { x: -20, y: -20 },
  shoulder: { x: 14, y: -20 },
  /** The far legs sit a little in front of the near ones. */
  farLegOffset: 5,
  neck: { x: 20, y: -32 },
  tailRoot: { x: -28, y: -32 },
  /** Dangling from the scruff swings around here. */
  scruff: { x: -16, y: -62 },
  legLength: 20,
} as const;

export interface Leg {
  /** Degrees from straight down, in screen space; positive swings forward. */
  angle: number;
  length: number;
}

export type LegName = 'frontNear' | 'frontFar' | 'backNear' | 'backFar';

export interface Pose {
  /** Whole-body vertical offset (negative = up). */
  y: number;
  /** Whole-body rotation around the hip, degrees; negative lifts the front. */
  pitch: number;
  /** Swing of the whole figure around the scruff, degrees. */
  swing: number;
  /** Vertical scale of the body, for breathing. */
  breathe: number;
  /** Head rotation around the neck relative to the body (positive = nod down), plus an offset. */
  head: { angle: number; x: number; y: number };
  /** Tail rotation (positive = raised) and puffiness. */
  tail: { angle: number; puff: number };
  legs: Record<LegName, Leg>;
  /** Where the pupils point, each axis -1..1. */
  look: Point;
  /** 0 closed, 1 wide open. */
  mouth: number;
  /** 0 pricked up, 1 flat back. */
  ears: number;
}

const DEG = Math.PI / 180;

function rotate(p: Point, degrees: number, pivot: Point): Point {
  const c = Math.cos(degrees * DEG);
  const s = Math.sin(degrees * DEG);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c };
}

/** Where a leg is attached, in body (unrotated) coordinates. */
export function legRoot(leg: LegName): Point {
  const base = leg.startsWith('front') ? RIG.shoulder : RIG.hip;
  return leg.endsWith('Far') ? { x: base.x + RIG.farLegOffset, y: base.y } : { ...base };
}

/** Maps a point from body coordinates to the drawing, applying the pose's whole-body transforms. */
export function toWorld(p: Point, pose: Pose): Point {
  const pitched = rotate(p, pose.pitch, RIG.hip);
  const lowered = { x: pitched.x, y: pitched.y + pose.y };
  return rotate(lowered, pose.swing, RIG.scruff);
}

/**
 * The rotation the renderer applies to a leg inside the pitched, swung body so that
 * it ends up at `leg.angle` on screen.
 */
export function legRotation(pose: Pose, leg: LegName): number {
  return -pose.legs[leg].angle - pose.pitch - pose.swing;
}

/** Where a paw ends up in the drawing. */
export function pawPosition(pose: Pose, leg: LegName): Point {
  const root = toWorld(legRoot(leg), pose);
  const { angle, length } = pose.legs[leg];
  // Matches legRotation: legs keep their screen angle whatever the body does.
  const a = angle * DEG;
  return { x: root.x + Math.sin(a) * length, y: root.y + Math.cos(a) * length };
}

/** A leg at `angle` that's just long enough to reach the line y = `groundY`. */
export function plantedLeg(pose: Pose, leg: LegName, angle: number, groundY = 0): Leg {
  const root = toWorld(legRoot(leg), pose);
  const length = (groundY - root.y) / Math.cos(angle * DEG);
  return { angle, length: Math.max(2, length) };
}
