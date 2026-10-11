import type { Point } from '../../core/geometry';

/**
 * The camera. The screen is treated as a floor seen from a little above: a step towards
 * you moves `DEPTH` times as far down the screen as a step sideways moves across it.
 * Heights are drawn at full size, so a side view looks exactly as posed.
 *
 * The animal is posed in its own frame: `a` forward along the body, `y` down (negative is
 * up, the ground is y = 0) and `z` out of its right side. It stands at the origin facing
 * `yaw` on the floor (radians, screen axes: 0 = right, PI/2 = towards you).
 */
export const DEPTH = 0.55;

export interface Projected extends Point {
  /** Towards the viewer: larger is nearer. */
  z: number;
}

export class BodyView {
  readonly c: number;
  readonly s: number;

  constructor(readonly yaw: number) {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }

  /** A point (or, the map being linear, a direction) in the animal's frame, on screen. */
  at(a: number, y: number, z = 0): Projected {
    const across = a * this.c - z * this.s;
    const towards = a * this.s + z * this.c;
    return { x: across, y: y + towards * DEPTH, z: towards - y * DEPTH };
  }

  /** How far towards the viewer a point is along the floor (ignoring its height). */
  towards(a: number, z = 0): number {
    return a * this.s + z * this.c;
  }

  pt(p: Point, z = 0): Projected {
    return this.at(p.x, p.y, z);
  }

  /** How squarely the animal's right side faces the viewer: 1 side-on facing right, -1 facing left. */
  get side(): number {
    return this.c;
  }

  /** How much a surface facing `normal` (animal frame) faces the viewer, -1..1. */
  facing(a: number, y: number, z: number): number {
    const d = this.at(a, y, z);
    const l = Math.hypot(a, y, z) || 1;
    // The view ray runs towards the viewer and up: (0, -DEPTH, 1) in (across, y, towards).
    return d.z / (l * Math.hypot(1, DEPTH));
  }
}

/** Screen degrees of a world heading, and back: walking up the screen is walking away. */
export function worldYaw(screenHeading: number): number {
  return Math.atan2(Math.sin(screenHeading) / DEPTH, Math.cos(screenHeading));
}

/** An ellipse on screen: centre, radii and rotation in degrees. */
export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  angle: number;
}

/**
 * The outline of a solid ellipsoid with its centre and three semi-axes already on screen.
 * (The image of an ellipsoid under a linear map is an ellipse; its shape matrix is the sum
 * of the axes' outer products.)
 */
export function ellipseOf(centre: Point, axes: Point[]): Ellipse {
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const v of axes) {
    xx += v.x * v.x;
    xy += v.x * v.y;
    yy += v.y * v.y;
  }
  const mean = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  return {
    cx: centre.x,
    cy: centre.y,
    rx: Math.sqrt(Math.max(1e-6, mean + spread)),
    ry: Math.sqrt(Math.max(1e-6, mean - spread)),
    angle: (Math.atan2(2 * xy, xx - yy) / 2) * (180 / Math.PI),
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** An ellipse as a path, always wound the same way so several fill as one shape. */
export function ellipsePath(e: Ellipse): string {
  const a = (e.angle * Math.PI) / 180;
  const dx = Math.cos(a) * e.rx;
  const dy = Math.sin(a) * e.rx;
  const arc = `A${r2(e.rx)} ${r2(e.ry)} ${r2(e.angle)} 0 1`;
  return `M${r2(e.cx + dx)} ${r2(e.cy + dy)}${arc} ${r2(e.cx - dx)} ${r2(e.cy - dy)}${arc} ${r2(e.cx + dx)} ${r2(e.cy + dy)}Z`;
}
