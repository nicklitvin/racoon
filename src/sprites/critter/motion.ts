import type { Point } from '../../core/geometry';
import type { AnimationName, RaccoonFrame } from '../types';
import { NO_LIFE, type Act, type ActInput, type Gaze, type Life } from './act';
import type { Build } from './build';
import { strideAt } from './gait';
import { angleDiff, bump, clamp, DEG, dir, lerp, noise1, rng, smooth } from './kit';
import { POSE_KEYS, type Pose, type PoseFlags, type PoseKey } from './pose';
import { keepInReach, scruffAt, tailRest, tailRoot } from './rig';
import { BodyView, DEPTH, worldYaw, type Projected } from './view';

/**
 * Everything that makes the pose on screen move like an animal rather than switch like a
 * slideshow:
 * - Changing animation never snaps. The difference between what's shown and the new pose
 *   is carried over and dies away like a spring ("inertialization"), each body part at its
 *   own pace: the body leads, the head follows, the ears swing past and settle.
 * - He faces the way he's going on the floor, up, down or across the screen, and the gait
 *   advances with ground actually covered there, so planted paws don't skate.
 * - On the move his body follows the path he runs: it always points the way he's going,
 *   and bends along a curve, shoulders ahead of the hips, as much as the curve is sharp.
 * - Turning on the spot, the shoulders swing round first and the hips follow, so the spine
 *   bows into the turn, and he steps round on his paws.
 * - The tail is a chain with weight: it trails, sways and whips with the body, and is never
 *   quite still: it drifts, swishes lazily and curls at the tip, and every swing runs
 *   down it from the base to the tip.
 * - Carried by the scruff, the body swings like a pendulum from the pointer's movement.
 * - Little unscripted life: glances, ear flicks, blinks (and the slow cat blink), a
 *   twitching tail tip.
 */

export interface Point3 extends Point {
  /** Out of his right side. */
  z: number;
}

export interface Shown {
  pose: Pose;
  flags: PoseFlags;
  /** Tail joints in his own frame, root first. */
  tail: Point3[];
  /** Which way he faces on the floor, and the camera. */
  view: BodyView;
  /** The head: which way it faces on the floor (degrees, like the view) and its sideways shift as the neck bends. */
  head: { yaw: number; z: number };
  /** The scruff on screen (drawing units from the feet): where he's held, and what he swings from. */
  scruff: Projected;
  /** Wall-clock time, ms, for things that ripple on by themselves (water). */
  clock: number;
  /** How fast he's going over the floor, units/s: across the screen, and towards you. */
  drift: Point;
}

type Actor = (input: ActInput) => Act;

/** How fast each part catches up after a change: spring frequency (rad/s) and damping ratio. */
function springFor(key: PoseKey): [number, number] {
  if (key === 'earN' || key === 'earF') return [13, 0.45];
  if (key.startsWith('tail') || key === 'puff') return [10, 0.85];
  if (key[0] === 'h') return [10, 0.75];
  if (key === 'lids' || key === 'happy' || key === 'mouth' || key === 'tongue' || key === 'pupil' || key.startsWith('look')) return [22, 1];
  if (key === 'rot') return [12, 1];
  return [13, 0.9];
}
const SPRINGS = POSE_KEYS.map(springFor);

/**
 * Within an animation, a change of target this big in one frame is a jump to smooth over
 * (eyes darting with each key press while peeking), not movement. Positions are never
 * smoothed this way: a paw racing forward mid-stride must not be slowed down.
 */
const SMALL_RANGE = new Set<PoseKey>(['breath', 'puff', 'earN', 'earF', 'lids', 'happy', 'lookX', 'lookY', 'pupil', 'mouth', 'tongue', 'scapN', 'scapF', 'squash', 'tailStiff', 'tailSide']);
const JUMP = POSE_KEYS.map((key) => (SMALL_RANGE.has(key) ? 0.3 : key === 'hroll' || key === 'hyaw' || key === 'hturn' ? 20 : Infinity));

/** Left and right swap when he's seen from his other side, so the paw he lifts is the one you see. */
const MIRRORED: [PoseKey, PoseKey][] = [
  ['fnx', 'ffx'],
  ['fny', 'ffy'],
  ['fna', 'ffa'],
  ['bnx', 'bfx'],
  ['bny', 'bfy'],
  ['bna', 'bfa'],
  ['earN', 'earF'],
  ['scapN', 'scapF'],
];
/** While moving, which side is which doesn't matter, so it never swaps mid-stride. */
const LOCOMOTION = new Set<AnimationName>(['walk', 'run', 'chase', 'jump', 'leap']);
const RESTING = new Set<AnimationName>(['idle', 'sit', 'groom', 'yawn', 'sleep', 'happy', 'confused']);

/** How much the tail wanders on its own in each animation: 0 still (posed), 1 a relaxed animal's. */
const TAIL_LIFE: Partial<Record<AnimationName, number>> = {
  idle: 1,
  sit: 0.5,
  confused: 1.3,
  peek: 0.6,
  walk: 0.6,
  groom: 0.4,
  yawn: 0.4,
  run: 0.3,
  chase: 0.35,
  surprised: 0.5,
  sleep: 0.12,
};
/** How far a tail wrapped round the paws comes on round in front of them, past straight ahead (radians). */
const WRAP_PAST = 0.55;
/** How long a sideways swing takes to travel from one tail joint to the next, s. */
const TAIL_RIPPLE = 0.03;

