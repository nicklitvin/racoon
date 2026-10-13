import type { Point, Rect } from '../geometry';

/**
 * Toy blocks on the floor, and how they fly, bounce and tumble. Pure TypeScript like the
 * brain: time only moves when `step` is called, so it's deterministic and testable.
 *
 * The screen is the same floor the pet walks on, seen from a little above. A block stands
 * on the floor at (x, y), the middle of its bottom face, and is lifted `z` px off it; it's
 * drawn with its bottom at y - z, its shadow at y.
 */

export type Holder = 'pet' | 'user';

export interface Toy {
  readonly id: number;
  /** Which block it is: picks its letter and colour. */
  readonly face: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** How far it has tumbled over, screen degrees, and how fast it's turning (deg/s). */
  angle: number;
  spin: number;
  /** Who has hold of it, if anyone; it's carried, not flying. */
  holder: Holder | null;
  /** Who sent it flying last. */
  thrownBy: Holder | null;
}

export interface Velocity3 {
  x: number;
  y: number;
  z: number;
}

/** px/s². */
const GRAVITY = 2100;
/** How much of its fall a block bounces back up with. */
const BOUNCE = 0.36;
/** Bouncing lower than this, it stays down. */
const SETTLE_VZ = 90;
/** Of what it was carrying along, a bounce keeps this much. */
const BOUNCE_GRIP = 0.68;
/** Sliding and tumbling along the floor, it slows by this much, px/s². */
const FRICTION = 950;
/** Off a side wall it bounces back with this much of its speed. */
const WALL = 0.5;
/** Below this speed on the floor it has stopped, and settles flat on a face. */
const STILL = 6;

export class Toybox {
  readonly toys: Toy[] = [];
  /** Where blocks may go: the floor. */
  bounds: Rect = { x: 0, y: 0, width: 0, height: 0 };
  /** Edge of a block, px. */
  size = 18;
  private nextId = 1;

  add(face: number, at: Point): Toy {
    const toy: Toy = { id: this.nextId++, face, x: at.x, y: at.y, z: 0, vx: 0, vy: 0, vz: 0, angle: 0, spin: 0, holder: null, thrownBy: null };
    this.toys.push(toy);
    this.keepIn(toy);
    return toy;
  }

  clear(): void {
    this.toys.length = 0;
  }

  /** A new floor (the screen changed): blocks off the edge of it come back on. */
  setBounds(bounds: Rect): void {
    this.bounds = bounds;
    for (const toy of this.toys) this.keepIn(toy);
  }

  get(id: number): Toy | undefined {
    return this.toys.find((t) => t.id === id);
  }

  /** The block someone has hold of. */
  heldBy(holder: Holder): Toy | undefined {
    return this.toys.find((t) => t.holder === holder);
  }

  /** On the floor and still: not flying, sliding or held. */
  isResting(toy: Toy): boolean {
    return toy.holder === null && toy.z <= 0 && Math.hypot(toy.vx, toy.vy) < STILL;
  }

  /** Nothing about any block will change until something touches it. */
  get settled(): boolean {
    return this.toys.every((t) => t.holder === null && this.isResting(t) && t.spin === 0 && t.angle % 90 === 0);
  }

  /** Takes hold of a block, unless someone else has it; you can take one from the pet. */
  hold(id: number, holder: Holder): boolean {
    const toy = this.get(id);
    if (!toy || (toy.holder && !(holder === 'user' && toy.holder === 'pet'))) return false;
    toy.holder = holder;
    toy.vx = toy.vy = toy.vz = toy.spin = 0;
    return true;
  }

  /** Carries a held block to a point on the floor, `z` up off it. */
  moveHeld(id: number, at: Point, z: number): void {
    const toy = this.get(id);
    if (!toy?.holder) return;
    toy.x = at.x;
    toy.y = at.y;
    toy.z = Math.max(0, z);
  }

  /** Lets go of a block with a throw (or just drops it, with no velocity). */
  release(id: number, holder: Holder, v: Velocity3, spin = 0): void {
    const toy = this.get(id);
    if (toy?.holder !== holder) return;
    toy.thrownBy = toy.holder;
    toy.holder = null;
    toy.vx = v.x;
    toy.vy = v.y;
    toy.vz = v.z;
    toy.spin = spin;
    this.keepIn(toy);
  }

