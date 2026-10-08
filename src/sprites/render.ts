import type { Animation, EyeStyle, Frame, SpriteSheet } from './types';

/** Width and height of a frame in character cells. */
export function frameSize(frame: Frame): { cols: number; rows: number } {
  return { cols: Math.max(0, ...frame.map((row) => row.length)), rows: frame.length };
}

/**
 * Pads every frame of an animation to the same box, bottom-aligned, so the feet stay
 * planted and the sprite doesn't jitter as frames change.
 */
export function normalizeAnimation(animation: Animation): Animation {
  const cols = Math.max(...animation.frames.map((f) => frameSize(f).cols));
  const rows = Math.max(...animation.frames.map((f) => f.length));
  const frames = animation.frames.map((frame) => {
    const padded = frame.map((row) => row.padEnd(cols, ' '));
    const blank = ' '.repeat(cols);
    return [...Array.from({ length: rows - frame.length }, () => blank), ...padded];
  });
  return { ...animation, frames };
}

export function normalizeSheet(sheet: SpriteSheet): SpriteSheet {
  const animations = Object.fromEntries(
    Object.entries(sheet.animations).map(([name, animation]) => [name, normalizeAnimation(animation)]),
  ) as SpriteSheet['animations'];
  return { ...sheet, animations };
}

/** Draws a frame as text, replacing eye markers with the glyph for the current eye state. */
export function renderFrame(sheet: SpriteSheet, frame: Frame, eyes: EyeStyle | 'blink'): string {
  const glyph = sheet.eyeGlyphs[eyes];
  return frame.map((row) => row.split(sheet.eyeMarker).join(glyph)).join('\n');
}
