import type { Point } from '../../core/geometry';
import type { AnimationName, RaccoonFrame } from '../types';
import { NO_LIFE, type Act, type ActInput, type Life } from './act';
import type { Build } from './build';
import { strideAt } from './gait';
import { angleDiff, bump, clamp, clamp01, DEG, dir, lerp, noise1, rng, smooth } from './kit';
import { POSE_KEYS, type Pose, type PoseFlags, type PoseKey } from './pose';
import { tailRest, tailRoot } from './rig';

/**
 * Everything that makes the pose on screen move like an animal rather than switch like a
 * slideshow:
 * - Changing animation never snaps. The difference between what's shown and the new pose
 *   is carried over and dies away like a spring ("inertialization"), each body part at its
 *   own pace: the body leads, the head follows, the ears swing past and settle.
 * - The gait advances with ground actually covered, so planted paws don't skate.
 * - The tail is a chain with weight: it trails, sways and whips with the body.
 * - Carried by the scruff, the body swings like a pendulum from the pointer's movement.
 * - Little unscripted life: glances, ear flicks, blinks (and the slow cat blink), a
 *   twitching tail tip.
 */

export interface Shown {
  pose: Pose;
  flags: PoseFlags;
  tail: Point[];
  /** Turning round: 1 → -1 squeeze of the body's length, and the side it faces. */
  turn: { squeeze: number; side: 1 | -1; yaw: number };
}

type Actor = (input: ActInput) => Act;

/** How fast each part catches up after a change: spring frequency (rad/s) and damping ratio. */
function springFor(key: PoseKey): [number, number] {
  if (key === 'earN' || key === 'earF') return [13, 0.45];
  if (key.startsWith('tail') || key === 'puff') return [10, 0.85];
  if (key[0] === 'h') return [10, 0.75];
  if (key === 'lids' || key === 'happy' || key === 'mouth' || key === 'tongue' || key === 'pupil' || key.startsWith('look')) return [22, 1];
  if (key === 'rot' || key === 'rotX' || key === 'rotY') return [12, 1];
  return [13, 0.9];
}
const SPRINGS = POSE_KEYS.map(springFor);

/**
 * Within an animation, a change of target this big in one frame is a jump to smooth over
 * (eyes darting with each key press while peeking), not movement. Positions are never
 * smoothed this way: a paw racing forward mid-stride must not be slowed down.
 */
const SMALL_RANGE = new Set<PoseKey>(['breath', 'puff', 'earN', 'earF', 'lids', 'happy', 'lookX', 'lookY', 'pupil', 'mouth', 'tongue', 'scapN', 'scapF', 'squash', 'tailStiff']);
const JUMP = POSE_KEYS.map((key) => (SMALL_RANGE.has(key) ? 0.3 : key === 'hroll' || key === 'hyaw' ? 20 : Infinity));

/** Nominal ground speeds, used when the frame doesn't say how fast he's going (previews). */
const NOMINAL_SPEED: Partial<Record<AnimationName, number>> = { walk: 76, run: 300, chase: 560 };

