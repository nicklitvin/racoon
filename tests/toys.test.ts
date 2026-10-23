import { describe, expect, it } from 'vitest';
import { Brain, type PetSnapshot, type WorldInput } from '../src/core/behavior/brain';
import { DEFAULT_CONFIG, withConfig, type ConfigOverrides } from '../src/core/behavior/config';
import { seededRandom } from '../src/core/behavior/motion';
import { targetHeading } from '../src/core/heading';
import { Toybox, type Toy } from '../src/core/toys/toybox';
import { PLAY } from '../src/sprites/animations';

const bounds = { x: 0, y: 0, width: 1600, height: 900 };
const size = { width: 150, height: 90 };
const REACH = 40;
const STEP = 16;

function world(overrides: Partial<WorldInput> = {}): WorldInput {
  return { bounds, size, cursor: null, cursorExcited: false, cursorStillMs: Infinity, typingActive: false, toyReach: REACH, ...overrides };
}

function toybox(...spots: { x: number; y: number }[]): Toybox {
  const box = new Toybox();
  box.size = 16;
  box.setBounds({ x: 0, y: 60, width: 1600, height: 840 });
  spots.forEach((at, i) => box.add(i, at));
  return box;
}

/** Steps the blocks the way the brain does, 60 times a second. */
function stepBox(box: Toybox, ms: number, each?: (t: number) => void): void {
  for (let t = 0; t < ms; t += 1000 / 60) {
    box.step(1 / 60);
    each?.(t);
  }
}

/** Only ever plays when it has nothing else to do: no sitting, turning about or zoomies. */
const PLAYFUL: ConfigOverrides = { wander: { playChance: 1, sitChance: 0, lookAroundChance: 0, zoomiesChance: 0, pauseMs: { min: 300, max: 600 } } };

function makeBrain(box: Toybox, overrides: ConfigOverrides = {}, seed = 1) {
  const config = withConfig({ ...PLAYFUL, ...overrides, wander: { ...PLAYFUL.wander, ...overrides.wander } });
  return new Brain(world(), seededRandom(seed), config, box);
}

/** Runs the brain, checking it never teleports. */
function run(brain: Brain, ms: number, input: WorldInput = world(), each?: (s: PetSnapshot) => void): PetSnapshot[] {
  const out: PetSnapshot[] = [];
  let prev: PetSnapshot | null = null;
  for (let t = 0; t < ms; t += STEP) {
    const snap = brain.update(STEP, input);
    if (prev) expect(Math.hypot(snap.position.x - prev.position.x, snap.position.y - prev.position.y)).toBeLessThan(80);
    each?.(snap);
    out.push(snap);
    prev = snap;
  }
  return out;
}

function runUntil(brain: Brain, predicate: (s: PetSnapshot) => boolean, maxMs = 30_000, input: WorldInput = world()): PetSnapshot {
  for (let t = 0; t < maxMs; t += STEP) {
    const [snap] = run(brain, STEP, input);
    if (predicate(snap!)) return snap!;
  }
  throw new Error(`condition not reached within ${maxMs}ms`);
}

const moved = (toy: Toy, from: { x: number; y: number }) => Math.hypot(toy.x - from.x, toy.y - from.y);

/** Picks him up and puts him down somewhere. */
function place(brain: Brain, feet: { x: number; y: number }) {
  brain.grab();
  brain.dragTo(feet);
  brain.update(100, world());
  brain.release();
}

