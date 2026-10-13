import { inflate, pointInRect, type Point, type Rect } from './geometry';

/**
 * Decides when the pet window should capture the mouse.
 *
 * The window is click-through until the pointer is over the raccoon or one of his toys
 * (plus a small margin so they're easy to grab), and stays interactive for the whole of
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

  pointerMoved(pointer: Point, targets: Rect | readonly Rect[]): void {
    this.hovering = this.over(pointer, targets);
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

  dragEnded(pointer: Point | null, targets: Rect | readonly Rect[]): void {
    this.dragging = false;
    this.hovering = pointer !== null && this.over(pointer, targets);
    this.sync();
  }

  get isInteractive(): boolean {
    return this.interactive;
  }

  private over(pointer: Point, targets: Rect | readonly Rect[]): boolean {
    const list: readonly Rect[] = Array.isArray(targets) ? targets : [targets as Rect];
    return list.some((target) => pointInRect(pointer, inflate(target, this.margin)));
  }

  private sync(): void {
    const next = this.hovering || this.dragging;
    if (next === this.interactive) return;
    this.interactive = next;
    this.apply(next);
  }
}
