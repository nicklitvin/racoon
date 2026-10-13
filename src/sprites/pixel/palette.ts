/**
 * The colours a pixel pet is drawn in. Every pixel is one of these: the picture is stored
 * as palette slots, and a coat is just a palette, so a raccoon can be redrawn in a
 * handheld console's four shades of green by swapping the palette alone.
 */

export const SLOTS = [
  'outline',
  'fur',
  'furLight',
  'furDark',
  /** The far legs and ear, a shade darker. */
  'far',
  'belly',
  /** Pale markings: a muzzle, cheeks, a fox's bib, a white tail tip. */
  'light',
  /** Dark markings: a raccoon's mask, a fox's stockings and ear tips. */
  'dark',
  /** Tail rings and tabby stripes. */
  'band',
  'inner',
  'eye',
  /** Coloured eyes (a black cat's), with a dark pupil; dark eyes if not given. */
  'iris',
  'glint',
  'nose',
  'blush',
  'mouth',
  'tongue',
  'water',
  'waterLight',
  'waterDark',
  'shell',
  'shellDark',
  'shadow',
  'mark',
  'heart',
  'alarm',
] as const;

export type Slot = (typeof SLOTS)[number];
export type Palette = Record<Slot, string>;

/** The palette index of each slot (0 is transparent). */
export const C = Object.fromEntries(SLOTS.map((slot, i) => [slot, i + 1])) as Record<Slot, number>;

const SHARED = {
  glint: '#ffffff',
  blush: '#ff8fa6',
  mouth: '#7a2f3a',
  tongue: '#ff9aae',
  water: '#5fb4e6',
  waterLight: '#d4f1ff',
  waterDark: '#2f7fb8',
  shell: '#f6c0ae',
  shellDark: '#c9806f',
  shadow: 'rgba(20, 16, 30, 0.24)',
  mark: '#dfe8ff',
  heart: '#ff6f91',
  alarm: '#ffd23f',
};

export const PIXEL_COATS = {
  raccoon: {
    ...SHARED,
    outline: '#211f29',
    fur: '#8f919e',
    furLight: '#b3b5c1',
    furDark: '#6d6f7c',
    far: '#71737f',
    belly: '#c6c8d0',
    light: '#efebe3',
    dark: '#34343e',
    band: '#34343e',
    inner: '#4a4650',
    eye: '#121017',
    iris: '#121017',
    nose: '#211f29',
  },
  ginger: {
    ...SHARED,
    outline: '#4a2516',
    fur: '#f3a04e',
    furLight: '#ffc67f',
    furDark: '#d27a30',
    far: '#d5813a',
    belly: '#fbe3c2',
    light: '#fff4e4',
    dark: '#8a4420',
    band: '#c9651f',
    inner: '#f4a7b3',
    eye: '#2a1712',
    iris: '#2a1712',
    nose: '#e8768b',
  },
  black: {
    ...SHARED,
    outline: '#0c0b10',
    fur: '#34313f',
    furLight: '#4f4b60',
    furDark: '#25222d',
    far: '#26232e',
    belly: '#3a3746',
    light: '#4f4b60',
    dark: '#1b1922',
    band: '#2a2733',
    inner: '#6a4f5c',
    eye: '#0c0b10',
    iris: '#c9e14d',
    nose: '#f08da0',
  },
  fox: {
    ...SHARED,
    outline: '#3b1f14',
    fur: '#f08a3c',
    furLight: '#ffad62',
    furDark: '#c96822',
    far: '#cf6f29',
    belly: '#fbe8d6',
    light: '#fff8f0',
    dark: '#3a2b2a',
    band: '#fff8f0',
    inner: '#fbe1cb',
    eye: '#1e1412',
    iris: '#1e1412',
    nose: '#1e1412',
  },
  otter: {
    ...SHARED,
    outline: '#2b1a12',
    fur: '#9a6a45',
    furLight: '#ba8a5c',
    furDark: '#7a5233',
    far: '#7c5436',
    belly: '#d9bc98',
    light: '#ecd9bf',
    dark: '#5a3b25',
    band: '#6e4a2f',
    inner: '#6e4a2f',
    eye: '#140c09',
    iris: '#140c09',
    nose: '#2b1a12',
  },
} satisfies Record<string, Palette>;

export type PixelCoat = keyof typeof PIXEL_COATS;

/** A handheld console's four greens, darkest first. */
export const HANDHELD = ['#1f3b26', '#3f6b34', '#8bac3f', '#cddc8f'];

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1, 7), 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * The same coat in four shades of green, each colour going to the shade nearest its
 * brightness. Outlines are always the darkest, glints the lightest, and the see-through
 * shadow stays a see-through shadow.
 */
export function handheld(palette: Palette): Palette {
  const out = { ...palette };
  for (const slot of SLOTS) {
    const colour = palette[slot];
    if (!colour.startsWith('#')) continue;
    const l = luminance(colour);
    out[slot] = HANDHELD[l < 0.3 ? 0 : l < 0.5 ? 1 : l < 0.72 ? 2 : 3]!;
  }
  out.outline = HANDHELD[0]!;
  out.eye = HANDHELD[0]!;
  out.glint = HANDHELD[3]!;
  out.mark = HANDHELD[3]!;
  out.shadow = 'rgba(31, 59, 38, 0.3)';
  return out;
}

/** The palette as packed RGBA words, ready to write into an ImageData. Slot 0 is transparent. */
export function rgbaTable(palette: Palette): Uint32Array {
  const table = new Uint32Array(SLOTS.length + 1);
  SLOTS.forEach((slot, i) => {
    const [r, g, b, a] = parseColour(palette[slot]);
    // ImageData is RGBA in memory, which is ABGR as a little-endian 32-bit word.
    table[i + 1] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  });
  return table;
}

function parseColour(colour: string): [number, number, number, number] {
  if (colour.startsWith('#')) {
    const v = parseInt(colour.slice(1, 7), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
  }
  const m = /rgba?\(([^)]+)\)/.exec(colour);
  const parts = m ? m[1]!.split(',').map((x) => parseFloat(x)) : [0, 0, 0, 1];
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, Math.round((parts[3] ?? 1) * 255)];
}