/** How far the head swings out sideways as the neck turns, units. */
const NECK_REACH: Record<Build['species'], number> = { cat: 3.2, fox: 3.4, raccoon: 2.6, otter: 2.4 };

/**
 * Each species' tail: how much it wanders on its own, and how slowly. A cat's or a fox's is
 * expressive; a raccoon's is a heavy brush; an otter's is a thick rudder that mostly trails.
 */
const TAIL_TEMPER: Record<Build['species'], { amount: number; pace: number }> = {
  cat: { amount: 1, pace: 1 },
  fox: { amount: 0.8, pace: 1.15 },
  raccoon: { amount: 0.9, pace: 1.3 },
  otter: { amount: 0.45, pace: 1.5 },
};

/** Nominal ground speeds, used when the frame doesn't say how fast he's going (previews). */
const NOMINAL_SPEED: Partial<Record<AnimationName, number>> = { walk: 76, run: 300, chase: 560, leap: 560 };

/**
 * How briskly the shoulders swing round to a new heading, and the hips after them: spring
 * frequencies, rad/s (critically damped). The gap between them is how far the spine bends.
 */
const TURN_RATE = 10;
const HIPS_RATE = 7.5;
/** The same, wheeling round to dash off somewhere: much quicker. */
const DASH_TURN_RATE = 17;
const DASH_HIPS_RATE = 12;
/** How tightly the body follows the path on the move: spring frequency, rad/s. */
const FOLLOW_RATE = 24;
/** Below this ground speed (units/s) he isn't following a path, just turning. */
const PATH_SPEED = 20;
/**
 * Following a path only once the body is lined up with it to within this (radians): set
 * off the other way, he turns round first, as he would standing.
 */
const PATH_ALIGNED = 1.2;
/** The fastest a path can be seen to swing round, rad/s; anything quicker is a fresh start. */
const PATH_SPIN = 14;
/** How much more than the curve itself the spine bends round it, so you can see it. */
const PATH_BEND = 1.4;
/** Turning on the spot faster than this (rad/s), he steps round rather than pivot on planted paws; he stops below the second. */
const STEP_TURN = [1.6, 0.6] as const;
/** How far the paws travel per radian turned on the spot, units: about half his length. */
const TURN_STRIDE = 13;
/**
 * Watching the pointer, the eyes keep up but the head doesn't track it like a turret: it
 * stays put until the pointer has wandered this far (degrees) from where it's pointed, then
 * swings over to catch up, at this spring rate (rad/s), overshooting a touch.
 */
const GAZE_SLACK = 11;
const GAZE_RATE = 5.5;
/** How far in front of the screen the pointer is taken to be, when working out where to look. */
const POINTER_DEPTH = 45;

interface Event {
  start: number;
  end: number;
}

export class Motion {
  private readonly random: () => number;
  private clock = 0;
  private started = false;
  private animation: AnimationName | null = null;
  private animationStart = 0;
  private phase = 0;
  private speed = 0;
  /** Velocity in his own frame (forward, down), units/s. */
  private velocity: Point = { x: 0, y: 0 };
  /** Sideways velocity and acceleration on screen, for swinging when carried. */
  private screenVx = 0;
  private accel = 0;
  /** Velocity over the floor (across, towards you), units/s. */
  private drift: Point = { x: 0, y: 0 };
  /** Heading on the floor (radians) of the shoulders and of the hips, and the one he's turning to. */
  private front = 0;
  private frontSpin = 0;
  private rear = 0;
  private rearSpin = 0;
  private yawTarget = 0;
  /** The heading of his path on the floor (radians, unwrapped) and how fast it's turning, while he's moving. */
  private path: { yaw: number; spin: number; speed: number } | null = null;
  /** The way he was last going, and when, so he doesn't swing back once he stops. */
  private lastPath = { yaw: 0, at: -Infinity };
  /** Stepping round to turn on the spot. */
  private stepping = false;
  /** The animation the pose was last made for (stepping round shows a walk). */
  private acted: AnimationName | null = null;
  /** Which of his sides you mostly see: 1 his right (facing right), -1 his left. */
  private viewSide: 1 | -1 = 1;
  private lastShown: Shown | null = null;
  /** Where the head is aiming while watching the pointer, how fast it's turning, and where it's going. */
  private gazeHead: { yaw: number; pitch: number; vYaw: number; vPitch: number; aim: { yaw: number; pitch: number } } | null = null;

  /** Offsets still dying away from the last change, and their rates. */
  private readonly offset = new Float64Array(POSE_KEYS.length);
  private readonly offsetVel = new Float64Array(POSE_KEYS.length);
  private lastTarget: Pose | null = null;

  private tail: Point3[] = [];
  /** Tail segment angles (screen degrees) and how fast each is turning (degrees/s). */
  private tailAngles: number[] = [];
  private tailSpin: number[] = [];
  private tailRootPrev: Point = { x: 0, y: 0 };
  private tailRootVel: Point = { x: 0, y: 0 };
  private tailMotion = 0;
  /** How far each tail joint is carried out to the side, lagging the one before it. */
  private tailSides: number[] = [];
  /** What the tail's doing on its own (see `moveTail`): where it is, how fast it's going, where it's headed. */
  private tailMood = { side: 0.3, lift: 0, bend: 0, curl: 0 };
  private tailMoodVel = { side: 0, lift: 0, bend: 0, curl: 0 };
  private tailGoal = { side: 0.3, lift: 0, bend: 0, curl: 0 };
  private tailRate = 2;
  private tailSwishes = 0;
  private nextTailMove = 0;

