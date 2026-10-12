import { describe, expect, it } from 'vitest';
import { ChibiMotion } from '../src/sprites/chibi';
import { CHIBI_VIEW } from '../src/sprites/chibi/draw';
import { headCentre, LEGS, legRoot, scruffPoint, WATER_Y, type ChibiPose } from '../src/sprites/chibi/pose';
import { CHIBI_CAT, CHIBI_FOX, CHIBI_OTTER, CHIBI_RACCOON, type ChibiBuild } from '../src/sprites/chibi/species';
import { PX_PER_UNIT } from '../src/sprites/svg';
import { ANIMATION_NAMES, type AnimationName, type RaccoonFrame } from '../src/sprites/types';

const BUILDS = [
  ['raccoon', CHIBI_RACCOON],
  ['cat', CHIBI_CAT],
  ['fox', CHIBI_FOX],
  ['otter', CHIBI_OTTER],
] as const;
const WALKERS = BUILDS.filter(([name]) => name !== 'otter');

/** Drives a chibi at 60 fps like the runtime does. */
function driver(build: ChibiBuild) {
  const motion = new ChibiMotion(build);
  let clock = 10_000;
  const started = new Map<AnimationName, number>();
  let last: AnimationName | null = null;
  return {
    motion,
    step(frame: Partial<RaccoonFrame> & { animation: AnimationName }, ms = 16): ChibiPose {
      clock += ms;
      if (frame.animation !== last) started.set(frame.animation, clock);
      last = frame.animation;
      const timeMs = clock - started.get(frame.animation)!;
      return motion.update({ timeMs, keystrokes: 0, eyes: 'open', heading: 0, clockMs: clock, ...frame }, 1 / PX_PER_UNIT);
    },
  };
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

/** Runs an animation long enough to settle, and returns the poses after that. */
function settled(build: ChibiBuild, animation: AnimationName, frames = 60, extra: Partial<RaccoonFrame> = {}): ChibiPose[] {
  const d = driver(build);
  for (let i = 0; i < 30; i++) d.step({ animation, ...extra });
  return Array.from({ length: frames }, () => d.step({ animation, ...extra }));
}

describe.each(BUILDS)('chibi %s', (_name, build) => {
  it('stays finite through every animation, turn and drag', () => {
    const d = driver(build);
    for (const animation of ANIMATION_NAMES) {
      for (let i = 0; i < 40; i++) {
        const pose = d.step({
          animation,
          keystrokes: i,
          heading: i < 20 ? 0 : Math.PI,
          velocity: { x: 120, y: 30 },
          gaze: i % 3 ? { x: -200 + i * 10, y: -80 } : null,
        });
        expect(numbers(pose).every(Number.isFinite), animation).toBe(true);
      }
    }
  });

  it('keeps the drawing inside its box', () => {
    const { x, y, width, height } = CHIBI_VIEW;
    for (const animation of ANIMATION_NAMES) {
      for (const pose of settled(build, animation, 40, { velocity: { x: 150, y: 0 } })) {
        const head = headCentre(build, pose);
        expect(head.y - build.head.ry - 13, `${animation} ears`).toBeGreaterThan(y);
        expect(head.x + build.head.rx * 1.3, `${animation} nose`).toBeLessThan(x + width);
        for (const leg of LEGS) {
          expect(pose.paws[leg].y + pose.lift, `${animation} ${leg}`).toBeLessThan(y + height);
          expect(Math.abs(pose.paws[leg].x), `${animation} ${leg}`).toBeLessThan(width / 2);
        }
      }
    }
  });

  it('turns round to face the way it goes, flipping through side-on', () => {
    const d = driver(build);
    for (let i = 0; i < 10; i++) d.step({ animation: 'walk', heading: 0, velocity: { x: 80, y: 0 } });
    expect(d.motion.facing).toBe(1);
    d.step({ animation: 'walk', heading: Math.PI, velocity: { x: -80, y: 0 } });
    expect(d.motion.facing).toBe(-1);
    expect(d.motion.flip).toBeGreaterThan(-1);
    expect(d.motion.settling).toBe(true);
    for (let i = 0; i < 20; i++) d.step({ animation: 'walk', heading: Math.PI, velocity: { x: -80, y: 0 } });
    expect(d.motion.flip).toBe(-1);
    // Heading straight down the screen, it keeps the way it was facing.
    d.step({ animation: 'walk', heading: Math.PI / 2, velocity: { x: 0, y: 80 } });
    expect(d.motion.facing).toBe(-1);
  });

  it('is held by the scruff, which stays put as it hangs', () => {
    const points = settled(build, 'dangle').map((pose) => scruffPoint(build, pose));
    for (const p of points) {
      expect(p.x).toBeCloseTo(points[0]!.x, 0);
      expect(p.y).toBeCloseTo(points[0]!.y, 0);
      // Above the body, where you'd pick it up.
      expect(p.y).toBeLessThan(-20);
    }
  });

  it('peeks over the screen edge, paws on it and head above it', () => {
    for (const pose of settled(build, 'peek', 10, { keystrokes: 3 })) {
      const edge = -build.peekSink;
      expect(pose.paws.frontNear.y).toBeCloseTo(edge, 0);
      expect(headCentre(build, pose).y).toBeLessThan(edge - 4);
      expect(pose.wet).toBe(0);
    }
  });

  it('blends into a new animation instead of jumping', () => {
    const d = driver(build);
    for (let i = 0; i < 30; i++) d.step({ animation: 'sit' });
    const before = d.step({ animation: 'sit' });
    const after = d.step({ animation: 'jump' });
    expect(Math.abs(after.rot - before.rot)).toBeLessThan(8);
    expect(d.motion.settling).toBe(true);
  });
});

describe.each(WALKERS)('chibi %s on its feet', (_name, build) => {
  it('keeps its paws on the floor standing and sitting', () => {
    for (const animation of ['idle', 'sit', 'confused', 'yawn', 'happy'] as const) {
      for (const pose of settled(build, animation, 30)) {
        for (const leg of LEGS) {
          if (pose.pawUp > 0.5 && leg === 'frontNear') continue;
          expect(Math.abs(pose.paws[leg].y), `${animation} ${leg}`).toBeLessThan(0.01);
        }
      }
    }
  });

  it('steps its paws in diagonal pairs, each lifting in turn', () => {
    const poses = settled(build, 'walk', 90, { velocity: { x: 80, y: 0 } });
    const lifted = (leg: (typeof LEGS)[number]) => poses.map((p) => p.paws[leg].y < -0.5);
    const fn = lifted('frontNear');
    const bf = lifted('backFar');
    const ff = lifted('frontFar');
    expect(fn.some(Boolean)).toBe(true);
    expect(ff.some(Boolean)).toBe(true);
    for (let i = 0; i < poses.length; i++) {
      expect(fn[i], `frame ${i}`).toBe(bf[i]);
      expect(fn[i] && ff[i], `frame ${i}`).toBe(false);
    }
  });

  it('leaves the ground in a pounce and lands again', () => {
    const d = driver(build);
    for (let i = 0; i < 30; i++) d.step({ animation: 'idle' });
    const lifts = Array.from({ length: 30 }, () => d.step({ animation: 'jump' }).lift);
    expect(Math.min(...lifts)).toBeLessThan(-12);
    expect(lifts[lifts.length - 1]).toBeCloseTo(0, 0);
  });

  it('keeps its legs attached to its body', () => {
    for (const animation of ANIMATION_NAMES) {
      for (const pose of settled(build, animation, 20, { velocity: { x: 150, y: 0 } })) {
        for (const leg of LEGS) {
          const root = legRoot(build, pose, leg);
          const paw = { x: pose.paws[leg].x, y: pose.paws[leg].y + pose.lift };
          expect(Math.hypot(paw.x - root.x, paw.y - root.y), `${animation} ${leg}`).toBeLessThan(22);
        }
      }
    }
  });
});

describe('chibi otter', () => {
  const b = CHIBI_OTTER;

  it('swims instead of walking: in its pond, head out of the water', () => {
    for (const animation of ['walk', 'run', 'chase'] as const) {
      for (const pose of settled(b, animation, 40, { velocity: { x: 120, y: 0 } })) {
        expect(pose.wet).toBe(1);
        expect(headCentre(b, pose).y, animation).toBeLessThan(WATER_Y - 2);
        // The legs paddle below the surface.
        for (const leg of LEGS) expect(pose.paws[leg].y, `${animation} ${leg}`).toBeGreaterThan(WATER_Y);
      }
    }
  });

  it('floats on its back to rest, paws up on its chest', () => {
    for (const animation of ['sit', 'sleep', 'groom', 'yawn', 'happy'] as const) {
      for (const pose of settled(b, animation, 20)) {
        expect(pose.wet, animation).toBe(1);
        expect(pose.sy, animation).toBeLessThan(0);
        expect(pose.paws.frontNear.y, animation).toBeLessThan(WATER_Y);
      }
    }
  });

  it('holds its shell when it sits', () => {
    expect(settled(b, 'sit', 5).every((p) => p.shell === 1)).toBe(true);
  });

  it('treads water to look about, then lies back', () => {
    const d = driver(b);
    const early = Array.from({ length: 60 }, () => d.step({ animation: 'idle' }));
    expect(early.every((p) => p.rot > 40)).toBe(true);
    for (let i = 0; i < 340; i++) d.step({ animation: 'idle' });
    const late = d.step({ animation: 'idle' });
    expect(late.sy).toBeLessThan(0);
  });

  it('porpoises out of the water and back in', () => {
    const d = driver(b);
    for (let i = 0; i < 30; i++) d.step({ animation: 'run', velocity: { x: 200, y: 0 } });
    const poses = Array.from({ length: 27 }, () => d.step({ animation: 'leap', velocity: { x: 200, y: 0 } }));
    expect(Math.min(...poses.map((p) => p.lift))).toBeLessThan(-10);
    expect(poses.every((p) => p.wet === 1)).toBe(true);
    expect(Math.max(...poses.map((p) => p.splash))).toBeGreaterThan(1);
  });

  it('is out of the water when held up or peeking', () => {
    expect(settled(b, 'dangle', 5).every((p) => p.wet === 0)).toBe(true);
    expect(settled(b, 'peek', 5).every((p) => p.wet === 0)).toBe(true);
  });
});
