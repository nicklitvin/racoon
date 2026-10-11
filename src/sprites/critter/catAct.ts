import { CAT_BUILD as B } from './build';
import { gaitFor, lookAt, noFlags, walkBob, walkLegs, type Act, type ActInput } from './act';
import { bump, clamp01, easeOut, frac, lerp, noise1, smoother, span, wave } from './kit';
import { blankPose, setPaw, type Pose } from './pose';
import { DEPTH } from './view';

/**
 * How a real cat holds itself for each behaviour. Everything is relative to the feet,
 * facing right. Timings come from watching cats: a slow, deliberate walk with the tail up
 * in a question mark, a bounding run with the spine coiling and uncoiling, a sit with the
 * tail wrapped round the front paws, a curled-up sleep.
 */

/** Standing square on all four paws, relaxed. */
function stand(): Pose {
  const p = blankPose();
  p.px = B.pelvis.x;
  p.py = B.pelvis.y;
  p.sx = B.shoulder.x;
  p.sy = B.shoulder.y;
  p.arch = 1.2;
  p.hx = 27;
  p.hy = -34.5;
  p.hpitch = 8;
  p.hyaw = 34;
  setPaw(p, 'frontNear', 15.5, 0, B.frontLean);
  setPaw(p, 'frontFar', 15.5 + B.farOffset, 0, B.frontLean);
  setPaw(p, 'backNear', -12.5, 0, B.backLean);
  setPaw(p, 'backFar', -12.5 + B.farOffset, 0, B.backLean);
  p.tailA = 150;
  p.tailBend = -2;
  p.tailCurl = 20;
  p.tailStiff = 0.55;
  p.earN = 0.1;
  p.earF = 0.1;
  p.pupil = 0.4;
  return p;
}

/** Sitting up, front legs straight, tail wrapped round the front paws. */
function sit(): Pose {
  const p = stand();
  p.px = -10.5;
  p.py = -8.5;
  p.sx = 2.5;
  p.sy = -25.5;
  p.arch = 3.4;
  p.hx = 8.5;
  p.hy = -41;
  p.hpitch = 0;
  p.hyaw = 52;
  setPaw(p, 'frontNear', 5.5, 0, 4);
  setPaw(p, 'frontFar', 3, 0, 4);
  // Haunches folded: the whole hind foot lies along the ground.
  setPaw(p, 'backNear', 0, 0, 80);
  setPaw(p, 'backFar', -2.5, 0, 80);
  p.tailA = 128;
  p.tailBend = -12;
  p.tailCurl = 6;
  p.tailStiff = 0.6;
  p.tailSide = 0.55;
  return p;
}

/** Curled up in a ball asleep, nose tucked against the paws and the tail wrapped round. */
function curl(): Pose {
  const p = stand();
  p.px = -9;
  p.py = -8;
  p.sx = 8;
  p.sy = -9;
  p.arch = 7;
  p.hx = 15.5;
  p.hy = -9.5;
  p.hpitch = 14;
  p.hyaw = 70;
  p.hroll = -8;
  setPaw(p, 'frontNear', 15, -1.5, -70);
  setPaw(p, 'frontFar', 13, -1.5, -70);
  setPaw(p, 'backNear', -1, 0, 86);
  setPaw(p, 'backFar', -3, 0, 86);
  // Tail drops from the rump, runs forward along the floor and curls up under the chin.
  p.tailA = 115;
  p.tailKink = -26;
  p.tailBend = 0;
  p.tailCurl = -12;
  p.tailStiff = 0.8;
  p.tailSide = 0.5;
  p.earN = -0.15;
  p.earF = -0.15;
  return p;
}

/** Breathing: a slow rise and fall of the chest, deeper when asleep. */
function breathe(p: Pose, clock: number, periodMs: number, depth: number): void {
  const b = (wave(clock, periodMs) + 1) / 2;
  p.breath = b * depth;
  p.sy -= b * depth * 0.5;
  p.hy -= b * depth * 0.35;
}

/** Glances, ear flicks and a twitching tail tip, layered over resting poses. */
function alive(p: Pose, input: ActInput, amount = 1): void {
  const { life } = input;
  p.hyaw += life.glanceYaw * amount;
  p.hpitch += life.glancePitch * amount;
  p.lookX += life.lookX * amount;
  p.lookY += life.lookY * amount;
  p.earN += life.earN * amount;
  p.earF += life.earF * amount;
  p.tailCurl += life.tailFlick * 10 * amount;
}

