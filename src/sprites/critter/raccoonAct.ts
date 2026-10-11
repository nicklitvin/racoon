import { RACCOON_BUILD as B } from './build';
import { gaitFor, lookAt, noFlags, walkBob, walkLegs, type Act, type ActInput } from './act';
import { bump, clamp01, easeOut, lerp, noise1, smoother, span, wave } from './kit';
import { blankPose, setPaw, type Pose } from './pose';

/**
 * How a real raccoon holds itself. Raccoons are built low in front and high at the hips,
 * so the back is a hump; they walk flat-footed on the hind feet in a rolling amble, sit
 * up on their haunches, wash and fiddle with their hands, and stand up on their hind legs
 * to get a better look at anything surprising.
 */

/** On all fours: head low, back humped. */
function stand(): Pose {
  const p = blankPose();
  p.px = B.pelvis.x;
  p.py = B.pelvis.y;
  p.sx = B.shoulder.x;
  p.sy = B.shoulder.y;
  p.arch = 4.5;
  p.hx = 25;
  p.hy = -23.5;
  p.hpitch = 10;
  p.hyaw = 30;
  setPaw(p, 'frontNear', 15.5, 0, B.frontLean);
  setPaw(p, 'frontFar', 15.5 + B.farOffset, 0, B.frontLean);
  setPaw(p, 'backNear', -8.5, 0, B.backLean);
  setPaw(p, 'backFar', -8.5 + B.farOffset, 0, B.backLean);
  p.tailA = 152;
  p.tailBend = 1.8;
  p.tailCurl = 3;
  p.tailStiff = 0.5;
  p.earN = 0.1;
  p.earF = 0.1;
  p.pupil = 0.6;
  return p;
}

/** Sat up on the haunches like a little person, hind feet out in front, hands in the lap. */
function sitUp(): Pose {
  const p = stand();
  p.px = -7;
  p.py = -10.5;
  p.sx = -1;
  p.sy = -33;
  p.arch = 3;
  p.hx = 3;
  p.hy = -44;
  p.hpitch = 6;
  p.hyaw = 58;
  // Hands resting together in front of the belly.
  setPaw(p, 'frontNear', 6.5, -17, -10);
  setPaw(p, 'frontFar', 4, -17.5, -10);
  // Hind feet flat out in front, soles forward.
  setPaw(p, 'backNear', 7, 0, 80);
  setPaw(p, 'backFar', 4, 0, 80);
  // Angles are relative to the spine, which points up: this lays the tail back along the floor.
  p.tailA = 238;
  p.tailBend = 1;
  p.tailCurl = 6;
  p.tailStiff = 0.6;
  return p;
}

/** Curled in a ball, tail wrapped round over the paws. */
function curl(): Pose {
  const p = stand();
  p.px = -9;
  p.py = -9.5;
  p.sx = 7;
  p.sy = -8.5;
  p.arch = 8.5;
  p.hx = 13.5;
  p.hy = -8.5;
  p.hpitch = 20;
  p.hyaw = 72;
  p.hroll = -10;
  setPaw(p, 'frontNear', 14, -1.5, -60);
  setPaw(p, 'frontFar', 12, -1.5, -60);
  setPaw(p, 'backNear', -1, 0, 86);
  setPaw(p, 'backFar', -3, 0, 86);
  p.tailA = 112;
  p.tailKink = -28;
  p.tailBend = 0;
  p.tailCurl = -8;
  p.tailStiff = 0.8;
  p.earN = -0.1;
  p.earF = -0.1;
  return p;
}

function breathe(p: Pose, clock: number, periodMs: number, depth: number): void {
  const b = (wave(clock, periodMs) + 1) / 2;
  p.breath = b * depth;
  p.sy -= b * depth * 0.45;
  p.hy -= b * depth * 0.3;
}

function alive(p: Pose, input: ActInput, amount = 1): void {
  const { life } = input;
  p.hyaw += life.glanceYaw * amount;
  p.hpitch += life.glancePitch * amount - life.sniff * 3 * amount;
  p.hy -= life.sniff * 0.6 * amount;
  p.lookX += life.lookX * amount;
  p.lookY += life.lookY * amount;
  p.earN += life.earN * amount;
  p.earF += life.earF * amount;
  p.tailCurl += life.tailFlick * 5 * amount;
}

function gaze(p: Pose, input: ActInput, weight = 1): void {
  if (input.gaze) lookAt(p, input.gaze, weight);
}

