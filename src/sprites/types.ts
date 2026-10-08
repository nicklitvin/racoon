/**
 * Sprite data model. Behaviour code only ever names an animation ("walk", "sleep", ...);
 * how that animation looks is entirely up to the sprite sheet, so the ASCII art can be
 * swapped for another style without touching any logic.
 */

export const ANIMATION_NAMES = [
  'idle',
  'walk',
  'run',
  'jump',
  'float',
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

/** How the eye markers in a frame are drawn. "open" eyes blink now and then. */
export type EyeStyle = 'open' | 'closed' | 'wide';

/**
 * What advances the frames:
 * - "time": `fps` frames per second.
 * - "keystrokes": one frame per key press (used by "peek", so the eyes follow your typing).
 */
export type FrameDriver = 'time' | 'keystrokes';

/** One frame is a list of text rows, drawn top to bottom. */
export type Frame = readonly string[];

export interface Animation {
  frames: readonly Frame[];
  fps: number;
  /** Non-looping animations hold their last frame. */
  loop: boolean;
  eyes: EyeStyle;
  driver?: FrameDriver;
}

export interface SpriteSheet {
  name: string;
  /** Character in frame rows that marks where an eye goes. */
  eyeMarker: string;
  /** Glyph drawn for each eye style, plus "blink" for a closed open-eye. */
  eyeGlyphs: Record<EyeStyle | 'blink', string>;
  /** All frames are drawn facing right; the renderer mirrors them to face left. */
  animations: Record<AnimationName, Animation>;
}
