import { describe, expect, it } from 'vitest';
import { bodyCentre, drawFloaty, floatyPose, keyboardReach } from '../src/sprites/floaty/draw';
import { FLOATIES, type FloatyKind } from '../src/sprites/floaty/kinds';
import { PIXEL } from '../src/sprites/pixel/draw';
import { C } from '../src/sprites/pixel/palette';
import { Raster } from '../src/sprites/pixel/raster';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

const KINDS = Object.keys(FLOATIES) as FloatyKind[];

function draw(kind: FloatyKind, animation: AnimationName, t = 300, heading = 0.6) {
  const b = FLOATIES[kind];
  const pose = floatyPose(b, animation, t, 10_000 + t, 'open', heading, 100, 1);
  const r = new Raster(PIXEL.width, PIXEL.height);
  const drawn = drawFloaty(r, b, pose, 10_000 + t, { hat: 'tophat', outfit: 'bowtie' });
  return { r, pose, ...drawn };
}

const count = (r: Raster, c: number) => r.data.filter((v) => v === c).length;

describe('floaties', () => {
  it('draw every animation, floating above the ground with a shadow under them', () => {
    for (const kind of KINDS) {
      for (const animation of ANIMATION_NAMES) {
        const { r, box, pose } = draw(kind, animation);
        expect(box, `${kind} ${animation}`).not.toBeNull();
        expect(count(r, C.fur), `${kind} ${animation}`).toBeGreaterThan(100);
        expect(count(r, C.shadow), `${kind} ${animation}`).toBeGreaterThan(0);
        // Nothing lower than the ground, and asleep it rests on it; otherwise it's up off it.
        expect(box!.y1, `${kind} ${animation}`).toBeLessThanOrEqual(PIXEL.feetY + 1);
        if (animation === 'sleep') expect(pose.hover).toBe(0);
        else expect(pose.hover, `${kind} ${animation}`).toBeGreaterThan(0.5);
      }
    }
  });

  it('bob up and down while idling', () => {
    const heights = new Set<number>();
    for (let t = 0; t < 3000; t += 100) heights.add(Math.round(floatyPose(FLOATIES.blip, 'idle', t, t, 'open', 0.6, 0, 0).hover * 2));
    expect(heights.size).toBeGreaterThan(3);
  });

  it('turn their faces the way they are going, and show their backs going away', () => {
    const eyes = (heading: number) => {
      const { r } = draw('blip', 'idle', 300, heading);
      const xs: number[] = [];
      r.data.forEach((v, i) => v === C.eye && xs.push(i % PIXEL.width));
      return xs;
    };
    const right = eyes(0);
    const left = eyes(Math.PI);
    expect(Math.min(...right)).toBeGreaterThan(PIXEL.feetX);
    expect(Math.max(...left)).toBeLessThan(PIXEL.feetX);
    expect(eyes(-Math.PI / 2)).toEqual([]);
  });

  it('type at their desks with their hands where the desk puts the keyboard', () => {
    for (const kind of KINDS) {
      const b = FLOATIES[kind];
      const keys = keyboardReach(b);
      const { hands } = draw(kind, 'work', 300, 0);
      const near = hands!.map((h) => Math.hypot(h.x - (PIXEL.feetX + keys.x), h.y - (PIXEL.feetY + keys.y)));
      expect(Math.min(...near), kind).toBeLessThan(4);
      // In front of its body, not inside it.
      expect(keys.x).toBeGreaterThan(b.R * b.wide);
      expect(bodyCentre(b, floatyPose(b, 'work', 0, 0, 'open', 0, 0, 0)).y).toBeLessThan(keys.y);
    }
  });
});
