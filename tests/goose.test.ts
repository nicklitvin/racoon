import { describe, expect, it } from 'vitest';
import { viewWhile } from '../src/sprites/chibi';
import { beakTip, bodyCentre, drawGoose, drawGooseFacing, GOOSE_QUARTER, goosePose, KEYBOARD } from '../src/sprites/goose/draw';
import { PIXEL } from '../src/sprites/pixel/draw';
import { C } from '../src/sprites/pixel/palette';
import { Raster } from '../src/sprites/pixel/raster';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

function draw(animation: AnimationName, t = 300, dir = 1) {
  const pose = goosePose(animation, t, 10_000 + t, 'open', 200, 1);
  const r = new Raster(PIXEL.width, PIXEL.height);
  const drawn = drawGoose(r, pose, dir, 10_000 + t, { hat: 'tophat', outfit: 'bowtie' });
  return { r, pose, ...drawn };
}

const count = (r: Raster, c: number) => r.data.filter((v) => v === c).length;

describe('the goose', () => {
  it('draws every animation: white, with an orange beak, on the ground and inside its box', () => {
    for (const animation of ANIMATION_NAMES) {
      const { r, box } = draw(animation);
      expect(box, animation).not.toBeNull();
      expect(count(r, C.fur) + count(r, C.furLight) + count(r, C.furDark), animation).toBeGreaterThan(200);
      expect(count(r, C.band), animation).toBeGreaterThan(3);
      expect(box!.y1, animation).toBeLessThanOrEqual(PIXEL.feetY + 1);
      expect(box!.x0, animation).toBeGreaterThan(0);
      expect(box!.x1, animation).toBeLessThan(PIXEL.width);
      expect(box!.y0, animation).toBeGreaterThan(0);
    }
  });

  it('faces the way it’s going', () => {
    const beakXs = (dir: number) => {
      const { tip } = draw('walk', 300, dir);
      return tip.x - PIXEL.feetX;
    };
    expect(beakXs(1)).toBeGreaterThan(8);
    expect(beakXs(-1)).toBeLessThan(-8);
  });

  it('charges with its neck out and its wings up, beak open', () => {
    const stand = goosePose('idle', 3000, 13_000, 'open', 0, 0);
    const charge = goosePose('chase', 100, 10_100, 'open', 400, 0);
    expect(charge.head.x).toBeGreaterThan(stand.head.x + 5);
    expect(charge.head.y).toBeGreaterThan(stand.head.y + 8);
    expect(charge.wing).toBeGreaterThan(0.8);
    expect(charge.beak).toBeGreaterThan(0.3);
  });

  it('honks with its beak open and shut', () => {
    const open = new Set<number>();
    for (let t = 0; t < 1200; t += 50) open.add(Math.round(goosePose('attention', t, 10_000 + t, 'open', 0, 0).beak * 4));
    expect(open.has(0)).toBe(true);
    expect(Math.max(...open)).toBeGreaterThanOrEqual(3);
  });

  it('pecks at the keys where the desk puts the keyboard', () => {
    let lowest = -Infinity;
    for (let t = 0; t < 600; t += 20) {
      const p = goosePose('work', t, 10_000 + t, 'open', 0, 0);
      const tip = beakTip(p.nod);
      lowest = Math.max(lowest, p.head.y + tip.y);
      expect(Math.abs(p.head.x + tip.x - KEYBOARD.x)).toBeLessThan(1.5);
    }
    expect(Math.abs(lowest - KEYBOARD.y)).toBeLessThan(0.5);
  });

  it('sleeps sat down with its head tucked in', () => {
    const p = goosePose('sleep', 500, 10_500, 'closed', 0, 0);
    expect(p.sitting && p.tucked).toBe(true);
    expect(p.head.y).toBeGreaterThan(bodyCentre(p).y - 10);
    expect(p.mark).toBe('zzz');
  });

  it('going up or down the screen, is seen from behind or in front, not sliding along side on', () => {
    expect(viewWhile('walk', -Math.PI / 2, 'side')).toBe('back');
    expect(viewWhile('chase', Math.PI / 2, 'side')).toBe('front');
    expect(viewWhile('walk', -Math.PI / 4, 'side')).toBe('backQuarter');
    // Running off with a block in its beak, only three-quarters.
    expect(viewWhile('carry', -Math.PI / 2, 'side')).toBe('backQuarter');
    expect(viewWhile('walk', 0, 'side')).toBe('side');
  });

  it('from the front has its eyes and its beak down the middle; from behind, neither; three-quarters, it’s narrower', () => {
    const t = 300;
    const pose = goosePose('walk', t, 10_000 + t, 'open', 80, 1);
    const at = (view: 'front' | 'back') => {
      const r = new Raster(PIXEL.width, PIXEL.height);
      return { r, ...drawGooseFacing(r, pose, view, 1, 10_000 + t, { hat: 'tophat', outfit: 'bowtie' }) };
    };
    const front = at('front');
    const back = at('back');
    expect(count(front.r, C.eye)).toBeGreaterThanOrEqual(4);
    expect(count(back.r, C.eye)).toBe(0);
    // Its beak, above its legs, is in the middle.
    const beak: number[] = [];
    for (let y = 0; y < PIXEL.feetY - 14; y++) for (let x = 0; x < PIXEL.width; x++) if (front.r.get(x, y) === C.band) beak.push(x);
    expect(beak.length).toBeGreaterThan(3);
    expect(Math.abs(beak.reduce((a, b) => a + b, 0) / beak.length + 0.5 - PIXEL.feetX)).toBeLessThan(1.5);
    for (const { box } of [front, back]) {
      expect(box).not.toBeNull();
      expect(box!.y0).toBeGreaterThan(0);
      expect(box!.y1).toBeLessThanOrEqual(PIXEL.feetY + 1);
    }
    const width = (squash: number) => {
      const r = new Raster(PIXEL.width, PIXEL.height);
      const { box } = drawGoose(r, pose, 1, 10_000 + t, undefined, squash);
      return box!.x1 - box!.x0;
    };
    expect(width(GOOSE_QUARTER)).toBeLessThan(width(1) - 5);
    expect(front.box!.x1 - front.box!.x0).toBeLessThan(width(GOOSE_QUARTER));
  });
});
