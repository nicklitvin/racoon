import type { Hat, Outfit } from '../../shared/settings';
import { n, svgWriter } from './svg';

/**
 * Hats, clothes and things to wear round the neck, as plain shapes that every art style
 * draws its own way: the painted and chibi pets as SVG, the pixel pets rasterised into
 * pixels.
 *
 * A hat is drawn in head units: the head's half-width is 1, the origin is the crown of the
 * head (its top, a little back from the middle), x points the way he faces and y down. The
 * head itself is roughly a unit circle centred at (0, 1).
 *
 * Neckwear is drawn in neck units: the neck's half-width is 1, the origin is the middle of
 * the collar, x points the way he faces and y down, away from the head.
 *
 * Clothes are neckwear (a tie, a collar) plus `body`: what covers the body and legs. A
 * costume can also have a `hood`, drawn over the head in hat units (a dino's spikes, a bee's
 * antennae, a space helmet). Only the pixel pets dress the body and wear hoods for now; the
 * others wear just the neck part.
 */

/** Which of the item's colours a shape is painted in. */
export type Paint = 'main' | 'trim' | 'accent';

export type Shape =
  | { kind: 'poly'; points: readonly (readonly [number, number])[]; paint: Paint }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; paint: Paint };

export interface Wearable {
  label: string;
  colours: Record<Paint, string>;
  /** Back to front. */
  shapes: Shape[];
  body?: BodyWear;
  /** For a costume, what goes over the head, in hat units, under any hat. */
  hood?: Shape[];
  /** Its picture in the settings, when the shapes alone (just the neck part of clothes) wouldn't say what it is. */
  icon?: Shape[];
}

/** Clothes on the body: covered in the main colour, with stripes, a shirt front, buttons, or a cape. */
export interface BodyWear {
  /** Body covered in `main`; false for a cape, which hangs behind instead. */
  covered: boolean;
  /** How far down the legs the sleeves and trouser legs come, 0 (none) to 1 (to the paws). */
  sleeves: number;
  /** Rings round the body (seen side on, bands across it), in this paint. */
  bands?: { paint: Paint; count: number; width: number };
  /** A white shirt showing at the chest (in `trim`), as under a jacket. */
  shirt?: boolean;
  /** A row of buttons down the chest, in `accent`. */
  buttons?: boolean;
  /** A cape over the back, flying out behind as he goes, in `main` lined with `accent`. */
  cape?: boolean;
  /**
   * An all-in-one, hood and all: on a pet with no neck to speak of (the puffball) it
   * covers everything but the face, rather than just the bottom half.
   */
  onesie?: boolean;
  /** A patch on the tummy or chest, in this paint (a dino's belly, a space suit's controls). */
  patch?: Paint;
  /** A row of spikes down the back. */
  spikes?: { paint: Paint; count: number };
  /** Little wings on the back, buzzing as he goes. */
  wings?: Paint;
  /** A pack on the back (an astronaut's air). */
  pack?: Paint;
  /** Little stars sprinkled over it. */
  stars?: Paint;
  /** A skirt: a tutu sticking out round the middle, or a robe down to the floor. */
  skirt?: { paint: Paint; style: 'tutu' | 'robe' };
}

export interface Dress {
  hat: Hat;
  outfit: Outfit;
}

export const UNDRESSED: Dress = { hat: 'none', outfit: 'none' };

/** For the flat pets, whose necks don't show: half the collar's width, in head half-widths. */
export const NECK_WIDTH = 0.56;

const poly = (paint: Paint, ...points: [number, number][]): Shape => ({ kind: 'poly', points, paint });
const ellipse = (paint: Paint, cx: number, cy: number, rx: number, ry = rx): Shape => ({ kind: 'ellipse', cx, cy, rx, ry, paint });

/** The top half of an ellipse, as a polygon (a dome). */
function dome(cx: number, cy: number, rx: number, ry: number, steps = 14): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI * (1 - i / steps);
    out.push([cx + Math.cos(a) * rx, cy - Math.sin(a) * ry]);
  }
  return out;
}

