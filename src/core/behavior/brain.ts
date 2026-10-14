import { PLAY } from '../../sprites/animations';
import type { AnimationName } from '../../sprites/types';
import { clamp, type Point, type Rect } from '../geometry';
import { Toybox, type Toy } from '../toys/toybox';
import { DEFAULT_CONFIG, pick, type BehaviorConfig } from './config';
import { approach, brake2d, easeInOutSine, quadraticBezier, steer2d, steerArc } from './motion';

/** Top-level states of the behaviour state machine. */
export type Mode = 'idle' | 'walk' | 'sit' | 'sleep' | 'react';

/** What the raccoon is reacting to, while in the "react" mode. */
export type Reaction = 'surprised' | 'chase' | 'pounce' | 'confused' | 'flee' | 'hide' | 'peek' | 'dragged' | 'petted' | 'zoomies' | 'play' | 'nap' | 'work';

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
  /**
   * How far the drawing reaches below his feet, in px (a top-down raccoon facing you).
   * He walks no closer than this to the bottom edge, so nothing gets clipped.
   */
  footroom?: number;
  /** How far his feet go past the bottom edge while peeking. Defaults to PEEK_SINK of his height. */
  peekDepth?: number;
  /**
   * How far in front of his feet a toy sits for him to swat it or pick it up, px. Defaults
   * to a third of his width.
   */
  toyReach?: number;
  /** He can pick a toy up in his hands and walk off with it on his hind legs (a raccoon). */
  carries?: boolean;
  /** His desk, in work mode: where he sits at it (his feet), which way he faces, and its screen. */
  desk?: Desk | null;
}

export interface Desk {
  seat: Point;
  facing: 1 | -1;
  screen: Point;
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
  /**
   * Standing still, the way he wants to face on the floor (radians, screen axes), for
   * drawings that turn themselves: square on to a toy he's about to swat. Null leaves it be.
   */
  aim: number | null;
  /** Something he's keeping his eyes on (a toy), screen px; null to look at the pointer. */
  lookAt: Point | null;
  /** What he's saying, in a speech bubble, if anything. */
  say: string | null;
}

/**
 * A game with a toy block: going to it, swatting or throwing it (or, for a raccoon,
 * picking it up and walking off with it on his hind legs first), watching where it goes.
 */
interface PlayState {
  mode: 'react';
  reaction: 'play';
  toy: number;
  phase: 'go' | 'pounce' | 'bat' | 'toss' | 'lift' | 'carry' | 'throw' | 'watch' | 'wait';
  /** Which side of the block he stands, facing it: 1 on its left, facing right. */
  side: 1 | -1;
  /** When this phase began, and when it gives up or moves on. */
  started: number;
  until: number;
  /** Swats and throws left. */
  turns: number;
  /** You threw it: he's after it at full tilt. */
  excited: boolean;
  /** This turn's swat has landed, or its throw has let go. */
  done: boolean;
  mayPounce: boolean;
  /** Where a moving block will stop, worked out now and then. */
  landing: Point | null;
  landingAt: number;
  /** Where he's carrying it to. */
  dest: Point | null;
}

/**
 * At his desk: announcing it's work time, going to it, typing away, then getting restless,
 * and finally coming to find you because it's play time.
 */
interface WorkState {
  mode: 'react';
  reaction: 'work';
  phase: 'announce' | 'go' | 'type' | 'restless' | 'beg';
  until: number;
  /** When he'll have worked long enough, set when he first sits down. */
  focusUntil: number | null;
  /** Where he's going, begging: next to the pointer, and where it was when he picked it. */
  spot: Point | null;
  cursorAt: Point | null;
  /** Looking about, restless: at what, and when he looks somewhere else. */
  look: Point | null;
  nextLook: number;
  /** When he next asks you to play. */
  nextAsk: number;
  asked: number;
}

