import type { ChibiMark } from '../chibi/pose';
import { hatItem, NECK_WIDTH, outfitItem, UNDRESSED, type Dress, type Paint, type Wearable } from '../outfits';
import { drawMarks, PAINT_SLOT, PIXEL } from '../pixel/draw';
import { isFrontPiece } from '../pixel/facing';
import { C } from '../pixel/palette';
import { capsule, ellipse, polygon, Raster, tube, type Box, type Pt } from '../pixel/raster';
import type { AnimationName, EyeStyle } from '../types';

/**
 * The goose: a white goose seen side on, with a long neck, an orange beak and feet, and
 * wings it throws out wide when it means business. Drawn in the same pixels as the pixel
 * pets, in the same box, its feet where theirs are.
 */

const { feetX: FX, feetY: FY } = PIXEL;

export type GooseEyes = 'open' | 'closed' | 'wide' | 'cross' | 'happy';

/** Everything about how the goose stands, for one picture. Points are from the ground under it, facing right, px (up is negative). */
export interface GoosePose {
  /** How high its body is off the ground: hopping, flapping. */
  lift: number;
  /** Down on the ground, legs folded under it. */
  sitting: boolean;
  /** Lean of its body, radians: plus tips the front down. */
  tilt: number;
  /** Its head's middle. */
  head: Pt;
  /** How far the middle of its neck bows back (an S) or, less than 0, forward. */
  bow: number;
  /** Which way its beak points, radians from straight ahead: plus is down. */
  nod: number;
  /** How wide its beak is open, 0 to 1. */
  beak: number;
  /** Wings: 0 folded on its back, 1 thrown up and out; `flap` beats them up and down. */
  wing: number;
  flap: number;
  /** Its feet on (or off) the ground: near, far. */
  feet: [Pt, Pt];
  /** Head tucked in on its back, asleep. */
  tucked: boolean;
  eyes: GooseEyes;
  mark: ChibiMark;
  /** Going fast: speed lines behind it. */
  dash: number;
}

/** Its beak's tip from its head's middle, for a beak pointing `nod` down. */
export function beakTip(nod: number): Pt {
  return rot({ x: 7.6, y: 0.2 }, nod);
}

/** Where its beak pecks at the keys, from the ground under it facing right: the desk is built to fit. */
export const KEYBOARD: Pt = { x: 21, y: -13 };
/** Its beak's angle pecking at the keys. */
const KEYS_NOD = 0.85;
/** Its body's middle when standing, and sitting. */
const BODY_Y = -13;
const SIT_Y = -8;
/** Standing tall: where its head is. */
const UP: Pt = { x: 10, y: -31 };

const rot = (p: Pt, a: number): Pt => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** 0 to 1 and back, `t` of the way through. */
const hump = (t: number) => Math.sin(Math.PI * clamp01(t));

/** The middle of its body, from the ground under it. */
export function bodyCentre(p: GoosePose): Pt {
  return { x: -1, y: (p.sitting ? SIT_Y : BODY_Y) - p.lift };
}

/** Where its head has to be for its beak to touch `at`, pointing `nod` down. */
function headFor(at: Pt, nod: number): Pt {
  const tip = beakTip(nod);
  return { x: at.x - tip.x, y: at.y - tip.y };
}

/**
 * How the goose looks doing `animation`, `t` ms in, at `clock`: a goose's version of each
 * thing the pets do. Facing right; the drawing turns it round.
 */
