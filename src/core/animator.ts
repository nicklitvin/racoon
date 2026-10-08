import type { AnimationName, AnimationSpec, EyeStyle } from '../sprites/types';

const BLINK_MS = 140;

/**
 * Keeps the clock for the current animation and decides when the eyes blink.
 * Knows nothing about how the raccoon is drawn.
 */
export class Animator {
  private name: AnimationName = 'idle';
  private elapsedMs = 0;
  private keystrokeCount = 0;
  private blinkInMs: number;
  private blinkLeftMs = 0;

  constructor(
    private readonly specs: Record<AnimationName, AnimationSpec>,
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

  /** Advances keystroke-driven animations. Receives no key information. */
  keystroke(): void {
    this.keystrokeCount++;
  }

  get keystrokes(): number {
    return this.keystrokeCount;
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

  /**
   * Time into the animation, stepped down to its fps (so a 6 fps animation only
   * changes 6 times a second), wrapped for loops and held at the end otherwise.
   */
  get time(): number {
    const spec = this.specs[this.name];
    const frameMs = 1000 / spec.fps;
    const stepped = Math.floor(this.elapsedMs / frameMs) * frameMs;
    return spec.loop ? stepped % spec.durationMs : Math.min(stepped, spec.durationMs);
  }

  get eyes(): EyeStyle | 'blink' {
    const style = this.specs[this.name].eyes;
    return style === 'open' && this.blinkLeftMs > 0 ? 'blink' : style;
  }

  /** Milliseconds until the picture could change on its own (next step or blink edge). */
  msUntilChange(): number {
    const spec = this.specs[this.name];
    let next = Infinity;
    const finished = !spec.loop && this.elapsedMs >= spec.durationMs;
    if (spec.driver !== 'keystrokes' && !finished) {
      const frameMs = 1000 / spec.fps;
      next = frameMs - (this.elapsedMs % frameMs);
    }
    if (spec.eyes === 'open') next = Math.min(next, this.blinkLeftMs > 0 ? this.blinkLeftMs : this.blinkInMs);
    return Math.max(0, next);
  }

  private nextBlinkDelay(): number {
    return 2000 + this.random() * 4000;
  }
}
