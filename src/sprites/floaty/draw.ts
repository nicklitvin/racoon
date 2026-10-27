import type { ChibiMark } from '../chibi/pose';
import { hatItem, NECK_WIDTH, outfitItem, UNDRESSED, type Dress, type Paint, type Wearable } from '../outfits';
import { drawMarks, PAINT_SLOT, PIXEL } from '../pixel/draw';
import { C } from '../pixel/palette';
import { capsule, ellipse, joinBoxes, polygon, Raster, union, type Box, type Pt, type Sd } from '../pixel/raster';
import type { AnimationName, EyeStyle } from '../types';
import type { FloatyBuild } from './kinds';

/**
 * The floaties: little blobs that float about a hand's width off the ground, bobbing as
 * they go, with a face that slides round them to look where they're going and a pair of
 * floating hands. Drawn in the same pixels as the pixel pets, and in the same box, with
 * the ground under them where a pet's feet would be.
 */

const { feetX: FX, feetY: FY } = PIXEL;

export type FloatyEyes = 'open' | 'closed' | 'happy' | 'wide' | 'cross' | 'squint';
export type FloatyMouth = 'smile' | 'grin' | 'o' | 'flat' | 'frown' | 'none';

/** Where a floaty is and what it's doing with its face and hands, for one picture. */
export interface FloatyPose {
  /** Gap between the ground and the bottom of its body, px. */
  hover: number;
  /** Squash and stretch: width and height of its body, 1 as built. */
  sx: number;
  sy: number;
  /** Lean, radians, clockwise. */
  tilt: number;
  /** Where its body is from the ground under it, sideways, px (a lunge, a swat). */
  shift: number;
  /** Which way it faces on the ground (radians, screen axes: 0 right, PI/2 towards you). */
  heading: number;
  eyes: FloatyEyes;
  mouth: FloatyMouth;
  /** Where it's looking, from its face, px (eyes slide a pixel that way). */
  look: Pt;
  blush: boolean;
  /** Its hands, px from the ground under it (facing right; the drawing turns them round), or null tucked away. */
  hands: [Pt, Pt] | null;
  mark: ChibiMark;
  /** Going fast: speed lines behind it. */
  dash: number;
}

/** The body's middle, px from the ground under it. */
export function bodyCentre(b: FloatyBuild, p: FloatyPose): Pt {
  return { x: p.shift, y: -(p.hover + b.R * p.sy) };
}

/** Where its paws go on a keyboard, from the ground under it facing right, px: the desk is built to fit. */
export function keyboardReach(b: FloatyBuild): Pt {
  return { x: b.R * 0.95 + 3, y: -(WORK_HOVER + b.R * 0.55) };
}

/** How high it floats at its desk. */
const WORK_HOVER = 4;
/** How high it floats, idling about, art pixels. */
export const HOVER = 6;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** 0 to 1 and back, `t` of the way through. */
const hump = (t: number) => Math.sin(Math.PI * clamp01(t));

/**
 * How it looks doing `animation`, `t` ms in. Hands are given facing right; `dir` turns the
 * whole thing round when it faces left.
 */
