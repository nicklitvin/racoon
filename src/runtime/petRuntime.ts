import type { DisplayInfo, Point, Rect } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import { CursorActivityTracker } from '../core/activity/cursor';
import { TypingActivityTracker } from '../core/activity/typing';
import { Animator } from '../core/animator';
import { Brain, type PetSnapshot, type WorldInput } from '../core/behavior/brain';
import { DEFAULT_CONFIG } from '../core/behavior/config';
import { ClickThroughController } from '../core/clickThrough';
import type { Host } from '../host';
import { ANIMATIONS, createSvgRaccoon, type RaccoonRenderer } from '../sprites';

export interface PetElements {
  /** Clip box covering the work area: hides whatever is past the edges or below the floor. */
  stage: HTMLElement;
  /** Positioned by the raccoon's feet. */
  pet: HTMLElement;
  /** Holds the drawing; mirrored to face left. */
  sprite: HTMLElement;
  emote: HTMLElement;
}

/** Longest gap between ticks while nothing moves. Brain timers have this granularity. */
const MAX_REST_MS = 250;
/** Pointer travel that turns a press into a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

interface DragState {
  pointerId: number;
  offset: Point;
  start: Point;
  moved: boolean;
}

/**
 * Glue between the pure logic (brain, animator, trackers) and the DOM. Owns the
 * animation loop: requestAnimationFrame while anything moves, and a slow timer
 * while the raccoon rests, so an idle raccoon costs almost no CPU.
 */
export class PetRuntime {
  private readonly brain: Brain;
  private readonly animator = new Animator(ANIMATIONS);
  private readonly renderer: RaccoonRenderer = createSvgRaccoon();
  private readonly cursorTracker = new CursorActivityTracker();
  private readonly typingTracker = new TypingActivityTracker();
  private readonly clickThrough: ClickThroughController;

  private cursor: Point | null = null;
  private size = { width: 0, height: 0 };
  private lastDrawn = '';
  private lastTransform = '';
  private lastEmote = '';
  private lastFacing = 0;
  private snap: PetSnapshot | null = null;

