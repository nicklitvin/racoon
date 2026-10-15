import { describe, expect, it } from 'vitest';
import { Brain, type PetSnapshot, type WorldInput } from '../src/core/behavior/brain';
import { DEFAULT_CONFIG, withConfig, type ConfigOverrides } from '../src/core/behavior/config';
import { seededRandom } from '../src/core/behavior/motion';

const bounds = { x: 0, y: 0, width: 1600, height: 900 };
const bottom = bounds.y + bounds.height;
const size = { width: 150, height: 90 };
const STEP = 16;

function world(overrides: Partial<WorldInput> = {}): WorldInput {
  return {
    bounds,
    size,
    cursor: null,
    cursorExcited: false,
    cursorStillMs: Infinity,
    typingActive: false,
    ...overrides,
  };
}

function makeBrain(seed = 1, overrides: ConfigOverrides = {}) {
  return new Brain(world(), seededRandom(seed), withConfig(overrides));
}

/** Drags the raccoon to `feet` and lets go. */
function place(brain: Brain, feet: { x: number; y: number }) {
  brain.grab();
  brain.dragTo(feet);
  run(brain, 100);
  brain.release();
}

const speed = (s: PetSnapshot) => Math.hypot(s.velocity.x, s.velocity.y);

/**
 * Runs the brain for `ms`, checking on every step that the raccoon never teleports.
 * Returns every snapshot.
 */
function run(brain: Brain, ms: number, input: WorldInput | ((t: number) => WorldInput) = world()): PetSnapshot[] {
  const out: PetSnapshot[] = [];
  let prev: PetSnapshot | null = null;
  for (let t = 0; t < ms; t += STEP) {
    const snap = brain.update(STEP, typeof input === 'function' ? input(t) : input);
    if (prev) {
      const jump = Math.hypot(snap.position.x - prev.position.x, snap.position.y - prev.position.y);
      expect(jump, `moved ${jump.toFixed(1)}px in one ${STEP}ms step (${prev.mode}/${prev.reaction} -> ${snap.mode}/${snap.reaction})`).toBeLessThan(80);
    }
    out.push(snap);
    prev = snap;
  }
  return out;
}

function runUntil(brain: Brain, predicate: (s: PetSnapshot) => boolean, input: WorldInput | ((t: number) => WorldInput) = world(), maxMs = 30_000) {
  let elapsed = 0;
  while (elapsed < maxMs) {
    const [snap] = run(brain, STEP, typeof input === 'function' ? input(elapsed) : input);
    elapsed += STEP;
    if (predicate(snap!)) return { snap: snap!, elapsed };
  }
  throw new Error(`condition not reached within ${maxMs}ms`);
}

function inBounds(s: PetSnapshot) {
  return (
    s.position.x - size.width / 2 >= bounds.x - 0.5 &&
    s.position.x + size.width / 2 <= bounds.x + bounds.width + 0.5 &&
    s.position.y - size.height >= bounds.y - 0.5 &&
    s.position.y <= bottom + 0.5
  );
}

describe('Brain: zoomies', () => {
  it('now and then dashes about, swerving and leaping, then settles down', () => {
    const brain = makeBrain(3, { wander: { zoomiesChance: 1, sitChance: 0, lookAroundChance: 0 } });
    runUntil(brain, (s) => s.reaction === 'zoomies');
    const snaps: PetSnapshot[] = [];
    runUntil(brain, (s) => (snaps.push(s), s.reaction !== 'zoomies'), world(), 15_000);
    const during = snaps.filter((s) => s.reaction === 'zoomies');
    expect(during.some((s) => s.animation === 'leap')).toBe(true);
    expect(Math.max(...during.map(speed))).toBeGreaterThan(DEFAULT_CONFIG.motion.runSpeed);
    // Off in more than one direction.
    const headings = during.filter((s) => speed(s) > 100).map((s) => Math.atan2(s.velocity.y, s.velocity.x));
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(1);
    expect(snaps.every(inBounds)).toBe(true);
    expect(snaps.at(-1)!.mode).toBe('idle');
  });
});

