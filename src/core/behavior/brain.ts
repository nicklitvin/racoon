import type { PetMode } from '../../../shared/settings';
import { PLAY } from '../../sprites/animations';
import type { AnimationName } from '../../sprites/types';
import { clamp, type Point, type Rect } from '../geometry';
import { Toybox, type Toy } from '../toys/toybox';
import { DEFAULT_CONFIG, pick, type BehaviorConfig, type DeskTask } from './config';
import { approach, brake2d, easeInOutSine, quadraticBezier, steer2d, steerArc } from './motion';

/** Top-level states of the behaviour state machine. */
export type Mode = 'idle' | 'walk' | 'sit' | 'sleep' | 'react';

/** What the raccoon is reacting to, while in the "react" mode. */
export type Reaction = 'surprised' | 'chase' | 'pounce' | 'confused' | 'flee' | 'hide' | 'peek' | 'dragged' | 'petted' | 'zoomies' | 'play' | 'nap' | 'work' | 'away';

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
  /** What he's up to (from the settings): playing, working, sleeping or hiding. Play if not given. */
  mode?: PetMode;
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
  /** What's on his computer screen while he's at it (work mode), or null for the screen saver. */
  screen: DeskTask | null;
  /** Gone off the screen altogether (hide mode): nothing of him to draw. */
  hidden: boolean;
}

/**
 * A game with a toy block: going to it, swatting or throwing it (or, for a raccoon,
 * picking it up and walking off with it on his hind legs first), watching where it goes.
 */
interface PlayState {
  mode: 'react';
  reaction: 'play';
  toy: number;
  phase: 'go' | 'stalk' | 'pounce' | 'charge' | 'sniff' | 'bat' | 'nudge' | 'toss' | 'grab' | 'fetch' | 'lift' | 'carry' | 'throw' | 'watch' | 'wait';
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
  /** Where he's carrying it to (or charging to, through it). */
  dest: Point | null;
  /** This turn he creeps up on it before he pounces; might charge through it from a long way off. */
  stalk: boolean;
  mayCharge: boolean;
  /** He's had a sniff at it already this game. */
  sniffed: boolean;
  /** Pushes left, nosing it along. */
  nudges: number;
  /** It's stuck against the edge of the screen out of his reach: this swat hooks it out. */
  hook: boolean;
}

/**
 * Work mode: announcing it's work time, going to his desk and working away at it, for as
 * long as work mode lasts. Taken away from it, he's cross, and goes straight back.
 */
interface WorkState {
  mode: 'react';
  reaction: 'work';
  phase: 'announce' | 'go' | 'type' | 'angry';
  until: number;
  /** What he's doing at the computer, and when he'll switch to something else (once he's sat down). */
  task: DeskTask;
  taskUntil: number;
}

/** Hide mode: running off the side of the screen, gone, or coming back on. */
interface AwayState {
  mode: 'react';
  reaction: 'away';
  phase: 'leave' | 'gone' | 'back';
  /** The edge he goes off by: -1 the left, 1 the right. */
  side: -1 | 1;
  target: Point;
}

