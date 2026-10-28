import { ChibiMotion, TIMING } from '../chibi';
import { scruffPoint, toyHoldPoint } from '../chibi/pose';
import type { Pt } from '../chibi/species';
import { hatItem, outfitItem, UNDRESSED, type Dress } from '../outfits';
import type { RaccoonRenderer } from '../types';
import { drawPixelPet, PIXEL, QUARTER_SQUASH } from './draw';
import { drawPixelFacing } from './facing';
import { rgbaTable, shade, type Palette } from './palette';
import { Raster, type Box } from './raster';
import type { PixelBuild } from './species';

/** Screen px per art pixel at size 1. */
export const PIXEL_PX = 3;
/** Edge of a pixel toy block, in art pixels: room for a 3 by 5 letter inside its lit and shaded edges. */
export const PIXEL_TOY = 9;
/** Pixel pets move on in steps, like an old game: this many new pictures a second. */
export const PIXEL_FPS = 12;

/**
 * The canvas a pixel pet is shown in, and what goes with it: the raster it's drawn into,
 * its palette (with whatever he's wearing), and the box you grab him by.
 */
export function pixelCanvas(doc: Document, palette: Palette, className: string, label: string) {
  const { width: W, height: H } = PIXEL;
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
  const raster = new Raster(W, H);

  const view = {
    root,
    figure,
    raster,
    dressed: UNDRESSED as Dress,
    /** CSS px per art pixel: a whole number of device pixels. */
    cell: PIXEL_PX,
    scale: 1,
    /** Called when the picture must be drawn again even if nothing moved. */
    onChange: () => {},
    sizeTo() {
      const dpr = doc.defaultView?.devicePixelRatio || 1;
      view.cell = Math.max(1, Math.round(PIXEL_PX * view.scale * dpr)) / dpr;
      for (const el of [root, canvas]) {
        el.style.width = `${W * view.cell}px`;
        el.style.height = `${H * view.cell}px`;
      }
      view.onChange();
    },
    dress(d: Dress) {
      view.dressed = d;
      const hat = hatItem(d.hat)?.colours;
      const wear = outfitItem(d.outfit)?.colours;
      colours = rgbaTable({
        ...palette,
        ...(hat && { hatMain: hat.main, hatTrim: hat.trim, hatAccent: hat.accent }),
        ...(wear && { wearMain: wear.main, wearTrim: wear.trim, wearAccent: wear.accent, wearLight: shade(wear.main, 0.25), wearDark: shade(wear.main, -0.25) }),
      });
      view.onChange();
    },
    /** Shows what's in the raster, and fits the grab box to `box`. */
    paint(box: Box | null) {
      if (ctx && image && words) {
        const { data } = raster;
        for (let i = 0; i < data.length; i++) words[i] = colours[data[i]!]!;
        ctx.putImageData(image, 0, 0);
      }
      if (box) {
        figure.style.left = `${box.x0 * view.cell}px`;
        figure.style.top = `${box.y0 * view.cell}px`;
        figure.style.width = `${(box.x1 - box.x0) * view.cell}px`;
        figure.style.height = `${(box.y1 - box.y0) * view.cell}px`;
      }
    },
  };
  return view;
}

/**
 * A pet drawn in pixels: it moves like a chibi (the same poses and timing), but every
 * picture is rasterised into a small canvas and shown with each pixel blown up into a
 * crisp square, a whole number of screen pixels across, so it never blurs.
 */
export function createPixel(doc: Document, build: PixelBuild, palette: Palette, className: string, label: string): RaccoonRenderer {
  const { width: W, height: H, feetX, feetY, k: K } = PIXEL;
  const view = pixelCanvas(doc, palette, className, label);
  const motion = new ChibiMotion(build);

  let scruff: Pt | null = null;
  let toy: Pt | null = null;
  let shownTick = NaN;
  let shownFacing = 0;
  let shownView = '';
  /** Turned three-quarters, everything across him is this much shorter. */
  let across = 1;
  view.onChange = () => void (shownTick = NaN);
  view.sizeTo();

  return {
    element: view.root,
    figure: view.figure,
    baseSize: { width: W * PIXEL_PX, height: H * PIXEL_PX },
    anchor: { x: feetX / W, y: feetY / H },
    peekSink: build.peekSink * K * PIXEL_PX,
    turnsItself: true,
    pixelated: true,
    animations: TIMING,
    isSettling: () => motion.settling,
    holdPoint: () => (scruff ? { x: scruff.x * across * motion.facing * K * view.cell, y: scruff.y * K * view.cell } : null),
    toyReach: build.toyReach * K * PIXEL_PX,
    toySize: PIXEL_TOY * PIXEL_PX,
    toyLook: 'pixel',
    carriesToys: build.species === 'raccoon',
    deskReach: { x: build.desk.x * K * PIXEL_PX, y: build.desk.y * K * PIXEL_PX },
    mouseReach: { x: build.mouse.x * K * PIXEL_PX, y: build.mouse.y * K * PIXEL_PX },
    drawsMarks: true,
    toyPoint: () => (toy ? { x: toy.x * across * motion.facing * K * view.cell, y: toy.y * K * view.cell } : null),
    dress: (d) => view.dress(d),
    setScale(next) {
      view.scale = next;
      view.sizeTo();
    },
    draw(frame) {
      const pose = motion.update(frame, 1 / (K * view.cell));
      const clock = frame.clockMs ?? frame.timeMs;
      // A new picture only every so often, but at once when he turns round.
      const tick = Math.floor(clock / (1000 / PIXEL_FPS));
      const facing = motion.facing;
      const turned = motion.view;
      if (tick === shownTick && facing === shownFacing && turned === shownView) return;
      shownTick = tick;
      shownFacing = facing;
      shownView = turned;
      scruff = scruffPoint(build, pose);
      toy = toyHoldPoint(build, pose);
      const quarter = turned === 'frontQuarter' ? 'front' : turned === 'backQuarter' ? 'back' : null;
      across = quarter ? QUARTER_SQUASH : 1;
      const box =
        turned !== 'front' && turned !== 'back'
          ? drawPixelPet(view.raster, build, pose, clock, facing, motion.moving, scruff, view.dressed, quarter)
          : drawPixelFacing(view.raster, build, pose, turned, { phase: motion.phase, moving: motion.moving, running: frame.animation !== 'walk', side: facing }, clock, view.dressed);
      view.paint(box);
    },
  };
}
