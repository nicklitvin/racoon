import { describe, expect, it } from 'vitest';
import { ChibiMotion } from '../src/sprites/chibi';
import { headCentre, scruffPoint, WATER_Y, type ChibiPose } from '../src/sprites/chibi/pose';
import { CHIBI_CAT, CHIBI_RACCOON } from '../src/sprites/chibi/species';
import { drawPixelPet, PIXEL } from '../src/sprites/pixel/draw';
import { drawPixelFacing } from '../src/sprites/pixel/facing';
import { C, PIXEL_COATS, rgbaTable, SLOTS } from '../src/sprites/pixel/palette';
import { ellipse, Raster } from '../src/sprites/pixel/raster';
import { PIXEL_CAT, PIXEL_OTTER, PIXEL_RACCOON, type PixelBuild } from '../src/sprites/pixel/species';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

const BUILDS = [
  ['raccoon', PIXEL_RACCOON],
  ['cat', PIXEL_CAT],
  ['otter', PIXEL_OTTER],
] as const;

/** A settled pose for an animation, `ms` in. */
function poseAt(build: PixelBuild, animation: AnimationName, ms = 600, facing = 1): { pose: ChibiPose; motion: ChibiMotion; clock: number } {
  const motion = new ChibiMotion(build);
  let clock = 10_000;
  let pose!: ChibiPose;
  for (let t = 0; t <= ms; t += 16) {
    clock += 16;
    pose = motion.update({ animation, timeMs: t, keystrokes: 0, eyes: 'open', heading: facing > 0 ? 0 : Math.PI, clockMs: clock, velocity: { x: 80 * facing, y: 0 } }, 1);
  }
  return { pose, motion, clock };
}

function draw(build: PixelBuild, animation: AnimationName, ms = 600, facing = 1) {
  const r = new Raster(PIXEL.width, PIXEL.height);
  const { pose, motion, clock } = poseAt(build, animation, ms, facing);
  const box = drawPixelPet(r, build, pose, clock, motion.facing, motion.moving, scruffPoint(build, pose));
  return { r, box, pose };
}

const count = (r: Raster, c: number) => r.data.filter((v) => v === c).length;

describe('pixel raster', () => {
  it('fills a shape with whole pixels and rings it with a one-pixel outline', () => {
    const r = new Raster(20, 20);
    const e = ellipse(10, 10, 5, 4);
    r.shape(e.sd, e.box, 2, 1);
    expect(r.get(10, 10)).toBe(2);
    // The top edge is at y = 6: the row above it is outline, and above that, nothing.
    expect(r.get(10, 5)).toBe(1);
    expect(r.get(10, 3)).toBe(0);
    // Every coloured pixel is the fill or the outline: nothing in between.
    expect(new Set(r.data)).toEqual(new Set([0, 1, 2]));
    // The outline is closed: no fill pixel touches an empty one.
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        if (r.get(x, y) !== 2) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(r.get(x + dx!, y + dy!)).not.toBe(0);
      }
    }
  });

  it('mirrors left to right about a line between pixels', () => {
    const r = new Raster(10, 4);
    r.set(1, 1, 3);
    r.mirror(5);
    expect(r.get(8, 1)).toBe(3);
    expect(r.get(1, 1)).toBe(0);
  });

  it('outlines a little bitmap only where there is nothing yet', () => {
    const r = new Raster(10, 10);
    r.set(3, 5, 7);
    r.stamp(['#'], 5, 5, 2, 1);
    expect(r.get(5, 5)).toBe(2);
    expect(r.get(4, 5)).toBe(1);
    expect(r.get(3, 5)).toBe(7);
  });
});

