import { PLAY } from '../animations';
import { BIN } from '../bin';
import { bump, clamp, clamp01, DEG, easeOut, keyed, lerp, noise1, smooth, span, wave } from '../critter/kit';
import type { AnimationName, EyeStyle } from '../types';
import { CHIBI_TOY, type ChibiBuild, type Pt } from './species';
import { reel, typing } from '../typing';

export const LEGS = ['frontNear', 'frontFar', 'backNear', 'backFar'] as const;
export type LegName = (typeof LEGS)[number];

/** How the eyes are drawn: open, shut in a relaxed curve, happy ^ ^, wide, or mid-blink. */
export type ChibiEyes = 'open' | 'closed' | 'happy' | 'wide' | 'blink';
/** Little marks that float about him: sleep, alarm, puzzlement, love. */
export type ChibiMark = 'zzz' | 'alarm' | 'puzzled' | 'hearts' | 'angry' | null;

/**
 * Everything the drawing needs for one moment. Positions are in drawing units from his
 * feet, facing right, y down. The numbers blend smoothly from one animation to the next.
 */
export interface ChibiPose {
  /** The whole animal raised off the floor (negative is up). */
  lift: number;
  /** The body: moved from where it stands, tipped nose-up by `rot` degrees, squashed. */
  bx: number;
  by: number;
  rot: number;
  sx: number;
  /** Negative turns it over (an otter floating on its back). */
  sy: number;
  /** The head: moved from its place on the body, and tipped chin-up. */
  hx: number;
  hy: number;
  hrot: number;
  /** Where each paw is, from his feet as they'd be on the floor: `lift` carries them up with him. */
  paws: Record<LegName, Pt>;
  /** Tail: the angle it leaves the body at, how far it curls, a sway, and how fluffed up. */
  tailA: number;
  tailCurl: number;
  tailPuff: number;
  /** 1 brings the tail round in front of him (wrapped round his paws). */
  tailFront: number;
  /** Ears: 1 pricked, 0 relaxed, -1 flat back. */
  ears: number;
  mouth: number;
  tongue: number;
  lookX: number;
  lookY: number;
  blush: number;
  /** Sitting, the thigh shows as a round haunch. */
  haunch: number;
  /** 1 brings the near front paw up in front of him (grooming), 2 both (paws on the screen edge). */
  pawUp: number;
  /** An otter's shell, held on its chest. */
  shell: number;
  /** 1 holds a toy block in both front paws (a raccoon), rather than in the mouth. */
  hold: number;
  /**
   * How far the face is turned from three-quarters towards you round to the way he faces,
   * 0..1: looking at something beside him (his screen) rather than out at you.
   */
  turn: number;
  /** How much of a pond there is round him (swimmers only). */
  wet: number;
  /** Rocking on the end of your grip, in degrees round the scruff. */
  swing: number;
  eyes: ChibiEyes;
  mark: ChibiMark;
  /** Splashes about him: 0 none, 1 a few drops, 2 a proper splash. */
  splash: number;
  /** Bubbles coming up where he is, under the water. */
  bubbles: number;
  /** Rolled up in a ball (a hedgehog), and how far round it has rolled, in degrees. */
  ball: number;
  roll: number;
  /**
   * How far long ears (a bunny's) have swung back from where they'd be, in degrees: they're
   * left behind as he springs up and flop on as he lands. Set by the motion, not the pose.
   */
  earFlap: number;
}

/** The water's surface for a swimmer, from its feet. */
export const WATER_Y = -7;

export interface ChibiInput {
  animation: AnimationName;
  /** Time into the animation (ms). */
  t: number;
  /** Wall-clock time (ms), for the movement that carries on through animations. */
  clock: number;
  /** How far round the stride he is, 0..1, kept in step with the ground. */
  phase: number;
  keystrokes: number;
  eyes: EyeStyle | 'blink';
  /** Where the pointer is from his feet, in drawing units, already turned to his facing. */
  gaze: Pt | null;
}

const NUMBERS = [
  'lift',
  'bx',
  'by',
  'rot',
  'sx',
  'sy',
  'hx',
  'hy',
  'hrot',
  'tailA',
  'tailCurl',
  'tailPuff',
  'tailFront',
  'ears',
  'mouth',
  'tongue',
  'lookX',
  'lookY',
  'blush',
  'haunch',
  'pawUp',
  'shell',
  'hold',
  'turn',
  'wet',
  'swing',
  'splash',
  'bubbles',
  'ball',
  'roll',
] as const satisfies readonly (keyof ChibiPose)[];

/** Where the body's middle is and how it's turned, and a way to place points on it. */
export function bodyFrame(b: ChibiBuild, p: ChibiPose) {
  const cx = b.body.at.x + p.bx;
  const cy = b.body.at.y + p.by + p.lift;
  const th = -p.rot * DEG;
  const c = Math.cos(th);
  const s = Math.sin(th);
  /** A point on the body; `flat` ignores the squash's sign, for things that don't turn over with it. */
  const at = (l: Pt, flat = false): Pt => {
    const x = l.x * p.sx;
    const y = l.y * (flat ? Math.abs(p.sy) : p.sy);
    return { x: cx + x * c - y * s, y: cy + x * s + y * c };
  };
  return { cx, cy, at };
}

/** Where a leg joins the body. Far legs sit a little behind and above the near ones. */
export function legRoot(b: ChibiBuild, p: ChibiPose, leg: LegName): Pt {
  const base = leg.startsWith('front') ? b.shoulder : b.hip;
  const root = bodyFrame(b, p).at(base);
  return leg.endsWith('Far') ? { x: root.x + b.farOffset * 0.6, y: root.y - 1 } : root;
}

export function headCentre(b: ChibiBuild, p: ChibiPose): Pt {
  const at = bodyFrame(b, p).at(b.head.at, true);
  return { x: at.x + p.hx, y: at.y + p.hy };
}

/** Where he's held when he's picked up: the scruff, at the back of his neck. */
export function scruffPoint(b: ChibiBuild, p: ChibiPose): Pt {
  const h = headCentre(b, p);
  const th = -p.hrot * DEG;
  const l = { x: -b.head.rx * 0.5, y: -b.head.ry * 0.82 };
  return { x: h.x + l.x * Math.cos(th) - l.y * Math.sin(th), y: h.y + l.x * Math.sin(th) + l.y * Math.cos(th) };
}

/**
 * Where a toy block he has hold of is (its middle): between his front paws if he's holding
 * it in them, or else hanging from his jaws, just under the corner of his mouth.
 */
export function toyHoldPoint(b: ChibiBuild, p: ChibiPose): Pt {
  if (p.hold > 0.5) {
    const a = p.paws.frontNear;
    const z = p.paws.frontFar;
    return { x: (a.x + z.x) / 2 + 2.5, y: (a.y + z.y) / 2 + p.lift - 1 };
  }
  const h = headCentre(b, p);
  const th = -p.hrot * DEG;
  const l = { x: b.head.rx * 0.78, y: b.head.ry * 0.55 };
  const mouth = { x: h.x + l.x * Math.cos(th) - l.y * Math.sin(th), y: h.y + l.x * Math.sin(th) + l.y * Math.cos(th) };
  return { x: mouth.x + 1, y: mouth.y + CHIBI_TOY * 0.37 };
}

/** Standing square on all fours, every paw under its shoulder or hip. */
function stand(b: ChibiBuild): ChibiPose {
  const p: ChibiPose = {
    lift: 0,
    bx: 0,
    by: 0,
    rot: 0,
    sx: 1,
    sy: 1,
    hx: 0,
    hy: 0,
    hrot: 0,
    paws: {} as Record<LegName, Pt>,
    tailA: b.tail.angle,
    tailCurl: b.tail.curl,
    tailPuff: 1,
    tailFront: 0,
    ears: 0,
    mouth: 0,
    tongue: 0,
    lookX: 0,
    lookY: 0,
    blush: 0.55,
    haunch: 0,
    pawUp: 0,
    shell: 0,
    hold: 0,
    turn: 0,
    wet: 0,
    swing: 0,
    eyes: 'open',
    mark: null,
    splash: 0,
    bubbles: 0,
    ball: 0,
    roll: 0,
    earFlap: 0,
  };
  plant(b, p);
  return p;
}