function gaze(p: Pose, input: ActInput, weight = 1): void {
  if (input.gaze) lookAt(p, input.gaze, weight);
}

export function catAct(input: ActInput): Act {
  const { animation, t, clock, life } = input;
  const flags = noFlags();

  switch (animation) {
    case 'idle': {
      const p = stand();
      // Weight drifts from paw to paw; the head floats with it.
      const sway = life.sway;
      p.px += sway * 0.8;
      p.sx += sway * 0.8;
      p.hx += sway * 1.2;
      breathe(p, clock, 3200, 0.8);
      p.tailA += noise1(clock / 2600, 3) * 10;
      p.tailBend += noise1(clock / 1900, 5) * 1.5;
      alive(p, input);
      gaze(p, input);
      return { pose: p, flags };
    }

    case 'walk':
    case 'run':
    case 'chase':
    case 'jump': {
      if (animation === 'jump') return pounce(input);
      const gait = gaitFor(B, animation);
      const p = stand();
      const amp = clamp01(input.speed / 18);
      if (animation === 'walk') {
        // Head low and level, tail up in a friendly question mark.
        p.hx = 28.5;
        p.hy = -35.5;
        p.hpitch = 10;
        p.hyaw = 26;
        p.tailA = 250;
        p.tailBend = 2.2;
        p.tailCurl = 22;
        p.tailStiff = 0.5;
        walkLegs(p, B, gait, input, amp);
        walkBob(p, gait, input.phase, amp);
        // The head stays steady while the shoulders roll beneath it.
        p.hy += 0.25 * (p.sy - B.shoulder.y);
        const u = frac(input.phase - gait.offsets.frontNear);
        p.scapN = clamp01(Math.sin(u * Math.PI * 2 + 0.6)) * amp;
        p.scapF = clamp01(Math.sin((u - 0.5) * Math.PI * 2 + 0.6)) * amp;
        p.tailA += wave(input.phase, 1, 0.1) * 4 * amp;
        // Swaying side to side, and carried a little off to one side so the hook of the
        // question mark shows from behind and in front.
        p.tailSide = 0.3 + wave(input.phase, 1, 0.35) * 0.12 * amp;
        p.lookX = 0.25;
        alive(p, input, 0.5);
        return { pose: p, flags };
      }
      // Bounding: the spine coils as the paws gather under the body and uncoils as it stretches out.
      const chase = animation === 'chase';
      const f = Math.cos(Math.PI * 2 * (input.phase - 0.42));
      const len = (B.shoulder.x - B.pelvis.x) * (1 + (chase ? 0.16 : 0.12) * f * amp);
      const mid = -1 + (chase ? 1.5 : 0.8) * amp;
      const low = (chase ? 3 : 1.5) * amp;
      p.px = mid - len / 2;
      p.sx = mid + len / 2;
      // Rocking: hips rise as the back paws push off, then the shoulders as the front paws do.
      const rock = Math.sin(Math.PI * 2 * (input.phase - 0.15));
      p.py = B.pelvis.y + low - gait.bob * amp * Math.max(0, f) + 1.8 * rock * amp;
      p.sy = B.shoulder.y + low - gait.bob * amp * Math.max(0, f) - 1.8 * rock * amp;
      p.arch = lerp(1.2, 1.2 - 4.5 * f, amp);
      p.hx = p.sx + 13 + 1.5 * amp;
      p.hy = p.sy - 12 + low * 0.3 + 1.2 * rock * amp;
      p.hpitch = 16;
      p.hyaw = 18;
      p.earN = chase ? -0.35 : -0.1;
      p.earF = p.earN;
      p.tailA = chase ? 186 : 200;
      p.tailBend = chase ? 0.4 : 1.4;
      p.tailCurl = 5;
      p.tailStiff = 0.25;
      p.pupil = chase ? 1 : 0.6;
      p.lookX = 0.5;
      // Each paw's spot is fixed relative to the body's centre (not the flexing spine), so a
      // paw on the ground stays put.
      const half = (B.shoulder.x - B.pelvis.x) / 2;
      p.fnx = mid + half + 1.5;
      p.bnx = mid - half + 1;
      walkLegs(p, B, gait, input, amp);
      p.squash = 1 + 0.03 * f * amp;
      return { pose: p, flags };
    }

    case 'sit': {
      const p = sit();
      breathe(p, clock, 3600, 0.8);
      p.tailCurl += noise1(clock / 1500, 7) * 6;
      alive(p, input);
      gaze(p, input);
      flags.tailFront = true;
      return { pose: p, flags };
    }

    case 'groom':
      return groom(input);

    case 'yawn':
      return yawn(input);

    case 'sleep': {
      const p = curl();
      breathe(p, clock, 4200, 1.6);
      p.lids = 1;
      // Now and then an ear twitches in a dream.
      p.earN += life.earN * 0.6;
      p.tailCurl += life.tailFlick * 6;
      flags.tailFront = true;
      return { pose: p, flags };
    }

    case 'peek':
      return peek(input);

    case 'surprised':
      return startle(input);

    case 'confused': {
      // Sat back, head tilted one way and then the other, one ear swivelled.
      const p = sit();
      const side = Math.sign(wave(t, 3600, 0.15)) || 1;
      const tilt = smoother(Math.abs(wave(t, 3600, 0.15)) * 1.6);
      p.hroll = 16 * side * tilt;
      p.hyaw = 64;
      p.earN = side > 0 ? -0.5 * tilt : 0.4;
      p.earF = side > 0 ? 0.4 : -0.5 * tilt;
      p.lookX = 0.3 * side;
      p.pupil = 0.8;
      breathe(p, clock, 3600, 0.8);
      gaze(p, input, 0.6);
      flags.tailFront = true;
      p.tailCurl += wave(t, 900) * 10;
      return { pose: p, flags };
    }

    case 'dangle':
      return dangle(input);

    case 'happy':
      return happy(input);
  }
}

