/**
 * The raccoon's trash can for play mode, in pixel art: a ribbed metal can with its lid
 * leant up against the back of it, and a fish bone and a banana skin poking out of the top.
 *
 * It's drawn in two layers, so he can get in it: the back (its shadow, the lid, the inside
 * of the can and the back of the rim) goes behind him, and the front (the can itself and
 * the front of the rim) in front of him while he's in it, or behind it. Drawn at the pixel
 * pets' pixel size, in proportion to them.
 */

import { capsule, ellipse, polygon, Raster, type Pt } from './pixel/raster';

/**
 * The can's size in the pets' drawing units (two to an art pixel): half its width, and how
 * high its rim is off the floor. The poses use these to put him in it.
 */
export const BIN = { halfWidth: 30, rim: 44 };

export interface BinDrawing {
  /** Behind him, and in front of him. Each is `width` by `height` px. */
  back: HTMLCanvasElement;
  front: HTMLCanvasElement;
  width: number;
  height: number;
  /** The middle of the can's base, px from the top left of the drawing. */
  base: Pt;
  /** Half the can's width, and how high its rim is, px. */
  halfWidth: number;
  rim: number;
}

/** Its colours, by palette index (0 is see-through). */
export const BIN_COLOURS = [
  '',
  // 1 outline, 2 metal, 3 lit, 4 shaded, 5 rim, 6 inside, 7 shadow
  '#262a33',
  '#9aa4b0',
  '#c9d1da',
  '#6c7582',
  '#dfe5eb',
  '#2f343f',
  'rgba(20, 16, 30, 0.24)',
  // 8 bone, 9 banana, 10 banana shade, 11 lid, 12 lid lit
  '#efe9dc',
  '#ffd84a',
  '#c99a1e',
  '#8e98a5',
  '#bcc5cf',
] as const;

const OUTLINE = 1;
const METAL = 2;
const LIT = 3;
const SHADED = 4;
const RIM = 5;
const INSIDE = 6;
const SHADOW = 7;
const BONE = 8;
const BANANA = 9;
const BANANA_SHADE = 10;
const LID = 11;
const LID_LIT = 12;

/** @param pixel px per art pixel */
export function createBinDrawing(doc: Document, pixel: number): BinDrawing {
  const P = Math.max(1, pixel);
  const art = drawBin();
  return {
    back: paint(doc, art.back, P),
    front: paint(doc, art.front, P),
    width: art.back.width * P,
    height: art.back.height * P,
    base: { x: art.base.x * P, y: art.base.y * P },
    halfWidth: art.halfWidth * P,
    rim: art.rim * P,
  };
}