/** Off for a nap: going to curl up next to the pointer, or somewhere out of the way. */
interface NapState {
  mode: 'react';
  reaction: 'nap';
  spot: Point;
  /** The way he'll face, lying there: towards the pointer, or his toy. */
  face: 1 | -1;
  /** Where the pointer was when he picked the spot next to it, or null if it isn't by the pointer. */
  cursorAt: Point | null;
  /** He gives up getting there and naps where he is after this. */
  until: number;
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
  | { mode: 'react'; reaction: 'petted'; until: number; resume: WorkState | null; then: 'play' | null }
  | { mode: 'react'; reaction: 'zoomies'; target: Point; dashes: number }
  | PlayState
  | NapState
  | WorkState;

const SUBSTEP_S = 1 / 60;
const MAX_FRAME_MS = 1000;
/** How much of the sprite drops below the bottom edge while peeking. */
export const PEEK_SINK = 0.45;
/** Peak speed of an ease-in-out-sine move is this many times its average speed. */
const EASE_PEAK = Math.PI / 2;
/** How long one pat keeps him happy; each further pat restarts it. */
const PETTED_MS = 2200;
/** Stroking him (the pointer moving over him) keeps him happy at least this much longer. */
const STROKED_MS = 900;
/** Zoomies run this much faster than a run. */
const ZOOMIES_SPEED = 1.3;
/** Getting to a toy, he gives up after this long (it's stuck somewhere he can't reach). */
const GO_MS = 12_000;
/** How long he watches where a toy went before going after it. */
const WATCH_MS = { min: 350, max: 900 };
/** Carrying a toy somewhere, he gives up and throws it from wherever he's got to after this. */
const CARRY_MS = 7000;
/** Going off for a nap, he lies down wherever he's got to after this. */
const NAP_GO_MS = 20_000;
/** The pointer has to move this far from where it was for him to pick a new spot next to it. */
const NAP_CURSOR_MOVED = 60;
/** Off to his desk, he gives up if he can't get there in this long. */
const DESK_GO_MS = 20_000;
/** How long he says something for. */
const SAY_MS = 2200;
/** What he says to get you to play, in turn. */
const ASKS = ['Play time!', 'Let’s play!', 'Pleeease?', 'Play with me!'];

/** Play phases he has hold of the block through. */
const HOLDING = new Set<PlayState['phase']>(['toss', 'lift', 'carry', 'throw']);

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
  /** In the air in an excited leap until this time, and when the next one may come. */
  private leapUntil = 0;
  private nextLeapAt = 0;
  private input: WorldInput;
  /** When the desk was last tapped, for counting taps. */
  private taps: number[] = [];
  private speech: { text: string; until: number } | null = null;

  constructor(
    initial: WorldInput,
    private readonly random: () => number = Math.random,
    private readonly config: BehaviorConfig = DEFAULT_CONFIG,
    /** The toy blocks he plays with. They move in step with him. */
    readonly toys: Toybox = new Toybox(),
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

  /**
   * A click or tap on the raccoon: a pat. He sits and enjoys it. Busy at his desk, he
   * enjoys it and gets back to work; asking to play, it's what he wanted, and he plays.
   */
  poke(): void {
    const s = this.state;
    if (this.reaction === 'dragged') return;
    this.calmMs = 0;
    const work = s.mode === 'react' && s.reaction === 'work' ? s : null;
    const resume = work && work.phase !== 'beg' ? work : s.mode === 'react' && s.reaction === 'petted' ? s.resume : null;
    const then = work?.phase === 'beg' || (s.mode === 'react' && s.reaction === 'petted' && s.then === 'play') ? 'play' : null;
    if (work?.phase === 'beg') this.speak('Yay!');
    this.state = { mode: 'react', reaction: 'petted', until: this.now + PETTED_MS, resume, then };
  }

  /** The pointer moving over him while he's being petted: he enjoys it for longer. */
  stroke(): void {
    const s = this.state;
    if (s.mode === 'react' && s.reaction === 'petted') s.until = Math.max(s.until, this.now + STROKED_MS);
  }

  /**
   * A tap on his desk. A few quick ones and it's work time: he says so and goes and sits
   * down at it. Tapping it while he's working just gets you shushed.
   */
  deskTapped(): void {
    if (!this.input.desk || this.reaction === 'dragged') return;
    const w = this.config.work;
    if (this.busyWorking) {
      this.speak('Shh! Working.');
      return;
    }
    this.taps = this.taps.filter((t) => this.now - t <= w.tapWindowMs);
    this.taps.push(this.now);
    if (this.taps.length < w.taps) return;
    this.taps = [];
    this.startWork();
  }

  /**
   * You threw one of his toys (or dropped it): he's off after it, unless he's asleep, in
   * your hand or busy watching you type.
   */
  toyThrown(id: number): void {
    const s = this.state;
    const r = this.reaction;
    if (s.mode === 'sleep' || r === 'dragged' || r === 'peek' || r === 'hide' || this.busyWorking || !this.toys.get(id)) return;
    if (s.mode === 'react' && s.reaction === 'play' && s.toy === id) {
      this.playPhase(s, 'go', GO_MS);
      s.excited = true;
      s.turns = Math.max(s.turns, 1);
      return;
    }
    this.startPlay(id, true);
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
      maxY: this.bottom - (this.input.footroom ?? 0),
    };
  }

  private step(dt: number): void {
    this.now += dt * 1000;
    this.handleStimuli(dt);
    this.think(dt);
    this.integrate(dt);
    this.updateFacing();
    this.toys.step(dt);
    this.kickToys();
    // Whatever he's doing now, if it isn't throwing or carrying the block he has, he drops it.
    const held = this.toys.heldBy('pet');
    const s = this.state;
    if (held && !(s.mode === 'react' && s.reaction === 'play' && HOLDING.has(s.phase) && s.toy === held.id)) {
      this.toys.release(held.id, 'pet', { x: 0, y: 0, z: 0 });
    }
  }

