import { describe, expect, it } from 'vitest';
import { clamp, clampFeet, inflate, pointInRect } from '../src/core/geometry';

describe('geometry', () => {
  it('clamps into a range, preferring min when the range is empty', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('inflates a rect on every side', () => {
    expect(inflate({ x: 10, y: 10, width: 20, height: 20 }, 5)).toEqual({ x: 5, y: 5, width: 30, height: 30 });
  });

  it('includes rect edges in hit tests', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(pointInRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, r)).toBe(true);
    expect(pointInRect({ x: 10.1, y: 5 }, r)).toBe(false);
  });

  describe('clampFeet', () => {
    const screen = { x: 0, y: 0, width: 1000, height: 700 };
    const size = { width: 100, height: 60 };

    it('leaves an on-screen position alone', () => {
      expect(clampFeet({ x: 500, y: 700 }, size, screen)).toEqual({ x: 500, y: 700 });
    });

    it('keeps the whole sprite inside the bounds', () => {
      expect(clampFeet({ x: 10, y: 20 }, size, screen)).toEqual({ x: 50, y: 60 });
      expect(clampFeet({ x: 2000, y: 2000 }, size, screen)).toEqual({ x: 950, y: 700 });
    });

    it('pulls the raccoon back in when the display shrinks', () => {
      const smaller = { x: 0, y: 0, width: 800, height: 500 };
      expect(clampFeet({ x: 900, y: 700 }, size, smaller)).toEqual({ x: 750, y: 500 });
    });
  });
});