/** Off for a nap: going to curl up next to the pointer, or somewhere nearby. */
interface NapState {
  mode: 'react';
  reaction: 'nap';
  spot: Point;
  /** Woken up and carried off: he's cross until this time, before lying down again (0 if not). */
  cross: number;
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
  | { mode: 'react'; reaction: 'peek'; phase: 'approach' | 'beg' | 'sink' | 'watch' | 'up' | 'rise'; sink: number; until: number; begs: number }
  | { mode: 'react'; reaction: 'dragged' }
  | { mode: 'react'; reaction: 'petted'; until: number; resume: WorkState | null }
  | { mode: 'react'; reaction: 'zoomies'; target: Point; dashes: number }
  | PlayState
  | NapState
  | WorkState
  | AwayState;

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
/** How long he's cross for, taken away from his work or woken up. */
const ANGRY_MS = 1700;
/** His desk put down somewhere new, he's cross this much longer before going over to it. */
const DESK_DROPPED_MS = 700;
/** How long he says something for. */
const SAY_MS = 2200;
/** How he sits at the computer for each thing he does at it. */
const TASK_ANIMATION: Record<DeskTask, AnimationName> = { terminal: 'work', web: 'browse', reels: 'reels' };

/** Play phases he has hold of the block through. */
const HOLDING = new Set<PlayState['phase']>(['toss', 'grab', 'fetch', 'lift', 'carry', 'throw']);
/** Nearer a block than this, he heads straight for it rather than running round in a curve (and round it). */
const CURVE_FROM = 200;
/** Getting to a block, he slows down only this close to it beyond braking in time to stop, px. */
const ARRIVE_RADIUS = 12;
/** He leaps only when he's headed this straight for where he's going (the cosine of how far off he is). */
const LEAP_AIM = 0.97;
/** Creeping up on a block, he gives up creeping and pounces after this long. */
const STALK_MS = 5000;
/** Bottom wiggling, about to pounce. */
const WIGGLE_MS = 650;
/** A good sniff at a block. */
const SNIFF_MS = { min: 900, max: 1700 };
/** Nosing a block along, he gives up after this long; and how hard each push is, px/s. */
const NUDGE_MS = 9000;
const NUDGE_SPEED = { min: 210, max: 290 };
/** Typing: how long he asks you to play, and how long he watches before asking again. */
const BEG_MS = 2800;
const WATCH_TYPING_MS = { min: 14_000, max: 22_000 };
/** What he says to get you to stop typing and play, one after another. */
const BEG_LINES = [
  'Ooh, typing? Play with me instead!',
  'Psst… play with me?',
  'So much typing… is it play time yet?',
  'Throw me a block?',
  'I’m bored! Play with me!',
];

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
  /** He was asleep (or about to be) when you picked him up. */
  private wokenByDrag = false;
  /** You're carrying his desk about. */
  private deskHeld = false;
  /** In the air in an excited leap until this time, and when the next one may come. */
  private leapUntil = 0;
  private nextLeapAt = 0;
  private input: WorldInput;
  /** The mode he was last in, to tell when it changes. */
  private mode: PetMode;
  private speech: { text: string; until: number } | null = null;

  constructor(
    initial: WorldInput,
    private readonly random: () => number = Math.random,
    private readonly config: BehaviorConfig = DEFAULT_CONFIG,
    /** The toy blocks he plays with. They move in step with him. */
    readonly toys: Toybox = new Toybox(),
  ) {
    this.input = initial;
    this.mode = initial.mode ?? 'play';
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
    const s = this.state;
    if (this.reaction !== 'dragged') this.wokenByDrag = s.mode === 'sleep' || (s.mode === 'sit' && s.then === 'sleep') || this.reaction === 'nap';
    this.state = { mode: 'react', reaction: 'dragged' };
    this.dragTarget = { ...this.pos };
    this.vel = { x: 0, y: 0 };
    this.calmMs = 0;
  }

  dragTo(feet: Point): void {
    if (this.reaction !== 'dragged') return;
    this.dragTarget = this.clampToArea(feet);
  }

  /**
   * Lets go: he settles exactly where he was dropped. In work mode he's cross at being
   * taken away from his work, and goes back to it. Woken up (or in sleep mode), he's cross
   * at that, and then lies down to sleep again right there.
   */
  release(): void {
    if (this.reaction !== 'dragged') return;
    this.dragTarget = null;
    this.vel = { x: 0, y: 0 };
    if (this.mode === 'work') {
      this.startWork(false);
      const s = this.state as WorkState;
      s.phase = 'angry';
      s.until = this.now + ANGRY_MS;
      this.speak('Hey! I was working!');
      return;
    }
    if (this.mode === 'sleep' || this.wokenByDrag) {
      this.wokenByDrag = false;
      this.speak('Hey! I was sleeping!');
      this.state = { mode: 'react', reaction: 'nap', spot: { ...this.pos }, face: this.facing, cursorAt: null, cross: this.now + ANGRY_MS, until: this.now + NAP_GO_MS };
      return;
    }
    this.idle(1000, 2500);
  }

  /** A click or tap on the raccoon: a pat. He sits and enjoys it. Busy at his desk, he enjoys it and gets back to work. */
  poke(): void {
    const s = this.state;
    if (this.reaction === 'dragged' || this.reaction === 'away') return;
    this.calmMs = 0;
    const resume = s.mode === 'react' && s.reaction === 'work' ? s : s.mode === 'react' && s.reaction === 'petted' ? s.resume : null;
    this.state = { mode: 'react', reaction: 'petted', until: this.now + PETTED_MS, resume };
  }

  /** The pointer moving over him while he's being petted: he enjoys it for longer. */
  stroke(): void {
    const s = this.state;
    if (s.mode === 'react' && s.reaction === 'petted') s.until = Math.max(s.until, this.now + STROKED_MS);
  }

