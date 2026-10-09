import { describe, expect, it } from 'vitest';
import { isTurning, targetHeading, turnTowards, wrapAngle } from '../src/core/heading';

const still = { x: 0, y: 0 };

describe('heading', () => {
  it('wraps angles into -PI..PI', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
  });

  it('faces the way he moves', () => {
    expect(targetHeading(0, { velocity: { x: 0, y: 100 }, facing: 1, animation: 'walk' })).toBeCloseTo(Math.PI / 2);
    expect(targetHeading(0, { velocity: { x: -100, y: 0 }, facing: -1, animation: 'run' })).toBeCloseTo(Math.PI);
  });

  it('keeps his heading while standing, unless the behaviour turned him round', () => {
    expect(targetHeading(0.6, { velocity: still, facing: 1, animation: 'idle' })).toBe(0.6);
    // Facing down-right but told to face left: mirror to down-left.
    expect(targetHeading(0.6, { velocity: still, facing: -1, animation: 'idle' })).toBeCloseTo(Math.PI - 0.6);
    // Facing straight at you, left/right doesn't matter.
    expect(targetHeading(Math.PI / 2, { velocity: still, facing: -1, animation: 'idle' })).toBe(Math.PI / 2);
  });

  it('faces you while peeking and holds still while dangling', () => {
    expect(targetHeading(0, { velocity: still, facing: 1, animation: 'peek' })).toBeCloseTo(Math.PI / 2);
    expect(targetHeading(1, { velocity: { x: 500, y: 0 }, facing: 1, animation: 'dangle' })).toBe(1);
  });

  it('turns smoothly the short way round and settles', () => {
    let h = 3; // just short of PI, facing left
    const target = -3; // also nearly left, the other side of the wrap
    const first = turnTowards(h, target, 16);
    // Short way round goes up through PI, not down through 0.
    expect(Math.abs(wrapAngle(first - Math.PI))).toBeLessThan(Math.abs(wrapAngle(h - Math.PI)) + 1e-9);
    for (let i = 0; i < 200 && isTurning(h, target); i++) h = turnTowards(h, target, 16);
    expect(isTurning(h, target)).toBe(false);
    expect(h).toBeCloseTo(target);
  });
});
