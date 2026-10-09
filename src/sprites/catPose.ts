import type { Point } from '../core/geometry';
import type { LegName } from './rig';
import type { AnimationName } from './types';

/**
 * The black cat's poses, drawn side-on and facing right with the feet at (0, 0);
 * negative y is up. Like the raccoon's, every animation is a pure function of time
 * (and key presses for peek). The motion follows classic cartoon rules: anticipation
 * before big moves, squash and stretch, arcs, slow-in/slow-out, and a tail that
 * follows through a beat behind the body.
 */

export const CAT = {
  /** Visible box around the feet. */
  view: { x: -72, y: -96, width: 144, height: 100 },
  rump: 10.5,
  chest: 11,
  /** Upper and lower leg lengths. */
  frontLeg: [10, 12.5] as const,
  backLeg: [11, 13] as const,
  tailSegments: 11,
  tailSegment: 3.9,
  /** How far the feet sink below the screen edge while peeking. */
  peekSink: 30,
} as const;

/** Where the bottom edge of the screen is in the drawing while peeking. */
export const CAT_PEEK_EDGE_Y = -CAT.peekSink;

export interface CatPose {
  hip: Point;
  chest: Point;
  /** How far the back bows upwards between hip and chest. */
  arch: number;
  /** Body thickness, for breathing. */
  breathe: number;
  /** Vertical scale of the whole cat about the feet; width compensates, so volume is kept. */
  squash: number;
  /** Head centre relative to the chest, plus tilt in degrees (positive = chin down). */
  head: { x: number; y: number; angle: number };
  paws: Record<LegName, Point>;
  /**
   * Tail: base direction (degrees, screen axes: 0 right, -90 up), how much it curls by
   * the tip, a travelling wave (phase in radians, amplitude in degrees) and thickness.
   */
  tail: { angle: number; curl: number; phase: number; amp: number; puff: number };
  /** 0 pricked up, 1 flat back. */
  ears: number;
  /** Where the pupils point, each axis -1..1. */
  look: Point;
  /** 0 thin slit, 1 big round. */
  pupil: number;
  /** 0 open, 1 shut; negative opens them extra wide. */
  lids: number;
  /** 0 closed, 1 wide open. */
  mouth: number;
  /** Whole-figure rotation in degrees around `pivot`, for hanging by the scruff. */
  rotate: number;
  pivot: Point;
}

const TAU = Math.PI * 2;
const wave = (t: number, periodMs: number, phase = 0) => Math.sin(TAU * (t / periodMs + phase));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Ease in and out: the "slow in, slow out" of hand-drawn animation. */
export const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
/** 0..1..0 over the span, eased at both ends. */
const hump = (t: number, from: number, to: number) => Math.sin(Math.PI * clamp01((t - from) / (to - from)));
const cycle = (t: number, periodMs: number) => (((t / periodMs) % 1) + 1) % 1;

const HOME: Record<LegName, Point> = {
  frontNear: { x: 15, y: 0 },
  frontFar: { x: 19, y: 0 },
  backNear: { x: -12, y: 0 },
  backFar: { x: -8, y: 0 },
};

function standing(): CatPose {
  return {
    hip: { x: -14, y: -24 },
    chest: { x: 13, y: -25 },
    arch: 2,
    breathe: 1,
    squash: 1,
    head: { x: 9, y: -13, angle: 0 },
    paws: {
      frontNear: { ...HOME.frontNear },
      frontFar: { ...HOME.frontFar },
      backNear: { ...HOME.backNear },
      backFar: { ...HOME.backFar },
    },
    tail: { angle: -150, curl: 85, phase: 0, amp: 0, puff: 1 },
    ears: 0,
    look: { x: 0, y: 0 },
    pupil: 0.55,
    lids: 0,
    mouth: 0,
    rotate: 0,
    pivot: { x: 0, y: -40 },
  };
}

/** A point given along the spine (`a`, from the hip) and below it (`b`, towards the belly). */
export function bodyPoint(pose: CatPose, a: number, b: number): Point {
  const dx = pose.chest.x - pose.hip.x;
  const dy = pose.chest.y - pose.hip.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // "Down" from the spine: the spine direction turned a quarter clockwise on screen.
  return { x: pose.hip.x + ux * a - uy * b, y: pose.hip.y + uy * a + ux * b };
}