  private rafId = 0;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;
  private lastTick = 0;
  private running = false;
  private drag: DragState | null = null;
  private keyboardOff: (() => void) | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly host: Host,
    private readonly els: PetElements,
    private display: DisplayInfo,
    private settings: Settings,
  ) {
    this.clickThrough = new ClickThroughController((on) => host.setInteractive(on));
    els.sprite.replaceChildren(this.renderer.element);
    this.applyLayout();
    this.applySettings();
    this.brain = new Brain(this.worldInput(performance.now()));
    this.brain.setSpeed(settings.speed);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    this.cleanups.push(this.host.onCursor((p) => this.onCursor(p)));

    // Mouse moves are forwarded even while the overlay is click-through, which is how
    // we notice the pointer arriving over the raccoon between cursor polls.
    const onMove = (e: MouseEvent) => this.updateHover({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    this.cleanups.push(() => window.removeEventListener('mousemove', onMove));

    const { pet } = this.els;
    const down = (e: PointerEvent) => this.onPointerDown(e);
    const move = (e: PointerEvent) => this.onPointerMove(e);
    const up = (e: PointerEvent) => this.onPointerUp(e);
    const dbl = () => this.host.openSettings();
    pet.addEventListener('pointerdown', down);
    pet.addEventListener('pointermove', move);
    pet.addEventListener('pointerup', up);
    pet.addEventListener('pointercancel', up);
    pet.addEventListener('dblclick', dbl);
    this.cleanups.push(() => {
      pet.removeEventListener('pointerdown', down);
      pet.removeEventListener('pointermove', move);
      pet.removeEventListener('pointerup', up);
      pet.removeEventListener('pointercancel', up);
      pet.removeEventListener('dblclick', dbl);
    });

    this.syncKeyboardSubscription();
    this.lastTick = performance.now();
    this.requestFrame();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.timeoutId);
    this.keyboardOff?.();
    this.keyboardOff = null;
    this.cleanups.splice(0).forEach((off) => off());
    this.host.setInteractive(false);
  }

  setDisplay(display: DisplayInfo): void {
    this.display = display;
    this.applyLayout();
    this.wake();
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.applySettings();
    this.brain.setSpeed(settings.speed);
    this.syncKeyboardSubscription();
    this.wake();
  }

  // ---- Inputs ----------------------------------------------------------------------

  private onCursor(p: Point | null): void {
    const now = performance.now();
    this.cursor = p;
    this.cursorTracker.addSample(now, p);
    if (p) this.updateHover(p);
    else this.clickThrough.pointerLeft();
    // While resting we tick slowly; wake up early only when the cursor matters right now.
    if (this.isResting() && p && (this.cursorTracker.isFrantic(now) || this.isNearPet(p, DEFAULT_CONFIG.reactions.fleeRadius * 1.5))) {
      this.wake();
    }
  }

  private onKeyPulse(): void {
    this.typingTracker.keyDown(performance.now());
    this.animator.keystroke();
    if (this.snap?.animation === 'peek') this.wake();
  }

  private syncKeyboardSubscription(): void {
    const want = this.running && this.settings.keyboardReactions;
    if (want && !this.keyboardOff) {
      this.keyboardOff = this.host.onKeyPulse(() => this.onKeyPulse());
    } else if (!want && this.keyboardOff) {
      this.keyboardOff();
      this.keyboardOff = null;
      this.typingTracker.reset();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this.snap) return;
    this.els.pet.setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    const feet = this.snap.position;
    this.drag = { pointerId: e.pointerId, offset: { x: p.x - feet.x, y: p.y - feet.y }, start: p, moved: false };
    this.clickThrough.dragStarted();
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
      this.brain.grab();
    }
    if (drag.moved) {
      this.brain.dragTo({ x: p.x - drag.offset.x, y: p.y - drag.offset.y });
      this.wake();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.drag = null;
    if (drag.moved) this.brain.release();
    else this.brain.poke();
    this.wake();
    const rect = this.hitRect();
    if (rect) this.clickThrough.dragEnded({ x: e.clientX, y: e.clientY }, rect);
  }

  private updateHover(p: Point): void {
    const rect = this.hitRect();
    // Fully hidden (behind an edge): nothing to grab, so never hold the mouse.
    if (rect) this.clickThrough.pointerMoved(p, rect);
    else this.clickThrough.pointerLeft();
  }

  // ---- Loop --------------------------------------------------------------------------

  private readonly tick = (): void => {
    this.rafId = 0;
    this.timeoutId = undefined;
    if (!this.running) return;

    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;

    this.cursorTracker.evaluate(now);
    this.typingTracker.evaluate(now);
    const snap = this.brain.update(dt, this.worldInput(now));
    this.snap = snap;
    this.animator.play(snap.animation);
    this.animator.update(dt);
    this.render(snap);
    if (this.cursor) this.updateHover(this.cursor);
    this.schedule();
  };

  private schedule(): void {
    if (!this.running) return;
    if (this.isResting()) {
      const delay = Math.min(MAX_REST_MS, Math.max(16, this.animator.msUntilChange()));
      this.timeoutId = setTimeout(this.tick, delay);
    } else {
      this.requestFrame();
    }
  }

  private requestFrame(): void {
    if (!this.rafId) this.rafId = requestAnimationFrame(this.tick);
  }

  /** Switches from the slow resting timer back to per-frame updates. */
  private wake(): void {
    if (!this.running || this.rafId) return;
    clearTimeout(this.timeoutId);
    this.timeoutId = undefined;
    this.requestFrame();
  }

  private isResting(): boolean {
    return !this.drag && (this.snap?.resting ?? false);
  }

  private worldInput(now: number): WorldInput {
    const keyboard = this.settings.keyboardReactions;
    return {
      bounds: this.display.workArea,
      size: this.size,
      cursor: this.cursor,
      cursorExcited: this.cursorTracker.isExcited(now),
      cursorStillMs: this.cursorTracker.stillFor(now),
      typingActive: keyboard && this.typingTracker.isActive,
    };
  }

  // ---- Rendering ---------------------------------------------------------------------

  private render(snap: PetSnapshot): void {
    const { pet, sprite, emote } = this.els;
    const frame = {
      animation: this.animator.animation,
      timeMs: this.animator.time,
      keystrokes: this.animator.keystrokes,
      eyes: this.animator.eyes,
    };
    const key = `${frame.animation}|${frame.timeMs}|${frame.keystrokes}|${frame.eyes}`;
    if (key !== this.lastDrawn) {
      this.renderer.draw(frame);
      this.lastDrawn = key;
    }

    const wa = this.display.workArea;
    const x = Math.round((snap.position.x - wa.x) * 10) / 10;
    const y = Math.round((snap.position.y - wa.y) * 10) / 10;
    const transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    if (transform !== this.lastTransform) {
      pet.style.transform = transform;
      this.lastTransform = transform;
    }
    if (snap.facing !== this.lastFacing) {
      sprite.classList.toggle('facing-left', snap.facing < 0);
      this.lastFacing = snap.facing;
    }
    if (snap.emote !== this.lastEmote) {
      emote.textContent = snap.emote === 'z' ? 'z Z' : snap.emote;
      emote.dataset.emote = snap.emote;
      this.lastEmote = snap.emote;
    }
  }

  private applyLayout(): void {
    const { stage } = this.els;
    const wa = this.display.workArea;
    stage.style.left = `${wa.x}px`;
    stage.style.top = `${wa.y}px`;
    stage.style.width = `${wa.width}px`;
    stage.style.height = `${wa.height}px`;
  }

  private applySettings(): void {
    const { baseSize } = this.renderer;
    this.renderer.setScale(this.settings.size);
    this.size = { width: baseSize.width * this.settings.size, height: baseSize.height * this.settings.size };
    this.cursorTracker.setSensitivity(this.settings.sensitivity);
    this.typingTracker.setSensitivity(this.settings.sensitivity);
  }

  /** The visible part of the raccoon: the drawn figure clipped to the stage. */
  private hitRect(): Rect | null {
    const r = this.renderer.figure.getBoundingClientRect();
    if (r.width === 0) return null;
    const wa = this.display.workArea;
    const left = Math.max(r.left, wa.x);
    const top = Math.max(r.top, wa.y);
    const right = Math.min(r.right, wa.x + wa.width);
    const bottom = Math.min(r.bottom, wa.y + wa.height);
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  private isNearPet(p: Point, radius: number): boolean {
    const rect = this.hitRect();
    if (!rect) return false;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return Math.hypot(p.x - cx, p.y - cy) < radius + Math.max(rect.width, rect.height) / 2;
  }
}