  /** A tap on his desk while he's working at it gets you shushed. */
  deskTapped(): void {
    if (this.busyWorking) this.speak('Shh! Working.');
  }

  /** You've picked his desk up: sat at it (or on his way), he's cross, and waits to see where it goes. */
  deskLifted(): void {
    this.deskHeld = true;
    const s = this.state;
    if (s.mode !== 'react' || s.reaction !== 'work' || (s.phase !== 'type' && s.phase !== 'go')) return;
    this.vel = { x: 0, y: 0 };
    s.phase = 'angry';
    s.until = Infinity;
    this.speak('Hey! I need to work!');
  }

  /** You've put his desk down somewhere else: off he goes to it, to get back to work. */
  deskDropped(): void {
    this.deskHeld = false;
    const s = this.state;
    if (s.mode === 'react' && s.reaction === 'work' && s.phase === 'angry' && s.until === Infinity) s.until = this.now + DESK_DROPPED_MS;
  }

  /**
   * You threw one of his toys (or dropped it): he's off after it, unless he's asleep, in
   * your hand or busy watching you type.
   */
  toyThrown(id: number): void {
    const s = this.state;
    const r = this.reaction;
    if (this.mode !== 'play' || s.mode === 'sleep' || r === 'dragged' || r === 'peek' || r === 'hide' || !this.toys.get(id)) return;
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
    this.followMode();
    this.handleStimuli(dt);
    this.think(dt);
    this.integrate(dt);
    this.updateFacing();
    this.toys.step(dt);
    this.kickToys();
    // Whatever he's doing now, if it isn't throwing or carrying the block he has, he drops it.
    const held = this.toys.heldBy('pet');
    const s = this.state;
    const holding = s.mode === 'react' && s.reaction === 'play' && HOLDING.has(s.phase) && s.toy === held?.id;
    if (held && !holding) {
      this.toys.release(held.id, 'pet', { x: 0, y: 0, z: 0 });
    }
  }