/** A thick arc round (cx, cy), between radii `inner` and `outer`, from `from` to `to` degrees (90 = up). */
function arc(cx: number, cy: number, outer: number, inner: number, from: number, to: number, steps = 12): [number, number][] {
  const at = (r: number, deg: number): [number, number] => [cx + Math.cos((deg * Math.PI) / 180) * r, cy - Math.sin((deg * Math.PI) / 180) * r];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) out.push(at(outer, from + ((to - from) * i) / steps));
  for (let i = steps; i >= 0; i--) out.push(at(inner, from + ((to - from) * i) / steps));
  return out;
}

/** A band across a cone, between `a` and `b` of the way from its base to its tip. */
function coneBand(left: [number, number], right: [number, number], tip: [number, number], a: number, b: number): [number, number][] {
  const along = (p: [number, number], s: number): [number, number] => [p[0] + (tip[0] - p[0]) * s, p[1] + (tip[1] - p[1]) * s];
  return [along(left, a), along(left, b), along(right, b), along(right, a)];
}

const PARTY_L: [number, number] = [-0.55, 0.24];
const PARTY_R: [number, number] = [0.6, 0.14];
const PARTY_TIP: [number, number] = [0.2, -1.3];

export const HAT_ITEMS: Record<Exclude<Hat, 'none'>, Wearable> = {
  party: {
    label: 'Party hat',
    colours: { main: '#ff6f91', trim: '#ffd84a', accent: '#5fc3ff' },
    shapes: [
      poly('main', PARTY_L, PARTY_TIP, PARTY_R),
      poly('accent', ...coneBand(PARTY_L, PARTY_R, PARTY_TIP, 0.22, 0.36)),
      poly('trim', ...coneBand(PARTY_L, PARTY_R, PARTY_TIP, 0.55, 0.68)),
      ellipse('trim', PARTY_TIP[0], PARTY_TIP[1], 0.22),
    ],
  },
  beanie: {
    label: 'Beanie',
    colours: { main: '#4d8fd6', trim: '#f4f1ea', accent: '#f4f1ea' },
    shapes: [
      poly('main', ...dome(0, 0.6, 0.96, 0.82)),
      poly('trim', [-1.04, 0.36], [1.04, 0.36], [1.04, 0.72], [-1.04, 0.72]),
      ellipse('accent', 0, -0.26, 0.27),
    ],
  },
  tophat: {
    label: 'Top hat',
    colours: { main: '#2f2b36', trim: '#d94f5c', accent: '#2f2b36' },
    shapes: [
      ellipse('main', 0, 0.12, 0.9, 0.17),
      poly('main', [-0.5, 0.12], [-0.56, -1.05], [0.56, -1.05], [0.5, 0.12]),
      poly('trim', [-0.51, -0.06], [-0.52, -0.3], [0.52, -0.3], [0.51, -0.06]),
    ],
  },
  crown: {
    label: 'Crown',
    colours: { main: '#ffcf3f', trim: '#e6a52a', accent: '#e2435a' },
    shapes: [
      poly('main', [-0.62, 0.22], [-0.66, -0.48], [-0.33, -0.14], [0, -0.6], [0.33, -0.14], [0.66, -0.48], [0.62, 0.22]),
      poly('trim', [-0.63, 0.04], [0.63, 0.04], [0.62, 0.22], [-0.62, 0.22]),
      ellipse('accent', 0, -0.06, 0.12),
      ellipse('accent', -0.4, 0.13, 0.07),
      ellipse('accent', 0.4, 0.13, 0.07),
    ],
  },
  cap: {
    label: 'Cap',
    colours: { main: '#e2435a', trim: '#b8303f', accent: '#f4f1ea' },
    shapes: [
      poly('trim', [0.45, 0.28], [1.55, 0.34], [1.5, 0.5], [0.45, 0.5]),
      poly('main', ...dome(0, 0.48, 0.92, 0.74)),
      ellipse('accent', 0, -0.26, 0.1),
    ],
  },
  nightcap: {
    label: 'Nightcap',
    colours: { main: '#7d8fe0', trim: '#f4f1ea', accent: '#ffe27a' },
    shapes: [
      poly('main', [-0.86, 0.5], [0.86, 0.5], [0.62, -0.35], [0.05, -0.62], [-0.7, -0.75], [-1.3, -0.25], [-1.0, 0.1]),
      poly('trim', [-0.92, 0.3], [0.92, 0.3], [0.92, 0.6], [-0.92, 0.6]),
      ellipse('accent', -1.32, -0.18, 0.22),
    ],
  },
  headphones: {
    label: 'Headphones',
    colours: { main: '#33363f', trim: '#5a5f6d', accent: '#58c4a8' },
    shapes: [
      poly('main', ...arc(0, 1, 1.12, 0.94, 165, 15)),
      ellipse('trim', -1.0, 0.72, 0.26, 0.32),
      ellipse('accent', -0.98, 0.72, 0.15, 0.22),
      ellipse('trim', 1.0, 0.68, 0.2, 0.28),
    ],
  },
  wizard: {
    label: 'Wizard hat',
    colours: { main: '#4b3a9c', trim: '#ffd84a', accent: '#ffd84a' },
    shapes: [
      ellipse('main', 0, 0.2, 1.15, 0.2),
      poly('main', [-0.62, 0.2], [0.6, 0.2], [0.28, -0.55], [-0.15, -1.05], [-0.7, -1.3], [-0.42, -0.62]),
      poly('trim', [-0.6, 0.02], [0.58, 0.02], [0.5, -0.14], [-0.56, -0.14]),
      ellipse('accent', 0.08, -0.42, 0.13),
      ellipse('accent', -0.68, -1.28, 0.12),
    ],
  },
  bow: {
    label: 'Bow',
    colours: { main: '#ff7ab0', trim: '#d94f8a', accent: '#ffffff' },
    shapes: [
      poly('main', [0.32, 0.05], [-0.25, -0.32], [-0.2, 0.34]),
      poly('main', [0.32, 0.05], [0.9, -0.3], [0.86, 0.38]),
      ellipse('trim', 0.32, 0.05, 0.15),
    ],
  },
  cowboy: {
    label: 'Cowboy hat',
    colours: { main: '#a5693a', trim: '#5b3820', accent: '#ffd84a' },
    shapes: [
      // The brim, turned up at the sides, then the crown with its dent.
      poly('main', [-1.55, -0.12], [-1.25, 0.2], [0, 0.32], [1.25, 0.2], [1.55, -0.12], [1.15, 0.04], [0, 0.12], [-1.15, 0.04]),
      poly('main', [-0.6, 0.1], [-0.68, -0.55], [-0.3, -0.78], [0, -0.6], [0.3, -0.78], [0.68, -0.55], [0.6, 0.1]),
      poly('trim', [-0.62, -0.06], [0.62, -0.06], [0.6, 0.1], [-0.6, 0.1]),
      ellipse('accent', 0.32, 0.02, 0.09),
    ],
  },
  chef: {
    label: 'Chef’s hat',
    colours: { main: '#fbfaf5', trim: '#d9d8d0', accent: '#d9d8d0' },
    shapes: [
      ellipse('main', -0.5, -0.62, 0.48, 0.42),
      ellipse('main', 0.5, -0.62, 0.48, 0.42),
      ellipse('main', 0, -0.9, 0.55, 0.45),
      poly('main', [-0.66, 0.24], [-0.72, -0.5], [0.72, -0.5], [0.66, 0.24]),
      poly('trim', [-0.3, 0.2], [-0.32, -0.42], [-0.22, -0.42], [-0.2, 0.2]),
      poly('trim', [0.2, 0.2], [0.22, -0.42], [0.32, -0.42], [0.3, 0.2]),
    ],
  },
  pirate: {
    label: 'Pirate hat',
    colours: { main: '#26222c', trim: '#e2b33c', accent: '#f4f1ea' },
    shapes: [
      poly('main', [-1.25, 0.18], [-0.95, -0.6], [-0.35, -0.38], [0, -0.68], [0.35, -0.38], [1.0, -0.6], [1.25, 0.18]),
      poly('trim', [-1.25, 0.18], [1.25, 0.18], [1.14, 0.03], [-1.14, 0.03]),
      // A little skull and crossbones.
      poly('accent', [-0.3, -0.02], [-0.26, -0.1], [0.26, -0.3], [0.3, -0.22]),
      poly('accent', [0.3, -0.02], [0.26, -0.1], [-0.26, -0.3], [-0.3, -0.22]),
      ellipse('accent', 0, -0.3, 0.17, 0.15),
    ],
  },
  viking: {
    label: 'Viking helmet',
    colours: { main: '#a3abb8', trim: '#6c7382', accent: '#f1e6c8' },
    shapes: [
      // Horns out either side, then the helmet over them.
      poly('accent', [-0.7, 0.1], [-1.08, -0.12], [-1.32, -0.55], [-1.3, -0.95], [-1.08, -0.5], [-0.66, -0.26]),
      poly('accent', [0.7, 0.1], [1.08, -0.12], [1.32, -0.55], [1.3, -0.95], [1.08, -0.5], [0.66, -0.26]),
      poly('main', ...dome(0, 0.42, 0.95, 0.95)),
      poly('trim', [-1.0, 0.24], [1.0, 0.24], [1.0, 0.5], [-1.0, 0.5]),
      poly('trim', [-0.08, 0.24], [-0.08, -0.5], [0.08, -0.5], [0.08, 0.24]),
    ],
  },
  santa: {
    label: 'Santa hat',
    colours: { main: '#d9333f', trim: '#fbfaf5', accent: '#fbfaf5' },
    shapes: [
      // Flopping over to the back, a pompom on the end.
      poly('main', [-0.88, 0.45], [0.88, 0.45], [0.7, -0.4], [0.1, -0.85], [-0.75, -0.95], [-1.35, -0.55], [-1.2, -0.3], [-0.9, -0.2]),
      poly('trim', [-0.98, 0.25], [0.98, 0.25], [0.98, 0.62], [-0.98, 0.62]),
      ellipse('accent', -1.32, -0.42, 0.25),
    ],
  },
  propeller: {
    label: 'Propeller cap',
    colours: { main: '#e2435a', trim: '#ffd23f', accent: '#4d8fd6' },
    shapes: [
      poly('main', ...dome(0, 0.48, 0.94, 0.8)),
      poly('trim', [-0.32, 0.48], [-0.2, -0.3], [0.2, -0.3], [0.32, 0.48]),
      poly('trim', [-0.05, -0.3], [-0.05, -0.62], [0.05, -0.62], [0.05, -0.3]),
      ellipse('accent', -0.36, -0.66, 0.36, 0.09),
      ellipse('accent', 0.36, -0.66, 0.36, 0.09),
      ellipse('trim', 0, -0.66, 0.09),
    ],
  },
  graduate: {
    label: 'Graduation cap',
    colours: { main: '#26222c', trim: '#3a3542', accent: '#ffd23f' },
    shapes: [
      poly('trim', [-0.62, 0.28], [-0.62, -0.32], [0.62, -0.32], [0.62, 0.28]),
      poly('main', [-1.2, -0.32], [0, -0.62], [1.2, -0.32], [0, -0.08]),
      // The tassel, hanging off one corner.
      poly('accent', [-0.02, -0.38], [0.02, -0.4], [0.98, -0.3], [0.98, -0.2]),
      poly('accent', [0.92, -0.28], [1.02, -0.28], [1.02, 0.18], [0.92, 0.18]),
      ellipse('accent', 0.97, 0.24, 0.1, 0.13),
    ],
  },
  flowers: {
    label: 'Flower crown',
    colours: { main: '#ff8fb8', trim: '#9bd0ff', accent: '#ffe066' },
    shapes: [
      poly('trim', ...arc(0, 1, 1.04, 0.9, 160, 20)),
      ellipse('main', -0.82, 0.32, 0.24),
      ellipse('trim', -0.4, 0.0, 0.24),
      ellipse('main', 0.05, -0.08, 0.26),
      ellipse('trim', 0.5, 0.02, 0.24),
      ellipse('main', 0.86, 0.34, 0.22),
      ellipse('accent', -0.82, 0.32, 0.09),
      ellipse('accent', -0.4, 0.0, 0.09),
      ellipse('accent', 0.05, -0.08, 0.1),
      ellipse('accent', 0.5, 0.02, 0.09),
      ellipse('accent', 0.86, 0.34, 0.08),
    ],
  },
  sombrero: {
    label: 'Sombrero',
    colours: { main: '#f0c66a', trim: '#e2435a', accent: '#3fae6a' },
    shapes: [
      ellipse('main', 0, 0.14, 1.75, 0.26),
      poly('main', [-0.6, 0.14], [-0.5, -0.6], [-0.25, -0.86], [0.25, -0.86], [0.5, -0.6], [0.6, 0.14]),
      poly('trim', [-0.58, -0.02], [0.58, -0.02], [0.6, 0.14], [-0.6, 0.14]),
      poly('accent', [-0.55, -0.24], [0.55, -0.24], [0.57, -0.1], [-0.57, -0.1]),
      poly('trim', [-1.6, 0.2], [1.6, 0.2], [1.5, 0.3], [-1.5, 0.3]),
    ],
  },
  beret: {
    label: 'Beret',
    colours: { main: '#2f2b36', trim: '#2f2b36', accent: '#2f2b36' },
    shapes: [
      // Tilted over to one side, a little stalk on top.
      ellipse('main', -0.18, 0.04, 1.1, 0.45),
      poly('main', [-0.98, 0.28], [0.8, 0.28], [0.6, 0.48], [-0.85, 0.46]),
      poly('accent', [-0.06, -0.38], [0.02, -0.62], [0.12, -0.6], [0.06, -0.36]),
    ],
  },
};