/** Puts every paw on the floor straight under where its leg joins. */
function plant(b: ChibiBuild, p: ChibiPose): void {
  for (const leg of LEGS) p.paws[leg] = { x: legRoot(b, p, leg).x, y: 0 };
}

/** Sitting up: rump on the floor, front legs straight, hind feet forward under the haunch. */
function sit(b: ChibiBuild): ChibiPose {
  const p = stand(b);
  p.rot = 26;
  p.bx = -1.5;
  p.by = 2.5 - b.body.rx * 0.1;
  p.hx = -2.5;
  p.hy = 1.5;
  for (const leg of ['frontNear', 'frontFar'] as const) p.paws[leg] = { x: legRoot(b, p, leg).x + 1, y: 0 };
  const hip = legRoot(b, p, 'backNear');
  p.paws.backNear = { x: hip.x + 7.5, y: 0 };
  p.paws.backFar = { x: hip.x + 9.5, y: 0 };
  p.haunch = 1;
  // The tail comes down and round in front of the paws.
  p.tailA = 205;
  p.tailCurl = -150;
  p.tailFront = 1;
  return p;
}

/**
 * Settled down for a rest: a bunny hunkers down into a loaf, front paws tucked under and
 * its ears laid back; a hedgehog lies low on its tummy, nose down; anyone else sits up.
 */
function rest(b: ChibiBuild): ChibiPose {
  if (b.species !== 'bunny' && b.species !== 'hedgehog') return sit(b);
  const p = stand(b);
  const bunny = b.species === 'bunny';
  p.by = bunny ? 3 : 2;
  p.sx = 1.04;
  p.sy = 0.94;
  p.hy = bunny ? 2 : 2.5;
  p.hrot = bunny ? -3 : -8;
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    const front = leg.startsWith('front');
    p.paws[leg] = { x: root.x + (front ? 2.5 : 1.5), y: Math.min(0, root.y + 2) };
  }
  p.haunch = bunny ? 1 : 0;
  p.ears = bunny ? -0.5 : 0;
  return p;
}

/** Lying curled up, paws tucked under, head down on the floor in front. */
function curl(b: ChibiBuild): ChibiPose {
  const p = stand(b);
  p.sy = 0.86;
  p.sx = 1.05;
  p.by = b.body.at.y * -0.3 + 1.5;
  p.hx = -1;
  p.hy = 6 - b.body.at.y * 0.12;
  p.hrot = -8;
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + (leg.startsWith('front') ? 4 : 2), y: Math.min(0, root.y + 3) };
  }
  p.tailA = 200;
  p.tailCurl = -170;
  p.tailFront = 1;
  return p;
}

function mix(a: ChibiPose, b: ChibiPose, k: number): ChibiPose {
  const out = { ...(k < 0.5 ? a : b), paws: {} as Record<LegName, Pt> };
  for (const key of NUMBERS) out[key] = lerp(a[key], b[key], k);
  for (const leg of LEGS) out.paws[leg] = { x: lerp(a.paws[leg].x, b.paws[leg].x, k), y: lerp(a.paws[leg].y, b.paws[leg].y, k) };
  return out;
}

/** Eases one pose towards another: `k` of the way there. */
export function blendPose(from: ChibiPose, to: ChibiPose, k: number): ChibiPose {
  return mix(from, to, k);
}

/** How far apart two poses are, to tell when a blend has settled. */
export function poseDistance(a: ChibiPose, b: ChibiPose): number {
  let d = 0;
  for (const key of NUMBERS) d = Math.max(d, Math.abs(a[key] - b[key]));
  for (const leg of LEGS) d = Math.max(d, Math.abs(a.paws[leg].x - b.paws[leg].x), Math.abs(a.paws[leg].y - b.paws[leg].y));
  return d;
}

/** Breathing and a slow sway of the tail, so he's never quite still. */
function alive(p: ChibiPose, clock: number, amount = 1): void {
  const breath = wave(clock, 2600);
  p.sy *= 1 + 0.025 * breath * amount;
  p.sx *= 1 - 0.012 * breath * amount;
  p.tailA += noise1(clock / 1700, 3) * 9 * amount;
  p.tailCurl += noise1(clock / 2300, 5) * 14 * amount;
  // Now and then an ear flicks.
  const flick = bump(((clock / 3900) % 1) * 9 - 7.6);
  p.ears += flick * 0.6;
}

/** Turns the head and eyes to the pointer. */
function look(b: ChibiBuild, p: ChibiPose, gaze: Pt | null, weight = 1): void {
  if (!gaze) return;
  const h = headCentre(b, p);
  const dx = gaze.x - h.x;
  const dy = gaze.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  p.lookX = lerp(p.lookX, clamp((dx / d) * 1.2, -1, 1), weight);
  p.lookY = lerp(p.lookY, clamp((dy / d) * 1.2, -1, 1), weight);
  // Looking up he lifts his chin a little; behind him, he doesn't screw his head round.
  p.hrot += clamp(-dy / 50, -1, 1) * 9 * weight * (dx > -10 ? 1 : 0.4);
}

function eyesFrom(input: ChibiInput): ChibiEyes {
  return input.eyes === 'closed' ? 'closed' : input.eyes === 'wide' ? 'wide' : input.eyes === 'blink' ? 'blink' : 'open';
}

/** Trotting: diagonal pairs of paws step together, the body bobbing twice a stride. */
function walk(b: ChibiBuild, p: ChibiPose, phase: number, amount = 1): void {
  const u = phase * Math.PI * 2;
  const offsets: Record<LegName, number> = { frontNear: 0, backFar: 0, frontFar: Math.PI, backNear: Math.PI };
  const bob = Math.cos(2 * u);
  p.by += 0.7 * bob * amount;
  p.rot += 1.6 * Math.sin(2 * u + 0.5) * amount;
  p.hy += 0.5 * Math.cos(2 * u - 0.6) * amount;
  for (const leg of LEGS) {
    const v = u + offsets[leg];
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + b.stride.walk * Math.sin(v) * amount, y: -3 * Math.max(0, Math.cos(v)) * amount };
  }
  p.tailA += 5 * Math.sin(u) * amount;
}

/** Bounding along: front paws together, then hind, the body rocking over them. */
function gallop(b: ChibiBuild, p: ChibiPose, phase: number, reach: number): void {
  const u = phase * Math.PI * 2;
  const offsets: Record<LegName, number> = { frontNear: 0, frontFar: -0.45, backNear: Math.PI * 0.95, backFar: Math.PI * 0.95 - 0.45 };
  p.rot += 8 * Math.sin(u + 0.3);
  p.lift += -3.2 * Math.max(0, Math.sin(u - 0.9));
  p.sx *= 1 + 0.07 * Math.sin(u + Math.PI / 2);
  p.sy *= 1 - 0.06 * Math.sin(u + Math.PI / 2);
  p.hy += 1 + 1.2 * Math.sin(u - 0.8);
  p.hx += 1.5;
  for (const leg of LEGS) {
    const v = u + offsets[leg];
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + reach * Math.sin(v), y: -4.2 * Math.max(0, Math.cos(v)) };
  }
  p.ears = -0.6;
  p.tailA = lerp(p.tailA, 172, 0.6) + 8 * Math.sin(u - 1);
  p.tailCurl *= 0.4;
}

/**
 * Hopping, both hind feet together: a crouch, a spring forward stretched out with the front
 * paws reaching for the ground, and a landing that gathers into the next crouch. One hop a
 * stride.
 */
