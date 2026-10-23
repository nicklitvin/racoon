import type { Dress } from './outfits';

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
  /** A bounding leap mid-run, from sheer excitement. */
  'leap',
  'sit',
  'groom',
  'yawn',
  'peek',
  'sleep',
  'chase',
  'surprised',
  'confused',
  'dangle',
  'happy',
  /** Swatting a toy along the floor with a front paw. */
  'bat',
  /** Picking a toy up and flinging it. */
  'toss',
  /** Picking a toy up in both hands and standing up with it, to carry it off (raccoons). */
  'lift',
  /** Walking along on the hind legs, the toy held in both hands. */
  'carry',
  /** Throwing the toy he's carrying, from up on his hind legs, and dropping back onto all fours. */
  'throw',
  /** Sat at his desk typing away in a terminal, now and then stopping to think. */
  'work',
  /** At his desk browsing the web: a paw on the mouse, clicking and scrolling, reading. */
  'browse',
  /** At his desk watching reels: leant back, flicking the mouse for the next one, giggling. */
  'reels',
  /** Trying to get your attention: up on his toes, waving, bouncing. */
  'attention',
  /** Cross: stamping a foot, ears back, a scowl. */
  'angry',
  /** Creeping up on a toy, low to the ground, bottom wiggling, before a pounce. */
  'stalk',
  /** Nose down to a toy, having a good sniff at it. */
  'sniff',
  /** Walking along with the head down, nosing a toy along in front. */
  'nudge',
  /** Trotting along, head up and proud, with a toy in the mouth. */
  'fetch',
  /** A big hop up into (or out of) the trash can. */
  'climb',
  /** Head first in the trash can, digging about: only the bottom, hind legs and tail stick out. */
  'rummage',
  /** Popping up out of the trash can with a toy found in it, held up in both paws. */
  'emerge',
] as const;

export type AnimationName = (typeof ANIMATION_NAMES)[number];

/** How toy blocks are drawn: painted, outlined like a cartoon, inked, or in pixels. */
export type ToyLook = 'paint' | 'chibi' | 'ink' | 'pixel';

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
  /** Wall-clock time of this frame in ms, for renderers that ease between poses on their own. */
  clockMs?: number;
  /** How fast he's moving on screen, px/s, so legs can keep pace with the ground. */
  velocity?: { x: number; y: number };
  /** Where the pointer is relative to his feet, in screen px, if it's close enough to look at. */
  gaze?: { x: number; y: number } | null;
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
  /** How far the feet sink past the bottom edge while peeking, in px at scale 1, so the face shows over it. */
  readonly peekSink?: number;
  /** Draws `frame.heading` itself, so the page must not mirror it. */
  readonly turnsItself?: boolean;
  /** Timing changes for this drawing, e.g. a higher fps where it moves more smoothly. */
  readonly animations?: Partial<Record<AnimationName, Partial<AnimationSpec>>>;
  /**
   * True while the drawing is still moving on its own since the last `draw` (easing
   * into a new pose), so it must be redrawn every frame even if the frame is unchanged.
   */
  isSettling?(): boolean;
  /**
   * Where he's held when picked up (the scruff), in px from his feet at the current scale,
   * as last drawn. Without it, he's held wherever he was grabbed.
   */
  holdPoint?(): { x: number; y: number } | null;
  /** How far in front of his feet a toy block sits (its middle) for him to swat or pick up, px at scale 1. */
  readonly toyReach?: number;
  /** Edge of a toy block to go with this drawing, px at scale 1. */
  readonly toySize?: number;
  /** How toy blocks are drawn to match: painted, inked or pixel art. */
  readonly toyLook?: ToyLook;
  /**
   * Where a toy block he has hold of is (its middle), in px from his feet at the current
   * scale, as last drawn: in his mouth, or his hands.
   */
  toyPoint?(): { x: number; y: number } | null;
  /** Drawn in pixels: placed on whole screen pixels, so they stay crisp. */
  readonly pixelated?: boolean;
  /**
   * Can pick a toy up in its hands and walk off with it on its hind legs (a raccoon), with
   * the lift, carry and throw animations.
   */
  readonly carriesToys?: boolean;
  /**
   * Where his front paws rest on a keyboard while he types (the `work` animation), from his
   * feet facing right, px at scale 1. The desk is built to fit.
   */
  readonly deskReach?: { x: number; y: number };
  /** Where a front paw rests on the mouse, browsing, from his feet facing right, px at scale 1. */
  readonly mouseReach?: { x: number; y: number };
  /** Puts a hat on him and something round his neck (or takes them off). */
  dress?(dress: Dress): void;
  /** Draws its own marks over its head (z's asleep), so the page shouldn't add its own. */
  readonly drawsMarks?: boolean;
  setScale(scale: number): void;
  /** Cheap to call every tick: only touches what changed. */
  draw(frame: RaccoonFrame): void;
}
