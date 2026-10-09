import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../src/sprites/animations';
import { CAT, CAT_PEEK_EDGE_Y, catPoseFor, headCentre, type CatPose } from '../src/sprites/catPose';
import { ANIMATION_NAMES, type AnimationName } from '../src/sprites/types';

function samples(name: AnimationName, count = 40): CatPose[] {
  const { durationMs } = ANIMATIONS[name];
  return Array.from({ length: count }, (_, i) => catPoseFor(name, (i / count) * durationMs * 2, i));
}

function numbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(numbers);
  return [];
}

describe('black cat poses', () => {
  it('produces finite numbers for every animation at any time', () => {
    for (const name of ANIMATION_NAMES) {
      for (const pose of samples(name)) expect(numbers(pose).every(Number.isFinite), name).toBe(true);
    }
  });

  it('keeps paws on the ground while standing and sitting', () => {
    for (const name of ['idle', 'sit', 'confused', 'yawn'] as const) {
      for (const pose of samples(name)) {
        for (const paw of Object.values(pose.paws)) expect(Math.abs(paw.y), name).toBeLessThan(0.01);
      }
    }
  });

  it('always has a paw planted while walking, and never sinks below the ground', () => {
    for (const pose of samples('walk', 120)) {
      const ys = Object.values(pose.paws).map((p) => p.y);
      expect(ys.filter((y) => y === 0).length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...ys)).toBeLessThanOrEqual(0);
    }
  });

  it('crouches before a pounce and is airborne in the middle of it', () => {
    const start = catPoseFor('jump', 0);
    const crouch = catPoseFor('jump', 70);
    const mid = catPoseFor('jump', 210);
    expect(crouch.squash).toBeLessThan(start.squash);
    expect(Math.max(...Object.values(mid.paws).map((p) => p.y))).toBeLessThan(-3);
  });

  it('hooks the front paws over the screen edge while peeking, face above it', () => {
    const pose = catPoseFor('peek', 0, 0);
    expect(pose.paws.frontNear.y).toBeLessThanOrEqual(CAT_PEEK_EDGE_Y);
    expect(pose.paws.frontNear.y).toBeGreaterThan(CAT_PEEK_EDGE_Y - 4);
    expect(headCentre(pose).y).toBeLessThan(CAT_PEEK_EDGE_Y - 10);
  });

  it('moves the peeking eyes with key presses, not time', () => {
    expect(catPoseFor('peek', 0, 3).look).toEqual(catPoseFor('peek', 5000, 3).look);
    expect(catPoseFor('peek', 0, 0).look.x).toBe(-1);
    expect(catPoseFor('peek', 0, 7).look.x).toBe(1);
  });

  it('keeps the head inside the drawing box', () => {
    const { view } = CAT;
    for (const name of ANIMATION_NAMES) {
      for (const pose of samples(name)) {
        const head = headCentre(pose);
        // Ears reach about 28 units above the head centre once squashed.
        expect(head.y * pose.squash - 28, name).toBeGreaterThanOrEqual(view.y);
        expect(head.x, name).toBeLessThan(view.x + view.width - 20);
      }
    }
  });

  it('eases its head tilt when confused instead of snapping', () => {
    const angles = Array.from({ length: 180 }, (_, i) => catPoseFor('confused', i * 10).head.angle);
    const biggestJump = Math.max(...angles.slice(1).map((a, i) => Math.abs(a - angles[i]!)));
    expect(biggestJump).toBeLessThan(2);
  });
});
