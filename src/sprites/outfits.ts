import type { Hat, Outfit } from '../../shared/settings';
import { n, svgWriter } from './svg';

/**
 * Hats and things to wear round the neck, as plain shapes that every art style draws its
 * own way: the painted and chibi pets as SVG, the pixel pets rasterised into pixels.
 *
 * A hat is drawn in head units: the head's half-width is 1, the origin is the crown of the
 * head (its top, a little back from the middle), x points the way he faces and y down. The
 * head itself is roughly a unit circle centred at (0, 1).
 *
 * Neckwear is drawn in neck units: the neck's half-width is 1, the origin is the middle of
 * the collar, x points the way he faces and y down, away from the head.
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
  bow: {
    label: 'Bow',
    colours: { main: '#ff7ab0', trim: '#d94f8a', accent: '#ffffff' },
    shapes: [
      poly('main', [0.32, 0.05], [-0.25, -0.32], [-0.2, 0.34]),
      poly('main', [0.32, 0.05], [0.9, -0.3], [0.86, 0.38]),
      ellipse('trim', 0.32, 0.05, 0.15),
    ],
  },
};

export const OUTFIT_ITEMS: Record<Exclude<Outfit, 'none'>, Wearable> = {
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
  for (const s of item.shapes) {
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
  drawWearable(doc, g, item, 1, { line: '#2b2630', width: 0.09 });
  return svg;
}
