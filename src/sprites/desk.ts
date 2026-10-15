/**
 * The desk for work mode, in pixel art: a little wooden desk with a computer on it (a
 * monitor, keyboard and mouse) and a mug. It's built to fit the pet: the keyboard and the
 * mouse sit just where his paws come down, and everything else is in proportion to him.
 *
 * Drawn facing right, as he sits at it: keyboard nearest him, then the mouse, then the
 * monitor. The monitor faces out, so you can see his screen while he looks at it, with
 * the depth of its case showing behind. What's on the screen is drawn too, a few times a
 * second: a terminal, a web page, reels, or a screen saver while nobody's using it.
 */

import { REEL_MS } from './typing';

/** What's on the screen. */
export type DeskApp = 'terminal' | 'web' | 'reels' | 'idle';

export interface DeskDrawing {
  element: HTMLElement;
  /** The part you can tap. */
  art: Element;
  width: number;
  height: number;
  /** The middle of the keyboard, px from the desk's left edge. */
  keyboardX: number;
  /** How far the drawing reaches below the floor it stands on (the outline under its legs), px. */
  below: number;
  /** The middle of the screen, px from the desk's left edge and up from the floor. */
  screen: { x: number; y: number };
  /** Shows `app` on the screen as it is at `clock` (ms). Cheap to call every frame. */
  show(app: DeskApp, clock: number): void;
}

const COLOURS = {
  line: '#2a1f2d',
  wood: '#c99460',
  woodLight: '#ddb07c',
  woodDark: '#9b6a3e',
  metal: '#3b404c',
  metalLight: '#565c6b',
  metalSide: '#2c3039',
  keys: '#ece8e0',
  key: '#b9b2a6',
  mug: '#f2775f',
};

/** The screen redraws this often while something's on it. */
const SCREEN_FPS = 8;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  /** Drawn without an outline (detail on something already outlined). */
  flat?: boolean;
}

/**
 * @param unit his height, px: the desk is sized to it
 * @param keysTop how high the top of the keyboard is off the floor, px: where his paws rest
 * @param mouseDx how far right of the keyboard's middle the mouse goes, px
 * @param pixel px per art pixel
 */
