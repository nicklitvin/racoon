import type { AnimationName } from '../../sprites/types';
import { clamp, type Point, type Rect } from '../geometry';
import { DEFAULT_CONFIG, pick, type BehaviorConfig } from './config';
import { approach, brake2d, easeInOutSine, quadraticBezier, steer2d } from './motion';

/** Top-level states of the behaviour state machine. */
export type Mode = 'idle' | 'walk' | 'sit' | 'sleep' | 'react';

/** What the raccoon is reacting to, while in the "react" mode. */
export type Reaction = 'surprised' | 'chase' | 'pounce' | 'confused' | 'flee' | 'hide' | 'peek' | 'dragged' | 'petted';

/** Little symbol drawn above the raccoon's head. Only sleep shows one. */
export type Emote = '' | 'z';

/** Everything the brain knows about the outside world, refreshed every tick. */
export interface WorldInput {
  /** Where the raccoon may roam. He can walk anywhere inside it; peeking happens at its bottom edge. */
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

type State =
  | { mode: 'idle'; until: number }
  | { mode: 'walk'; from: Point; via: Point; to: Point; elapsed: number; duration: number }
  | { mode: 'sit'; activity: 'rest' | 'groom' | 'yawn'; until: number; then: 'idle' | 'sleep' }
  | { mode: 'sleep' }
  | { mode: 'react'; reaction: 'surprised'; until: number; next: 'chase' | 'idle' }
  | { mode: 'react'; reaction: 'chase'; until: number }
  | { mode: 'react'; reaction: 'pounce'; target: Point; until: number }
  | { mode: 'react'; reaction: 'confused'; until: number }
  | { mode: 'react'; reaction: 'flee'; target: Point }
  | { mode: 'react'; reaction: 'hide'; edge: -1 | 1; phase: 'in' | 'wait' | 'out'; targetX: number; until: number; giveUpAt: number }
  | { mode: 'react'; reaction: 'peek'; phase: 'approach' | 'sink' | 'watch' | 'rise'; sink: number }
  | { mode: 'react'; reaction: 'dragged' }
  | { mode: 'react'; reaction: 'petted'; until: number };

const SUBSTEP_S = 1 / 60;
const MAX_FRAME_MS = 1000;
/** How much of the sprite drops below the bottom edge while peeking. */
export const PEEK_SINK = 0.45;
/** Peak speed of an ease-in-out-sine move is this many times its average speed. */
const EASE_PEAK = Math.PI / 2;
/** How long one pat keeps him happy; each further pat restarts it. */
const PETTED_MS = 1600;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const length = (v: Point) => Math.hypot(v.x, v.y);

/** Limits for the feet position that keep the whole sprite inside the bounds. */
interface Area {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * The raccoon's behaviour: a state machine plus a little motion. Pure TypeScript:
 * no DOM, no timers, no Electron. Time only moves when `update` is called, and all
 * randomness comes from the injected `random`, so tests are fully deterministic.
 *
 * He roams the whole screen; there is no floor and no gravity. Walks follow gently
 * curved paths with eased speed, and everything else is velocity-based with limited
 * acceleration, so he never teleports.
 */
export class Brain {
  private state: State;
  private pos: Point;
  private vel: Point = { x: 0, y: 0 };
  private facing: 1 | -1 = 1;
  private now = 0;
  private calmMs = 0;
  private cursorWasNear = false;
  private speedScale = 1;
  private dragTarget: Point | null = null;
  private input: WorldInput;

  constructor(
    initial: WorldInput,
    private readonly random: () => number = Math.random,
    private readonly config: BehaviorConfig = DEFAULT_CONFIG,
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
    this.dragTarget = this.clampToArea(feet);
  }

  /** Lets go: he settles exactly where he was dropped. */
  release(): void {
    if (this.reaction !== 'dragged') return;
    this.dragTarget = null;
    this.vel = { x: 0, y: 0 };
    this.idle(1000, 2500);
  }

  /** A click or tap on the raccoon: a pat. He sits and enjoys it. */
  poke(): void {
    if (this.reaction === 'dragged') return;
    this.calmMs = 0;
    this.state = { mode: 'react', reaction: 'petted', until: this.now + PETTED_MS };
  }

