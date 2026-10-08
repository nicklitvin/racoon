import type { AnimationName } from '../../sprites/types';
import { clamp, type Point, type Rect } from '../geometry';
import { approach, cubicBezier, easeInOutSine, steer, steer2d } from './motion';

/** Top-level states of the behaviour state machine. */
export type Mode = 'idle' | 'walk' | 'float' | 'sit' | 'sleep' | 'react';

/** What the raccoon is reacting to, while in the "react" mode. */
export type Reaction =
  | 'surprised'
  | 'chase'
  | 'pounce'
  | 'confused'
  | 'flee'
  | 'hide'
  | 'peek'
  | 'dragged'
  | 'falling';

/** Little symbol drawn above the raccoon's head. */
export type Emote = '' | '!' | '?' | 'z';

/** Everything the brain knows about the outside world, refreshed every tick. */
export interface WorldInput {
  /** Where the raccoon may roam; the bottom edge is the floor. */
  bounds: Rect;
  /** Current sprite size in px. */
  size: { width: number; height: number };
  /** Cursor position, or null when it's off this screen. */
  cursor: Point | null;
  /** The cursor has been moving fast or erratically for a while. */
  cursorExcited: boolean;
  /** How long since the cursor last moved, in ms. */
  cursorStillMs: number;
  /** The user is in a sustained stretch of typing (opt-in feature). */
  typingActive: boolean;
}

export interface PetSnapshot {
  /** Feet position (bottom centre of the sprite). */
  position: Point;
  velocity: Point;
  facing: 1 | -1;
  mode: Mode;
  reaction: Reaction | null;
  /** Sub-phase of multi-step reactions (e.g. peek: approach, sink, watch, rise). */
  phase: string | null;
  animation: AnimationName;
  emote: Emote;
  /** Nothing is moving; the caller can tick less often. */
  resting: boolean;
}

export interface Tuning {
  walkSpeed: number;
  runSpeed: number;
  chaseSpeed: number;
  floatSpeed: number;
  accel: number;
  runAccel: number;
  chaseAccel: number;
  gravity: number;
  hopImpulse: number;
  sleepAfterMs: number;
  fleeRadius: number;
  fleeChance: number;
  pounceAfterStillMs: number;
  chaseMaxMs: number;
}

export const DEFAULT_TUNING: Tuning = {
  walkSpeed: 85,
  runSpeed: 340,
  chaseSpeed: 650,
  floatSpeed: 170,
  accel: 380,
  runAccel: 1500,
  chaseAccel: 2600,
  gravity: 2400,
  hopImpulse: 620,
  sleepAfterMs: 3 * 60_000,
  fleeRadius: 90,
  fleeChance: 0.6,
  pounceAfterStillMs: 450,
  chaseMaxMs: 25_000,
};

type State =
  | { mode: 'idle'; until: number }
  | { mode: 'walk'; targetX: number; maxSpeed: number }
  | { mode: 'float'; path: [Point, Point, Point, Point]; elapsed: number; duration: number }
  | { mode: 'sit'; activity: 'rest' | 'groom' | 'yawn'; until: number; then: 'idle' | 'sleep' }
  | { mode: 'sleep' }
  | { mode: 'react'; reaction: 'surprised'; until: number; next: 'chase' | 'idle' }
  | { mode: 'react'; reaction: 'chase'; until: number }
  | { mode: 'react'; reaction: 'pounce' }
  | { mode: 'react'; reaction: 'confused'; until: number }
  | { mode: 'react'; reaction: 'flee'; targetX: number }
  | { mode: 'react'; reaction: 'hide'; edge: -1 | 1; phase: 'in' | 'wait' | 'out'; targetX: number; until: number; giveUpAt: number }
  | { mode: 'react'; reaction: 'peek'; phase: 'approach' | 'sink' | 'watch' | 'rise'; sink: number }
  | { mode: 'react'; reaction: 'dragged' }
  | { mode: 'react'; reaction: 'falling'; then: 'idle' | 'confused' };