  private handleStimuli(dt: number): void {
    const { cursor, cursorExcited, typingActive } = this.input;
    const s = this.state;
    const r = this.reaction;
    // Hard at work: nothing distracts him (except being picked up, or a pat).
    if (this.busyWorking) {
      this.calmMs = 0;
      this.cursorWasNear = cursor !== null && dist(cursor, this.center) < this.config.reactions.fleeRadius;
      return;
    }
    const alreadyChasing =
      r === 'chase' || r === 'pounce' || r === 'dragged' || (s.mode === 'react' && s.reaction === 'surprised' && s.next === 'chase');

    if (cursorExcited && cursor && !alreadyChasing) {
      this.surprise('chase');
      return;
    }

    const napping = s.mode === 'react' && s.reaction === 'nap';
    const calm = s.mode !== 'react' || napping;
    if (typingActive && calm) {
      this.state = { mode: 'react', reaction: 'peek', phase: 'approach', sink: 0 };
      return;
    }

    const near = cursor !== null && dist(cursor, this.center) < this.config.reactions.fleeRadius;
    const skittish = s.mode === 'idle' || s.mode === 'walk' || s.mode === 'sit';
    if (near && !this.cursorWasNear && skittish && this.random() < this.config.reactions.fleeChance) this.flee(cursor);
    this.cursorWasNear = near;

    if (s.mode === 'react' && !napping) this.calmMs = 0;
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
        if (s.next === 'chase') {
          this.state = { mode: 'react', reaction: 'chase', until: this.now + this.config.reactions.chaseMaxMs };
          this.nextLeapAt = this.now + 600 + this.random() * 900;
        }
        else this.idle(1000, 2500);
        return;

      case 'chase': {
        if (!cursor || this.now >= s.until) {
          this.confused();
          return;
        }
        // Mid-leap he flies straight on.
        if (this.leaping) return;
        const target = this.pounceTarget(cursor);
        this.vel = this.steer(target, m.chaseSpeed * k, m.chaseAccel * k, dt, 80);
        this.maybeLeap(dist(this.pos, target), m.chaseSpeed * k);
        if (this.input.cursorStillMs >= this.config.reactions.pounceAfterStillMs) {
          this.state = { mode: 'react', reaction: 'pounce', target: this.pounceTarget(cursor), until: this.now + 900 };
        }
        return;
      }

      case 'pounce':
        // A pounce is one quick lunge at the spot, not a run: straight there.
        this.vel = this.steer(s.target, m.pounceSpeed * k, m.chaseAccel * 1.6 * k, dt, 40, false);
        if ((dist(this.pos, s.target) < 4 && length(this.vel) < 30) || this.now >= s.until) this.confused();
        return;

      case 'confused':
        this.brake(dt);
        if (this.now >= s.until) this.idle(1000, 2500);
        return;

      case 'petted':
        this.brake(dt);
        if (this.now < s.until) return;
        if (s.resume && this.input.desk) {
          // Back to work.
          this.state = { ...s.resume, phase: 'go', until: this.now + DESK_GO_MS };
        } else if (s.then === 'play' && this.favouriteToy()) {
          this.startPlay(this.favouriteToy()!.id, true);
        } else {
          this.idle(1500, 3000);
        }
        return;

      case 'work':
        this.work(s, dt);
        return;

      case 'zoomies': {
        if (this.leaping) return;
        const top = m.runSpeed * ZOOMIES_SPEED * k;
        const last = s.dashes <= 1;
        this.vel = this.steer(s.target, top, m.runAccel * k, dt, last ? 70 : 10);
        const left = dist(this.pos, s.target);
        this.maybeLeap(left, top);
        if (!last && left < 40) {
          // Swerve off somewhere new without stopping.
          s.target = this.dashTarget();
          s.dashes--;
        } else if (last && left < 4 && length(this.vel) < 10) {
          this.pause();
        }
        return;
      }

      case 'play':
        this.play(s, dt);
        return;

      case 'nap': {
        // The pointer has settled somewhere else: he goes and lies down next to it there.
        if (s.cursorAt && cursor && dist(cursor, s.cursorAt) > NAP_CURSOR_MOVED && this.input.cursorStillMs >= 800) {
          Object.assign(s, this.napSpot());
        }
        this.vel = this.steer(s.spot, m.walkSpeed * 1.3 * k, m.accel * 1.5 * k, dt, 50);
        if ((dist(this.pos, s.spot) < 5 && length(this.vel) < 15) || this.now >= s.until) this.settleDown(s.face);
        return;
      }

      case 'flee':
        this.vel = this.steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 50);
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
          this.vel = this.steer(target, speed * k, accel * k, dt, 50);
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
        // Measured from the lowest spot he can stand on, so it ends up past the real edge.
        const floor = this.area.maxY;
        const depth = (this.input.footroom ?? 0) + (this.input.peekDepth ?? size.height * PEEK_SINK);
        if (s.phase === 'approach') {
          // Head for the bottom edge, straight down from wherever he is.
          const target = { x: clamp(this.pos.x, this.area.minX, this.area.maxX), y: floor };
          this.vel = this.steer(target, m.walkSpeed * 2 * k, m.accel * 2 * k, dt, 60);
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
        this.pos = { x: this.pos.x, y: floor + s.sink };
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
    if (s.mode === 'react' && s.reaction === 'play' && s.phase !== 'go') {
      const toy = this.toys.get(s.toy);
      if (s.phase === 'carry') {
        if (Math.abs(this.vel.x) > 12) this.facing = this.vel.x < 0 ? -1 : 1;
      } else if (s.phase === 'pounce' || s.phase === 'bat' || s.phase === 'toss' || s.phase === 'lift' || s.phase === 'throw' || !toy) {
        this.facing = s.side;
      }
      else if (Math.abs(toy.x - this.pos.x) > 6) this.facing = toy.x < this.pos.x ? -1 : 1;
      return;
    }
    if (Math.abs(this.vel.x) > 12) this.facing = this.vel.x < 0 ? -1 : 1;
  }