describe('Toybox', () => {
  it('throws a block in an arc: up, down, a bounce or two, and it settles flat on a face', () => {
    const box = toybox({ x: 400, y: 800 });
    const toy = box.toys[0]!;
    box.hold(toy.id, 'pet');
    box.moveHeld(toy.id, { x: 400, y: 800 }, 40);
    box.release(toy.id, 'pet', { x: 320, y: 0, z: 600 }, 700);
    expect(toy.thrownBy).toBe('pet');
    const heights: number[] = [];
    let bounced = false;
    stepBox(box, 4000, () => {
      heights.push(toy.z);
      if (toy.z === 0 && toy.vz > 0) bounced = true;
    });
    expect(Math.max(...heights)).toBeGreaterThan(100);
    expect(bounced).toBe(true);
    expect(box.isResting(toy)).toBe(true);
    expect(box.settled).toBe(true);
    expect(toy.z).toBe(0);
    expect(toy.angle % 90).toBe(0);
    expect(toy.x).toBeGreaterThan(550);
  });

  it('keeps blocks on the floor: they bounce back off the sides', () => {
    const box = toybox({ x: 1500, y: 700 });
    const toy = box.toys[0]!;
    box.hit(toy.id, { x: 1400, y: 0, z: 200 }, 500);
    let back = false;
    stepBox(box, 3000, () => {
      expect(toy.x).toBeLessThanOrEqual(1600 - box.size / 2);
      if (toy.vx < 0) back = true;
    });
    expect(back).toBe(true);
    expect(box.isResting(toy)).toBe(true);
  });

  it('knows where a moving block will come to rest', () => {
    const box = toybox({ x: 300, y: 500 });
    const toy = box.toys[0]!;
    box.hit(toy.id, { x: 380, y: 90, z: 260 }, 400);
    const landing = box.landing(toy.id)!;
    stepBox(box, 5000);
    expect(landing.x).toBeCloseTo(toy.x, 0);
    expect(landing.y).toBeCloseTo(toy.y, 0);
  });

  it('never leaves two blocks inside each other', () => {
    const box = toybox({ x: 500, y: 600 }, { x: 503, y: 601 });
    stepBox(box, 200);
    const [a, b] = box.toys;
    expect(Math.hypot(a!.x - b!.x, (a!.y - b!.y) / 0.55)).toBeGreaterThan(box.size * 0.95);
  });

  it('holds a block still in the air while someone has it; you can take it off the pet, not the other way round', () => {
    const box = toybox({ x: 500, y: 600 });
    const toy = box.toys[0]!;
    expect(box.hold(toy.id, 'pet')).toBe(true);
    box.moveHeld(toy.id, { x: 510, y: 600 }, 30);
    stepBox(box, 500);
    expect(toy.z).toBe(30);
    expect(box.settled).toBe(false);
    expect(box.hold(toy.id, 'user')).toBe(true);
    expect(box.hold(toy.id, 'pet')).toBe(false);
    expect(box.heldBy('user')).toBe(toy);
  });
});

