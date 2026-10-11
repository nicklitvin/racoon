import type { Point } from '../../core/geometry';
import type { LegName } from '../rig';
import type { AnimationName } from '../types';
import type { Build } from './build';
import { bob, step, strideAt, type Gait } from './gait';
import { clamp, lerp } from './kit';
import { LEGS, setPaw, type Pose, type PoseFlags } from './pose';

/** Little bits of life layered over every pose: glances, ear flicks, blinks, a tail tip twitching. */
export interface Life {
  /** Head turn and nod for looking about, degrees. */
  glanceYaw: number;
  glancePitch: number;
  /** Where the eyes wander, -1..1. */
  lookX: number;
  lookY: number;
  /** Quick ear twitches, -1..1. */
  earN: number;
  earF: number;
  /** Tail tip flick, -1..1. */
  tailFlick: number;
  /** Slow drift of weight from paw to paw, -1..1. */
  sway: number;
  /** Nose twitching, 0..1. */
  sniff: number;
}

export const NO_LIFE: Life = { glanceYaw: 0, glancePitch: 0, lookX: 0, lookY: 0, earN: 0, earF: 0, tailFlick: 0, sway: 0, sniff: 0 };

export interface ActInput {
  animation: AnimationName;
  /** Time since this animation began, ms. */
  t: number;
  /** Gait phase in cycles: advances with distance covered. */
  phase: number;
  /** Ground speed, drawing units per second. */
  speed: number;
  keystrokes: number;
  /** Clock for slow background wobble (breathing), ms. */
  clock: number;
  life: Life;
  /** Something to look at (the pointer), relative to the feet, x forward; null if nothing nearby. */
  gaze: Point | null;
  /** Side swing while being carried, degrees, from the pendulum. */
  swing: number;
}

export interface Act {
  pose: Pose;
  flags: PoseFlags;
}

export const noFlags = (): PoseFlags => ({ tailFront: false, pawUp: false, noShadow: false });

export function gaitFor(build: Build, animation: AnimationName): Gait {
  return animation === 'chase' ? build.chase : animation === 'run' || animation === 'jump' ? build.run : build.walk;
}

/** Places every paw on its step in the gait cycle. Returns how planted each one is. */
export function walkLegs(pose: Pose, build: Build, gait: Gait, input: ActInput, amp: number): Record<LegName, boolean> {
  const stride = strideAt(gait, input.speed);
  const planted = {} as Record<LegName, boolean>;
  for (const leg of LEGS) {
    const front = leg.startsWith('front');
    const far = leg.endsWith('Far');
    const homeX = (front ? pose.fnx : pose.bnx) + (far ? build.farOffset : 0);
    const homeA = front ? build.frontLean : build.backLean;
    const s = step(gait, leg, input.phase, stride, homeX, homeA, amp);
    setPaw(pose, leg, s.x, s.y, s.a);
    planted[leg] = s.planted;
  }
  return planted;
}

/** Body rise and fall for a walking gait, hips and shoulders separately. */
export function walkBob(pose: Pose, gait: Gait, phase: number, amp: number): void {
  pose.py -= gait.bob * amp * bob(gait, phase, 'backNear');
  pose.sy -= gait.bob * amp * bob(gait, phase, 'frontNear');
}

/**
 * Turns the head and eyes to `target` (relative to the feet), within what a neck allows.
 * `weight` 0..1 blends from the pose's own head turn.
 */
export function lookAt(pose: Pose, target: Point, weight: number): void {
  const dx = target.x - pose.hx;
  const dy = target.y - pose.hy;
  const d = Math.hypot(dx, dy) || 1;
  // In front: a three-quarter view turning towards profile. Behind: looking back over the shoulder.
  const ahead = dx / d;
  const yaw = clamp(lerp(70, 18, (ahead + 1) / 2) + (ahead < -0.3 ? 40 * (-ahead - 0.3) : 0), 10, 125);
  const pitch = clamp((Math.atan2(dy, Math.abs(dx) + 40) * 180) / Math.PI * 0.8, -30, 35);
  pose.hyaw = lerp(pose.hyaw, yaw, weight);
  pose.hpitch = lerp(pose.hpitch, pitch, weight);
  pose.lookX = lerp(pose.lookX, clamp(ahead * 0.6, -0.7, 0.7), weight);
  pose.lookY = lerp(pose.lookY, clamp(dy / d, -0.8, 0.8), weight);
}
