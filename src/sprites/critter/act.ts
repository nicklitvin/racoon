import type { LegName } from './pose';
import type { AnimationName } from '../types';
import type { Build } from './build';
import { bob, step, strideAt, type Gait } from './gait';
import { add, clamp, clamp01, dir, lerp, scale, smooth } from './kit';
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
  /**
   * Something to look at (the pointer), null if nothing is near: how far to turn the head on
   * the neck towards his right side, and how far to nod down, in degrees. The head follows
   * lazily; `eyes` is where the thing really is, which the eyes keep up with.
   */
  gaze: Gaze | null;
  /** Side swing while being carried, degrees, from the pendulum. */
  swing: number;
}

export interface Gaze {
  yaw: number;
  pitch: number;
  eyes?: { yaw: number; pitch: number };
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
 * Turns the head towards something, within what a neck allows, and lets the eyes make up
 * the rest. `weight` 0..1 blends from the pose's own head turn.
 */
export function lookAt(pose: Pose, target: Gaze, weight: number): void {
  const yaw = clamp(target.yaw, -110, 110);
  const pitch = clamp(target.pitch, -30, 35);
  const eyes = target.eyes ?? target;
  pose.hturn = lerp(pose.hturn, yaw, weight);
  // Really looking at something replaces just turning his face to you.
  pose.hyaw = lerp(pose.hyaw, 0, weight);
  pose.hpitch = lerp(pose.hpitch, pitch, weight);
  pose.lookX = lerp(pose.lookX, clamp((eyes.yaw - yaw) / 40, -0.6, 0.6) + 0.1, weight);
  pose.lookY = lerp(pose.lookY, clamp((eyes.pitch - pitch) / 25 + pitch / 60, -0.8, 0.8), weight);
}

/** How long an excited leap takes, ms; matches `motion.leapMs` in the behaviour config. */
export const LEAP_MS = 420;

/** How a species leaps: how high (units), and how its back sits standing. */
export interface LeapStyle {
  height: number;
  arch: number;
}

/** The two kinds of excited jump. */
export type LeapKind = 'bound' | 'hop';

/** Moments through a leap (0..1), for the keyframes below. */
const LEAP_AT = [0, 0.14, 0.42, 0.68, 0.84, 1];
type LeapKeys = Record<'rise' | 'pitch' | 'stretch' | 'arch' | 'frontAngle' | 'frontReach' | 'frontLean' | 'backAngle' | 'backReach' | 'backLean' | 'hpitch', number[]>;
/**
 * Each channel of a leap through those moments. Leg angles are screen degrees from the
 * shoulder or hip (90 straight down, less reaching forward, more trailing back) and reach
 * is a fraction of the leg's length.
 */
const LEAP_KEYS: Record<LeapKind, LeapKeys & { height: number }> = {
  // A bounding leap: push off, fly stretched out, reach down, land on the front paws, gather.
  bound: {
    height: 1,
    /** Body raised by the legs, besides the flight itself; negative crouches. */
    rise: [0, 2.5, 0, 0, -2.5, -1],
    /** Shoulders above the hips. */
    pitch: [0, 5, 1.5, -3, -3.5, 0],
    /** Spine length, as a fraction of standing. */
    stretch: [1, 1.08, 1.2, 1.04, 0.94, 0.92],
    arch: [0, -1, -3.5, 0.5, 2.5, 1.5],
    frontAngle: [100, 62, 32, 62, 96, 100],
    frontReach: [0.92, 0.55, 0.9, 0.95, 0.92, 0.92],
    frontLean: [8, -70, -45, -12, 8, 8],
    backAngle: [98, 128, 152, 112, 72, 84],
    backReach: [0.86, 0.94, 0.88, 0.6, 0.72, 0.84],
    backLean: [26, 70, -30, -55, 4, 22],
    hpitch: [10, -6, 2, 14, 16, 12],
  },
  // A bouncy hop straight up on stiff legs, back humped: a kitten's crab-hop, a raccoon's
  // "war dance". Sheer silliness.
  hop: {
    height: 0.85,
    rise: [0, -3, 0, 0, -3, 0],
    pitch: [0, 0, 1.5, 0.5, -1, 0],
    stretch: [1, 0.92, 0.86, 0.88, 0.95, 1],
    arch: [0, 2, 6.5, 5.5, 2, 0.5],
    frontAngle: [96, 98, 92, 94, 97, 96],
    frontReach: [0.9, 0.8, 0.96, 0.96, 0.86, 0.9],
    frontLean: [8, 10, -4, 0, 8, 8],
    backAngle: [86, 84, 88, 86, 85, 86],
    backReach: [0.86, 0.72, 0.94, 0.93, 0.78, 0.86],
    backLean: [26, 30, 6, 8, 26, 26],
    hpitch: [10, 16, -6, 0, 12, 10],
  },
};

function leapKey(channel: number[], u: number): number {
  let i = 0;
  while (i < LEAP_AT.length - 2 && u > LEAP_AT[i + 1]!) i++;
  const k = smooth((u - LEAP_AT[i]!) / (LEAP_AT[i + 1]! - LEAP_AT[i]!));
  return lerp(channel[i]!, channel[i + 1]!, k);
}

/** Which kind of jump a leap begun at `startMs` is: mostly bounds, now and then a silly hop. */
export function leapKind(startMs: number): LeapKind {
  const r = Math.abs(Math.sin(Math.round(startMs) * 12.9898) * 43758.5453) % 1;
  return r < 0.35 ? 'hop' : 'bound';
}

/**
 * An excited leap out of a run. A bound: the hind legs drive off, he flies stretched out
 * with the front paws reaching, then gathers, lands on the front paws and brings the hind
 * ones through under him to run on. A hop: up and down on stiff legs, back humped. `p` is
 * his standing pose, which the leap is built from.
 */
export function leap(build: Build, p: Pose, t: number, style: LeapStyle, kind: LeapKind = 'bound'): Pose {
  const keys = LEAP_KEYS[kind];
  const u = clamp01(t / LEAP_MS);
  // Airborne almost throughout: at a gallop the paws are only down for an instant at
  // take-off and landing, or they'd be seen skidding along under him.
  const flight = clamp01((u - 0.03) / 0.92);
  const air = style.height * keys.height * 4 * flight * (1 - flight) + leapKey(keys.rise, u);
  const pitch = leapKey(keys.pitch, u);
  const length = (build.shoulder.x - build.pelvis.x) * leapKey(keys.stretch, u);
  const head = { x: p.hx - p.sx, y: p.hy - p.sy };
  p.px = -length / 2;
  p.sx = length / 2;
  p.py = build.pelvis.y - air + pitch * 0.4;
  p.sy = build.shoulder.y - air - pitch * 0.6;
  p.arch = style.arch + leapKey(keys.arch, u);
  p.hx = p.sx + head.x + 1.5;
  p.hy = p.sy + head.y + 2;
  p.hpitch = leapKey(keys.hpitch, u);
  // Each leg is aimed by its wrist or hock, so it never stretches past straight; the hand or
  // foot hangs on from there at its lean, and stays out of the floor.
  const place = (leg: LegName, root: { x: number; y: number }, angle: number, reach: number, lean: number, bones: [number, number, number]) => {
    const low = add(root, scale(dir(angle), (bones[0] + bones[1]) * reach));
    const at = add(low, scale(dir(90 - lean), bones[2]));
    setPaw(p, leg, at.x, Math.min(0, at.y), lean);
  };
  // The far paw of each pair a beat behind the near one.
  const lagged = (channel: number[], lag: number) => leapKey(channel, clamp01(u - lag));
  const shoulder = { x: p.sx, y: p.sy };
  const hip = { x: p.px, y: p.py };
  place('frontNear', shoulder, leapKey(keys.frontAngle, u), leapKey(keys.frontReach, u), leapKey(keys.frontLean, u), build.front);
  place('frontFar', { x: shoulder.x + build.farOffset * 0.5, y: shoulder.y }, lagged(keys.frontAngle, 0.04), lagged(keys.frontReach, 0.04), lagged(keys.frontLean, 0.04), build.front);
  place('backNear', hip, leapKey(keys.backAngle, u), leapKey(keys.backReach, u), leapKey(keys.backLean, u), build.back);
  place('backFar', { x: hip.x + build.farOffset * 0.5, y: hip.y }, lagged(keys.backAngle, 0.03), lagged(keys.backReach, 0.03), lagged(keys.backLean, 0.03), build.back);
  // Stretched long in the air, squashed a touch on landing.
  p.squash = 1 + 0.04 * Math.sin(Math.PI * flight) - 0.05 * Math.max(0, Math.sin(Math.PI * clamp01((u - 0.8) / 0.2)));
  return p;
}