  /**
   * Steers towards `target` with the speed and acceleration measured over the floor, so
   * dashing up or down the screen (away from or towards you) is as quick as across it
   * looks, rather than twice as quick. On the move he runs round in curves (see `steerArc`)
   * unless `arc` is false.
   */
  private steer(target: Point, maxSpeed: number, accel: number, dt: number, slowRadius: number, arc = true): Point {
    const k = this.config.wander.floorDepth;
    const flat = (p: Point) => ({ x: p.x, y: p.y / k });
    const v = (arc ? steerArc : steer2d)(flat(this.pos), flat(this.vel), flat(target), maxSpeed, accel, dt, slowRadius);
    return { x: v.x, y: v.y * k };
  }

  private get leaping(): boolean {
    return this.now < this.leapUntil;
  }

  /**
   * Bursting with excitement mid-run, he leaps now and then: only at full tilt, and only
   * with room ahead to land before he gets where he's going.
   */
  private maybeLeap(distanceLeft: number, topSpeed: number): void {
    const { leapMs, leapEvery } = this.config.motion;
    const speed = length(this.vel);
    if (this.now < this.nextLeapAt || speed < topSpeed * 0.6) return;
    if (distanceLeft < speed * (leapMs / 1000) * 0.7) return;
    this.leapUntil = this.now + leapMs;
    this.nextLeapAt = this.leapUntil + pick(leapEvery, this.random);
    // The spring of the push-off.
    this.vel = { x: this.vel.x * 1.1, y: this.vel.y * 1.1 };
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
      this.nap();
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
    } else if (r < w.sitChance + w.lookAroundChance + w.zoomiesChance) {
      this.zoomies();
    } else if (r < w.sitChance + w.lookAroundChance + w.zoomiesChance + w.playChance && this.favouriteToy()) {
      this.startPlay(this.favouriteToy()!.id, false);
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
    // Ground covered, not screen distance: up and down the screen is towards and away from you.
    const ground = Math.hypot(to.x - this.pos.x, (to.y - this.pos.y) / w.floorDepth);
    const duration = (ground / (topSpeed / EASE_PEAK)) * 1000;
    this.state = { mode: 'walk', from: { ...this.pos }, via, to, elapsed: 0, duration };
  }

  /** A burst of mad energy: a few dashes about the screen, swerving and leaping as he goes. */
  private zoomies(): void {
    const dashes = Math.round(pick(this.config.wander.zoomiesDashes, this.random));
    this.state = { mode: 'react', reaction: 'zoomies', target: this.dashTarget(), dashes };
    this.nextLeapAt = this.now + 300 + this.random() * 500;
  }