  // ---- Simulation --------------------------------------------------------------------

  private get bottom(): number {
    return this.input.bounds.y + this.input.bounds.height;
  }

  private get center(): Point {
    return { x: this.pos.x, y: this.pos.y - this.input.size.height / 2 };
  }

  private get reaction(): Reaction | null {
    return this.state.mode === 'react' ? this.state.reaction : null;
  }

  private get area(): Area {
    const { bounds, size } = this.input;
    return {
      minX: bounds.x + size.width / 2,
      maxX: bounds.x + bounds.width - size.width / 2,
      minY: bounds.y + size.height,
      maxY: this.bottom,
    };
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

    const near = cursor !== null && dist(cursor, this.center) < this.config.reactions.fleeRadius;
    const skittish = s.mode === 'idle' || s.mode === 'walk' || s.mode === 'sit';
    if (near && !this.cursorWasNear && skittish && this.random() < this.config.reactions.fleeChance) this.flee(cursor);
    this.cursorWasNear = near;

    if (s.mode === 'react') this.calmMs = 0;
    else if (s.mode !== 'sleep') this.calmMs += dt * 1000;
  }

  private think(dt: number): void {
    const s = this.state;
    const m = this.config.motion;
    const k = this.speedScale;
    const { cursor, size } = this.input;

    switch (s.mode) {
      case 'idle':
        this.brake(dt);
        if (this.now >= s.until) this.decide();
        return;

      case 'walk': {
        s.elapsed += dt * 1000;
        const progress = Math.min(1, s.elapsed / s.duration);
        const next = quadraticBezier(s.from, s.via, s.to, easeInOutSine(progress));
        this.vel = { x: (next.x - this.pos.x) / dt, y: (next.y - this.pos.y) / dt };
        this.pos = next;
        if (progress >= 1) {
          this.vel = { x: 0, y: 0 };
          this.pause();
        }
        return;
      }

      case 'sit':
        this.brake(dt);
        if (this.now >= s.until) {
          if (s.then === 'sleep') this.state = { mode: 'sleep' };
          else this.pause();
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
        if (s.next === 'chase') this.state = { mode: 'react', reaction: 'chase', until: this.now + this.config.reactions.chaseMaxMs };
        else this.idle(1000, 2500);
        return;

      case 'chase': {
        if (!cursor || this.now >= s.until) {
          this.confused();
          return;
        }
        this.vel = steer2d(this.pos, this.vel, this.pounceTarget(cursor), m.chaseSpeed * k, m.chaseAccel * k, dt, 80);
        if (this.input.cursorStillMs >= this.config.reactions.pounceAfterStillMs) {
          this.state = { mode: 'react', reaction: 'pounce', target: this.pounceTarget(cursor), until: this.now + 900 };
        }
        return;
      }

      case 'pounce':
        this.vel = steer2d(this.pos, this.vel, s.target, m.pounceSpeed * k, m.chaseAccel * 1.6 * k, dt, 40);
        if ((dist(this.pos, s.target) < 4 && length(this.vel) < 30) || this.now >= s.until) this.confused();
        return;

      case 'confused':
        this.brake(dt);
        if (this.now >= s.until) this.idle(1000, 2500);
        return;

      case 'petted':
        this.brake(dt);
        if (this.now >= s.until) this.idle(1500, 3000);
        return;

      case 'flee':
        this.vel = steer2d(this.pos, this.vel, s.target, m.runSpeed * k, m.runAccel * k, dt, 50);
        if (dist(s.target, this.pos) < 4 && length(this.vel) < 10) {
          this.idle(1500, 3000);
          if (cursor) this.facing = cursor.x < this.pos.x ? -1 : 1;
        }
        return;

      case 'hide': {
        if (s.phase === 'in' || s.phase === 'out') {
          const speed = s.phase === 'in' ? m.runSpeed : m.walkSpeed;
          const accel = s.phase === 'in' ? m.runAccel : m.accel;
          const target = { x: s.targetX, y: this.pos.y };
          this.vel = steer2d(this.pos, this.vel, target, speed * k, accel * k, dt, 50);
          if (Math.abs(s.targetX - this.pos.x) < 4 && length(this.vel) < 10) {
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
          const { minX, maxX } = this.area;
          const step = size.width * 0.3 + this.random() * 150;
          s.phase = 'out';
          s.targetX = clamp(s.edge < 0 ? minX + step : maxX - step, minX, maxX);
        }
        return;
      }

      case 'peek': {
        const depth = size.height * PEEK_SINK;
        if (s.phase === 'approach') {
          // Head for the bottom edge, straight down from wherever he is.
          const target = { x: clamp(this.pos.x, this.area.minX, this.area.maxX), y: this.bottom };
          this.vel = steer2d(this.pos, this.vel, target, m.walkSpeed * 2 * k, m.accel * 2 * k, dt, 60);
          if (dist(this.pos, target) < 3 && length(this.vel) < 8) s.phase = 'sink';
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
        this.pos = { x: this.pos.x, y: this.bottom + s.sink };
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
    }
  }

  private integrate(dt: number): void {
    const s = this.state;
    // Walks, drags and peeks place him directly; everything else moves by velocity.
    if (s.mode === 'walk') return;
    if (s.mode === 'react' && (s.reaction === 'dragged' || (s.reaction === 'peek' && s.phase !== 'approach'))) return;

    this.pos = { x: this.pos.x + this.vel.x * dt, y: this.pos.y + this.vel.y * dt };
    const hiding = s.mode === 'react' && s.reaction === 'hide';
    const clamped = this.clampToArea(this.pos, hiding);
    if (clamped.x !== this.pos.x) this.vel.x = 0;
    if (clamped.y !== this.pos.y) this.vel.y = 0;
    this.pos = clamped;
  }

  /** Keeps the whole sprite inside the bounds, or allows half of it past the sides while hiding. */
  private clampToArea(p: Point, allowSides = false): Point {
    const { minX, maxX, minY, maxY } = this.area;
    const slack = allowSides ? this.input.size.width * 0.5 : 0;
    return { x: clamp(p.x, minX - slack, maxX + slack), y: clamp(p.y, minY, maxY) };
  }

  private updateFacing(): void {
    const s = this.state;
    const { cursor, bounds } = this.input;
    if (s.mode === 'react' && (s.reaction === 'chase' || s.reaction === 'pounce') && cursor) {
      if (Math.abs(cursor.x - this.pos.x) > 4) this.facing = cursor.x < this.pos.x ? -1 : 1;
      return;
    }
    if (s.mode === 'react' && s.reaction === 'hide' && s.phase === 'wait') {
      this.facing = this.pos.x < bounds.x + bounds.width / 2 ? 1 : -1;
      return;
    }
    if (s.mode === 'react' && s.reaction === 'peek' && s.phase !== 'approach') return;
    if (Math.abs(this.vel.x) > 12) this.facing = this.vel.x < 0 ? -1 : 1;
  }

  private brake(dt: number): void {
    this.vel = brake2d(this.vel, this.config.motion.runAccel * dt);
  }

  /** Where his feet go so that the cursor ends up in the middle of him. */
  private pounceTarget(cursor: Point): Point {
    return this.clampToArea({ x: cursor.x, y: cursor.y + this.input.size.height * 0.45 });
  }

  // ---- Transitions -----------------------------------------------------------------

  private idle(minMs: number, maxMs: number): void {
    this.state = { mode: 'idle', until: this.now + minMs + this.random() * (maxMs - minMs) };
  }

  /** A pause between activities, per the wander config. */
  private pause(): void {
    const { min, max } = this.config.wander.pauseMs;
    this.idle(min, max);
  }

  private decide(): void {
    const w = this.config.wander;
    if (this.calmMs >= w.sleepAfterMs) {
      this.state = { mode: 'sit', activity: 'yawn', until: this.now + 2200, then: 'sleep' };
      return;
    }
    const r = this.random();
    if (r < w.sitChance) {
      const roll = this.random();
      const activity = roll < 0.45 ? 'groom' : roll < 0.6 ? 'yawn' : 'rest';
      const duration = activity === 'yawn' ? 2200 : pick(w.sitMs, this.random);
      this.state = { mode: 'sit', activity, until: this.now + duration, then: 'idle' };
    } else if (r < w.sitChance + w.lookAroundChance) {
      this.facing = this.facing === 1 ? -1 : 1;
      this.pause();
    } else {
      this.startWalk();
    }
  }

  /**
   * Picks a random point some distance away, anywhere on screen, and sets off along
   * a gently curved path to it. The path's control point is kept inside the roaming
   * area, so the whole curve stays on screen.
   */
  private startWalk(): void {
    const w = this.config.wander;
    const area = this.area;
    let to = this.pos;
    let distance = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = this.random() * Math.PI * 2;
      distance = pick(w.walkDistance, this.random);
      to = { x: this.pos.x + Math.cos(angle) * distance, y: this.pos.y + Math.sin(angle) * distance };
      if (to.x >= area.minX && to.x <= area.maxX && to.y >= area.minY && to.y <= area.maxY) break;
    }
    to = this.clampToArea(to);
    distance = dist(this.pos, to);
    if (distance < w.walkDistance.min / 2) {
      // Not enough room to go anywhere worthwhile (tiny screen).
      this.pause();
      return;
    }

    const bow = (this.random() * 2 - 1) * w.curve * distance;
    const normal = { x: -(to.y - this.pos.y) / distance, y: (to.x - this.pos.x) / distance };
    const via = this.clampToArea({
      x: (this.pos.x + to.x) / 2 + normal.x * bow,
      y: (this.pos.y + to.y) / 2 + normal.y * bow,
    });
    const topSpeed = this.config.motion.walkSpeed * (1 + (this.random() * 2 - 1) * w.speedJitter) * this.speedScale;
    const duration = (distance / (topSpeed / EASE_PEAK)) * 1000;
    this.state = { mode: 'walk', from: { ...this.pos }, via, to, elapsed: 0, duration };
  }

  private surprise(next: 'chase' | 'idle'): void {
    this.calmMs = 0;
    this.state = { mode: 'react', reaction: 'surprised', until: this.now + 450, next };
  }

  private confused(): void {
    this.state = { mode: 'react', reaction: 'confused', until: this.now + 2500 + this.random() * 1500 };
  }

  private flee(cursor: Point): void {
    const center = this.center;
    const away = { x: center.x - cursor.x, y: center.y - cursor.y };
    const awayLength = length(away) || 1;
    const run = 220 + this.random() * 260;
    const target = this.clampToArea({ x: this.pos.x + (away.x / awayLength) * run, y: this.pos.y + (away.y / awayLength) * run });
    if (dist(target, this.pos) < run * 0.5) {
      // Cornered: duck behind the side edge he was running towards.
      const { minX, maxX } = this.area;
      const edge = away.x < 0 ? -1 : 1;
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
    this.state = { mode: 'react', reaction: 'flee', target };
  }

  // ---- Output ------------------------------------------------------------------------

  private snapshot(): PetSnapshot {
    const s = this.state;
    const speed = length(this.vel);
    let animation: AnimationName;
    let emote: Emote = '';
    let phase: string | null = null;

    switch (s.mode) {
      case 'idle':
        animation = speed > 25 ? 'walk' : 'idle';
        break;
      case 'walk':
        animation = speed > this.config.motion.walkSpeed * 1.5 ? 'run' : speed < 8 ? 'idle' : 'walk';
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
            break;
          case 'chase':
            animation = 'chase';
            break;
          case 'pounce':
            animation = 'jump';
            break;
          case 'confused':
            animation = 'confused';
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
            animation = s.phase !== 'approach' ? 'peek' : speed > this.config.motion.walkSpeed * 1.5 ? 'run' : speed > 25 ? 'walk' : 'idle';
            break;
          case 'dragged':
            animation = 'dangle';
            break;
          case 'petted':
            animation = 'happy';
            break;
        }
        break;
    }

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
      resting: settled && speed <= 1,
    };
  }
}
