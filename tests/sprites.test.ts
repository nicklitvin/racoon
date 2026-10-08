import { describe, expect, it } from 'vitest';
import { Animator } from '../src/core/animator';
import { seededRandom } from '../src/core/behavior/motion';
import { ANIMATIONS } from '../src/sprites/animations';
import { PEEK_EDGE_Y, poseFor } from '../src/sprites/pose';
import { pawPosition, RIG, toWorld, type LegName, type Pose } from '../src/sprites/rig';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

const LEGS: LegName[] = ['frontNear', 'frontFar', 'backNear', 'backFar'];

/** Samples an animation across a couple of cycles. */
function samples(name: AnimationName, count = 40): Pose[] {
  const { durationMs } = ANIMATIONS[name];
  return Array.from({ length: count }, (_, i) => poseFor(name, (i / count) * durationMs * 2));
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('poses', () => {
  it('gives every animation a timing spec', () => {
    for (const name of ANIMATION_NAMES) {
      const spec = ANIMATIONS[name];
      expect(spec.fps, name).toBeGreaterThan(0);
      expect(spec.durationMs, name).toBeGreaterThan(0);
    }
  });

  it('produces finite numbers for every animation at any time', () => {
    for (const name of ANIMATION_NAMES) {
      for (const pose of samples(name)) {
        expect(numbers(pose).every(Number.isFinite), name).toBe(true);
      }
    }
  });

  it('keeps the drawing inside its box', () => {
    const { view } = RIG;
    for (const name of ANIMATION_NAMES) {
      for (const pose of samples(name)) {
        // The head is the part that travels furthest; ears reach about 27 units above the neck.
        const neck = toWorld(RIG.neck, pose);
        expect(neck.y - 27, `${name} head`).toBeGreaterThanOrEqual(view.y - 1);
        for (const leg of LEGS) {
          const paw = pawPosition(pose, leg);
          expect(paw.x, `${name} ${leg}`).toBeGreaterThanOrEqual(view.x);
          expect(paw.x, `${name} ${leg}`).toBeLessThanOrEqual(view.x + view.width);
          expect(paw.y, `${name} ${leg}`).toBeLessThanOrEqual(view.y + view.height + 1);
        }
      }
    }
  });

  it('keeps paws on the ground while standing and sitting', () => {
    for (const name of ['idle', 'sit', 'confused', 'yawn'] as const) {
      for (const pose of samples(name)) {
        for (const leg of ['frontNear', 'frontFar', 'backNear'] as const) {
          // Sitting haunches tuck under the body rather than reaching the ground.
          if (name !== 'idle' && leg === 'backNear') continue;
          expect(Math.abs(pawPosition(pose, leg).y), `${name} ${leg}`).toBeLessThan(1);
        }
      }
    }
  });

  it('swings the legs in alternating pairs while walking', () => {
    const quarter = poseFor('walk', ANIMATIONS.walk.durationMs / 4);
    const threeQuarters = poseFor('walk', (ANIMATIONS.walk.durationMs * 3) / 4);
    expect(quarter.legs.frontNear.angle).toBeGreaterThan(10);
    expect(quarter.legs.frontFar.angle).toBeLessThan(-10);
    expect(threeQuarters.legs.frontNear.angle).toBeLessThan(-10);
  });

  it('rests the paws on the screen edge while peeking', () => {
    const pose = poseFor('peek', 0, 0);
    expect(pawPosition(pose, 'frontNear').y).toBeCloseTo(PEEK_EDGE_Y, 0);
    // And the head is above the edge, so it shows.
    expect(toWorld(RIG.neck, pose).y).toBeLessThan(PEEK_EDGE_Y - 10);
  });

  it('moves the peeking eyes with key presses, not time', () => {
    expect(poseFor('peek', 0, 3).look).toEqual(poseFor('peek', 5000, 3).look);
    const xs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => poseFor('peek', 0, k).look.x);
    expect(xs[0]).toBe(-1);
    expect(xs[7]).toBe(1);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('opens and closes the mouth over a yawn', () => {
    const { durationMs } = ANIMATIONS.yawn;
    expect(poseFor('yawn', 0).mouth).toBeCloseTo(0);
    expect(poseFor('yawn', durationMs / 2).mouth).toBeGreaterThan(0.9);
    expect(poseFor('yawn', durationMs).mouth).toBeCloseTo(0);
  });

  it('lands the surprised hop back where it started', () => {
    expect(poseFor('surprised', 200).y).toBeLessThan(-8);
    expect(poseFor('surprised', ANIMATIONS.surprised.durationMs).y).toBeCloseTo(0);
  });
});

describe('Animator', () => {
  it('steps time at the animation fps and loops', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(1));
    animator.play('idle');
    const frameMs = 1000 / ANIMATIONS.idle.fps;
    animator.update(frameMs * 2.5);
    expect(animator.time).toBeCloseTo(frameMs * 2);
    animator.update(ANIMATIONS.idle.durationMs);
    expect(animator.time).toBeLessThan(ANIMATIONS.idle.durationMs);
  });

  it('holds the end of a non-looping animation', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(1));
    animator.play('yawn');
    animator.update(60_000);
    expect(animator.time).toBe(ANIMATIONS.yawn.durationMs);
  });

  it('restarts an animation when switching to it', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(1));
    animator.play('walk');
    animator.update(300);
    animator.play('idle');
    expect(animator.time).toBe(0);
  });

  it('blinks every few seconds while eyes are open', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(4));
    animator.play('idle');
    let blinks = 0;
    let wasBlinking = false;
    for (let t = 0; t < 30_000; t += 16) {
      animator.update(16);
      const blinking = animator.eyes === 'blink';
      if (blinking && !wasBlinking) blinks++;
      wasBlinking = blinking;
    }
    expect(blinks).toBeGreaterThanOrEqual(5);
    expect(blinks).toBeLessThanOrEqual(15);
  });

  it('never blinks closed or wide eyes', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(4));
    animator.play('sleep');
    for (let t = 0; t < 20_000; t += 16) {
      animator.update(16);
      expect(animator.eyes).toBe('closed');
    }
  });

  it('counts key presses for keystroke-driven animations', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(1));
    animator.play('peek');
    animator.keystroke();
    animator.keystroke();
    expect(animator.keystrokes).toBe(2);
  });

  it('reports when the next visible change is due', () => {
    const animator = new Animator(ANIMATIONS, seededRandom(1));
    animator.play('sleep');
    expect(animator.msUntilChange()).toBeCloseTo(1000 / ANIMATIONS.sleep.fps, 0);
    // A finished one-shot animation only changes again if it blinks.
    animator.play('jump');
    animator.update(5000);
    expect(animator.msUntilChange()).toBe(Infinity);
  });
});