describe('pixel palettes', () => {
  it('turns each coat into packed colours, with nothing at all for transparent', () => {
    const table = rgbaTable(PIXEL_COATS.raccoon);
    expect(table[0]).toBe(0);
    expect(table.length).toBe(SLOTS.length + 1);
    // #211f29 outline, fully opaque, as RGBA bytes in memory.
    expect(table[C.outline]! >>> 24).toBe(255);
    expect(table[C.outline]! & 255).toBe(0x21);
    // The shadow is see-through.
    expect(table[C.shadow]! >>> 24).toBeLessThan(255);
  });

  it('gives every coat a colour for every slot', () => {
    for (const coat of Object.values(PIXEL_COATS)) for (const slot of SLOTS) expect(coat[slot], slot).toMatch(/^(#|rgba)/);
  });
});

describe.each(BUILDS)('pixel %s', (_name, build) => {
  it('draws every animation inside its canvas, feet on the floor line', () => {
    for (const animation of ANIMATION_NAMES) {
      const { r, box } = draw(build, animation);
      expect(box, animation).not.toBe(null);
      expect(box!.x0, animation).toBeGreaterThanOrEqual(0);
      expect(box!.x1, animation).toBeLessThanOrEqual(PIXEL.width);
      expect(box!.y0, animation).toBeGreaterThan(0);
      // Some of it near the head and near the feet: a whole animal, not a fragment.
      expect(box!.y1 - box!.y0, animation).toBeGreaterThan(10);
      expect(count(r, C.outline), animation).toBeGreaterThan(20);
    }
  });

  it('stands with its feet on the floor', () => {
    const { box } = draw(build, 'idle');
    // The feet (or the pond round a swimmer) reach down to the feet line.
    expect(box!.y1).toBeGreaterThanOrEqual(PIXEL.feetY - (build.swims ? 5 : 1));
    expect(box!.y1).toBeLessThanOrEqual(PIXEL.feetY + 3);
  });

  it('turns to face left as a mirror image of facing right', () => {
    const right = draw(build, 'sit', 900, 1).box!;
    const left = draw(build, 'sit', 900, -1).box!;
    expect(left.x0).toBeCloseTo(2 * PIXEL.feetX - right.x1, -0.5);
    expect(left.x1).toBeCloseTo(2 * PIXEL.feetX - right.x0, -0.5);
  });

  it('shows floating z’s asleep, hearts when happy, and nothing over its head otherwise', () => {
    expect(count(draw(build, 'sleep', 900).r, C.mark)).toBeGreaterThan(3);
    expect(count(draw(build, 'happy', 900).r, C.heart)).toBeGreaterThan(3);
    expect(count(draw(build, 'idle', 900).r, C.heart) + count(draw(build, 'idle', 900).r, C.alarm)).toBe(0);
  });
});

describe('pixel proportions', () => {
  it('gives the raccoon and the cat a bigger head for their bodies than the chibis, as a sprite wants', () => {
    for (const [pixel, chibi] of [[PIXEL_RACCOON, CHIBI_RACCOON], [PIXEL_CAT, CHIBI_CAT]] as const) {
      const ratio = (b: PixelBuild | typeof chibi) => b.head.rx / b.body.rx;
      expect(ratio(pixel)).toBeGreaterThan(ratio(chibi) * 1.15);
    }
  });

  it('draws the head at least as wide as the body standing', () => {
    for (const build of [PIXEL_RACCOON, PIXEL_CAT]) {
      const { pose } = draw(build, 'idle');
      const head = headCentre(build, pose);
      expect(head.y, build.species).toBeLessThan(build.body.at.y);
      expect(build.head.rx * 2, build.species).toBeGreaterThanOrEqual(build.body.rx * 2.6);
    }
  });
});

describe('pixel outfits', () => {
  it('draws a hat on top of the head and neckwear under the chin, in their own colours', () => {
    for (const build of [PIXEL_RACCOON, PIXEL_CAT, PIXEL_OTTER]) {
      const r = new Raster(PIXEL.width, PIXEL.height);
      const { pose, motion, clock } = poseAt(build, 'idle');
      drawPixelPet(r, build, pose, clock, motion.facing, motion.moving, scruffPoint(build, pose), { hat: 'tophat', outfit: 'collar' });
      const rows = (c: number) => Array.from(r.data).flatMap((v, i) => (v === c ? [Math.floor(i / PIXEL.width)] : []));
      const hat = rows(C.hatMain);
      const collar = rows(C.wearMain);
      expect(hat.length, build.species).toBeGreaterThan(10);
      // The hat is above the eyes, the collar below them (in the water, on a swimming otter).
      const eyes = rows(C.eye);
      expect(Math.min(...hat)).toBeLessThan(Math.min(...eyes));
      if (build.swims) continue;
      expect(collar.length, build.species).toBeGreaterThan(2);
      expect(Math.max(...collar)).toBeGreaterThan(Math.max(...eyes));
    }
  });

  it('draws nothing extra undressed', () => {
    const { r } = draw(PIXEL_RACCOON, 'idle');
    for (const slot of [C.hatMain, C.hatTrim, C.hatAccent, C.wearMain, C.wearTrim, C.wearAccent]) expect(count(r, slot)).toBe(0);
  });
});

describe('pixel faces', () => {
  it('turn round to look at something beside them: the eyes come round towards the way they face', () => {
    for (const build of [PIXEL_RACCOON, PIXEL_CAT]) {
      const eyesAt = (turn: number) => {
        const r = new Raster(PIXEL.width, PIXEL.height);
        const { pose, clock } = poseAt(build, 'idle');
        drawPixelPet(r, build, { ...pose, turn, eyes: 'open' }, clock, 1, 0, scruffPoint(build, pose));
        const xs = Array.from(r.data).flatMap((v, i) => (v === C.eye ? [i % PIXEL.width] : []));
        return Math.min(...xs);
      };
      expect(eyesAt(0.9), build.species).toBeGreaterThan(eyesAt(0));
    }
  });

  it('turn to the screen at the desk', () => {
    for (const animation of ['work', 'browse', 'reels'] as const) expect(poseAt(PIXEL_RACCOON, animation).pose.turn, animation).toBeGreaterThan(0.5);
    expect(poseAt(PIXEL_RACCOON, 'idle').pose.turn).toBe(0);
  });
});

describe('pixel otter', () => {
  it('swims in a pixel pond, nothing of it showing below the surface but water', () => {
    const { r, pose } = draw(PIXEL_OTTER, 'walk');
    expect(pose.wet).toBe(1);
    expect(count(r, C.water)).toBeGreaterThan(40);
    const surface = Math.ceil(PIXEL.feetY + (WATER_Y + 2) * PIXEL.k);
    const water = new Set([0, C.water, C.waterLight, C.waterDark, C.shadow]);
    for (let y = surface + 1; y < PIXEL.height; y++) {
      for (let x = 0; x < PIXEL.width; x++) expect(water.has(r.get(x, y)), `${x},${y}`).toBe(true);
    }
  });
});

describe('pixel pets walking up and down the screen', () => {
  /** Drives the motion like the page does, heading `heading`, and says which way you see him. */
  function viewWalking(heading: number, animation: AnimationName = 'walk') {
    const motion = new ChibiMotion(PIXEL_RACCOON);
    let clock = 10_000;
    for (let t = 0; t < 400; t += 16) {
      clock += 16;
      motion.update({ animation, timeMs: t, keystrokes: 0, eyes: 'open', heading, clockMs: clock, velocity: { x: Math.cos(heading) * 80, y: Math.sin(heading) * 80 } }, 1);
    }
    return motion.view;
  }

  it('is seen from the front walking down towards you, from behind walking away, side on across', () => {
    expect(viewWalking(Math.PI / 2)).toBe('front');
    expect(viewWalking(-Math.PI / 2)).toBe('back');
    expect(viewWalking(0)).toBe('side');
    expect(viewWalking(Math.PI)).toBe('side');
    // On a slant he's still side on; and stood still, always.
    expect(viewWalking(Math.PI / 4)).toBe('side');
    expect(viewWalking(Math.PI / 2, 'idle')).toBe('side');
  });

  it('draws a face from the front and none from behind, the whole animal inside its canvas', () => {
    for (const build of [PIXEL_RACCOON, PIXEL_CAT, PIXEL_OTTER]) {
      for (const view of ['front', 'back'] as const) {
        const r = new Raster(PIXEL.width, PIXEL.height);
        const { pose, clock } = poseAt(build, 'walk');
        const box = drawPixelFacing(r, build, pose, view, { phase: 0.3, moving: 1, running: false, side: 1 }, clock, { hat: 'tophat', outfit: 'suit' });
        expect(box, `${build.species} ${view}`).not.toBe(null);
        expect(box!.x0).toBeGreaterThanOrEqual(0);
        expect(box!.x1).toBeLessThanOrEqual(PIXEL.width);
        expect(box!.y0).toBeGreaterThan(0);
        expect(count(r, C.eye) > 0, `${build.species} ${view} eyes`).toBe(view === 'front');
        expect(count(r, C.hatMain), `${build.species} ${view} hat`).toBeGreaterThan(5);
      }
    }
  });

  it('steps its legs in turn as it walks towards you', () => {
    const rows = (phase: number) => {
      const r = new Raster(PIXEL.width, PIXEL.height);
      const { pose, clock } = poseAt(PIXEL_CAT, 'walk');
      drawPixelFacing(r, PIXEL_CAT, pose, 'front', { phase, moving: 1, running: false, side: 1 }, clock, { hat: 'none', outfit: 'none' });
      // The lowest row the legs reach, on the left half and the right half.
      const lowest = (left: boolean) => Math.max(...Array.from(r.data).flatMap((v, i) => ((v === C.fur || v === C.far) && (i % PIXEL.width < PIXEL.feetX) === left ? [Math.floor(i / PIXEL.width)] : [])));
      return [lowest(true), lowest(false)];
    };
    const [a, b] = rows(0.25);
    const [c, d] = rows(0.75);
    // A quarter of the way round one front paw is up; three quarters round, the other.
    expect(a === b && c === d).toBe(false);
  });
});
