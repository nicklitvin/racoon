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
} as const;

/** The letters on the toy blocks, in order. */
export const BLOCK_LETTERS = ['A', 'B', 'C', 'D'] as const;