export function raccoonAct(input: ActInput): Act {
  const { animation, t, clock, life } = input;
  const flags = noFlags();

  switch (animation) {
    case 'idle': {
      const p = stand();
      p.px += life.sway * 0.7;
      p.sx += life.sway * 0.7;
      p.hx += life.sway;
      breathe(p, clock, 2800, 0.9);
      p.tailA += noise1(clock / 3000, 4) * 6;
      alive(p, input);
      gaze(p, input);
      return { pose: p, flags };
    }

    case 'walk': {
      const gait = gaitFor(B, animation);
      const p = stand();
      const amp = clamp01(input.speed / 18);
      walkLegs(p, B, gait, input, amp);
      walkBob(p, gait, input.phase, amp);
      // The rolling amble: the hump rises and falls and the head nods along.
      p.arch += Math.sin(input.phase * Math.PI * 4) * 1.2 * amp;
      p.hy += 0.4 * (p.sy - B.shoulder.y) + Math.sin(input.phase * Math.PI * 4 + 1) * 0.6 * amp;
      p.hx += 1;
      p.hpitch = 14;
      p.hyaw = 24;
      p.tailA = 172 + wave(input.phase, 1, 0.2) * 5 * amp;
      p.tailStiff = 0.4;
      p.lookX = 0.2;
      alive(p, input, 0.5);
      return { pose: p, flags };
    }

    case 'run':
    case 'chase': {
      // A humped, bounding gallop.
      const gait = gaitFor(B, animation);
      const p = stand();
      const chase = animation === 'chase';
      const amp = clamp01(input.speed / 18);
      const f = Math.cos(Math.PI * 2 * (input.phase - 0.42));
      const len = (B.shoulder.x - B.pelvis.x) * (1 + 0.13 * f * amp);
      p.px = -0.5 - len / 2;
      p.sx = -0.5 + len / 2;
      const rock = Math.sin(Math.PI * 2 * (input.phase - 0.15));
      p.py = B.pelvis.y + 1 - gait.bob * amp * Math.max(0, f) + 1.6 * rock * amp;
      p.sy = B.shoulder.y + 1 - gait.bob * amp * Math.max(0, f) - 1.6 * rock * amp;
      p.arch = 4.5 - 4 * f * amp;
      p.hx = p.sx + 12;
      p.hy = p.sy - 5 + 1 * rock * amp;
      p.hpitch = 12;
      p.hyaw = 20;
      p.earN = chase ? -0.4 : -0.15;
      p.earF = p.earN;
      p.tailA = 182;
      p.tailBend = 0.5;
      p.tailStiff = 0.3;
      p.lookX = 0.5;
      const half = (B.shoulder.x - B.pelvis.x) / 2;
      p.fnx = -0.5 + half + 2;
      p.bnx = -0.5 - half + 4;
      walkLegs(p, B, gait, input, amp);
      return { pose: p, flags };
    }

    case 'jump':
      return pounce(input);

    case 'sit': {
      const p = sitUp();
      breathe(p, clock, 3000, 0.9);
      // Fidgety fingers.
      p.fny += noise1(clock / 700, 2) * 0.6;
      p.ffy += noise1(clock / 800, 9) * 0.6;
      alive(p, input);
      gaze(p, input);
      return { pose: p, flags: { ...flags, pawUp: true } };
    }

    case 'groom':
      return washHands(input);

    case 'yawn': {
      const p = sitUp();
      breathe(p, clock, 3000, 0.7);
      const open = span(t, 250, 850) * (1 - span(t, 1500, 1950));
      p.hpitch = 6 - 22 * open;
      p.hy -= 2 * open;
      p.mouth = open;
      p.tongue = open * 0.5;
      p.lids = lerp(0.2, 1, span(t, 150, 600)) * (1 - 0.3 * span(t, 1900, 2200));
      p.earN = -0.5 * open;
      p.earF = -0.5 * open;
      // Hands rise as he stretches.
      setPaw(p, 'frontNear', 7 + open * 2, -17 - open * 6, -10 - open * 40);
      setPaw(p, 'frontFar', 4.5 + open * 2, -17.5 - open * 6, -10 - open * 40);
      p.hroll = wave(t, 200) * 3 * bump((t - 1800) / 400);
      return { pose: p, flags: { ...flags, pawUp: true } };
    }

    case 'sleep': {
      const p = curl();
      breathe(p, clock, 4000, 1.8);
      p.lids = 1;
      p.earN += life.earN * 0.5;
      p.tailCurl += life.tailFlick * 4;
      flags.tailFront = true;
      flags.pawUp = true;
      return { pose: p, flags };
    }

    case 'peek':
      return peek(input);

    case 'surprised':
      return standUp(input);

    case 'confused': {
      const p = sitUp();
      const side = Math.sign(wave(t, 3400, 0.15)) || 1;
      const tilt = smoother(Math.abs(wave(t, 3400, 0.15)) * 1.6);
      p.hroll = 18 * side * tilt;
      p.hyaw = 62;
      p.earN = side > 0 ? -0.5 * tilt : 0.4;
      p.earF = side > 0 ? 0.4 : -0.5 * tilt;
      p.lookX = 0.3 * side;
      // Scratches his head with one hand, then the other hand back in the lap.
      const scratch = span(t % 3400, 600, 900) * (1 - span(t % 3400, 1500, 1800));
      setPaw(p, 'frontNear', lerp(6.5, 9, scratch), lerp(-17, -45, scratch) + Math.sin(t / 60) * 0.8 * scratch, lerp(-10, -150, scratch));
      breathe(p, clock, 3000, 0.9);
      gaze(p, input, 0.6);
      return { pose: p, flags: { ...flags, pawUp: true } };
    }

    case 'dangle':
      return dangle(input);

    case 'happy':
      return happy(input);
  }
}