const SUBSTEP_S = 1 / 60;
const MAX_FRAME_MS = 1000;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The raccoon's behaviour: a state machine plus a little physics. Pure TypeScript:
 * no DOM, no timers, no Electron. Time only moves when `update` is called, and all
 * randomness comes from the injected `random`, so tests are fully deterministic.
 *
 * Movement is always velocity-based with limited acceleration, so the raccoon eases
 * in and out and never teleports.
 */
export class Brain {
  private state: State;
  private pos: Point;
  private vel: Point = { x: 0, y: 0 };
  private facing: 1 | -1 = 1;
  private now = 0;
  private calmMs = 0;
  private cursorWasNear = false;
  private justLanded = false;
  private speedScale = 1;
  private dragTarget: Point | null = null;
  private input: WorldInput;

  constructor(
    initial: WorldInput,
    private readonly random: () => number = Math.random,
    private readonly tuning: Tuning = DEFAULT_TUNING,
  ) {
    this.input = initial;
    const b = initial.bounds;
    this.pos = { x: b.x + b.width / 2, y: b.y + b.height };
    this.state = { mode: 'idle', until: 1500 };
  }

  /** Movement speed multiplier from settings (1 = default). */
  setSpeed(scale: number): void {
    this.speedScale = scale;
  }

  update(dtMs: number, input: WorldInput): PetSnapshot {
    this.input = input;
    let remaining = Math.min(Math.max(dtMs, 0), MAX_FRAME_MS) / 1000;
    while (remaining > 1e-9) {
      const dt = Math.min(SUBSTEP_S, remaining);
      this.step(dt);
      remaining -= dt;
    }
    return this.snapshot();
  }

  // ---- Direct manipulation ---------------------------------------------------------

  grab(): void {
    this.state = { mode: 'react', reaction: 'dragged' };
    this.dragTarget = { ...this.pos };
    this.vel = { x: 0, y: 0 };
    this.calmMs = 0;
  }

  dragTo(feet: Point): void {
    if (this.reaction !== 'dragged') return;
    this.dragTarget = this.clampToBounds(feet, false);
  }

  release(): void {
    if (this.reaction !== 'dragged') return;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    const max = 1800;
    if (speed > max) this.vel = { x: (this.vel.x / speed) * max, y: (this.vel.y / speed) * max };
    this.dragTarget = null;
    this.state = { mode: 'react', reaction: 'falling', then: 'idle' };
  }

  /** A click on the raccoon. */
  poke(): void {
    if (this.reaction === 'dragged') return;
    this.surprise('idle');
  }

  // ---- Simulation --------------------------------------------------------------------

  private get floor(): number {
    return this.input.bounds.y + this.input.bounds.height;
  }

  private get onGround(): boolean {
    return this.pos.y >= this.floor - 0.5;
  }

  private get center(): Point {
    return { x: this.pos.x, y: this.pos.y - this.input.size.height / 2 };
  }

  private get reaction(): Reaction | null {
    return this.state.mode === 'react' ? this.state.reaction : null;
  }

  private get xLimits(): [number, number] {
    const { bounds, size } = this.input;
    return [bounds.x + size.width / 2, bounds.x + bounds.width - size.width / 2];
  }

  private step(dt: number): void {
    this.now += dt * 1000;
    this.handleStimuli(dt);
    this.think(dt);
    this.integrate(dt);
    this.updateFacing();
  }