describe('Brain: wandering', () => {
  it('starts idle at the bottom middle of the screen', () => {
    const snap = makeBrain().update(0, world());
    expect(snap.mode).toBe('idle');
    expect(snap.position).toEqual({ x: 800, y: bottom });
  });

  it('roams the whole screen, not just the bottom edge, without leaving it or teleporting', () => {
    const snaps = run(makeBrain(7), 240_000);
    const modes = new Set(snaps.map((s) => s.mode));
    expect(modes).toContain('walk');
    expect(modes).toContain('sit');
    expect(snaps.every(inBounds)).toBe(true);
    const xs = snaps.map((s) => s.position.x);
    const ys = snaps.map((s) => s.position.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(600);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(400);
    // Walks end anywhere, not only on the bottom edge.
    const walkEnds = snaps.filter((s, i) => s.mode !== 'walk' && snaps[i - 1]?.mode === 'walk');
    expect(walkEnds.some((s) => s.position.y < bottom - 100)).toBe(true);
  });

  it('eases in and out of walks, with a little variation in speed', () => {
    const brain = makeBrain(3);
    const peaks: number[] = [];
    for (let i = 0; i < 4; i++) {
      runUntil(brain, (s) => s.mode === 'walk', world(), 120_000);
      const walk: PetSnapshot[] = [];
      while (true) {
        const [snap] = run(brain, STEP);
        if (snap!.mode !== 'walk') break;
        walk.push(snap!);
      }
      // Speed over the floor: up and down the screen is towards and away from you.
      const { floorDepth } = DEFAULT_CONFIG.wander;
      const speeds = walk.map((s) => Math.hypot(s.velocity.x, s.velocity.y / floorDepth));
      expect(speeds[0]).toBeLessThan(10);
      expect(speeds.at(-1)).toBeLessThan(10);
      peaks.push(Math.max(...speeds));
    }
    const { walkSpeed } = DEFAULT_CONFIG.motion;
    const { speedJitter } = DEFAULT_CONFIG.wander;
    for (const peak of peaks) {
      expect(peak).toBeGreaterThan(walkSpeed * (1 - speedJitter) - 2);
      expect(peak).toBeLessThan(walkSpeed * (1 + speedJitter) + 2);
    }
    expect(new Set(peaks.map((p) => Math.round(p))).size).toBeGreaterThan(1);
  });

  it('walks the configured distance and pauses the configured time between walks', () => {
    const brain = makeBrain(4, {
      wander: { walkDistance: { min: 200, max: 200 }, pauseMs: { min: 1000, max: 1000 }, sitChance: 0, lookAroundChance: 0 },
    });
    // Away from the edges, so no walk gets cut short.
    place(brain, { x: 800, y: 500 });
    const snaps = run(brain, 60_000);
    const starts: number[] = [];
    const ends: number[] = [];
    snaps.forEach((s, i) => {
      if (s.mode === 'walk' && snaps[i - 1]?.mode !== 'walk') starts.push(i);
      if (s.mode !== 'walk' && snaps[i - 1]?.mode === 'walk') ends.push(i);
    });
    expect(starts.length).toBeGreaterThan(5);
    for (let w = 0; w < ends.length; w++) {
      const from = snaps[starts[w]! - 1]!.position;
      const to = snaps[ends[w]!]!.position;
      const travelled = Math.hypot(to.x - from.x, to.y - from.y);
      // Clamped at the edge sometimes; otherwise exactly the configured distance.
      expect(travelled).toBeLessThanOrEqual(200.5);
      if (to.x > 300 && to.x < 1300 && to.y > 300 && to.y < 850) expect(travelled).toBeCloseTo(200, 0);
      const next = starts[w + 1];
      if (next !== undefined) expect((next - ends[w]!) * STEP).toBeCloseTo(1000, -2);
    }
  });

  it('only walks when sitting and looking around are switched off', () => {
    const brain = makeBrain(8, { wander: { sitChance: 0, lookAroundChance: 0 } });
    const modes = new Set(run(brain, 60_000).map((s) => s.mode));
    expect([...modes].sort()).toEqual(['idle', 'walk']);
  });

  it('sits down now and then', () => {
    const brain = makeBrain(8, { wander: { sitChance: 1 } });
    const { snap } = runUntil(brain, (s) => s.mode === 'sit');
    expect(['sit', 'groom', 'yawn']).toContain(snap.animation);
  });

  it('falls asleep after the configured calm stretch', () => {
    const brain = makeBrain(5, { wander: { sleepAfterMs: 20_000 } });
    const { snap, elapsed } = runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
    expect(elapsed).toBeGreaterThan(20_000);
    expect(snap.emote).toBe('z');
    expect(snap.animation).toBe('sleep');
    // And stays asleep while nothing happens.
    expect(run(brain, 10_000).every((s) => s.mode === 'sleep')).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = run(makeBrain(42), 20_000).map((s) => s.position);
    const b = run(makeBrain(42), 20_000).map((s) => s.position);
    expect(a).toEqual(b);
  });
});

describe('Brain: cursor reactions', () => {
  const excited = (cursor = { x: 400, y: 300 }) => world({ cursor, cursorExcited: true, cursorStillMs: 0 });

  it('jumps out and chases when the cursor goes wild', () => {
    const brain = makeBrain();
    const [first] = run(brain, STEP, excited());
    expect(first!.reaction).toBe('surprised');
    expect(first!.emote).toBe('');
    const { snap } = runUntil(brain, (s) => s.reaction === 'chase', excited());
    const startDist = Math.hypot(snap.position.x - 400, snap.position.y - 300);
    const later = run(brain, 1500, excited()).at(-1)!;
    expect(Math.hypot(later.position.x - 400, later.position.y - 300)).toBeLessThan(startDist / 2);
    expect(later.facing).toBe(-1);
  });

  it('pounces when the cursor stops, then sits looking confused, then goes back to normal', () => {
    const brain = makeBrain();
    runUntil(brain, (s) => s.reaction === 'chase', excited());
    run(brain, 1000, excited());
    const stopped = world({ cursor: { x: 400, y: 300 }, cursorStillMs: 1000 });
    runUntil(brain, (s) => s.reaction === 'pounce', stopped);
    const { snap: confused } = runUntil(brain, (s) => s.reaction === 'confused', stopped);
    expect(confused.emote).toBe('');
    // Landed on the cursor, wherever it is: the cursor is in the middle of him.
    expect(Math.abs(confused.position.x - 400)).toBeLessThan(10);
    expect(Math.abs(confused.position.y - size.height / 2 - 300)).toBeLessThan(15);
    const { snap: after } = runUntil(brain, (s) => s.mode !== 'react', stopped, 10_000);
    expect(after.mode).toBe('idle');
  });

  it('runs round in curves after the cursor rather than stopping and reversing', () => {
    const brain = makeBrain();
    runUntil(brain, (s) => s.reaction === 'chase', excited());
    // The cursor jumps from one side of him to the other and back.
    const zigzag = (t: number) => excited({ x: Math.floor(t / 700) % 2 ? 200 : 1400, y: 300 + Math.floor(t / 1400) * 40 });
    const snaps = run(brain, 5000, zigzag);
    const k = DEFAULT_CONFIG.wander.floorDepth;
    let fast = 0;
    for (let i = 1; i < snaps.length; i++) {
      const a = snaps[i - 1]!.velocity;
      const b = snaps[i]!.velocity;
      if (Math.hypot(a.x, a.y / k) < 45 || Math.hypot(b.x, b.y / k) < 45) continue;
      fast++;
      // Over the floor, his direction only swings round so fast while he's moving.
      const turn = Math.atan2(a.x * (b.y / k) - (a.y / k) * b.x, a.x * b.x + (a.y / k) * (b.y / k));
      expect(Math.abs(turn), `step ${i}`).toBeLessThan(0.16);
    }
    expect(fast).toBeGreaterThan(150);
  });

  it('leaps now and then from sheer excitement while chasing, flying straight on', () => {
    const brain = makeBrain();
    runUntil(brain, (s) => s.reaction === 'chase', excited());
    // Keep the cursor running away round the screen so he's at full tilt.
    const fleeing = (t: number) => excited({ x: 800 + Math.cos(t / 900) * 650, y: 450 + Math.sin(t / 900) * 300 });
    const snaps = run(brain, 8000, fleeing);
    const leaps = snaps.filter((s, i) => s.animation === 'leap' && snaps[i - 1]?.animation !== 'leap').length;
    expect(leaps).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < snaps.length; i++) {
      if (snaps[i]!.animation !== 'leap' || snaps[i - 1]!.animation !== 'leap') continue;
      const a = snaps[i - 1]!.velocity;
      const b = snaps[i]!.velocity;
      expect(Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y))).toBeLessThan(0.01);
    }
  });

  it('wakes up to chase', () => {
    const brain = makeBrain(5, { wander: { sleepAfterMs: 5_000 } });
    runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
    const [snap] = run(brain, STEP, excited());
    expect(snap!.reaction).toBe('surprised');
  });

  it('runs away from a cursor that gets too close', () => {
    const brain = makeBrain(2, { reactions: { fleeChance: 1 } });
    run(brain, 500);
    const cursor = { x: 760, y: bottom - 45 };
    const [snap] = run(brain, STEP, world({ cursor, cursorStillMs: 0 }));
    expect(snap!.reaction).toBe('flee');
    const after = run(brain, 1500, world({ cursor, cursorStillMs: 2000 })).at(-1)!;
    expect(after.position.x).toBeGreaterThan(800 + 150);
  });

  it('hides behind the screen edge when it can not run any further', () => {
    const brain = makeBrain(2, { reactions: { fleeChance: 1 } });
    place(brain, { x: 160, y: bottom });
    const cursor = { x: 220, y: bottom - 45 };
    const [snap] = run(brain, STEP, world({ cursor, cursorStillMs: 0 }));
    expect(snap!.reaction).toBe('hide');
    const { snap: hidden } = runUntil(brain, (s) => s.phase === 'wait', world({ cursor }));
    // Partly past the left edge, facing back into the screen.
    expect(hidden.position.x - size.width / 2).toBeLessThan(bounds.x);
    expect(hidden.facing).toBe(1);
    // Comes back out once the cursor leaves.
    const { snap: back } = runUntil(brain, (s) => s.mode === 'idle', world({ cursor: { x: 1200, y: 200 } }), 20_000);
    expect(inBounds(back)).toBe(true);
  });

  it('only flees on the way in, not on every frame the cursor stays near', () => {
    const brain = makeBrain(2, { reactions: { fleeChance: 1 } });
    run(brain, 500);
    const cursor = { x: 760, y: bottom - 45 };
    run(brain, STEP, world({ cursor }));
    const { snap } = runUntil(brain, (s) => s.mode === 'idle', world({ cursor }));
    // It ran away, so the cursor is no longer near; standing still near it again needs a new approach.
    expect(Math.abs(snap.position.x - cursor.x)).toBeGreaterThan(100);
  });
});

