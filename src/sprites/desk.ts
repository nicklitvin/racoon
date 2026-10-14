import { n, svgWriter } from './svg';
import type { ToyLook } from './types';

/**
 * The desk for work mode: a little wooden desk with a computer on it (monitor, keyboard,
 * mouse) and a mug, drawn to match the pet. It's built to fit him: the keyboard sits just
 * where his paws come down when he types, and everything else is in proportion to him.
 *
 * Drawn facing right, as he sits at it: keyboard nearest him, on the left, the monitor
 * beyond it. The screen is a separate layer of plain elements over the drawing, so the
 * lines of "work" on it can scroll by with CSS while he types.
 */

export interface DeskDrawing {
  element: HTMLElement;
  /** The part you can tap. */
  art: Element;
  width: number;
  height: number;
  /** The middle of the keyboard, px from the desk's left edge. */
  keyboardX: number;
  /** The middle of the screen, px from the desk's left edge and up from the floor. */
  screen: { x: number; y: number };
  setWorking(on: boolean): void;
}

interface Part {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  /** Corner radius, px (vector drawings only). */
  r?: number;
  /** Drawn without an outline (details on something already outlined). */
  flat?: boolean;
}

const COLOURS = {
  wood: '#c99460',
  woodLight: '#ddb07c',
  woodDark: '#9b6a3e',
  metal: '#3b404c',
  metalLight: '#565c6b',
  screen: '#1f2b3b',
  keys: '#ece8e0',
  key: '#c4beb2',
  mug: '#f2775f',
  mugLight: '#ffffff',
};

const LOOKS: Record<ToyLook, { line: string; width: number; paper?: boolean }> = {
  paint: { line: '#5a4232', width: 1 },
  chibi: { line: '#2b2630', width: 1.8 },
  ink: { line: '#1f1d22', width: 1.1, paper: true },
  pixel: { line: '#2a1f2d', width: 1 },
};

/**
 * @param unit his height, px: the desk is sized to it
 * @param keysTop how high the top of the keyboard is off the floor, px: where his paws rest
 * @param pixel for pixel art, how many px each art pixel is
 */
