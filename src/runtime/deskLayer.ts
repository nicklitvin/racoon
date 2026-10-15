import type { Point, Rect } from '../../shared/ipc';
import type { Desk } from '../core/behavior/brain';
import { createDeskDrawing, type DeskApp, type DeskDrawing } from '../sprites/desk';

/** Pointer travel that stops a press on the desk counting as a tap. */
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
}

/**
 * The work-mode desk on the page, in the bottom right corner, behind the pet. Tap it and
 * the brain hears about it; a few quick taps send him to work.
 */
export class DeskLayer {
  private drawing: DeskDrawing | null = null;
  private key = '';
  private press: { pointerId: number; start: Point } | null = null;

  constructor(
    private readonly doc: Document,
    private readonly stage: HTMLElement,
    private readonly onTap: () => void,
  ) {}

  /**
   * Puts the desk out, built to fit him, and says where he sits at it. Null puts it away.
   */
  fit(fit: DeskFit | null): Desk | null {
    if (!fit) {
      this.remove();
      return null;
    }
    const { bounds, floor, unit, reach, mouse, pixel } = fit;
    const key = `${unit.toFixed(1)}|${reach.x.toFixed(1)}|${reach.y.toFixed(1)}|${mouse.x.toFixed(1)}|${pixel}`;
    if (key !== this.key || !this.drawing) {
      this.remove();
      this.key = key;
      this.drawing = createDeskDrawing(this.doc, unit, -reach.y, mouse.x - reach.x, pixel);
      this.listen(this.drawing);
      this.stage.appendChild(this.drawing.element);
    }
    const d = this.drawing;
    // In the bottom right corner, standing on his floor.
    const left = Math.round(bounds.x + bounds.width - MARGIN_PX - d.width);
    const top = Math.round(floor - d.height + d.below);
    d.element.style.transform = `translate(${left - bounds.x}px, ${top - bounds.y}px)`;
    const keys = left + d.keyboardX;
    return {
      seat: { x: keys - reach.x, y: floor },
      facing: 1,
      screen: { x: left + d.screen.x, y: floor - d.screen.y },
    };
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
    this.drawing?.element.remove();
    this.drawing = null;
    this.key = '';
  }

  private listen(d: DeskDrawing): void {
    const el = d.element;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.press = { pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY } };
    });
    el.addEventListener('pointerup', (e) => {
      const press = this.press;
      this.press = null;
      if (!press || press.pointerId !== e.pointerId) return;
      if (Math.hypot(e.clientX - press.start.x, e.clientY - press.start.y) > TAP_PX) return;
      // A little jolt, so you can see it felt the tap.
      el.classList.remove('tapped');
      void el.offsetWidth;
      el.classList.add('tapped');
      this.onTap();
    });
    el.addEventListener('pointercancel', () => (this.press = null));
  }
}
