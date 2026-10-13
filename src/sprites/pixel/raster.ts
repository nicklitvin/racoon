/**
 * A tiny pixel canvas of palette indices (0 is transparent), and shapes to fill it with.
 * Shapes are signed distance functions sampled at each pixel's centre: inside is filled,
 * the pixels just outside get a one-pixel outline. Nothing is anti-aliased, so every pixel
 * is one of the palette's colours, as in hand-made pixel art.
 */

/** Signed distance from a shape's edge, in pixels: negative inside. */
export type Sd = (x: number, y: number) => number;

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** How a shape is filled: one colour, or a colour for each pixel (0 leaves it alone). */
export type Fill = number | ((x: number, y: number) => number);

export interface Shade {
  /** Colour along the lit (top) edge, and the shaded (bottom) edge. */
  light: number;
  dark: number;
}

export class Raster {
  readonly data: Uint8Array;
  /** Rows below this aren't drawn (under the water). */
  clipBelow = Infinity;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height);
  }

  clear(): void {
    this.data.fill(0);
    this.clipBelow = Infinity;
  }

  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? 0 : this.data[y * this.width + x]!;
  }

  set(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || y >= this.clipBelow) return;
    this.data[y * this.width + x] = c;
  }

  /**
   * Fills a shape, with a one-pixel outline round it (over whatever is already there, so
   * overlapping parts stay separate) unless `outline` is null. `shade` lights the top edge
   * and shades the bottom one of a shape filled with one colour. `outlineWhere` limits the
   * outline to some pixels.
   */
  shape(sd: Sd, box: Box, fill: Fill, outline: number | null, shade?: Shade, outlineWhere?: (x: number, y: number) => boolean): void {
    const x0 = Math.max(0, Math.floor(box.x0) - 2);
    const y0 = Math.max(0, Math.floor(box.y0) - 2);
    const x1 = Math.min(this.width - 1, Math.ceil(box.x1) + 2);
    const y1 = Math.min(this.height - 1, Math.ceil(box.y1) + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const d = sd(cx, cy);
        if (d <= 0) {
          let c = typeof fill === 'number' ? fill : fill(cx, cy);
          if (shade && typeof fill === 'number') {
            if (sd(cx + 0.4, cy - 1.6) > 0) c = shade.light;
            else if (sd(cx - 0.6, cy + 1.8) > 0) c = shade.dark;
          }
          if (c) this.set(x, y, c);
        } else if (outline !== null && d <= 1 && (!outlineWhere || outlineWhere(cx, cy))) {
          this.set(x, y, outline);
        }
      }
    }
  }

  /** Sets single pixels, rounding each point to the pixel it falls in. */
  dots(points: Pt[], c: number): void {
    for (const p of points) this.set(Math.floor(p.x), Math.floor(p.y), c);
  }

  /** A little bitmap (rows of '#' and '.'), with a one-pixel outline round it on empty pixels. */
  stamp(rows: readonly string[], x: number, y: number, fill: number, outline: number | null): void {
    const ox = Math.round(x - rows[0]!.length / 2);
    const oy = Math.round(y - rows.length / 2);
    if (outline !== null) {
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i++) {
          if (row[i] !== '#') continue;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.get(ox + i + dx, oy + j + dy) === 0) this.set(ox + i + dx, oy + j + dy, outline);
        }
      });
    }
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') this.set(ox + i, oy + j, fill);
    });
  }

  /** Mirrors the picture left to right about column `about` (between pixels). */
  mirror(about: number): void {
    const { width, height, data } = this;
    const copy = data.slice();
    data.fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const mx = Math.round(2 * about - x - 1);
        if (mx >= 0 && mx < width) data[y * width + mx] = copy[y * width + x]!;
      }
    }
  }

  /** The box round every coloured pixel, or null if there are none. */
  bounds(skip?: (c: number) => boolean): Box | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const c = this.data[y * this.width + x]!;
        if (!c || skip?.(c)) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x0 === Infinity ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
}

// --- Shapes ---

/** An ellipse turned by `angle` radians (clockwise on screen). Distance is approximate but good near the edge. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, angle = 0): { sd: Sd; box: Box } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ax = Math.max(0.3, Math.abs(rx));
  const ay = Math.max(0.3, Math.abs(ry));
  const sd: Sd = (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * c + dy * s;
    const v = -dx * s + dy * c;
    const k0 = Math.hypot(u / ax, v / ay);
    const k1 = Math.hypot(u / (ax * ax), v / (ay * ay));
    return k1 === 0 ? -Math.min(ax, ay) : (k0 * (k0 - 1)) / k1;
  };
  const r = Math.max(ax, ay);
  return { sd, box: { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r } };
}

/** A stroke from a to b with round ends, radius ra at a and rb at b. */
export function capsule(a: Pt, b: Pt, ra: number, rb = ra): { sd: Sd; box: Box } {
  const bx = b.x - a.x;
  const by = b.y - a.y;
  const l2 = bx * bx + by * by;
  const sd: Sd = (x, y) => {
    const px = x - a.x;
    const py = y - a.y;
    const h = l2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / l2));
    return Math.hypot(px - bx * h, py - by * h) - (ra + (rb - ra) * h);
  };
  const r = Math.max(ra, rb);
  return { sd, box: { x0: Math.min(a.x, b.x) - r, y0: Math.min(a.y, b.y) - r, x1: Math.max(a.x, b.x) + r, y1: Math.max(a.y, b.y) + r } };
}

/** A filled polygon. */
export function polygon(pts: Pt[]): { sd: Sd; box: Box } {
  const sd: Sd = (x, y) => {
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[j]!;
      const b = pts[i]!;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const wx = x - a.x;
      const wy = y - a.y;
      const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
      d = Math.min(d, Math.hypot(wx - ex * h, wy - ey * h));
      if (a.y > y !== b.y > y && x < a.x + ((y - a.y) / (b.y - a.y)) * ex) inside = !inside;
    }
    return inside ? -d : d;
  };
  return { sd, box: boxOf(pts) };
}

/** A tube along a path, its radius varying along it: a tail. `at` says how far along (0..1) a pixel is. */
export function tube(spine: Pt[], radii: number[]): { sd: Sd; box: Box; at: (x: number, y: number) => number } {
  const parts = spine.slice(1).map((p, i) => capsule(spine[i]!, p, radii[i]!, radii[i + 1]!));
  const sd: Sd = (x, y) => {
    let d = Infinity;
    for (const part of parts) d = Math.min(d, part.sd(x, y));
    return d;
  };
  const at = (x: number, y: number) => {
    let best = 0;
    let bestD = Infinity;
    parts.forEach((part, i) => {
      const d = part.sd(x, y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return (best + 0.5) / parts.length;
  };
  const r = Math.max(...radii);
  const box = boxOf(spine);
  return { sd, at, box: { x0: box.x0 - r, y0: box.y0 - r, x1: box.x1 + r, y1: box.y1 + r } };
}

export const union = (...sds: Sd[]): Sd => (x, y) => Math.min(...sds.map((f) => f(x, y)));
export const intersect = (...sds: Sd[]): Sd => (x, y) => Math.max(...sds.map((f) => f(x, y)));

export function boxOf(pts: Pt[]): Box {
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    y0: Math.min(...pts.map((p) => p.y)),
    x1: Math.max(...pts.map((p) => p.x)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

export function joinBoxes(...boxes: Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}
