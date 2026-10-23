import type { Point, Rect } from '../../shared/ipc';
import type { Bin } from '../core/behavior/brain';
import type { BinSpot } from '../core/toys/toybox';
import { createBinDrawing, type BinDrawing } from '../sprites/bin';

/** Where the can stands: this far across the screen from the left, and this far up off the bottom. */
const ACROSS = 0.2;
const UP_PX = 46;

export interface BinFit {
  /** Work area, screen px. */
  bounds: Rect;
  /** The floor he stands on, screen px (his feet's lowest y). */
  floor: number;
  /** Px per art pixel. */
  pixel: number;
}

/**
 * The raccoon's trash can on the page, in play mode: its back behind him, and its front in
 * front of him while he's in it or behind it. It rattles while he digs about in it. You
 * can't pick it up: the pointer goes straight through it.
 */
export class BinLayer {
  private drawing: BinDrawing | null = null;
  private pixel = 0;
  /** The middle of its base, screen px, and the stage's top left. */
  private at: Point = { x: 0, y: 0 };
  private origin: Point = { x: 0, y: 0 };
  private lastFront = '';
  private lastTransform = '';

  constructor(
    private readonly doc: Document,
    private readonly stage: HTMLElement,
  ) {}

  /** Puts the can out, at the pets' pixel size, and says where it is. Null puts it away. */
  fit(fit: BinFit | null): Bin | null {
    if (!fit) {
      this.remove();
      return null;
    }
    const { bounds, floor, pixel } = fit;
    if (!this.drawing || pixel !== this.pixel) {
      this.remove();
      this.pixel = pixel;
      const d = createBinDrawing(this.doc, pixel);
      d.back.classList.add('bin-back');
      d.front.classList.add('bin-front');
      this.stage.append(d.back, d.front);
      this.drawing = d;
    }
    const d = this.drawing;
    this.origin = { x: bounds.x, y: bounds.y };
    this.at = { x: Math.round(bounds.x + Math.max(d.width, bounds.width * ACROSS)), y: Math.round(floor - UP_PX) };
    this.lastTransform = '';
    this.place(0);
    return { at: { ...this.at }, halfWidth: d.halfWidth, rim: d.rim };
  }

  /**
   * The can's base on the floor, for the toy blocks to bounce off and drop into: seen from a
   * little above, it reaches back about half as far as it's wide.
   */
  spot(): BinSpot | null {
    const d = this.drawing;
    return d ? { x: this.at.x, y: this.at.y, halfWidth: d.halfWidth * 0.85, depth: d.halfWidth * 0.5, rim: d.rim } : null;
  }

  /** In front of him while he's in it or behind it; rattling about while he digs in it. */
  update(petFeet: Point, inside: boolean, digging: boolean, clock: number): void {
    const d = this.drawing;
    if (!d) return;
    const front = inside || petFeet.y < this.at.y - 1 ? '3' : '1';
    if (front !== this.lastFront) {
      d.front.style.zIndex = front;
      this.lastFront = front;
    }
    // A wobble on its base, now this way, now that.
    this.place(digging ? Math.round(Math.sin(clock / 70) * 2 + Math.sin(clock / 23)) : 0);
  }

  destroy(): void {
    this.remove();
  }

  /** Stands it on the floor, tipped `degrees` on its base. */
  private place(degrees: number): void {
    const d = this.drawing;
    if (!d) return;
    const left = this.at.x - this.origin.x - d.base.x;
    const top = this.at.y - this.origin.y - d.base.y;
    const transform = `translate(${left}px, ${top}px) rotate(${degrees}deg)`;
    if (transform === this.lastTransform) return;
    this.lastTransform = transform;
    for (const canvas of [d.back, d.front]) {
      canvas.style.transformOrigin = `${d.base.x}px ${d.base.y}px`;
      canvas.style.transform = transform;
    }
  }

  private remove(): void {
    this.drawing?.back.remove();
    this.drawing?.front.remove();
    this.drawing = null;
    this.lastFront = '';
    this.lastTransform = '';
  }
}
