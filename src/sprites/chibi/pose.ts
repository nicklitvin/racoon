import { PLAY } from '../animations';
import { bump, clamp, clamp01, DEG, easeOut, keyed, lerp, noise1, smooth, span, wave } from '../critter/kit';
import type { AnimationName, EyeStyle } from '../types';
import { CHIBI_TOY, type ChibiBuild, type Pt } from './species';

export const LEGS = ['frontNear', 'frontFar', 'backNear', 'backFar'] as const;
export type LegName = (typeof LEGS)[number];

/** How the eyes are drawn: open, shut in a relaxed curve, happy ^ ^, wide, or mid-blink. */
export type ChibiEyes = 'open' | 'closed' | 'happy' | 'wide' | 'blink';
/** Little marks that float about him: sleep, alarm, puzzlement, love. */
export type ChibiMark = 'zzz' | 'alarm' | 'puzzled' | 'hearts' | null;

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
  /** How much of a pond there is round him (swimmers only). */
  wet: number;
  /** Rocking on the end of your grip, in degrees round the scruff. */
  swing: number;
  eyes: ChibiEyes;
  mark: ChibiMark;
  /** Splashes about him: 0 none, 1 a few drops, 2 a proper splash. */
  splash: number;
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
  'wet',
  'swing',
  'splash',
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
 * Where a toy block he has in his mouth is (its middle): hanging from his jaws, just under
 * the corner of his mouth.
 */
export function toyHoldPoint(b: ChibiBuild, p: ChibiPose): Pt {
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
    wet: 0,
    swing: 0,
    eyes: 'open',
    mark: null,
    splash: 0,
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

/** The pose for a land animal at this moment. */
function walkerPose(b: ChibiBuild, input: ChibiInput): ChibiPose {
  const { t, clock, phase } = input;
  switch (input.animation) {
    case 'idle': {
      const p = stand(b);
      alive(p, clock);
      // Now and then a curious tilt of the head.
      p.hrot += noise1(clock / 3100, 9) * 7;
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'walk': {
      const p = stand(b);
      walk(b, p, phase);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'run':
    case 'chase': {
      const p = stand(b);
      gallop(b, p, phase, input.animation === 'chase' ? 7.5 : 6.5);
      p.eyes = input.animation === 'chase' ? 'wide' : eyesFrom(input);
      p.mouth = input.animation === 'chase' ? 0.15 : 0;
      return p;
    }
    case 'jump': {
      const p = stand(b);
      spring(b, p, clamp01(t / 400), 17, 0.32);
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
      const p = sit(b);
      alive(p, clock, 0.8);
      p.hrot += noise1(clock / 3600, 4) * 6;
      look(b, p, input.gaze);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'groom': {
      const p = sit(b);
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
      const p = sit(b);
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
      const p = sit(b);
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
    case 'happy': {
      const p = stand(b);
      const hop = Math.abs(Math.sin((t / 600) * Math.PI * 2));
      p.lift = -2.6 * hop;
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
      const p = swim(b, phase, 0.6);
      p.eyes = eyesFrom(input);
      return p;
    }
    case 'run':
    case 'chase': {
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
      return otterToss(b, input);
  }
}

/** The pose for this moment of an animation. */
export function chibiPose(b: ChibiBuild, input: ChibiInput): ChibiPose {
  return b.swims ? otterPose(b, input) : walkerPose(b, input);
}