/** Sat up, rubbing and rolling his hands together, peering at them. The raccoon thing. */
function washHands(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  flags.pawUp = true;
  const p = sitUp();
  breathe(p, clock, 3000, 0.7);
  const ease = span(t, 0, 400);
  const u = (t / 520) * Math.PI * 2;
  // The hands circle round each other, out of step.
  const hx = 8.5;
  const hy = -21;
  setPaw(p, 'frontNear', lerp(6.5, hx + Math.cos(u) * 2.2, ease), lerp(-17, hy + Math.sin(u) * 1.6, ease), lerp(-10, -60 + Math.sin(u) * 25, ease));
  setPaw(p, 'frontFar', lerp(4, hx - 1 + Math.cos(u + Math.PI) * 2.2, ease), lerp(-17.5, hy + Math.sin(u + Math.PI) * 1.6, ease), lerp(-10, -60 + Math.sin(u + Math.PI) * 25, ease));
  p.hpitch = lerp(6, 26, ease);
  p.hyaw = lerp(58, 42, ease);
  p.hx = lerp(3, 5, ease);
  p.hy = lerp(-44, -41, ease);
  p.lookY = 0.7 * ease;
  p.lookX = 0.2;
  p.earN = 0.3;
  p.earF = 0.3;
  // Every so often he sniffs what he's got.
  const sniff = Math.max(0, Math.sin(t / 900)) ** 8;
  p.hpitch += sniff * 6;
  p.hx += sniff * 1.5;
  return { pose: p, flags };
}

/** Pounce: a short crouch and a flat-out leap, hands reaching. */
function pounce(input: ActInput): Act {
  const { t } = input;
  const flags = noFlags();
  const p = stand();
  const crouch = span(t, 0, 110) * (1 - span(t, 130, 210));
  const leap = span(t, 120, 260);
  p.py += 5 * crouch;
  p.sy += 6 * crouch;
  p.hy += 6 * crouch;
  const air = 8 * leap;
  p.px = lerp(p.px, -16, leap);
  p.sx = lerp(p.sx, 14, leap);
  p.py = lerp(p.py, -24 - air, leap);
  p.sy = lerp(p.sy, -24 - air, leap);
  p.arch = lerp(4.5, 0, leap);
  p.hx = lerp(p.hx, 26, leap);
  p.hy = lerp(p.hy, -32 - air, leap);
  p.hpitch = 6;
  p.hyaw = 22;
  setPaw(p, 'frontNear', lerp(15.5, 30, leap), lerp(0, -24 - air, leap), lerp(58, -40, leap));
  setPaw(p, 'frontFar', lerp(12.5, 27, leap), lerp(0, -20 - air, leap), lerp(58, -30, leap));
  setPaw(p, 'backNear', lerp(-8.5, -30, leap), lerp(0, -10 - air, leap), lerp(74, -40, leap));
  setPaw(p, 'backFar', lerp(-11.5, -32, leap), lerp(0, -8 - air, leap), lerp(74, -40, leap));
  p.tailA = 185;
  p.tailStiff = 0.3;
  p.earN = 0.6;
  p.earF = 0.6;
  p.lids = -0.3;
  return { pose: p, flags };
}