describe('Brain: playing with toys', () => {
  it('never plays without any toys', () => {
    const brain = makeBrain(toybox());
    const snaps = run(brain, 60_000);
    expect(snaps.some((s) => s.reaction === 'play')).toBe(false);
  });

  it('goes over to a block and plays with it, beside it and square on to it, and it goes flying', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box);
    runUntil(brain, (s) => s.reaction === 'play');
    const start = { x: toy.x, y: toy.y };
    const turn = runUntil(brain, (s) => s.animation === 'bat' || s.animation === 'toss');
    // Standing at arm's length beside it, facing it.
    expect(Math.abs(Math.abs(turn.position.x - toy.x) - REACH)).toBeLessThan(8);
    expect(Math.abs(turn.position.y - toy.y)).toBeLessThan(8);
    expect(turn.facing).toBe(toy.x > turn.position.x ? 1 : -1);
    expect(turn.aim).toBe(turn.facing > 0 ? 0 : Math.PI);
    expect(targetHeading(1, { velocity: { x: 0, y: 0 }, facing: turn.facing, animation: turn.animation, aim: turn.aim })).toBeCloseTo(turn.aim!, 5);
    run(brain, 1500);
    expect(moved(toy, start)).toBeGreaterThan(60);
  });

  it('swats a block just as the paw meets it', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 0, pounceChance: 0 } });
    runUntil(brain, (s) => s.animation === 'bat');
    let ms = STEP;
    const at = { x: toy.x, y: toy.y };
    run(brain, PLAY.batMs, world(), () => {
      ms += STEP;
      if (ms < PLAY.batHitMs - STEP) expect(box.isResting(toy)).toBe(true);
    });
    expect(box.isResting(toy) && moved(toy, at) < 1).toBe(false);
    expect(toy.thrownBy).toBe('pet');
  });

  it('throws a block: picks it up on cue, holds it, and lets it fly at the top of the swing', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 1, pounceChance: 0 } });
    runUntil(brain, (s) => s.animation === 'toss');
    let ms = STEP;
    const holders: (string | null)[] = [];
    let highest = 0;
    run(brain, PLAY.tossMs + 600, world(), (s) => {
      ms += STEP;
      holders.push(toy.holder);
      if (ms < PLAY.tossGrabMs - STEP) expect(toy.holder).toBe(null);
      if (ms > PLAY.tossGrabMs + STEP && ms < PLAY.tossReleaseMs - STEP) {
        expect(toy.holder).toBe('pet');
        expect(s.lookAt).toBe(null);
      }
      if (ms > PLAY.tossReleaseMs + STEP) expect(toy.holder).toBe(null);
      highest = Math.max(highest, toy.z);
    });
    expect(holders).toContain('pet');
    expect(toy.thrownBy).toBe('pet');
    expect(highest).toBeGreaterThan(60);
  });

  it('drops a block it was carrying when you pick it up', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 1, pounceChance: 0 } });
    runUntil(brain, () => toy.holder === 'pet');
    brain.grab();
    run(brain, 32);
    expect(toy.holder).toBe(null);
  });

  it('goes after a block you throw at full tilt, to wherever it lands', () => {
    const box = toybox({ x: 300, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { wander: { playChance: 0, pauseMs: { min: 60_000, max: 60_000 } } });
    run(brain, 500);
    box.hold(toy.id, 'user');
    box.moveHeld(toy.id, { x: 300, y: 700 }, 30);
    box.release(toy.id, 'user', { x: 700, y: -50, z: 500 }, 300);
    brain.toyThrown(toy.id);
    const snaps: PetSnapshot[] = [];
    runUntil(brain, (s) => (snaps.push(s), s.animation === 'bat' || s.animation === 'toss'), 10_000);
    expect(snaps.some((s) => s.animation === 'chase' || s.animation === 'leap')).toBe(true);
    expect(snaps.every((s) => s.reaction === 'play')).toBe(true);
    const last = snaps.at(-1)!;
    expect(Math.hypot(last.position.x - toy.x, last.position.y - toy.y)).toBeLessThan(REACH + 10);
  });

  it('waits with its eyes on a block you pick up, and is off after it when you throw it', () => {
    const box = toybox({ x: 600, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { wander: { playChance: 0, pauseMs: { min: 60_000, max: 60_000 } } });
    brain.toyThrown(toy.id);
    run(brain, 200);
    box.hold(toy.id, 'user');
    box.moveHeld(toy.id, { x: 650, y: 650 }, 30);
    const waiting = run(brain, 1000).at(-1)!;
    expect(waiting.phase).toBe('wait');
    expect(waiting.lookAt).not.toBe(null);
    expect(waiting.animation).toBe('idle');
    box.release(toy.id, 'user', { x: -600, y: 0, z: 400 });
    brain.toyThrown(toy.id);
    const after = run(brain, 300).at(-1)!;
    expect(after.phase).toBe('go');
    expect(Math.abs(after.velocity.x)).toBeGreaterThan(50);
  });

  it('a game lasts a few turns, then it wanders off', () => {
    const box = toybox({ x: 1000, y: 700 });
    const brain = makeBrain(box, { wander: { playChance: 0.5 } });
    runUntil(brain, (s) => s.reaction === 'play');
    let turns = 0;
    let last = '';
    const end = runUntil(brain, (s) => {
      if ((s.animation === 'bat' || s.animation === 'toss') && s.animation !== last) turns++;
      last = s.animation;
      return s.reaction !== 'play';
    }, 60_000);
    expect(turns).toBeGreaterThanOrEqual(1);
    expect(turns).toBeLessThanOrEqual(5);
    expect(end.mode).toBe('idle');
  });

  it('sends any block in its way flying as it charges past', () => {
    const box = toybox({ x: 1000, y: 899 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { wander: { playChance: 0 } });
    // Chasing the pointer straight along the bottom of the screen, through the block.
    const input = world({ cursor: { x: 1500, y: 860 }, cursorExcited: true, cursorStillMs: 0 });
    run(brain, 2500, input);
    expect(toy.thrownBy).toBe('pet');
    expect(Math.abs(toy.x - 1000)).toBeGreaterThan(40);
  });

  it('a raccoon picks a block up, walks off with it on his hind legs, and throws it from there', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 1, carryChance: 1, pounceChance: 0 } });
    const carrier = world({ carries: true });
    runUntil(brain, (s) => s.animation === 'lift', 30_000, carrier);
    let ms = STEP;
    run(brain, PLAY.liftMs - STEP, carrier, () => {
      ms += STEP;
      if (ms < PLAY.liftGrabMs - STEP) expect(toy.holder).toBe(null);
      if (ms > PLAY.liftGrabMs + STEP) expect(toy.holder).toBe('pet');
    });
    const start = runUntil(brain, (s) => s.animation === 'carry', 1000, carrier).position;
    // Off he goes with it, on two legs, never letting go, at a careful walking pace.
    const carrying = [] as PetSnapshot[];
    const end = runUntil(brain, (s) => (carrying.push(s), s.animation !== 'carry'), 10_000, carrier);
    expect(end.animation).toBe('throw');
    expect(Math.abs(end.position.x - start.x)).toBeGreaterThan(100);
    expect(Math.max(...carrying.map((s) => Math.hypot(s.velocity.x, s.velocity.y)))).toBeLessThan(DEFAULT_CONFIG.motion.walkSpeed * 1.2);
    expect(toy.holder).toBe('pet');
    // Then throws it the way he's facing.
    const facing = end.facing;
    const at = toy.x;
    run(brain, PLAY.throwMs + 800, carrier);
    expect(toy.holder).toBe(null);
    expect(toy.thrownBy).toBe('pet');
    expect((toy.x - at) * facing).toBeGreaterThan(60);
  });

  it('only animals that can carry a block go off with one: the rest just throw it', () => {
    const box = toybox({ x: 1100, y: 700 });
    const brain = makeBrain(box, { play: { tossChance: 1, carryChance: 1, pounceChance: 0 } });
    const snaps = run(brain, 40_000);
    expect(snaps.some((s) => s.animation === 'toss')).toBe(true);
    expect(snaps.some((s) => s.animation === 'lift' || s.animation === 'carry' || s.animation === 'throw')).toBe(false);
  });

  it('lets go of a block he is carrying when you take it off him, and waits for you to throw it', () => {
    const box = toybox({ x: 1100, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 1, carryChance: 1, pounceChance: 0 } });
    const carrier = world({ carries: true });
    runUntil(brain, (s) => s.animation === 'carry', 30_000, carrier);
    run(brain, 300, carrier);
    expect(box.hold(toy.id, 'user')).toBe(true);
    const snap = run(brain, 200, carrier).at(-1)!;
    expect(snap.phase).toBe('wait');
    expect(snap.animation).not.toBe('carry');
    expect(toy.holder).toBe('user');
  });
});


