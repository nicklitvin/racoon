/** Little bitmaps for pixel art: '#' is a pixel, '.' is empty. */

export const GLYPHS = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  z: ['###', '..#', '.#.', '#..', '###'],
  '!': ['#', '#', '#', '.', '#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  heart: ['.#.#.', '#####', '.###.', '..#..'],
  /** A cross little vein, as cartoons have over an angry head. */
  angry: ['##.##', '#...#', '.....', '#...#', '##.##'],
} as const;

/** The letters on the toy blocks, in order. */
export const BLOCK_LETTERS = ['A', 'B', 'C', 'D'] as const;
