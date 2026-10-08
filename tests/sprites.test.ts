import { describe, expect, it } from 'vitest';
import { Animator } from '../src/core/animator';
import { seededRandom } from '../src/core/behavior/motion';
import { asciiRaccoon } from '../src/sprites/asciiRaccoon';
import { activeSheet } from '../src/sprites';
import { frameSize, normalizeAnimation, renderFrame } from '../src/sprites/render';
import { ANIMATION_NAMES } from '../src/sprites/types';

describe('sprite sheet', () => {
  it('defines every animation with at least one frame', () => {
    for (const name of ANIMATION_NAMES) {
      const anim = asciiRaccoon.animations[name];
      expect(anim.frames.length, name).toBeGreaterThan(0);
    }
  });

  it('gives every looking-around animation a pair of eyes in every frame', () => {
    for (const name of ANIMATION_NAMES) {
      for (const frame of asciiRaccoon.animations[name].frames) {
        const eyes = frame.join('').split(asciiRaccoon.eyeMarker).length - 1;
        expect(eyes, name).toBe(2);
      }
    }
  });

  it('pads frames into a bottom-aligned box so the feet stay put', () => {
    const anim = normalizeAnimation({ frames: [['ab'], ['abc', 'de']], fps: 1, loop: true, eyes: 'open' });
    expect(anim.frames).toEqual([
      ['   ', 'ab '],
      ['abc', 'de '],
    ]);
  });

  it('normalizes the active sheet to one size per animation', () => {
    for (const name of ANIMATION_NAMES) {
      const sizes = activeSheet.animations[name].frames.map((f) => JSON.stringify(frameSize(f)));
      expect(new Set(sizes).size, name).toBe(1);
    }
  });

  it('draws eyes according to the eye state', () => {
    const frame = ['( =@ @= )'];
    expect(renderFrame(asciiRaccoon, frame, 'open')).toBe('( =o o= )');
    expect(renderFrame(asciiRaccoon, frame, 'blink')).toBe('( =- -= )');
    expect(renderFrame(asciiRaccoon, frame, 'wide')).toBe('( =O O= )');
  });
});

describe('Animator', () => {
  it('steps through frames at the animation fps and loops', () => {
    const animator = new Animator(activeSheet, seededRandom(1));
    animator.play('walk');
    const fps = activeSheet.animations.walk.fps;
    const count = activeSheet.animations.walk.frames.length;
    const seen: number[] = [];
    for (let i = 0; i < count * 2; i++) {
      seen.push(animator.frameIndex);
      animator.update(1000 / fps);
    }
    expect(seen).toEqual([...Array(count).keys(), ...Array(count).keys()]);
  });

  it('holds the last frame of a non-looping animation', () => {
    const animator = new Animator(activeSheet, seededRandom(1));
    animator.play('yawn');
    animator.update(60_000);
    expect(animator.frameIndex).toBe(activeSheet.animations.yawn.frames.length - 1);
  });

  it('restarts an animation when switching to it', () => {
    const animator = new Animator(activeSheet, seededRandom(1));
    animator.play('walk');
    animator.update(300);
    animator.play('idle');
    expect(animator.frameIndex).toBe(0);
  });

  it('blinks every few seconds while eyes are open', () => {
    const animator = new Animator(activeSheet, seededRandom(4));
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
    const animator = new Animator(activeSheet, seededRandom(4));
    animator.play('sleep');
    for (let t = 0; t < 20_000; t += 16) {
      animator.update(16);
      expect(animator.eyes).toBe('closed');
    }
  });

  it('moves peek frames with key presses, not time', () => {
    const animator = new Animator(activeSheet, seededRandom(1));
    animator.play('peek');
    animator.update(10_000);
    expect(animator.frameIndex).toBe(0);
    animator.keystroke();
    expect(animator.frameIndex).toBe(1);
    animator.keystroke();
    animator.keystroke();
    expect(animator.frameIndex).toBe(3);
  });

  it('reports when the next visible change is due', () => {
    const animator = new Animator(activeSheet, seededRandom(1));
    animator.play('sleep');
    const frameMs = 1000 / activeSheet.animations.sleep.fps;
    expect(animator.msUntilChange()).toBeCloseTo(frameMs, 0);
    animator.play('peek');
    expect(animator.msUntilChange()).toBeLessThan(Infinity);
  });
});
