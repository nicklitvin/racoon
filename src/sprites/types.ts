/**
 * Sprite model. Behaviour code only ever names an animation ("walk", "sleep", ...);
 * how that animation looks is up to the renderer, so the art can change without
 * touching any logic.
 */

export const ANIMATION_NAMES = [
  'idle',
  'walk',
  'run',
  'jump',
  'sit',
  'groom',
  'yawn',
  'peek',
  'sleep',
  'chase',
  'surprised',
  'confused',
  'dangle',
] as const;

export type AnimationName = (typeof ANIMATION_NAMES)[number];

/** How the eyes are drawn. "open" eyes blink now and then. */
export type EyeStyle = 'open' | 'closed' | 'wide';

/**
 * What moves the animation along:
 * - "time": the clock.
 * - "keystrokes": key presses (used by "peek", so the eyes follow your typing).
 */
export type FrameDriver = 'time' | 'keystrokes';

export interface AnimationSpec {
  /**
   * How many times per second the pose is redrawn. Resting animations use a low rate,
   * so an idle raccoon costs almost no CPU.
   */
  fps: number;
  /** Length of one cycle; a non-looping animation holds its final pose. */
  durationMs: number;
  loop: boolean;
  eyes: EyeStyle;
  driver?: FrameDriver;
}

/** One moment of an animation: everything a renderer needs to draw the raccoon. */
export interface RaccoonFrame {
  animation: AnimationName;
  /** Time into the animation, already stepped to the animation's fps. */
  timeMs: number;
  /** Key presses seen while this animation played (keystroke-driven animations only). */
  keystrokes: number;
  eyes: EyeStyle | 'blink';
  /**
   * Direction he faces on the ground, in radians, screen axes: 0 = right, PI/2 = down
   * the screen (towards you). Only used by renderers that turn themselves.
   */
  heading?: number;
}

/**
 * Draws the raccoon. Side-view implementations face right and the page mirrors the
 * element to face left; those with `turnsItself` draw any `frame.heading` instead.
 * The feet are at `anchor` within `element` (bottom centre if not given).
 */
export interface RaccoonRenderer {
  /** Root element to put in the page. */
  readonly element: Element;
  /** The drawn figure, without empty space around it; used for hit-testing. */
  readonly figure: Element;
  /** Size of `element` in px at scale 1. */
  readonly baseSize: { width: number; height: number };
  /** Where the feet are, as fractions of the element's width and height. */
  readonly anchor?: { x: number; y: number };
  /** Draws `frame.heading` itself, so the page must not mirror it. */
  readonly turnsItself?: boolean;
  setScale(scale: number): void;
  /** Cheap to call every tick: only touches what changed. */
  draw(frame: RaccoonFrame): void;
}
