import type { Point, Rect } from '../../shared/ipc';

export type { Point, Rect };

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

export function pointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
}

/**
 * Clamps a sprite's feet (bottom-centre anchor) so the whole sprite stays inside `bounds`.
 */
export function clampFeet(feet: Point, size: { width: number; height: number }, bounds: Rect): Point {
  const half = size.width / 2;
  return {
    x: clamp(feet.x, bounds.x + half, bounds.x + bounds.width - half),
    y: clamp(feet.y, bounds.y + size.height, bounds.y + bounds.height),
  };
}
