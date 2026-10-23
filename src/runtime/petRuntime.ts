import type { DisplayInfo, Point, Rect } from '../../shared/ipc';
import type { RaccoonType, Settings } from '../../shared/settings';
import { CursorActivityTracker } from '../core/activity/cursor';
import { TypingActivityTracker } from '../core/activity/typing';
import { Animator } from '../core/animator';
import { Brain, type Desk, type PetSnapshot, type WorldInput } from '../core/behavior/brain';
import { DEFAULT_CONFIG } from '../core/behavior/config';
import { ClickThroughController } from '../core/clickThrough';
import { isTurning, targetHeading, turnTowards } from '../core/heading';
import { Toybox } from '../core/toys/toybox';
import type { Host } from '../host';
import { ANIMATIONS, RACCOON_STYLES, type AnimationName, type RaccoonRenderer } from '../sprites';
import { PIXEL_PX } from '../sprites/pixel';
import type { AnimationSpec } from '../sprites/types';
import { DeskLayer } from './deskLayer';
import { ToyLayer } from './toyLayer';

export interface PetElements {
  /** Clip box covering the work area: hides whatever is past the edges or below the floor. */
  stage: HTMLElement;
  /** Positioned by the raccoon's feet. */
  pet: HTMLElement;
  /** Holds the drawing; mirrored to face left. */
  sprite: HTMLElement;
  emote: HTMLElement;
  /** His speech bubble. */
  speech?: HTMLElement;
}

/** Longest gap between ticks while nothing moves. Brain timers have this granularity. */
const MAX_REST_MS = 250;
/** Pointer travel that turns a press into a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
/** Pointer travel over him that counts as stroking. */
const STROKE_PX = 3;
/** Once lifted, how long he takes to slide round in your grip until you hold him by the scruff. */
const SCRUFF_SETTLE_MS = 220;
/**
 * Screen size (longer side, px) that activity thresholds are tuned for. Smaller screens,
 * like phones, get proportionally more sensitive so a finger swipe counts as "fast".
 */
const REFERENCE_SCREEN_PX = 1600;
/** The pointer catches his eye within this distance. */
const GAZE_RADIUS_PX = 420;
/** Raccoon scale on screens much narrower than a desktop. */
const SMALL_SCREEN_SCALE = 0.8;
/** How many toy blocks lie about. */
const TOY_COUNT = 3;
/** Toy block size for drawings that don't say. */
const TOY_SIZE = 16;

/** The shared animation timings with the drawing's own changes applied. */
function specsFor(renderer: RaccoonRenderer): Record<AnimationName, AnimationSpec> {
  const specs = { ...ANIMATIONS };
  for (const [name, change] of Object.entries(renderer.animations ?? {}) as [AnimationName, Partial<AnimationSpec>][]) {
    specs[name] = { ...specs[name], ...change };
  }
  return specs;
}

interface DragState {
  pointerId: number;
  /** Where he was grabbed, from his feet. */
  offset: Point;
  start: Point;
  pointer: Point;
  moved: boolean;
  /** When he was lifted (the drag began). */
  liftedAt: number;
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
  /** What he was last dressed in, as `hat|outfit`. */
  private dressed = '';
  private readonly cursorTracker = new CursorActivityTracker();
  private readonly typingTracker = new TypingActivityTracker();
  private readonly clickThrough: ClickThroughController;
  private readonly toybox = new Toybox();
  private readonly toyLayer: ToyLayer;
  private readonly deskLayer: DeskLayer;
  /** His desk, in work mode. */
  private desk: Desk | null = null;
  private lastSaid: string | null = null;
  private lastHidden = false;