describe('Brain: typing reactions', () => {
  it('goes to the bottom edge and peeks over it while you type, then comes back up', () => {
    const brain = makeBrain(9);
    const typing = world({ typingActive: true });
    const [first] = run(brain, STEP, typing);
    expect(first!.reaction).toBe('peek');
    const { snap: watching } = runUntil(brain, (s) => s.phase === 'watch', typing);
    expect(watching.animation).toBe('peek');
    expect(watching.position.y).toBeGreaterThan(bottom + 10);
    expect(run(brain, 5000, typing).every((s) => s.phase === 'watch')).toBe(true);

    const { snap: back } = runUntil(brain, (s) => s.mode !== 'react', world());
    expect(back.mode).toBe('idle');
    expect(back.position.y).toBeCloseTo(bottom, 0);
  });

  it('peeks past the real edge even when his drawing reaches below his feet', () => {
    // A top-down raccoon: 60px of drawing below the feet, so he normally stays 60px up.
    const brain = makeBrain(9);
    const roomy = (typingActive: boolean) => world({ typingActive, footroom: 60, peekDepth: 40 });
    const wandering = run(brain, 20_000, roomy(false));
    expect(Math.max(...wandering.map((s) => s.position.y))).toBeLessThanOrEqual(bottom - 60 + 0.5);
    const { snap } = runUntil(brain, (s) => s.phase === 'watch', roomy(true));
    expect(snap.position.y).toBeCloseTo(bottom + 40, 0);
    const { snap: back } = runUntil(brain, (s) => s.mode !== 'react', roomy(false));
    expect(back.position.y).toBeCloseTo(bottom - 60, 0);
  });

  it('walks down to the bottom edge from anywhere on screen to watch', () => {
    const brain = makeBrain(11);
    place(brain, { x: 400, y: 300 });
    const { snap } = runUntil(brain, (s) => s.phase === 'watch', world({ typingActive: true }));
    expect(snap.position.x).toBeCloseTo(400, 0);
    expect(snap.position.y).toBeGreaterThan(bottom);
  });

  it('lets cursor excitement interrupt typing-watch', () => {
    const brain = makeBrain(9);
    runUntil(brain, (s) => s.phase === 'watch', world({ typingActive: true }));
    const [snap] = run(brain, STEP, world({ typingActive: true, cursor: { x: 300, y: 300 }, cursorExcited: true, cursorStillMs: 0 }));
    expect(snap!.reaction).toBe('surprised');
  });
});