/** Crouch with a wiggle, then a flat-out leap with the front paws reaching. */
function pounce(input: ActInput): Act {
  const { t } = input;
  const flags = noFlags();
  const p = stand();
  const crouch = span(t, 0, 110) * (1 - span(t, 130, 210));
  const leap = span(t, 120, 260);
  // Crouch: chest down, rump up and wiggling.
  p.py += 7 * crouch;
  p.sy += 11 * crouch;
  p.px += 2 * crouch;
  p.sx -= 2 * crouch;
  p.hy += 12 * crouch;
  p.hx -= 2 * crouch;
  p.px += Math.sin(t / 22) * 1.5 * crouch;
  // Leap: stretched long, airborne, front paws thrown forward and back legs trailing.
  const air = 9 * leap;
  p.px = lerp(p.px, -18, leap);
  p.sx = lerp(p.sx, 15, leap);
  p.py = lerp(p.py, -27 - air, leap);
  p.sy = lerp(p.sy, -31 - air, leap);
  p.arch = lerp(1.2, -2.5, leap);
  p.hx = lerp(p.hx, 28, leap);
  p.hy = lerp(p.hy, -44 - air, leap);
  p.hpitch = lerp(14, 4, leap);
  p.hyaw = 22;
  setPaw(p, 'frontNear', lerp(15.5, 34, leap), lerp(0, -30 - air, leap), lerp(8, -40, leap));
  setPaw(p, 'frontFar', lerp(12.3, 31, leap), lerp(0, -25 - air, leap), lerp(8, -30, leap));
  setPaw(p, 'backNear', lerp(-12.5, -36, leap), lerp(0, -12 - air, leap), lerp(26, -60, leap));
  setPaw(p, 'backFar', lerp(-15.7, -38, leap), lerp(0, -10 - air, leap), lerp(26, -60, leap));
  p.tailA = lerp(150, 190, leap);
  p.tailBend = 1;
  p.tailStiff = 0.3;
  p.earN = 0.6;
  p.earF = 0.6;
  p.pupil = 1;
  p.lids = -0.3;
  p.squash = 1 - 0.06 * crouch + 0.05 * leap;
  flags.noShadow = false;
  return { pose: p, flags };
}

