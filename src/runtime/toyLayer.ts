import type { Point, Rect } from '../../shared/ipc';
import type { BinSpot, Toybox } from '../core/toys/toybox';
import { createToyDrawing, TOY_BOX, type ToyDrawing } from '../sprites/toys';
import type { ToyLook } from '../sprites/types';

/** Picked up, a block is held this far above the floor (px). */
const LIFT = 26;
/** Pointer travel that turns a press on a block into a drag. */
const DRAG_PX = 3;
/** How far back the pointer's speed is measured when you let go, ms. */
const FLING_WINDOW_MS = 90;
/** Fastest you can throw a block, px/s. */
const MAX_THROW = 1500;

interface Item {
  wrap: HTMLElement;
  shadow: HTMLElement;
  block: HTMLElement;
  drawing: ToyDrawing;
  last: string;
}

interface Drag {
  id: number;
  pointerId: number;
  start: Point;
  moved: boolean;
  samples: { t: number; x: number; y: number }[];
}

export interface ToyLayerHooks {
  /** You threw, dropped or flicked a block. */
  thrown(id: number): void;
  /** You're carrying a block about, or let go of it: keep the picture moving. */
  wake(): void;
  dragStarted(): void;
  dragEnded(pointer: Point): void;
}

/**
 * The toy blocks on the page: one element per block, positioned from the toybox every
 * frame, behind the pet or in front of him by how near you each is. You can pick one up,
 * carry it, and throw it (or just click it to flick it over).
 */
export class ToyLayer {
  private readonly items = new Map<number, Item>();
  /** The trash can's base on the floor, if there is one. */
  private bin: BinSpot | null = null;
  private look: ToyLook = 'paint';
  private size = 0;
  private origin: Point = { x: 0, y: 0 };
  private drag: Drag | null = null;

  constructor(
    private readonly doc: Document,
    private readonly stage: HTMLElement,
    private readonly toys: Toybox,
    private readonly hooks: ToyLayerHooks,
  ) {}