describe('Brain: different ways to play', () => {
  it('plays in all sorts of ways, not the same thing every time', () => {
    const box = toybox({ x: 500, y: 700 }, { x: 1100, y: 650 }, { x: 800, y: 820 });
    const brain = makeBrain(box, {}, 3);
    const seen = new Set(run(brain, 400_000).map((s) => s.animation));
    for (const animation of ['bat', 'toss', 'sniff', 'nudge', 'fetch', 'stalk', 'jump'] as const) expect(seen, animation).toContain(animation);
  });

  it('heads straight for a block once it is close, rather than running round and round it', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const box = toybox({ x: 800, y: 700 });
      const toy = box.toys[0]!;
      const brain = makeBrain(box, { play: { pounceChance: 0, chargeChance: 0 } }, seed);
      place(brain, { x: 800, y: 300 });
      brain.toyThrown(toy.id);
      // From the moment he's within 150px of the block until he gets there.
      let path = 0;
      let start: PetSnapshot | null = null;
      let last: PetSnapshot | null = null;
      runUntil(brain, (s) => {
        const near = Math.hypot(s.position.x - toy.x, s.position.y - toy.y) < 150;
        if (near && !start) start = s;
        if (start && last) path += Math.hypot(s.position.x - last.position.x, s.position.y - last.position.y);
        last = s;
        return s.phase !== 'go';
      });
      const straight = Math.hypot(last!.position.x - start!.position.x, last!.position.y - start!.position.y);
      expect(path, `seed ${seed}`).toBeLessThan(straight * 1.3 + 20);
    }
  });

  it('noses a block along the floor a few pushes at a time', () => {
    const box = toybox({ x: 800, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 0, pounceChance: 0, chargeChance: 0, moves: { bat: 0, sniff: 0, nudge: 1, fetch: 0 } } });
    runUntil(brain, (s) => s.phase === 'nudge');
    const from = { x: toy.x, y: toy.y };
    const snaps = run(brain, 6000);
    expect(snaps.some((s) => s.animation === 'nudge')).toBe(true);
    expect(moved(toy, from)).toBeGreaterThan(50);
    // Little pushes, not swats: it never flies.
    expect(toy.thrownBy).toBe('pet');
  });

  it('trots off with a block in its mouth and drops it somewhere else', () => {
    const box = toybox({ x: 800, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { tossChance: 0, pounceChance: 0, chargeChance: 0, moves: { bat: 0, sniff: 0, nudge: 0, fetch: 1 } } });
    const from = runUntil(brain, () => toy.holder === 'pet').position;
    const carrying = runUntil(brain, (s) => s.animation === 'fetch');
    expect(carrying.reaction).toBe('play');
    // (Here nothing carries the block along with him: the page does that.)
    const to = runUntil(brain, () => toy.holder === null, 10_000).position;
    expect(Math.hypot(to.x - from.x, to.y - from.y)).toBeGreaterThan(80);
  });

  it('creeps up on a block low to the ground before it pounces', () => {
    const box = toybox({ x: 800, y: 700 });
    const brain = makeBrain(box, { play: { pounceChance: 1, stalkChance: 1, chargeChance: 0 } });
    place(brain, { x: 560, y: 700 });
    const snaps: PetSnapshot[] = [];
    runUntil(brain, (s) => (snaps.push(s), s.animation === 'jump'));
    const creeping = snaps.filter((s) => s.animation === 'stalk');
    expect(creeping.length).toBeGreaterThan(20);
    expect(Math.max(...creeping.map((s) => Math.hypot(s.velocity.x, s.velocity.y)))).toBeLessThan(DEFAULT_CONFIG.motion.walkSpeed * 0.6);
  });

  it('sometimes charges straight through a block from a long way off, sending it flying', () => {
    const box = toybox({ x: 1200, y: 700 });
    const toy = box.toys[0]!;
    const brain = makeBrain(box, { play: { chargeChance: 1, pounceChance: 0 } });
    place(brain, { x: 300, y: 700 });
    runUntil(brain, (s) => s.phase === 'charge');
    run(brain, 2500);
    expect(toy.thrownBy).toBe('pet');
    expect(Math.abs(toy.x - 1200)).toBeGreaterThan(60);
  });

  it('over a long time playing, never slides about standing still or goes backwards', () => {
    for (const carries of [false, true]) {
      const box = toybox({ x: 300, y: 700 }, { x: 800, y: 760 }, { x: 1300, y: 820 });
      const input = world({ carries });
      const brain = new Brain(input, seededRandom(7), withConfig({ ...PLAYFUL, wander: { ...PLAYFUL.wander, playChance: 0.7 } }), box);
      const still = new Set(['idle', 'bat', 'toss', 'lift', 'throw', 'sniff', 'sit', 'groom']);
      let sliding = 0;
      let backwards = 0;
      run(brain, 180_000, input, (s) => {
        const speed = Math.hypot(s.velocity.x, s.velocity.y);
        if (s.reaction === 'play' && still.has(s.animation) && speed > 40) sliding += STEP;
        if (s.reaction === 'play' && speed > 40 && Math.abs(s.velocity.x) > 30 && Math.sign(s.velocity.x) !== s.facing) backwards += STEP;
      });
      expect(sliding, carries ? 'raccoon' : 'cat').toBeLessThan(200);
      expect(backwards, carries ? 'raccoon' : 'cat').toBeLessThan(200);
    }
  });

  it('pounces forwards and lands by the block, not past it', () => {
    const box = toybox({ x: 800, y: 700 });
    const brain = makeBrain(box, { play: { pounceChance: 1, stalkChance: 0, chargeChance: 0 } });
    place(brain, { x: 620, y: 700 });
    runUntil(brain, (s) => s.phase === 'pounce');
    const snaps: PetSnapshot[] = [];
    runUntil(brain, (s) => {
      snaps.push(s);
      return s.phase !== 'pounce';
    });
    // Only ever towards it, and never past where he swats it from.
    expect(snaps.every((s) => s.velocity.x >= -1)).toBe(true);
    expect(Math.max(...snaps.map((s) => s.position.x))).toBeLessThanOrEqual(800 - REACH + 1);
  });
});