  private handleStimuli(dt: number): void {
    const { cursor, cursorExcited, typingActive } = this.input;
    const s = this.state;
    const r = this.reaction;
    const alreadyChasing =
      r === 'chase' || r === 'pounce' || r === 'dragged' || (s.mode === 'react' && s.reaction === 'surprised' && s.next === 'chase');

    if (cursorExcited && cursor && !alreadyChasing) {
      this.surprise('chase');
      return;
    }

    const calm = s.mode !== 'react';
    if (typingActive && calm) {
      this.state = { mode: 'react', reaction: 'peek', phase: 'approach', sink: 0 };
      return;
    }

    const near = cursor !== null && dist(cursor, this.center) < this.tuning.fleeRadius;
    const skittish = s.mode === 'idle' || s.mode === 'walk' || s.mode === 'sit';
    if (near && !this.cursorWasNear && skittish && this.random() < this.tuning.fleeChance) this.flee(cursor);
    this.cursorWasNear = near;

    if (s.mode === 'react') this.calmMs = 0;
    else if (s.mode !== 'sleep') this.calmMs += dt * 1000;
  }

  private think(dt: number): void {
    const s = this.state;
    const t = this.tuning;
    const k = this.speedScale;
    const { cursor, size } = this.input;

    switch (s.mode) {
      case 'idle':
        this.brake(dt);
        if (this.now >= s.until && this.onGround) this.decide();
        return;

      case 'walk':
        this.vel.x = steer(this.pos.x, this.vel.x, s.targetX, s.maxSpeed * k, t.accel * k, dt, 60);
        if (Math.abs(s.targetX - this.pos.x) < 3 && Math.abs(this.vel.x) < 8) this.idle(3000, 8000);
        return;

      case 'float': {
        s.elapsed += dt * 1000;
        const progress = Math.min(1, s.elapsed / s.duration);
        const p = cubicBezier(...s.path, easeInOutSine(progress));
        // Gentle bob that fades out at both ends, so it starts and lands smoothly.
        p.y += Math.sin((s.elapsed / 1000) * Math.PI * 1.6) * 6 * Math.sin(Math.PI * progress);
        this.vel = { x: (p.x - this.pos.x) / dt, y: (p.y - this.pos.y) / dt };
        this.pos = p;
        if (progress >= 1) {
          this.vel = { x: 0, y: 0 };
          this.idle(3000, 7000);
        }
        return;
      }

      case 'sit':
        this.brake(dt);
        if (this.now >= s.until) {
          if (s.then === 'sleep') this.state = { mode: 'sleep' };
          else this.idle(2000, 5000);
        }
        return;

      case 'sleep':
        this.brake(dt);
        return;

      case 'react':
        break;
    }

    switch (s.reaction) {
      case 'surprised':
        this.brake(dt);
        if (this.now < s.until) return;
        if (s.next === 'chase') this.state = { mode: 'react', reaction: 'chase', until: this.now + t.chaseMaxMs };
        else if (this.onGround) this.idle(1000, 2500);
        return;

      case 'chase': {
        if (!cursor || this.now >= s.until) {
          this.state = { mode: 'react', reaction: 'falling', then: 'confused' };
          return;
        }
        const target = { x: cursor.x, y: cursor.y + size.height * 0.45 };
        this.vel = steer2d(this.pos, this.vel, target, t.chaseSpeed * k, t.chaseAccel * k, dt, 80);
        if (this.input.cursorStillMs >= t.pounceAfterStillMs) this.pounce(cursor);
        return;
      }

      case 'pounce':
        if (this.justLanded) this.confused();
        return;

      case 'confused':
        this.brake(dt);
        if (this.now >= s.until) this.idle(1000, 2500);
        return;

      case 'flee':
        this.vel.x = steer(this.pos.x, this.vel.x, s.targetX, t.runSpeed * k, t.runAccel * k, dt, 50);
        if (Math.abs(s.targetX - this.pos.x) < 4 && Math.abs(this.vel.x) < 10) {
          this.idle(1500, 3000);
          if (cursor) this.facing = cursor.x < this.pos.x ? -1 : 1;
        }
        return;

      case 'hide': {
        if (s.phase === 'in' || s.phase === 'out') {
          const speed = s.phase === 'in' ? t.runSpeed : t.walkSpeed;
          const accel = s.phase === 'in' ? t.runAccel : t.accel;
          this.vel.x = steer(this.pos.x, this.vel.x, s.targetX, speed * k, accel * k, dt, 50);
          if (Math.abs(s.targetX - this.pos.x) < 4 && Math.abs(this.vel.x) < 10) {
            if (s.phase === 'out') {
              this.idle(1000, 2500);
            } else {
              s.phase = 'wait';
              s.until = this.now + 3000 + this.random() * 3000;
              s.giveUpAt = this.now + 12_000;
            }
          }
          return;
        }
        this.brake(dt);
        const cursorClose = cursor !== null && dist(cursor, this.center) < 220;
        if ((this.now >= s.until && !cursorClose) || this.now >= s.giveUpAt) {
          const [minX, maxX] = this.xLimits;
          const step = size.width * 0.3 + this.random() * 150;
          s.phase = 'out';
          s.targetX = clamp(s.edge < 0 ? minX + step : maxX - step, minX, maxX);
        }
        return;
      }

      case 'peek': {
        const depth = size.height * 0.5;
        if (s.phase === 'approach') {
          this.brake(dt);
          if (this.onGround && Math.abs(this.vel.x) < 5) s.phase = 'sink';
          return;
        }
        if (!this.input.typingActive && s.phase !== 'rise') s.phase = 'rise';
        if (s.phase === 'sink') {
          s.sink = approach(s.sink, depth, 110 * dt);
          if (s.sink >= depth) s.phase = 'watch';
        } else if (s.phase === 'watch') {
          s.sink = depth;
        } else {
          s.sink = approach(s.sink, 0, 140 * dt);
          if (s.sink <= 0) this.idle(800, 2000);
        }
        this.pos.y = this.floor + s.sink;
        this.vel = { x: 0, y: 0 };
        return;
      }

      case 'dragged': {
        if (!this.dragTarget) return;
        const instant = { x: (this.dragTarget.x - this.pos.x) / dt, y: (this.dragTarget.y - this.pos.y) / dt };
        this.vel = { x: this.vel.x * 0.7 + instant.x * 0.3, y: this.vel.y * 0.7 + instant.y * 0.3 };
        this.pos = { ...this.dragTarget };
        return;
      }

      case 'falling':
        if (this.justLanded || (this.onGround && this.vel.y === 0)) {
          if (s.then === 'confused') this.confused();
          else this.idle(1000, 2500);
        }
        return;
    }
  }