function hop(b: ChibiBuild, p: ChibiPose, phase: number, height: number): void {
  const flying = phase > 0.15 && phase < 0.85;
  const air = clamp01((phase - 0.15) / 0.7);
  const up = flying ? Math.sin(Math.PI * air) : 0;
  // Crouched from landing (0.85) round to take-off (0.15).
  const crouch = flying ? 0 : Math.sin(Math.PI * ((phase + 0.15) % 1) / 0.3);
  p.lift = -height * up;
  p.by += 2.2 * crouch;
  p.sy *= 1 - 0.12 * crouch + 0.04 * up;
  p.sx *= 1 + 0.06 * crouch + 0.08 * up;
  p.rot += lerp(16, -14, smooth(air)) * up - 3 * crouch;
  p.hy += 1.2 * crouch - 0.6 * up;
  p.haunch = crouch > 0.5 ? 1 : 0;
  const k = Math.min(1, up * 2.2);
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    const front = leg.startsWith('front');
    // Down, the hind feet are tucked under the haunch; up, they trail behind and the front paws reach forward.
    const ground = { x: root.x + (front ? 1 : 3), y: 0 };
    const reach = { x: root.x + (front ? 5 : -7), y: root.y - p.lift + (front ? 5 : 3.5) };
    p.paws[leg] = { x: lerp(ground.x, reach.x, k), y: lerp(ground.y, reach.y, k) };
  }
  p.ears = lerp(p.ears, -0.7, up);
  p.tailA += 10 * up;
}

/** A pounce or a leap: gather, spring up in an arc, land. `gather` is how much of it is the crouch. */
function spring(b: ChibiBuild, p: ChibiPose, u: number, height: number, gather: number): void {
  const crouch = gather > 0 ? bump(Math.min(1, u / gather) * 0.5) : 0;
  const air = clamp01((u - gather) / (1 - gather));
  const up = Math.sin(Math.PI * air);
  p.by += 2.2 * crouch;
  p.sy *= 1 - 0.14 * crouch + 0.08 * up;
  p.sx *= 1 + 0.08 * crouch - 0.04 * up;
  p.rot += -6 * crouch + lerp(18, -14, smooth(air)) * up;
  p.lift = -height * up;
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    const front = leg.startsWith('front');
    // In the air the front paws reach forward and the hind legs stretch out behind.
    const reach = { x: root.x + (front ? 5.5 : -6), y: root.y - p.lift + 5 };
    const ground = { x: p.paws[leg].x, y: 0 };
    p.paws[leg] = { x: lerp(ground.x, reach.x, Math.min(1, up * 2)), y: lerp(ground.y, reach.y, Math.min(1, up * 2)) };
  }
  p.tailA = lerp(p.tailA, 168, up);
  p.ears = lerp(p.ears, -0.4, up);
}

/** A fox's mousing pounce: a crouch, a high arc, and down nose first onto whatever it's after. */
function pounce(b: ChibiBuild, p: ChibiPose, u: number): void {
  spring(b, p, u, 24, 0.35);
  const air = clamp01((u - 0.35) / 0.65);
  const up = Math.sin(Math.PI * air);
  const dive = smooth(clamp01((air - 0.4) / 0.6));
  p.rot -= 42 * dive * up;
  p.hrot -= 18 * dive * up;
  p.tailA += 30 * up;
}

/** Sat up on its hind legs to have a look about, front paws tucked to its chest (a bunny). */
function lookout(b: ChibiBuild): ChibiPose {
  const p = upright(b);
  p.hold = 0;
  p.haunch = 1;
  const shoulder = legRoot(b, p, 'frontNear');
  p.paws.frontNear = { x: shoulder.x + 3, y: shoulder.y + 4 };
  p.paws.frontFar = { x: shoulder.x + 1.5, y: shoulder.y + 3 };
  p.ears = 1;
  p.lookX = 0.5;
  p.lookY = -0.3;
  return p;
}

/** How big a hedgehog is rolled up: the radius of its ball. */
export function ballRadius(b: ChibiBuild): number {
  return b.body.ry * 1.25;
}

/** What a hedgehog rolls up for. */
const CURLS: ReadonlySet<AnimationName> = new Set(['run', 'chase', 'leap', 'sleep', 'surprised', 'dangle']);

/** Rolled up in a spiky ball: rolling along, bouncing, asleep, startled, or hanging from your grip. */
function curled(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, phase } = input;
  const R = ballRadius(b);
  const p = input.animation === 'dangle' ? dangle(b, input) : stand(b);
  p.ball = 1;
  p.eyes = 'closed';
  p.ears = -1;
  if (input.animation === 'dangle') {
    // Hanging just under your grip: the ball moves, and the head (where it's held) stays put.
    const s = scruffPoint(b, p);
    const f = bodyFrame(b, p);
    const dx = s.x - f.cx;
    const dy = s.y + R * 0.95 - f.cy;
    p.bx += dx;
    p.by += dy;
    p.hx -= dx;
    p.hy -= dy;
    return p;
  }
  p.by = -R - b.body.at.y;
  switch (input.animation) {
    case 'run':
    case 'chase':
      // Half a turn a stride (a whole number of spikes, so it rolls on seamlessly), bumping along.
      p.roll = phase * 180;
      p.lift = -1.2 * Math.abs(Math.sin(phase * Math.PI * 4));
      break;
    case 'leap':
      p.roll = phase * 180;
      p.lift = -14 * Math.sin(Math.PI * clamp01(t / 420));
      break;
    case 'sleep': {
      const breath = wave(t, 3200);
      p.sy *= 1 + 0.04 * breath;
      p.sx *= 1 + 0.02 * breath;
      p.blush = 0.7;
      p.mark = 'zzz';
      break;
    }
    case 'surprised': {
      // Pops up, bristling.
      p.lift = -7 * Math.sin(Math.PI * Math.min(1, clamp01(t / 450) * 1.7));
      p.sx = 1.08;
      p.sy = 1.08;
      p.mark = 'alarm';
      break;
    }
  }
  return p;
}

/** Hanging from your grip by the scruff: body straight down, legs and tail dangling. */
function dangle(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const p = stand(b);
  p.rot = 80;
  p.bx = -4 - b.body.at.x * 0.2;
  p.by = b.body.rx * 0.3;
  // Turned upright, the head would end up behind; it goes on top.
  p.hx = 12;
  p.hy = -b.body.rx * 0.5 + 4;
  p.hrot = -4;
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    const sway = Math.sin(input.t / 260 + (leg.startsWith('front') ? 0 : 1.4)) * 0.8;
    p.paws[leg] = { x: root.x + (leg.startsWith('front') ? 3 : 1.5) + sway, y: root.y + 6.5 };
  }
  p.tailA = -95;
  p.tailCurl = 25;
  p.ears = -0.3;
  p.swing = 7 * Math.sin((input.t / 1400) * Math.PI * 2);
  p.mouth = 0.12;
  p.blush = 0.8;
  p.eyes = eyesFrom(input);
  return p;
}

/** Peeking up over the bottom of the screen, paws on the edge. */
function peek(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const p = stand(b);
  p.rot = 74;
  p.bx = 1;
  p.by = -2;
  // Turned upright, the head would end up behind; it goes on top.
  p.hx = 12.5;
  p.hy = -1;
  const edge = -b.peekSink;
  const h = headCentre(b, p);
  p.paws.frontNear = { x: h.x + b.head.rx * 0.35, y: edge };
  p.paws.frontFar = { x: h.x - b.head.rx * 0.2, y: edge - 0.5 };
  for (const leg of ['backNear', 'backFar'] as const) p.paws[leg] = { x: legRoot(b, p, leg).x + 3, y: 0 };
  p.pawUp = 2;
  p.tailA = -80;
  p.tailCurl = 30;
  // His eyes dart from side to side with your typing.
  const k = input.keystrokes;
  p.lookX = k === 0 ? 0 : ((k % 4) - 1.5) / 1.5;
  p.lookY = -0.2;
  p.hrot = p.lookX * -4;
  p.ears = 0.6;
  p.eyes = eyesFrom(input);
  return p;
}

/**
 * Swatting a toy block along the floor: a crouch with the bottom up and the tail lashing,
 * the paw cocked, a quick swipe that meets the block on the beat, and the follow-through.
 */
