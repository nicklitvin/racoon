import type { Point } from '../geometry';

export interface CursorTrackerOptions {
  /** Higher = reacts to gentler movement. 1 is the default. */
  sensitivity?: number;
  /** Length of the rolling window, in ms. */
  windowMs?: number;
}

interface Sample {
  t: number;
  p: Point;
}

/** Below this the cursor counts as not moving (pointer jitter, high-DPI rounding). */
const MOVE_EPSILON_PX = 2;
/** Average speed that counts as "fast" on its own, at sensitivity 1. */
const FAST_PX_PER_S = 1400;
/** Lower speed that still counts when the path is zig-zagging. */
const ERRATIC_PX_PER_S = 650;
/** Direction reversals within the window that make movement "erratic". */
const ERRATIC_TURNS = 4;
/** How long movement must stay fast or erratic before the raccoon gets excited. */
const SUSTAIN_MS = 1500;

/**
 * Rolling-window statistics over cursor positions: speed, path length and how
 * erratic the movement is, plus whether that has been sustained long enough
 * to excite the raccoon.
 */
export class CursorActivityTracker {
  private samples: Sample[] = [];
  private lastMoveAt = -Infinity;
  private franticSince: number | null = null;
  private sensitivity: number;
  private readonly windowMs: number;

  constructor(options: CursorTrackerOptions = {}) {
    this.sensitivity = options.sensitivity ?? 1;
    this.windowMs = options.windowMs ?? 1000;
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  /** Records a cursor position. `null` means the cursor left the screen. */
  addSample(t: number, p: Point | null): void {
    if (!p) {
      this.samples = [];
      return;
    }
    const last = this.samples[this.samples.length - 1];
    if (!last || Math.hypot(p.x - last.p.x, p.y - last.p.y) >= MOVE_EPSILON_PX) this.lastMoveAt = t;
    this.samples.push({ t, p });
    this.prune(t);
  }

  /** Re-evaluates at time `t`; call every tick, since a stopped cursor sends no samples. */
  evaluate(t: number): void {
    this.prune(t);
    if (this.isFrantic(t)) this.franticSince ??= t;
    else this.franticSince = null;
  }

  /** Total distance travelled within the window, in px. */
  get pathLength(): number {
    let length = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1]!.p;
      const b = this.samples[i]!.p;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return length;
  }

  /** Average speed over the window, in px/s. */
  speed(t: number): number {
    if (this.samples.length < 2) return 0;
    const span = Math.max(t - this.samples[0]!.t, 100);
    return (this.pathLength / span) * 1000;
  }

  /** Number of sharp direction changes (over 90 degrees) within the window. */
  get turns(): number {
    let turns = 0;
    let prev: Point | null = null;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1]!.p;
      const b = this.samples[i]!.p;
      const d = { x: b.x - a.x, y: b.y - a.y };
      if (Math.hypot(d.x, d.y) < 4) continue;
      if (prev && prev.x * d.x + prev.y * d.y < 0) turns++;
      prev = d;
    }
    return turns;
  }

  isFrantic(t: number): boolean {
    const speed = this.speed(t) * this.sensitivity;
    return speed >= FAST_PX_PER_S || (speed >= ERRATIC_PX_PER_S && this.turns >= ERRATIC_TURNS);
  }

  /** True once movement has been fast or erratic for a sustained stretch. */
  isExcited(t: number): boolean {
    return this.franticSince !== null && t - this.franticSince >= SUSTAIN_MS / Math.sqrt(this.sensitivity);
  }

  stillFor(t: number): number {
    return t - this.lastMoveAt;
  }

  get latest(): Point | null {
    return this.samples[this.samples.length - 1]?.p ?? null;
  }

  private prune(t: number): void {
    const cutoff = t - this.windowMs;
    let drop = 0;
    while (drop < this.samples.length - 1 && this.samples[drop]!.t < cutoff) drop++;
    if (drop) this.samples.splice(0, drop);
    // Keep the last sample even when stale, as the reference point for the next move.
    if (this.samples.length === 1 && this.samples[0]!.t < cutoff) this.samples[0]!.t = cutoff;
  }
}
