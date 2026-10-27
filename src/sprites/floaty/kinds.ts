import { PIXEL_COATS, type Palette } from '../pixel/palette';

/** The floaties there are. */
export type FloatyKind = 'blip' | 'mochi' | 'ember';

export interface FloatyBuild {
  kind: FloatyKind;
  /** Body radius (half its height), art pixels. */
  R: number;
  /** How much wider than tall. */
  wide: number;
  shape: 'round' | 'squircle' | 'drop';
  /** Something sticking up from the top of it. */
  topper: 'antenna' | 'sprout' | null;
  /** Freckles on its cheeks. */
  freckles: boolean;
}

export const FLOATIES: Record<FloatyKind, FloatyBuild> = {
  /** A round little blue one with an antenna, its bulb blinking. */
  blip: { kind: 'blip', R: 10.5, wide: 1.04, shape: 'round', topper: 'antenna', freckles: false },
  /** A soft, squarish pink one with a leafy sprout on top. */
  mochi: { kind: 'mochi', R: 10, wide: 1.12, shape: 'squircle', topper: 'sprout', freckles: true },
  /** An orange drop drawn up into a flickering point, like a candle flame. */
  ember: { kind: 'ember', R: 10, wide: 1.0, shape: 'drop', topper: null, freckles: false },
};

/** Shared by them all: the face and the marks. */
const FACE = {
  ...PIXEL_COATS.raccoon,
  outline: '#262033',
  eye: '#1d1828',
  mouth: '#6b2a3a',
  light: '#ffffff',
  far: '#000000',
  belly: '#000000',
  dark: '#000000',
  inner: '#000000',
  nose: '#000000',
};

/** Each one's colours: its body (`fur`, lit and shaded), and its topper (`band`). */
export const FLOATY_COATS: Record<FloatyKind, Palette> = {
  blip: { ...FACE, fur: '#6cc4ff', furLight: '#a8defe', furDark: '#3f97d8', band: '#8d97a8' },
  mochi: { ...FACE, fur: '#ffa9c9', furLight: '#ffd3e3', furDark: '#e47ca4', band: '#69c46a' },
  ember: { ...FACE, fur: '#ffa04a', furLight: '#ffc98a', furDark: '#e2702a', band: '#ffe27a' },
};
