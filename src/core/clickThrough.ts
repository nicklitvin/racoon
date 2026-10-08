import { inflate, pointInRect, type Point, type Rect } from './geometry';

/**
 * Decides when the pet window should capture the mouse.
 *
 * The window is click-through until the pointer is over the raccoon (plus a
 * small margin so it's easy to grab), and stays interactive for the whole of
 * a drag even if the pointer outruns the sprite. `apply` only fires on change,
 * so it's cheap to call on every mousemove.
 */
export class ClickThroughController {
  private hovering = false;
  private dragging = false;
  private interactive = false;

  constructor(
    private readonly apply: (interactive: boolean) => void,
    private readonly margin = 6,
  ) {}

  pointerMoved(pointer: Point, target: Rect): void {
    this.hovering = pointInRect(pointer, inflate(target, this.margin));
    this.sync();
  }

  pointerLeft(): void {
    this.hovering = false;
    this.sync();
  }

  dragStarted(): void {
    this.dragging = true;
    this.sync();
  }

  dragEnded(pointer: Point | null, target: Rect): void {
    this.dragging = false;
    this.hovering = pointer !== null && pointInRect(pointer, inflate(target, this.margin));
    this.sync();
  }

  get isInteractive(): boolean {
    return this.interactive;
  }

  private sync(): void {
    const next = this.hovering || this.dragging;
    if (next === this.interactive) return;
    this.interactive = next;
    this.apply(next);
  }
}