function bat(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock } = input;
  const { batHitMs: hit } = PLAY;
  const p = stand(b);
  const crouch = keyed(t, [[0, 0], [140, 1], [hit + 150, 1], [PLAY.batMs - 50, 0]]);
  p.by += 1.8 * crouch;
  p.rot -= 4 * crouch;
  p.hrot -= 9 * crouch;
  p.hx += 1.5 * crouch;
  p.tailA += 16 * crouch;
  p.tailCurl += 30 * Math.sin(clock / 70) * crouch;
  p.ears = 0.8 * crouch;
  plant(b, p);
  const root = legRoot(b, p, 'frontNear');
  const contact = b.toyReach - CHIBI_TOY / 2 - 0.5;
  p.paws.frontNear = {
    x: keyed(t, [[0, root.x], [150, root.x + 5], [hit, contact], [hit + 100, contact + 2.5], [PLAY.batMs - 60, root.x]]),
    y: keyed(t, [[0, 0], [150, -12], [hit, -4], [hit + 100, -1.5], [PLAY.batMs - 60, 0]]),
  };
  p.pawUp = t > 40 && t < PLAY.batMs - 90 ? 1 : 0;
  p.lookX = 0.9;
  p.lookY = 0.8 * crouch;
  p.mouth = 0.2 * keyed(t, [[hit - 40, 0], [hit + 20, 1], [hit + 260, 0]]);
  p.eyes = t < hit + 200 ? 'wide' : eyesFrom(input);
  return p;
}

/**
 * Picking a block up in his mouth and flinging it: down to it, a toss of the head back and
 * up as he lifts it, then a whip forward that lets it go at the top of the swing.
 */
function toss(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const { tossGrabMs: grab, tossReleaseMs: release, tossMs: end } = PLAY;
  const wind = release - 220;
  const p = stand(b);
  p.rot = keyed(t, [[0, 0], [grab, -9], [grab + 60, -9], [wind, 10], [release, -3], [release + 150, -5], [end, 0]]);
  p.by = keyed(t, [[0, 0], [grab, 2], [wind, -0.5], [release, 0]]);
  p.hx = keyed(t, [[0, 0], [grab, 2.5], [grab + 60, 2.5], [wind, -3], [release, 4], [release + 150, 4.5], [end, 0]]);
  p.hy = keyed(t, [[0, 0], [grab, 4], [grab + 60, 4], [wind, -3], [release, -2], [end, 0]]);
  p.hrot = keyed(t, [[0, 0], [grab, -24], [grab + 60, -24], [wind, 26], [release, 6], [release + 150, -4], [end, 0]]);
  plant(b, p);
  p.tailA += keyed(t, [[0, 0], [wind, 25], [release, -10], [end, 0]]);
  p.ears = keyed(t, [[0, 0.3], [wind, -0.2], [release, 0.8], [end, 0.3]]);
  p.lookX = 0.7;
  p.lookY = keyed(t, [[0, 0.3], [grab - 100, 0.9], [grab + 60, 0.9], [wind, -0.5], [release + 100, -0.8], [end, -0.3]]);
  p.mouth = 0.35 * keyed(t, [[release, 0], [release + 60, 1], [end, 0]]);
  p.eyes = t > release + 40 && t < end - 120 ? 'happy' : eyesFrom(input);
  return p;
}

/** Up on his hind legs, hugging a toy block to his tummy in both front paws. */
function upright(b: ChibiBuild): ChibiPose {
  const p = stand(b);
  p.rot = 70;
  p.bx = 1;
  p.by = -2.2;
  // Turned upright, the head would end up behind; it goes on top.
  p.hx = 15;
  p.hy = -3;
  p.hrot = -4;
  for (const leg of ['backNear', 'backFar'] as const) p.paws[leg] = { x: legRoot(b, p, leg).x + 0.5, y: 0 };
  const shoulder = legRoot(b, p, 'frontNear');
  p.paws.frontNear = { x: shoulder.x + 6.5, y: shoulder.y + 3 };
  p.paws.frontFar = { x: shoulder.x + 4.5, y: shoulder.y + 1.5 };
  p.pawUp = 2;
  p.hold = 1;
  // The tail out behind him along the floor, to balance (its angle is from the body, which is upright).
  p.tailA = 118;
  p.tailCurl = 30;
  p.ears = 0.3;
  p.lookX = 0.6;
  p.lookY = 0.3;
  return p;
}

/** Bent down over a block in front of him, front paws round it. */
function reachDown(b: ChibiBuild): ChibiPose {
  const p = stand(b);
  p.rot = -9;
  p.by = 2;
  p.hx = 2.5;
  p.hy = 4;
  p.hrot = -20;
  plant(b, p);
  const contact = b.toyReach - CHIBI_TOY / 2;
  p.paws.frontNear = { x: contact + 0.5, y: -4 };
  p.paws.frontFar = { x: contact - 1, y: -5 };
  p.pawUp = 2;
  p.ears = 0.4;
  p.lookX = 0.8;
  p.lookY = 0.9;
  return p;
}

/** Eases from each pose to the next at the times given (ms), holding the last. */
function through(t: number, keys: readonly (readonly [number, ChibiPose])[]): ChibiPose {
  for (let i = 1; i < keys.length; i++) {
    const [t0, from] = keys[i - 1]!;
    const [t1, to] = keys[i]!;
    if (t <= t1) return mix(from, to, smooth(clamp01((t - t0) / (t1 - t0))));
  }
  return keys[keys.length - 1]![1];
}

/** A raccoon picking a block up in his front paws and standing up with it. */
function lift(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const { liftGrabMs: grab, liftMs: end } = PLAY;
  const reach = reachDown(b);
  const p = through(t, [
    [0, stand(b)],
    [grab - 40, reach],
    [grab + 60, reach],
    [end - 120, upright(b)],
  ]);
  // He only has it from the moment he grabs it.
  p.hold = t >= grab ? 1 : 0;
  p.eyes = t > end - 250 ? 'happy' : eyesFrom(input);
  p.mouth = 0.25 * span(t, end - 300, end - 120);
  return p;
}

/**
 * Toddling along on his hind legs with the block: quick little steps, bobbing up over each
 * foot, rocking from side to side, the tail swinging to balance him.
 */
function carry(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const p = upright(b);
  const u = input.phase * Math.PI * 4;
  const rock = Math.sin(u / 2);
  p.by += 0.6 * Math.cos(2 * u);
  p.rot += 4 * rock;
  p.hrot += 5 * rock;
  p.tailA += 12 * rock;
  for (const [leg, offset] of [['backNear', 0], ['backFar', Math.PI]] as const) {
    const v = u + offset;
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + 0.5 + b.stride.walk * 0.8 * Math.sin(v), y: -2.6 * Math.max(0, Math.cos(v)) };
  }
  // The block bobs along with him.
  const bob = 0.6 * Math.cos(2 * u);
  p.paws.frontNear.y += bob;
  p.paws.frontFar.y += bob;
  p.mouth = 0.15;
  p.eyes = eyesFrom(input);
  return p;
}

/** Throwing the block he's carrying: up over his head, a two-pawed throw, and back down on all fours. */
function throwIt(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const { throwReleaseMs: release, throwMs: end } = PLAY;
  const wind = release - 230;
  const down = release + 300;
  const held = upright(b);
  const over = upright(b);
  over.rot = 62;
  over.hrot = 14;
  over.ears = -0.3;
  over.lookY = -0.8;
  // Arms up behind his big head, the block held high over it.
  over.pawUp = 0;
  const h = headCentre(b, over);
  over.paws.frontNear = { x: h.x + 1, y: h.y - b.head.ry - 2 };
  over.paws.frontFar = { x: h.x - 2, y: h.y - b.head.ry - 1 };
  const flung = upright(b);
  flung.rot = 76;
  flung.hrot = 6;
  flung.ears = 0.8;
  flung.lookY = -0.6;
  // Paws out in front after it, below his chin.
  const chin = headCentre(b, flung);
  flung.paws.frontNear = { x: chin.x + b.head.rx * 1.05, y: chin.y + b.head.ry * 0.75 };
  flung.paws.frontFar = { x: chin.x + b.head.rx * 0.85, y: chin.y + b.head.ry * 0.85 };
  flung.hold = 0;
  const p = through(t, [
    [0, held],
    [wind, over],
    [release, flung],
    [down, stand(b)],
  ]);
  p.hold = t < release ? 1 : 0;
  p.mouth = 0.35 * keyed(t, [[release, 0], [release + 60, 1], [end, 0]]);
  p.eyes = t > release + 40 && t < end - 120 ? 'happy' : eyesFrom(input);
  return p;
}