  private swing = 0;
  private swingVel = 0;

  // Life.
  private glance = { yaw: 0, pitch: 0, x: 0, y: 0 };
  private glanceTarget = { yaw: 0, pitch: 0, x: 0, y: 0 };
  private glanceVel = { yaw: 0, pitch: 0 };
  private nextGlance = 0;
  private blink: Event = { start: -1, end: -1 };
  private slowBlink = false;
  private nextBlink = 0;
  private earFlick: Event & { ear: 'N' | 'F' } = { start: -1, end: -1, ear: 'N' };
  private nextEarFlick = 0;
  private tailFlick: Event = { start: -1, end: -1 };
  private nextTailFlick = 0;
  private sniff: Event = { start: -1, end: -1 };
  private nextSniff = 0;

  constructor(
    private readonly build: Build,
    private readonly actor: Actor,
    seed = 1,
  ) {
    this.random = rng(seed);
  }

  /** Whether anything is still moving on its own since the last update. */
  get settling(): boolean {
    return this.busyReason() !== null;
  }

  /** What's still moving on its own, if anything (for tuning). */
  busyReason(): string | null {
    let offsets = 0;
    for (let i = 0; i < this.offset.length; i++) offsets = Math.max(offsets, Math.abs(this.offset[i]!), Math.abs(this.offsetVel[i]!) * 0.05);
    const now = this.clock;
    const active = (e: Event) => now >= e.start && now <= e.end;
    if (offsets > 0.05) return 'blend';
    // Moving over the ground: every frame, so paws stay put as the page slides him along.
    if (this.speed > 1) return 'moving';
    if (Math.abs(angleDiff(this.front / DEG, this.yawTarget / DEG)) > 0.3 || Math.abs(this.front - this.rear) > 0.005) return 'turn';
    if (Math.abs(this.frontSpin) + Math.abs(this.rearSpin) > 0.02) return 'turn';
    // Slow sways are fine at the resting frame rate; only a quick swish needs every frame.
    if (this.tailMotion > 1.5) return 'tail';
    if (Math.abs(this.swingVel) > 1 || Math.abs(this.swing) > 0.5) return 'swing';
    if (Math.abs(this.glanceVel.yaw) + Math.abs(this.glanceVel.pitch) > 10) return 'glance';
    const g = this.gazeHead;
    if (g && Math.abs(g.vYaw) + Math.abs(g.vPitch) > 4) return 'gaze';
    if (active(this.blink)) return 'blink';
    if (active(this.earFlick)) return 'ear';
    if (active(this.tailFlick)) return 'tailflick';
    if (active(this.sniff)) return 'sniff';
    return null;
  }

  update(frame: RaccoonFrame, unitsPerPx: number): Shown {
    const timed = frame.clockMs !== undefined;
    const now = frame.clockMs ?? this.clock + 16;
    const dt = this.started ? clamp((now - this.clock) / 1000, 0, 0.1) : 0;
    this.clock = now;

    // Where he's facing: the way he's heading on the floor (walking up the screen is walking
    // away), except when carried, when he hangs three-quarters towards you.
    this.followPath(frame, unitsPerPx, dt);
    this.yawTarget = this.path ? this.path.yaw : this.clock - this.lastPath.at < 1 ? this.lastPath.yaw : this.facingFor(frame);
    this.turn(dt, frame.animation);
    const view = new BodyView(this.yaw);
    if (Math.abs(view.side) > 0.35 && !LOCOMOTION.has(frame.animation)) this.viewSide = view.side > 0 ? 1 : -1;

    // Speed over the floor in drawing units. A step towards you shows as only DEPTH of a step
    // across, so moving up or down the screen covers more ground than the same distance across.
    const v = frame.velocity;
    const nominal = NOMINAL_SPEED[frame.animation] ?? 0;
    const ground = v ? { x: v.x * unitsPerPx, y: (v.y * unitsPerPx) / DEPTH } : null;
    const screenVx = v ? v.x * unitsPerPx : 0;
    if (dt > 0) this.accel = lerp(this.accel, (screenVx - this.screenVx) / dt, 0.35);
    this.screenVx = screenVx;
    this.velocity = { x: ground ? ground.x * view.c + ground.y * view.s : nominal, y: 0 };
    const speed = ground ? Math.hypot(ground.x, ground.y) : nominal;
    this.drift = ground ?? { x: Math.cos(this.yaw) * nominal, y: Math.sin(this.yaw) * nominal };
    this.speed = lerp(this.speed, speed, dt > 0 ? 1 - Math.exp(-dt * 12) : 1);
    this.started = true;

    if (frame.animation !== this.animation) {
      this.animation = frame.animation;
      this.animationStart = timed ? now : now - frame.timeMs;
    }
    const t = timed ? now - this.animationStart : frame.timeMs;

    // Turning on the spot, or setting off in a new direction, the paws step round as the
    // body turns, as if walking.
    const spin = Math.abs(this.frontSpin + this.rearSpin) / 2;
    const canStep = frame.animation === 'idle' || frame.animation === 'walk';
    this.stepping = canStep && spin > STEP_TURN[this.stepping ? 1 : 0];
    const acting: AnimationName = this.stepping ? 'walk' : frame.animation;
    const stepSpeed = this.stepping ? Math.max(this.speed, spin * TURN_STRIDE) : this.speed;
    const changed = acting !== this.acted;
    this.acted = acting;

    const gait = acting === 'chase' || acting === 'leap' ? this.build.chase : acting === 'run' ? this.build.run : this.build.walk;
    // The paws cycle with the ground actually covered this frame, so they keep up as he
    // speeds up; the stride length changes more gently.
    const covered = this.stepping || !ground ? stepSpeed : speed;
    if (dt > 0) this.phase += (covered * dt) / strideAt(gait, stepSpeed);
    if (!v && !timed) this.phase = (frame.timeMs / 1000) * (this.speed / strideAt(gait, this.speed));

    this.updateSwing(frame.animation, dt);
    const life = this.updateLife(frame, dt);
    const gaze = this.watch(frame.gaze ? this.gazeAt({ x: frame.gaze.x * unitsPerPx, y: frame.gaze.y * unitsPerPx }, view) : null, dt);

    const act = this.actor({
      animation: acting,
      t,
      phase: this.phase,
      speed: stepSpeed,
      keystrokes: frame.keystrokes,
      clock: now,
      life,
      gaze,
      swing: this.swing,
    });
    const target = act.pose;
    if (frame.eyes === 'closed') target.lids = Math.max(target.lids, 1);
    if (frame.eyes === 'wide') target.lids = Math.min(target.lids, -0.3);
    target.lids = Math.max(target.lids, this.blinkAmount());
    this.tailLife(target, act.flags, frame.animation, now, dt);
    // Seen from his left, his left paws do what his right ones were posed to.
    if (this.viewSide < 0) {
      for (const [a, b] of MIRRORED) [target[a], target[b]] = [target[b], target[a]];
      target.tailSide = -target.tailSide;
    }

    const pose = this.inertialize(target, dt, changed);
    keepInReach(this.build, pose);
    // Into a sharp turn, the head drops a little and leads the way round.
    const bend = this.bend;
    pose.hpitch += Math.abs(bend) * 7;
    const bent = new BodyView(this.yaw, bend, (pose.px + pose.sx) / 2, Math.abs(pose.sx - pose.px) / 2);
    this.updateTail(pose, act.flags, dt);
    const head = this.headTurn(pose, bent);
    const scruff = bent.pt(scruffAt(this.build, pose));
    const shown: Shown = { pose, flags: act.flags, tail: this.tail, view: bent, head, scruff, clock: now, drift: this.drift };
    this.lastShown = shown;
    return shown;
  }