export function floatyPose(
  b: FloatyBuild,
  animation: AnimationName,
  t: number,
  clock: number,
  eyes: EyeStyle | 'blink',
  heading: number,
  speed: number,
  keystrokes: number,
): FloatyPose {
  const R = b.R;
  const bob = Math.sin(clock / 420) * 1.2;
  const rest = (hover = HOVER): [Pt, Pt] => [
    { x: R * 0.95, y: -(hover + R * 0.55) + Math.sin(clock / 420 + 0.8) * 0.8 },
    { x: -R * 0.95, y: -(hover + R * 0.55) + Math.sin(clock / 420 + 1.6) * 0.8 },
  ];
  const p: FloatyPose = {
    hover: HOVER + bob,
    sx: 1,
    sy: 1,
    tilt: 0,
    shift: 0,
    heading,
    eyes: eyes === 'closed' || eyes === 'blink' ? 'closed' : eyes === 'wide' ? 'wide' : 'open',
    mouth: 'smile',
    look: { x: 0, y: 0 },
    blush: false,
    hands: rest(),
    mark: null,
    dash: 0,
  };
  // Moving along: leaning into it, the hands trailing, bobbing faster.
  const travel = (lean: number, fast: boolean) => {
    const cycle = fast ? 260 : 520;
    const swing = Math.sin((clock / cycle) * Math.PI * 2);
    p.hover = HOVER + 1 + swing * (fast ? 1.6 : 1);
    p.tilt = lean;
    p.sx = 1 + Math.abs(swing) * 0.04;
    p.sy = 1 - Math.abs(swing) * 0.04;
    p.hands = [
      { x: R * 0.7 - (fast ? 4 : 2), y: -(p.hover + R * 0.5) + swing * 1.5 },
      { x: -R * 1.05 - (fast ? 3 : 1), y: -(p.hover + R * 0.6) - swing * 1.5 },
    ];
    if (fast) p.dash = clamp01(speed / 300);
  };

  switch (animation) {
    case 'idle':
      break;
    case 'walk':
    case 'stalk':
    case 'nudge':
      travel(0.12, false);
      if (animation === 'stalk') {
        p.hover = 2 + bob * 0.5;
        p.eyes = 'squint';
        p.mouth = 'flat';
        p.sy = 0.9;
        p.sx = 1.06;
      }
      if (animation === 'nudge') p.tilt = 0.3;
      break;
    case 'run':
    case 'chase':
      travel(0.26, true);
      if (animation === 'chase') p.mouth = 'grin';
      break;
    case 'fetch':
    case 'carry':
      travel(0.1, false);
      // Holding the block in front, in both hands.
      p.hands = [
        { x: R * 1.05, y: -(p.hover + R * 0.6) },
        { x: R * 0.55, y: -(p.hover + R * 0.3) },
      ];
      p.mouth = 'grin';
      break;
    case 'jump':
    case 'leap': {
      const k = hump(t / (animation === 'jump' ? 400 : 420));
      p.hover = HOVER + k * 10;
      p.sy = 1 + k * 0.14;
      p.sx = 1 - k * 0.08;
      p.tilt = 0.18;
      p.hands = [
        { x: R * 0.4, y: -(p.hover + R * 1.9) },
        { x: -R * 0.8, y: -(p.hover + R * 1.7) },
      ];
      p.mouth = 'o';
      break;
    }
    case 'sit':
      // Settled down low, floating gently.
      p.hover = 3 + bob * 0.6;
      p.hands = rest(3);
      break;
    case 'groom': {
      // Rubbing its face, one hand then the other.
      p.hover = 3 + bob * 0.5;
      const k = Math.sin((t / 1000) * Math.PI * 4);
      p.eyes = 'happy';
      p.mouth = 'smile';
      p.hands = [
        { x: R * 0.55 + k * 1.5, y: -(p.hover + R * 0.9) - Math.abs(k) },
        { x: R * 0.15 - k * 1.5, y: -(p.hover + R * 0.8) },
      ];
      break;
    }
    case 'yawn': {
      const k = hump(t / 2200);
      p.hover = 4 + bob * 0.5;
      p.sy = 1 + k * 0.1;
      p.sx = 1 - k * 0.05;
      p.eyes = 'closed';
      p.mouth = k > 0.3 ? 'o' : 'smile';
      p.hands = [
        { x: R * 0.75, y: -(p.hover + R * 0.55) - k * 3 },
        { x: -R * 1.1 - k * 3, y: -(p.hover + R * 1.2) - k * 4 },
      ];
      break;
    }
    case 'sleep': {
      // Down on the ground, a little squashed, breathing.
      const breath = Math.sin((t / 3200) * Math.PI * 2);
      p.hover = 0;
      p.sx = 1.1 + breath * 0.02;
      p.sy = 0.86 - breath * 0.02;
      p.eyes = 'closed';
      p.mouth = 'none';
      p.hands = null;
      p.mark = 'zzz';
      p.blush = true;
      break;
    }
    case 'peek': {
      // Peering up over the bottom of the screen, hands on the edge, eyes darting about with your typing.
      p.hover = 1;
      p.hands = [
        { x: R * 0.75, y: -(1 + R * 1.25) },
        { x: -R * 0.75, y: -(1 + R * 1.25) },
      ];
      p.look = { x: keystrokes % 2 ? 1 : -1, y: -1 };
      p.mouth = 'o';
      break;
    }
    case 'surprised': {
      const k = hump(t / 450);
      p.hover = HOVER + k * 4;
      p.sy = 1 + k * 0.12;
      p.sx = 1 - k * 0.06;
      p.eyes = 'wide';
      p.mouth = 'o';
      p.mark = 'alarm';
      p.hands = [
        { x: R * 1.3, y: -(p.hover + R * 1.4) },
        { x: -R * 1.3, y: -(p.hover + R * 1.4) },
      ];
      break;
    }
    case 'confused':
      // Head on one side, scratching the top of it.
      p.tilt = -0.18;
      p.mouth = 'flat';
      p.mark = 'puzzled';
      p.look = { x: 0, y: -1 };
      p.hands = [
        { x: R * 0.2 + Math.sin(t / 90), y: -(p.hover + R * 2.05) },
        { x: -R * 0.95, y: -(p.hover + R * 0.5) },
      ];
      break;
    case 'dangle': {
      // Held up by the top: stretched, swinging, hands up and feet... well, bottom dangling.
      const swing = Math.sin((t / 1400) * Math.PI * 2);
      p.hover = HOVER;
      p.sy = 1.12;
      p.sx = 0.92;
      p.tilt = swing * 0.12;
      p.eyes = 'wide';
      p.mouth = 'o';
      p.hands = [
        { x: R * 1.0, y: -(p.hover + R * 2.1) },
        { x: -R * 1.0, y: -(p.hover + R * 2.1) },
      ];
      break;
    }
    case 'happy': {
      const k = Math.abs(Math.sin((t / 1200) * Math.PI * 2));
      p.hover = HOVER + k * 4;
      p.sx = 1 + (1 - k) * 0.05;
      p.sy = 1 - (1 - k) * 0.05;
      p.eyes = 'happy';
      p.mouth = 'grin';
      p.blush = true;
      p.mark = 'hearts';
      p.hands = [
        { x: R * 1.25, y: -(p.hover + R * 1.3) - k * 2 },
        { x: -R * 1.25, y: -(p.hover + R * 1.3) - k * 2 },
      ];
      break;
    }
    case 'bat': {
      // A swat with the front hand, leaning into it.
      const k = t < 230 ? ease(t / 230) : 1 - ease((t - 230) / 420);
      p.tilt = 0.2 * k;
      p.shift = 2 * k;
      p.eyes = 'wide';
      p.mouth = 'grin';
      p.hands = [
        { x: R * 0.9 + k * 7, y: -(p.hover + R * 0.4) + k * 3 },
        { x: -R * 0.95, y: -(p.hover + R * 0.7) },
      ];
      break;
    }
    case 'toss':
    case 'lift':
    case 'throw': {
      // Scooping the block up in both hands, then flinging it up and away.
      const len = animation === 'toss' ? 1250 : animation === 'lift' ? 1000 : 950;
      const grab = animation === 'throw' ? 0 : 380 / len;
      const u = t / len;
      const up = u < grab ? ease(u / grab) * 0.2 : animation === 'lift' ? 0.3 : hump((u - grab) / (1 - grab));
      p.tilt = u < grab ? 0.25 : 0.25 - up * 0.45;
      p.mouth = up > 0.5 ? 'grin' : 'smile';
      p.hands = [
        { x: R * 1.05 + up * 2, y: -(p.hover + R * 0.4 + up * R * 1.2) },
        { x: R * 0.6 + up * 2, y: -(p.hover + R * 0.2 + up * R * 1.2) },
      ];
      break;
    }
    case 'sniff':
      // Leaning down for a good look at it.
      p.tilt = 0.3 + Math.sin(t / 120) * 0.04;
      p.hover = 4 + bob * 0.5;
      p.look = { x: 1, y: 1 };
      p.mouth = 'o';
      break;
    case 'work':
    case 'browse':
    case 'reels': {
      // At its desk, hands on the keyboard (or one on the mouse), eyes on the screen.
      const keys = keyboardReach(b);
      p.hover = WORK_HOVER + bob * 0.4;
      p.look = { x: 1, y: -1 };
      p.mouth = animation === 'reels' ? 'grin' : 'flat';
      const lift = (phase: number) => (Math.sin(clock / 70 + phase) > 0.2 ? -2 : 0);
      if (animation === 'work') {
        p.hands = [
          { x: keys.x + 2, y: keys.y + lift(0) },
          { x: keys.x - 3, y: keys.y + lift(2.1) },
        ];
      } else {
        const click = Math.sin(clock / (animation === 'reels' ? 180 : 400)) > 0.7 ? -1 : 0;
        p.hands = [
          { x: keys.x + 7, y: keys.y + click },
          { x: -R * 0.95, y: -(p.hover + R * 0.55) },
        ];
        if (animation === 'reels') {
          p.tilt = -0.12;
          p.blush = Math.sin(clock / 900) > 0.4;
        }
      }
      break;
    }
    case 'attention': {
      // Up and down, waving both hands over its head.
      const k = Math.abs(Math.sin((t / 1200) * Math.PI * 2));
      const wave = Math.sin((t / 1200) * Math.PI * 6);
      p.hover = HOVER + k * 5;
      p.mouth = 'grin';
      p.hands = [
        { x: R * 1.15 + wave * 2, y: -(p.hover + R * 2) },
        { x: -R * 1.15 + wave * 2, y: -(p.hover + R * 2) },
      ];
      break;
    }
    case 'angry': {
      // Shaking its fists, bouncing up and down on the spot.
      const k = Math.abs(Math.sin((t / 800) * Math.PI * 2));
      const shake = Math.sin(t / 45);
      p.hover = HOVER + k * 2;
      p.sx = 1.04;
      p.sy = 0.96;
      p.eyes = 'cross';
      p.mouth = 'frown';
      p.mark = 'angry';
      p.hands = [
        { x: R * 1.2 + shake, y: -(p.hover + R * 1.2) },
        { x: -R * 1.2 - shake, y: -(p.hover + R * 1.2) },
      ];
      break;
    }
  }
  return p;
}