/** A shirt laid out flat, for pictures of clothes: sleeves out, the neck at the top. */
const SHIRT: [number, number][] = [[-0.35, -0.6], [-1.1, -0.25], [-0.85, 0.15], [-0.6, 0], [-0.6, 0.95], [0.6, 0.95], [0.6, 0], [0.85, 0.15], [1.1, -0.25], [0.35, -0.6], [0, -0.42]];
const band = (paint: Paint, y0: number, y1: number, x0 = -0.6, x1 = 0.6) => poly(paint, [x0, y0], [x1, y0], [x1, y1], [x0, y1]);

/** A collar band round the neck, `h` either side of its middle. */
const neckband = (paint: Paint, h = 0.24): Shape => poly(paint, [-1.05, -h], [1.05, -h], [1.05, h], [-1.05, h]);

export const OUTFIT_ITEMS: Record<Exclude<Outfit, 'none'>, Wearable> = {
  dino: {
    label: 'Dino onesie',
    colours: { main: '#5fbf5a', trim: '#d4f0a6', accent: '#f59f3a' },
    shapes: [neckband('main')],
    body: { covered: true, sleeves: 1, onesie: true, patch: 'trim', spikes: { paint: 'accent', count: 4 } },
    hood: [
      poly('accent', [-0.62, 0.16], [-0.42, -0.3], [-0.2, 0.04]),
      poly('accent', [-0.2, 0.02], [0.04, -0.44], [0.28, 0.02]),
      poly('accent', [0.28, 0.06], [0.5, -0.3], [0.7, 0.18]),
    ],
    icon: [
      poly('accent', [-0.6, -0.5], [-0.42, -0.95], [-0.22, -0.55]),
      poly('accent', [-0.18, -0.55], [0.02, -1.0], [0.22, -0.55]),
      poly('accent', [0.22, -0.55], [0.42, -0.95], [0.6, -0.5]),
      poly('main', ...SHIRT),
      ellipse('trim', 0, 0.35, 0.36, 0.48),
    ],
  },
  bee: {
    label: 'Bee costume',
    colours: { main: '#ffd23f', trim: '#eaf6ff', accent: '#2b2630' },
    shapes: [neckband('accent', 0.18)],
    body: { covered: true, sleeves: 0.5, onesie: true, bands: { paint: 'accent', count: 3, width: 0.11 }, wings: 'trim' },
    hood: [
      poly('accent', [-0.26, 0.08], [-0.12, 0.08], [-0.38, -0.62], [-0.52, -0.56]),
      ellipse('accent', -0.48, -0.66, 0.15),
      poly('accent', [0.14, 0.08], [0.28, 0.08], [0.52, -0.56], [0.38, -0.62]),
      ellipse('accent', 0.46, -0.66, 0.15),
    ],
    icon: [
      ellipse('trim', -0.72, -0.45, 0.42, 0.3),
      ellipse('trim', 0.72, -0.45, 0.42, 0.3),
      poly('main', ...SHIRT),
      band('accent', -0.1, 0.12),
      band('accent', 0.42, 0.64),
    ],
  },
  astronaut: {
    label: 'Space suit',
    colours: { main: '#f1f3f6', trim: '#9aa6b6', accent: '#e2435a' },
    shapes: [neckband('trim', 0.3)],
    body: { covered: true, sleeves: 1, onesie: true, patch: 'trim', buttons: true, pack: 'trim' },
    // A glass bubble of a helmet: just its rim shows, and a glint on it.
    hood: [poly('trim', ...arc(0, 0.85, 1.46, 1.38, -58, 238, 28)), ellipse('main', 0.7, -0.18, 0.1, 0.16), ellipse('main', 0.92, 0.0, 0.07)],
    icon: [
      poly('main', ...SHIRT),
      band('trim', -0.1, 0.4, -0.32, 0.32),
      ellipse('accent', -0.16, 0.15, 0.08),
      ellipse('accent', 0.16, 0.15, 0.08),
      band('trim', 0.62, 0.74),
    ],
  },
  knight: {
    label: 'Knight armour',
    colours: { main: '#c3cad6', trim: '#7f8a9b', accent: '#d63a4a' },
    shapes: [neckband('trim', 0.28)],
    body: { covered: true, sleeves: 1, onesie: true, bands: { paint: 'trim', count: 3, width: 0.05 } },
    hood: [
      poly('accent', [-0.15, -0.2], [0.2, -0.6], [-0.4, -0.85], [-0.95, -0.55], [-0.5, -0.12]),
      poly('main', ...dome(0, 0.5, 1.04, 0.76)),
      poly('trim', [-1.0, 0.32], [1.04, 0.32], [1.04, 0.48], [-1.0, 0.48]),
    ],
    icon: [
      poly('accent', [-0.1, -0.72], [0.3, -1.05], [-0.35, -1.25], [-0.85, -0.95], [-0.4, -0.65]),
      poly('main', ...dome(0, 0.7, 0.95, 1.45)),
      poly('trim', [-0.95, 0.12], [0.95, 0.12], [0.95, 0.3], [-0.95, 0.3]),
      poly('trim', [-0.08, 0.3], [0.08, 0.3], [0.08, 0.7], [-0.08, 0.7]),
    ],
  },
  robe: {
    label: 'Wizard robe',
    colours: { main: '#5a3ea8', trim: '#ffd84a', accent: '#ffd84a' },
    shapes: [neckband('main', 0.22), ellipse('trim', 0.72, 0.06, 0.2)],
    body: { covered: true, sleeves: 0.9, stars: 'trim', skirt: { paint: 'main', style: 'robe' } },
    icon: [
      poly('main', [-0.35, -0.75], [0.35, -0.75], [0.6, -0.3], [1.0, -0.05], [0.75, 0.15], [0.65, 0.05], [0.95, 1.0], [-0.95, 1.0], [-0.65, 0.05], [-0.75, 0.15], [-1.0, -0.05], [-0.6, -0.3]),
      ellipse('trim', 0, -0.62, 0.13),
      ellipse('trim', -0.3, 0.2, 0.09),
      ellipse('trim', 0.32, 0.5, 0.09),
      ellipse('trim', -0.1, 0.78, 0.07),
    ],
  },
  tutu: {
    label: 'Tutu',
    colours: { main: '#ff8fc0', trim: '#ffd0e6', accent: '#ffffff' },
    shapes: [poly('main', [-1.0, -0.14], [1.0, -0.14], [1.0, 0.14], [-1.0, 0.14])],
    body: { covered: true, sleeves: 0, skirt: { paint: 'trim', style: 'tutu' } },
    icon: [
      poly('main', [-0.5, -0.8], [-0.3, -0.8], [-0.15, -0.55], [0.15, -0.55], [0.3, -0.8], [0.5, -0.8], [0.45, 0.2], [-0.45, 0.2]),
      ellipse('trim', 0, 0.35, 1.05, 0.3),
      ellipse('accent', 0, -0.2, 0.08),
    ],
  },
  suit: {
    label: 'Suit and tie',
    colours: { main: '#2f3440', trim: '#f7f5ef', accent: '#c8323e' },
    shapes: [
      // Shirt collar points, then the tie: its knot and blade down the chest.
      poly('trim', [0.25, -0.3], [0.95, -0.25], [0.6, 0.3]),
      poly('accent', [0.68, -0.12], [1.0, -0.12], [0.94, 0.2], [0.74, 0.2]),
      poly('accent', [0.74, 0.2], [0.94, 0.2], [1.06, 1.25], [0.86, 1.55], [0.66, 1.25]),
    ],
    body: { covered: true, sleeves: 0.6, shirt: true },
    icon: [
      poly('main', ...SHIRT),
      poly('trim', [-0.32, -0.58], [0.32, -0.58], [0, 0.32]),
      poly('accent', [-0.08, -0.5], [0.08, -0.5], [0.12, 0.2], [0, 0.36], [-0.12, 0.2]),
    ],
  },
  pajamas: {
    label: 'Pajamas',
    colours: { main: '#9cc1ee', trim: '#f7f5ef', accent: '#ffd84a' },
    shapes: [poly('trim', [-1.05, -0.2], [1.05, -0.2], [1.05, 0.16], [-1.05, 0.16])],
    body: { covered: true, sleeves: 0.78, bands: { paint: 'trim', count: 5, width: 0.08 }, buttons: true },
    icon: [
      poly('main', ...SHIRT),
      band('trim', -0.45, 0.95, -0.36, -0.28),
      band('trim', -0.45, 0.95, 0.28, 0.36),
      ellipse('accent', 0.08, -0.15, 0.07),
      ellipse('accent', 0.08, 0.2, 0.07),
      ellipse('accent', 0.08, 0.55, 0.07),
    ],
  },
  sweater: {
    label: 'Sweater',
    colours: { main: '#d9534f', trim: '#f4f1ea', accent: '#f4f1ea' },
    shapes: [poly('main', [-1.08, -0.3], [1.08, -0.3], [1.08, 0.25], [-1.08, 0.25])],
    body: { covered: true, sleeves: 0.55, bands: { paint: 'trim', count: 2, width: 0.12 } },
    icon: [poly('main', ...SHIRT), band('trim', 0.12, 0.28), band('trim', 0.5, 0.66), band('trim', -0.62, -0.5, -0.32, 0.32)],
  },
  cape: {
    label: 'Superhero cape',
    colours: { main: '#d63a4a', trim: '#ffcf3f', accent: '#8e2230' },
    shapes: [ellipse('trim', 0.7, 0.05, 0.26)],
    body: { covered: false, sleeves: 0, cape: true },
    icon: [poly('main', [-0.42, -0.6], [0.42, -0.6], [0.9, 0.95], [-0.9, 0.95]), poly('accent', [-0.2, -0.45], [0.2, -0.45], [0.5, 0.82], [-0.5, 0.82]), ellipse('trim', 0, -0.58, 0.15)],
  },
  scarf: {
    label: 'Scarf',
    colours: { main: '#e2435a', trim: '#f4f1ea', accent: '#e2435a' },
    shapes: [
      poly('main', [-1.1, -0.42], [1.1, -0.42], [1.1, 0.42], [-1.1, 0.42]),
      poly('trim', [-1.1, -0.06], [1.1, -0.06], [1.1, 0.1], [-1.1, 0.1]),
      poly('main', [0.25, 0.2], [0.95, 0.2], [0.9, 1.75], [0.3, 1.7]),
      poly('trim', [0.29, 1.25], [0.92, 1.28], [0.91, 1.45], [0.3, 1.42]),
    ],
  },
  bowtie: {
    label: 'Bow tie',
    colours: { main: '#d94f5c', trim: '#9e2c3a', accent: '#d94f5c' },
    shapes: [
      poly('main', [0.85, 0.15], [0.25, -0.35], [0.25, 0.65]),
      poly('main', [0.85, 0.15], [1.45, -0.35], [1.45, 0.65]),
      ellipse('trim', 0.85, 0.15, 0.19),
    ],
  },
  bandana: {
    label: 'Bandana',
    colours: { main: '#3f7fd0', trim: '#f4f1ea', accent: '#f4f1ea' },
    shapes: [
      poly('main', [-1.02, -0.24], [1.02, -0.24], [1.02, 0.2], [-1.02, 0.2]),
      poly('main', [-0.15, 0.0], [1.2, 0.0], [0.72, 1.35]),
      ellipse('trim', 0.42, 0.28, 0.09),
      ellipse('trim', 0.82, 0.3, 0.09),
      ellipse('trim', 0.66, 0.7, 0.09),
    ],
  },
  collar: {
    label: 'Collar and bell',
    colours: { main: '#d94f5c', trim: '#a8323e', accent: '#ffcf3f' },
    shapes: [
      poly('main', [-1.02, -0.22], [1.02, -0.22], [1.02, 0.22], [-1.02, 0.22]),
      ellipse('accent', 0.92, 0.55, 0.34),
    ],
  },
};

