import type { AnimationName, EyeStyle, Frame, SpriteSheet } from '../sprites/types';

const BLINK_MS = 140;

/**
 * Picks which frame of which animation to show, and when the eyes blink.
 * Knows nothing about how frames are drawn.
 */
export class Animator {
  private name: AnimationName = 'idle';
  private elapsedMs = 0;
  private keystrokes = 0;
  private blinkInMs: number;
  private blinkLeftMs = 0;

  constructor(
    private readonly sheet: SpriteSheet,
    private readonly random: () => number = Math.random,
  ) {
    this.blinkInMs = this.nextBlinkDelay();
  }

  get animation(): AnimationName {
    return this.name;
  }

  play(name: AnimationName): void {
    if (name === this.name) return;
    this.name = name;
    this.elapsedMs = 0;
  }

  /** Advances keystroke-driven animations by one frame. Receives no key information. */
  keystroke(): void {
    this.keystrokes++;
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    if (this.blinkLeftMs > 0) {
      this.blinkLeftMs = Math.max(0, this.blinkLeftMs - dtMs);
      return;
    }
    this.blinkInMs -= dtMs;
    if (this.blinkInMs <= 0) {
      this.blinkLeftMs = BLINK_MS;
      this.blinkInMs = this.nextBlinkDelay();
    }
  }

  get frameIndex(): number {
    const anim = this.sheet.animations[this.name];
    const count = anim.frames.length;
    if (anim.driver === 'keystrokes') return this.keystrokes % count;
    const step = Math.floor((this.elapsedMs / 1000) * anim.fps);
    return anim.loop ? step % count : Math.min(step, count - 1);
  }

  get frame(): Frame {
    return this.sheet.animations[this.name].frames[this.frameIndex]!;
  }

  get eyes(): EyeStyle | 'blink' {
    const style = this.sheet.animations[this.name].eyes;
    return style === 'open' && this.blinkLeftMs > 0 ? 'blink' : style;
  }

  /** Milliseconds until the picture could change on its own (frame step or blink edge). */
  msUntilChange(): number {
    const anim = this.sheet.animations[this.name];
    let next = Infinity;
    if (anim.driver !== 'keystrokes' && anim.fps > 0 && anim.frames.length > 1) {
      const frameMs = 1000 / anim.fps;
      next = frameMs - (this.elapsedMs % frameMs);
    }
    if (anim.eyes === 'open') next = Math.min(next, this.blinkLeftMs > 0 ? this.blinkLeftMs : this.blinkInMs);
    return Math.max(0, next);
  }

  private nextBlinkDelay(): number {
    return 2000 + this.random() * 4000;
  }
}