export function goosePose(animation: AnimationName, t: number, clock: number, eyes: EyeStyle | 'blink', speed: number, keystrokes: number): GoosePose {
  const p: GoosePose = {
    lift: 0,
    sitting: false,
    tilt: 0,
    head: { ...UP },
    bow: 1.6,
    nod: 0,
    beak: 0,
    wing: 0,
    flap: 0,
    feet: [{ x: 2.5, y: 0 }, { x: -1.5, y: 0 }],
    tucked: false,
    eyes: eyes === 'closed' || eyes === 'blink' ? 'closed' : eyes === 'wide' ? 'wide' : 'open',
    mark: null,
    dash: 0,
  };
  /** A honk: its beak flung open and shut, `every` ms. */
  const honking = (every: number) => {
    const u = (clock % every) / every;
    return u < 0.45 ? hump(u / 0.45) : 0;
  };
  /** A waddle: its feet stepping, body rocking, head bobbing with each step. */
  const waddle = (cycle: number, stride: number) => {
    const a = (clock / cycle) * Math.PI * 2;
    const s = Math.sin(a);
    p.feet = [
      { x: 1 + s * stride, y: -Math.max(0, Math.cos(a)) * 1.6 },
      { x: -1 - s * stride, y: -Math.max(0, -Math.cos(a)) * 1.6 },
    ];
    p.tilt += Math.sin(a * 2) * 0.05;
    p.lift += Math.abs(s) * 0.7;
    p.head = { x: p.head.x + Math.sin(a * 2) * 0.9, y: p.head.y + Math.abs(Math.cos(a)) * 0.8 };
  };

  switch (animation) {
    case 'idle': {
      // Standing about, looking round; every so often it has a graze.
      const graze = clock % 9000 > 6000 && clock % 9000 < 7600;
      if (graze) {
        p.head = headFor({ x: 15, y: -1 }, 0.9);
        p.nod = 0.9;
        p.tilt = 0.12;
        p.beak = Math.sin(clock / 70) > 0.3 ? 0.3 : 0;
      } else {
        p.head = { x: UP.x + Math.sin(clock / 2300) * 1.2, y: UP.y + Math.sin(clock / 900) * 0.4 };
        p.nod = Math.sin(clock / 3100) * 0.12;
      }
      break;
    }
    case 'walk':
      p.head = { x: 12, y: -29 };
      p.tilt = 0.04;
      waddle(560, 2.4);
      break;
    case 'nudge':
      // Head down, pushing it along with its beak.
      p.head = headFor({ x: 17, y: -3 }, 0.6);
      p.nod = 0.6;
      p.tilt = 0.15;
      p.bow = -0.5;
      waddle(560, 2.2);
      break;
    case 'stalk':
      // Creeping up, neck low and out in front, wings half open.
      p.head = { x: 17, y: -14 };
      p.bow = -0.8;
      p.tilt = 0.14;
      p.wing = 0.25;
      waddle(820, 1.6);
      p.eyes = 'cross';
      break;
    case 'run':
    case 'fetch':
      p.head = animation === 'fetch' ? { x: 13, y: -28 } : { x: 16, y: -24 };
      p.bow = animation === 'fetch' ? 0.8 : 0;
      p.tilt = 0.12;
      p.wing = 0.35;
      p.flap = Math.sin(clock / 110) * 0.3;
      waddle(330, 3.4);
      p.dash = clamp01((speed - 150) / 250);
      break;
    case 'chase':
      // The goose's charge: neck straight out, beak open, wings thrown wide, honking.
      p.head = { x: 19, y: -17 };
      p.bow = -1;
      p.nod = 0.1;
      p.tilt = 0.22;
      p.wing = 0.95;
      p.flap = Math.sin(clock / 85) * 0.45;
      p.beak = Math.max(0.35, honking(520));
      p.eyes = 'cross';
      waddle(300, 3.6);
      p.dash = clamp01((speed - 150) / 250);
      break;
    case 'jump':
    case 'leap': {
      // Up with a flap or two, feet tucked back.
      const k = hump(t / (animation === 'jump' ? 400 : 420));
      p.lift = k * 9;
      p.head = { x: 15, y: -27 };
      p.bow = 0.2;
      p.tilt = 0.1;
      p.wing = 1;
      p.flap = Math.sin(clock / 60) * 0.7;
      p.beak = 0.5;
      p.feet = [{ x: -3, y: -1.5 }, { x: -5, y: -1 }];
      break;
    }
    case 'sit':
      p.sitting = true;
      p.head = { x: 9, y: -27 + Math.sin(clock / 1100) * 0.4 };
      p.nod = Math.sin(clock / 2900) * 0.1;
      break;
    case 'groom': {
      // Preening: head turned round to its back, nibbling at its feathers.
      p.sitting = true;
      const k = Math.sin((t / 1000) * Math.PI * 4);
      p.head = { x: 1 + k * 0.8, y: -21 };
      p.bow = 2.6;
      p.nod = Math.PI - 0.7;
      p.beak = k > 0.2 ? 0.4 : 0;
      p.wing = 0.12;
      p.eyes = 'closed';
      break;
    }
    case 'yawn': {
      const k = hump(t / 2200);
      p.head = { x: 10, y: -31 - k * 2 };
      p.nod = -k * 0.5;
      p.beak = k > 0.25 ? k : 0;
      p.wing = k * 0.45;
      p.eyes = 'closed';
      break;
    }
    case 'peek':
      // Head up over the bottom of the screen, eyes darting with your typing.
      p.sitting = true;
      p.head = { x: 10 + (keystrokes % 2 ? 1 : -1), y: -33 };
      p.nod = keystrokes % 2 ? 0.15 : -0.1;
      break;
    case 'sleep': {
      // Sat down, head tucked in on its back.
      const breath = Math.sin((t / 3200) * Math.PI * 2);
      p.sitting = true;
      p.tucked = true;
      p.lift = -breath * 0.4;
      p.head = { x: -3, y: -17 };
      p.nod = Math.PI - 0.5;
      p.eyes = 'closed';
      p.mark = 'zzz';
      break;
    }
    case 'surprised': {
      const k = hump(t / 450);
      p.head = { x: 9, y: -33 };
      p.nod = -0.2;
      p.wing = k * 0.8;
      p.flap = k * 0.3;
      p.beak = 0.6;
      p.lift = k * 2;
      p.eyes = 'wide';
      p.mark = 'alarm';
      break;
    }
    case 'confused':
      p.head = { x: 9, y: -32 };
      p.nod = -0.35 + Math.sin(t / 300) * 0.05;
      p.mark = 'puzzled';
      break;
    case 'dangle': {
      // Picked up: flapping like mad, feet paddling, honking its head off.
      const k = Math.sin(clock / 70);
      p.head = { x: 12, y: -30 };
      p.bow = 0.6;
      p.wing = 1;
      p.flap = k * 0.8;
      p.beak = Math.max(0.2, honking(420));
      p.eyes = 'wide';
      p.feet = [{ x: 1 + Math.sin(clock / 90) * 1.5, y: -1 }, { x: -2 - Math.sin(clock / 90) * 1.5, y: -0.5 }];
      break;
    }
    case 'happy': {
      // A pleased little ruffle of the feathers.
      const k = Math.abs(Math.sin((t / 1200) * Math.PI * 2));
      p.head = { x: 10, y: -32 + k };
      p.wing = 0.2 + k * 0.15;
      p.flap = Math.sin(clock / 120) * 0.2;
      p.eyes = 'happy';
      p.mark = 'hearts';
      break;
    }
    case 'bat': {
      // A peck at the block: neck shot out and down, then back.
      const k = t < 230 ? ease(t / 230) : 1 - ease((t - 230) / 420);
      p.nod = 0.8 * k;
      p.head = mix(UP, headFor({ x: 21, y: -4 }, 0.8), k);
      p.bow = 1.6 - k * 2.2;
      p.tilt = 0.18 * k;
      p.wing = 0.4 * k;
      p.beak = k > 0.8 ? 0.5 : 0;
      p.eyes = 'wide';
      break;
    }
    case 'toss':
    case 'lift':
    case 'throw': {
      // Down for the block in its beak, then a fling of the head up and away.
      const len = animation === 'toss' ? 1250 : animation === 'lift' ? 1000 : 950;
      const grab = animation === 'throw' ? 0 : 380 / len;
      const u = t / len;
      const down = u < grab ? ease(u / grab) : animation === 'lift' ? 0.6 : 1 - ease(clamp01((u - grab) / ((1 - grab) * 0.55)));
      p.nod = 0.85 * down - 0.4 * (1 - down) * (u > grab ? 1 : 0);
      p.head = mix({ x: 9, y: -34 }, headFor({ x: 17, y: -2 }, 0.85), down);
      p.bow = 1.6 - down * 2;
      p.tilt = 0.15 * down;
      p.wing = u > grab ? 0.5 * hump((u - grab) / (1 - grab)) : 0;
      p.beak = u < grab * 0.8 ? 0.6 : 0.15;
      break;
    }
    case 'carry':
      p.head = { x: 13, y: -28 };
      p.bow = 0.8;
      p.wing = 0.25;
      waddle(480, 2.4);
      break;
    case 'sniff':
      // Head down, having a nibble at it.
      p.head = headFor({ x: 18, y: -3 }, 0.9);
      p.nod = 0.9;
      p.bow = -0.4;
      p.tilt = 0.15;
      p.beak = Math.sin(t / 60) > 0.2 ? 0.35 : 0;
      break;
    case 'work':
    case 'browse':
    case 'reels': {
      p.tilt = 0.1;
      if (animation === 'reels') {
        // Head up watching, honking with laughter now and then.
        p.head = { x: 12, y: -30 };
        p.nod = -0.1;
        p.beak = Math.sin(clock / 900) > 0.5 ? honking(260) * 0.7 : 0;
        p.wing = Math.sin(clock / 900) > 0.5 ? 0.25 : 0;
        p.flap = Math.sin(clock / 80) * 0.2;
        break;
      }
      // Pecking away at the keys (or clicking the mouse with its beak).
      const at = animation === 'work' ? KEYBOARD : { x: KEYBOARD.x + 7, y: KEYBOARD.y };
      const peck = animation === 'work' ? Math.max(0, Math.sin(clock / 65)) * 2.2 : Math.sin(clock / 400) > 0.7 ? 1.2 : 0;
      p.nod = KEYS_NOD;
      p.head = add(headFor(at, KEYS_NOD), { x: -peck * 0.3, y: -peck });
      p.bow = 0.2;
      break;
    }
    case 'attention': {
      // A big honk: neck up and out, beak wide, wings flapping.
      p.head = { x: 12, y: -32.5 };
      p.nod = -0.3;
      p.bow = 0.6;
      p.beak = honking(600);
      p.wing = 0.75;
      p.flap = Math.sin(clock / 110) * 0.4;
      p.lift = honking(600) * 1.2;
      break;
    }
    case 'angry': {
      // A hiss: neck low and straight out, beak open, wings up, stamping.
      const stamp = Math.sin((t / 800) * Math.PI * 2);
      p.head = { x: 18, y: -16 + Math.sin(t / 45) * 0.4 };
      p.bow = -1;
      p.nod = 0.15;
      p.beak = 0.9;
      p.wing = 0.9;
      p.flap = Math.sin(t / 50) * 0.08;
      p.tilt = 0.2;
      p.feet = [{ x: 2.5, y: -Math.max(0, stamp) * 2 }, { x: -1.5, y: -Math.max(0, -stamp) * 2 }];
      p.eyes = 'cross';
      p.mark = 'angry';
      break;
    }
  }
  return p;
}