  private handleStimuli(dt: number): void {
    const { cursor, cursorExcited, typingActive } = this.input;
    const s = this.state;
    const r = this.reaction;
    // Only playing does he chase the pointer, watch you type, or run off from it. Working,
    // sleeping or hiding, nothing distracts him (except being picked up, or a pat).
    if (this.mode !== 'play') {
      this.calmMs = 0;
      this.cursorWasNear = cursor !== null && dist(cursor, this.center) < this.config.reactions.fleeRadius;
      return;
    }
    const alreadyChasing = r === 'chase' || r === 'pounce' || r === 'dragged' || (s.mode === 'react' && s.reaction === 'surprised' && s.next === 'chase');

    if (cursorExcited && cursor && !alreadyChasing) {
      this.surprise('chase');
      return;
    }

    const napping = s.mode === 'react' && s.reaction === 'nap';
    const calm = s.mode !== 'react' || napping;
    if (typingActive && calm) {
      this.state = { mode: 'react', reaction: 'peek', phase: 'approach', sink: 0, until: 0, begs: 0 };
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
        this.maybeLeap(target, m.chaseSpeed * k);
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
        } else {
          this.idle(1500, 3000);
        }
        return;

      case 'work':
        this.work(s, dt);
        return;

      case 'away':
        this.away(s, dt);
        return;

      case 'zoomies': {
        if (this.leaping) return;
        const top = m.runSpeed * ZOOMIES_SPEED * k;
        const last = s.dashes <= 1;
        this.vel = this.steer(s.target, top, m.runAccel * k, dt, last ? 70 : 10);
        const left = dist(this.pos, s.target);
        this.maybeLeap(s.target, top, last ? m.runAccel * k : undefined);
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
        if (this.now < s.cross) {
          // Woken up: cross about it first.
          this.brake(dt);
          return;
        }
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
          if (!this.input.typingActive) {
            this.idle(800, 2000);
            return;
          }
          // Down to the bottom of the screen, in the middle, where you'll see him.
          const { bounds } = this.input;
          const target = { x: clamp(bounds.x + bounds.width / 2, this.area.minX, this.area.maxX), y: floor };
          this.vel = this.steer(target, m.runSpeed * 0.6 * k, m.runAccel * k, dt, 60);
          if (dist(this.pos, target) < 3 && length(this.vel) < 12) {
            this.vel = { x: 0, y: 0 };
            this.beg(s);
          }
          return;
        }
        if (s.phase === 'beg') {
          // Waving at you to come and play.
          this.vel = { x: 0, y: 0 };
          if (this.now >= s.until) s.phase = this.input.typingActive ? 'sink' : 'rise';
          return;
        }
        if (!this.input.typingActive && s.phase !== 'rise') s.phase = 'rise';
        if (s.phase === 'sink') {
          s.sink = approach(s.sink, depth, 110 * dt);
          if (s.sink >= depth) {
            s.phase = 'watch';
            s.until = this.now + pick(WATCH_TYPING_MS, this.random);
          }
        } else if (s.phase === 'watch') {
          s.sink = depth;
          // Still at it: up he comes to ask again.
          if (this.now >= s.until) s.phase = 'up';
        } else if (s.phase === 'up') {
          s.sink = approach(s.sink, 0, 140 * dt);
          if (s.sink <= 0) this.beg(s);
        } else {
          s.sink = approach(s.sink, 0, 140 * dt);
          if (s.sink <= 0) {
            if (s.begs > 0) this.speak('Yay! Play time!');
            this.idle(800, 2000);
          }
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
    // Off the screen and back, nothing holds him in.
    if (s.mode === 'react' && s.reaction === 'away') return;
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
      if (s.phase === 'carry' || s.phase === 'fetch' || s.phase === 'charge' || s.phase === 'nudge') {
        if (Math.abs(this.vel.x) > 12) this.facing = this.vel.x < 0 ? -1 : 1;
      } else if (s.phase === 'pounce' || s.phase === 'bat' || s.phase === 'toss' || s.phase === 'grab' || s.phase === 'lift' || s.phase === 'throw' || !toy) {
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
   * with room ahead to land before he gets where he's going. Going somewhere that stays
   * put (`accel` given), only headed straight for it (he flies straight on, so a leap
   * mid-turn would carry him off somewhere else), and with room to land and still pull up
   * before he gets there, so he never overshoots it and has to come back round.
   */
  private maybeLeap(target: Point, topSpeed: number, accel?: number): void {
    const { leapMs, leapEvery } = this.config.motion;
    const speed = length(this.vel);
    if (this.now < this.nextLeapAt || speed < topSpeed * 0.6) return;
    const left = dist(this.pos, target);
    const flight = speed * 1.1 * (leapMs / 1000);
    if (accel === undefined) {
      if (left < flight * 0.64) return;
    } else {
      if (left < 1 || (this.vel.x * (target.x - this.pos.x) + this.vel.y * (target.y - this.pos.y)) / (speed * left) < LEAP_AIM) return;
      if (left < flight + (speed * 1.1) ** 2 / (2 * accel * 0.8)) return;
    }
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

  // ---- Modes --------------------------------------------------------------------------

  /**
   * Keeps him to the mode picked in the settings. Whatever he's doing, in work mode he goes
   * back to his desk, in sleep mode back to sleep, and in hide mode off the screen; and when
   * the mode changes, he changes what he's doing to suit.
   */
  private followMode(): void {
    const mode = this.input.mode ?? 'play';
    const changed = mode !== this.mode;
    this.mode = mode;
    const s = this.state;
    const r = this.reaction;
    if (r === 'dragged') return;
    const away = s.mode === 'react' && s.reaction === 'away' ? s : null;
    if (mode === 'hide') {
      if (!away || away.phase === 'back') this.leave();
      return;
    }
    if (away) {
      if (away.phase !== 'back') this.comeBack(away);
      return;
    }
    const sleepy = s.mode === 'sleep' || (s.mode === 'sit' && s.then === 'sleep') || r === 'nap';
    if (mode === 'work') {
      if (r !== 'work' && r !== 'petted') this.startWork(changed);
      return;
    }
    if (mode === 'sleep') {
      if (!sleepy && r !== 'petted') this.nap();
      return;
    }
    // Back to play: up from his desk, or awake with a stretch and a yawn.
    if (changed && r === 'work') {
      this.speak(null);
      this.pause();
    } else if (changed && sleepy) {
      this.state = { mode: 'sit', activity: 'yawn', until: this.now + 2200, then: 'idle' };
    }
  }

  /** Sat at his desk, or on his way to it: not to be distracted. */
  private get busyWorking(): boolean {
    return this.state.mode === 'react' && this.state.reaction === 'work';
  }

  /** Something else to do at the computer: never the same thing again straight away. */
  private nextTask(current: DeskTask): DeskTask {
    const { tasks } = this.config.work;
    const others = (Object.keys(tasks) as DeskTask[]).filter((t) => t !== current);
    const total = others.reduce((sum, t) => sum + tasks[t].weight, 0);
    let roll = this.random() * total;
    for (const t of others) {
      roll -= tasks[t].weight;
      if (roll <= 0) return t;
    }
    return others[others.length - 1]!;
  }

  private speak(text: string | null, ms = SAY_MS): void {
    this.speech = text ? { text, until: this.now + ms } : null;
  }

  /** You're typing away: he waves at you, and asks you to play with him instead. */
  private beg(s: Extract<State, { reaction: 'peek' }>): void {
    s.phase = 'beg';
    s.until = this.now + BEG_MS;
    this.speak(BEG_LINES[s.begs % BEG_LINES.length]!, BEG_MS);
    s.begs++;
  }

  /** Off to his desk, saying it's work time if he's only just been told. */
  private startWork(announce: boolean): void {
    this.calmMs = 0;
    this.vel = { x: 0, y: 0 };
    if (announce) this.speak('Work time!');
    this.state = {
      mode: 'react',
      reaction: 'work',
      phase: announce ? 'announce' : 'go',
      until: this.now + (announce ? 1200 : DESK_GO_MS),
      task: 'terminal',
      taskUntil: -1,
    };
  }

  private work(s: WorkState, dt: number): void {
    const desk = this.input.desk;
    const m = this.config.motion;
    const w = this.config.work;
    const k = this.speedScale;
    if (!desk) {
      // No desk to go to (yet): he waits.
      this.brake(dt);
      return;
    }
    switch (s.phase) {
      case 'announce':
      case 'angry':
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
          if (s.taskUntil < 0) {
            s.task = 'terminal';
            s.taskUntil = this.now + pick(w.tasks.terminal.ms, this.random);
          }
          s.phase = 'type';
        } else if (this.now >= s.until) {
          // Stuck: he tries again.
          s.until = this.now + DESK_GO_MS;
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
        // Over to another tab now and then: some terminal, some browsing, a few reels.
        if (this.now >= s.taskUntil) {
          s.task = this.nextTask(s.task);
          s.taskUntil = this.now + pick(w.tasks[s.task].ms, this.random);
        }
        return;
    }
  }

  /** Hide mode: off he runs, by the nearer side of the screen. */
  private leave(): void {
    const { bounds, size } = this.input;
    this.speak(null);
    const side: -1 | 1 = this.pos.x < bounds.x + bounds.width / 2 ? -1 : 1;
    const x = side < 0 ? bounds.x - size.width : bounds.x + bounds.width + size.width;
    this.state = { mode: 'react', reaction: 'away', phase: 'leave', side, target: { x, y: this.pos.y } };
  }

  /** Out of hiding: he runs back on from the side he went off by. */
  private comeBack(s: AwayState): void {
    const { minX, maxX } = this.area;
    const inset = this.input.size.width * 0.8 + this.random() * 150;
    s.phase = 'back';
    s.target = this.clampToArea({ x: s.side < 0 ? minX + inset : maxX - inset, y: this.pos.y });
    // Waiting just off the edge.
    const { bounds, size } = this.input;
    this.pos = { x: s.side < 0 ? bounds.x - size.width * 0.6 : bounds.x + bounds.width + size.width * 0.6, y: this.pos.y };
  }

  private away(s: AwayState, dt: number): void {
    const m = this.config.motion;
    const k = this.speedScale;
    switch (s.phase) {
      case 'leave': {
        this.vel = this.steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 20, false);
        const { bounds, size } = this.input;
        const off = s.side < 0 ? this.pos.x < bounds.x - size.width * 0.6 : this.pos.x > bounds.x + bounds.width + size.width * 0.6;
        if (off) {
          s.phase = 'gone';
          this.vel = { x: 0, y: 0 };
        }
        return;
      }
      case 'gone':
        this.vel = { x: 0, y: 0 };
        return;
      case 'back':
        this.vel = this.steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 50, false);
        if (dist(this.pos, s.target) < 5 && length(this.vel) < 15) this.idle(800, 2000);
        return;
    }
  }

  // ---- Naps --------------------------------------------------------------------------

  /**
   * Nothing's happened for a while: he goes off somewhere to curl up and sleep. Told to
   * sleep (sleep mode), he lies down right where he is.
   */
  private nap(): void {
    const spot = this.mode === 'sleep' ? this.napHere() : this.napSpot();
    if (dist(this.pos, spot.spot) < 12) {
      this.settleDown(spot.face);
      return;
    }
    this.state = { mode: 'react', reaction: 'nap', ...spot, cross: 0, until: this.now + NAP_GO_MS };
  }

  /** Lying down where he is: where he'd come to a stop, if he's on the move. */
  private napHere(): Pick<NapState, 'spot' | 'face' | 'cursorAt'> {
    const spot = this.clampToArea({ x: this.pos.x + this.vel.x * 0.25, y: this.pos.y + this.vel.y * 0.25 });
    return { spot, face: this.facing, cursorAt: null };
  }

  /** Lying down for a nap: a yawn, then sleep. */
  private settleDown(face: 1 | -1): void {
    this.vel = { x: 0, y: 0 };
    this.facing = face;
    this.state = { mode: 'sit', activity: 'yawn', until: this.now + 2200, then: 'sleep' };
  }

  /**
   * Where to nap. With the pointer resting somewhere (you're reading, say), right next to
   * it, facing it, on the side he's coming from. Otherwise curled up with a toy block if
   * one is nearby, or else wherever he fancies, a few steps from where he is.
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
    const angle = this.random() * Math.PI * 2;
    const far = size.width * (0.4 + this.random() * 1.2);
    const spot = this.clampToArea({ x: this.pos.x + Math.cos(angle) * far, y: this.pos.y + Math.sin(angle) * far * 0.6 });
    // Facing into the screen, not the wall.
    return { spot, face: spot.x < (area.minX + area.maxX) / 2 ? 1 : -1, cursorAt: null };
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
      stalk: this.random() < p.stalkChance,
      mayCharge: this.random() < p.chargeChance,
      sniffed: false,
      nudges: 0,
      hook: false,
    };
    if (excited) this.nextLeapAt = this.now + 300 + this.random() * 600;
  }

  /**
   * At the block: what to do with it this time. Pick it up and throw it (a raccoon might
   * walk off with it first), or one of the rest: swat it, have a sniff at it first, nose it
   * along the floor, or trot off with it.
   */
  private pickMove(s: PlayState): void {
    const p = this.config.play;
    const carries = this.input.carries === true;
    if (this.random() < p.tossChance) {
      if (carries && this.random() < p.carryChance) this.playPhase(s, 'lift', PLAY.liftMs);
      else this.playPhase(s, 'toss', PLAY.tossMs);
      return;
    }
    const { bat, nudge, fetch } = p.moves;
    // All excited, or having had a sniff already, he doesn't stop to sniff it.
    const sniff = s.excited || s.sniffed ? 0 : p.moves.sniff;
    let roll = this.random() * (bat + sniff + nudge + fetch);
    if ((roll -= bat) < 0) this.playPhase(s, 'bat', PLAY.batMs);
    else if ((roll -= sniff) < 0) {
      s.sniffed = true;
      this.playPhase(s, 'sniff', pick(SNIFF_MS, this.random));
    } else if ((roll -= nudge) < 0) this.startNudging(s);
    else if (carries) this.playPhase(s, 'lift', PLAY.liftMs);
    else this.playPhase(s, 'grab', PLAY.tossMs);
  }

  private startNudging(s: PlayState): void {
    s.nudges = Math.round(pick(this.config.play.nudges, this.random));
    this.playPhase(s, 'nudge', NUDGE_MS);
  }

  /** Straight at it at full tilt, through it and out the other side, kicking it on. */
  private charge(s: PlayState, toy: Toy): void {
    const dx = toy.x - this.pos.x;
    const dy = toy.y - this.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    s.dest = this.clampToArea({ x: toy.x + (dx / d) * 160, y: toy.y + (dy / d) * 160 });
    this.playPhase(s, 'charge', 4000);
    this.nextLeapAt = this.now + 200;
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
    // He plays with it from whichever side of it is nearer him, so he never goes round it
    // (and keeps to the side he's going for unless the other is clearly nearer).
    const here = Math.abs(this.pos.x - (at.x - s.side * reach));
    const there = Math.abs(this.pos.x - (at.x + s.side * reach));
    if (there + reach * 0.5 < here) s.side = s.side === 1 ? -1 : 1;
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
        const accel = (fast ? m.chaseAccel : away > 260 ? m.runAccel : m.accel * 2) * k;
        // Close in, straight for it: running round in a curve, he'd go round and round it.
        // He pulls up in a few quick steps rather than inching the last bit.
        this.vel = this.steer(spot, top, accel, dt, ARRIVE_RADIUS, away > CURVE_FROM);
        if (fast) this.maybeLeap(spot, top, accel);
        if (!resting) return;
        if (s.mayCharge && away > 280) {
          s.mayCharge = false;
          this.charge(s, toy);
          return;
        }
        // A pounce is a lunge forwards: only at a spot ahead of him, across the floor.
        const ahead = (spot.x - this.pos.x) * s.side > Math.abs(spot.y - this.pos.y);
        if (s.mayPounce && ahead && away > 70 && away < 240 && Math.abs(spot.y - this.pos.y) < 60) {
          this.playPhase(s, s.stalk ? 'stalk' : 'pounce', s.stalk ? STALK_MS : 900);
          return;
        }
        if (away < 4 && length(this.vel) < 45) {
          this.vel = { x: 0, y: 0 };
          // Stuck in against the edge of the screen, out of reach: he hooks it out with a paw.
          if (!this.toyInReach(s, toy)) {
            s.side = toy.x < this.pos.x ? -1 : 1;
            s.hook = true;
            this.playPhase(s, 'bat', PLAY.batMs);
          } else this.pickMove(s);
        }
        return;
      }

      case 'stalk': {
        // Creeping up on it, low down; then still, bottom wiggling; and a pounce.
        if (!this.toys.isResting(toy)) {
          this.playPhase(s, 'go', GO_MS);
          return;
        }
        const spot = this.playSpot(s, toy);
        if (!s.done && dist(this.pos, spot) > 80) {
          this.vel = this.steer(spot, m.walkSpeed * 0.45 * k, m.accel * k, dt, 30, false);
        } else {
          if (!s.done) {
            s.done = true;
            s.until = this.now + WIGGLE_MS;
          }
          this.brake(dt);
        }
        if (this.now >= s.until) {
          s.mayPounce = false;
          this.playPhase(s, 'pounce', 900);
        }
        return;
      }

      case 'charge': {
        if (this.leaping) return;
        const dest = s.dest ?? toy;
        const top = m.chaseSpeed * k;
        this.vel = this.steer(dest, top, m.chaseAccel * k, dt, 40, false);
        this.maybeLeap(dest, top, m.chaseAccel * k);
        // On through it, pulling up on the far side (not skidding to a stop).
        if ((dist(this.pos, dest) < 6 && length(this.vel) < 30) || this.now >= s.until) this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        return;
      }

      case 'sniff': {
        this.brake(dt);
        if (this.now < s.until) return;
        // Then: a swat, a push along the floor, or not interested after all.
        const roll = this.random();
        if (roll < 0.45) this.playPhase(s, 'bat', PLAY.batMs);
        else if (roll < 0.75) this.startNudging(s);
        else this.pause();
        return;
      }

      case 'nudge': {
        if (toy.holder) {
          this.playPhase(s, toy.holder === 'user' ? 'wait' : 'go', toy.holder === 'user' ? p.waitMs : GO_MS);
          return;
        }
        // Up behind it, a push with his nose, and after it again.
        const spot = this.playSpot(s, toy);
        this.vel = this.steer(spot, m.walkSpeed * 1.25 * k, m.accel * 2 * k, dt, 20, false);
        if (this.toyInReach(s, toy) && Math.hypot(toy.vx, toy.vy) < 40) {
          if (s.nudges <= 0) {
            this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
            return;
          }
          s.nudges--;
          const speed = pick(NUDGE_SPEED, this.random);
          this.toys.hit(toy.id, { x: s.side * speed, y: (this.random() * 2 - 1) * speed * 0.15 * this.config.wander.floorDepth, z: 40 }, s.side * 240);
        }
        if (this.now >= s.until) this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        return;
      }

      case 'grab': {
        // Picks it up in his mouth, to trot off with it.
        this.brake(dt);
        if (!s.done && elapsed >= PLAY.tossGrabMs) {
          if (this.toyInReach(s, toy)) this.toys.hold(toy.id, 'pet');
          s.done = true;
        }
        if (elapsed < PLAY.tossGrabMs + 160) return;
        if (toy.holder === 'pet') {
          s.dest = this.carryTo(s, p.fetchDistance);
          this.playPhase(s, 'fetch', CARRY_MS);
        } else {
          this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
        }
        return;
      }

      case 'fetch': {
        if (toy.holder !== 'pet') {
          this.playPhase(s, toy.holder === 'user' ? 'wait' : 'go', toy.holder === 'user' ? p.waitMs : GO_MS);
          return;
        }
        const dest = s.dest ?? this.pos;
        this.vel = this.steer(dest, m.walkSpeed * 1.4 * k, m.accel * 1.5 * k, dt, 40);
        if ((dist(this.pos, dest) < 6 && length(this.vel) < 15) || this.now >= s.until) {
          // Drops it, and has a look at it.
          this.vel = { x: 0, y: 0 };
          this.toys.release(toy.id, 'pet', { x: this.facing * 40, y: 0, z: 60 });
          this.playPhase(s, 'watch', pick(WATCH_MS, this.random));
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
          if (s.hook && !toy.holder && toy.z <= 0) {
            // Out from the wall, back past him.
            s.hook = false;
            const speed = pick(p.batSpeed, this.random);
            this.toys.hit(toy.id, { x: -s.side * speed, y: (this.random() * 2 - 1) * speed * 0.3 * this.config.wander.floorDepth, z: pick(p.batLift, this.random) }, -s.side * 400);
          } else if (this.toyInReach(s, toy)) {
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
          // Off with it, somewhere to throw it from.
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
        s.stalk = this.random() < p.stalkChance;
        s.mayCharge = this.random() < p.chargeChance;
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
  private carryTo(s: PlayState, carryDistance = this.config.play.carryDistance): Point {
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
    // Not the one he's playing with, unless he's charging through it on purpose.
    const target = s.mode === 'react' && s.reaction === 'play' && s.phase !== 'charge' ? s.toy : null;
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
            animation =
              s.phase === 'beg' ? 'attention' : s.phase !== 'approach' ? 'peek' : speed > this.config.motion.walkSpeed * 1.5 ? 'run' : speed > 25 ? 'walk' : 'idle';
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
            animation = this.now < s.cross ? 'angry' : speed > this.config.motion.walkSpeed * 1.5 ? 'run' : speed > 25 ? 'walk' : 'idle';
            break;
          case 'work':
            phase = s.phase;
            animation =
              s.phase === 'announce'
                ? 'attention'
                : s.phase === 'angry'
                  ? 'angry'
                  : s.phase === 'type'
                    ? TASK_ANIMATION[s.task]
                    : speed > this.config.motion.walkSpeed * 1.5
                      ? 'run'
                      : speed > 25
                        ? 'walk'
                        : 'idle';
            break;
          case 'away':
            phase = s.phase;
            animation = s.phase === 'gone' ? 'idle' : 'run';
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
          (s.reaction === 'work' && s.phase === 'type') ||
          (s.reaction === 'away' && s.phase === 'gone')));

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
    if (s.mode === 'react' && s.reaction === 'work' && desk && s.phase === 'type') {
      // Square on to the desk, eyes on the screen.
      aim = desk.facing > 0 ? 0 : Math.PI;
      lookAt = desk.screen;
    }
    const cross = (s.mode === 'react' && s.reaction === 'work' && (s.phase === 'announce' || s.phase === 'angry')) || (s.mode === 'react' && s.reaction === 'nap' && this.now < s.cross);
    if (cross && speed < 25) {
      // Saying it to you: turned three-quarters towards you, never with his back to you.
      aim = this.facing > 0 ? 0.6 : Math.PI - 0.6;
    }
    // Watching you carry his desk off.
    if (s.mode === 'react' && s.reaction === 'work' && s.phase === 'angry' && this.deskHeld && desk) lookAt = desk.screen;
    if (s.mode === 'react' && s.reaction === 'peek' && s.phase === 'beg') aim = this.facing > 0 ? 0.6 : Math.PI - 0.6;
    const say = this.speech && this.now < this.speech.until ? this.speech.text : null;
    const screen = s.mode === 'react' && s.reaction === 'work' && s.phase === 'type' && desk ? s.task : null;

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
      screen,
      hidden: s.mode === 'react' && s.reaction === 'away' && s.phase === 'gone',
    };
  }

  private playAnimation(s: PlayState, speed: number): AnimationName {
    const walk = this.config.motion.walkSpeed;
    switch (s.phase) {
      case 'go':
        return this.leaping ? 'leap' : speed > walk * 1.5 ? (s.excited ? 'chase' : 'run') : speed > 25 ? 'walk' : 'idle';
      case 'pounce':
        return 'jump';
      case 'charge':
        return this.leaping ? 'leap' : speed > walk * 1.5 ? 'chase' : speed > 25 ? 'walk' : 'idle';
      case 'stalk':
        return 'stalk';
      case 'sniff':
        return 'sniff';
      case 'nudge':
        return 'nudge';
      case 'grab':
        return 'toss';
      case 'fetch':
        return speed > 8 ? 'fetch' : 'idle';
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