export function createDeskDrawing(doc: Document, unit: number, keysTop: number, mouseDx: number, pixel: number): DeskDrawing {
  const P = Math.max(1, pixel);
  // Everything in art pixels from here on.
  const u = unit / P;
  const r = (v: number) => Math.max(1, Math.round(v));
  const keysH = 2;
  const surface = Math.max(5, Math.round(keysTop / P) - keysH);
  const top = 2;
  const legW = 2;
  const mouseW = 3;
  const mouseX = Math.round(mouseDx / P);
  // The keyboard fills what room there is between his near paw and the mouse.
  const keysW = Math.max(6, Math.min(r(u * 0.26), 2 * (mouseX - Math.ceil(mouseW / 2) - 1)));
  const keysX = 1;
  const keysMid = keysX + keysW / 2;
  const mouseLeft = Math.round(keysMid + mouseX - mouseW / 2);
  const mugX = mouseLeft + mouseW + 2;
  // The monitor: its face, and its case showing `depth` deep behind.
  const faceW = r(u * 0.46);
  const faceH = r(u * 0.33);
  const depth = 2;
  const stand = r(u * 0.08) + 2;
  const monX = mugX + 6;
  const width = monX + faceW + depth + 3;
  // A row under the floor for the outline along the bottom of the legs and drawers.
  const base = 1;
  const height = base + surface + stand + faceH + depth + 2;
  // y from the top of the canvas for a height off the floor: the floor is `base` rows up from the bottom.
  const Y = (up: number) => height - base - up;
  const C = COLOURS;

  // Under the top: a leg at each end down to the floor, and a drawer hanging between them on
  // the far side, clear of the floor.
  const legH = surface - top;
  const rightLeg = width - 1 - legW;
  const drawerX = monX + 1;
  const drawerW = rightLeg - 1 - drawerX;
  const drawerH = Math.max(2, Math.round(legH * 0.55));
  const rects: Rect[] = [
    { x: 1, y: Y(legH), w: legW, h: legH, fill: C.woodDark },
    { x: rightLeg, y: Y(legH), w: legW, h: legH, fill: C.woodDark },
    { x: drawerX, y: Y(legH), w: drawerW, h: drawerH, fill: C.wood },
    { x: drawerX + Math.floor(drawerW / 2) - 1, y: Y(legH) + Math.floor(drawerH / 2), w: 2, h: 1, fill: C.woodDark, flat: true },
    { x: 0, y: Y(surface), w: width, h: top, fill: C.wood },
    { x: 1, y: Y(surface), w: width - 2, h: 1, fill: C.woodLight, flat: true },
    // A mug, keyboard and mouse.
    { x: mugX, y: Y(surface + 3), w: 3, h: 3, fill: C.mug },
    { x: keysX, y: Y(surface + keysH), w: keysW, h: keysH, fill: C.keys },
    { x: mouseLeft, y: Y(surface + 1), w: mouseW, h: 1, fill: C.keys },
  ];
  for (let x = keysX + 1; x < keysX + keysW - 1; x += 2) rects.push({ x, y: Y(surface + keysH) , w: 1, h: 1, fill: C.key, flat: true });

  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.className = 'desk-art';
  canvas.style.width = `${width * P}px`;
  canvas.style.height = `${height * P}px`;
  const ctx = canvas.getContext?.('2d') ?? null;
  const px = (x: number, y: number, fill: string) => {
    if (!ctx) return;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, 1, 1);
  };
  if (ctx) {
    for (const p of rects) {
      if (!p.flat) {
        ctx.fillStyle = C.line;
        ctx.fillRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2);
      }
      ctx.fillStyle = p.fill;
      ctx.fillRect(p.x, p.y, p.w, p.h);
    }
    // The mug's handle.
    px(mugX + 3, Y(surface + 2), C.line);
    px(mugX + 4, Y(surface + 2), C.line);
    px(mugX + 4, Y(surface + 1), C.line);
  }

  // The monitor. Column i of its face runs from colTop(i) down to colBottom(i).
  const faceBottom = Y(surface + stand);
  const colBottom = (_i: number) => faceBottom;
  const colTop = (i: number) => colBottom(i) - faceH + 1;
  const mid = Math.floor(faceW / 2);
  if (ctx) {
    // Everything that's monitor, so it can be outlined as one: the case behind (the face
    // pushed back, up and away from him), the face, and the stand.
    const mask = new Uint8Array(width * height);
    const mark = (x: number, y: number, v: number) => {
      if (x >= 0 && y >= 0 && x < width && y < height) mask[y * width + x] = v;
    };
    for (let d = depth; d >= 1; d--) for (let i = 0; i < faceW; i++) for (let y = colTop(i); y <= colBottom(i); y++) mark(monX + i + d, y - d, 1);
    for (let i = 0; i < faceW; i++) for (let y = colTop(i); y <= colBottom(i); y++) mark(monX + i, y, 2);
    const neckX = monX + mid;
    for (let y = colBottom(mid) + 1; y < Y(surface + 1); y++) mark(neckX, y, 3), mark(neckX + 1, y, 3);
    for (let x = -3; x <= 3; x++) mark(neckX + x, Y(surface + 1), 3);
    for (let x = -1; x <= 4; x++) mark(neckX + x, Y(surface + 2), 3);
    const colour = [null, C.metalSide, C.metal, C.metalLight];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = mask[y * width + x]!;
        if (v) px(x, y, colour[v]!);
        else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask[(y + dy!) * width + x + dx!] && x + dx! >= 0 && x + dx! < width)) px(x, y, C.line);
      }
    }
    // A glint along the case's top edge, where the light catches it.
    for (let i = 2; i < faceW - 1; i++) px(monX + i + 1, colTop(i) - 1, C.metalLight);
  }
  // The screen inside the bezel: the same slant, the picture drawn on it pixel for pixel.
  const scr = { x0: 1, x1: faceW - 2 };
  const screenW = scr.x1 - scr.x0 + 1;
  const screenH = faceH - 3;
  const screenTop = (i: number) => colTop(i) + 1;

  const element = doc.createElement('div');
  element.className = 'desk';
  element.style.width = `${width * P}px`;
  element.style.height = `${height * P}px`;
  element.appendChild(canvas);

  let shown = '';
  const content: string[] = new Array(screenW * screenH);
  return {
    element,
    art: canvas,
    width: width * P,
    height: height * P,
    keyboardX: (keysX + keysW / 2) * P,
    below: base * P,
    screen: { x: (monX + mid) * P, y: (surface + stand + faceH / 2) * P },
    show(app, clock) {
      const frame = app === 'idle' ? Math.floor(clock / 250) : Math.floor(clock / (1000 / SCREEN_FPS));
      const key = `${app}|${frame}`;
      if (key === shown || !ctx) return;
      shown = key;
      paintScreen(app, clock, screenW, screenH, content);
      for (let i = scr.x0; i <= scr.x1; i++) {
        const top = screenTop(i);
        const cx = i - scr.x0;
        for (let y = 0; y < screenH; y++) px(monX + i, top + y, content[y * screenW + cx]!);
      }
    },
  };
}

/** Pseudo-random but steady numbers, for text that doesn't flicker. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A line of "text": words of a few pixels with gaps, `length` pixels long at most. */
function textAt(line: number, x: number, length: number): boolean {
  if (x >= length) return false;
  let at = 0;
  for (let w = 0; at < length; w++) {
    const word = 1 + Math.floor(hash(line * 31 + w) * 4);
    if (x >= at && x < at + word) return true;
    at += word + 1;
  }
  return false;
}