describe('Brain: dragging and the world changing', () => {
  it('follows the pointer while dragged and settles where it is dropped', () => {
    const brain = makeBrain();
    brain.grab();
    brain.dragTo({ x: 500, y: 300 });
    const [held] = run(brain, STEP);
    expect(held!.position).toEqual({ x: 500, y: 300 });
    expect(held!.animation).toBe('dangle');
    brain.release();
    const [dropped] = run(brain, STEP);
    expect(dropped!.mode).toBe('idle');
    expect(dropped!.position).toEqual({ x: 500, y: 300 });
    expect(speed(dropped!)).toBe(0);
  });

  it('keeps a drag inside the screen', () => {
    const brain = makeBrain();
    brain.grab();
    brain.dragTo({ x: -500, y: -500 });
    const [held] = run(brain, STEP);
    expect(inBounds(held!)).toBe(true);
  });

  it('a click pets it: happy for a moment, longer with more pats, then back to normal', () => {
    const brain = makeBrain();
    brain.poke();
    const [snap] = run(brain, STEP);
    expect(snap!.reaction).toBe('petted');
    expect(snap!.animation).toBe('happy');
    expect(snap!.emote).toBe('');
    run(brain, 1200);
    brain.poke();
    expect(run(brain, 1200).at(-1)!.reaction).toBe('petted');
    const { snap: after } = runUntil(brain, (s) => s.reaction !== 'petted');
    expect(after.mode).toBe('idle');
  });

  it('stroking it after a pat keeps it happy for as long as you keep stroking', () => {
    const brain = makeBrain();
    brain.poke();
    for (let i = 0; i < 40; i++) {
      brain.stroke();
      expect(run(brain, 100).at(-1)!.reaction).toBe('petted');
    }
    runUntil(brain, (s) => s.reaction !== 'petted', world(), 3000);
    // Stroking alone, without a pat first, doesn't start it.
    brain.stroke();
    expect(run(brain, STEP)[0]!.reaction).not.toBe('petted');
  });

  it('stays on screen when the display shrinks', () => {
    const brain = makeBrain();
    place(brain, { x: 1500, y: bottom });
    const small = { x: 0, y: 0, width: 1000, height: 600 };
    const after = run(brain, 2000, world({ bounds: small })).at(-1)!;
    expect(after.position.x + size.width / 2).toBeLessThanOrEqual(small.width + 0.5);
    expect(after.position.y).toBeLessThanOrEqual(small.height + 0.5);
  });

  it('moves faster with a higher speed setting', () => {
    const slow = makeBrain(3);
    const fast = makeBrain(3);
    fast.setSpeed(2);
    const peakWalkSpeed = (b: Brain) => {
      runUntil(b, (s) => s.mode === 'walk', world(), 120_000);
      return Math.max(...run(b, 3000).filter((s) => s.mode === 'walk').map(speed));
    };
    expect(peakWalkSpeed(fast)).toBeGreaterThan(peakWalkSpeed(slow) * 1.5);
  });

  it('reports resting when nothing moves, so the renderer can idle', () => {
    const brain = makeBrain(5, { wander: { sleepAfterMs: 5_000 } });
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
    run(brain, 500);
    expect(run(brain, STEP)[0]!.resting).toBe(true);
    expect(snap.mode).toBe('sleep');
  });
});

