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
      const speeds = walk.map(speed);
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