export const hatItem = (hat: Hat): Wearable | null => (hat === 'none' ? null : HAT_ITEMS[hat]);
export const outfitItem = (outfit: Outfit): Wearable | null => (outfit === 'none' ? null : OUTFIT_ITEMS[outfit]);

/** How the SVG drawings outline what he wears: line colour and width (in the drawing's units). */
export interface WearStyle {
  line: string;
  width: number;
}

/**
 * Fills `group` with the item's shapes, in its own units: the caller places and scales the
 * group. `unit` is how many drawing units one item unit is, so lines come out `style.width` thick.
 */
export function drawWearable(doc: Document, group: SVGElement, item: Wearable | null, unit: number, style: WearStyle): void {
  const { make } = svgWriter(doc);
  group.replaceChildren();
  if (!item) return;
  const stroke = { stroke: style.line, 'stroke-width': n(style.width / unit), 'stroke-linejoin': 'round' };
  for (const s of item.shapes) {
    const fill = item.colours[s.paint];
    if (s.kind === 'poly') {
      make('path', { class: `o-part o-${s.paint}`, d: `M${s.points.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}Z`, fill, ...stroke }, group);
    } else {
      make('ellipse', { class: `o-part o-${s.paint}`, cx: n(s.cx), cy: n(s.cy), rx: n(s.rx), ry: n(s.ry), fill, ...stroke }, group);
    }
  }
}