export function spineLength(pose: CatPose): number {
  return Math.hypot(pose.chest.x - pose.hip.x, pose.chest.y - pose.hip.y);
}

/** Where each leg joins the body. */
export function legRoot(pose: CatPose, leg: LegName): Point {
  const far = leg.endsWith('Far') ? 3 : 0;
  return leg.startsWith('front') ? bodyPoint(pose, spineLength(pose) + 1 + far, 4) : bodyPoint(pose, 1 + far, 3);
}

/** Where the tail leaves the body: the top of the rump. */
export function tailRoot(pose: CatPose): Point {
  return bodyPoint(pose, -CAT.rump * 0.7, -CAT.rump * 0.5);
}

/** Head centre in the drawing. */
export function headCentre(pose: CatPose): Point {
  return { x: pose.chest.x + pose.head.x, y: pose.chest.y + pose.head.y };
}

/** Screen direction of each tail segment from root to tip, in degrees. */
export function tailAngles(pose: CatPose): number[] {
  const { angle, curl, phase, amp } = pose.tail;
  return Array.from({ length: CAT.tailSegments }, (_, i) => {
    const s = (i + 1) / CAT.tailSegments;
    // The wave travels from root to tip and grows towards the tip: follow-through.
    return angle + curl * s ** 1.4 + amp * s * Math.sin(phase - i * 0.55);
  });
}

/** Points along the tail from root to tip, for the given segment directions. */
export function tailPoints(pose: CatPose, angles: number[] = tailAngles(pose)): Point[] {
  const points = [tailRoot(pose)];
  for (const deg of angles) {
    const prev = points[points.length - 1]!;
    const r = (deg * Math.PI) / 180;
    points.push({ x: prev.x + Math.cos(r) * CAT.tailSegment, y: prev.y + Math.sin(r) * CAT.tailSegment });
  }
  return points;
}

/** A paw at `home` cycling through a step: planted and sliding back, then lifted forward in an arc. */
function step(home: Point, q: number, stride: number, lift: number, duty: number): Point {
  if (q < duty) return { x: home.x + stride * (0.5 - q / duty), y: 0 };
  const s = (q - duty) / (1 - duty);
  return { x: home.x + stride * (smooth(s) - 0.5), y: -lift * Math.sin(Math.PI * s) };
}

function walk(t: number): CatPose {
  const pose = standing();
  const p = cycle(t, 600);
  // Lateral sequence, like a real cat: back left, front left, back right, front right.
  const offsets: Record<LegName, number> = { backNear: 0, frontNear: 0.25, backFar: 0.5, frontFar: 0.75 };
  for (const leg of Object.keys(offsets) as LegName[]) {
    pose.paws[leg] = step(HOME[leg], cycle(p - offsets[leg], 1), 22, 5, 0.62);
  }
  // The spine rolls: hips and shoulders rise and fall a little out of step.
  pose.hip.y += 0.9 * Math.cos(TAU * 2 * p);
  pose.chest.y += 0.9 * Math.cos(TAU * 2 * p + 1.6);
  // Cats keep their head steady; it floats a touch behind the shoulders.
  pose.head.y += 0.5 * Math.sin(TAU * 2 * p - 0.8);
  pose.head.angle = 2 * Math.sin(TAU * p);
  pose.tail = { angle: -140 + 6 * wave(t, 1200), curl: 80, phase: (TAU * t) / 1200, amp: 12, puff: 1 };
  pose.squash = 1 + 0.012 * Math.cos(TAU * 2 * p);
  return pose;
}