/** Draws `app` into `out` (row by row, `w` by `h` colours). */
function paintScreen(app: DeskApp, clock: number, w: number, h: number, out: string[]): void {
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = c;
  };
  const fill = (c: string) => out.fill(c);
  const t = clock / 1000;
  switch (app) {
    case 'idle': {
      // A screen saver: a dot drifting about a dark screen.
      fill('#10141c');
      const x = Math.round((Math.sin(t * 0.7) * 0.5 + 0.5) * (w - 2));
      const y = Math.round((Math.sin(t * 1.1 + 1) * 0.5 + 0.5) * (h - 2));
      set(x, y, '#5a9e7c');
      set(x + 1, y, '#5a9e7c');
      return;
    }
    case 'terminal': {
      // Lines of green and grey text scrolling up as he types, a prompt at the start of
      // each command and a blinking cursor at the end of the one he's on.
      fill('#12161d');
      const rate = 9;
      const typed = Math.floor(t * rate);
      const lineLen = (i: number) => 3 + Math.floor(hash(i) * (w - 4));
      let line = 0;
      let left = typed;
      while (left > lineLen(line)) left -= lineLen(line++);
      const rows = Math.floor((h - 1) / 2);
      for (let row = 0; row < rows; row++) {
        const i = line - (rows - 1 - row);
        if (i < 0) continue;
        const y = 1 + row * 2;
        const len = i === line ? left : lineLen(i);
        const command = hash(i * 7) < 0.4;
        if (command) set(0, y, '#ffd84a');
        for (let x = 0; x < w - 2; x++) if (textAt(i, x, len)) set(x + (command ? 2 : 0), y, command ? '#e8e4da' : '#7fe0a8');
        if (i === line && Math.floor(t * 2.5) % 2 === 0) set(Math.min(w - 1, len + (command ? 2 : 0)), y, '#e8e4da');
      }
      return;
    }
    case 'web': {
      // A web page: the address bar, then a picture and paragraphs, scrolling slowly by.
      fill('#f4f1ea');
      const scroll = Math.floor(t * 1.2);
      for (let y = 2; y < h; y++) {
        const row = y - 2 + scroll;
        const block = Math.floor(row / 8);
        const inBlock = row % 8;
        const picture = hash(block * 13) < 0.45;
        for (let x = 0; x < w; x++) {
          if (picture && inBlock < 5 && x >= 1 && x < Math.ceil(w * 0.55)) {
            // A picture: sky over grass, with a sun.
            const sun = x === 3 && inBlock === 1;
            set(x, y, sun ? '#ffd84a' : inBlock < 3 ? '#9cc8ee' : '#7cbf6e');
          } else if (inBlock % 2 === 1 && textAt(row, x - 1, w - 2) && x >= 1) {
            set(x, y, row % 8 === 1 ? '#4d6fd6' : '#a7a196');
          }
        }
      }
      // The address bar and the tabs.
      for (let x = 0; x < w; x++) {
        set(x, 0, '#5b6ee0');
        set(x, 1, x > 1 && x < w - 2 ? '#e9ecf8' : '#5b6ee0');
      }
      return;
    }
    case 'reels': {
      // Short videos, one after another: a bright card in the middle of a dark screen,
      // flicked away upwards for the next, with a heart and a caption.
      fill('#0c0c11');
      const every = REEL_MS / 1000;
      const n = Math.floor(t / every);
      const into = (t / every) % 1;
      const swipe = into > 0.86 ? (into - 0.86) / 0.14 : 0;
      const cw = Math.max(5, Math.round(h * 0.56));
      const x0 = Math.floor((w - cw) / 2);
      const palettes = [
        ['#ff8fa6', '#ffd84a'],
        ['#7fe0a8', '#5b6ee0'],
        ['#ffb36b', '#e2435a'],
        ['#9cc8ee', '#ffffff'],
        ['#c59cf0', '#ffd84a'],
      ];
      for (const [k, offset] of [
        [n, -Math.round(swipe * h)],
        [n + 1, h - Math.round(swipe * h)],
      ] as const) {
        const [bg, blob] = palettes[Math.floor(hash(k) * palettes.length)]!;
        const bounce = Math.round(Math.sin(t * 6 + k) * 1);
        for (let y = 0; y < h; y++) {
          const yy = y + offset;
          if (yy < 0 || yy >= h) continue;
          for (let x = x0; x < x0 + cw; x++) {
            const dx = x - (x0 + cw / 2 - 0.5);
            const dy = y - (h * 0.45 + bounce);
            set(x, yy, dx * dx + dy * dy < (cw * cw) / 7 ? blob! : bg!);
          }
          // The caption.
          if (y === h - 2) for (let x = x0 + 1; x < x0 + cw - 2; x++) set(x, yy, '#ffffff');
        }
      }
      // The heart, beside the card.
      const hx = x0 + cw + 1;
      const hy = Math.round(h * 0.55);
      for (const [x, y] of [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]] as const) set(hx + x, hy + y, '#ff4d6d');
      return;
    }
  }
}
