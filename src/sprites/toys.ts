import { PIXEL_TOY } from './pixel';
import { BLOCK_LETTERS, GLYPHS } from './pixel/glyphs';
import { n, svgWriter } from './svg';
import type { ToyLook } from './types';

/**
 * Wooden alphabet blocks for the pets to play with, drawn to match each art style:
 * painted, outlined like a cartoon, in pen and ink, or in pixels.
 */

/** Each block's paint: the panel, a deeper shade of it, and the letter. */
const BLOCKS = [
  { face: '#e8604f', deep: '#b73d30', letter: '#fff6e6' },
  { face: '#4593d8', deep: '#2b69a8', letter: '#fff6e6' },
  { face: '#f3b833', deep: '#c58b14', letter: '#fff6e6' },
  { face: '#5dba62', deep: '#3a8a40', letter: '#fff6e6' },
];
const WOOD = { light: '#f6dcae', mid: '#e7bf83', dark: '#a8774a' };

export interface ToyDrawing {
  /** Centred on the block, at its size on screen. */
  readonly element: Element;
  /** Tumbles it over to `angle` degrees (clockwise). */
  draw(angle: number): void;
}

/** How much bigger the drawing's box is than the block, so its corners have room to tumble. */
export const TOY_BOX = 1.5;

export function createToyDrawing(doc: Document, look: ToyLook, face: number, size: number): ToyDrawing {
  return look === 'pixel' ? pixelBlock(doc, look, face, size) : vectorBlock(doc, look, face, size);
}

function vectorBlock(doc: Document, look: ToyLook, face: number, size: number): ToyDrawing {
  const { make, set } = svgWriter(doc);
  const paint = BLOCKS[face % BLOCKS.length]!;
  const half = 9 * TOY_BOX;
  const svg = make('svg', {
    class: `toy-art toy-${look}`,
    viewBox: `${-half} ${-half} ${half * 2} ${half * 2}`,
    width: n(size * TOY_BOX),
    height: n(size * TOY_BOX),
    'aria-hidden': 'true',
  });
  const g = make('g', {}, svg);
  const ink = look === 'ink';
  const line = look === 'chibi' ? '#2b2630' : ink ? '#1f1d22' : WOOD.dark;
  const lineWidth = look === 'chibi' ? 1.7 : ink ? 0.9 : 0.8;
  make('rect', { x: -9, y: -9, width: 18, height: 18, rx: 2.6, fill: ink ? '#fffdf8' : WOOD.mid, stroke: line, 'stroke-width': lineWidth }, g);
  if (!ink) {
    // The lit top edge and shaded bottom of the wood.
    make('path', { d: 'M-7.6,-8.2 H7.6', stroke: WOOD.light, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, g);
    make('path', { d: 'M-7.4,8.1 H7.4', stroke: WOOD.dark, 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.6 }, g);
  }
  make('rect', { x: -6.2, y: -6.2, width: 12.4, height: 12.4, rx: 1.4, fill: ink ? 'none' : paint.face, stroke: ink ? line : paint.deep, 'stroke-width': ink ? 0.7 : 0.6 }, g);
  const letter = make('text', {
    x: 0,
    y: 4.1,
    'text-anchor': 'middle',
    'font-size': 11.5,
    'font-weight': 800,
    'font-family': "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
    fill: ink ? 'none' : paint.letter,
    stroke: ink ? line : 'none',
    'stroke-width': ink ? 0.7 : 0,
  }, g);
  letter.textContent = BLOCK_LETTERS[face % BLOCK_LETTERS.length]!;
  return {
    element: svg,
    draw(angle) {
      set(g, 'transform', `rotate(${n(angle)})`);
    },
  };
}

/** Pixel blocks: 9 pixels square, turned by whole pixels (nearest neighbour), so they stay pixel art. */
function pixelBlock(doc: Document, look: ToyLook, face: number, size: number): ToyDrawing {
  const N = PIXEL_TOY;
  const S = Math.ceil(N * TOY_BOX);
  const canvas = doc.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  canvas.className = `toy-art toy-${look}`;
  canvas.style.width = `${size * (S / N)}px`;
  canvas.style.height = `${size * (S / N)}px`;
  const paint = BLOCKS[face % BLOCKS.length]!;
  // 1 outline, 2 panel, 3 lit edge, 4 shaded edge, 5 letter.
  const colours = ['', '#2a1f2d', paint.face, lighten(paint.face), paint.deep, paint.letter];
  const glyph = GLYPHS[BLOCK_LETTERS[face % BLOCK_LETTERS.length]!];
  const art: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      const corner = (x === 0 || x === N - 1) && (y === 0 || y === N - 1);
      let c = corner ? 0 : edge ? 1 : y === 1 || x === 1 ? 3 : y === N - 2 || x === N - 2 ? 4 : 2;
      // The letter in the middle, clear of the lit and shaded edges.
      const gx = x - 3;
      const gy = y - 2;
      if (gy >= 0 && gy < glyph.length && gx >= 0 && gx < glyph[0]!.length && glyph[gy]![gx] === '#') c = 5;
      row.push(c);
    }
    art.push(row);
  }
  const ctx = canvas.getContext?.('2d') ?? null;
  let shown = NaN;
  return {
    element: canvas,
    draw(angle) {
      // Turned in steps, as a sprite would be.
      const step = Math.round(angle / 15) * 15;
      if (step === shown || !ctx) return;
      shown = step;
      ctx.clearRect(0, 0, S, S);
      const a = (-step * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const dx = x + 0.5 - S / 2;
          const dy = y + 0.5 - S / 2;
          const u = Math.floor(dx * c - dy * s + N / 2);
          const v = Math.floor(dx * s + dy * c + N / 2);
          const idx = art[v]?.[u];
          if (!idx) continue;
          ctx.fillStyle = colours[idx]!;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    },
  };
}

function lighten(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.35);
  return `#${[(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`;
}