/** The body's outline, as a signed distance, given its middle (pixels), radius, stretch and lean. */
function bodyShape(b: FloatyBuild, c: Pt, p: FloatyPose, clock: number): { sd: Sd; box: Box } {
  const rx = b.R * b.wide * p.sx;
  const ry = b.R * p.sy;
  const cos = Math.cos(p.tilt);
  const sin = Math.sin(p.tilt);
  const box = { x0: c.x - rx - 2, y0: c.y - ry * 1.7, x1: c.x + rx + 2, y1: c.y + ry + 2 };
  switch (b.shape) {
    case 'round':
      return ellipse(c.x, c.y, rx, ry, p.tilt);
    case 'squircle': {
      const n = 3.2;
      const sd: Sd = (x, y) => {
        const dx = x - c.x;
        const dy = y - c.y;
        const u = (dx * cos + dy * sin) / rx;
        const v = (-dx * sin + dy * cos) / ry;
        return ((Math.abs(u) ** n + Math.abs(v) ** n) ** (1 / n) - 1) * Math.min(rx, ry);
      };
      return { sd, box };
    }
    case 'drop': {
      // A round bottom drawn up into a point on top, the point swaying like a flame.
      const sway = Math.sin(clock / 160) * 1.4 + Math.sin(clock / 70) * 0.5;
      const at = (x: number, y: number): Pt => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos });
      const round = ellipse(c.x, c.y, rx, ry, p.tilt);
      const tip = polygon([at(-rx * 0.72, -ry * 0.35), at(sway - (p.heading > Math.PI / 2 ? -1 : 1) * 1.5, -ry * 1.65), at(rx * 0.72, -ry * 0.35)]);
      return { sd: union(round.sd, tip.sd), box };
    }
  }
}