function mix(a: Pt, b: Pt, k: number): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** One of its wings, thrown up and out from its shoulder: a long feathered kite, `squash` as wide (turned three-quarters). */
function spreadWing(shoulder: Pt, angle: number, length: number, dir: number, squash = 1): Pt[] {
  const along = { x: Math.cos(angle) * dir, y: -Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  const at = (u: number, v: number): Pt => ({ x: shoulder.x + (along.x * u + across.x * v) * squash, y: shoulder.y + along.y * u + across.y * v });
  return [at(0, -2.6), at(length * 0.4, -4.6 * dir), at(length, -1 * dir), at(length * 0.9, 1.6 * dir), at(length * 0.55, 3.6 * dir), at(0, 3)];
}

/** Turned three-quarters towards you or away (going diagonally), everything across it is this much shorter. */
export const GOOSE_QUARTER = 0.64;

/** What `drawGoose` and `drawGooseFacing` give back: the box round it (for grabbing it), its back (where you hold it up by) and its beak's tip (where it holds a block). */
export interface GooseDrawn {
  box: Box | null;
  back: Pt;
  tip: Pt;
}

/**
 * Draws the goose into `r` (cleared first), its feet at the feet point, facing `dir` (1
 * right, -1 left). `squash` below 1 turns it three-quarters (going diagonally): its body
 * end on to you, so shorter across.
 */
export function drawGoose(r: Raster, p: GoosePose, dir: number, clock: number, dress: Dress = UNDRESSED, squash = 1): GooseDrawn {
  r.clear();
  const P = (q: Pt): Pt => ({ x: FX + q.x * dir * squash, y: FY + q.y });
  const local = (q: Pt) => rot(q, p.tilt * dir);
  const b = bodyCentre(p);
  const B = P(b);
  const onBody = (q: Pt): Pt => {
    const l = local({ x: q.x * dir, y: q.y });
    return add(B, { x: l.x * squash, y: l.y });
  };

  // Its shadow on the ground, smaller the higher it hops.
  const shadow = ellipse(FX - dir, FY - 0.5, (11 * squash + 2 * (1 - squash)) * (1 - Math.min(0.4, p.lift / 25)), 1.6);
  r.shape(shadow.sd, shadow.box, C.shadow, null);

  // Speed lines behind it.
  if (p.dash > 0.2) {
    for (const [dy, len] of [[-4, 5], [0, 7], [4, 4]] as const) {
      const x0 = Math.round(B.x - dir * 15 * squash);
      for (let i = 0; i < Math.round(len * p.dash); i++) r.set(x0 - dir * i, Math.round(B.y + dy), C.light);
    }
  }

  const spread = p.wing > 0.15;
  const wingAngle = Math.PI * (0.98 - 0.36 * p.wing) + p.flap;
  const shoulder = onBody({ x: 4, y: -3 });
  // The far wing, up behind it.
  if (spread) {
    const far = polygon(spreadWing(add(shoulder, { x: dir * 1.5 * squash, y: -1 }), wingAngle - 0.2, 13 + p.wing * 2, dir, squash));
    r.shape(far.sd, far.box, C.far, C.outline);
  }

  // Legs and feet, unless it's sat on them.
  if (!p.sitting) {
    const leg = (foot: Pt, hipX: number, colour: number) => {
      const hip = onBody({ x: hipX, y: 5 });
      // Hopping, its feet go up with it.
      const f = P({ x: foot.x, y: foot.y - p.lift * 0.85 });
      const shin = capsule(hip, { x: f.x, y: f.y - 1 }, 0.7);
      r.shape(shin.sd, shin.box, colour, C.outline);
      const web = polygon([{ x: f.x - dir * 1.5, y: f.y }, { x: f.x + dir * 3.5, y: f.y }, { x: f.x + dir * 2.5, y: f.y - 1.6 }, { x: f.x - dir * 0.5, y: f.y - 1.6 }]);
      r.shape(web.sd, web.box, colour, C.outline);
    };
    leg(p.feet[1], -1.5, C.dark);
    leg(p.feet[0], 1.5, C.band);
  }

  // Its body: a plump oval, a tail flicked up at the back.
  const tail = polygon([onBody({ x: -8, y: -3.5 }), onBody({ x: -15, y: -6.5 }), onBody({ x: -13.5, y: -2.5 }), onBody({ x: -8, y: 2 })]);
  r.shape(tail.sd, tail.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  const body = ellipse(B.x, B.y, Math.max(7, 11 * squash), p.sitting ? 7.5 : 7, p.tilt * dir * squash);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });

  // The neck, from the front of its body up to its head, curved like an S; or, asleep, the head on its back.
  const neckBase = onBody({ x: 7.5, y: -3 });
  const H = P(p.head);
  if (!p.tucked) {
    const mid = { x: (neckBase.x + H.x) / 2, y: (neckBase.y + H.y) / 2 };
    const dx = H.x - neckBase.x;
    const dy = H.y - neckBase.y;
    const d = Math.hypot(dx, dy) || 1;
    // Bowed back, away from the way it faces (across the line from its body to its head).
    const bend = { x: mid.x + (-dy / d) * -dir * p.bow, y: mid.y + (dx / d) * -dir * p.bow };
    const neck = tube([neckBase, bend, H], [3.4, 2.4, 2.3]);
    r.shape(neck.sd, neck.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
    // Filled again over its body's outline, so it grows out of its body without a line across.
    const join = tube([neckBase, bend], [3.4, 2.4]);
    r.shape(join.sd, join.box, C.fur, null);
  }

  // The near wing: folded on its back, or thrown wide.
  if (spread) {
    const pts = spreadWing(shoulder, wingAngle, 14 + p.wing * 2, dir, squash);
    const near = polygon(pts);
    r.shape(near.sd, near.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
    // Grey flight feathers along its trailing edge.
    const tip = pts[2]!;
    const back = pts[3]!;
    const tail2 = pts[4]!;
    for (const [a, c] of [[tip, back], [back, tail2]] as const) {
      for (let i = 0; i <= 4; i++) {
        const q = { x: a.x + (c.x - a.x) * (i / 4), y: a.y + (c.y - a.y) * (i / 4) };
        const qx = Math.round(q.x - dir * 0.5);
        const qy = Math.round(q.y - 0.5);
        if (r.get(qx, qy) === C.fur || r.get(qx, qy) === C.furDark) r.set(qx, qy, C.furDark);
      }
    }
  } else {
    const at = onBody({ x: -2.5, y: -0.6 });
    const folded = ellipse(at.x, at.y, Math.max(4.5, 7.5 * squash), 3.4, (p.tilt * dir - 0.1 * dir) * squash);
    r.shape(folded.sd, folded.box, C.fur, C.furDark, undefined, (_x, y) => y > at.y - 1.5);
    // The tips of its folded feathers, down by its tail.
    const tipAt = onBody({ x: -9.5, y: 0 });
    r.dots([tipAt, { x: tipAt.x - dir, y: tipAt.y + 1 }, { x: tipAt.x + dir, y: tipAt.y }], C.far);
  }

  // Head, beak and eye.
  const head = ellipse(H.x, H.y, 4.4, 3.8);
  r.shape(head.sd, head.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  drawBeak(r, H, p.nod, p.beak, dir, squash);
  drawEye(r, H, p, dir, clock);

  // Round its neck, and on its head.
  if (!p.tucked) wear(r, outfitItem(dress.outfit), add(neckBase, { x: dir * 0.5, y: -1 }), 7 * NECK_WIDTH, dir, PAINT_SLOT.wear);
  const crown = add(H, { x: -dir * 0.6, y: -3.2 });
  if (!p.tucked) wear(r, hatItem(dress.hat), crown, 6, dir, PAINT_SLOT.hat);

  const box = r.bounds((col) => col === C.shadow);
  const top = p.tucked ? add(B, { x: 0, y: -8 }) : add(H, { x: 0, y: -4 });
  drawMarks(r, p.mark, { x: top.x, y: top.y - 3 }, dir, clock);
  const tipPt = add(H, { x: beakOut(beakTip(p.nod).x, squash) * dir, y: beakTip(p.nod).y });
  return { box, back: onBody({ x: -1, y: -7 }), tip: tipPt };
}

/**
 * How far out from its head's middle a point `x` along its beak shows, turned three-quarters
 * (`squash`): shorter, from where it meets its head (which is round, the same any way on).
 */
function beakOut(x: number, squash: number): number {
  return x > 2.4 ? 2.4 + (x - 2.4) * (0.35 + 0.65 * squash) : x;
}

/** Its orange beak, pointing `nod` down from straight ahead, `open` 0 to 1 (`squash` as long, pointing partly at you or away). */
function drawBeak(r: Raster, H: Pt, nod: number, open: number, dir: number, squash = 1): void {
  const o = open * 1.6;
  const at = (x: number, y: number): Pt => {
    const q = rot({ x, y }, nod);
    return { x: H.x + beakOut(q.x, squash) * dir, y: H.y + q.y };
  };
  if (o > 0.3) {
    const mouth = polygon([at(2.6, -0.2), at(6.6, -0.6 - o), at(6, 1.6 + o), at(2.6, 0.8)]);
    r.shape(mouth.sd, mouth.box, C.mouth, null);
  }
  const upper = polygon([at(2.4, -1.9), at(5, -1.6 - o * 0.4), at(7.8, -0.6 - o), at(7.6, 0.1 - o), at(2.4, 0.3)]);
  r.shape(upper.sd, upper.box, C.band, C.outline);
  const lower = polygon([at(2.4, 0.5), at(6.8, 0.9 + o), at(6.4, 1.8 + o), at(2.4, 2)]);
  r.shape(lower.sd, lower.box, C.dark, C.outline);
  // A black knob where it meets the head.
  const knob = at(2.4, -0.6);
  r.set(Math.floor(knob.x), Math.floor(knob.y), C.outline);
}

function drawEye(r: Raster, H: Pt, p: GoosePose, dir: number, clock: number): void {
  const e = rot({ x: 1.2, y: -1.2 }, Math.max(-0.4, Math.min(0.5, p.nod * 0.5)));
  const ex = Math.floor(H.x + e.x * dir);
  const ey = Math.floor(H.y + e.y);
  const blinking = p.eyes === 'open' && clock % 5200 < 140;
  switch (blinking ? 'closed' : p.eyes) {
    case 'open':
      r.dots([{ x: ex, y: ey }, { x: ex, y: ey + 1 }], C.eye);
      break;
    case 'wide':
      r.dots([{ x: ex, y: ey }, { x: ex + dir, y: ey }, { x: ex, y: ey + 1 }, { x: ex + dir, y: ey + 1 }], C.eye);
      r.set(ex + dir, ey, C.glint);
      break;
    case 'closed':
      r.dots([{ x: ex - 1, y: ey + 1 }, { x: ex, y: ey + 1 }, { x: ex + 1, y: ey + 1 }], C.eye);
      break;
    case 'happy':
      r.dots([{ x: ex - 1, y: ey + 1 }, { x: ex, y: ey }, { x: ex + 1, y: ey + 1 }], C.eye);
      break;
    case 'cross':
      // A mean little eye under a brow slanting down to its beak.
      r.dots([{ x: ex, y: ey }, { x: ex, y: ey + 1 }], C.eye);
      r.dots([{ x: ex - dir, y: ey - 2 }, { x: ex, y: ey - 1 }, { x: ex + dir, y: ey - 1 }], C.outline);
      break;
  }
}

/** Something it's wearing, `size` px to a hat unit, its origin at `origin`, turned to face `dir`. */
function wear(r: Raster, item: Wearable | null, origin: Pt, size: number, dir: number, slots: Record<Paint, number>): void {
  if (!item) return;
  const at = (x: number, y: number): Pt => ({ x: origin.x + x * size * dir, y: origin.y + y * size });
  for (const s of item.shapes) {
    const shape =
      s.kind === 'poly'
        ? polygon(s.points.map(([x, y]) => at(x, y)))
        : (() => {
            const c = at(s.cx, s.cy);
            return ellipse(c.x, c.y, Math.max(0.6, s.rx * size), Math.max(0.6, s.ry * size));
          })();
    r.shape(shape.sd, shape.box, slots[s.paint], C.outline);
  }
}

/** Seen end on, how much lower a point in front of it shows (nearer you, down the screen), per px. */
const DEPTH = 0.15;

/**
 * The goose coming straight at you (`front`, down the screen) or going away (up it), the way
 * sprites in old games have a picture for each way they can face: from the front, its round
 * white chest, its neck up the middle, its beak pointing at you and its eyes either side;
 * from behind, its folded wings and its tail, and the back of its head. The same pose as
 * side on: its head, as far forward, shows lower from the front (nearer you) and higher from
 * behind. `side` is the way it last faced side on (its hat and its tie lean that way).
 */
export function drawGooseFacing(r: Raster, p: GoosePose, view: 'front' | 'back', side: number, clock: number, dress: Dress = UNDRESSED): GooseDrawn {
  r.clear();
  const front = view === 'front';
  // Waddling, its body rocks over the foot that's down.
  const lifted = (k: 0 | 1) => (p.sitting ? 0 : Math.min(0, p.feet[k].y));
  const sway = (lifted(1) - lifted(0)) * 0.55;
  const B = { x: FX + sway, y: FY + bodyCentre(p).y };
  // (On the middle of a pixel, so its face comes out the same both sides.)
  const H = { x: Math.floor(FX + sway * 0.6) + 0.5, y: FY + p.head.y + (front ? 1 : -1) * DEPTH * p.head.x };

  const shadow = ellipse(FX, FY - 0.5, 9 * (1 - Math.min(0.4, p.lift / 25)), 1.6);
  r.shape(shadow.sd, shadow.box, C.shadow, null);

  // Its wings thrown out to either side: from the front they come up behind it, from
  // behind up off its back, nearer you than its body.
  const spread = p.wing > 0.15;
  const wingAngle = Math.PI * (0.98 - 0.36 * p.wing) + p.flap;
  const wings = () => {
    for (const s of [-1, 1]) {
      // (Thrown back side on is out to its side end on.)
      const pts = spreadWing({ x: B.x + s * 4.5, y: B.y - 3 }, wingAngle, 12 + p.wing * 2, -s, 0.9);
      const wing = polygon(pts);
      r.shape(wing.sd, wing.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
      // Grey feathers at its tip.
      const tip = pts[2]!;
      r.dots([{ x: tip.x - s, y: tip.y }, { x: tip.x - s * 2, y: tip.y + 1 }], C.furDark);
    }
  };
  if (spread && front) wings();

  // Its legs under it, each foot stepping up in turn.
  if (!p.sitting) {
    for (const k of [0, 1] as const) {
      const s = k === 0 ? side : -side;
      const x = FX + s * 3;
      const fy = FY + lifted(k) - p.lift * 0.85;
      const shin = capsule({ x: B.x + s * 3, y: B.y + 4 }, { x, y: fy - 1 }, 0.7);
      r.shape(shin.sd, shin.box, C.band, C.outline);
      // Webbed, pointing at you (wide), or away (only their backs show).
      const w = front ? 2.4 : 1.6;
      const web = polygon([{ x: x - w, y: fy }, { x: x + w, y: fy }, { x: x + w * 0.5, y: fy - 1.6 }, { x: x - w * 0.5, y: fy - 1.6 }]);
      r.shape(web.sd, web.box, front ? C.band : C.dark, C.outline);
    }
  }

  // Its neck comes up from behind its chest, or the top of its back; its head is in front
  // of its body from the front, and behind it (out of sight, if it's down low) from behind.
  const neckBase = { x: B.x, y: B.y + (front ? -3 : -4) };
  const neckMid = { x: (neckBase.x + H.x) / 2, y: (neckBase.y + H.y) / 2 };
  const neck = () => {
    const tubed = tube([neckBase, neckMid, H], [3.2, 2.4, 2.3]);
    r.shape(tubed.sd, tubed.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  };
  const head = () => {
    const skull = ellipse(H.x, H.y, 4.3, 4);
    r.shape(skull.sd, skull.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
    if (front) face();
  };
  if (!p.tucked) neck();
  if (!front && !p.tucked) head();

  // Its body, round, end on.
  const body = ellipse(B.x, B.y, 8, p.sitting ? 7.5 : 7.2, sway * 0.05);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });

  if (front) {
    if (!p.tucked) head();
  } else {
    // Its folded wings down its back, meeting over its tail, and its tail sticking up between them.
    if (!spread) {
      for (let i = 0; i < 5; i++) {
        const y = Math.round(B.y - 3 + i * 1.5);
        const x = Math.round(B.x + 0.5 - (4 - i) * 0.9);
        r.dots([{ x, y }, { x: Math.round(2 * B.x - x), y }], C.furDark);
      }
    }
    const tail = polygon([{ x: B.x - 2.2, y: B.y + 4 }, { x: B.x, y: B.y + 1 }, { x: B.x + 2.2, y: B.y + 4 }, { x: B.x, y: B.y + 5.5 }]);
    r.shape(tail.sd, tail.box, C.furLight, C.furDark);
    if (spread) wings();
  }
  // Asleep, its head tucked in on its back.
  if (p.tucked) {
    const tucked = ellipse(B.x + side * 2, B.y - 5, 3.6, 3.2);
    r.shape(tucked.sd, tucked.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  }

  // Round its neck, and on its head.
  if (!p.tucked) {
    const collar = { x: neckBase.x + (H.x - neckBase.x) * 0.25, y: neckBase.y + (H.y - neckBase.y) * 0.25 - 1 };
    wearEndOn(r, outfitItem(dress.outfit), collar, 7 * NECK_WIDTH, side, front, PAINT_SLOT.wear, true);
    wearEndOn(r, hatItem(dress.hat), { x: H.x, y: H.y - 3.9 }, 6, side, front, PAINT_SLOT.hat, false);
  }

  const box = r.bounds((col) => col === C.shadow);
  const top = p.tucked ? { x: B.x, y: B.y - 8 } : { x: H.x, y: H.y - 4 };
  drawMarks(r, p.mark, { x: top.x, y: top.y - 3 }, side, clock);
  return { box, back: { x: B.x, y: B.y - 7 }, tip: { x: H.x, y: H.y + 1 + (front ? beakLength(p) : 0) } };

  /** From the front: its eyes either side, and its beak down the middle, pointing at you. */
  function face(): void {
    const len = beakLength(p);
    const o = p.beak * 1.8;
    const top = H.y + 0.2;
    if (o > 0.3) {
      const mouth = polygon([{ x: H.x - 1.3, y: top + 1 }, { x: H.x + 1.3, y: top + 1 }, { x: H.x + 1, y: top + len + o }, { x: H.x - 1, y: top + len + o }]);
      r.shape(mouth.sd, mouth.box, C.mouth, null);
      const lower = polygon([{ x: H.x - 1.1, y: top + len + o - 1 }, { x: H.x + 1.1, y: top + len + o - 1 }, { x: H.x + 0.8, y: top + len + o + 0.8 }, { x: H.x - 0.8, y: top + len + o + 0.8 }]);
      r.shape(lower.sd, lower.box, C.dark, C.outline);
    }
    // (Outlined only round its tip: orange on white shows well enough.)
    const upper = polygon([{ x: H.x - 1.4, y: top }, { x: H.x + 1.4, y: top }, { x: H.x + 1, y: top + len }, { x: H.x - 1, y: top + len }]);
    r.shape(upper.sd, upper.box, C.band, C.outline, undefined, (_x, y) => y > top + len - 0.2);
    const blinking = p.eyes === 'open' && clock % 5200 < 140;
    for (const s of [-1, 1]) {
      // Either side of the top of its beak (under a hat's brim).
      const ex = Math.floor(H.x) + s * 3;
      const ey = Math.floor(H.y - 1.2);
      switch (blinking ? 'closed' : p.eyes) {
        case 'open':
          r.dots([{ x: ex, y: ey }, { x: ex, y: ey + 1 }], C.eye);
          break;
        case 'wide':
          r.dots([{ x: ex, y: ey - 1 }, { x: ex, y: ey }, { x: ex, y: ey + 1 }], C.eye);
          r.set(ex, ey - 1, C.glint);
          break;
        case 'closed':
          r.dots([{ x: ex - s, y: ey + 1 }, { x: ex, y: ey + 1 }], C.eye);
          break;
        case 'happy':
          r.dots([{ x: ex - s, y: ey + 1 }, { x: ex, y: ey }], C.eye);
          break;
        case 'cross':
          // Mean little eyes under brows slanting down to its beak.
          r.dots([{ x: ex, y: ey }, { x: ex, y: ey + 1 }], C.eye);
          r.dots([{ x: ex + s, y: ey - 2 }, { x: ex, y: ey - 1 }], C.outline);
          break;
      }
    }
  }
}

/** From the front, how far down its face its beak shows: longer pointing down, foreshortened pointing at you. */
function beakLength(p: GoosePose): number {
  return 2.6 + Math.max(0, p.nod) * 1.6 - Math.max(0, -p.nod) * 1.2;
}

/**
 * Something it's wearing, seen end on: drawn as from the side, but neckwear that hangs at
 * its front (a tie, a bell) comes round to the middle, and is out of sight from behind.
 */
function wearEndOn(r: Raster, item: Wearable | null, origin: Pt, size: number, side: number, front: boolean, slots: Record<Paint, number>, neckwear: boolean): void {
  if (!item) return;
  const at = (x: number, y: number): Pt => ({ x: origin.x + x * size * side, y: origin.y + y * size });
  for (const s of item.shapes) {
    const hangs = neckwear && isFrontPiece(s);
    if (hangs && !front) continue;
    const dx = hangs ? -0.85 : 0;
    const shape =
      s.kind === 'poly'
        ? polygon(s.points.map(([x, y]) => at(x + dx, y)))
        : (() => {
            const c = at(s.cx + dx, s.cy);
            return ellipse(c.x, c.y, Math.max(0.6, s.rx * size), Math.max(0.6, s.ry * size));
          })();
    r.shape(shape.sd, shape.box, slots[s.paint], C.outline);
  }
}
