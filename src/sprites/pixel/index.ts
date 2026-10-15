import { ChibiMotion, TIMING } from '../chibi';
import { scruffPoint, toyHoldPoint } from '../chibi/pose';
import type { Pt } from '../chibi/species';
import { hatItem, outfitItem, UNDRESSED, type Dress } from '../outfits';
import type { RaccoonRenderer } from '../types';
import { drawPixelPet, PIXEL } from './draw';
import { drawPixelFacing } from './facing';
import { rgbaTable, shade, type Palette } from './palette';
import { Raster } from './raster';
import type { PixelBuild } from './species';

/** Screen px per art pixel at size 1. */
export const PIXEL_PX = 3;
/** Edge of a pixel toy block, in art pixels: room for a 3 by 5 letter inside its lit and shaded edges. */
export const PIXEL_TOY = 9;
/** Pixel pets move on in steps, like an old game: this many new pictures a second. */
const PIXEL_FPS = 12;

/**
 * A pet drawn in pixels: it moves like a chibi (the same poses and timing), but every
 * picture is rasterised into a small canvas and shown with each pixel blown up into a
 * crisp square, a whole number of screen pixels across, so it never blurs.
 */
export function createPixel(doc: Document, build: PixelBuild, palette: Palette, className: string, label: string): RaccoonRenderer {
  const { width: W, height: H, feetX, feetY, k: K } = PIXEL;
  const root = doc.createElement('div');
  root.className = `raccoon pixel ${className}`;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label);
  const canvas = doc.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'pixel-canvas';
  // What you grab: just the box round the drawn pixels.
  const figure = doc.createElement('div');
  figure.className = 'raccoon-figure pixel-figure';
  root.append(canvas, figure);

  const ctx = canvas.getContext?.('2d') ?? null;
  const image = ctx?.createImageData(W, H) ?? null;
  const words = image ? new Uint32Array(image.data.buffer) : null;
  let colours = rgbaTable(palette);
  let dressed: Dress = UNDRESSED;
  const raster = new Raster(W, H);
  const motion = new ChibiMotion(build);

  /** CSS px per art pixel: a whole number of device pixels. */
  let cell = PIXEL_PX;
  let scale = 1;
  let scruff: Pt | null = null;
  let toy: Pt | null = null;
  let shownTick = NaN;
  let shownFacing = 0;
  let shownView = '';

  const sizeTo = () => {
    const dpr = doc.defaultView?.devicePixelRatio || 1;
    cell = Math.max(1, Math.round(PIXEL_PX * scale * dpr)) / dpr;
    for (const el of [root, canvas]) {
      el.style.width = `${W * cell}px`;
      el.style.height = `${H * cell}px`;
    }
    shownTick = NaN;
  };
  sizeTo();

  const paint = () => {
    if (!ctx || !image || !words) return;
    const { data } = raster;
    for (let i = 0; i < data.length; i++) words[i] = colours[data[i]!]!;
    ctx.putImageData(image, 0, 0);
  };

  return {
    element: root,
    figure,
    baseSize: { width: W * PIXEL_PX, height: H * PIXEL_PX },
    anchor: { x: feetX / W, y: feetY / H },
    peekSink: build.peekSink * K * PIXEL_PX,
    turnsItself: true,
    pixelated: true,
    animations: TIMING,
    isSettling: () => motion.settling,
    holdPoint: () => (scruff ? { x: scruff.x * motion.facing * K * cell, y: scruff.y * K * cell } : null),
    toyReach: build.toyReach * K * PIXEL_PX,
    toySize: PIXEL_TOY * PIXEL_PX,
    toyLook: 'pixel',
    carriesToys: build.species === 'raccoon',
    deskReach: { x: build.desk.x * K * PIXEL_PX, y: build.desk.y * K * PIXEL_PX },
    mouseReach: { x: build.mouse.x * K * PIXEL_PX, y: build.mouse.y * K * PIXEL_PX },
    drawsMarks: true,
    toyPoint: () => (toy ? { x: toy.x * motion.facing * K * cell, y: toy.y * K * cell } : null),
    dress(d) {
      dressed = d;
      const hat = hatItem(d.hat)?.colours;
      const wear = outfitItem(d.outfit)?.colours;
      colours = rgbaTable({
        ...palette,
        ...(hat && { hatMain: hat.main, hatTrim: hat.trim, hatAccent: hat.accent }),
        ...(wear && { wearMain: wear.main, wearTrim: wear.trim, wearAccent: wear.accent, wearLight: shade(wear.main, 0.25), wearDark: shade(wear.main, -0.25) }),
      });
      shownTick = NaN;
    },
    setScale(next) {
      scale = next;
      sizeTo();
    },
    draw(frame) {
      const pose = motion.update(frame, 1 / (K * cell));
      const clock = frame.clockMs ?? frame.timeMs;
      // A new picture only every so often, but at once when he turns round.
      const tick = Math.floor(clock / (1000 / PIXEL_FPS));
      const facing = motion.facing;
      const view = motion.view;
      if (tick === shownTick && facing === shownFacing && view === shownView) return;
      shownTick = tick;
      shownFacing = facing;
      shownView = view;
      scruff = scruffPoint(build, pose);
      toy = toyHoldPoint(build, pose);
      const box =
        view === 'side'
          ? drawPixelPet(raster, build, pose, clock, facing, motion.moving, scruff, dressed)
          : drawPixelFacing(raster, build, pose, view, { phase: motion.phase, moving: motion.moving, running: frame.animation !== 'walk', side: facing }, clock, dressed);
      paint();
      if (box) {
        figure.style.left = `${box.x0 * cell}px`;
        figure.style.top = `${box.y0 * cell}px`;
        figure.style.width = `${(box.x1 - box.x0) * cell}px`;
        figure.style.height = `${(box.y1 - box.y0) * cell}px`;
      }
    },
  };
}