/**
 * Sat at the desk, front paws up on the keyboard: typing in bursts, then stopping to
 * think, head tilted, eyes on the screen.
 */
function work(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const k = typing(input.clock);
  const p = upright(b);
  p.hold = 0;
  // Sat down on his bottom, hind feet out in front.
  p.rot = 64;
  p.by += 3;
  p.haunch = 1;
  for (const leg of ['backNear', 'backFar'] as const) p.paws[leg] = { x: legRoot(b, p, leg).x + (leg === 'backNear' ? 6 : 4), y: 0 };
  p.hrot = lerp(-5, 8, k.pause);
  p.paws.frontNear = { x: b.desk.x + 1.5, y: b.desk.y - k.near * 2.2 };
  p.paws.frontFar = { x: b.desk.x - 1.5, y: b.desk.y - k.far * 2.2 };
  p.pawUp = 2;
  // Face turned round to the screen, eyes on it (the brain says where it is), the chin up
  // a little more to think.
  p.turn = 0.9;
  p.lookX = 0.9;
  p.lookY = -0.4;
  look(b, p, input.gaze);
  p.lookY -= 0.25 * k.pause;
  p.ears = 0.3;
  p.tailA = 125;
  p.tailCurl = 20 + 20 * Math.sin(input.clock / 500) * k.pause;
  p.mouth = 0;
  p.eyes = eyesFrom(input);
  return p;
}

/** Browsing the web: a paw on the mouse, now and then clicking, reading down the page. */
function browse(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { clock } = input;
  const p = work(b, input);
  p.bx += 2;
  const click = Math.max(0, Math.sin((clock / 1000) * Math.PI * 2 * 0.45)) ** 14;
  p.paws.frontNear = { x: b.mouse.x + Math.sin(clock / 900) * 0.8, y: b.mouse.y - click * 1.6 };
  p.paws.frontFar = { x: b.desk.x - 1.5, y: b.desk.y };
  // Reading: the eyes run down the page, and back up to the top of the next bit.
  const read = (clock % 2600) / 2600;
  p.lookY = clamp(p.lookY + lerp(-0.3, 0.3, read), -1, 1);
  p.hrot += 2 * Math.sin(clock / 2300);
  return p;
}

/** Watching reels: leant back, flicking the mouse for the next one, giggling at the funny ones. */
function watchReels(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { clock } = input;
  const p = work(b, input);
  const r = reel(clock);
  p.rot -= 6;
  p.bx += 1;
  p.paws.frontNear = { x: b.mouse.x - r.flick * 2, y: b.mouse.y - r.flick * 2.2 };
  // The other paw back on his tummy.
  p.pawUp = 1;
  const chest = legRoot(b, p, 'frontFar');
  p.paws.frontFar = { x: chest.x + 4, y: chest.y + 5 };
  const giggle = r.funny && r.into > 0.2 && r.into < 0.8;
  if (giggle) {
    const shake = Math.sin(clock / 70);
    p.eyes = 'happy';
    p.mouth = 0.35 + 0.15 * shake;
    p.hrot += 4 * shake;
    p.blush = 1;
  }
  return p;
}

/** Wants to play: up on his toes, bouncing and waving a paw over his head at you. */
function attention(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const p = upright(b);
  p.hold = 0;
  const hop = Math.abs(Math.sin((t / 600) * Math.PI));
  p.lift = -3 * hop;
  const wave = Math.sin((t / 300) * Math.PI * 2);
  // One paw held out in front of him (clear of his face), waving.
  const shoulder = legRoot(b, p, 'frontNear');
  p.paws.frontNear = { x: shoulder.x + 17, y: shoulder.y - p.lift - 9 + wave * 3.5 };
  p.hrot = 6 * wave;
  p.ears = 0.8;
  p.mouth = 0.4;
  p.blush = 1;
  p.lookX = 0.4;
  p.lookY = -0.2;
  p.tailA += 12 * wave;
  p.eyes = eyesFrom(input);
  return p;
}

/** Cross: stamping a front paw, ears flat back, a scowl, tail lashing. */
function angry(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock } = input;
  const p = stand(b);
  const stamp = Math.max(0, Math.sin((t / 400) * Math.PI * 2));
  p.paws.frontNear = { x: p.paws.frontNear.x + 1, y: -4 * stamp };
  p.by += 1.2 * (1 - stamp);
  p.sy *= 1 + 0.04 * stamp;
  p.hrot = -6;
  p.hy += 1;
  p.ears = -1;
  p.tailPuff = 1.25;
  p.tailA += 18 * Math.sin(clock / 90);
  p.mouth = 0.18;
  p.blush = 0;
  p.eyes = 'blink';
  p.mark = 'angry';
  return p;
}

/** Creeping up on a block: low to the ground, eyes fixed on it, tail tip twitching, bottom wiggling. */
function stalk(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { phase, clock } = input;
  const p = stand(b);
  walk(b, p, phase, 0.55);
  // Down low over its paws (they stay where they are, so the legs fold).
  p.by += 3.2 + 0.5 * Math.sin(clock / 45);
  p.rot -= 2;
  p.hx += 2;
  p.hy += 2.5;
  p.hrot -= 6;
  p.ears = 0.9;
  p.lookX = 1;
  p.lookY = 0.5;
  p.tailA = lerp(p.tailA, 175, 0.7);
  p.tailCurl = 25 * Math.sin(clock / 120);
  p.eyes = 'wide';
  return p;
}

/** Nose down to a block, sniffing at it: little quick dips of the head. */
function sniff(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock } = input;
  const p = stand(b);
  p.rot -= 5;
  p.by += 1;
  p.hx += 3;
  p.hy += 5.5;
  p.hrot -= 22 + 4 * Math.max(0, Math.sin(t / 85));
  p.ears = 0.6 + 0.2 * Math.sin(t / 300);
  p.lookX = 0.8;
  p.lookY = 1;
  p.tailA += 10 * Math.sin(clock / 400);
  p.eyes = eyesFrom(input);
  return p;
}

/** Walking along with its head down, nosing a block along in front of it. */
function noseAlong(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const p = stand(b);
  if (b.gait === 'hop') hop(b, p, input.phase, 3);
  else walk(b, p, input.phase, 0.8);
  p.hx += 3;
  p.hy += 4.5;
  p.hrot -= 18;
  p.ears = 0.4;
  p.lookX = 1;
  p.lookY = 1;
  p.eyes = eyesFrom(input);
  return p;
}

/** Trotting off with a block in its mouth: head up, tail up, very pleased with itself. */
function trot(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const p = stand(b);
  if (b.gait === 'hop') hop(b, p, input.phase, 5);
  else walk(b, p, input.phase);
  p.hrot += 10;
  p.hy -= 1;
  p.tailA = lerp(p.tailA, 110, 0.5);
  p.ears = 0.7;
  p.blush = 0.8;
  p.eyes = eyesFrom(input);
  return p;
}

/**
 * Head first in his trash can, digging about for something: only his bottom, his hind legs
 * kicking and his tail waving stick up out of the top. He's stood at the middle of the
 * can's base, and its rim is `BIN.rim` up.
 */
function rummage(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { clock } = input;
  const p = stand(b);
  const dig = Math.sin(clock / 110);
  p.rot = -95 + 6 * dig;
  // The middle of him just under the rim, so his bottom sticks up out of it.
  p.bx = -b.body.at.x;
  p.by = -BIN.rim - 5 - b.body.at.y + 1.5 * Math.abs(dig);
  // His head straight down under him, in the can.
  const f = bodyFrame(b, p);
  const h = headCentre(b, p);
  p.hx = f.cx + 1 - h.x;
  p.hy = f.cy + b.body.rx * 0.9 + b.head.ry * 1.1 - h.y;
  // Nose down, so the top of his head (and any hat) is down in there too.
  p.hrot = -90;
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    if (leg.startsWith('front')) {
      // Digging, down in the can.
      p.paws[leg] = { x: root.x + 2 * Math.sin(clock / 90 + (leg === 'frontFar' ? 2 : 0)), y: root.y + 8 };
    } else {
      // Kicking in the air.
      const kick = Math.sin(clock / 150 + (leg === 'backFar' ? Math.PI : 0));
      p.paws[leg] = { x: root.x - 3 + 3 * kick, y: root.y - 5 - 2 * Math.max(0, kick) };
    }
  }
  // The tail straight up, waving.
  p.tailA = 185 + 22 * Math.sin(clock / 260);
  p.tailCurl = 20 * Math.sin(clock / 330);
  p.ears = -0.5;
  p.eyes = 'closed';
  return p;
}