/** The can in art pixels: its two layers, where the middle of its base is, half its width and its rim's height. */
export function drawBin(): { back: Raster; front: Raster; base: Pt; halfWidth: number; rim: number } {
  const half = BIN.halfWidth / 2;
  const rimUp = BIN.rim / 2;
  // Room for the lid behind on the right, and the rubbish poking up out of the top.
  const width = Math.ceil(half * 2 + 10);
  const height = Math.ceil(rimUp + 10);
  const cx = half + 2;
  const floor = height - 2;
  const top = floor - rimUp;

  const back = new Raster(width, height);
  const front = new Raster(width, height);

  // --- Behind him ---
  const shadow = ellipse(cx + 1, floor + 0.5, half + 3, 1.6);
  back.shape(shadow.sd, shadow.box, SHADOW, null);
  // The lid, leant against the back of the can, sticking out on the right.
  const lid = ellipse(cx + half + 1, floor - rimUp * 0.45, 2.6, rimUp * 0.48, 0.18);
  back.shape(lid.sd, lid.box, LID, OUTLINE, { light: LID_LIT, dark: LID });
  const knob = capsule({ x: cx + half + 3.6, y: floor - rimUp * 0.5 }, { x: cx + half + 4.4, y: floor - rimUp * 0.5 }, 0.8);
  back.shape(knob.sd, knob.box, LID_LIT, OUTLINE);
  // A fish bone and a banana skin poking up out of it.
  const spine = capsule({ x: cx - 6, y: top - 1 }, { x: cx - 2, y: top - 6 }, 0.5);
  back.shape(spine.sd, spine.box, BONE, OUTLINE);
  for (const k of [0.3, 0.6]) {
    const at = { x: cx - 6 + 4 * k, y: top - 1 - 5 * k };
    const rib = capsule({ x: at.x - 1.2, y: at.y - 1.2 }, { x: at.x + 1.2, y: at.y + 1.2 }, 0.45);
    back.shape(rib.sd, rib.box, BONE, OUTLINE);
  }
  const head = polygon([{ x: cx - 2.5, y: top - 5.5 }, { x: cx - 0.5, y: top - 8 }, { x: cx, y: top - 5 }]);
  back.shape(head.sd, head.box, BONE, OUTLINE);
  for (const [dx, lean] of [[3, -1.5], [5, 1.8]] as const) {
    const peel = capsule({ x: cx + dx, y: top - 0.5 }, { x: cx + dx + lean, y: top - 4.5 }, 1, 0.6);
    back.shape(peel.sd, peel.box, dx === 3 ? BANANA : BANANA_SHADE, OUTLINE);
  }
  // The inside of the can, and the rim all round it.
  const lip = ellipse(cx, top, half + 0.8, 2.6);
  back.shape(lip.sd, lip.box, RIM, OUTLINE);
  const hole = ellipse(cx, top + 0.2, half - 0.8, 1.5);
  back.shape(hole.sd, hole.box, INSIDE, null);

  // --- In front of him ---
  // The can, a little wider at the top, ribbed down its length, with two hoops round it.
  const body = polygon([{ x: cx - half + 0.8, y: floor }, { x: cx + half - 0.8, y: floor }, { x: cx + half, y: top + 0.5 }, { x: cx - half, y: top + 0.5 }]);
  front.shape(body.sd, body.box, (x) => {
    const u = (x - cx) / half;
    if (u < -0.62) return SHADED;
    if (u > -0.42 && u < -0.18) return LIT;
    return Math.round(x - cx) % 4 === 0 ? SHADED : METAL;
  }, OUTLINE);
  // The bottom of it is round, seen from a little above.
  const bottom = ellipse(cx, floor - 1, half - 0.8, 1.8);
  front.shape((x, y) => (y < floor - 1 ? Math.max(1, body.sd(x, y)) : bottom.sd(x, y)), bottom.box, SHADED, OUTLINE, undefined, (_x, y) => y >= floor - 1);
  for (const k of [0.3, 0.68]) {
    const y = floor - rimUp * k;
    const hoop = capsule({ x: cx - half + 0.5, y }, { x: cx + half - 0.5, y }, 0.55);
    front.shape(hoop.sd, hoop.box, OUTLINE, null);
  }
  // Handles either side, just under the rim.
  for (const s of [-1, 1]) {
    const handle = ellipse(cx + s * (half + 0.6), top + 3.2, 1.2, 1.6);
    front.shape(handle.sd, handle.box, METAL, OUTLINE);
  }
  // The front of the rim, over his tummy when he's in it.
  const frontLip = ellipse(cx, top, half + 0.8, 2.6);
  front.shape((x, y) => (y < top ? 1 : frontLip.sd(x, y)), frontLip.box, RIM, OUTLINE, undefined, (_x, y) => y >= top);
  const frontHole = ellipse(cx, top + 0.2, half - 0.8, 1.5);
  front.shape((x, y) => (y < top + 0.6 ? 1 : frontHole.sd(x, y)), frontHole.box, METAL, null);

  return { back, front, base: { x: cx, y: floor }, halfWidth: half, rim: rimUp };
}

/** The picture in a canvas, shown `P` px to an art pixel. */
function paint(doc: Document, r: Raster, P: number): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  canvas.width = r.width;
  canvas.height = r.height;
  canvas.className = 'bin-art';
  canvas.style.width = `${r.width * P}px`;
  canvas.style.height = `${r.height * P}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(r.width, r.height);
  const rgba = BIN_COLOURS.map(parse);
  for (let i = 0; i < r.data.length; i++) {
    const c = r.data[i]!;
    if (!c) continue;
    const [red, green, blue, alpha] = rgba[c]!;
    image.data.set([red, green, blue, alpha], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function parse(colour: string): [number, number, number, number] {
  if (colour.startsWith('#')) {
    const v = parseInt(colour.slice(1, 7), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
  }
  const m = /rgba?\(([^)]+)\)/.exec(colour);
  const parts = m ? m[1]!.split(',').map((x) => parseFloat(x)) : [0, 0, 0, 0];
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, Math.round((parts[3] ?? 1) * 255)];
}