describe('Brain: naps', () => {
  /** Nothing happening: never wanders off or sits about, so he gets sleepy soon. */
  const SLEEPY: ConfigOverrides = { wander: { sleepAfterMs: 4000, sitChance: 0, lookAroundChance: 0, zoomiesChance: 0, pauseMs: { min: 400, max: 800 } } };

  it('goes and curls up next to the pointer when it has been resting there, facing it', () => {
    const brain = makeBrain(2, SLEEPY);
    place(brain, { x: 300, y: 500 });
    const cursor = { x: 1100, y: 420 };
    const input = world({ cursor, cursorStillMs: 60_000 });
    const naps = runUntil(brain, (s) => s.reaction === 'nap', input, 30_000);
    expect(naps.snap.reaction).toBe('nap');
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', input, 60_000);
    // Right beside it, on the side he came from, nose towards it.
    expect(snap.position.x).toBeLessThan(cursor.x);
    expect(cursor.x - snap.position.x).toBeLessThan(size.width * 0.6);
    expect(Math.abs(snap.position.y - cursor.y)).toBeLessThan(size.height * 0.5);
    expect(snap.facing).toBe(1);
    expect(run(brain, 5000, input).every((s) => s.mode === 'sleep')).toBe(true);
  });

  it('follows the pointer if it settles somewhere else while he is on his way', () => {
    const brain = makeBrain(2, SLEEPY);
    place(brain, { x: 300, y: 500 });
    runUntil(brain, (s) => s.reaction === 'nap', world({ cursor: { x: 1100, y: 420 }, cursorStillMs: 60_000 }), 30_000);
    const moved = { x: 600, y: 800 };
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', world({ cursor: moved, cursorStillMs: 5000 }), 60_000);
    expect(Math.abs(snap.position.x - moved.x)).toBeLessThan(size.width * 0.6);
  });

  it('with the pointer busy or away, naps somewhere out of the way: the bottom of the screen, by the nearer corner', () => {
    const brain = makeBrain(2, SLEEPY);
    place(brain, { x: 1300, y: 400 });
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', world({ cursor: { x: 800, y: 300 }, cursorStillMs: 200 }), 60_000);
    expect(bottom - snap.position.y).toBeLessThan(6);
    expect(bounds.x + bounds.width - snap.position.x).toBeLessThan(size.width);
    // Facing into the screen, not the wall.
    expect(snap.facing).toBe(-1);
  });
});