/** A bounding gallop: stretched out long, then gathered up round, again and again. */
function gallop(t: number, periodMs: number): CatPose {
  const pose = standing();
  const p = cycle(t, periodMs);
  const e = Math.sin(TAU * p); // +1 stretched out, -1 gathered
  pose.hip = { x: -14 - 5 * e, y: -24 - 2.5 * (1 - e) * 0.5 - 1 };
  pose.chest = { x: 13 + 5 * e, y: -26 - 1.5 * (1 + e) * 0.5 };
  pose.arch = 3 - 6 * e;
  pose.squash = 1 - 0.06 * e;
  const lift = (centre: number, half: number) => {
    let d = Math.abs(p - centre);
    d = Math.min(d, 1 - d);
    return d < half ? 0 : -7 * Math.sin((Math.PI / 2) * ((d - half) / (0.5 - half))) ** 2;
  };
  pose.paws.frontNear = { x: pose.chest.x + 2 + 13 * Math.cos(TAU * (p - 0.35)), y: lift(0.47, 0.12) };
  pose.paws.frontFar = { x: pose.chest.x + 5 + 13 * Math.cos(TAU * (p - 0.41)), y: lift(0.53, 0.12) };
  pose.paws.backNear = { x: pose.hip.x + 1 + 13 * Math.cos(TAU * (p - 0.8)), y: lift(0.9, 0.12) };
  pose.paws.backFar = { x: pose.hip.x + 4 + 13 * Math.cos(TAU * (p - 0.86)), y: lift(0.96, 0.12) };
  pose.head = { x: 10 + 1.5 * e, y: -12 + 1.2 * Math.sin(TAU * p - 1), angle: -3 * e };
  // The tail streams out behind and ripples a beat late.
  pose.tail = { angle: -172 + 8 * Math.sin(TAU * p - 1.2), curl: 30, phase: TAU * p, amp: 14, puff: 1 };
  pose.ears = 0.45;
  return pose;
}

/** Sitting tall on the haunches, front paws together, tail laid round the side. */
function sitting(t: number): CatPose {
  const pose = standing();
  const breath = wave(t, 2800);
  pose.hip = { x: -9, y: -12 };
  pose.chest = { x: 8, y: -34 - 0.4 * breath };
  pose.arch = 4;
  pose.breathe = 1 + 0.03 * breath;
  pose.head = { x: 9, y: -12, angle: -4 };
  pose.paws = { frontNear: { x: 11, y: 0 }, frontFar: { x: 14, y: 0 }, backNear: { x: -1, y: 0 }, backFar: { x: 2, y: 0 } };
  pose.tail = { angle: 145, curl: 120, phase: (TAU * t) / 3000, amp: 12, puff: 1 };
  return pose;
}