  /** Somewhere well away to dash to, off in a different direction from the way he's going. */
  private dashTarget(): Point {
    const heading = length(this.vel) > 20 ? Math.atan2(this.vel.y, this.vel.x) : this.random() * Math.PI * 2;
    let best = this.pos;
    let bestRoom = -1;
    for (let attempt = 0; attempt < 8; attempt++) {
      // A swerve of 60 to 150 degrees either way.
      const swerve = (Math.PI / 3 + this.random() * Math.PI * 0.5) * (this.random() < 0.5 ? -1 : 1);
      const angle = heading + swerve;
      const reach = 250 + this.random() * 350;
      const to = this.clampToArea({ x: this.pos.x + Math.cos(angle) * reach, y: this.pos.y + Math.sin(angle) * reach * this.config.wander.floorDepth });
      const room = dist(to, this.pos);
      if (room > bestRoom) {
        best = to;
        bestRoom = room;
      }
      if (room > 200) break;
    }
    return best;
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

  // ---- Work ---------------------------------------------------------------------------

  /** Sat at his desk, or on his way to it: not to be distracted. Asking you to play, he's all yours. */
  private get busyWorking(): boolean {
    const s = this.state;
    return s.mode === 'react' && s.reaction === 'work' && s.phase !== 'beg';
  }

  private speak(text: string | null, ms = SAY_MS): void {
    this.speech = text ? { text, until: this.now + ms } : null;
  }

  private startWork(): void {
    this.calmMs = 0;
    this.vel = { x: 0, y: 0 };
    this.speak('Work time!');
    this.state = {
      mode: 'react',
      reaction: 'work',
      phase: 'announce',
      until: this.now + 1200,
      focusUntil: null,
      spot: null,
      cursorAt: null,
      look: null,
      nextLook: 0,
      nextAsk: 0,
      asked: 0,
    };
  }

  private work(s: WorkState, dt: number): void {
    const desk = this.input.desk;
    const m = this.config.motion;
    const w = this.config.work;
    const k = this.speedScale;
    // The desk's been put away: work's over.
    if (!desk) {
      if (s.phase !== 'beg') this.speak(null);
      this.pause();
      return;
    }
    switch (s.phase) {
      case 'announce':
        this.brake(dt);
        if (this.now >= s.until) {
          s.phase = 'go';
          s.until = this.now + DESK_GO_MS;
        }
        return;

      case 'go': {
        this.vel = this.steer(desk.seat, m.runSpeed * 0.75 * k, m.runAccel * k, dt, 50);
        if (dist(this.pos, desk.seat) < 4 && length(this.vel) < 15) {
          this.vel = { x: 0, y: 0 };
          this.facing = desk.facing;
          s.focusUntil ??= this.now + w.focusMs;
          s.phase = 'type';
          s.until = s.focusUntil;
        } else if (this.now >= s.until) {
          // Can't get there.
          this.pause();
        }
        return;
      }

      case 'type':
        // Sat still at the keyboard.
        this.vel = { x: 0, y: 0 };
        this.facing = desk.facing;
        if (dist(this.pos, desk.seat) > 6) {
          // The desk moved (the screen changed): over to it again.
          s.phase = 'go';
          s.until = this.now + DESK_GO_MS;
          return;
        }
        if (this.now >= s.until) {
          s.phase = 'restless';
          s.until = this.now + w.restlessMs;
          s.nextLook = this.now;
        }
        return;

      case 'restless': {
        this.vel = { x: 0, y: 0 };
        // Looking about: at the screen edges, up, at you, anywhere but the screen.
        if (this.now >= s.nextLook) {
          const { bounds } = this.input;
          const spots = [
            { x: bounds.x + this.random() * bounds.width * 0.3, y: this.pos.y - this.input.size.height * (0.5 + this.random()) },
            { x: this.pos.x + (this.random() * 2 - 1) * 200, y: bounds.y + this.random() * bounds.height * 0.3 },
            this.input.cursor ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
          ];
          s.look = spots[Math.floor(this.random() * spots.length)]!;
          s.nextLook = this.now + 900 + this.random() * 900;
        }
        if (this.now >= s.until) {
          s.phase = 'beg';
          s.until = this.now + w.begMs;
          s.nextAsk = this.now;
          s.look = null;
        }
        return;
      }

      case 'beg': {
        if (this.now >= s.until) {
          // You're not playing. Oh well.
          this.speak(null);
          this.confused();
          return;
        }
        if (this.now >= s.nextAsk) {
          this.speak(ASKS[s.asked % ASKS.length]!);
          s.asked++;
          s.nextAsk = this.now + w.askEveryMs;
        }
        // Over to you: next to the pointer, or out into the middle where you'll see him.
        const { cursor, bounds } = this.input;
        if (cursor && (!s.cursorAt || dist(cursor, s.cursorAt) > 120)) {
          const side: 1 | -1 = this.pos.x < cursor.x ? -1 : 1;
          s.spot = this.clampToArea({ x: cursor.x + side * this.input.size.width * 0.55, y: cursor.y + this.input.size.height * 0.35 });
          s.cursorAt = { ...cursor };
        } else if (!s.spot) {
          s.spot = this.clampToArea({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.75 });
        }
        const far = dist(this.pos, s.spot);
        this.vel = this.steer(s.spot, (far > 220 ? m.runSpeed : m.walkSpeed * 1.8) * k, m.runAccel * k, dt, 50);
        if (far < 6 && cursor) this.facing = cursor.x < this.pos.x ? -1 : 1;
        return;
      }
    }
  }

  // ---- Naps --------------------------------------------------------------------------

  /** Nothing's happened for a while: he goes off somewhere to curl up and sleep. */
  private nap(): void {
    const spot = this.napSpot();
    if (dist(this.pos, spot.spot) < 12) {
      this.settleDown(spot.face);
      return;
    }
    this.state = { mode: 'react', reaction: 'nap', ...spot, until: this.now + NAP_GO_MS };
  }

  /** Lying down for a nap: a yawn, then sleep. */
  private settleDown(face: 1 | -1): void {
    this.vel = { x: 0, y: 0 };
    this.facing = face;
    this.state = { mode: 'sit', activity: 'yawn', until: this.now + 2200, then: 'sleep' };
  }

  /**
   * Where to nap. With the pointer resting somewhere (you're reading, say), right next to
   * it, facing it, on the side he's coming from. Otherwise somewhere sensible: curled up
   * with a toy block if one is nearby, or else down at the bottom of the screen, tucked
   * into the nearer corner, out of the way.
   */
  private napSpot(): Pick<NapState, 'spot' | 'face' | 'cursorAt'> {
    const { cursor, size, bounds } = this.input;
    const area = this.area;
    const inside = (p: Point) => p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height;
    if (cursor && inside(cursor) && this.input.cursorStillMs >= this.config.wander.napByCursorAfterMs) {
      // Lying down, his nose ends up just short of the pointer.
      const gap = size.width * 0.45;
      const y = cursor.y + size.height * 0.2;
      let side: 1 | -1 = this.pos.x < cursor.x ? -1 : 1;
      let spot = this.clampToArea({ x: cursor.x + side * gap, y });
      // No room on that side (against an edge): the other side.
      if (Math.abs(spot.x - cursor.x) < gap * 0.6) {
        side = side === 1 ? -1 : 1;
        spot = this.clampToArea({ x: cursor.x + side * gap, y });
      }
      return { spot, face: side === 1 ? -1 : 1, cursorAt: { ...cursor } };
    }
    let toy: Toy | undefined;
    for (const t of this.toys.toys) {
      if (!t.holder && this.toys.isResting(t) && dist(t, this.pos) < 320 && (!toy || dist(t, this.pos) < dist(toy, this.pos))) toy = t;
    }
    if (toy) {
      const side: 1 | -1 = this.pos.x < toy.x ? 1 : -1;
      const spot = this.clampToArea({ x: toy.x - side * this.toyReach * 1.2, y: toy.y });
      return { spot, face: toy.x < spot.x ? -1 : 1, cursorAt: null };
    }
    const left = this.pos.x < (area.minX + area.maxX) / 2;
    const inset = size.width * 0.25;
    const spot = this.clampToArea({ x: left ? area.minX + inset : area.maxX - inset, y: area.maxY });
    return { spot, face: left ? 1 : -1, cursorAt: null };
  }

  // ---- Play --------------------------------------------------------------------------

  /** The block he'd go and play with: the nearest one nobody's holding. */
  private favouriteToy(): Toy | undefined {
    let best: Toy | undefined;
    let bestDistance = Infinity;
    for (const toy of this.toys.toys) {
      if (toy.holder) continue;
      const d = dist(toy, this.pos);
      if (d < bestDistance) {
        best = toy;
        bestDistance = d;
      }
    }
    return best;
  }

  private startPlay(id: number, excited: boolean): void {
    const p = this.config.play;
    const toy = this.toys.get(id);
    this.state = {
      mode: 'react',
      reaction: 'play',
      toy: id,
      phase: 'go',
      side: toy && toy.x < this.pos.x ? -1 : 1,
      started: this.now,
      until: this.now + GO_MS,
      turns: Math.round(pick(p.turns, this.random)),
      excited,
      done: false,
      mayPounce: this.random() < p.pounceChance,
      landing: null,
      landingAt: -Infinity,
      dest: null,
    };
    if (excited) this.nextLeapAt = this.now + 300 + this.random() * 600;
  }

  private playPhase(s: PlayState, phase: PlayState['phase'], ms: number): void {
    s.phase = phase;
    s.started = this.now;
    s.until = this.now + ms;
    s.done = false;
  }

  private get toyReach(): number {
    return this.input.toyReach ?? this.input.size.width / 3;
  }

  /** Where he stands to play with a block at `at`: beside it, facing it, on the floor he can reach. */
  private playSpot(s: PlayState, at: Point): Point {
    const reach = this.toyReach;
    const { minX, maxX } = this.area;
    // Coming at it from the other side, he goes round to that side.
    if (Math.abs(this.pos.x - at.x) > reach * 1.5) s.side = this.pos.x < at.x ? 1 : -1;
    // Against a wall, he plays from the open side.
    if (at.x - s.side * reach < minX || at.x - s.side * reach > maxX) s.side = s.side === 1 ? -1 : 1;
    return this.clampToArea({ x: at.x - s.side * reach, y: at.y });
  }

  /** The block is where his paw or mouth will be, in front of him. */
  private toyInReach(s: PlayState, toy: Toy): boolean {
    const reach = this.toyReach;
    const front = this.pos.x + s.side * reach;
    return !toy.holder && toy.z < this.toys.size && Math.abs(toy.x - front) < reach * 0.7 && Math.abs(toy.y - this.pos.y) < Math.max(14, reach * 0.4);
  }

  private play(s: PlayState, dt: number): void {
    const m = this.config.motion;
    const p = this.config.play;
    const k = this.speedScale;
    const toy = this.toys.get(s.toy);
    if (!toy) {
      this.pause();
      return;
    }
    const elapsed = this.now - s.started;

    switch (s.phase) {
      case 'go': {
        if (toy.holder === 'user') {
          this.playPhase(s, 'wait', p.waitMs);
          return;
        }
        if (this.now >= s.until) {
          this.pause();
          return;
        }
        if (this.leaping) return;
        const resting = this.toys.isResting(toy);
        // Still flying or sliding: he heads for where it will stop.
        if (!resting && this.now - s.landingAt > 120) {
          s.landing = this.toys.landing(toy.id);
          s.landingAt = this.now;
        }
        const at = resting ? toy : (s.landing ?? toy);
        const spot = this.playSpot(s, at);
        const away = dist(this.pos, spot);
        const fast = s.excited || !resting;
        const top = (fast ? m.chaseSpeed : away > 260 ? m.runSpeed : m.walkSpeed * 1.6) * k;
        const accel = (fast ? m.chaseAccel : m.runAccel) * k;
        this.vel = this.steer(spot, top, accel, dt, 60);
        if (fast) this.maybeLeap(away, top);
        if (!resting) return;
        if (s.mayPounce && away > 70 && away < 220 && Math.abs(spot.y - this.pos.y) < 60) {
          this.playPhase(s, 'pounce', 900);
          return;
        }
        if (away < 5 && length(this.vel) < 25) {
          this.vel = { x: 0, y: 0 };
          if (this.random() < p.tossChance) {
            if (this.input.carries && this.random() < p.carryChance) this.playPhase(s, 'lift', PLAY.liftMs);
            else this.playPhase(s, 'toss', PLAY.tossMs);
          } else {
            this.playPhase(s, 'bat', PLAY.batMs);
          }
        }
        return;
      }

      case 'pounce': {
        const spot = this.playSpot(s, toy);
        this.vel = this.steer(spot, m.pounceSpeed * k, m.chaseAccel * 1.6 * k, dt, 40, false);
        if ((dist(this.pos, spot) < 4 && length(this.vel) < 30) || this.now >= s.until) {
          // Landed by it: give it a swat.
          s.mayPounce = false;
          this.playPhase(s, 'bat', PLAY.batMs);
        }
        return;
      }

      case 'bat': {
        this.brake(dt);
        if (!s.done && elapsed >= PLAY.batHitMs) {
          s.done = true;
          if (this.toyInReach(s, toy)) {
            const speed = pick(p.batSpeed, this.random);
            const v = { x: s.side * speed, y: (this.random() * 2 - 1) * speed * 0.35 * this.config.wander.floorDepth, z: pick(p.batLift, this.random) };
            this.toys.hit(toy.id, v, s.side * (360 + this.random() * 420));
          }
        }
        if (this.now >= s.until) this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        return;
      }

      case 'toss': {
        this.brake(dt);
        if (!s.done && elapsed >= PLAY.tossGrabMs) {
          // Picks it up, if it's still there.
          if (this.toyInReach(s, toy)) this.toys.hold(toy.id, 'pet');
          s.done = true;
        }
        if (elapsed >= PLAY.tossReleaseMs && toy.holder === 'pet') {
          const speed = pick(p.tossSpeed, this.random);
          const v = { x: s.side * speed, y: (this.random() * 2 - 1) * speed * 0.3 * this.config.wander.floorDepth, z: pick(p.tossLift, this.random) };
          this.toys.release(toy.id, 'pet', v, s.side * (420 + this.random() * 480));
        }
        if (this.now >= s.until) this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        return;
      }

      case 'lift': {
        this.brake(dt);
        if (!s.done && elapsed >= PLAY.liftGrabMs) {
          if (this.toyInReach(s, toy)) this.toys.hold(toy.id, 'pet');
          s.done = true;
        }
        if (this.now < s.until) return;
        if (toy.holder === 'pet') {
          s.dest = this.carryTo(s);
          this.playPhase(s, 'carry', CARRY_MS);
        } else {
          // Missed it, or you took it.
          this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        }
        return;
      }

      case 'carry': {
        if (toy.holder !== 'pet') {
          // You've taken it off him.
          this.playPhase(s, toy.holder === 'user' ? 'wait' : 'go', toy.holder === 'user' ? p.waitMs : GO_MS);
          return;
        }
        const dest = s.dest ?? this.pos;
        // A careful toddle: on two legs, he's slower than on four.
        this.vel = this.steer(dest, m.walkSpeed * 0.85 * k, m.accel * k, dt, 40);
        if ((dist(this.pos, dest) < 5 && length(this.vel) < 12) || this.now >= s.until) {
          this.vel = { x: 0, y: 0 };
          s.side = this.facing;
          this.playPhase(s, 'throw', PLAY.throwMs);
        }
        return;
      }

      case 'throw': {
        this.brake(dt);
        if (elapsed >= PLAY.throwReleaseMs && toy.holder === 'pet') {
          const speed = pick(p.tossSpeed, this.random);
          const v = { x: s.side * speed, y: (this.random() * 2 - 1) * speed * 0.3 * this.config.wander.floorDepth, z: pick(p.tossLift, this.random) };
          this.toys.release(toy.id, 'pet', v, s.side * (420 + this.random() * 480));
        }
        if (this.now >= s.until) this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        return;
      }

      case 'watch':
        this.brake(dt);
        if (this.now < s.until) return;
        s.turns--;
        if (s.turns <= 0) {
          this.pause();
          return;
        }
        s.mayPounce = this.random() < p.pounceChance;
        this.playPhase(s, 'go', GO_MS);
        return;

      case 'wait':
        // You've picked it up: he waits for you to throw it, eyes on it.
        this.brake(dt);
        if (toy.holder !== 'user') {
          s.excited = toy.thrownBy === 'user';
          this.playPhase(s, 'go', GO_MS);
        } else if (this.now >= s.until) {
          this.confused();
        }
        return;
    }
  }

  /**
   * Somewhere to carry a block off to: a little way along the floor, mostly across the
   * screen, whichever way there's more room, so he has somewhere to throw it from.
   */
  private carryTo(s: PlayState): Point {
    const { carryDistance } = this.config.play;
    const { minX, maxX } = this.area;
    const roomAhead = s.side > 0 ? maxX - this.pos.x : this.pos.x - minX;
    const roomBehind = s.side > 0 ? this.pos.x - minX : maxX - this.pos.x;
    // Mostly on the way he's facing, unless there's no room that way.
    const way = roomAhead >= carryDistance.min || roomAhead >= roomBehind ? s.side : -s.side;
    const along = pick(carryDistance, this.random);
    const across = (this.random() * 2 - 1) * along * 0.4 * this.config.wander.floorDepth;
    return this.clampToArea({ x: this.pos.x + way * along, y: this.pos.y + across });
  }

  /** Charging about, he sends flying any block in his way (not the one he's playing with). */
  private kickToys(): void {
    const speed = length(this.vel);
    if (speed < this.config.play.kickSpeed * this.speedScale) return;
    const s = this.state;
    const target = s.mode === 'react' && s.reaction === 'play' ? s.toy : null;
    const radius = Math.max(this.toys.size, this.input.size.width * 0.16);
    const depth = this.config.wander.floorDepth;
    for (const toy of this.toys.toys) {
      if (toy.id === target || toy.holder || toy.z > this.toys.size * 0.5) continue;
      const dx = toy.x - this.pos.x;
      const dy = (toy.y - this.pos.y) / depth;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      // On along the way he's going, and off to whichever side it was.
      const side = d > 0 ? { x: dx / d, y: (dy / d) * depth } : { x: 0, y: 0 };
      const v = { x: this.vel.x * 1.15 + side.x * 90, y: this.vel.y * 1.15 + side.y * 90, z: 140 + speed * 0.2 };
      this.toys.hit(toy.id, v, Math.sign(this.vel.x || 1) * (300 + speed * 0.6));
    }
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
            animation = this.leaping ? 'leap' : 'chase';
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
          case 'zoomies':
            animation = this.leaping ? 'leap' : speed > this.config.motion.walkSpeed * 1.5 ? 'chase' : speed > 25 ? 'walk' : 'idle';
            break;
          case 'play':
            phase = s.phase;
            animation = this.playAnimation(s, speed);
            break;
          case 'nap':
            animation = speed > this.config.motion.walkSpeed * 1.5 ? 'run' : speed > 25 ? 'walk' : 'idle';
            break;
          case 'work':
            phase = s.phase;
            animation =
              s.phase === 'announce'
                ? 'attention'
                : s.phase === 'type'
                  ? 'work'
                  : s.phase === 'restless'
                    ? 'sit'
                    : speed > this.config.motion.walkSpeed * 1.5
                      ? 'run'
                      : speed > 25
                        ? 'walk'
                        : s.phase === 'beg' && s.spot && dist(this.pos, s.spot) < 15
                          ? 'attention'
                          : 'idle';
            break;
        }
        break;
    }