/**
 * Popping up out of his trash can on his hind legs (the behaviour lifts him up out of it),
 * holding a block he's found up over his head in both paws.
 */
function emerge(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const p = upright(b);
  p.rot = 72;
  p.hrot = 8;
  p.pawUp = 0;
  // Arms straight up and out in front, as high as they reach, waving it about.
  const shoulder = legRoot(b, p, 'frontNear');
  const wave = Math.sin(t / 90) * span(t, 250, 400);
  p.paws.frontNear = { x: shoulder.x + 9 + wave, y: shoulder.y - 17 };
  p.paws.frontFar = { x: shoulder.x + 6.5 + wave, y: shoulder.y - 16 };
  p.ears = 0.8;
  p.mouth = 0.35;
  p.blush = 1;
  p.lookY = -0.6;
  p.eyes = t > 250 ? 'happy' : 'wide';
  return p;
}

/** The pose for a land animal at this moment. */
function walkerPose(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock, phase } = input;
  if (b.curls && CURLS.has(input.animation)) return curled(b, input);
  const hops = b.gait === 'hop';
  switch (input.animation) {
    case 'idle': {
      let p = stand(b);
      alive(p, clock);
      // Now and then a curious tilt of the head.
      p.hrot += noise1(clock / 3100, 9) * 7;
      // A bunny sits up every so often to have a look round.
      if (b.species === 'bunny') {
        const k = clock % 9000;
        p = mix(p, lookout(b), span(k, 6000, 6400) * (1 - span(k, 8200, 8600)));
      }
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'walk': {
      const p = stand(b);
      if (hops) hop(b, p, phase, 6);
      else walk(b, p, phase);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'run':
    case 'chase': {
      const p = stand(b);
      if (hops) hop(b, p, phase, input.animation === 'chase' ? 11 : 10);
      else gallop(b, p, phase, input.animation === 'chase' ? 7.5 : 6.5);
      p.eyes = input.animation === 'chase' ? 'wide' : eyesFrom(input);
      p.mouth = input.animation === 'chase' ? 0.15 : 0;
      return p;
    }
    case 'jump': {
      const p = stand(b);
      if (b.species === 'fox') pounce(b, p, clamp01(t / 400));
      else spring(b, p, clamp01(t / 400), 17, 0.32);
      p.eyes = 'wide';
      return p;
    }
    case 'leap': {
      const p = stand(b);
      gallop(b, p, phase, 6.5);
      spring(b, p, clamp01(t / 420), 13, 0);
      p.eyes = 'wide';
      p.mouth = 0.3;
      return p;
    }
    case 'sit': {
      const p = rest(b);
      alive(p, clock, 0.8);
      p.hrot += noise1(clock / 3600, 4) * 6;
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'groom': {
      const p = rest(b);
      const lick = (t % 1000) / 1000;
      const stroke = Math.sin(lick * Math.PI * 2);
      p.pawUp = 1;
      // The paw comes up to the mouth and goes over the face, ear to chin.
      const h = headCentre(b, p);
      p.paws.frontNear = { x: h.x + b.head.rx * 0.45 - stroke * 1.5, y: h.y + b.head.ry * 0.8 - stroke * 2.5 };
      p.hrot = -10 + stroke * 5;
      p.hx -= 1;
      p.tongue = clamp01(stroke) * 0.8;
      p.mouth = p.tongue * 0.3;
      p.eyes = 'closed';
      p.blush = 0.8;
      return p;
    }
    case 'yawn': {
      const p = rest(b);
      const open = span(t, 200, 800) * (1 - span(t, 1500, 2000));
      p.mouth = open;
      p.tongue = open * 0.6;
      p.hrot = 16 * open;
      p.hy -= 1.5 * open;
      p.ears = -0.5 * open;
      p.sy *= 1 + 0.05 * open;
      p.eyes = 'closed';
      return p;
    }
    case 'sleep': {
      const p = curl(b);
      const breath = wave(t, 3200);
      p.sy *= 1 + 0.04 * breath;
      p.sx *= 1 + 0.015 * breath;
      p.ears = -0.25;
      p.eyes = 'closed';
      p.blush = 0.7;
      p.mark = 'zzz';
      return p;
    }
    case 'peek':
      return peek(b, input);
    case 'surprised': {
      const p = stand(b);
      const u = clamp01(t / 450);
      const pop = Math.sin(Math.PI * Math.min(1, u * 1.7));
      p.lift = -9 * pop;
      p.sx = 1.08;
      p.sy = 1.12;
      p.tailPuff = 1.45;
      p.tailA = lerp(p.tailA, 100, 0.8);
      p.tailCurl = 10;
      p.ears = 1;
      p.mouth = 0.45;
      p.eyes = 'wide';
      p.mark = 'alarm';
      return p;
    }
    case 'confused': {
      const p = rest(b);
      // Head tilted one way, then the other.
      const side = Math.sin((t / 1800) * Math.PI * 2) > 0 ? 1 : -1;
      p.hrot = 14 * side;
      p.lookY = -0.6;
      p.lookX = 0.3 * side;
      p.ears = side > 0 ? 0.5 : -0.4;
      p.eyes = eyesFrom(input);
      p.mark = 'puzzled';
      return p;
    }
    case 'dangle':
      return dangle(b, input);
    case 'bat':
      return bat(b, input);
    case 'toss':
      return toss(b, input);
    // Only a raccoon carries a block about in his paws; anyone else just throws it.
    case 'lift':
      return b.species === 'raccoon' ? lift(b, input) : toss(b, input);
    case 'carry':
      return b.species === 'raccoon' ? carry(b, input) : walkerPose(b, { ...input, animation: 'walk' });
    case 'throw':
      return b.species === 'raccoon' ? throwIt(b, input) : toss(b, input);
    case 'work':
      return work(b, input);
    case 'browse':
      return browse(b, input);
    case 'reels':
      return watchReels(b, input);
    case 'attention':
      return attention(b, input);
    case 'angry':
      return angry(b, input);
    case 'stalk':
      return stalk(b, input);
    case 'sniff':
      return sniff(b, input);
    case 'nudge':
      return noseAlong(b, input);
    case 'fetch':
      return trot(b, input);
    case 'climb': {
      // A big spring up over the rim, or out over it.
      const p = stand(b);
      spring(b, p, clamp01(t / PLAY.climbMs), 38, 0.3);
      p.eyes = 'wide';
      return p;
    }
    case 'rummage':
      return rummage(b, input);
    case 'emerge':
      return emerge(b, input);
    case 'happy': {
      const p = stand(b);
      const hop = Math.abs(Math.sin((t / 600) * Math.PI * 2));
      // A hopper jumps for joy, with a twist in the air.
      p.lift = (hops ? -7 : -2.6) * hop;
      if (hops) p.rot += 12 * Math.sin((t / 600) * Math.PI * 2);
      p.sy *= 1 + 0.05 * hop;
      p.tailA += 14 * Math.sin((t / 300) * Math.PI * 2);
      p.tailCurl += 30 * Math.sin((t / 300) * Math.PI * 2 + 1);
      p.hrot = 6 * Math.sin((t / 1200) * Math.PI * 2);
      p.ears = 0.5;
      p.mouth = 0.4;
      p.blush = 1;
      p.eyes = 'happy';
      p.mark = 'hearts';
      return p;
    }
  }
}

// --- The otter, which swims. ---

/** Swimming at the surface: back and head out, legs paddling below. */
function swim(b: ChibiBuild, phase: number, speed: number): ChibiPose {
  const p = stand(b);
  const u = phase * Math.PI * 2;
  p.wet = 1;
  p.by = WATER_Y - b.body.at.y + 1.5 + 0.6 * Math.sin(2 * u);
  p.rot = -2 + speed * 4 * Math.sin(u + 0.6);
  p.hy = 2.5 + 0.6 * Math.sin(2 * u - 0.5);
  p.hx = 1;
  p.hrot = 4;
  for (const leg of LEGS) {
    const front = leg.startsWith('front');
    const v = u + (leg === 'frontNear' || leg === 'backFar' ? 0 : Math.PI);
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + Math.cos(v) * (front ? 3.5 : 4.5) - (front ? 0 : 2), y: root.y + 5 + Math.sin(v) * 1.8 };
  }
  p.tailA = 182 + 5 * Math.sin(u - 1.2);
  p.tailCurl = 6 * Math.sin(u - 2);
  p.ears = -0.2;
  p.splash = speed;
  return p;
}

/** Floating on its back, belly up, paws on its chest and hind feet out of the water. */
function onBack(b: ChibiBuild, clock: number): ChibiPose {
  const p = stand(b);
  p.wet = 1;
  p.sy = -1;
  const bob = 0.7 * noise1(clock / 1500, 2);
  p.by = WATER_Y - b.body.at.y + 1 + bob;
  p.rot = 1.5 * noise1(clock / 1900, 7);
  p.hx = 4;
  p.hy = 3 + bob * 0.3;
  p.hrot = 16;
  const top = bodyFrame(b, p).cy - b.body.ry;
  const shoulder = legRoot(b, p, 'frontNear');
  // Both front paws together on its chest, in front of it.
  p.pawUp = 2;
  p.paws.frontNear = { x: shoulder.x - 3, y: top - 2.5 };
  p.paws.frontFar = { x: shoulder.x - 6.5, y: top - 2 };
  const hip = legRoot(b, p, 'backNear');
  p.paws.backNear = { x: hip.x - 3, y: top - 1.5 };
  p.paws.backFar = { x: hip.x - 6, y: top - 0.5 };
  p.tailA = 178;
  p.tailCurl = 8;
  p.ears = -0.1;
  return p;
}

/** Treading water upright to look about: chest and head out, paws up. */
function tread(b: ChibiBuild, clock: number): ChibiPose {
  const p = stand(b);
  p.wet = 1;
  p.rot = 64;
  p.bx = 1;
  p.by = 4 + noise1(clock / 1300, 4) * 0.6;
  p.hx = 0.5;
  p.hy = -1;
  p.hrot = 2;
  const h = headCentre(b, p);
  const u = (clock / 800) * Math.PI * 2;
  p.paws.frontNear = { x: h.x + 2 + Math.cos(u) * 0.8, y: h.y + b.head.ry + 3 + Math.sin(u) * 0.8 };
  p.paws.frontFar = { x: h.x - 3 + Math.cos(u + Math.PI) * 0.8, y: h.y + b.head.ry + 3.5 + Math.sin(u + Math.PI) * 0.8 };
  for (const leg of ['backNear', 'backFar'] as const) {
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + 2 + Math.sin(u * 0.7 + (leg === 'backFar' ? 2 : 0)) * 2, y: root.y + 5 };
  }
  p.tailA = 250;
  p.tailCurl = 40;
  p.ears = 0.3;
  return p;
}

