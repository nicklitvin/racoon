import { describe, expect, it } from 'vitest';
import { CAT_BUILD, RACCOON_BUILD, type Build } from '../src/sprites/critter/build';
import { catAct } from '../src/sprites/critter/catAct';
import { Motion, type Shown } from '../src/sprites/critter/motion';
import { raccoonAct } from '../src/sprites/critter/raccoonAct';
import { legJoints } from '../src/sprites/critter/rig';
import { LEGS, paw } from '../src/sprites/critter/pose';
import { PX_PER_UNIT } from '../src/sprites/svg';
import { ANIMATION_NAMES, type AnimationName, type RaccoonFrame } from '../src/sprites/types';

const SPECIES = [
  ['cat', CAT_BUILD, catAct],
  ['raccoon', RACCOON_BUILD, raccoonAct],
] as const;

const UNITS_PER_PX = 1 / PX_PER_UNIT;

/** Drives a Motion at 60 fps like the runtime does. */
function driver(build: Build, act: typeof catAct) {
  const motion = new Motion(build, act, 5);
  let clock = 10_000;
  return {
    motion,
    step(frame: Partial<RaccoonFrame> & { animation: AnimationName }, ms = 16): Shown {
      clock += ms;
      return motion.update({ timeMs: 0, keystrokes: 0, eyes: 'open', heading: 0, clockMs: clock, ...frame }, UNITS_PER_PX);
    },
  };
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe.each(SPECIES)('lifelike %s', (_name, build, act) => {
  it('stays finite through every animation, turn and drag', () => {
    const d = driver(build, act);
    for (const animation of ANIMATION_NAMES) {
      for (let i = 0; i < 40; i++) {
        const shown = d.step({
          animation,
          keystrokes: i,
          heading: i < 20 ? 0 : Math.PI,
          velocity: animation === 'dangle' ? { x: Math.sin(i) * 900, y: Math.cos(i) * 400 } : { x: 120, y: 30 },
          gaze: i % 3 ? { x: -200 + i * 10, y: -80 } : null,
        });
        expect(numbers(shown).every(Number.isFinite), animation).toBe(true);
      }
    }
  });

  it('keeps planted paws still on the ground while walking and running', () => {
    for (const [animation, speedPx] of [
      ['walk', 85],
      ['run', 340],
      ['chase', 650],
    ] as const) {
      const d = driver(build, act);
      const speed = speedPx * UNITS_PER_PX;
      // Let the blend from standing die away first.
      for (let i = 0; i < 90; i++) d.step({ animation, velocity: { x: speedPx, y: 0 } });
      let travelled = 0;
      let previous: Record<string, { x: number; y: number }> | null = null;
      let checked = 0;
      for (let i = 0; i < 120; i++) {
        const shown = d.step({ animation, velocity: { x: speedPx, y: 0 } });
        travelled += speed * 0.016;
        const now: Record<string, { x: number; y: number }> = {};
        for (const leg of LEGS) {
          const p = paw(shown.pose, leg);
          now[leg] = { x: p.x + travelled, y: p.y };
          const before = previous?.[leg];
          if (before && before.y === 0 && p.y === 0) {
            // On the ground in both frames: it mustn't slide along it.
            expect(Math.abs(now[leg]!.x - before.x), `${animation} ${leg}`).toBeLessThan(0.05);
            checked++;
          }
          expect(p.y, `${animation} ${leg} below ground`).toBeLessThanOrEqual(0);
        }
        previous = now;
      }
      expect(checked).toBeGreaterThan(60);
    }
  });

  it('has at least one paw on the ground at every moment of the walk', () => {
    const d = driver(build, act);
    for (let i = 0; i < 90; i++) d.step({ animation: 'walk', velocity: { x: 85, y: 0 } });
    for (let i = 0; i < 120; i++) {
      const shown = d.step({ animation: 'walk', velocity: { x: 85, y: 0 } });
      const planted = LEGS.filter((leg) => paw(shown.pose, leg).y === 0);
      expect(planted.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rests the front paws on the edge while peeking', () => {
    const d = driver(build, act);
    let shown = d.step({ animation: 'peek' });
    for (let i = 0; i < 90; i++) shown = d.step({ animation: 'peek', keystrokes: i });
    for (const leg of ['frontNear', 'frontFar'] as const) {
      expect(Math.abs(paw(shown.pose, leg).y - (build.peekEdge - 1.5))).toBeLessThan(0.6);
    }
    // The head is above the edge, so it shows.
    expect(shown.pose.hy + build.head.r).toBeLessThan(build.peekEdge);
  });

  it('turns round smoothly and ends up facing the new way', () => {
    const d = driver(build, act);
    for (let i = 0; i < 30; i++) d.step({ animation: 'walk', heading: 0, velocity: { x: 85, y: 0 } });
    const squeezes: number[] = [];
    let shown!: Shown;
    for (let i = 0; i < 40; i++) {
      shown = d.step({ animation: 'walk', heading: Math.PI, velocity: { x: -85, y: 0 } });
      squeezes.push(shown.turn.squeeze);
    }
    expect(Math.min(...squeezes)).toBeLessThan(0.5);
    expect(shown.turn.side).toBe(-1);
    expect(shown.turn.squeeze).toBeCloseTo(1, 2);
  });

  it('settles between little movements while resting, so it costs almost nothing', () => {
    const d = driver(build, act);
    let quiet = 0;
    for (let i = 0; i < 600; i++) {
      d.step({ animation: 'sleep' });
      if (!d.motion.settling) quiet++;
    }
    expect(quiet).toBeGreaterThan(300);
  });

  it('builds legs that reach their paws', () => {
    const d = driver(build, act);
    for (const animation of ['idle', 'sit', 'walk'] as const) {
      let shown!: Shown;
      for (let i = 0; i < 60; i++) shown = d.step({ animation, velocity: { x: animation === 'walk' ? 85 : 0, y: 0 } });
      for (const leg of LEGS) {
        const j = legJoints(build, shown.pose, leg);
        const [upper, lower] = leg.startsWith('front') ? build.front : build.back;
        const reach = Math.hypot(j.low.x - j.root.x, j.low.y - j.root.y);
        // Never stretched more than a little past straight.
        expect(reach, `${animation} ${leg}`).toBeLessThan((upper + lower) * 1.12);
      }
    }
  });
});
