import { describe, expect, it } from 'vitest';
import { ChibiMotion } from '../src/sprites/chibi';
import { ballRadius, bodyFrame, headCentre, scruffPoint, WATER_Y, type ChibiPose } from '../src/sprites/chibi/pose';
import { drawPixelPet, PIXEL } from '../src/sprites/pixel/draw';
import { drawPixelFacing } from '../src/sprites/pixel/facing';
import { C } from '../src/sprites/pixel/palette';
import { Raster } from '../src/sprites/pixel/raster';
import { PIXEL_BUNNY, PIXEL_HEDGEHOG, PIXEL_OTTER, type PixelBuild } from '../src/sprites/pixel/species';
import type { AnimationName } from '../src/sprites/types';

/** Drives a pet's motion at 60 fps, the wall clock starting at `clock`, and returns every pose. */
function run(build: PixelBuild, animation: AnimationName, ms: number, clock = 10_000, speed = 80): ChibiPose[] {
  const motion = new ChibiMotion(build);
  const poses: ChibiPose[] = [];
  for (let t = 0; t <= ms; t += 16) {
    poses.push(motion.update({ animation, timeMs: t, keystrokes: 0, eyes: 'open', heading: 0, clockMs: clock + t, velocity: { x: speed, y: 0 } }, 1));
  }
  return poses;
}

function picture(build: PixelBuild, pose: ChibiPose, clock = 10_000, moving = 0) {
  const r = new Raster(PIXEL.width, PIXEL.height);
  const box = drawPixelPet(r, build, pose, clock, 1, moving, scruffPoint(build, pose));
  return { r, box };
}

const count = (r: Raster, c: number) => r.data.filter((v) => v === c).length;
/** The rows (top first) that pixels of colour `c` are on. */
const rows = (r: Raster, c: number) => Array.from(r.data).flatMap((v, i) => (v === c ? [Math.floor(i / PIXEL.width)] : []));

describe('the bunny', () => {
  it('hops along: all four feet off the ground together, then down again', () => {
    const build = PIXEL_BUNNY;
    for (const animation of ['walk', 'run'] as const) {
      const poses = run(build, animation, 2000).slice(20);
      const airborne = poses.filter((p) => p.lift < -3);
      const grounded = poses.filter((p) => p.lift === 0);
      expect(airborne.length, animation).toBeGreaterThan(5);
      expect(grounded.length, animation).toBeGreaterThan(3);
      // In the air, every foot is off the floor.
      for (const p of airborne) for (const paw of Object.values(p.paws)) expect(paw.y + p.lift, animation).toBeLessThan(0);
    }
  });

  it('the bunny hops higher running than walking', () => {
    const top = (animation: AnimationName) => Math.min(...run(PIXEL_BUNNY, animation, 2000).map((p) => p.lift));
    expect(top('run')).toBeLessThan(top('walk'));
  });

  it('the bunny sits up to look about now and then, and stands on all fours the rest of the time', () => {
    // On the wall clock's 9 second loop, it's up from about 6.4 s to 8.2 s.
    const up = run(PIXEL_BUNNY, 'idle', 200, 9000 * 3 + 7000).at(-1)!;
    const down = run(PIXEL_BUNNY, 'idle', 200, 9000 * 3 + 2000).at(-1)!;
    expect(up.rot).toBeGreaterThan(50);
    expect(Math.abs(down.rot)).toBeLessThan(10);
  });


});

describe("the bunny's ears", () => {
  it('flap about as it hops, and settle again once it stops', () => {
    const hopping = run(PIXEL_BUNNY, 'walk', 2000).slice(30).map((p) => p.earFlap);
    expect(Math.max(...hopping) - Math.min(...hopping)).toBeGreaterThan(20);
    const still = run(PIXEL_BUNNY, 'idle', 5000).slice(-30).map((p) => Math.abs(p.earFlap));
    expect(Math.max(...still)).toBeLessThan(3);
  });

  it('are long: they stand up well above its head', () => {
    const { r } = picture(PIXEL_BUNNY, run(PIXEL_BUNNY, 'idle', 3000).at(-1)!);
    expect(Math.min(...rows(r, C.eye)) - Math.min(...rows(r, C.inner))).toBeGreaterThan(9);
  });
});