export function catPoseFor(animation: AnimationName, t: number, keystrokes = 0): CatPose {
  switch (animation) {
    case 'idle': {
      const pose = standing();
      const breath = wave(t, 2600);
      pose.breathe = 1 + 0.03 * breath;
      pose.chest.y -= 0.4 * breath;
      // A lazy tail sway with a curl that rolls up to the tip.
      pose.tail.phase = (TAU * t) / 3000;
      pose.tail.amp = 14;
      pose.tail.angle = -150 + 8 * wave(t, 6000);
      // Glances about, easing from one spot to the next rather than snapping.
      const glance = smooth((cycle(t, 6000) * 6000 - 2500) / 600) - smooth((cycle(t, 6000) * 6000 - 5000) / 600);
      pose.look = { x: 0.2 + 0.6 * glance, y: -0.1 * glance };
      pose.head.angle = -3 * glance + 1.5 * wave(t, 6000);
      // Now and then an ear flicks.
      pose.ears = 0.5 * hump(cycle(t, 12_000) * 12_000, 8000, 8250);
      return pose;
    }

    case 'walk':
      return walk(t);

    case 'run':
      return gallop(t, 340);

    case 'chase': {
      const pose = gallop(t, 300);
      // Locked on: ears forward, head low, pupils huge.
      pose.ears = 0;
      pose.head.y += 3;
      pose.head.angle = 6;
      pose.pupil = 1;
      pose.look = { x: 0.6, y: 0 };
      pose.tail.angle = -160;
      pose.tail.curl = 60;
      return pose;
    }

    case 'jump': {
      // A pounce: crouch and wiggle (anticipation), stretch long in the air, squash on landing.
      const pose = standing();
      const crouch = hump(t, 0, 140);
      const air = hump(t, 100, 320);
      const land = hump(t, 290, 400);
      pose.hip.y += 6 * crouch + 2 * land;
      pose.hip.x -= 4 * air;
      pose.hip.x += 2.5 * Math.sin((TAU * t) / 70) * crouch; // butt wiggle
      pose.chest.y += 4 * crouch - 4 * air + 3 * land;
      pose.chest.x += 7 * air;
      pose.squash = 1 - 0.14 * crouch - 0.12 * land + 0.06 * air;
      const up = -12 * air;
      pose.hip.y += up;
      pose.chest.y += up;
      pose.paws.frontNear = { x: 15 + 22 * air, y: -15 * air };
      pose.paws.frontFar = { x: 19 + 20 * air, y: -12 * air };
      pose.paws.backNear = { x: -12 - 16 * air, y: -7 * air };
      pose.paws.backFar = { x: -8 - 16 * air, y: -6 * air };
      // Nose up and front higher than the back: a long diagonal leap.
      pose.chest.y -= 4 * air;
      pose.head = { x: 10 + 2 * air, y: -11 + 2 * crouch, angle: 8 * crouch - 4 * air };
      pose.tail = { angle: -165 + 25 * air, curl: 40 + 40 * crouch, phase: (TAU * t) / 200, amp: 10, puff: 1 };
      pose.ears = 0.2;
      pose.pupil = 1;
      pose.lids = -0.2;
      return pose;
    }

    case 'surprised': {
      // The Halloween-cat startle: squash, then spring straight up arched and puffed.
      const pose = standing();
      const crouch = hump(t, 0, 90);
      const up = hump(t, 60, 400);
      const land = hump(t, 360, 450);
      const rise = -16 * up;
      pose.hip.y += rise + 3 * crouch;
      pose.chest.y += rise + 3 * crouch;
      pose.hip.x += 1.5 * up;
      pose.chest.x -= 1.5 * up;
      pose.arch = 2 + 17 * up;
      pose.squash = 1 - 0.15 * crouch - 0.1 * land + 0.04 * up;
      for (const leg of Object.keys(pose.paws) as LegName[]) {
        const home = HOME[leg];
        pose.paws[leg] = { x: home.x * (1 - 0.2 * up), y: -6 * up };
      }
      pose.head = { x: 7, y: -12 - 2 * up, angle: -6 * up };
      pose.tail = { angle: -110 + 20 * up, curl: 10, phase: 0, amp: 0, puff: 1 + 0.9 * up };
      pose.ears = 0.7 * up;
      pose.pupil = 0.1;
      pose.lids = -0.35 * up;
      return pose;
    }

    case 'sit': {
      const pose = sitting(t);
      pose.head.angle += 3 * wave(t, 6000);
      pose.look = { x: 0.3 * wave(t, 9000), y: 0 };
      return pose;
    }

    case 'groom': {
      // Licks a raised paw: the head bobs with each lick and the paw moves with it.
      const pose = sitting(t);
      const lick = 0.5 + 0.5 * wave(t, 500);
      pose.head = { x: 9, y: -9 + 1.4 * lick, angle: 18 + 6 * lick };
      const head = headCentre(pose);
      pose.paws.frontNear = { x: head.x + 9, y: head.y + 10 - 1.5 * lick };
      pose.mouth = 0.25 * lick;
      pose.ears = 0.15;
      return pose;
    }

    case 'yawn': {
      // A big stretchy yawn: rises up, head back, then settles.
      const pose = sitting(t);
      const open = hump(t, 0, 2200);
      pose.mouth = open;
      pose.head.angle -= 22 * open;
      pose.head.y -= 2 * open;
      pose.squash = 1 + 0.06 * open;
      pose.ears = 0.45 * open;
      return pose;
    }

    case 'confused': {
      // Head tilts from side to side, easing over rather than snapping.
      const pose = sitting(t);
      const s = cycle(t, 1800) * 1800;
      const side = smooth((s - 200) / 400) * 2 - 1 - (smooth((s - 1100) / 400) * 2 - 0);
      pose.head.angle -= 14 * side;
      pose.look = { x: 0.6 * side, y: -0.6 };
      pose.ears = 0.3;
      return pose;
    }

    case 'sleep': {
      // Curled into a loaf, tail wrapped round the front, breathing slowly.
      const pose = standing();
      const breath = wave(t, 3200);
      pose.hip = { x: -11, y: -10 };
      pose.chest = { x: 7, y: -10.5 - 0.6 * breath };
      pose.arch = 5 + 1 * breath;
      pose.breathe = 1 + 0.06 * breath;
      pose.paws = { frontNear: { x: 12, y: -0.5 }, frontFar: { x: 14, y: -0.5 }, backNear: { x: -4, y: -0.5 }, backFar: { x: -1, y: -0.5 } };
      pose.head = { x: 9, y: -2 - 0.3 * breath, angle: 22 };
      pose.tail = { angle: 168, curl: -150, phase: 0, amp: 0, puff: 1 };
      pose.ears = 0.25;
      return pose;
    }

    case 'peek': {
      // Up on the back legs behind the bottom edge, front paws hooked over it, eyes
      // following the typing like reading along a line.
      const pose = standing();
      const edge = CAT_PEEK_EDGE_Y;
      pose.hip = { x: -5, y: edge + 14 };
      pose.chest = { x: 3, y: edge - 9 };
      pose.arch = 3;
      pose.head = { x: 8, y: -13, angle: 14 + (keystrokes % 2) * 2 };
      pose.paws.frontNear = { x: 14, y: edge - 1.5 };
      pose.paws.frontFar = { x: 21, y: edge - 1.5 };
      pose.paws.backNear = { x: -6, y: 0 };
      pose.paws.backFar = { x: -2, y: 0 };
      pose.tail = { angle: 150, curl: -40, phase: 0, amp: 0, puff: 1 };
      pose.ears = 0.05;
      pose.pupil = 0.8;
      pose.look = { x: -1 + ((keystrokes % 8) / 7) * 2, y: 0.7 };
      return pose;
    }

    case 'happy': {
      // Being petted: eyes shut, leans up into the hand, kneads with the front paws, tail up.
      const pose = sitting(t);
      const knead = wave(t, 600);
      pose.head.angle -= 10 - 5 * wave(t, 1200);
      pose.head.y -= 1;
      pose.paws.frontNear = { x: 11, y: -2.2 * Math.max(0, knead) };
      pose.paws.frontFar = { x: 14, y: -2.2 * Math.max(0, -knead) };
      pose.tail = { angle: -120, curl: 70, phase: (TAU * t) / 1200, amp: 18, puff: 1 };
      pose.ears = 0.2;
      pose.squash = 1 + 0.015 * wave(t, 300);
      pose.mouth = 0.15;
      return pose;
    }

    case 'dangle': {
      // Held by the scruff: the body hangs long and stretchy (a cat is mostly noodle), legs
      // dangling, swaying gently with the tail swinging a beat behind.
      const pose = standing();
      const sway = wave(t, 1400);
      pose.hip = { x: -20, y: -24 };
      pose.chest = { x: 13, y: -26 };
      pose.arch = -2;
      pose.rotate = -68 + 9 * sway;
      pose.pivot = bodyPoint(pose, spineLength(pose) - 2, -CAT.chest);
      pose.head = { x: 7, y: -14, angle: 55 };
      // Legs hang straight down whatever the body's angle, lagging the swing a little.
      const hang = ((-pose.rotate + 6 * wave(t, 1400, -0.12)) * Math.PI) / 180;
      for (const leg of Object.keys(pose.paws) as LegName[]) {
        const root = legRoot(pose, leg);
        const len = leg.startsWith('front') ? 20 : 22;
        pose.paws[leg] = { x: root.x - Math.sin(hang) * len, y: root.y + Math.cos(hang) * len };
      }
      pose.tail = { angle: -180 - 40, curl: -20, phase: (TAU * t) / 1400 - 1.4, amp: 16, puff: 1 };
      pose.ears = 0.35;
      pose.look = { x: 0, y: 0.4 };
      pose.pupil = 0.9;
      return pose;
    }
  }
}