export function createDeskDrawing(doc: Document, look: ToyLook, unit: number, keysTop: number, pixel = 0): DeskDrawing {
  const U = unit;
  const snap = (v: number) => (pixel ? Math.max(pixel, Math.round(v / pixel) * pixel) : v);
  const keysH = snap(Math.max(3, U * 0.05));
  const surface = Math.max(snap(U * 0.12), snap(keysTop - keysH));
  const top = snap(Math.max(4, U * 0.065));
  const legW = snap(Math.max(3, U * 0.055));
  const width = snap(U * 1.5);
  const keysX = snap(U * 0.05);
  const keysW = snap(U * 0.4);
  const mouseX = snap(U * 0.49);
  const monX = snap(U * 0.72);
  const monW = snap(U * 0.72);
  const monH = snap(U * 0.48);
  const bezel = snap(Math.max(2, U * 0.025));
  const stand = snap(U * 0.09);
  const height = snap(surface + stand + monH + U * 0.06);
  // y from the top of the drawing, for a height off the floor.
  const Y = (up: number) => height - up;

  const C = COLOURS;
  const L = LOOKS[look];
  const paper = L.paper ? '#fffdf8' : null;
  const fill = (c: string) => paper ?? c;
  const drawerX = width - snap(U * 0.42);
  const parts: Part[] = [
    // Legs, a drawer unit under the far end, and the top.
    { x: snap(U * 0.04), y: Y(surface - top), w: legW, h: surface - top, fill: fill(C.woodDark) },
    { x: drawerX, y: Y(surface - top), w: width - drawerX - snap(U * 0.04), h: surface - top, fill: fill(C.wood) },
    { x: drawerX + snap(U * 0.04), y: Y(surface - top - snap(U * 0.04)), w: width - drawerX - snap(U * 0.12), h: snap(U * 0.1), fill: fill(C.woodLight), r: 1.5 },
    { x: drawerX + snap(U * 0.04), y: Y(surface - top - snap(U * 0.19)), w: width - drawerX - snap(U * 0.12), h: snap(U * 0.1), fill: fill(C.woodLight), r: 1.5 },
    { x: 0, y: Y(surface), w: width, h: top, fill: fill(C.wood), r: 2 },
    { x: snap(U * 0.02), y: Y(surface), w: width - snap(U * 0.04), h: snap(Math.max(1, top * 0.3)), fill: fill(C.woodLight), flat: true },
    // The monitor on its stand.
    { x: monX + monW / 2 - snap(U * 0.12), y: Y(surface + snap(U * 0.025)), w: snap(U * 0.24), h: snap(U * 0.025), fill: fill(C.metal), r: 1 },
    { x: monX + monW / 2 - snap(U * 0.03), y: Y(surface + stand), w: snap(U * 0.06), h: stand, fill: fill(C.metalLight) },
    { x: monX, y: Y(surface + stand + monH), w: monW, h: monH, fill: fill(C.metal), r: 3 },
    { x: monX + bezel, y: Y(surface + stand + monH - bezel), w: monW - bezel * 2, h: monH - bezel * 2.6, fill: paper ? '#eef2f6' : C.screen, r: 1.5, flat: true },
    // A mug of something warm.
    { x: snap(U * 0.59), y: Y(surface + snap(U * 0.1)), w: snap(U * 0.075), h: snap(U * 0.1), fill: fill(C.mug), r: 1.5 },
    // Keyboard and mouse.
    { x: keysX, y: Y(surface + keysH), w: keysW, h: keysH, fill: fill(C.keys), r: 1.5 },
    { x: mouseX, y: Y(surface + snap(U * 0.035)), w: snap(U * 0.07), h: snap(U * 0.035), fill: fill(C.keys), r: 3 },
  ];
  // A row of keys along the keyboard.
  const keyW = snap(Math.max(1, keysW / 9));
  for (let x = keysX + keyW; x + keyW <= keysX + keysW - keyW / 2; x += keyW * 1.6) {
    parts.push({ x, y: Y(surface + keysH * 0.8), w: keyW, h: pixel ? pixel : Math.max(1, keysH * 0.3), fill: paper ? L.line : C.key, flat: true });
  }

  const element = doc.createElement('div');
  element.className = `desk desk-${look}`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  let art: Element;
  if (pixel) {
    art = pixelArt(doc, parts, width, height, pixel, L.line);
  } else {
    const { make } = svgWriter(doc);
    const svg = make('svg', { viewBox: `0 0 ${n(width)} ${n(height)}`, width: n(width), height: n(height), class: 'desk-art', 'aria-hidden': 'true' });
    for (const p of parts) {
      make(
        'rect',
        {
          x: n(p.x),
          y: n(p.y),
          width: n(p.w),
          height: n(p.h),
          rx: n(p.r ?? 0),
          fill: p.fill,
          stroke: p.flat ? 'none' : L.line,
          'stroke-width': n(L.width),
          'stroke-linejoin': 'round',
        },
        svg,
      );
    }
    // The mug's handle.
    const mx = snap(U * 0.59) + snap(U * 0.075);
    make('path', { d: `M${n(mx)},${n(Y(surface + U * 0.08))} q${n(U * 0.04)},${n(U * 0.025)} 0,${n(U * 0.055)}`, fill: 'none', stroke: L.line, 'stroke-width': n(L.width * 1.4) }, svg);
    art = svg;
  }
  element.appendChild(art);

  // What's on the screen: lines of work appearing while he types, a screen saver otherwise.
  const screen = doc.createElement('div');
  screen.className = 'desk-screen';
  const sx = monX + bezel * 2;
  const sTop = Y(surface + stand + monH - bezel * 2);
  Object.assign(screen.style, { left: `${sx}px`, top: `${sTop}px`, width: `${monW - bezel * 4}px`, height: `${monH - bezel * 4}px` });
  const lineH = pixel ? pixel : Math.max(2, U * 0.022);
  for (let i = 0; i < 6; i++) {
    const line = doc.createElement('i');
    line.className = 'desk-line';
    line.style.height = `${lineH}px`;
    line.style.width = `${[70, 45, 82, 30, 60, 52][i]}%`;
    line.style.marginLeft = `${[0, 12, 12, 24, 12, 0][i]}%`;
    line.style.animationDelay = `${i * 0.45}s`;
    screen.appendChild(line);
  }
  element.appendChild(screen);

  return {
    element,
    art,
    width,
    height,
    keyboardX: keysX + keysW / 2,
    screen: { x: monX + monW / 2, y: surface + stand + monH / 2 },
    setWorking(on) {
      element.classList.toggle('working', on);
    },
  };
}

/** The same desk in whole pixels, each part outlined, on a small canvas blown up. */
function pixelArt(doc: Document, parts: Part[], width: number, height: number, pixel: number, line: string): HTMLCanvasElement {
  const W = Math.round(width / pixel);
  const H = Math.round(height / pixel);
  const canvas = doc.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.className = 'desk-art';
  canvas.style.width = `${W * pixel}px`;
  canvas.style.height = `${H * pixel}px`;
  const ctx = canvas.getContext?.('2d') ?? null;
  if (!ctx) return canvas;
  for (const p of parts) {
    const x = Math.round(p.x / pixel);
    const y = Math.round(p.y / pixel);
    const w = Math.max(1, Math.round(p.w / pixel));
    const h = Math.max(1, Math.round(p.h / pixel));
    if (!p.flat) {
      ctx.fillStyle = line;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    }
    ctx.fillStyle = p.fill;
    ctx.fillRect(x, y, w, h);
  }
  return canvas;
}
