import type { DisplayInfo, Point, Rect } from '../../shared/ipc';
import type { RaccoonType, Settings } from '../../shared/settings';
import { CursorActivityTracker } from '../core/activity/cursor';
import { TypingActivityTracker } from '../core/activity/typing';
import { Animator } from '../core/animator';
import { Brain, type PetSnapshot, type WorldInput } from '../core/behavior/brain';
import { DEFAULT_CONFIG } from '../core/behavior/config';
import { ClickThroughController } from '../core/clickThrough';
import { isTurning, targetHeading, turnTowards } from '../core/heading';
import type { Host } from '../host';
import { ANIMATIONS, RACCOON_STYLES, type RaccoonRenderer } from '../sprites';

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
/**
 * Screen size (longer side, px) that activity thresholds are tuned for. Smaller screens,
 * like phones, get proportionally more sensitive so a finger swipe counts as "fast".
 */
const REFERENCE_SCREEN_PX = 1600;
/** Raccoon scale on screens much narrower than a desktop. */
const SMALL_SCREEN_SCALE = 0.8;

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
  private renderer!: RaccoonRenderer;
  private rendererType: RaccoonType | null = null;
  private readonly cursorTracker = new CursorActivityTracker();
  private readonly typingTracker = new TypingActivityTracker();
  private readonly clickThrough: ClickThroughController;

  private cursor: Point | null = null;
  /** Brain-facing size: the part of the drawing above the feet. */
  private size = { width: 0, height: 0 };
  /** How far the drawing reaches below the feet, in px. */
  private belowFeet = 0;
  private lastDrawn = '';
  private lastTransform = '';
  private lastEmote = '';
  private lastFacing = 0;
  /** Ground direction for renderers that turn themselves; starts three-quarters towards you. */
  private heading = 0.6;
  private headingTarget = 0.6;
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
    this.applySettings();
    this.applyLayout();
    this.brain = new Brain(this.worldInput(performance.now()));
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
    pet.addEventListener('pointerdown', down);
    pet.addEventListener('pointermove', move);
    pet.addEventListener('pointerup', up);
    pet.addEventListener('pointercancel', up);
    this.cleanups.push(() => {
      pet.removeEventListener('pointerdown', down);
      pet.removeEventListener('pointermove', move);
      pet.removeEventListener('pointerup', up);
      pet.removeEventListener('pointercancel', up);
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
    if (drag.moved) {
      this.brain.release();
    } else {
      this.brain.poke();
      this.spawnHearts();
    }
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
    this.headingTarget = targetHeading(this.heading, snap);
    this.heading = turnTowards(this.heading, this.headingTarget, dt);
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
    const turning = this.renderer.turnsItself && isTurning(this.heading, this.headingTarget);
    return !this.drag && !turning && (this.snap?.resting ?? false);
  }

  private worldInput(now: number): WorldInput {
    const keyboard = this.settings.keyboardReactions;
    const wa = this.display.workArea;
    return {
      // Drawings that reach below the feet (a top-down raccoon facing you) stop short of the bottom edge.
      bounds: { ...wa, height: wa.height - this.belowFeet },
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
      heading: this.heading,
    };
    const turns = this.renderer.turnsItself === true;
    const key = `${frame.animation}|${frame.timeMs}|${frame.keystrokes}|${frame.eyes}|${turns ? this.heading.toFixed(3) : ''}`;
    if (key !== this.lastDrawn) {
      this.renderer.draw(frame);
      this.lastDrawn = key;
    }

    const wa = this.display.workArea;
    const x = Math.round((snap.position.x - wa.x) * 10) / 10;
    const y = Math.round((snap.position.y - wa.y) * 10) / 10;
    const anchor = this.renderer.anchor ?? { x: 0.5, y: 1 };
    const transform = `translate3d(${x}px, ${y}px, 0) translate(${-anchor.x * 100}%, ${-anchor.y * 100}%)`;
    if (transform !== this.lastTransform) {
      pet.style.transform = transform;
      this.lastTransform = transform;
    }
    const facing = turns ? 1 : snap.facing;
    if (facing !== this.lastFacing) {
      sprite.classList.toggle('facing-left', facing < 0);
      this.lastFacing = facing;
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

    const longest = Math.max(wa.width, wa.height);
    this.cursorTracker.setSensitivity(Math.min(3, Math.max(1, REFERENCE_SCREEN_PX / longest)));
    this.applyScale();
  }

  private applyScale(): void {
    const scale = this.display.workArea.width < 600 ? SMALL_SCREEN_SCALE : 1;
    const { baseSize, anchor = { x: 0.5, y: 1 } } = this.renderer;
    this.renderer.setScale(scale);
    const height = baseSize.height * scale;
    this.size = { width: baseSize.width * scale, height: height * anchor.y };
    this.belowFeet = height * (1 - anchor.y);
  }

  /** Swaps in the drawing for the chosen raccoon type. Behaviour carries on untouched. */
  private applySettings(): void {
    const type = this.settings.raccoonType;
    if (type === this.rendererType) return;
    this.renderer = RACCOON_STYLES[type].create();
    this.rendererType = type;
    this.els.sprite.replaceChildren(this.renderer.element);
    this.lastDrawn = '';
    this.lastFacing = 0;
    this.lastTransform = '';
    this.applyScale();
  }

  /** A few hearts that float up from his head and fade; each removes itself when done. */
  private spawnHearts(): void {
    const { pet } = this.els;
    const anchorY = this.renderer.anchor?.y ?? 1;
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement('span');
      heart.className = 'heart';
      heart.textContent = '❤';
      heart.setAttribute('aria-hidden', 'true');
      // Just above his head: his head sits about two-thirds of the way up from his feet.
      heart.style.bottom = `${(1 - anchorY) * 100 + anchorY * 55}%`;
      heart.style.setProperty('--dx', `${(i - 1) * 22 + (Math.random() * 10 - 5)}px`);
      heart.style.animationDelay = `${i * 110}ms`;
      heart.addEventListener('animationend', () => heart.remove(), { once: true });
      pet.append(heart);
    }
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