/** Peeking over the bottom edge: hands gripping it, nose and eyes just over the top. */
function peek(input: ActInput): Act {
  const { keystrokes, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  flags.pawUp = true;
  const p = stand();
  const edge = B.peekEdge;
  p.px = -4;
  p.py = -18;
  p.sx = 3;
  p.sy = -36;
  p.arch = 3;
  p.hx = 6;
  p.hy = edge - 13;
  p.hpitch = 8;
  p.hyaw = 80;
  setPaw(p, 'frontNear', 11, edge - 1.4, 95);
  setPaw(p, 'frontFar', 1, edge - 1.4, 95);
  setPaw(p, 'backNear', -2, 0, 74);
  setPaw(p, 'backFar', -5, 0, 74);
  p.tailA = 165;
  p.tailBend = 0;
  breathe(p, clock, 3000, 0.5);
  const k = keystrokes;
  p.lookX = Math.sin(k * 1.7) * 0.55;
  p.lookY = 0.35 + Math.cos(k * 2.3) * 0.2;
  p.hroll = Math.sin(k * 0.9) * 6;
  p.earN = 0.5 + input.life.earN;
  p.earF = 0.5 + input.life.earF;
  p.hy -= input.life.sniff * 0.8;
  return { pose: p, flags };
}

/** Startled: up on his hind legs in a flash, hands up, ears back, staring. */
function standUp(input: ActInput): Act {
  const { t } = input;
  const flags = noFlags();
  flags.pawUp = true;
  const p = stand();
  const up = easeOut(t / 220);
  p.px = lerp(p.px, -4, up);
  p.py = lerp(p.py, -20, up);
  p.sx = lerp(p.sx, -1.5, up);
  p.sy = lerp(p.sy, -44, up);
  p.arch = lerp(4.5, 2, up);
  p.hx = lerp(p.hx, 2, up);
  p.hy = lerp(p.hy, -55, up);
  p.hpitch = lerp(10, 0, up);
  p.hyaw = lerp(30, 70, up);
  // Hands held up at the chest, fingers spread.
  setPaw(p, 'frontNear', lerp(15.5, 6, up), lerp(0, -36, up), lerp(58, -120, up));
  setPaw(p, 'frontFar', lerp(12.5, 3, up), lerp(0, -37, up), lerp(58, -120, up));
  setPaw(p, 'backNear', -1, 0, 72);
  setPaw(p, 'backFar', -4, 0, 72);
  p.tailA = lerp(152, 235, up);
  p.tailBend = 0.5;
  p.tailStiff = 0.7;
  p.puff = up * 0.8;
  p.earN = -0.8;
  p.earF = -0.8;
  p.lids = -0.6;
  p.pupil = 1;
  p.mouth = 0.25 * up;
  p.squash = 1 + 0.04 * bump(t / 260);
  return { pose: p, flags };
}

/** Carried: hangs from the scruff with arms and legs splayed and the tail hanging. */
function dangle(input: ActInput): Act {
  const { swing, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  const p = stand();
  const scruff = { x: 6, y: -54 };
  p.rot = swing;
  p.rotX = scruff.x;
  p.rotY = scruff.y;
  p.sx = 5;
  p.sy = -40;
  p.px = 0;
  p.py = -16;
  p.arch = -2;
  p.hx = 10;
  p.hy = -52;
  p.hpitch = 16;
  p.hyaw = 72;
  const hang = (-swing * 0.8 * Math.PI) / 180;
  const drop = (x: number, y: number, length: number) => ({ x: x - Math.sin(hang) * length, y: y + Math.cos(hang) * length });
  const fn = drop(9, -36, 15);
  const ff = drop(5, -36, 15);
  const bn = drop(2, -14, 16);
  const bf = drop(-2, -14, 16);
  const paddle = wave(clock, 1800);
  setPaw(p, 'frontNear', fn.x + 3 + paddle, fn.y - 1, -30);
  setPaw(p, 'frontFar', ff.x - 1, ff.y, -30);
  setPaw(p, 'backNear', bn.x + 2, bn.y - paddle, 40);
  setPaw(p, 'backFar', bf.x - 1, bf.y, 40);
  p.tailA = 166;
  p.tailBend = 1;
  p.tailStiff = 0.2;
  p.earN = -0.2;
  p.earF = -0.2;
  p.lookY = 0.4;
  return { pose: p, flags };
}

/** Petted: sits up, eyes squeezed happy, swaying with hands clasped. */
function happy(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  flags.pawUp = true;
  const p = sitUp();
  breathe(p, clock, 2200, 1);
  const sway = wave(t, 1300);
  p.hroll = sway * 9;
  p.hx += sway * 1.2;
  p.sx += sway * 0.8;
  p.hpitch = -6;
  p.hyaw = 62;
  p.happy = 1;
  p.lids = 0.9;
  p.mouth = 0.18;
  p.earN = -0.2;
  p.earF = -0.2;
  setPaw(p, 'frontNear', 7.5 + sway, -22, -40);
  setPaw(p, 'frontFar', 5.5 + sway, -22.5, -40);
  p.tailA = 238 + sway * 8;
  return { pose: p, flags };
}