/**
 * Draws a floaty into `r` with the ground under it at the feet point. Returns the box round
 * what it drew (for grabbing it), and where its top and its hands are.
 */
export function drawFloaty(r: Raster, b: FloatyBuild, p: FloatyPose, clock: number, dress: Dress = UNDRESSED): { box: Box | null; top: Pt; hands: [Pt, Pt] | null } {
  r.clear();
  const R = b.R;
  const dir = Math.cos(p.heading) < 0 ? -1 : 1;
  const towards = Math.sin(p.heading);
  const back = towards < -0.35;
  const cOff = bodyCentre(b, p);
  const c = { x: FX + cOff.x * dir, y: FY + cOff.y };
  const hand = (h: Pt): Pt => ({ x: FX + h.x * dir, y: FY + h.y });

  // Its shadow on the ground, smaller the higher it floats.
  const shadowW = R * b.wide * (1 - Math.min(0.5, p.hover / 30));
  const shadow = ellipse(FX + p.shift * dir, FY - 0.5, shadowW, 1.6);
  r.shape(shadow.sd, shadow.box, C.shadow, null);

  // Speed lines behind it.
  if (p.dash > 0.2) {
    for (const [dy, len] of [[-R * 0.6, 5], [0, 7], [R * 0.5, 4]] as const) {
      const y = Math.round(c.y + dy);
      const x0 = Math.round(c.x - dir * (R * b.wide + 3));
      for (let i = 0; i < Math.round(len * p.dash); i++) r.set(x0 - dir * i, y, C.light);
    }
  }

  const hands = p.hands ? ([hand(p.hands[0]), hand(p.hands[1])] as [Pt, Pt]) : null;
  const drawHand = (h: Pt) => {
    const e = ellipse(h.x, h.y, 1.9, 1.7);
    r.shape(e.sd, e.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  };
  // The far hand behind its body.
  if (hands) drawHand(back ? hands[0] : hands[1]);

  // Something on top: an antenna, or a sprout, behind any hat.
  const topY = c.y - R * p.sy;
  const tipX = c.x + Math.sin(p.tilt) * R * p.sy;
  if (b.topper === 'antenna') {
    const sway = Math.sin(clock / 300) * 1.2 - p.tilt * 6 * dir;
    const end = { x: tipX + sway, y: topY - 4.5 };
    const stalk = capsule({ x: tipX, y: topY + 1 }, end, 0.5);
    r.shape(stalk.sd, stalk.box, C.outline, null);
    const glow = Math.sin(clock / 500) > -0.3;
    const bulb = ellipse(end.x, end.y - 1, 1.7, 1.7);
    r.shape(bulb.sd, bulb.box, glow ? C.alarm : C.band, C.outline);
  } else if (b.topper === 'sprout') {
    const sway = Math.sin(clock / 380) * 0.8;
    const stem = { x: tipX + sway * 0.5, y: topY - 3 };
    const s = capsule({ x: tipX, y: topY + 1 }, stem, 0.5);
    r.shape(s.sd, s.box, C.band, null);
    const left = ellipse(stem.x - 2.4 + sway, stem.y - 1, 2.6, 1.3, -0.5);
    const right = ellipse(stem.x + 2.4 + sway, stem.y - 1.4, 2.6, 1.3, 0.5);
    r.shape(left.sd, left.box, C.band, C.outline);
    r.shape(right.sd, right.box, C.band, C.outline);
  }

  // Its body, lit along the top.
  const body = bodyShape(b, c, p, clock);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  // A shine on it, up on the far side.
  const shine = { x: Math.round(c.x - dir * R * 0.45 * p.sx), y: Math.round(c.y - R * 0.55 * p.sy) };
  r.dots([shine, { x: shine.x, y: shine.y + 1 }, { x: shine.x + dir, y: shine.y }], C.light);
  // Ember's tip burns brighter.
  if (b.shape === 'drop') {
    const flick = Math.sin(clock / 90) > 0;
    for (let i = 0; i < 3; i++) r.set(Math.round(tipX + Math.sin(clock / 160) * 1.4), Math.round(topY - R * 0.45 - i + (flick ? 1 : 0)), C.band);
  }
  // Freckles, for those that have them.
  if (b.freckles && !back) {
    const fx = c.x + Math.cos(p.heading) * R * 0.4;
    for (const s of [-1, 1]) r.dots([{ x: fx + s * R * 0.45, y: c.y + R * 0.15 }, { x: fx + s * R * 0.45 + 1, y: c.y + R * 0.15 + 1 }], C.furDark);
  }

  // The face: turned round its body to look the way it's going.
  if (!back) drawFace(r, b, p, c, clock);

  // Round its middle, then on top.
  const size = R * 0.85;
  wear(r, outfitItem(dress.outfit), { x: c.x, y: c.y + R * 0.62 * p.sy }, size * NECK_WIDTH, dir, PAINT_SLOT.wear);
  wear(r, hatItem(dress.hat), { x: tipX - dir * R * 0.05, y: topY + R * 0.12 }, size, dir, PAINT_SLOT.hat);

  if (hands) drawHand(back ? hands[1] : hands[0]);

  const box = r.bounds((col) => col === C.shadow);
  const top = { x: tipX, y: topY - (b.topper ? 5 : 0) };
  drawMarks(r, p.mark, { x: top.x, y: top.y - 3 }, dir, clock);
  return { box: box ? joinBoxes(box) : null, top, hands };
}

function drawFace(r: Raster, b: FloatyBuild, p: FloatyPose, c: Pt, clock: number): void {
  const R = b.R;
  const across = Math.cos(p.heading);
  const towards = Math.max(0, Math.sin(p.heading));
  // The face's middle, slid round towards the way it faces; the eyes closer together side on.
  const fx = c.x + across * R * 0.42 * p.sx + p.look.x * 0.6;
  const fy = c.y + R * 0.05 * p.sy + Math.sin(p.tilt) * across * R * 0.3;
  const spread = R * 0.33 * (0.5 + 0.5 * towards) * p.sx;
  const eyeY = Math.round(fy - 1 + p.look.y * 0.6);
  const eyes = [Math.round(fx - spread), Math.round(fx + spread)];
  const dx = Math.sign(p.look.x);
  const blinking = p.eyes === 'open' && clock % 4200 < 130;
  for (const [i, ex] of eyes.entries()) {
    switch (blinking ? 'closed' : p.eyes) {
      case 'open':
        r.dots([{ x: ex, y: eyeY - 1 }, { x: ex, y: eyeY }, { x: ex, y: eyeY + 1 }, { x: ex + 1, y: eyeY - 1 }, { x: ex + 1, y: eyeY }, { x: ex + 1, y: eyeY + 1 }].map((q) => ({ x: q.x + (dx > 0 ? 0 : dx < 0 ? -1 : 0), y: q.y })), C.eye);
        r.set(ex + 1 + (dx < 0 ? -1 : 0), eyeY - 1, C.glint);
        break;
      case 'wide':
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) r.set(ex + x, eyeY + y, C.eye);
        r.set(ex + 1, eyeY - 1, C.glint);
        break;
      case 'closed':
        r.dots([{ x: ex - 1, y: eyeY + 1 }, { x: ex, y: eyeY + 1 }, { x: ex + 1, y: eyeY + 1 }], C.eye);
        break;
      case 'happy':
        r.dots([{ x: ex - 1, y: eyeY + 1 }, { x: ex, y: eyeY }, { x: ex + 1, y: eyeY + 1 }], C.eye);
        break;
      case 'squint':
        r.dots([{ x: ex - 1, y: eyeY }, { x: ex, y: eyeY }, { x: ex + 1, y: eyeY }, { x: ex, y: eyeY + 1 }], C.eye);
        break;
      case 'cross': {
        // Brows down towards the middle.
        const inward = i === 0 ? 1 : -1;
        r.dots([{ x: ex, y: eyeY }, { x: ex + 1, y: eyeY }, { x: ex, y: eyeY + 1 }, { x: ex + 1, y: eyeY + 1 }], C.eye);
        r.dots([{ x: ex - inward, y: eyeY - 3 }, { x: ex, y: eyeY - 2 }, { x: ex + inward, y: eyeY - 1 }], C.outline);
        break;
      }
    }
  }
  if (p.blush) {
    for (const ex of eyes) r.dots([{ x: ex + (ex < fx ? -2 : 2), y: eyeY + 3 }, { x: ex + (ex < fx ? -1 : 3), y: eyeY + 3 }], C.blush);
  }
  const mx = Math.round(fx);
  const my = eyeY + 4;
  switch (p.mouth) {
    case 'smile':
      r.dots([{ x: mx - 1, y: my }, { x: mx, y: my + 1 }, { x: mx + 1, y: my }], C.mouth);
      break;
    case 'grin':
      r.dots([{ x: mx - 2, y: my }, { x: mx - 1, y: my + 1 }, { x: mx, y: my + 1 }, { x: mx + 1, y: my + 1 }, { x: mx + 2, y: my }, { x: mx - 1, y: my }, { x: mx, y: my }, { x: mx + 1, y: my }], C.mouth);
      r.dots([{ x: mx, y: my + 1 }], C.tongue);
      break;
    case 'o': {
      const big = Math.sin(clock / 200) > 0 ? 1 : 0;
      r.dots([{ x: mx, y: my }, { x: mx + 1, y: my }, { x: mx, y: my + 1 }, { x: mx + 1, y: my + 1 }, ...(big ? [{ x: mx, y: my + 2 }, { x: mx + 1, y: my + 2 }] : [])], C.mouth);
      break;
    }
    case 'flat':
      r.dots([{ x: mx - 1, y: my + 1 }, { x: mx, y: my + 1 }, { x: mx + 1, y: my + 1 }], C.mouth);
      break;
    case 'frown':
      r.dots([{ x: mx - 1, y: my + 1 }, { x: mx, y: my }, { x: mx + 1, y: my + 1 }], C.mouth);
      break;
    case 'none':
      break;
  }
}

/** Something it's wearing, in hat units `size` px across, its origin at `origin`, turned to face `dir`. */
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
