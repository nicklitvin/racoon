import { screen, type Rectangle } from 'electron';
import type { Point } from '../shared/ipc';

/**
 * Polls the global cursor position and reports it relative to the pet window.
 * Only sends when the position changes, so a still mouse costs one cheap call per tick.
 */
export class CursorMonitor {
  private timer: NodeJS.Timeout | undefined;
  private last: Point | null | undefined;

  constructor(
    private readonly send: (cursor: Point | null) => void,
    private bounds: Rectangle,
    private readonly intervalMs = 1000 / 40,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.last = undefined;
  }

  /** The pet window moved or resized (display change). */
  setBounds(bounds: Rectangle): void {
    this.bounds = bounds;
    this.last = undefined;
  }

  private poll(): void {
    const p = screen.getCursorScreenPoint();
    const b = this.bounds;
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    const next = inside ? { x: p.x - b.x, y: p.y - b.y } : null;
    const last = this.last;
    if (last !== undefined && (last === null ? next === null : next !== null && next.x === last.x && next.y === last.y)) return;
    this.last = next;
    this.send(next);
  }
}