  /** Heading of the middle of the body: halfway between the shoulders and the hips. */
  private get yaw(): number {
    return this.rear + (this.front - this.rear) / 2;
  }

  /** How far the spine is bent round (radians, shoulders relative to hips). */
  private get bend(): number {
    return this.front - this.rear;
  }

  /** Where he's going on the floor, when he's moving along. */
  private followPath(frame: RaccoonFrame, unitsPerPx: number, dt: number): void {
    const v = frame.velocity;
    const speed = v ? Math.hypot(v.x, v.y / DEPTH) * unitsPerPx : 0;
    if (!v || !LOCOMOTION.has(frame.animation) || speed < PATH_SPEED) {
      this.path = null;
      return;
    }
    const heading = Math.atan2(v.y / DEPTH, v.x);
    // Unwrapped next to his shoulders, so it never jumps a turn.
    const yaw = this.front + angleDiff(this.front / DEG, heading / DEG) * DEG;
    this.lastPath = { yaw, at: this.clock };
    const last = this.path;
    const turned = last && dt > 0 ? (yaw - last.yaw) / dt : 0;
    if (Math.abs(yaw - this.front) > PATH_ALIGNED || Math.abs(turned) > PATH_SPIN) {
      // Facing well off the way he's going: turn round to it first.
      this.path = null;
      return;
    }
    const spin = last ? lerp(last.spin, turned, 1 - Math.exp(-dt * 40)) : 0;
    this.path = { yaw, spin, speed };
  }