const TURN_MS = 300;

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
  private velocity: Point = { x: 0, y: 0 };
  private accel = 0;

  /** Offsets still dying away from the last change, and their rates. */
  private readonly offset = new Float64Array(POSE_KEYS.length);
  private readonly offsetVel = new Float64Array(POSE_KEYS.length);
  private lastTarget: Pose | null = null;

  private tail: Point[] = [];
  /** Tail segment angles (screen degrees) and how fast each is turning (degrees/s). */
  private tailAngles: number[] = [];
  private tailSpin: number[] = [];
  private tailRootPrev: Point = { x: 0, y: 0 };
  private tailRootVel: Point = { x: 0, y: 0 };
  private tailMotion = 0;

  private swing = 0;
  private swingVel = 0;

  private facing: 1 | -1 = 1;
  private turnFrom: 1 | -1 = 1;
  private turnAt = -Infinity;

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
    // Slow sways are fine at the resting frame rate; only a quick swish needs every frame.
    if (this.tailMotion > 1.5) return 'tail';
    if (Math.abs(this.swingVel) > 1 || Math.abs(this.swing) > 0.5) return 'swing';
    if (Math.abs(this.glanceVel.yaw) + Math.abs(this.glanceVel.pitch) > 10) return 'glance';
    if (active(this.blink)) return 'blink';
    if (active(this.earFlick)) return 'ear';
    if (active(this.tailFlick)) return 'tailflick';
    if (active(this.sniff)) return 'sniff';
    if (now - this.turnAt < TURN_MS) return 'turn';
    return null;
  }

  update(frame: RaccoonFrame, unitsPerPx: number): Shown {
    const timed = frame.clockMs !== undefined;
    const now = frame.clockMs ?? this.clock + 16;
    const dt = this.started ? clamp((now - this.clock) / 1000, 0, 0.1) : 0;
    this.clock = now;
    this.started = true;

    // Velocity in drawing units, in the animal's own frame (x forward).
    const v = frame.velocity;
    const nominal = NOMINAL_SPEED[frame.animation];
    const vx = v ? v.x * unitsPerPx * this.facing : (nominal ?? 0);
    const vy = v ? v.y * unitsPerPx : 0;
    const prevVx = this.velocity.x;
    this.velocity = { x: vx, y: vy };
    if (dt > 0) this.accel = lerp(this.accel, (vx - prevVx) / dt, 0.35);
    const speed = v ? Math.hypot(vx, vy) : (nominal ?? 0);
    this.speed = lerp(this.speed, speed, dt > 0 ? 1 - Math.exp(-dt * 12) : 1);

    const changed = frame.animation !== this.animation;
    if (changed) {
      this.animation = frame.animation;
      this.animationStart = timed ? now : now - frame.timeMs;
    }
    const t = timed ? now - this.animationStart : frame.timeMs;

    const gait = frame.animation === 'chase' ? this.build.chase : frame.animation === 'run' ? this.build.run : this.build.walk;
    if (dt > 0) this.phase += (this.speed * dt) / strideAt(gait, this.speed);
    if (!v && !timed) this.phase = frame.timeMs / 1000 * (this.speed / strideAt(gait, this.speed));

    this.updateSwing(frame.animation, dt);
    const life = this.updateLife(frame, dt);
    const gaze = frame.gaze ? { x: frame.gaze.x * unitsPerPx * this.facing, y: frame.gaze.y * unitsPerPx } : null;

    const act = this.actor({
      animation: frame.animation,
      t,
      phase: this.phase,
      speed: this.speed,
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

    const pose = this.inertialize(target, dt, changed);
    const turn = this.updateTurn(frame, pose);
    this.updateTail(pose, act.flags, dt);
    return { pose, flags: act.flags, tail: this.tail, turn };
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

  private updateTurn(frame: RaccoonFrame, pose: Pose): Shown['turn'] {
    const heading = frame.heading ?? 0;
    const across = Math.cos(heading);
    const want: 1 | -1 = across > 0.2 ? 1 : across < -0.2 ? -1 : this.facing;
    const progress = () => clamp01((this.clock - this.turnAt) / TURN_MS);
    if (want !== this.facing) {
      // Turning back mid-turn carries on from whichever side is showing.
      this.turnFrom = smooth(progress()) < 0.5 ? this.turnFrom : this.facing;
      this.facing = want;
      this.turnAt = frame.clockMs === undefined ? -Infinity : this.clock;
    }
    const f = smooth(progress());
    const side = f < 0.5 ? this.turnFrom : this.facing;
    // The body foreshortens as it swings round, and the head swings to face you on the way.
    const squeeze = Math.max(0.16, Math.abs(Math.cos(Math.PI * f)));
    const yaw = Math.sin(Math.PI * f) * 70;
    // Walking up or down the screen, he glances that way.
    const towards = Math.sin(heading);
    pose.hyaw += yaw + clamp(towards, -1, 1) * 18 * (1 - Math.abs(across));
    return { squeeze, side, yaw };
  }

  private updateSwing(animation: AnimationName, dt: number): void {
    if (animation !== 'dangle') {
      this.swing *= 0.8;
      this.swingVel *= 0.8;
      return;
    }
    // A pendulum from the scruff: the pointer's acceleration pushes it, gravity pulls it back.
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

  private updateTail(pose: Pose, flags: PoseFlags, dt: number): void {
    const { tail: spec } = this.build;
    const root = tailRoot(this.build, pose);
    const rest = tailRest(this.build, pose);
    const count = spec.segments;
    if (this.tailAngles.length !== count || dt === 0) {
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
    for (let s = 0; s < steps; s++) {
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
        const sag = (1 - stiff) * d.x * 9 * tipward * (flags.noShadow ? 1 : 0.6);
        const acc = w * w * angleDiff(a, target) - 2 * zeta * w * this.tailSpin[i]! + (shake + air) * 60 * 60 + sag * 60;
        this.tailSpin[i]! += acc * h;
        this.tailAngles[i] = a + this.tailSpin[i]! * h;
        motion = Math.max(motion, Math.abs(this.tailSpin[i]!));
      }
    }
    // Lay the segments end to end, keeping them off the floor.
    const points: Point[] = [root];
    for (let i = 0; i < count; i++) {
      const d = dir(this.tailAngles[i]!);
      const next = { x: points[i]!.x + d.x * spec.segment, y: points[i]!.y + d.y * spec.segment };
      if (!flags.noShadow) next.y = Math.min(next.y, -spec.tip * 0.9);
      points.push(next);
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
      this.slowBlink = this.build.species === 'cat' && resting && r() < (frame.gaze ? 0.45 : 0.2);
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
    if (now >= this.nextSniff && this.build.species === 'raccoon' && !asleep) {
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

  /** Which way he faces now (the page doesn't mirror him; he turns himself). */
  get side(): 1 | -1 {
    return this.facing;
  }
}
