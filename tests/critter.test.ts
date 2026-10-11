import { describe, expect, it } from 'vitest';
import { CAT_BUILD, RACCOON_BUILD, type Build } from '../src/sprites/critter/build';
import { catAct } from '../src/sprites/critter/catAct';
import { Motion, type Shown } from '../src/sprites/critter/motion';
import { raccoonAct } from '../src/sprites/critter/raccoonAct';
import { legJoints } from '../src/sprites/critter/rig';
import { LEGS, paw } from '../src/sprites/critter/pose';
import { PX_PER_UNIT } from '../src/sprites/svg';
import { DEPTH } from '../src/sprites/critter/view';
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

/** Where a paw is on screen, in drawing units from his feet. */
function pawOnScreen(build: Build, shown: Shown, leg: (typeof LEGS)[number]) {
  const p = paw(shown.pose, leg);
  return shown.view.at(p.x, p.y, legJoints(build, shown.pose, leg).z.paw);
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

  // Every way he can walk on screen: across, up (away), down (towards you) and slantwise.
  const DIRECTIONS = [0, Math.PI, -Math.PI / 2, Math.PI / 2, -Math.PI / 4, (3 * Math.PI) / 4];

  it.each(DIRECTIONS)('keeps planted paws still on the screen while walking and running (direction %f)', (direction) => {
    for (const [animation, speedPx] of [
      ['walk', 85],
      ['run', 340],
      ['chase', 650],
    ] as const) {
      const d = driver(build, act);
      // The brain's speeds are over the floor, so up and down the screen is slower; the
      // page turns him to face the way he's moving on screen.
      const velocity = { x: Math.cos(direction) * speedPx, y: Math.sin(direction) * speedPx * DEPTH };
      const heading = Math.atan2(velocity.y, velocity.x);
      // Let the blend from standing and the turn die away first.
      for (let i = 0; i < 90; i++) d.step({ animation, heading, velocity });
      const feet = { x: 0, y: 0 };
      let previous: Record<string, { x: number; y: number; down: boolean }> | null = null;
      let checked = 0;
      for (let i = 0; i < 120; i++) {
        const shown = d.step({ animation, heading, velocity });
        feet.x += velocity.x * UNITS_PER_PX * 0.016;
        feet.y += velocity.y * UNITS_PER_PX * 0.016;
        const now: Record<string, { x: number; y: number; down: boolean }> = {};
        for (const leg of LEGS) {
          const down = paw(shown.pose, leg).y === 0;
          const s = pawOnScreen(build, shown, leg);
          now[leg] = { x: feet.x + s.x, y: feet.y + s.y, down };
          const before = previous?.[leg];
          if (before?.down && down) {
            // On the ground in both frames: it mustn't slide.
            expect(Math.hypot(now[leg]!.x - before.x, now[leg]!.y - before.y), `${animation} ${leg}`).toBeLessThan(0.05);
            checked++;
          }
          expect(paw(shown.pose, leg).y, `${animation} ${leg} below ground`).toBeLessThanOrEqual(0);
        }
        previous = now;
      }
      expect(checked, animation).toBeGreaterThan(60);
    }
  });

  it('has at least two paws on the ground at every moment of the walk', () => {
    const d = driver(build, act);
    for (let i = 0; i < 90; i++) d.step({ animation: 'walk', velocity: { x: 85, y: 0 } });
    for (let i = 0; i < 120; i++) {
      const shown = d.step({ animation: 'walk', velocity: { x: 85, y: 0 } });
      const planted = LEGS.filter((leg) => paw(shown.pose, leg).y === 0);
      expect(planted.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('faces the way he walks, up and down the screen too', () => {
    for (const [heading, bodyFacing] of [
      [Math.PI / 2, 90],
      [-Math.PI / 2, -90],
      [0, 0],
      [Math.PI, 180],
    ] as const) {
      const d = driver(build, act);
      let shown!: Shown;
      const velocity = { x: Math.cos(heading) * 85, y: Math.sin(heading) * 85 };
      for (let i = 0; i < 60; i++) shown = d.step({ animation: 'walk', heading, velocity });
      const body = (shown.view.yaw * 180) / Math.PI;
      const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
      expect(Math.abs(wrap(body - bodyFacing)), `body ${heading}`).toBeLessThan(2);
      // Walking towards or away from you, his head points where he's going.
      if (Math.abs(bodyFacing) === 90) expect(Math.abs(wrap(shown.head.yaw - bodyFacing)), `head ${heading}`).toBeLessThan(15);
    }
  });

  it('peeks over the edge facing you, paws on it either side of the face', () => {
    const d = driver(build, act);
    let shown = d.step({ animation: 'peek', heading: Math.PI / 2 });
    for (let i = 0; i < 90; i++) shown = d.step({ animation: 'peek', heading: Math.PI / 2, keystrokes: i });
    const sides: number[] = [];
    for (const leg of ['frontNear', 'frontFar'] as const) {
      const s = pawOnScreen(build, shown, leg);
      expect(Math.abs(s.y - (build.peekEdge - 0.3))).toBeLessThan(0.6);
      sides.push(s.x);
    }
    expect(Math.min(...sides)).toBeLessThan(-4);
    expect(Math.max(...sides)).toBeGreaterThan(4);
    // The eyes are above the edge, so they show.
    const head = shown.view.at(shown.pose.hx, shown.pose.hy, shown.head.z);
    expect(head.y).toBeLessThan(build.peekEdge - 2);
  });

  it('turns round through facing you, smoothly, and ends up facing the new way', () => {
    const d = driver(build, act);
    for (let i = 0; i < 30; i++) d.step({ animation: 'walk', heading: 0, velocity: { x: 85, y: 0 } });
    const yaws: number[] = [];
    const bends: number[] = [];
    let shown!: Shown;
    for (let i = 0; i < 70; i++) {
      shown = d.step({ animation: 'walk', heading: Math.PI, velocity: { x: -85, y: 0 } });
      yaws.push(shown.view.yaw);
      bends.push(shown.view.bend);
    }
    for (let i = 1; i < yaws.length; i++) expect(Math.abs(yaws[i]! - yaws[i - 1]!)).toBeLessThan(0.35);
    expect(Math.max(...yaws.map(Math.sin))).toBeGreaterThan(0.9);
    expect(Math.cos(shown.view.yaw)).toBeLessThan(-0.99);
    // The shoulders lead round (turning towards you is turning to his right) and the hips
    // follow, bowing the spine, which straightens out again once he's round.
    expect(Math.max(...bends)).toBeGreaterThan(0.5);
    expect(Math.max(...bends)).toBeLessThanOrEqual(build.flex + 1e-6);
    expect(Math.abs(shown.view.bend)).toBeLessThan(0.05);
  });

  it('steps round on his paws when turning on the spot', () => {
    const d = driver(build, act);
    for (let i = 0; i < 60; i++) d.step({ animation: 'idle', heading: 0 });
    let lifted = 0;
    for (let i = 0; i < 50; i++) {
      const shown = d.step({ animation: 'idle', heading: Math.PI });
      if (LEGS.some((leg) => paw(shown.pose, leg).y < -0.5)) lifted++;
    }
    expect(lifted).toBeGreaterThan(5);
  });

  it('leaps clear of the ground and lands on his front paws', () => {
    const d = driver(build, act);
    const velocity = { x: 650, y: 0 };
    for (let i = 0; i < 60; i++) d.step({ animation: 'chase', velocity });
    let airborne = 0;
    let highest = 0;
    for (let i = 0; i < 33; i++) {
      const shown = d.step({ animation: 'leap', velocity });
      const lowest = Math.max(...LEGS.map((leg) => paw(shown.pose, leg).y));
      if (lowest < -0.5) airborne++;
      highest = Math.min(highest, shown.pose.sy);
      // (The first few frames still blend out of the gallop.)
      if (i < 8) continue;
      for (const leg of LEGS) {
        const j = legJoints(build, shown.pose, leg);
        const [upper, lower] = leg.startsWith('front') ? build.front : build.back;
        expect(Math.hypot(j.low.x - j.root.x, j.low.y - j.root.y), `${leg} ${i}`).toBeLessThan((upper + lower) * 1.12);
      }
    }
    expect(airborne).toBeGreaterThan(10);
    expect(highest).toBeLessThan(build.shoulder.y - 6);
  });

  it('hangs from the scruff when carried, body and legs below it', () => {
    const d = driver(build, act);
    for (let i = 0; i < 30; i++) d.step({ animation: 'idle' });
    let shown!: Shown;
    for (let i = 0; i < 60; i++) shown = d.step({ animation: 'dangle', velocity: { x: Math.sin(i / 5) * 300, y: 0 } });
    const hips = shown.view.at(shown.pose.px, shown.pose.py);
    expect(hips.y).toBeGreaterThan(shown.scruff.y + 15);
    for (const leg of LEGS) expect(pawOnScreen(build, shown, leg).y).toBeGreaterThan(shown.scruff.y);
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

  it('follows a curving path with his body, bent round the curve', () => {
    const d = driver(build, act);
    // Running round in a circle, the way he's going swinging round at 2.5 rad/s.
    let shown!: Shown;
    for (let i = 0; i < 120; i++) {
      const a = i * 0.016 * 2.5;
      const velocity = { x: Math.cos(a) * 340, y: Math.sin(a) * 340 * DEPTH };
      shown = d.step({ animation: 'run', heading: Math.atan2(velocity.y, velocity.x), velocity });
      if (i < 40) continue;
      const going = Math.atan2(velocity.y / DEPTH, velocity.x);
      const off = Math.abs(Math.atan2(Math.sin(going - shown.view.yaw), Math.cos(going - shown.view.yaw)));
      expect(off, `frame ${i}`).toBeLessThan(0.1);
      // Curving to his right: the shoulders are further round than the hips.
      expect(shown.view.bend, `frame ${i}`).toBeGreaterThan(0.05);
    }
  });

  it('follows the pointer with a lazy head and quick eyes', () => {
    const d = driver(build, act);
    const look = (gaze: { x: number; y: number }) => d.step({ animation: 'idle', heading: 0.4, gaze });
    let shown!: Shown;
    for (let i = 0; i < 150; i++) shown = look({ x: 160, y: -60 });
    const settled = shown.pose.hturn;
    // Small movements of the pointer: the eyes follow, the head stays put.
    for (let i = 0; i < 30; i++) shown = look({ x: 160 + Math.sin(i / 3) * 12, y: -60 });
    expect(Math.abs(shown.pose.hturn - settled)).toBeLessThan(3);
    // It darts right over to his other side: the eyes get there first, the head follows.
    const before = shown;
    for (let i = 0; i < 6; i++) shown = look({ x: -160, y: -60 });
    expect(Math.abs(shown.pose.lookX - before.pose.lookX)).toBeGreaterThan(0.25);
    const quick = Math.abs(shown.pose.hturn - before.pose.hturn);
    for (let i = 0; i < 90; i++) shown = look({ x: -160, y: -60 });
    const total = Math.abs(shown.pose.hturn - before.pose.hturn);
    expect(total).toBeGreaterThan(20);
    expect(quick).toBeLessThan(total * 0.25);
  });

  it("never holds his tail still while he's idle", () => {
    const d = driver(build, act);
    const tips: { x: number; y: number }[] = [];
    for (let i = 0; i < 1250; i++) {
      const shown = d.step({ animation: 'idle' });
      const tip = shown.tail.at(-1)!;
      if (i > 60) tips.push(shown.view.at(tip.x, tip.y, tip.z));
    }
    const range = (k: 'x' | 'y') => Math.max(...tips.map((p) => p[k])) - Math.min(...tips.map((p) => p[k]));
    expect(Math.hypot(range('x'), range('y'))).toBeGreaterThan(10);
  });

  it('builds legs that reach their paws all through every gait', () => {
    for (const [animation, speed] of [
      ['walk', 85],
      ['run', 340],
      ['chase', 650],
    ] as const) {
      const d = driver(build, act);
      for (let i = 0; i < 300; i++) {
        const shown = d.step({ animation, velocity: { x: speed, y: 0 } });
        if (i < 40) continue;
        for (const leg of LEGS) {
          const j = legJoints(build, shown.pose, leg);
          const [upper, lower] = leg.startsWith('front') ? build.front : build.back;
          expect(Math.hypot(j.low.x - j.root.x, j.low.y - j.root.y), `${animation} ${leg} ${i}`).toBeLessThan((upper + lower) * 1.02);
        }
      }
    }
  });

  it('builds legs that reach their paws', () => {
    const d = driver(build, act);
    for (const animation of ['idle', 'sit', 'walk', 'peek'] as const) {
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

describe('lifelike raccoon stood up', () => {
  it('holds his arms from his chest, well below his chin', () => {
    const d = driver(RACCOON_BUILD, raccoonAct);
    for (let i = 0; i < 30; i++) d.step({ animation: 'idle' });
    let shown!: Shown;
    for (let i = 0; i < 40; i++) shown = d.step({ animation: 'surprised' });
    const chin = shown.pose.hy + RACCOON_BUILD.head.r;
    for (const leg of ['frontNear', 'frontFar'] as const) {
      expect(legJoints(RACCOON_BUILD, shown.pose, leg).root.y - chin).toBeGreaterThan(4);
    }
  });
});