    const settled =
      s.mode === 'idle' ||
      s.mode === 'sit' ||
      s.mode === 'sleep' ||
      (s.mode === 'react' &&
        (s.reaction === 'confused' ||
          (s.reaction === 'peek' && s.phase === 'watch') ||
          (s.reaction === 'hide' && s.phase === 'wait') ||
          (s.reaction === 'work' && (s.phase === 'type' || s.phase === 'restless'))));

    let aim: number | null = null;
    let lookAt: Point | null = null;
    if (s.mode === 'react' && s.reaction === 'play') {
      const toy = this.toys.get(s.toy);
      if (s.phase === 'pounce' || s.phase === 'bat' || s.phase === 'toss' || s.phase === 'lift' || s.phase === 'throw') aim = s.side > 0 ? 0 : Math.PI;
      else if (toy && s.phase !== 'go' && s.phase !== 'carry' && dist(toy, this.pos) > 8) aim = Math.atan2(toy.y - this.pos.y, toy.x - this.pos.x);
      // Eyes on the block, except while it's in his mouth.
      if (toy && toy.holder !== 'pet') lookAt = { x: toy.x, y: toy.y - toy.z - this.toys.size / 2 };
    }
    const desk = this.input.desk;
    if (s.mode === 'react' && s.reaction === 'work' && desk && (s.phase === 'type' || s.phase === 'restless')) {
      // Square on to the desk, eyes on the screen (or wandering, restless).
      aim = desk.facing > 0 ? 0 : Math.PI;
      lookAt = s.phase === 'type' ? desk.screen : s.look;
    }
    if (s.mode === 'react' && s.reaction === 'work' && (s.phase === 'announce' || s.phase === 'beg') && speed < 25) {
      // Saying it to you: turned three-quarters towards you, never with his back to you.
      aim = this.facing > 0 ? 0.6 : Math.PI - 0.6;
    }
    const say = this.speech && this.now < this.speech.until ? this.speech.text : null;

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
      aim,
      lookAt,
      say,
    };
  }

  private playAnimation(s: PlayState, speed: number): AnimationName {
    const walk = this.config.motion.walkSpeed;
    switch (s.phase) {
      case 'go':
        return this.leaping ? 'leap' : speed > walk * 1.5 ? (s.excited ? 'chase' : 'run') : speed > 25 ? 'walk' : 'idle';
      case 'pounce':
        return 'jump';
      case 'bat':
        return 'bat';
      case 'toss':
        return 'toss';
      case 'lift':
        return 'lift';
      case 'carry':
        return 'carry';
      case 'throw':
        return 'throw';
      default:
        return speed > 25 ? 'walk' : 'idle';
    }
  }
}