  private cursor: Point | null = null;
  /** Where the pointer last was over the page, to tell when it strokes him. */
  private lastHover: Point | null = null;
  /** Brain-facing size: the part of the drawing above the feet. */
  private size = { width: 0, height: 0 };
  /** How far the drawing reaches below the feet, in px. */
  private belowFeet = 0;
  private scale = 1;
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
    this.toyLayer = new ToyLayer(document, els.stage, this.toybox, {
      thrown: (id) => this.brain.toyThrown(id),
      wake: () => this.wake(),
      dragStarted: () => this.clickThrough.dragStarted(),
      dragEnded: (p) => this.clickThrough.dragEnded(p, this.grabRects()),
    });
    this.deskLayer = new DeskLayer(document, els.stage, () => {
      this.brain.deskTapped();
      this.wake();
    });
    this.applySettings();
    this.applyLayout();
    this.brain = new Brain(this.worldInput(performance.now()), Math.random, DEFAULT_CONFIG, this.toybox);
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
    this.toyLayer.destroy();
    this.deskLayer.destroy();
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
    this.syncToys();
    this.syncDesk();
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
    this.drag = { pointerId: e.pointerId, offset: { x: p.x - feet.x, y: p.y - feet.y }, start: p, pointer: p, moved: false, liftedAt: 0 };
    this.clickThrough.dragStarted();
  }

  private onPointerMove(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    drag.pointer = p;
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) >= DRAG_THRESHOLD_PX) {
      drag.moved = true;
      drag.liftedAt = performance.now();
      this.brain.grab();
    }
    if (drag.moved) {
      this.dragToPointer(performance.now());
      this.wake();
    }
  }

  /**
   * Carries him with the pointer. Lifted, he's always held by the scruff: wherever you
   * grabbed him, he slides round in your grip until the scruff is under the pointer, and
   * stays held there as his body swings and settles beneath it.
   */
  private dragToPointer(now: number): void {
    const drag = this.drag;
    if (!drag?.moved) return;
    const hold = this.renderer.holdPoint?.() ?? null;
    let offset = drag.offset;
    if (hold) {
      const t = Math.min(1, (now - drag.liftedAt) / SCRUFF_SETTLE_MS);
      const k = t * t * (3 - 2 * t);
      offset = { x: drag.offset.x + (hold.x - drag.offset.x) * k, y: drag.offset.y + (hold.y - drag.offset.y) * k };
    }
    this.brain.dragTo({ x: drag.pointer.x - offset.x, y: drag.pointer.y - offset.y });
  }

  private onPointerUp(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.drag = null;
    if (drag.moved) {
      this.brain.release();
    } else {
      this.brain.poke();
    }
    this.wake();
    this.clickThrough.dragEnded({ x: e.clientX, y: e.clientY }, this.grabRects());
  }

  /** Everything on the page you can pick up or tap: him, his toys and his desk. */
  private grabRects(): Rect[] {
    const rect = this.hitRect();
    const desk = this.deskLayer.rect();
    return [...(rect ? [rect] : []), ...this.toyLayer.rects(), ...(desk ? [desk] : [])];
  }

  private updateHover(p: Point): void {
    const rect = this.hitRect();
    const targets = this.grabRects();
    // Nothing to grab (he's fully hidden behind an edge, and no toys): never hold the mouse.
    if (targets.length) this.clickThrough.pointerMoved(p, targets);
    else this.clickThrough.pointerLeft();
    // Stroking him after a pat (the pointer moving over him) keeps him purring.
    const last = this.lastHover;
    this.lastHover = p;
    const over = rect && p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
    if (over && last && !this.drag && Math.hypot(p.x - last.x, p.y - last.y) >= STROKE_PX) this.brain.stroke();
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
    // The scruff moves as he settles into hanging, even with the pointer still.
    this.dragToPointer(now);
    const snap = this.brain.update(dt, this.worldInput(now));
    this.snap = snap;
    this.animator.play(snap.animation);
    this.animator.update(dt);
    this.headingTarget = targetHeading(this.heading, snap);
    this.heading = turnTowards(this.heading, this.headingTarget, dt);
    this.render(snap, now);
    this.carryToy(snap);
    this.toyLayer.render(snap.position);
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
    const toysStill = this.toybox.settled && !this.toyLayer.dragging;
    return !this.drag && !turning && toysStill && !this.renderer.isSettling?.() && (this.snap?.resting ?? false);
  }

  private worldInput(now: number): WorldInput {
    const keyboard = this.settings.keyboardReactions;
    const wa = this.display.workArea;
    return {
      bounds: wa,
      footroom: this.belowFeet,
      peekDepth: this.renderer.peekSink === undefined ? undefined : this.renderer.peekSink * this.scale,
      size: this.size,
      cursor: this.cursor,
      cursorExcited: this.cursorTracker.isExcited(now),
      cursorStillMs: this.cursorTracker.stillFor(now),
      typingActive: keyboard && this.typingTracker.isActive,
      toyReach: this.renderer.toyReach === undefined ? undefined : this.renderer.toyReach * this.scale,
      carries: this.renderer.carriesToys === true,
      desk: this.desk,
      mode: this.settings.mode,
    };
  }

  // ---- Rendering ---------------------------------------------------------------------

  private render(snap: PetSnapshot, now: number): void {
    const { pet, sprite, emote } = this.els;
    const frame = {
      clockMs: now,
      animation: this.animator.animation,
      timeMs: this.animator.time,
      keystrokes: this.animator.keystrokes,
      eyes: this.animator.eyes,
      heading: this.heading,
      velocity: snap.velocity,
      gaze: snap.lookAt ? { x: snap.lookAt.x - snap.position.x, y: snap.lookAt.y - snap.position.y } : this.gazeAt(snap.position),
    };
    const turns = this.renderer.turnsItself === true;
    const key = `${frame.animation}|${frame.timeMs}|${frame.keystrokes}|${frame.eyes}|${turns ? this.heading.toFixed(3) : ''}`;
    if (key !== this.lastDrawn || this.renderer.isSettling?.()) {
      this.renderer.draw(frame);
      this.lastDrawn = key;
    }

    const wa = this.display.workArea;
    // Pixel art sits on whole screen pixels, so it stays crisp; anything else moves smoothly.
    const step = this.renderer.pixelated ? window.devicePixelRatio || 1 : 10;
    const x = Math.round((snap.position.x - wa.x) * step) / step;
    const y = Math.round((snap.position.y - wa.y) * step) / step;
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
    this.deskLayer.show(snap.screen ?? 'idle', now);
    // Gone into hiding: nothing of him on the page at all, so nothing to catch the mouse.
    if (snap.hidden !== this.lastHidden) {
      pet.style.visibility = snap.hidden ? 'hidden' : '';
      this.lastHidden = snap.hidden;
    }
    const speech = this.els.speech;
    if (speech && snap.say !== this.lastSaid) {
      // Keeps the last words while the bubble fades away.
      if (snap.say) speech.textContent = snap.say;
      speech.classList.toggle('show', snap.say !== null);
      speech.classList.toggle('speech-pixel', this.renderer.pixelated === true);
      this.lastSaid = snap.say;
    }
    // Drawings that float their own z's over their heads don't need the page's as well.
    const shown = this.renderer.drawsMarks ? '' : snap.emote;
    if (shown !== this.lastEmote) {
      emote.textContent = shown === 'z' ? 'z Z' : shown;
      emote.dataset.emote = shown;
      this.lastEmote = shown;
    }
  }

  /** A toy block in his mouth or hands goes where the drawing says they are. */
  private carryToy(snap: PetSnapshot): void {
    const toy = this.toybox.heldBy('pet');
    if (!toy) return;
    const at = this.renderer.toyPoint?.() ?? { x: snap.facing * this.size.width * 0.3, y: -this.size.height * 0.4 };
    const floor = snap.position.y + 1;
    const bottom = snap.position.y + at.y + this.toybox.size / 2;
    this.toybox.moveHeld(toy.id, { x: snap.position.x + at.x, y: floor }, floor - bottom);
  }

  /** Puts the toy blocks out in play mode, and tidies them away otherwise. */
  private syncToys(): void {
    if (this.settings.mode !== 'play') {
      this.toybox.clear();
      this.toyLayer.render(this.snap?.position ?? { x: 0, y: 0 });
      return;
    }
    if (this.toybox.toys.length) return;
    // Scattered on the floor near where he starts out, at the bottom in the middle.
    const b = this.toybox.bounds;
    const middle = b.x + b.width / 2;
    const bottom = b.y + b.height;
    const spots = [
      { x: middle - 150, y: bottom - 40 },
      { x: middle + 120, y: bottom - 70 },
      { x: middle + 175, y: bottom - 22 },
    ];
    for (let i = 0; i < TOY_COUNT; i++) this.toybox.add(i, spots[i % spots.length]!);
  }

  /** The pointer relative to his feet, when it's near enough to catch his eye. */
  private gazeAt(feet: Point): Point | null {
    const c = this.cursor;
    if (!c) return null;
    const dx = c.x - feet.x;
    const dy = c.y - feet.y;
    return Math.hypot(dx, dy) < GAZE_RADIUS_PX ? { x: dx, y: dy } : null;
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
    // Toys lie on the same floor he walks on, low enough on it for him to reach.
    const top = Math.min(this.size.height * 0.6, wa.height / 2);
    this.toybox.setBounds({ x: wa.x, y: wa.y + top, width: wa.width, height: wa.height - top });
    this.toyLayer.setOrigin({ x: wa.x, y: wa.y });
    this.syncToys();
    this.syncDesk();
  }

  /** Puts his desk out in work mode, built to fit him, or puts it away. */
  private syncDesk(): void {
    if (this.settings.mode !== 'work') {
      this.desk = this.deskLayer.fit(null);
      return;
    }
    const wa = this.display.workArea;
    const reach = this.renderer.deskReach ?? { x: this.size.width * 0.3, y: -this.size.height * 0.35 };
    const mouse = this.renderer.mouseReach ?? { x: reach.x + this.size.height * 0.15, y: reach.y };
    this.desk = this.deskLayer.fit({
      bounds: wa,
      floor: wa.y + wa.height - this.belowFeet,
      unit: this.size.height,
      reach: { x: reach.x * this.scale, y: reach.y * this.scale },
      mouse: { x: mouse.x * this.scale, y: mouse.y * this.scale },
      // The desk is pixel art, at the pixel pets' pixel size.
      pixel: PIXEL_PX * this.scale,
    });
  }

  private applyScale(): void {
    const scale = this.display.workArea.width < 600 ? SMALL_SCREEN_SCALE : 1;
    this.scale = scale;
    const { baseSize, anchor = { x: 0.5, y: 1 } } = this.renderer;
    this.renderer.setScale(scale);
    const height = baseSize.height * scale;
    this.size = { width: baseSize.width * scale, height: height * anchor.y };
    this.belowFeet = height * (1 - anchor.y);
    this.toybox.size = (this.renderer.toySize ?? TOY_SIZE) * scale;
    this.toyLayer.setLook(this.renderer.toyLook ?? 'paint', this.toybox.size);
  }

  /** Swaps in the drawing for the chosen raccoon type, in what he's wearing. Behaviour carries on untouched. */
  private applySettings(): void {
    const type = this.settings.raccoonType;
    const { hat, outfit } = this.settings;
    if (type === this.rendererType) {
      if (`${hat}|${outfit}` !== this.dressed) {
        this.dressed = `${hat}|${outfit}`;
        this.renderer.dress?.({ hat, outfit });
        this.lastDrawn = '';
      }
      return;
    }
    this.renderer = RACCOON_STYLES[type].create();
    this.dressed = `${hat}|${outfit}`;
    this.renderer.dress?.({ hat, outfit });
    this.rendererType = type;
    this.animator.setSpecs(specsFor(this.renderer));
    this.els.sprite.replaceChildren(this.renderer.element);
    this.lastDrawn = '';
    this.lastFacing = 0;
    this.lastTransform = '';
    this.applyScale();
    // A new pet needs a desk its size (not before the first layout, which builds it).
    if (this.deskLayer) this.syncDesk();
  }

  /** The visible part of the raccoon: the drawn figure clipped to the stage. */
  private hitRect(): Rect | null {
    if (this.lastHidden) return null;
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
