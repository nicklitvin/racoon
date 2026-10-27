import type { Point, Rect } from '../../shared/ipc';
import type { Desk } from '../core/behavior/brain';
import { createDeskDrawing, type DeskApp, type DeskDrawing } from '../sprites/desk';

/** Pointer travel that turns a press on the desk into picking it up, rather than a tap. */
const TAP_PX = 6;
/** Gap between the desk and the edges of the screen. */
const MARGIN_PX = 18;

export interface DeskFit {
  /** Work area, screen px. */
  bounds: Rect;
  /** The floor he stands on, screen px (his feet's lowest y). */
  floor: number;
  /** His height above the feet, px. */
  unit: number;
  /** Where his paws come down on a keyboard, and where one goes on the mouse, from his feet facing right, px. */
  reach: Point;
  mouse: Point;
  /** Px per art pixel. */
  pixel: number;
  /** Furthest left his feet can go, screen px: the desk keeps his seat at it on screen. */
  minSeatX: number;
}

export interface DeskHooks {
  tapped(): void;
  /** You picked it up. */
  lifted(): void;
  /** You're carrying it about (where he sits at it has moved). */
  moved(): void;
  /** You put it down (or it was put away while you had it). */
  dropped(pointer: Point): void;
}

interface Press {
  pointerId: number;
  start: Point;
  /** The desk's corner (left edge, floor) from the pointer when it was pressed. */
  offset: Point;
  lifted: boolean;
}

/**
 * The work-mode desk on the page, in the bottom right corner to start with, behind the pet
 * (or in front of him, when he's further back). Tap it and the brain hears about it; pick
 * it up and you can put it anywhere on the screen, and he goes over to it there.
 */
export class DeskLayer {
  private drawing: DeskDrawing | null = null;
  private key = '';
  private press: Press | null = null;
  private fitted: DeskFit | null = null;
  /** Where you've put it (its left edge and the floor under it, screen px), or null for its corner. */
  private place: Point | null = null;
  /** Where it is now: left edge and floor. */
  private at: Point = { x: 0, y: 0 };
  private depth = '';

  constructor(
    private readonly doc: Document,
    private readonly stage: HTMLElement,
    private readonly hooks: DeskHooks,
  ) {}

  /** You're carrying it about. */
  get dragging(): boolean {
    return this.press?.lifted === true;
  }

  /**
   * Puts the desk out, built to fit him, and says where he sits at it. Null puts it away.
   */
  fit(fit: DeskFit | null): Desk | null {
    if (!fit) {
      this.remove();
      this.fitted = null;
      return null;
    }
    const { unit, reach, mouse, pixel } = fit;
    this.fitted = fit;
    const key = `${unit.toFixed(1)}|${reach.x.toFixed(1)}|${reach.y.toFixed(1)}|${mouse.x.toFixed(1)}|${pixel}`;
    if (key !== this.key || !this.drawing) {
      this.remove();
      this.key = key;
      this.drawing = createDeskDrawing(this.doc, unit, -reach.y, mouse.x - reach.x, pixel);
      this.listen(this.drawing);
      this.stage.appendChild(this.drawing.element);
    }
    return this.put();
  }

  /**
   * Stands it where you put it (kept on the screen, with room for him at it), or in its
   * corner; says where he sits at it there.
   */
  private put(): Desk | null {
    const d = this.drawing;
    const fit = this.fitted;
    if (!d || !fit) return null;
    const { bounds, floor, unit, reach } = fit;
    // In the bottom right corner, standing on his floor, unless you've put it somewhere.
    const corner = { x: bounds.x + bounds.width - MARGIN_PX - d.width, y: floor };
    const want = this.place ?? corner;
    const minLeft = Math.max(bounds.x + MARGIN_PX, fit.minSeatX - d.keyboardX + reach.x);
    const minFloor = bounds.y + Math.max(d.height - d.below, unit) + MARGIN_PX;
    const left = Math.round(Math.min(Math.max(want.x, minLeft), corner.x));
    const base = Math.round(Math.min(Math.max(want.y, minFloor), floor));
    this.at = { x: left, y: base };
    const top = base - d.height + d.below;
    d.element.style.transform = `translate(${left - bounds.x}px, ${top - bounds.y}px)`;
    const keys = left + d.keyboardX;
    return {
      seat: { x: keys - reach.x, y: base },
      facing: 1,
      screen: { x: left + d.screen.x, y: base - d.screen.y },
    };
  }

  /**
   * In front of him or behind, by which of them is nearer you (lower on the screen); in
   * your hand, in front of everything.
   */
  setDepth(petFeet: Point): void {
    const el = this.drawing?.element;
    if (!el) return;
    const depth = this.dragging ? 'held' : petFeet.y < this.at.y - 3 ? 'front' : 'back';
    if (depth === this.depth) return;
    this.depth = depth;
    el.style.zIndex = depth === 'held' ? '4' : depth === 'front' ? '3' : '';
    el.classList.toggle('held', depth === 'held');
  }

  /** What's on the screen: whatever he's doing at it, or a screen saver. */
  show(app: DeskApp, clock: number): void {
    this.drawing?.show(app, clock);
  }

  /** The desk on screen, for deciding when the window should take the mouse. */
  rect(): Rect | null {
    const r = this.drawing?.element.getBoundingClientRect();
    return r && r.width > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }

  destroy(): void {
    this.remove();
  }

  private remove(): void {
    const press = this.press;
    this.press = null;
    if (press?.lifted) this.hooks.dropped(press.start);
    this.drawing?.element.remove();
    this.drawing = null;
    this.key = '';
    this.depth = '';
  }

  private listen(d: DeskDrawing): void {
    const el = d.element;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.press) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY };
      this.press = { pointerId: e.pointerId, start, offset: { x: this.at.x - start.x, y: this.at.y - start.y }, lifted: false };
    });
    el.addEventListener('pointermove', (e) => {
      const press = this.press;
      if (!press || press.pointerId !== e.pointerId) return;
      const p = { x: e.clientX, y: e.clientY };
      if (!press.lifted) {
        if (Math.hypot(p.x - press.start.x, p.y - press.start.y) <= TAP_PX) return;
        press.lifted = true;
        this.hooks.lifted();
      }
      this.place = { x: p.x + press.offset.x, y: p.y + press.offset.y };
      this.hooks.moved();
    });
    const up = (e: PointerEvent) => {
      const press = this.press;
      if (!press || press.pointerId !== e.pointerId) return;
      this.press = null;
      const p = { x: e.clientX, y: e.clientY };
      if (press.lifted) {
        // Where it ended up, kept on the screen.
        this.place = { ...this.at };
        this.hooks.dropped(p);
        return;
      }
      if (e.type === 'pointercancel') return;
      // A little jolt, so you can see it felt the tap.
      el.classList.remove('tapped');
      void el.offsetWidth;
      el.classList.add('tapped');
      this.hooks.tapped();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}