/** A little picture of an item on its own, for the settings. */
export function wearableIcon(doc: Document, item: Wearable): SVGSVGElement {
  const { make } = svgWriter(doc);
  // Fitted round the item's own shapes, so each fills its button.
  const xs: number[] = [];
  const ys: number[] = [];
  const shapes = item.icon ?? item.shapes;
  for (const s of shapes) {
    if (s.kind === 'poly') {
      for (const [x, y] of s.points) xs.push(x), ys.push(y);
    } else {
      xs.push(s.cx - s.rx, s.cx + s.rx);
      ys.push(s.cy - s.ry, s.cy + s.ry);
    }
  }
  const pad = 0.15;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  let w = Math.max(...xs) - x0 + pad;
  let h = Math.max(...ys) - y0 + pad;
  // Keep its shape: widen the box to the button's proportions.
  const aspect = 34 / 26;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  const box = `${n(cx - w / 2)} ${n(cy - h / 2)} ${n(w)} ${n(h)}`;
  const svg = make('svg', { viewBox: box, width: 34, height: 26, 'aria-hidden': 'true', class: 'wear-icon' }) as SVGSVGElement;
  const g = make('g', {}, svg);
  drawWearable(doc, g, { ...item, shapes }, 1, { line: '#2b2630', width: 0.09 });
  return svg;
}
