import type { Point } from '../../core/geometry';
import { DEG } from './kit';

/**
 * The head is modelled in 3D (a skull with features placed on it) and projected, so it can
 * turn from profile to facing you with the eyes, ears and nose sliding round and
 * foreshortening as they would on a real head.
 *
 * Head coordinates: f forward (towards the nose), u up, s out of the near side. Units are
 * drawing units from the centre of the skull.
 */
export interface V3 {
  f: number;
  u: number;
  s: number;
}

export interface Projected extends Point {
  /** Towards the viewer: larger is nearer. */
  z: number;
}

export class HeadView {
  private readonly cp: number;
  private readonly sp: number;
  private readonly cy: number;
  private readonly sy: number;
  private readonly cr: number;
  private readonly sr: number;

  constructor(
    readonly centre: Point,
    /** Nod down, degrees. */
    pitch: number,
    /** Turn towards the viewer, degrees: 0 is profile (facing right), 90 is facing you. */
    yaw: number,
    /** Tilt, degrees, clockwise on screen. */
    roll: number,
  ) {
    this.cp = Math.cos(pitch * DEG);
    this.sp = Math.sin(pitch * DEG);
    this.cy = Math.cos(yaw * DEG);
    this.sy = Math.sin(yaw * DEG);
    this.cr = Math.cos(roll * DEG);
    this.sr = Math.sin(roll * DEG);
  }

  /** A direction in head coordinates, on screen (no translation). */
  vec(v: V3): Projected {
    const f2 = v.f * this.cp + v.u * this.sp;
    const u2 = v.u * this.cp - v.f * this.sp;
    const x = f2 * this.cy - v.s * this.sy;
    const z = f2 * this.sy + v.s * this.cy;
    const y = -u2;
    return { x: x * this.cr - y * this.sr, y: x * this.sr + y * this.cr, z };
  }

  at(v: V3): Projected {
    const p = this.vec(v);
    return { x: this.centre.x + p.x, y: this.centre.y + p.y, z: p.z };
  }

  /**
   * A disc lying on the head at `centre`, facing `normal`, for drawing features like eyes:
   * null if it faces away. `twist` turns it in its own plane.
   */
  disc(centre: V3, normal: V3, twist = 0): Disc | null {
    const nn = normalise(normal);
    const nrm = this.vec(nn);
    if (nrm.z <= 0.02) return null;
    // Across: perpendicular to "up" and the normal; then down the face.
    let across = normalise({ f: nn.s, u: 0, s: -nn.f });
    let down = cross(across, nn);
    if (twist) {
      const c = Math.cos(twist * DEG);
      const s = Math.sin(twist * DEG);
      [across, down] = [mix3(across, down, c, s), mix3(down, across, c, -s)];
    }
    return { across: this.vec(across), down: this.vec(down), at: this.at(centre), facing: nrm.z };
  }
}

/** A flat disc lying on the head: its centre and its axes on screen. */
export interface Disc {
  across: Point;
  down: Point;
  at: Point;
  /** How squarely it faces the viewer, 0..1. */
  facing: number;
}

/** Maps a point drawn on a unit disc (x across, y down) with radii rx, ry onto the screen. */
export function onDisc(d: Disc, x: number, y: number, rx: number, ry: number): Point {
  return { x: d.at.x + d.across.x * x * rx + d.down.x * y * ry, y: d.at.y + d.across.y * x * rx + d.down.y * y * ry };
}

export function normalise(v: V3): V3 {
  const l = Math.hypot(v.f, v.u, v.s) || 1;
  return { f: v.f / l, u: v.u / l, s: v.s / l };
}

/** Cross product in (f, u, s) order. */
function cross(a: V3, b: V3): V3 {
  return { f: a.u * b.s - a.s * b.u, u: a.s * b.f - a.f * b.s, s: a.f * b.u - a.u * b.f };
}

function mix3(a: V3, b: V3, ka: number, kb: number): V3 {
  return { f: a.f * ka + b.f * kb, u: a.u * ka + b.u * kb, s: a.s * ka + b.s * kb };
}

/** A point on the skull's surface in direction `v`, at radius `r`. */
export function onSphere(v: V3, r: number): V3 {
  const n = normalise(v);
  return { f: n.f * r, u: n.u * r, s: n.s * r };
}

export const v3 = (f: number, u: number, s: number): V3 => ({ f, u, s });