/** Where in a dive (or another trick) on a loop of the wall clock it is, 0..1, or -1 between them. */
function trick(clock: number, period: number, from: number, length: number): number {
  const k = (clock % period) - from;
  return k >= 0 && k < length ? k / length : -1;
}

/**
 * A dive as it swims along: nose down under the surface, its tail flipping up after it,
 * bubbles coming up while it's under, and up again nose first with a splash.
 */
function dive(b: ChibiBuild, phase: number, u: number): ChibiPose {
  const p = swim(b, phase, 0.6);
  p.rot = keyed(u, [[0, p.rot], [0.22, -50], [0.4, -8], [0.7, 6], [0.84, 34], [1, -2]]);
  p.lift = keyed(u, [[0, 0], [0.08, -2], [0.3, 22], [0.42, 36], [0.68, 36], [0.86, 4], [1, 0]]);
  p.tailA = keyed(u, [[0, 182], [0.2, 168], [0.32, 120], [0.44, 182]]);
  p.tailCurl = keyed(u, [[0, 0], [0.32, -30], [0.44, 0]]);
  p.hrot = keyed(u, [[0, 4], [0.2, -18], [0.75, 20], [1, 4]]);
  p.ears = keyed(u, [[0, -0.2], [0.15, -1], [0.86, -1], [0.92, 0.8], [1, -0.2]]);
  p.splash = 1.8 * bump(clamp01((u - 0.12) / 0.2)) + 1.6 * bump(clamp01((u - 0.78) / 0.18));
  p.bubbles = keyed(u, [[0.36, 0], [0.42, 1], [0.7, 1], [0.76, 0]]);
  return p;
}

/** Rolling right over as it swims, belly up and back, paws in the air halfway round. */
function rollOver(b: ChibiBuild, phase: number, u: number): ChibiPose {
  const p = swim(b, phase, 0.6);
  p.sy = Math.cos(2 * Math.PI * u);
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + (leg.startsWith('front') ? 1 : -2), y: root.y + 5 * p.sy };
  }
  p.splash = 1.2 * bump(u);
  p.eyes = 'happy';
  return p;
}

/** An arc right out of the water and back in, nose first. */
function porpoise(b: ChibiBuild, u: number, height: number): ChibiPose {
  const p = swim(b, 0, 0);
  const up = Math.sin(Math.PI * u);
  p.lift = -height * up;
  p.rot = lerp(32, -38, smooth(u));
  p.hrot = lerp(12, -12, u);
  for (const leg of LEGS) {
    const root = legRoot(b, p, leg);
    p.paws[leg] = { x: root.x + (leg.startsWith('front') ? -1.5 : -5), y: root.y - p.lift + 3 };
  }
  p.tailA = lerp(190, 168, u);
  p.tailCurl = lerp(-20, 30, u);
  p.ears = -0.6;
  p.splash = 2 * (bump(clamp01(u / 0.3)) + bump(clamp01((u - 0.7) / 0.3)));
  p.eyes = 'happy';
  return p;
}

/** A bonk with the nose: it lunges along the surface at the block and sends it skimming off. */
function nudge(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t } = input;
  const hit = PLAY.batHitMs;
  const p = swim(b, 0, 0);
  const lunge = keyed(t, [[0, 0], [150, -0.4], [hit, 1], [hit + 170, 0.6], [PLAY.batMs, 0]]);
  p.hx += 5 * lunge;
  p.hy += 1.5 * lunge;
  p.hrot -= 12 * lunge;
  p.rot -= 3 * lunge;
  p.splash = 1.6 * bump(clamp01((t - 150) / 280));
  p.ears = 0.6;
  p.lookX = 0.9;
  p.lookY = 0.5;
  p.eyes = t < hit + 170 ? 'wide' : eyesFrom(input);
  return p;
}

/** Ducks its head to take the block, rears up out of the water with it, and flicks it away. */
function otterToss(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock } = input;
  const { tossGrabMs: grab, tossReleaseMs: release, tossMs: end } = PLAY;
  const wind = release - 220;
  const up = keyed(t, [[grab + 40, 0], [wind, 1], [release + 120, 0.7], [end, 0]]);
  const p = mix(swim(b, 0, 0), tread(b, clock), up * 0.65);
  p.hx += keyed(t, [[0, 0], [grab, 3.5], [wind, -2], [release, 4], [end, 0]]);
  p.hy += keyed(t, [[0, 0], [grab, 1], [wind, -4], [release, -2], [end, 0]]);
  p.hrot = keyed(t, [[0, 4], [grab, -10], [grab + 60, -10], [wind, 28], [release, 6], [end, 4]]);
  p.ears = keyed(t, [[0, 0], [wind, -0.3], [release, 0.8], [end, 0]]);
  p.lookX = 0.7;
  p.lookY = keyed(t, [[0, 0.3], [grab, 0.8], [wind, -0.5], [release + 100, -0.8], [end, -0.3]]);
  p.mouth = 0.35 * keyed(t, [[release, 0], [release + 60, 1], [end, 0]]);
  p.splash = 1.2 * bump(clamp01((t - grab + 120) / 300)) + 0.8 * bump(clamp01((t - release) / 300));
  p.eyes = t > release + 40 && t < end - 120 ? 'happy' : eyesFrom(input);
  return p;
}