/** Licks a front paw a few times, then wipes it over the face. */
function groom(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  const p = sit();
  breathe(p, clock, 3600, 0.6);
  flags.tailFront = true;
  flags.pawUp = true;
  const raise = span(t, 0, 380);
  const cycle = 4200;
  const u = (t % cycle) / cycle;
  // 0..0.55: licking the paw. 0.55..1: wiping it over the cheek and ear.
  const licking = u < 0.55;
  const lick = licking ? Math.max(0, Math.sin((u / 0.55) * Math.PI * 2 * 4)) : 0;
  const wipe = licking ? 0 : Math.sin(((u - 0.55) / 0.45) * Math.PI * 2 * 2 - Math.PI / 2) * 0.5 + 0.5;
  const pawX = licking ? 13.5 : lerp(12, 10, wipe);
  const pawY = licking ? -34 + lick * 0.8 : lerp(-36, -46, wipe);
  setPaw(p, 'frontNear', lerp(5.5, pawX, raise), lerp(0, pawY, raise), lerp(4, licking ? -60 : -95, raise));
  p.hyaw = lerp(52, licking ? 40 : 62, raise);
  p.hpitch = lerp(0, licking ? 26 + lick * 6 : 12 + wipe * 8, raise);
  p.hroll = lerp(0, licking ? 0 : -10 * wipe, raise);
  p.hx = lerp(8, licking ? 10.5 : 9, raise);
  p.hy = lerp(-43, licking ? -40 + lick : -42, raise);
  p.lids = licking ? 0.85 : 0.95;
  p.tongue = licking ? lick * raise : 0;
  p.mouth = licking ? 0.25 * lick * raise : 0;
  p.earN = licking ? 0 : -0.4 * wipe;
  return { pose: p, flags };
}

/** A big, slow yawn: head up, jaw wide, eyes squeezed shut, ears back. */
function yawn(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  const p = sit();
  breathe(p, clock, 3600, 0.6);
  flags.tailFront = true;
  const open = span(t, 250, 900) * (1 - span(t, 1500, 1950));
  p.hpitch = -18 * open;
  p.hy -= 2 * open;
  p.hyaw = lerp(52, 40, open);
  p.mouth = open;
  p.tongue = open * 0.6;
  p.lids = lerp(0.2, 1, span(t, 150, 600)) * (1 - 0.3 * span(t, 1900, 2200));
  p.earN = -0.6 * open;
  p.earF = -0.6 * open;
  // Little shake of the head as it closes.
  p.hroll = wave(t, 180) * 4 * bump((t - 1800) / 400);
  return { pose: p, flags };
}

/**
 * Peeking at you over the bottom edge, front paws on it either side of the face, watching
 * you type. He faces you, so the pose is laid out for that view: a step towards you shows
 * DEPTH lower on the screen, which the paws and head allow for to sit on the edge.
 */
