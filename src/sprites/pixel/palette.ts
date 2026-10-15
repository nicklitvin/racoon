/**
 * The colours a pixel pet is drawn in. Every pixel is one of these: the picture is stored
 * as palette slots, and a coat is just a palette.
 */

export const SLOTS = [
  'outline',
  'fur',
  'furLight',
  'furDark',
  /** The far legs and ear, a shade darker. */
  'far',
  'belly',
  /** Pale markings: a muzzle, cheeks, a white chest. */
  'light',
  /** Dark markings: a raccoon's mask. */
  'dark',
  /** Tail rings and tabby stripes. */
  'band',
  'inner',
  'eye',
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
  /** Whatever he's wearing: a hat's colours, then the neckwear's. Set from the item. */
  'hatMain',
  'hatTrim',
  'hatAccent',
  'wearMain',
  'wearTrim',
  'wearAccent',
  /** Clothes' lit and shaded edges, from the main colour. */
  'wearLight',
  'wearDark',
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
  hatMain: '#000000',
  hatTrim: '#000000',
  hatAccent: '#000000',
  wearMain: '#000000',
  wearTrim: '#000000',
  wearAccent: '#000000',
  wearLight: '#000000',
  wearDark: '#000000',
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
    nose: '#e8768b',
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
    nose: '#2b1a12',
  },
} satisfies Record<string, Palette>;

export type PixelCoat = keyof typeof PIXEL_COATS;

/** A colour mixed `k` of the way towards white (k > 0) or black (k < 0). */
export function shade(hex: string, k: number): string {
  const v = parseInt(hex.slice(1, 7), 16);
  const mix = (c: number) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k));
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
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
