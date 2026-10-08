import { describe, expect, it } from 'vitest';
import { Brain, DEFAULT_TUNING, type PetSnapshot, type Tuning, type WorldInput } from '../src/core/behavior/brain';
import { seededRandom } from '../src/core/behavior/motion';

const bounds = { x: 0, y: 0, width: 1600, height: 900 };
const floor = bounds.y + bounds.height;
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

function makeBrain(seed = 1, tuning: Partial<Tuning> = {}) {
  return new Brain(world(), seededRandom(seed), { ...DEFAULT_TUNING, ...tuning });
}

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
    s.position.y <= floor + 0.5
  );
}

describe('Brain: autonomous behaviour', () => {
  it('starts idle, on the floor, in the middle', () => {
    const snap = makeBrain().update(0, world());
    expect(snap.mode).toBe('idle');
    expect(snap.position).toEqual({ x: 800, y: floor });
  });

  it('wanders, floats and sits without leaving the screen or teleporting', () => {
    const brain = makeBrain(7);
    const snaps = run(brain, 150_000);
    const modes = new Set(snaps.map((s) => s.mode));
    expect(modes).toContain('walk');
    expect(modes).toContain('float');
    expect(modes).toContain('sit');
    expect(snaps.every(inBounds)).toBe(true);
    // It goes somewhere, rather than standing in one spot.
    const xs = snaps.map((s) => s.position.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(300);
  });

  it('eases in and out of walks', () => {
    const brain = makeBrain(3);
    const { snap } = runUntil(brain, (s) => s.mode === 'walk');
    expect(Math.abs(snap.velocity.x)).toBeLessThan(20);
    const walk = run(brain, 1500);
    const speeds = walk.map((s) => Math.abs(s.velocity.x));
    expect(Math.max(...speeds)).toBeGreaterThan(40);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(DEFAULT_TUNING.walkSpeed * 1.15 + 1);
  });

  it('floats off the floor and lands back on it', () => {
    const brain = makeBrain(11);
    runUntil(brain, (s) => s.mode === 'float', world(), 120_000);
    const flight = run(brain, 2000);
    expect(Math.min(...flight.map((s) => s.position.y))).toBeLessThan(floor - 50);
    const { snap } = runUntil(brain, (s) => s.mode !== 'float');
    expect(snap.position.y).toBeCloseTo(floor, 0);
  });

  it('falls asleep after a long calm stretch', () => {
    const brain = makeBrain(5, { sleepAfterMs: 20_000 });
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
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
    expect(first!.emote).toBe('!');
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
    expect(confused.emote).toBe('?');
    expect(confused.position.y).toBeCloseTo(floor, 0);
    const { snap: after } = runUntil(brain, (s) => s.mode !== 'react', stopped, 10_000);
    expect(after.mode).toBe('idle');
  });

  it('wakes up to chase', () => {
    const brain = makeBrain(5, { sleepAfterMs: 5_000 });
    runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
    const [snap] = run(brain, STEP, excited());
    expect(snap!.reaction).toBe('surprised');
  });

  it('runs away from a cursor that gets too close', () => {
    const brain = makeBrain(2, { fleeChance: 1 });
    run(brain, 500);
    const cursor = { x: 760, y: floor - 45 };
    const [snap] = run(brain, STEP, world({ cursor, cursorStillMs: 0 }));
    expect(snap!.reaction).toBe('flee');
    const after = run(brain, 1500, world({ cursor, cursorStillMs: 2000 })).at(-1)!;
    expect(after.position.x).toBeGreaterThan(800 + 150);
  });

  it('hides behind the screen edge when it can not run any further', () => {
    const brain = makeBrain(2, { fleeChance: 1 });
    brain.grab();
    brain.dragTo({ x: 160, y: floor });
    run(brain, 100);
    brain.release();
    runUntil(brain, (s) => s.mode === 'idle');
    const cursor = { x: 220, y: floor - 45 };
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
    const brain = makeBrain(2, { fleeChance: 1 });
    run(brain, 500);
    const cursor = { x: 760, y: floor - 45 };
    run(brain, STEP, world({ cursor }));
    const { snap } = runUntil(brain, (s) => s.mode === 'idle', world({ cursor }));
    // It ran away, so the cursor is no longer near; standing still near it again needs a new approach.
    expect(Math.abs(snap.position.x - cursor.x)).toBeGreaterThan(100);
  });
});

describe('Brain: typing reactions', () => {
  it('goes to the floor and peeks over it while you type, then comes back up', () => {
    const brain = makeBrain(9);
    const typing = world({ typingActive: true });
    const [first] = run(brain, STEP, typing);
    expect(first!.reaction).toBe('peek');
    const { snap: watching } = runUntil(brain, (s) => s.phase === 'watch', typing);
    expect(watching.animation).toBe('peek');
    expect(watching.position.y).toBeGreaterThan(floor + 10);
    expect(run(brain, 5000, typing).every((s) => s.phase === 'watch')).toBe(true);

    const { snap: back } = runUntil(brain, (s) => s.mode !== 'react', world());
    expect(back.mode).toBe('idle');
    expect(back.position.y).toBeCloseTo(floor, 0);
  });

  it('drops out of a float to come and watch', () => {
    const brain = makeBrain(11);
    runUntil(brain, (s) => s.mode === 'float', world(), 120_000);
    run(brain, 1500);
    const { snap } = runUntil(brain, (s) => s.phase === 'watch', world({ typingActive: true }));
    expect(snap.position.y).toBeGreaterThan(floor);
  });

  it('lets cursor excitement interrupt typing-watch', () => {
    const brain = makeBrain(9);
    runUntil(brain, (s) => s.phase === 'watch', world({ typingActive: true }));
    const [snap] = run(brain, STEP, world({ typingActive: true, cursor: { x: 300, y: 300 }, cursorExcited: true, cursorStillMs: 0 }));
    expect(snap!.reaction).toBe('surprised');
  });
});

describe('Brain: dragging and the world changing', () => {
  it('follows the pointer while dragged and falls to the floor when let go', () => {
    const brain = makeBrain();
    brain.grab();
    brain.dragTo({ x: 500, y: 300 });
    const [held] = run(brain, STEP);
    expect(held!.position).toEqual({ x: 500, y: 300 });
    expect(held!.animation).toBe('dangle');
    brain.release();
    const { snap, elapsed } = runUntil(brain, (s) => s.mode === 'idle');
    expect(snap.position.y).toBeCloseTo(floor, 0);
    expect(elapsed).toBeLessThan(2000);
  });

  it('keeps a drag inside the screen', () => {
    const brain = makeBrain();
    brain.grab();
    brain.dragTo({ x: -500, y: -500 });
    const [held] = run(brain, STEP);
    expect(inBounds(held!)).toBe(true);
  });

  it('a click startles it', () => {
    const brain = makeBrain();
    brain.poke();
    const [snap] = run(brain, STEP);
    expect(snap!.reaction).toBe('surprised');
    expect(snap!.position.y).toBeLessThan(floor);
  });

  it('stays on screen when the display shrinks', () => {
    const brain = makeBrain();
    brain.grab();
    brain.dragTo({ x: 1500, y: floor });
    run(brain, 100);
    brain.release();
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
      return Math.max(...run(b, 3000).filter((s) => s.mode === 'walk').map((s) => Math.abs(s.velocity.x)));
    };
    expect(peakWalkSpeed(fast)).toBeGreaterThan(peakWalkSpeed(slow) * 1.5);
  });

  it('reports resting when nothing moves, so the renderer can idle', () => {
    const brain = makeBrain(5, { sleepAfterMs: 5_000 });
    const { snap } = runUntil(brain, (s) => s.mode === 'sleep', world(), 120_000);
    run(brain, 500);
    expect(run(brain, STEP)[0]!.resting).toBe(true);
    expect(snap.mode).toBe('sleep');
  });
});