function peek(input: ActInput): Act {
  const { keystrokes, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  flags.pawUp = true;
  const p = stand();
  const edge = B.peekEdge;
  const R = B.head.r;
  p.px = -6;
  p.py = -14;
  p.sx = -1;
  p.sy = -27;
  p.arch = 2;
  p.hx = 3;
  // Chin on the edge, between the paws.
  p.hy = edge - R * 0.82 - 3 * DEPTH;
  p.hpitch = 4;
  p.hyaw = 90;
  // Paws on the edge, out either side of the chin.
  const pawA = 6;
  p.fspread = 7.4;
  setPaw(p, 'frontNear', pawA, edge - 0.3 - pawA * DEPTH, 92);
  setPaw(p, 'frontFar', pawA, edge - 0.3 - pawA * DEPTH, 92);
  setPaw(p, 'backNear', -4, 0, 40);
  setPaw(p, 'backFar', -4, 0, 40);
  p.tailA = 160;
  p.tailBend = 0;
  p.tailStiff = 0.3;
  breathe(p, clock, 3200, 0.5);
  // Eyes dart along with each key press, like following a moving dot.
  const k = keystrokes;
  p.lookX = Math.sin(k * 1.7) * 0.55;
  p.lookY = 0.35 + Math.cos(k * 2.3) * 0.2;
  p.hroll = Math.sin(k * 0.9) * 6;
  p.pupil = 0.9;
  p.earN = 0.5 + input.life.earN;
  p.earF = 0.5 + input.life.earF;
  return { pose: p, flags };
}

/** Startled: a jump straight up into the Halloween-cat arch, fur on end. */
function startle(input: ActInput): Act {
  const { t } = input;
  const flags = noFlags();
  const p = stand();
  const up = span(t, 0, 140);
  const down = span(t, 160, 320);
  const air = 9 * up * (1 - down);
  const arch = easeOut(t / 260);
  p.px = -10;
  p.sx = 10;
  p.py = -28 - air;
  p.sy = -26.5 - air;
  p.arch = lerp(1.2, 13, arch);
  p.hx = lerp(26.5, 20, arch);
  p.hy = lerp(-37.5, -34, arch) - air;
  p.hpitch = 8;
  p.hyaw = 60;
  // Stiff, straight legs, paws drawn together.
  setPaw(p, 'frontNear', 12, -air, 0);
  setPaw(p, 'frontFar', 9.5, -air, 0);
  setPaw(p, 'backNear', -8, -air, 10);
  setPaw(p, 'backFar', -10.5, -air, 10);
  p.tailA = lerp(130, 262, arch);
  p.tailBend = 0.6;
  p.tailCurl = 4;
  p.tailStiff = 0.95;
  p.puff = arch;
  p.earN = -1;
  p.earF = -1;
  p.lids = -0.6;
  p.pupil = 1;
  p.mouth = 0.35 * arch;
  p.squash = 1 + 0.06 * up * (1 - down) - 0.05 * bump((t - 300) / 200);
  return { pose: p, flags };
}

/** Held up by the scruff: hangs long and limp, swinging, legs and tail dangling. */
function dangle(input: ActInput): Act {
  const { swing, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  const p = stand();
  p.rot = swing;
  p.sx = 6;
  p.sy = -44;
  p.px = 0;
  p.py = -18;
  p.arch = -3;
  p.hx = 13;
  p.hy = -55;
  p.hpitch = 20;
  p.hyaw = 70;
  // Legs hang straight down whatever the swing, trailing it a little.
  const hang = -swing * 0.8;
  const drop = (x: number, y: number, length: number, lean: number) => {
    const a = (hang * Math.PI) / 180;
    return { x: x - Math.sin(a) * length, y: y + Math.cos(a) * length, lean };
  };
  const fn = drop(12, -40, 18, -20);
  const ff = drop(9.5, -40, 18, -20);
  const bn = drop(1, -16, 20, 30);
  const bf = drop(-2, -16, 20, 30);
  const kick = Math.max(0, wave(clock, 2600)) * 1.5;
  setPaw(p, 'frontNear', fn.x + 1, fn.y, fn.lean);
  setPaw(p, 'frontFar', ff.x, ff.y - 1, fn.lean);
  setPaw(p, 'backNear', bn.x + kick, bn.y - kick, bn.lean);
  setPaw(p, 'backFar', bf.x, bf.y, bf.lean);
  p.tailA = 165;
  p.tailBend = 3;
  p.tailCurl = 10;
  p.tailStiff = 0.15;
  p.earN = -0.3;
  p.earF = -0.3;
  p.lookY = 0.4;
  p.pupil = 0.8;
  p.lids = 0.15;
  return { pose: p, flags };
}

/** Being stroked: eyes shut in bliss, head rubbing, kneading, tail straight up and quivering. */
function happy(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  const p = sit();
  flags.tailFront = false;
  breathe(p, clock, 2400, 1);
  const rub = wave(t, 1600);
  p.hroll = -10 + rub * 8;
  p.hpitch = -12 + rub * 4;
  p.hyaw = 58;
  p.hy -= 1.5;
  p.happy = 1;
  p.lids = 0.9;
  p.earN = -0.25 + rub * 0.1;
  p.earF = -0.2;
  // Kneading: front paws pushing down one after the other.
  const knead = (phase: number) => Math.max(0, Math.sin((t / 700 + phase) * Math.PI * 2));
  setPaw(p, 'frontNear', 5.5 + knead(0) * 1.5, -knead(0) * 3, 4 - knead(0) * 40);
  setPaw(p, 'frontFar', 3 + knead(0.5) * 1.5, -knead(0.5) * 3, 4 - knead(0.5) * 40);
  p.tailA = 262;
  p.tailSide = 0;
  p.tailBend = 1.4;
  p.tailCurl = 10 + Math.sin(clock / 45) * 2;
  p.tailStiff = 0.7;
  p.mouth = 0;
  return { pose: p, flags };
}