function otterPose(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock, phase } = input;
  switch (input.animation) {
    case 'idle': {
      // Treads water to look about, then lies back to float.
      const p = mix(tread(b, clock), onBack(b, clock), span(t, 4200, 5200));
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'walk': {
      // Now and then it dives, or rolls over.
      const under = trick(clock, 9000, 5000, 1800);
      if (under >= 0) return dive(b, phase, under);
      const over = trick(clock, 9000, 2600, 900);
      if (over >= 0) return rollOver(b, phase, over);
      const p = swim(b, phase, 0.6);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'run':
    case 'chase': {
      // Going fast, it porpoises out of the water every so often.
      const arc = trick(clock, 4200, 3000, 800);
      if (arc >= 0) return porpoise(b, arc, 12);
      const p = swim(b, phase, input.animation === 'chase' ? 1.6 : 1.2);
      p.rot = 6 * Math.sin(phase * Math.PI * 2);
      p.hy += 1.5;
      p.ears = -0.6;
      p.eyes = input.animation === 'chase' ? 'wide' : eyesFrom(input);
      return p;
    }
    case 'jump':
      return porpoise(b, clamp01(t / 400), 18);
    case 'leap':
      return porpoise(b, clamp01(t / 420), 14);
    case 'sit': {
      // On its back with its favourite shell, tapping it now and then.
      const p = onBack(b, clock);
      p.shell = 1;
      const tap = Math.max(0, Math.sin((t / 2600) * Math.PI * 2)) * Math.abs(Math.sin((t / 140) * Math.PI));
      p.paws.frontNear.y -= tap * 2;
      p.paws.frontFar.y -= tap * 1.5;
      look(b, p, input.gaze, 0.7);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'groom': {
      // Rubbing its face with both paws.
      const p = onBack(b, clock);
      const h = headCentre(b, p);
      const rub = Math.sin((t / 500) * Math.PI * 2);
      p.paws.frontNear = { x: h.x + 2 + rub * 1.5, y: h.y + 3 - Math.abs(rub) };
      p.paws.frontFar = { x: h.x - 3 - rub * 1.5, y: h.y + 3.5 - Math.abs(rub) };
      p.hrot += rub * 4;
      p.eyes = 'closed';
      p.blush = 0.9;
      return p;
    }
    case 'yawn': {
      const p = onBack(b, clock);
      const open = span(t, 200, 800) * (1 - span(t, 1500, 2000));
      p.mouth = open;
      p.tongue = open * 0.6;
      p.hrot += 10 * open;
      p.paws.backNear.y -= 2 * open;
      p.eyes = 'closed';
      return p;
    }
    case 'sleep': {
      const p = onBack(b, clock);
      p.paws.frontFar.x += 2;
      p.eyes = 'closed';
      p.blush = 0.7;
      p.mark = 'zzz';
      return p;
    }
    case 'happy': {
      // Wriggling on its back, clapping its paws.
      const p = onBack(b, clock);
      const clap = Math.abs(Math.sin((t / 600) * Math.PI * 2));
      p.paws.frontNear.x += clap * 2.5;
      p.paws.frontFar.x -= clap * 2.5;
      p.rot = 5 * Math.sin((t / 1200) * Math.PI * 2);
      p.mouth = 0.4;
      p.blush = 1;
      p.eyes = 'happy';
      p.mark = 'hearts';
      return p;
    }
    case 'surprised': {
      const p = tread(b, clock);
      const pop = easeOut(t / 200) * (1 - 0.4 * span(t, 250, 450));
      p.lift = -7 * pop;
      p.ears = 1;
      p.mouth = 0.45;
      p.eyes = 'wide';
      p.mark = 'alarm';
      p.splash = 1.5 * bump(clamp01(t / 300));
      return p;
    }
    case 'confused': {
      const p = tread(b, clock);
      const side = Math.sin((t / 1800) * Math.PI * 2) > 0 ? 1 : -1;
      p.hrot = 14 * side;
      p.lookY = -0.6;
      p.eyes = eyesFrom(input);
      p.mark = 'puzzled';
      return p;
    }
    case 'peek':
      return peek(b, input);
    case 'dangle': {
      const p = dangle(b, input);
      p.tailA = -90;
      return p;
    }
    case 'bat':
      return nudge(b, input);
    case 'toss':
    case 'lift':
    case 'throw':
      return otterToss(b, input);
    case 'carry':
    case 'fetch':
      return otterPose(b, { ...input, animation: 'walk' });
    case 'stalk': {
      // Gliding in slowly, low in the water, eyes just over the surface.
      const p = swim(b, phase, 0.3);
      p.by += 2;
      p.hy += 1.5;
      p.ears = -0.6;
      p.lookX = 1;
      p.eyes = 'wide';
      return p;
    }
    case 'sniff':
    case 'nudge': {
      // Nosing at it along the surface.
      const p = swim(b, input.animation === 'nudge' ? phase : 0, input.animation === 'nudge' ? 0.5 : 0);
      p.hx += 2.5;
      p.hy += 1.5;
      p.hrot -= 10 + (input.animation === 'sniff' ? 4 * Math.max(0, Math.sin(t / 85)) : 0);
      p.lookX = 0.9;
      p.lookY = 0.6;
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'climb':
    case 'rummage':
    case 'emerge': {
      // There's no trash can in a pond: it just treads water.
      const p = tread(b, clock);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'angry': {
      // Slapping the water, ears back.
      const p = tread(b, clock);
      const slap = Math.max(0, Math.sin((t / 400) * Math.PI * 2));
      const shoulder = legRoot(b, p, 'frontNear');
      p.paws.frontNear = { x: shoulder.x + 6, y: shoulder.y + 2 - 4 * slap };
      p.pawUp = 1;
      p.ears = -1;
      p.hrot = -6;
      p.mouth = 0.18;
      p.splash = 1.5 * slap;
      p.eyes = 'blink';
      p.mark = 'angry';
      return p;
    }
    case 'work':
    case 'browse':
    case 'reels': {
      // Treading water at its desk, paws up on the keyboard, or one on the mouse.
      const k = typing(clock);
      const r = reel(clock);
      const p = tread(b, clock);
      const mouse = input.animation !== 'work';
      const flick = input.animation === 'reels' ? r.flick : 0;
      p.paws.frontNear = mouse ? { x: b.mouse.x - flick * 1.5, y: b.mouse.y - flick * 1.8 } : { x: b.desk.x + 1.2, y: b.desk.y - k.near * 1.8 };
      p.paws.frontFar = { x: b.desk.x - 1.2, y: b.desk.y - (mouse ? 0 : k.far * 1.8) };
      p.pawUp = 2;
      p.hrot = lerp(-3, 8, k.pause);
      p.turn = 0.8;
      p.lookX = 0.8;
      p.lookY = -0.4;
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      if (input.animation === 'reels' && r.funny && r.into > 0.2 && r.into < 0.8) {
        p.eyes = 'happy';
        p.mouth = 0.4;
        p.blush = 1;
      }
      return p;
    }
    case 'attention': {
      // Bobbing up out of the water, waving both paws over its head.
      const p = tread(b, clock);
      const hop = Math.abs(Math.sin((t / 600) * Math.PI));
      p.by -= 2 * hop;
      const wave = Math.sin((t / 300) * Math.PI * 2);
      // Both paws held out in front, clear of its face, waving.
      const shoulder = legRoot(b, p, 'frontNear');
      p.paws.frontNear = { x: shoulder.x + 15, y: shoulder.y - 6 + wave * 3 };
      p.paws.frontFar = { x: shoulder.x + 12, y: shoulder.y - 3 - wave * 3 };
      p.pawUp = 2;
      p.mouth = 0.4;
      p.blush = 1;
      p.splash = 1;
      p.eyes = eyesFrom(input);
      return p;
    }
  }
}

/** The pose for this moment of an animation. */
export function chibiPose(b: ChibiBuild, input: ChibiInput): ChibiPose {
  return b.swims ? otterPose(b, input) : walkerPose(b, input);
}