describe('Brain: work mode', () => {
  const desk = { seat: { x: 1300, y: bottom }, facing: 1 as const, screen: { x: 1420, y: bottom - 80 } };
  const atWork = (overrides: Partial<WorldInput> = {}) => world({ desk, ...overrides });
  const SHORT: ConfigOverrides = { work: { focusMs: 30_000, restlessMs: 3000, begMs: 20_000, askEveryMs: 4000 } };

  /** Three quick taps on the desk. */
  function tapDesk(brain: Brain, input = atWork(), gap = 200) {
    run(brain, 50, input);
    for (let i = 0; i < 3; i++) {
      brain.deskTapped();
      run(brain, gap, input);
    }
  }

  it('ignores a tap or two, but three quick taps make it work time', () => {
    const brain = makeBrain(4, SHORT);
    place(brain, { x: 400, y: 700 });
    run(brain, 100, atWork());
    brain.deskTapped();
    run(brain, 300, atWork());
    brain.deskTapped();
    run(brain, 2000, atWork());
    // Too slow: the first two have run out.
    brain.deskTapped();
    expect(run(brain, 100, atWork()).at(-1)!.reaction).not.toBe('work');
    run(brain, 2000, atWork());
    tapDesk(brain);
    const snap = run(brain, 50, atWork()).at(-1)!;
    expect(snap.reaction).toBe('work');
    expect(snap.say).toBe('Work time!');
  });

  it('does nothing without a desk (work mode off)', () => {
    const brain = makeBrain(4, SHORT);
    tapDesk(brain, world());
    expect(run(brain, 500).some((s) => s.reaction === 'work')).toBe(false);
  });

  it('goes to its desk, sits down facing it and types, eyes on the screen, not distracted by anything', () => {
    const brain = makeBrain(4, SHORT);
    place(brain, { x: 400, y: 700 });
    tapDesk(brain);
    const { snap } = runUntil(brain, (s) => s.animation === 'work', atWork(), 20_000);
    expect(Math.hypot(snap.position.x - desk.seat.x, snap.position.y - desk.seat.y)).toBeLessThan(5);
    expect(snap.facing).toBe(1);
    expect(snap.aim).toBe(0);
    expect(snap.lookAt).toEqual(desk.screen);
    // Busy: shaking the mouse, typing and the pointer right on top of him don't move him.
    const busy = atWork({ cursor: { x: desk.seat.x, y: desk.seat.y - 40 }, cursorExcited: true, cursorStillMs: 0, typingActive: true });
    const snaps = run(brain, 5000, busy);
    expect(snaps.every((s) => s.animation === 'work')).toBe(true);
    // Resting, so the page can tick slowly through twenty minutes of typing.
    expect(snaps.at(-1)!.resting).toBe(true);
    // A tap on the desk now just gets you shushed.
    brain.deskTapped();
    expect(run(brain, 50, atWork()).at(-1)!.say).toMatch(/Shh/);
  });

  it('at the computer, switches between the terminal, the web and the odd few reels, sitting to suit each', () => {
    const tasks = { terminal: { weight: 0.5, ms: { min: 2000, max: 3000 } }, web: { weight: 0.35, ms: { min: 2000, max: 3000 } }, reels: { weight: 0.15, ms: { min: 1500, max: 2000 } } };
    const brain = makeBrain(4, { work: { ...SHORT.work, focusMs: 120_000, tasks } });
    place(brain, { x: 400, y: 700 });
    tapDesk(brain);
    const { snap } = runUntil(brain, (s) => s.phase === 'type', atWork(), 20_000);
    // Always starts in the terminal.
    expect(snap.screen).toBe('terminal');
    const snaps = run(brain, 100_000, atWork());
    const animation = { terminal: 'work', web: 'browse', reels: 'reels' } as const;
    for (const s of snaps) expect(s.animation).toBe(animation[s.screen!]);
    const seen = snaps.map((s) => s.screen);
    expect(new Set(seen)).toEqual(new Set(['terminal', 'web', 'reels']));
    // Never the same thing twice in a row: each switch is to something else.
    const switches = seen.filter((t, i) => i > 0 && t !== seen[i - 1]).length;
    expect(switches).toBeGreaterThan(20);
    // Reels are the rarest.
    const share = (t: string) => seen.filter((x) => x === t).length / seen.length;
    expect(share('reels')).toBeLessThan(share('terminal'));
    // Away from the desk, the screen goes back to its screen saver.
    expect(run(brain, 50, world()).at(-1)!.screen).toBe(null);
  });

  it('after its time is up, gets restless, then comes over to you asking to play', () => {
    const brain = makeBrain(4, SHORT);
    place(brain, { x: 400, y: 700 });
    tapDesk(brain);
    runUntil(brain, (s) => s.animation === 'work', atWork(), 20_000);
    const cursor = { x: 600, y: 500 };
    const input = atWork({ cursor, cursorStillMs: 10_000 });
    const typing = runUntil(brain, (s) => s.phase !== 'type', input, 40_000);
    expect(typing.elapsed).toBeGreaterThan(25_000);
    expect(typing.snap.phase).toBe('restless');
    // Looking about at anything but the screen.
    const looks = new Set(run(brain, 2900, input).map((s) => JSON.stringify(s.lookAt)));
    expect(looks.size).toBeGreaterThan(1);
    const { snap } = runUntil(brain, (s) => s.phase === 'beg' && s.animation === 'attention', input, 20_000);
    expect(Math.abs(snap.position.x - cursor.x)).toBeLessThan(size.width);
    expect(snap.facing).toBe(cursor.x < snap.position.x ? -1 : 1);
    const said = run(brain, 9000, input).map((s) => s.say).filter((t): t is string => t !== null);
    expect(new Set(said).size).toBeGreaterThan(1);
  });

  it('pet it while it asks, and it’s delighted and goes off to play', () => {
    const brain = makeBrain(4, { ...SHORT, work: { ...SHORT.work, focusMs: 1000, restlessMs: 500 } });
    place(brain, { x: 1000, y: 700 });
    tapDesk(brain);
    const input = atWork({ cursor: { x: 700, y: 500 }, cursorStillMs: 10_000 });
    runUntil(brain, (s) => s.phase === 'beg' && s.animation === 'attention', input, 30_000);
    brain.poke();
    const snaps = run(brain, 2500, input);
    expect(snaps[0]!.animation).toBe('happy');
    expect(snaps[0]!.say).toBe('Yay!');
    expect(snaps.at(-1)!.reaction).not.toBe('work');
  });

  it('pet it while it works, and it enjoys it, then gets back to work', () => {
    const brain = makeBrain(4, SHORT);
    place(brain, { x: 400, y: 700 });
    tapDesk(brain);
    runUntil(brain, (s) => s.animation === 'work', atWork(), 20_000);
    brain.poke();
    expect(run(brain, 100, atWork()).at(-1)!.animation).toBe('happy');
    const { snap } = runUntil(brain, (s) => s.animation === 'work', atWork(), 10_000);
    expect(snap.reaction).toBe('work');
  });

  it('stops working when the desk is put away', () => {
    const brain = makeBrain(4, SHORT);
    place(brain, { x: 400, y: 700 });
    tapDesk(brain);
    runUntil(brain, (s) => s.animation === 'work', atWork(), 20_000);
    expect(run(brain, 200, world()).at(-1)!.reaction).not.toBe('work');
  });
});