  /** The drawing style and block size (px) to match the pet. */
  setLook(look: ToyLook, size: number): void {
    if (look === this.look && Math.abs(size - this.size) < 0.01) return;
    this.look = look;
    this.size = size;
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  /** Where the stage's top left corner is on the screen. */
  setOrigin(origin: Point): void {
    this.origin = origin;
  }

  /** Where the trash can stands, if there is one: blocks behind it go behind it. */
  setBin(bin: BinSpot | null): void {
    this.bin = bin;
    for (const item of this.items.values()) item.last = '';
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Places every block, given where the pet's feet are. */
  render(petFeet: Point): void {
    for (const id of this.items.keys()) if (!this.toys.get(id)) this.remove(id);
    const bin = this.bin;
    for (const toy of this.toys.toys) {
      const item = this.items.get(toy.id) ?? this.add(toy.id, toy.face);
      const x = toy.x - this.origin.x;
      const y = toy.y - this.origin.y;
      // Nearer you than the pet, it's in front of him; in his mouth or your hand, always.
      // Lying behind his trash can, it's behind that too.
      const front = toy.holder !== null || toy.y >= petFeet.y - 2;
      const hidden = bin !== null && !toy.holder && toy.y < bin.y && Math.abs(toy.x - bin.x) < bin.halfWidth * 1.4 + this.size;
      const z = toy.holder === 'user' ? 4 : hidden ? 0 : front ? 3 : 1;
      const air = Math.min(1, toy.z / 160);
      const key = `${x.toFixed(1)}|${y.toFixed(1)}|${toy.z.toFixed(1)}|${toy.angle.toFixed(1)}|${z}`;
      if (key === item.last) continue;
      item.last = key;
      item.wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      item.wrap.style.zIndex = String(z);
      item.block.style.transform = `translate(-50%, -50%) translateY(${(-toy.z - this.size / 2).toFixed(1)}px)`;
      item.shadow.style.transform = `translate(-50%, -50%) scale(${(1 - air * 0.55).toFixed(3)})`;
      // Over the can (in his paws in it, or dropping in), its shadow is inside the can.
      const overBin = bin !== null && Math.abs(toy.x - bin.x) < bin.halfWidth && toy.y < bin.y + 2 && toy.y > bin.y - bin.depth;
      item.shadow.style.opacity = overBin ? '0' : (1 - air * 0.6).toFixed(2);
      item.drawing.draw(toy.angle);
    }
  }

  /** The blocks on screen, for deciding when the window should take the mouse. */
  rects(): Rect[] {
    const out: Rect[] = [];
    for (const item of this.items.values()) {
      const r = item.block.getBoundingClientRect();
      if (r.width > 0) out.push({ x: r.left + r.width * 0.15, y: r.top + r.height * 0.15, width: r.width * 0.7, height: r.height * 0.7 });
    }
    return out;
  }

  destroy(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }

  private add(id: number, face: number): Item {
    const wrap = this.doc.createElement('div');
    wrap.className = 'toy';
    const shadow = this.doc.createElement('div');
    shadow.className = `toy-shadow toy-shadow-${this.look}`;
    shadow.style.width = `${this.size * 1.15}px`;
    shadow.style.height = `${this.size * 0.42}px`;
    const block = this.doc.createElement('div');
    block.className = 'toy-block';
    const drawing = createToyDrawing(this.doc, this.look, face, this.size);
    block.appendChild(drawing.element);
    wrap.append(shadow, block);
    this.stage.appendChild(wrap);
    block.addEventListener('pointerdown', (e) => this.down(id, e));
    block.addEventListener('pointermove', (e) => this.move(e));
    block.addEventListener('pointerup', (e) => this.up(e));
    block.addEventListener('pointercancel', (e) => this.up(e));
    const item = { wrap, shadow, block, drawing, last: '' };
    this.items.set(id, item);
    // Inner size of the box the drawing turns in.
    block.style.width = block.style.height = `${this.size * TOY_BOX}px`;
    return item;
  }

  private remove(id: number): void {
    this.items.get(id)?.wrap.remove();
    this.items.delete(id);
  }

  private down(id: number, e: PointerEvent): void {
    if (e.button !== 0 || this.drag || !this.toys.hold(id, 'user')) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    this.drag = { id, pointerId: e.pointerId, start: p, moved: false, samples: [{ t: e.timeStamp, ...p }] };
    this.carry(p);
    this.hooks.dragStarted();
    this.hooks.wake();
  }

  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) >= DRAG_PX) drag.moved = true;
    drag.samples.push({ t: e.timeStamp, ...p });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0]!.t > FLING_WINDOW_MS) drag.samples.shift();
    this.carry(p);
    this.hooks.wake();
  }

  private up(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    this.drag = null;
    const p = { x: e.clientX, y: e.clientY };
    if (!drag.moved) {
      // A click: it flips up into the air and tumbles over.
      const way = Math.random() < 0.5 ? -1 : 1;
      this.toys.release(drag.id, 'user', { x: 0, y: 0, z: 0 });
      this.toys.hit(drag.id, { x: way * 40, y: 0, z: 460 }, way * 360, 'user');
    } else {
      const first = drag.samples[0]!;
      const dt = Math.max(16, e.timeStamp - first.t) / 1000;
      let vx = (p.x - first.x) / dt;
      let vy = (p.y - first.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_THROW) {
        vx *= MAX_THROW / speed;
        vy *= MAX_THROW / speed;
      }
      // Flung up the screen it goes up into the air; down the screen, it skims along the floor towards you.
      const v = vy < 0 ? { x: vx, y: vy * 0.2, z: 120 - vy * 0.85 } : { x: vx, y: vy * 0.7, z: 120 };
      this.toys.release(drag.id, 'user', v, vx * 0.9);
    }
    this.hooks.thrown(drag.id);
    this.hooks.dragEnded(p);
    this.hooks.wake();
  }

  /** Holds the block with its middle under the pointer, its shadow on the floor below. */
  private carry(p: Point): void {
    if (!this.drag) return;
    this.toys.moveHeld(this.drag.id, { x: p.x, y: p.y + this.size / 2 + LIFT }, LIFT);
  }
}
