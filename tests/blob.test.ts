import { describe, expect, it } from 'vitest';
import { OUTFITS } from '../shared/settings';
import { ChibiMotion } from '../src/sprites/chibi';
import type { ChibiPose } from '../src/sprites/chibi/pose';
import { BLOB, BLOB_R, drawBlob, hoverFor } from '../src/sprites/pixel/blob';
import { PIXEL } from '../src/sprites/pixel/draw';
import { C } from '../src/sprites/pixel/palette';
import { Raster } from '../src/sprites/pixel/raster';
import type { Dress } from '../src/sprites/outfits';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

/** The puffball, `ms` into an animation, going `heading`. */
function draw(animation: AnimationName, ms = 900, heading = 0, dress: Dress = { hat: 'none', outfit: 'none' }) {
  const motion = new ChibiMotion(BLOB);
  let clock = 10_000;
  let pose!: ChibiPose;
  for (let t = 0; t <= ms; t += 16) {
    clock += 16;
    pose = motion.update({ animation, timeMs: t, keystrokes: 0, eyes: 'open', heading, clockMs: clock, velocity: { x: 80 * Math.cos(heading), y: 80 * Math.sin(heading) } }, 1);
  }
  const r = new Raster(PIXEL.width, PIXEL.height);
  const drawn = drawBlob(r, pose, { animation, t: ms, clock, facing: motion.facing, view: motion.view, moving: motion.moving, phase: motion.phase, hover: hoverFor(animation) }, dress);
  return { r, ...drawn };
}

const count = (r: Raster, c: number) => r.data.filter((v) => v === c).length;

describe('pixel puffball', () => {
  it('draws every animation inside its canvas', () => {
    for (const animation of ANIMATION_NAMES) {
      const { r, box } = draw(animation);
      expect(box, animation).not.toBe(null);
      expect(box!.x0, animation).toBeGreaterThanOrEqual(0);
      expect(box!.x1, animation).toBeLessThanOrEqual(PIXEL.width);
      expect(box!.y0, animation).toBeGreaterThan(0);
      // A whole round ball of it.
      expect(box!.y1 - box!.y0, animation).toBeGreaterThan(BLOB_R * PIXEL.k * 1.5);
      expect(count(r, C.outline), animation).toBeGreaterThan(20);
    }
  });

  it('floats above the floor getting about, and comes down to sit and sleep', () => {
    for (const animation of ['idle', 'walk', 'run'] as const) expect(draw(animation).box!.y1, animation).toBeLessThan(PIXEL.feetY - 2);
    for (const animation of ['sit', 'sleep', 'work'] as const) expect(draw(animation).box!.y1, animation).toBeGreaterThanOrEqual(PIXEL.feetY - 1);
    // Its shadow stays on the floor underneath.
    expect(count(draw('walk').r, C.shadow)).toBeGreaterThan(4);
  });

  it('has a face side on and from the front, and none from behind', () => {
    expect(count(draw('walk').r, C.eye)).toBeGreaterThan(6);
    expect(count(draw('walk', 900, Math.PI / 2).r, C.eye)).toBeGreaterThan(6);
    expect(count(draw('walk', 900, -Math.PI / 2).r, C.eye)).toBe(0);
  });

  it('turns to face left as a mirror image of facing right', () => {
    const right = draw('sit', 900, 0).box!;
    const left = draw('sit', 900, Math.PI).box!;
    expect(left.x0).toBeCloseTo(2 * PIXEL.feetX - right.x1, -0.5);
    expect(left.x1).toBeCloseTo(2 * PIXEL.feetX - right.x0, -0.5);
  });

  it('shows z’s asleep and hearts when happy', () => {
    expect(count(draw('sleep').r, C.mark)).toBeGreaterThan(3);
    expect(count(draw('happy').r, C.heart)).toBeGreaterThan(3);
  });

  it('is held by the top of its head', () => {
    const { scruff, box } = draw('dangle');
    expect(PIXEL.feetY + scruff.y * PIXEL.k).toBeLessThan(box!.y0 + 4);
  });

  it('wears every outfit and a hat', () => {
    for (const outfit of OUTFITS) {
      if (outfit === 'none') continue;
      const { r } = draw('idle', 900, 0, { hat: 'wizard', outfit });
      expect(count(r, C.wearMain) + count(r, C.wearTrim) + count(r, C.wearAccent), outfit).toBeGreaterThan(4);
      expect(count(r, C.hatMain), outfit).toBeGreaterThan(5);
    }
  });
});