  /** Knocks a loose block: a swat, or a kick from a passing paw. */
  hit(id: number, v: Velocity3, spin: number, by: Holder = 'pet'): void {
    const toy = this.get(id);
    if (!toy || toy.holder) return;
    toy.vx = v.x;
    toy.vy = v.y;
    toy.vz = Math.max(toy.vz, v.z);
    toy.spin = spin;
    toy.thrownBy = by;
  }

  step(dt: number): void {
    for (const toy of this.toys) if (!toy.holder) this.move(toy, dt);
    this.separate();
  }

  /** Where a block will come to rest on the floor, if nothing touches it. */
  landing(id: number): Point | null {
    const toy = this.get(id);
    if (!toy) return null;
    if (toy.holder) return { x: toy.x, y: toy.y };
    const ghost = { ...toy };
    for (let i = 0; i < 400 && !this.isResting(ghost); i++) this.move(ghost, 1 / 60);
    return { x: ghost.x, y: ghost.y };
  }

  private move(toy: Toy, dt: number): void {
    if (toy.z > 0 || toy.vz > 0) {
      toy.vz -= GRAVITY * dt;
      toy.z += toy.vz * dt;
      if (toy.z <= 0) {
        toy.z = 0;
        if (-toy.vz > SETTLE_VZ) {
          toy.vz = -toy.vz * BOUNCE;
          toy.vx *= BOUNCE_GRIP;
          toy.vy *= BOUNCE_GRIP;
          toy.spin *= 0.6;
        } else {
          toy.vz = 0;
        }
      }
    }
    const speed = Math.hypot(toy.vx, toy.vy);
    if (toy.z <= 0 && speed > 0) {
      // Sliding along the floor it tumbles over, a quarter turn for each side's length.
      const slower = Math.max(0, speed - FRICTION * dt);
      toy.vx *= slower / speed;
      toy.vy *= slower / speed;
      const roll = (toy.vx / this.size) * 90;
      toy.spin += (roll - toy.spin) * Math.min(1, dt * 10);
      if (slower < STILL) toy.vx = toy.vy = 0;
    }
    toy.x += toy.vx * dt;
    toy.y += toy.vy * dt;
    if (this.isResting(toy)) {
      // Come to a stop, it falls flat onto whichever face is nearest.
      const flat = Math.round(toy.angle / 90) * 90;
      const left = flat - toy.angle;
      toy.spin = 0;
      toy.angle = Math.abs(left) < 0.5 ? flat : toy.angle + left * Math.min(1, dt * 14);
      if (toy.angle === flat) toy.angle = ((flat % 360) + 360) % 360;
    } else {
      toy.angle += toy.spin * dt;
    }
    this.keepIn(toy);
  }

  /** Keeps a block on the floor: it bounces off the sides, and stops at the top and bottom. */
  private keepIn(toy: Toy): void {
    const b = this.bounds;
    if (b.width <= 0) return;
    const half = this.size / 2;
    const minX = b.x + half;
    const maxX = b.x + b.width - half;
    const minY = b.y + this.size;
    const maxY = b.y + b.height - 2;
    if (toy.x < minX || toy.x > maxX) {
      toy.x = Math.min(maxX, Math.max(minX, toy.x));
      toy.vx = -toy.vx * WALL;
      toy.spin = -toy.spin * WALL;
    }
    if (toy.y < minY || toy.y > maxY) {
      toy.y = Math.min(maxY, Math.max(minY, toy.y));
      toy.vy = -toy.vy * WALL;
    }
  }

  /** Blocks on the floor don't sit inside each other: one knocks the other on. */
  private separate(): void {
    const s = this.size;
    for (let i = 0; i < this.toys.length; i++) {
      for (let j = i + 1; j < this.toys.length; j++) {
        const a = this.toys[i]!;
        const b = this.toys[j]!;
        if (a.holder || b.holder || a.z > s * 0.6 || b.z > s * 0.6) continue;
        const dx = b.x - a.x;
        // Seen from above, a block's footprint is shallower than it is wide.
        const dy = (b.y - a.y) / 0.55;
        const d = Math.hypot(dx, dy);
        if (d >= s || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (s - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push * 0.55;
        b.x += nx * push;
        b.y += ny * push * 0.55;
        // Whatever was moving into the other passes some of it on.
        const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny * 0.55;
        if (closing > 0) {
          const share = closing * 0.55;
          a.vx -= nx * share;
          a.vy -= ny * share * 0.55;
          b.vx += nx * share;
          b.vy += ny * share * 0.55;
        }
        this.keepIn(a);
        this.keepIn(b);
      }
    }
  }
}