  private integrate(dt: number): void {
    const s = this.state;
    this.justLanded = false;

    const flying = s.mode === 'float' || (s.mode === 'react' && (s.reaction === 'chase' || s.reaction === 'dragged'));
    const peeking = s.mode === 'react' && s.reaction === 'peek' && s.phase !== 'approach';

    if (peeking) return;
    if (flying) {
      if (s.mode === 'react' && s.reaction === 'chase') {
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
      }
      this.pos = this.clampToBounds(this.pos, false);
      return;
    }

    const wasAirborne = this.pos.y < this.floor - 0.5;
    this.vel.y += this.tuning.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y >= this.floor) {
      this.pos.y = this.floor;
      if (this.vel.y > 0) this.vel.y = 0;
      if (wasAirborne) {
        this.justLanded = true;
        this.vel.x *= 0.4;
      }
    }

    const hiding = s.mode === 'react' && s.reaction === 'hide';
    const clamped = this.clampToBounds(this.pos, hiding);
    if (clamped.x !== this.pos.x) this.vel.x = 0;
    if (clamped.y !== this.pos.y && this.vel.y < 0) this.vel.y = 0;
    this.pos = clamped;
  }

  /** Keeps the whole sprite inside the bounds, or allows half of it past the sides while hiding. */
  private clampToBounds(p: Point, allowSides: boolean): Point {
    const { bounds, size } = this.input;
    const [minX, maxX] = this.xLimits;
    const slack = allowSides ? size.width * 0.5 : 0;
    return {
      x: clamp(p.x, minX - slack, maxX + slack),
      y: clamp(p.y, bounds.y + size.height, this.floor),
    };
  }

  private updateFacing(): void {
    const s = this.state;
    const { cursor, bounds } = this.input;
    if (s.mode === 'react' && s.reaction === 'chase' && cursor) {
      if (Math.abs(cursor.x - this.pos.x) > 4) this.facing = cursor.x < this.pos.x ? -1 : 1;
      return;
    }
    if (s.mode === 'react' && s.reaction === 'hide' && s.phase === 'wait') {
      this.facing = this.pos.x < bounds.x + bounds.width / 2 ? 1 : -1;
      return;
    }
    if (s.mode === 'react' && s.reaction === 'peek') return;
    if (Math.abs(this.vel.x) > 12) this.facing = this.vel.x < 0 ? -1 : 1;
  }

  private brake(dt: number): void {
    const accel = this.onGround ? this.tuning.runAccel : this.tuning.accel * 0.3;
    this.vel.x = approach(this.vel.x, 0, accel * dt);
  }

  // ---- Transitions -----------------------------------------------------------------

  private idle(minMs: number, maxMs: number): void {
    this.state = { mode: 'idle', until: this.now + minMs + this.random() * (maxMs - minMs) };
  }

  private decide(): void {
    if (this.calmMs >= this.tuning.sleepAfterMs) {
      this.state = { mode: 'sit', activity: 'yawn', until: this.now + 2200, then: 'sleep' };
      return;
    }
    const r = this.random();
    if (r < 0.38) this.startWalk();
    else if (r < 0.5) this.startFloat();
    else if (r < 0.8) {
      const pick = this.random();
      const activity = pick < 0.45 ? 'groom' : pick < 0.6 ? 'yawn' : 'rest';
      const duration = activity === 'yawn' ? 2200 : 3000 + this.random() * 4000;
      this.state = { mode: 'sit', activity, until: this.now + duration, then: 'idle' };
    } else {
      if (this.random() < 0.5) this.facing = this.facing === 1 ? -1 : 1;
      this.idle(4000, 9000);
    }
  }

  private startWalk(): void {
    const [minX, maxX] = this.xLimits;
    const distance = 120 + this.random() * 380;
    let dir = this.random() < 0.5 ? -1 : 1;
    if (this.pos.x + dir * distance < minX || this.pos.x + dir * distance > maxX) dir = -dir;
    const targetX = clamp(this.pos.x + dir * distance, minX, maxX);
    const maxSpeed = this.tuning.walkSpeed * (0.85 + this.random() * 0.3);
    this.state = { mode: 'walk', targetX, maxSpeed };
  }

  private startFloat(): void {
    const { bounds, size } = this.input;
    const [minX, maxX] = this.xLimits;
    const targetX = minX + this.random() * Math.max(0, maxX - minX);
    const maxRise = Math.max(0, bounds.height - size.height - 10);
    const rise = Math.min(maxRise, 140 + this.random() * 260);
    if (rise < 40) {
      this.startWalk();
      return;
    }
    const from = { ...this.pos };
    const to = { x: targetX, y: this.floor };
    const dx = to.x - from.x;
    const path: [Point, Point, Point, Point] = [
      from,
      { x: from.x + dx * 0.25, y: this.floor - rise },
      { x: from.x + dx * 0.75, y: this.floor - rise },
      to,
    ];
    const duration = Math.max(2500, ((Math.abs(dx) + rise * 1.6) / (this.tuning.floatSpeed * this.speedScale)) * 1000);
    this.state = { mode: 'float', path, elapsed: 0, duration };
  }

  private surprise(next: 'chase' | 'idle'): void {
    if (this.onGround) this.vel.y = -this.tuning.hopImpulse;
    this.calmMs = 0;
    this.state = { mode: 'react', reaction: 'surprised', until: this.now + 450, next };
  }

  private pounce(cursor: Point): void {
    const target = { x: cursor.x, y: cursor.y + this.input.size.height / 2 };
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const time = clamp(Math.hypot(dx, dy) / 900, 0.3, 0.6);
    this.vel = { x: dx / time, y: dy / time - 0.5 * this.tuning.gravity * time };
    this.state = { mode: 'react', reaction: 'pounce' };
  }

  private confused(): void {
    this.state = { mode: 'react', reaction: 'confused', until: this.now + 2500 + this.random() * 1500 };
  }

  private flee(cursor: Point): void {
    const [minX, maxX] = this.xLimits;
    const dir = this.center.x >= cursor.x ? 1 : -1;
    const targetX = this.pos.x + dir * (220 + this.random() * 260);
    const margin = this.input.size.width * 0.5;
    if (targetX < minX + margin || targetX > maxX - margin) {
      const edge = dir < 0 ? -1 : 1;
      const offscreen = this.input.size.width * 0.3;
      this.state = {
        mode: 'react',
        reaction: 'hide',
        edge,
        phase: 'in',
        targetX: edge < 0 ? minX - offscreen : maxX + offscreen,
        until: 0,
        giveUpAt: 0,
      };
      return;
    }
    this.state = { mode: 'react', reaction: 'flee', targetX };
  }

  // ---- Output ------------------------------------------------------------------------

  private snapshot(): PetSnapshot {
    const s = this.state;
    const airborne = !this.onGround && Math.abs(this.vel.y) > 40;
    const moving = Math.abs(this.vel.x) > 1 || Math.abs(this.vel.y) > 1;
    let animation: AnimationName;
    let emote: Emote = '';
    let phase: string | null = null;

    switch (s.mode) {
      case 'idle':
        animation = Math.abs(this.vel.x) > 25 ? 'walk' : 'idle';
        break;
      case 'walk':
        animation = Math.abs(this.vel.x) > this.tuning.walkSpeed * 1.5 ? 'run' : 'walk';
        break;
      case 'float':
        animation = 'float';
        break;
      case 'sit':
        animation = s.activity === 'rest' ? 'sit' : s.activity;
        break;
      case 'sleep':
        animation = 'sleep';
        emote = 'z';
        break;
      case 'react':
        switch (s.reaction) {
          case 'surprised':
            animation = 'surprised';
            emote = '!';
            break;
          case 'chase':
            animation = 'chase';
            break;
          case 'pounce':
            animation = 'jump';
            break;
          case 'confused':
            animation = 'confused';
            emote = '?';
            break;
          case 'flee':
            animation = 'run';
            break;
          case 'hide':
            phase = s.phase;
            animation = s.phase === 'in' ? 'run' : s.phase === 'out' ? 'walk' : 'idle';
            break;
          case 'peek':
            phase = s.phase;
            animation = s.phase === 'approach' ? (Math.abs(this.vel.x) > 25 ? 'walk' : 'idle') : 'peek';
            break;
          case 'dragged':
          case 'falling':
            animation = 'dangle';
            break;
        }
        break;
    }

    const groundBased = s.mode === 'idle' || s.mode === 'walk' || s.mode === 'sit' || s.mode === 'sleep';
    if (groundBased && airborne) animation = 'jump';

    const settled =
      s.mode === 'idle' ||
      s.mode === 'sit' ||
      s.mode === 'sleep' ||
      (s.mode === 'react' &&
        (s.reaction === 'confused' || (s.reaction === 'peek' && s.phase === 'watch') || (s.reaction === 'hide' && s.phase === 'wait')));

    return {
      position: { ...this.pos },
      velocity: { ...this.vel },
      facing: this.facing,
      mode: s.mode,
      reaction: this.reaction,
      phase,
      animation,
      emote,
      resting: settled && !moving && (this.onGround || (s.mode === 'react' && s.reaction === 'peek')),
    };
  }
}
