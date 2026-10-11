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
  /** Curvature of the spine (radians per unit along it) and the stretch it bends over. */
  private readonly k: number;

  /**
   * `bend` curves the spine sideways (radians from hips to shoulders, + towards his right
   * side), as when he turns: the shoulders lead and the hips follow, the body bowed between
   * them. It bends evenly from `mid - half` to `mid + half` along the body; the head and
   * the tail carry on straight from each end. `yaw` is the heading of the middle.
   */
  constructor(
    readonly yaw: number,
    readonly bend = 0,
    private readonly mid = 0,
    private readonly half = 1,
  ) {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.k = bend / (2 * Math.max(1, half));
  }

  /** How far the body has turned at `a` along it, from the heading of its middle (radians). */
  turnAt(a: number): number {
    return this.k * Math.max(-this.half, Math.min(this.half, a - this.mid));
  }

  /** The heading of the body at `a` along it. */
  yawAt(a: number): number {
    return this.yaw + this.turnAt(a);
  }

  /** The same camera, unbent, turned as the body is at `a`: for directions and facings there. */
  local(a: number): BodyView {
    return this.bend === 0 ? this : new BodyView(this.yawAt(a));
  }

  /** Where a point of the straight body goes once the spine bends: along and sideways. */
  private warp(a: number, z: number): [number, number] {
    if (this.k === 0) return [a, z];
    const u = a - this.mid;
    const inside = Math.max(-this.half, Math.min(this.half, u));
    const phi = this.k * inside;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    // Along the arc of the spine, then straight on past its ends.
    const along = Math.sin(phi) / this.k + (u - inside) * cos;
    const aside = (1 - cos) / this.k + (u - inside) * sin;
    return [this.mid + along - z * sin, aside + z * cos];
  }

  /** A point in the animal's frame, on screen. */
  at(a: number, y: number, z = 0): Projected {
    const [wa, wz] = this.warp(a, z);
    return this.project(wa, y, wz);
  }

  /** A direction in the animal's frame, at `a` along the body (the middle if not given), on screen. */
  vec(a: number, y: number, z = 0, where = this.mid): Projected {
    const phi = this.turnAt(where);
    if (phi === 0) return this.project(a, y, z);
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    return this.project(a * cos - z * sin, y, a * sin + z * cos);
  }

  private project(a: number, y: number, z: number): Projected {
    const across = a * this.c - z * this.s;
    const towards = a * this.s + z * this.c;
    return { x: across, y: y + towards * DEPTH, z: towards - y * DEPTH };
  }

  /** How far towards the viewer a point is along the floor (ignoring its height). */
  towards(a: number, z = 0): number {
    const [wa, wz] = this.warp(a, z);
    return wa * this.s + wz * this.c;
  }

  pt(p: Point, z = 0): Projected {
    return this.at(p.x, p.y, z);
  }

  /** How squarely the animal's right side faces the viewer: 1 side-on facing right, -1 facing left. */
  get side(): number {
    return this.c;
  }

  /** How much a surface facing `normal` (animal frame, unbent) faces the viewer, -1..1. */
  facing(a: number, y: number, z: number): number {
    const d = this.project(a, y, z);
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