  /**
   * Swings the body round towards its heading, easing in and out, never snapping. On the
   * move it follows the path, bent along its curve. Turning without going anywhere, the
   * shoulders lead and the hips follow, so the spine bows into the turn and straightens
   * out as he comes round.
   */
  private turn(dt: number, animation: AnimationName): void {
    if (dt === 0) {
      this.front = this.rear = this.yawTarget;
      this.frontSpin = this.rearSpin = 0;
      return;
    }
    // Hanging from the scruff the body turns as one; sitting or lying, it bends less.
    const flex = animation === 'dangle' ? 0 : LOCOMOTION.has(animation) || animation === 'idle' ? this.build.flex : this.build.flex * 0.5;
    const path = this.path;
    // Running round a curve, the shoulders are already heading further round it than the
    // middle of the body, and the hips not as far.
    const length = this.build.shoulder.x - this.build.pelvis.x;
    const curve = path ? clamp(((length * path.spin) / path.speed) * PATH_BEND, -flex, flex) : 0;
    // Already moving off the way he's not facing.
    const dashing = !path && this.clock - this.lastPath.at < 1 && LOCOMOTION.has(animation) && animation !== 'walk';
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (path) {
        const R = FOLLOW_RATE;
        this.frontSpin += (R * R * turnBy(this.front, path.yaw + curve / 2) + 2 * R * (path.spin - this.frontSpin)) * h;
        this.rearSpin += (R * R * turnBy(this.rear, path.yaw - curve / 2) + 2 * R * (path.spin - this.rearSpin)) * h;
        this.front += this.frontSpin * h;
        this.rear += this.rearSpin * h;
      } else {
        const d = turnBy(this.front, this.yawTarget);
        const [fr, hr] = dashing ? [DASH_TURN_RATE, DASH_HIPS_RATE] : [TURN_RATE, HIPS_RATE];
        this.frontSpin += (fr * fr * d - 2 * fr * this.frontSpin) * h;
        this.front += this.frontSpin * h;
        const lag = this.front - this.rear;
        this.rearSpin += (hr * hr * lag - 2 * hr * this.rearSpin) * h;
        this.rear += this.rearSpin * h;
      }
      // A spine only bends so far: past that, the hips are dragged round with the shoulders.
      const over = this.front - this.rear;
      if (Math.abs(over) > flex) {
        this.rear = this.front - Math.sign(over) * flex;
        this.rearSpin = this.frontSpin;
      }
    }
  }

  /** The heading on the floor he turns to for this frame. */
  private facingFor(frame: RaccoonFrame): number {
    const side = (c: number) => (c > 0.05 ? 1 : c < -0.05 ? -1 : this.viewSide);
    if (frame.animation === 'dangle') return side(Math.cos(this.yaw)) > 0 ? 0.65 : Math.PI - 0.65;
    let heading = worldYaw(frame.heading ?? 0);
    // Just stopped: the page's heading is still catching up with the way he was going.
    const recent = this.lastPath;
    if (this.clock - recent.at < 1000 && Math.abs(angleDiff(heading / DEG, recent.yaw / DEG)) < 40) heading = recent.yaw;
    // Settling down after walking away up the screen, he turns round side-on rather than
    // sit with his back to you.
    if (RESTING.has(frame.animation) && Math.sin(heading) < -0.4) return Math.atan2(0.3, side(Math.cos(heading)));
    return heading;
  }

  /**
   * Carries over any jump between the previous target and this one as an offset that dies
   * away, so the shown pose is always continuous however the target changes.
   */
  private inertialize(target: Pose, dt: number, changed: boolean): Pose {
    const shown = {} as Pose;
    const last = this.lastTarget;
    for (let i = 0; i < POSE_KEYS.length; i++) {
      const key = POSE_KEYS[i]!;
      const goal = target[key];
      if (last) {
        // A new animation, or a sudden jump within one, becomes an offset that dies away.
        const jump = last[key] - goal;
        if (changed || Math.abs(jump) > JUMP[i]!) this.offset[i]! += jump;
      }
      const [w, zeta] = SPRINGS[i]!;
      if (dt > 0) {
        // Critically (or under-) damped spring pulling the offset to zero, in small steps.
        const steps = Math.ceil(dt / 0.008);
        const h = dt / steps;
        let x = this.offset[i]!;
        let vel = this.offsetVel[i]!;
        for (let s = 0; s < steps; s++) {
          vel += (-2 * zeta * w * vel - w * w * x) * h;
          x += vel * h;
        }
        this.offset[i] = x;
        this.offsetVel[i] = vel;
      }
      shown[key] = goal + this.offset[i]!;
    }
    this.lastTarget = { ...target };
    return shown;
  }

  /**
   * The head's heading on the floor. `hyaw` turns the face towards you from whichever way
   * he's facing (so it means the same seen from either side) and `hturn` turns it on the
   * neck to look at something. The neck bends with it, carrying the head a little sideways.
   */
  private headTurn(pose: Pose, view: BodyView): Shown['head'] {
    // The neck carries on from the shoulders, which lead the body round a turn; the head
    // leads them, looking where he's turning to.
    const shoulders = view.yawAt(pose.sx) / DEG;
    const lead = (view.bend / DEG) * 0.4;
    const heading = shoulders + lead;
    const towardsYou = this.turnFor(90 - heading);
    // Heading away from you, he looks where he's going.
    const most = 1.25 * Math.abs(pose.hyaw) * (1 - clamp(-Math.sin(heading * DEG) * 1.4, 0, 1));
    const local = clamp(clamp((towardsYou * pose.hyaw) / 90, -most, most) + pose.hturn, -125, 125);
    const neck = lead + local;
    pose.hx -= (1 - Math.cos(neck * DEG)) * 1.6;
    const reach = NECK_REACH[this.build.species];
    return { yaw: shoulders + neck, z: Math.sin(neck * DEG) * reach };
  }

  /** An angle to turn through, the short way round; from straight behind, towards the side you see. */
  private turnFor(degrees: number): number {
    const d = angleDiff(0, degrees);
    return Math.abs(d) > 150 ? this.viewSide * Math.abs(d) : d;
  }

  /** How to turn and nod the head to look at a point (drawing units from the feet, on screen). */
  private gazeAt(p: Point, view: BodyView): { yaw: number; pitch: number } {
    const last = this.lastShown;
    const headAt = last ? last.view.at(last.pose.hx, last.pose.hy, last.head.z) : { x: 0, y: -35 };
    const dx = p.x - headAt.x;
    const dy = p.y - headAt.y;
    // The pointer is in front of the screen, so straight at it is towards the viewer.
    const target = Math.atan2(POINTER_DEPTH, dx) / DEG;
    return {
      yaw: this.turnFor(target - view.yaw / DEG),
      pitch: (Math.atan2(dy, Math.hypot(dx, POINTER_DEPTH)) / DEG) * 0.8,
    };
  }

  /**
   * The head's lazy follow of what the eyes are on: it holds still through small movements
   * of the pointer, then swings round after it, a beat behind.
   */
  private watch(target: { yaw: number; pitch: number } | null, dt: number): Gaze | null {
    if (!target) {
      this.gazeHead = null;
      return null;
    }
    let g = this.gazeHead;
    if (!g) {
      // Just noticed it: the eyes go straight there, and the head starts turning from ahead.
      g = this.gazeHead = { yaw: target.yaw * 0.25, pitch: target.pitch * 0.25, vYaw: 0, vPitch: 0, aim: { ...target } };
    }
    if (Math.hypot(target.yaw - g.aim.yaw, (target.pitch - g.aim.pitch) * 1.4) > GAZE_SLACK) g.aim = { ...target };
    if (dt > 0) {
      const w = GAZE_RATE;
      const zeta = 0.8;
      const steps = Math.ceil(dt / 0.008);
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        g.vYaw += (w * w * (g.aim.yaw - g.yaw) - 2 * zeta * w * g.vYaw) * h;
        g.vPitch += (w * w * (g.aim.pitch - g.pitch) - 2 * zeta * w * g.vPitch) * h;
        g.yaw += g.vYaw * h;
        g.pitch += g.vPitch * h;
      }
    }
    return { yaw: g.yaw, pitch: g.pitch, eyes: target };
  }

  private updateSwing(animation: AnimationName, dt: number): void {
    if (animation !== 'dangle') {
      this.swing *= 0.8;
      this.swingVel *= 0.8;
      return;
    }
    // A pendulum from the scruff: the pointer's acceleration pushes it, gravity pulls it back.
    // Positive swing turns him clockwise on screen, so his body swings out to the left.
    const g = 2400;
    const length = 34;
    const steps = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const theta = this.swing * DEG;
      const acc = (this.accel / length) * Math.cos(theta) - (g / length) * Math.sin(theta) - 2.6 * this.swingVel * DEG;
      this.swingVel += (acc / DEG) * h;
      this.swing = clamp(this.swing + this.swingVel * h, -70, 70);
    }
  }

  /**
   * A tail is never held quite still. Two slow drifts, out of step, lift and lower it,
   * swing it from side to side and curl the tip; now and then it gives a lazy swish. A cat's
   * tail is more expressive than a raccoon's heavy brush.
   */
  private tailLife(pose: Pose, flags: PoseFlags, animation: AnimationName, now: number, dt: number): void {
    const temper = TAIL_TEMPER[this.build.species];
    const amount = (TAIL_LIFE[animation] ?? 0) * temper.amount;
    this.moveTail(now, dt, temper.pace);
    if (amount === 0) return;
    const m = this.tailMood;
    // A little drift as well, so even holding still it's never frozen.
    const drift = noise1(now / 2300, 31) * 0.25;
    pose.tailA += (m.lift * 16 + drift * 8) * amount;
    pose.tailBend += m.bend * 1.6 * amount;
    pose.tailCurl += (m.curl * 18 + drift * 6) * amount;
    // Swishing carries it right across to his other side, whichever side it's held on; a
    // tail wrapped round the paws stays round them, only the tip stirring.
    if (!flags.tailFront) pose.tailSide = lerp(pose.tailSide, m.side, 0.75 * amount);
  }

  /**
   * What the tail is up to, chosen afresh every so often like a real one: holding still, a
   * slow swish across and back (once, or a few times), settling at a new angle, or a flick
   * of the tip. Each move eases in and out at its own pace, so it never repeats.
   */
  private moveTail(now: number, dt: number, pace: number): void {
    const r = this.random;
    const goal = this.tailGoal;
    // Heavier tails move less often and more slowly.
    const cat = pace <= 1;
    if (now >= this.nextTailMove) {
      if (this.tailSwishes > 0) {
        // On over to the other side.
        this.tailSwishes--;
        goal.side = -(Math.sign(goal.side) || 1) * lerp(0.45, 0.95, r());
        goal.lift = lerp(-0.3, 0.5, r());
        this.tailRate = lerp(3.2, 5, r()) / pace;
        this.nextTailMove = now + lerp(550, 950, r()) * pace;
      } else if (goal.curl !== 0) {
        // The tip uncurls after a flick.
        goal.curl = 0;
        this.tailRate = lerp(4, 7, r());
        this.nextTailMove = now + lerp(300, 700, r());
      } else {
        const pick = r();
        if (pick < 0.35) {
          this.tailSwishes = 1 + Math.floor(r() * (cat ? 3 : 2));
          this.nextTailMove = now;
        } else if (pick < 0.6) {
          // Settles somewhere new: off to one side or the other, higher or lower.
          goal.side = lerp(-0.6, 0.6, r());
          goal.lift = lerp(-1, 1, r());
          goal.bend = lerp(-1, 1, r());
          this.tailRate = lerp(1.4, 2.6, r()) / pace;
          this.nextTailMove = now + lerp(1500, 4200, r()) * pace;
        } else if (pick < (cat ? 0.82 : 0.7)) {
          // A flick of the tip.
          goal.curl = (r() < 0.5 ? -1 : 1) * lerp(0.6, 1, r());
          this.tailRate = lerp(8, 12, r());
          this.nextTailMove = now + lerp(160, 320, r());
        } else {
          // Holds still a while.
          this.nextTailMove = now + lerp(1200, 3800, r()) * pace;
        }
      }
    }
    if (dt <= 0) return;
    const w = this.tailRate;
    const steps = Math.ceil(dt / 0.008);
    const h = dt / steps;
    for (const key of ['side', 'lift', 'bend', 'curl'] as const) {
      for (let i = 0; i < steps; i++) {
        this.tailMoodVel[key] += (w * w * (goal[key] - this.tailMood[key]) - 2 * 0.9 * w * this.tailMoodVel[key]) * h;
        this.tailMood[key] += this.tailMoodVel[key] * h;
      }
    }
  }

  private updateTail(pose: Pose, flags: PoseFlags, dt: number): void {
    const { tail: spec } = this.build;
    const root = tailRoot(this.build, pose);
    const rest = tailRest(this.build, pose);
    const count = spec.segments;
    if (this.tailAngles.length !== count || dt === 0) {
      this.tailSides = rest.map(() => pose.tailSide);
      this.tailAngles = [...rest];
      this.tailSpin = rest.map(() => 0);
      this.tailRootPrev = root;
      this.tailRootVel = { x: 0, y: 0 };
    }
    // How the root is being shaken about (body bob, gait, pointer drags), in units/s².
    const rootVel = dt > 0 ? { x: (root.x - this.tailRootPrev.x) / dt, y: (root.y - this.tailRootPrev.y) / dt } : { x: 0, y: 0 };
    const rootAcc = dt > 0 ? { x: (rootVel.x - this.tailRootVel.x) / dt, y: (rootVel.y - this.tailRootVel.y) / dt } : { x: 0, y: 0 };
    this.tailRootPrev = root;
    this.tailRootVel = rootVel;
    // Moving through the air: the tail streams back from the direction of travel.
    const flow = { x: -this.velocity.x - rootVel.x * 0.3, y: -this.velocity.y * 0.6 - rootVel.y * 0.3 };
    const stiff = pose.tailStiff;
    const steps = Math.max(1, Math.ceil(dt / 0.006));
    const h = dt / steps;
    let motion = 0;
    // A swing out to the side starts at the base and runs down to the tip.
    const ripple = 1 - Math.exp(-h / TAIL_RIPPLE);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < count; i++) {
        const lead = i === 0 ? pose.tailSide : this.tailSides[i - 1]!;
        const before = this.tailSides[i]!;
        this.tailSides[i] = before + (lead - before) * ripple;
        motion = Math.max(motion, (Math.abs(this.tailSides[i]! - before) / h) * 60);
      }
      for (let i = 0; i < count; i++) {
        const tipward = i / (count - 1);
        // Each joint springs towards its resting bend relative to the segment before it, so
        // the tail stays one smooth curve; joints nearer the tip are looser, so the tip lags
        // and whips round after the base.
        // A stiffly held tail also moves as one piece, straight to its resting shape.
        const relative = i === 0 ? rest[0]! : this.tailAngles[i - 1]! + (rest[i]! - rest[i - 1]!);
        const target = relative + angleDiff(relative, rest[i]!) * (0.2 + 0.55 * stiff);
        const w = lerp(26, 11, tipward) * lerp(0.75, 1.25, stiff);
        const zeta = 0.62;
        const a = this.tailAngles[i]!;
        const d = dir(a);
        // Torques: shaking of the root (inertia), the airflow, and a little sag when floppy.
        const shake = (d.x * -rootAcc.y + d.y * rootAcc.x) * 0.0022 * (0.4 + tipward);
        const air = (d.x * flow.y - d.y * flow.x) * 0.0016 * tipward;
        // In water it floats instead.
        const sag = (1 - stiff) * d.x * 9 * tipward * (flags.noShadow ? 1 : this.build.swims ? 0 : 0.6);
        const acc = w * w * angleDiff(a, target) - 2 * zeta * w * this.tailSpin[i]! + (shake + air) * 60 * 60 + sag * 60;
        this.tailSpin[i]! += acc * h;
        this.tailAngles[i] = a + this.tailSpin[i]! * h;
        motion = Math.max(motion, Math.abs(this.tailSpin[i]!));
      }
    }
    // Lay the segments end to end, keeping them off the floor, and curve them out sideways.
    const points: Point3[] = [{ ...root, z: 0 }];
    const reach = spec.segment * count * 0.42;
    const floor = -spec.tip * 0.9;
    // A tail wrapped round the paws lies along the floor: from where it touches down, the
    // rest of its curl turns it round his side on the ground instead of back up into the air.
    const wrap = flags.tailFront && !flags.noShadow;
    const around = Math.sign(pose.tailSide) || 1;
    // It hugs an oval round where he sits: from the rump to just past the front paws, and
    // as wide as his haunches.
    const rearmost = Math.min(pose.px, pose.bnx, pose.bfx) - 5;
    const foremost = Math.max(pose.fnx, pose.ffx) + spec.tip + 1.5;
    const oval = { x: (rearmost + foremost) / 2, rx: (foremost - rearmost) / 2, rz: this.build.stance.hip + spec.base + 2 };
    let angle = 0;
    let landed = -1;
    for (let i = 0; i < count; i++) {
      const a = this.tailAngles[i]!;
      const d = dir(a);
      const prev = points[i]!;
      const y = prev.y + d.y * spec.segment;
      if (wrap && (landed >= 0 || y >= floor)) {
        if (landed < 0) {
          landed = i;
          // Round the oval from behind him, out his side, to in front of his paws.
          angle = Math.PI * around;
        }
        // Whatever the tail's springs are doing over its resting shape (a twitch of the
        // tip, a flick) lifts and swings the end of it.
        const wobble = angleDiff(rest[i]!, a) * DEG;
        const step = spec.segment / Math.hypot(oval.rx * Math.sin(angle), oval.rz * Math.cos(angle));
        angle = around > 0 ? Math.max(-WRAP_PAST, angle - step) : Math.min(WRAP_PAST, angle + step);
        const swing = angle + wobble * 0.5 * around;
        const lift = clamp(Math.abs(wobble) * 6, 0, spec.tip * 2.5) * ((i - landed) / Math.max(1, count - 1 - landed));
        points.push({ x: oval.x + oval.rx * Math.cos(swing), y: floor - lift, z: oval.rz * Math.sin(swing) });
        continue;
      }
      points.push({
        x: prev.x + d.x * spec.segment,
        // Kept off the floor; in water, it floats up to the surface, unless he's diving.
        y: flags.noShadow ? y : this.build.swims ? Math.min(y, Math.max(lerp(root.y, -0.3 * lerp(spec.base, spec.tip, i / count), Math.min(1, (i + 1) / 3)), root.y - 4)) : Math.min(y, floor),
        z: this.tailSides[i]! * reach * ((i + 1) / count) ** 1.4,
      });
    }
    this.tail = points;
    this.tailMotion = motion / 60;
  }

  private blinkAmount(): number {
    const e = this.blink;
    if (this.clock < e.start || this.clock > e.end) return 0;
    const u = (this.clock - e.start) / (e.end - e.start);
    if (!this.slowBlink) return bump(u) ** 0.5;
    // Slow blink: close, hold, open.
    return u < 0.35 ? smooth(u / 0.35) : u < 0.6 ? 1 : 1 - smooth((u - 0.6) / 0.4);
  }

  private updateLife(frame: RaccoonFrame, dt: number): Life {
    const now = this.clock;
    const r = this.random;
    const resting = frame.animation === 'idle' || frame.animation === 'sit' || frame.animation === 'confused';
    const asleep = frame.animation === 'sleep';
    if (!resting && frame.animation !== 'walk' && frame.animation !== 'peek') {
      this.glanceTarget = { yaw: 0, pitch: 0, x: 0, y: 0 };
    } else if (now >= this.nextGlance) {
      // Look somewhere new: the eyes jump first, the head follows.
      const big = resting && r() < 0.5;
      this.glanceTarget = {
        yaw: big ? lerp(-18, 46, r()) : lerp(-8, 14, r()),
        pitch: big ? lerp(-12, 10, r()) : lerp(-4, 4, r()),
        x: lerp(-0.5, 0.5, r()),
        y: lerp(-0.3, 0.3, r()),
      };
      if (frame.gaze) this.glanceTarget.yaw *= 0.3;
      this.nextGlance = now + lerp(1800, 6500, r());
    }
    this.glance.x = this.glanceTarget.x;
    this.glance.y = this.glanceTarget.y;
    if (dt > 0) {
      for (const key of ['yaw', 'pitch'] as const) {
        const w = 9;
        this.glanceVel[key] += (-2 * 0.8 * w * this.glanceVel[key] - w * w * (this.glance[key] - this.glanceTarget[key])) * dt;
        this.glance[key] += this.glanceVel[key] * dt;
      }
    }

    if (now >= this.nextBlink && frame.animation !== 'sleep') {
      // Cats give a slow blink now and then when relaxed, especially at someone looking at them.
      const cat = this.build.species === 'cat' || this.build.species === 'fox';
      this.slowBlink = cat && resting && r() < (frame.gaze ? 0.45 : 0.2);
      this.blink = { start: now, end: now + (this.slowBlink ? 1300 : 170) };
      this.nextBlink = now + lerp(2400, 6500, r());
    }
    // Asleep, only the odd dreaming twitch.
    const calm = asleep ? 2.5 : 1;
    if (now >= this.nextEarFlick) {
      this.earFlick = { start: now, end: now + 260, ear: r() < 0.5 ? 'N' : 'F' };
      this.nextEarFlick = now + lerp(3000, 9000, r()) * calm;
    }
    if (now >= this.nextTailFlick) {
      this.tailFlick = { start: now, end: now + 700 };
      this.nextTailFlick = now + lerp(4000, 11000, r()) * calm;
    }
    if (now >= this.nextSniff && this.build.species !== 'cat' && !asleep) {
      this.sniff = { start: now, end: now + lerp(500, 900, r()) };
      this.nextSniff = now + lerp(4000, 10000, r());
    }

    const progress = (e: Event) => (now < e.start || now > e.end ? -1 : (now - e.start) / (e.end - e.start));
    const flick = progress(this.earFlick);
    const ear = flick < 0 ? 0 : -Math.sin(flick * Math.PI * 2) * 0.9 * (1 - flick);
    const tail = progress(this.tailFlick);
    const sniffing = progress(this.sniff);
    return {
      ...NO_LIFE,
      glanceYaw: this.glance.yaw,
      glancePitch: this.glance.pitch,
      lookX: this.glance.x,
      lookY: this.glance.y,
      earN: this.earFlick.ear === 'N' ? ear : 0,
      earF: this.earFlick.ear === 'F' ? ear : 0,
      tailFlick: tail < 0 ? 0 : Math.sin(tail * Math.PI * 3) * (1 - tail),
      sway: noise1(now / 4200, 11),
      sniff: sniffing < 0 ? 0 : Math.abs(Math.sin(sniffing * Math.PI * 7)) * bump(sniffing) ** 0.3,
    };
  }
}

/**
 * How far to turn from `from` to `to` (radians), the short way round; turning right round,
 * he turns through facing you rather than away.
 */
function turnBy(from: number, to: number): number {
  let d = angleDiff(from / DEG, to / DEG) * DEG;
  if (Math.abs(d) > Math.PI - 0.3 && Math.sin(from + d / 2) < 0) d -= Math.sign(d) * Math.PI * 2;
  return d;
}