describe('the hedgehog', () => {
  it('has spines over the top of its head, and a black nose on the end of its snout', () => {
    const { r } = picture(PIXEL_HEDGEHOG, run(PIXEL_HEDGEHOG, 'idle', 400).at(-1)!);
    const eye = Math.min(...rows(r, C.eye));
    expect(Math.min(...rows(r, C.dark))).toBeLessThan(eye - 4);
    expect(count(r, C.dark) + count(r, C.band)).toBeGreaterThan(80);
    // The nose is the furthest forward thing on it.
    const across = (c: number) => Array.from(r.data).flatMap((v, i) => (v === c ? [i % PIXEL.width] : []));
    expect(Math.max(...across(C.nose))).toBeGreaterThanOrEqual(Math.max(...across(C.dark), ...across(C.fur)));
  });

  it('rolls up into a ball to run, to sleep, when startled and when picked up, and not to walk', () => {
    for (const animation of ['run', 'chase', 'sleep', 'surprised', 'dangle'] as const) expect(run(PIXEL_HEDGEHOG, animation, 600).at(-1)!.ball, animation).toBe(1);
    for (const animation of ['walk', 'idle', 'sit', 'work'] as const) expect(run(PIXEL_HEDGEHOG, animation, 600).at(-1)!.ball, animation).toBe(0);
  });

  it('rolls along when it runs, sitting on the floor', () => {
    const poses = run(PIXEL_HEDGEHOG, 'run', 1500).slice(20);
    expect(new Set(poses.map((p) => Math.round(p.roll))).size).toBeGreaterThan(10);
    const R = ballRadius(PIXEL_HEDGEHOG);
    for (const p of poses) expect(bodyFrame(PIXEL_HEDGEHOG, p).cy - p.lift).toBeCloseTo(-R, 0);
  });

  it('is a spiky ball rolled up, from the side or coming at you: spines and no eyes', () => {
    const pose = run(PIXEL_HEDGEHOG, 'run', 600).at(-1)!;
    const { r, box } = picture(PIXEL_HEDGEHOG, pose, 10_000, 1);
    expect(count(r, C.dark)).toBeGreaterThan(40);
    expect(count(r, C.eye)).toBe(0);
    expect(box!.y1).toBeGreaterThanOrEqual(PIXEL.feetY - 1);
    const front = new Raster(PIXEL.width, PIXEL.height);
    expect(drawPixelFacing(front, PIXEL_HEDGEHOG, pose, 'front', { phase: 0.3, moving: 1, running: true, side: 1 }, 10_000, { hat: 'none', outfit: 'none' })).not.toBe(null);
    expect(count(front, C.dark)).toBeGreaterThan(40);
    expect(count(front, C.eye)).toBe(0);
  });

  it('hangs rolled up right under your grip, which stays where it is', () => {
    const poses = run(PIXEL_HEDGEHOG, 'dangle', 1500).slice(30);
    const R = ballRadius(PIXEL_HEDGEHOG);
    for (const p of poses) {
      const s = scruffPoint(PIXEL_HEDGEHOG, p);
      const f = bodyFrame(PIXEL_HEDGEHOG, p);
      expect(Math.hypot(f.cx - s.x, f.cy - s.y)).toBeLessThan(R * 1.2);
    }
    const first = scruffPoint(PIXEL_HEDGEHOG, poses[0]!);
    const last = scruffPoint(PIXEL_HEDGEHOG, poses.at(-1)!);
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(2);
  });

  it('has spines on its back walking about', () => {
    expect(count(picture(PIXEL_HEDGEHOG, run(PIXEL_HEDGEHOG, 'walk', 600).at(-1)!).r, C.dark)).toBeGreaterThan(30);
  });
});


describe('the otter', () => {
  // A dive starts 5 s into each 9 s of the wall clock.
  const DIVE = 9000 * 3 + 5000;

  it('dives now and then as it swims along: under the surface, bubbles, and up again', () => {
    const poses = run(PIXEL_OTTER, 'walk', 2400, DIVE - 200);
    expect(poses.filter((p) => headCentre(PIXEL_OTTER, p).y > WATER_Y + 8).length).toBeGreaterThan(10);
    expect(Math.max(...poses.map((p) => p.bubbles))).toBe(1);
    expect(Math.max(...poses.map((p) => p.splash))).toBeGreaterThan(1);
    // Back at the surface afterwards, head out.
    expect(headCentre(PIXEL_OTTER, poses.at(-1)!).y).toBeLessThan(WATER_Y - 2);
    // Under, all you see is the pond and the bubbles.
    const i = poses.findIndex((p) => p.bubbles === 1);
    const { r } = picture(PIXEL_OTTER, poses[i]!, DIVE - 200 + i * 16, 1);
    expect(count(r, C.eye) + count(r, C.fur)).toBe(0);
    expect(count(r, C.waterLight)).toBeGreaterThan(0);
  });

  it('flips its tail up out of the water as it goes under', () => {
    const going = run(PIXEL_OTTER, 'walk', 380, DIVE).at(-1)!;
    const { r } = picture(PIXEL_OTTER, going, DIVE + 380, 1);
    const surface = PIXEL.feetY + WATER_Y * PIXEL.k;
    expect([...rows(r, C.fur), ...rows(r, C.far)].filter((y) => y < surface - 4).length).toBeGreaterThan(3);
    expect(count(r, C.eye)).toBe(0);
  });

  it('porpoises out of the water every so often, going fast', () => {
    const poses = run(PIXEL_OTTER, 'run', 1500, 4200 * 5 + 2800, 200);
    expect(Math.min(...poses.map((p) => p.lift))).toBeLessThan(-8);
    expect(poses.every((p) => p.wet === 1)).toBe(true);
  });
});
