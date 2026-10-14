import { PLAY } from '../animations';
import { OTTER_BUILD as B } from './build';
import { LEAP_MS, lookAt, noFlags, type Act, type ActInput } from './act';
import { bump, clamp01, easeOut, keyed, lerp, noise1, smooth, span, wave } from './kit';
import { blankPose, LEGS, POSE_KEYS, setPaw, type Pose } from './pose';
import { DEPTH } from './view';
import { typing } from '../typing';

/**
 * How a real otter carries itself in the water. The floor is the surface of the pond:
 * swimming, only the head and the line of the back show, the legs paddling below;
 * resting, it floats on its back with its paws on its chest and its hind feet in the air;
 * curious, it treads water upright with its chest out ("periscoping") to look about.
 * Fast, it tucks its legs in and swims with its whole body, porpoising out of the water
 * now and then. Everything below the surface is seen through the water.
 */

/** Swimming at the surface: head up, back just out of the water, legs below. */
function swim(): Pose {
  const p = blankPose();
  p.px = B.pelvis.x;
  p.py = 2.4;
  p.sx = B.shoulder.x;
  p.sy = 1.8;
  p.arch = 0.8;
  p.hx = B.shoulder.x + 10;
  p.hy = -6.5;
  p.hpitch = -4;
  p.hyaw = 26;
  setPaw(p, 'frontNear', B.shoulder.x + 2, 8.5, 40);
  setPaw(p, 'frontFar', B.shoulder.x + 2 + B.farOffset, 8.5, 40);
  setPaw(p, 'backNear', B.pelvis.x - 2, 8, 70);
  setPaw(p, 'backFar', B.pelvis.x - 2 + B.farOffset, 8, 70);
  p.tailA = 182;
  p.tailBend = 0;
  p.tailCurl = 0;
  p.tailStiff = 0.45;
  p.pupil = 0.8;
  return p;
}

/** Floating on its back, belly to the sky, paws together on its chest, hind feet up. */
function onBack(): Pose {
  const p = swim();
  p.roll = 1;
  p.px = B.pelvis.x + 1;
  p.py = 0.4;
  p.sx = B.shoulder.x;
  p.sy = -0.4;
  p.arch = 0;
  p.hx = B.shoulder.x + 9;
  p.hy = -11;
  p.hpitch = -4;
  p.hyaw = 56;
  setPaw(p, 'frontNear', p.sx - 4.5, -7.8, 100);
  setPaw(p, 'frontFar', p.sx - 6, -7.6, 100);
  // The hind feet poke up out of the water at the end.
  setPaw(p, 'backNear', p.px - 1, -5.5, 140);
  setPaw(p, 'backFar', p.px - 2.5, -5, 145);
  p.tailA = 180;
  p.tailBend = 0.4;
  p.tailStiff = 0.55;
  p.earN = -0.1;
  p.earF = -0.1;
  return p;
}

/** Treading water upright, chest and head out, looking about. */
function tread(): Pose {
  const p = swim();
  p.px = -8;
  p.py = 13;
  p.sx = 11;
  p.sy = -9.5;
  p.arch = 1.5;
  p.hx = 15.5;
  p.hy = -19;
  p.hpitch = 6;
  p.hyaw = 40;
  setPaw(p, 'frontNear', 15, 1.5, 30);
  setPaw(p, 'frontFar', 15 + B.farOffset, 1.5, 30);
  setPaw(p, 'backNear', -4, 19, 70);
  setPaw(p, 'backFar', -4 + B.farOffset, 19, 70);
  // The tail carries on down the line of the body, under the water.
  p.tailA = 182;
  p.tailBend = 1.2;
  p.tailStiff = 0.4;
  p.earN = 0.2;
  p.earF = 0.2;
  return p;
}

/** In-between pose of two others, `k` of the way to `b`. */
function mix(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose;
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], k);
  return out;
}

/** Breathing: a slow rise and fall of the chest. */
function breathe(p: Pose, clock: number, periodMs: number, depth: number): void {
  const b = (wave(clock, periodMs) + 1) / 2;
  p.breath = b * depth;
}

/** Bobbing on the ripples. */
function bob(p: Pose, clock: number, amount: number): void {
  const b = noise1(clock / 1400, 21) * amount;
  p.py += b;
  p.sy += b * 0.8 + noise1(clock / 1700, 23) * amount * 0.5;
  p.hy += b * 0.7;
  for (const leg of LEGS) {
    const key = leg === 'frontNear' ? 'fny' : leg === 'frontFar' ? 'ffy' : leg === 'backNear' ? 'bny' : 'bfy';
    p[key] += b * 0.8;
  }
}

/** Glances, ear flicks and whiskers twitching, layered over resting poses. */
function alive(p: Pose, input: ActInput, amount = 1): void {
  const { life } = input;
  p.hyaw += life.glanceYaw * amount;
  p.hpitch += life.glancePitch * amount - life.sniff * 3;
  p.lookX += life.lookX * amount;
  p.lookY += life.lookY * amount;
  p.earN += life.earN * amount * 0.5;
  p.earF += life.earF * amount * 0.5;
}

function gaze(p: Pose, input: ActInput, weight = 1): void {
  if (input.gaze) lookAt(p, input.gaze, weight);
}

/**
 * Dog-paddling: the front paws stroke in turn, down and back under the chest, and the
 * hind feet kick between them. `amp` 0..1 fades it in from floating still.
 */
function paddle(p: Pose, phase: number, amp: number): void {
  for (const leg of LEGS) {
    const front = leg.startsWith('front');
    const u = (phase - B.walk.offsets[leg]) * Math.PI * 2;
    const homeX = (front ? B.shoulder.x + 2 : B.pelvis.x - 2) + (leg.endsWith('Far') ? B.farOffset : 0);
    // Round and round: back along the bottom of the stroke, forward near the surface.
    const x = homeX + Math.cos(u) * (front ? 3.2 : 3.8) * amp;
    const y = (front ? 7.6 : 7.4) + Math.sin(u) * (front ? 2 : 1.5) * amp;
    const lean = front ? 40 + 35 * Math.sin(u) * amp : 70 + 25 * Math.sin(u) * amp;
    setPaw(p, leg, x, y, lean);
  }
  const f = phase * Math.PI * 4;
  p.py += 0.35 * Math.sin(f) * amp;
  p.sy += 0.35 * Math.sin(f + 1) * amp;
  p.hy += 0.25 * Math.sin(f + 0.6) * amp;
}

/**
 * Swimming fast: legs tucked against the body, the hind feet sculling together behind, and
 * the whole body undulating up and down, the wave running back from the head to the tail.
 */
function undulate(p: Pose, phase: number, amp: number, chase: boolean): void {
  const u = phase * Math.PI * 2;
  const deep = chase ? 1.6 : 1;
  p.py = lerp(p.py, 3.6 + 1.4 * deep * Math.sin(u + 1.3), amp);
  p.sy = lerp(p.sy, 2.8 + 1.3 * deep * Math.sin(u), amp);
  p.arch = lerp(p.arch, 1 + 2.4 * Math.sin(u + 0.6), amp);
  p.hx = lerp(p.hx, p.sx + 10.5, amp);
  p.hy = lerp(p.hy, -3.8 + deep * Math.sin(u - 0.4), amp);
  p.hpitch = lerp(p.hpitch, 6, amp);
  p.hyaw = lerp(p.hyaw, 16, amp);
  // Front paws pressed back against the chest.
  setPaw(p, 'frontNear', lerp(p.fnx, p.sx - 2.5, amp), lerp(p.fny, 7.2, amp), lerp(p.fna, 105, amp));
  setPaw(p, 'frontFar', lerp(p.ffx, p.sx - 2.5 + B.farOffset, amp), lerp(p.ffy, 7, amp), lerp(p.ffa, 105, amp));
  // Hind feet stretched out behind, sculling.
  const kick = (lag: number) => ({ x: p.px - 6.5 + 1.6 * Math.cos(u - 1 - lag), y: 4.6 + 2.2 * Math.sin(u - 1 - lag) });
  const near = kick(0);
  const far = kick(0.5);
  setPaw(p, 'backNear', lerp(p.bnx, near.x, amp), lerp(p.bny, near.y, amp), lerp(p.bna, 125, amp));
  setPaw(p, 'backFar', lerp(p.bfx, far.x + B.farOffset, amp), lerp(p.bfy, far.y, amp), lerp(p.bfa, 125, amp));
  p.tailA = lerp(p.tailA, 180 + 13 * Math.sin(u - 1.9), amp);
  p.tailStiff = lerp(p.tailStiff, 0.35, amp);
  p.earN = lerp(p.earN, -0.45, amp);
  p.earF = lerp(p.earF, -0.45, amp);
}

/** A body `length` long through `centre`, its front end raised `pitch` degrees. */
function placeBody(p: Pose, centre: { x: number; y: number }, pitch: number, length: number): void {
  const c = Math.cos((pitch * Math.PI) / 180);
  const s = Math.sin((pitch * Math.PI) / 180);
  p.px = centre.x - (c * length) / 2;
  p.py = centre.y + (s * length) / 2;
  p.sx = centre.x + (c * length) / 2;
  p.sy = centre.y - (s * length) / 2;
}

/** A point `a` along the body from its middle and `b` above it, for a body pitched up `pitch` degrees. */
function onBody(centre: { x: number; y: number }, pitch: number, a: number, b: number): { x: number; y: number } {
  const c = Math.cos((pitch * Math.PI) / 180);
  const s = Math.sin((pitch * Math.PI) / 180);
  return { x: centre.x + a * c - b * s, y: centre.y - a * s - b * c };
}

/**
 * Porpoising: an arc right out of the water and back in, nose first. The body follows its
 * own path, nose up on the way out and down on the way in, legs tucked, tail trailing.
 */
function porpoise(t: number): Pose {
  const p = swim();
  const u = clamp01(t / LEAP_MS);
  const length = B.shoulder.x - B.pelvis.x;
  const height = 15;
  const centre = { x: 0, y: 5 - height * 4 * u * (1 - u) };
  const pitch = lerp(38, -42, smooth(u));
  placeBody(p, centre, pitch, length);
  p.arch = 3.5;
  const head = onBody(centre, pitch - 6, length / 2 + 9, 2.5);
  p.hx = head.x;
  p.hy = head.y;
  p.hpitch = 4;
  p.hyaw = 14;
  const fp = onBody(centre, pitch, length / 2 - 3, -5.5);
  setPaw(p, 'frontNear', fp.x, fp.y, 100 - pitch);
  setPaw(p, 'frontFar', fp.x + B.farOffset, fp.y + 0.4, 100 - pitch);
  const hp = onBody(centre, pitch, -length / 2 - 6, -2.5);
  setPaw(p, 'backNear', hp.x, hp.y, 120 - pitch);
  setPaw(p, 'backFar', hp.x + B.farOffset, hp.y + 0.6, 120 - pitch);
  // The tail follows the body round its arc, after it into the water.
  p.tailA = lerp(176, 138, smooth(u));
  p.tailBend = 0.4;
  p.tailStiff = 0.55;
  p.earN = -0.7;
  p.earF = -0.7;
  p.lids = -0.2;
  return p;
}

export function otterAct(input: ActInput): Act {
  const { animation, t, clock } = input;
  const flags = noFlags();

  switch (animation) {
    case 'idle': {
      // Treads water to look about, then lies back and floats.
      const lie = span(t, 2400, 3300);
      const p = mix(tread(), onBack(), lie);
      const kick = (1 - lie) * 1;
      const u = (clock / 900) * Math.PI * 2;
      p.fnx += Math.cos(u) * 1.2 * kick;
      p.fny += Math.sin(u) * 0.8 * kick;
      p.ffx += Math.cos(u + Math.PI) * 1.2 * kick;
      p.ffy += Math.sin(u + Math.PI) * 0.8 * kick;
      p.bny += Math.sin(u * 0.8) * 1.5 * kick;
      p.bfy += Math.sin(u * 0.8 + Math.PI) * 1.5 * kick;
      breathe(p, clock, 3000, 0.8);
      bob(p, clock, 0.6);
      alive(p, input);
      gaze(p, input);
      return { pose: p, flags };
    }

    case 'walk': {
      const p = swim();
      const amp = clamp01(input.speed / 18);
      paddle(p, input.phase, amp);
      p.tailSide = wave(input.phase, 1, 0.3) * 0.18 * amp;
      p.lookX = 0.2;
      alive(p, input, 0.5);
      return { pose: p, flags };
    }

    case 'run':
    case 'chase': {
      const p = swim();
      const amp = clamp01(input.speed / 18);
      undulate(p, input.phase, amp, animation === 'chase');
      p.pupil = 1;
      p.lookX = 0.4;
      return { pose: p, flags };
    }

    case 'leap':
      return { pose: porpoise(t), flags };

    case 'jump':
      return lunge(input);

    case 'sit': {
      // Floating on its back, rubbing its paws together now and then.
      const p = onBack();
      const rub = Math.max(0, Math.sin((t / 5200) * Math.PI * 2)) ** 2;
      const w = wave(t, 260) * rub;
      p.fnx += w * 1.2;
      p.ffx -= w * 1.2;
      p.fny -= rub * 0.6;
      p.ffy -= rub * 0.6;
      breathe(p, clock, 3400, 1);
      bob(p, clock, 0.5);
      alive(p, input);
      gaze(p, input);
      return { pose: p, flags };
    }

    case 'groom':
      return groom(input);

    case 'yawn': {
      const p = onBack();
      breathe(p, clock, 3400, 0.8);
      bob(p, clock, 0.4);
      const open = span(t, 250, 900) * (1 - span(t, 1500, 1950));
      p.hpitch = lerp(-6, -24, open);
      p.hy -= 1.5 * open;
      p.mouth = open;
      p.tongue = open * 0.5;
      p.lids = lerp(0.2, 1, span(t, 150, 600)) * (1 - 0.3 * span(t, 1900, 2200));
      p.earN = -0.5 * open;
      p.earF = -0.5 * open;
      // A stretch: the hind feet push up and out.
      p.bny -= 2 * open;
      p.bnx += 1 * open;
      p.bfy -= 1.5 * open;
      return { pose: p, flags };
    }

    case 'sleep':
      return sleep(input);

    case 'peek':
      return peek(input);

    case 'surprised': {
      // Straight up out of the water to see what that was.
      const p = tread();
      const up = easeOut(t / 220);
      p.sy -= 4 * up;
      p.sx -= 1 * up;
      p.hy -= 6 * up;
      p.hpitch = 0;
      p.hyaw = 60;
      p.earN = -0.8;
      p.earF = -0.8;
      p.lids = -0.6;
      p.pupil = 1;
      p.puff = 0.5 * up;
      setPaw(p, 'frontNear', 13, -6 * up, 20);
      setPaw(p, 'frontFar', 13 + B.farOffset, -6 * up, 20);
      p.squash = 1 + 0.05 * bump(t / 300);
      return { pose: p, flags };
    }

    case 'confused': {
      // Up out of the water, head tilted one way and then the other.
      const p = tread();
      const side = Math.sign(wave(t, 3600, 0.15)) || 1;
      const tilt = Math.min(1, Math.abs(wave(t, 3600, 0.15)) * 1.6);
      p.hroll = 18 * side * tilt;
      p.hyaw = 64;
      p.earN = side > 0 ? -0.4 * tilt : 0.3;
      p.earF = side > 0 ? 0.3 : -0.4 * tilt;
      p.lookX = 0.3 * side;
      breathe(p, clock, 3000, 0.8);
      bob(p, clock, 0.6);
      gaze(p, input, 0.6);
      return { pose: p, flags };
    }

    case 'dangle':
      return dangle(input);

    case 'happy':
      return happy(input);

    case 'bat':
      return nudge(input);

    // Only raccoons carry a toy about in their hands: an otter just flicks it away.
    case 'toss':
    case 'lift':
    case 'throw':
      return toss(input);

    case 'carry':
      return otterAct({ ...input, animation: 'walk' });

    case 'work': {
      // Treading water at its desk, paws up on the keyboard, typing.
      const p = tread();
      const k = typing(clock);
      breathe(p, clock, 3000, 0.6);
      bob(p, clock, 0.4);
      p.sy -= 2;
      p.hy -= 2;
      p.hx += 1;
      p.hpitch = lerp(0, -10, k.pause);
      p.hyaw = 24;
      p.lookX = 0.6;
      const D = B.desk;
      setPaw(p, 'frontNear', D.x + 1, D.y - k.near * 1.8, -60);
      setPaw(p, 'frontFar', D.x - 1, D.y - k.far * 1.8, -60);
      p.earN = 0.3;
      p.earF = 0.3;
      return { pose: p, flags: { ...flags, pawUp: true } };
    }

    case 'attention': {
      // Bobbing up out of the water, waving both paws over its head.
      const p = tread();
      const hop = Math.abs(Math.sin((t / 600) * Math.PI));
      p.sy -= 3 + hop * 2;
      p.hy -= 3 + hop * 2;
      p.py -= hop;
      p.hyaw = 75;
      const wave = Math.sin((t / 300) * Math.PI * 2);
      setPaw(p, 'frontNear', p.sx + 4 + wave * 2, p.sy - 7, -150);
      setPaw(p, 'frontFar', p.sx + 2 - wave * 2, p.sy - 6.5, -150);
      p.mouth = 0.3;
      p.earN = 0.6;
      p.earF = 0.6;
      return { pose: p, flags: { ...flags, pawUp: true } };
    }
  }
}

/** A bonk with the nose: it surges along the surface at the block and sends it skimming. */
function nudge(input: ActInput): Act {
  const { t, clock } = input;
  const hit = PLAY.batHitMs;
  const end = PLAY.batMs;
  const p = swim();
  const lunge = keyed(t, [[0, 0], [150, -0.4], [hit, 1], [hit + 170, 0.6], [end, 0]]);
  p.hx += 5 * lunge;
  p.hy += 1.5 * lunge;
  p.hpitch += 14 * lunge;
  p.sx += 1.5 * lunge;
  p.px += 1 * lunge;
  p.hyaw = 18;
  p.earN = -0.3;
  p.earF = -0.3;
  p.pupil = 1;
  p.lookX = 0.4;
  paddle(p, clock / 900, 0.4);
  return { pose: p, flags: noFlags() };
}

/** Ducks its head to take the block, rears up out of the water with it, and flicks it away. */
function toss(input: ActInput): Act {
  const { t, clock } = input;
  const { tossGrabMs: grab, tossReleaseMs: release, tossMs: end } = PLAY;
  const wind = release - 230;
  const up = keyed(t, [[grab + 40, 0], [wind, 1], [release + 150, 0.8], [end, 0]]);
  const p = mix(swim(), tread(), up);
  p.hx += keyed(t, [[0, 0], [grab, 4], [grab + 60, 4], [wind, -3], [release, 2], [end, 0]]);
  p.hy += keyed(t, [[0, 0], [grab, -0.5], [wind, -3], [release, -2], [end, 0]]);
  p.hpitch = keyed(t, [[0, -4], [grab, 12], [grab + 60, 12], [wind, -35], [release, -5], [end, -4]]);
  p.hyaw = 20;
  p.earN = keyed(t, [[0, 0], [wind, -0.3], [release, 0.5], [end, 0]]);
  p.earF = p.earN;
  p.lookY = keyed(t, [[0, 0.2], [grab, 0.6], [wind, -0.5], [release + 100, -0.6], [end, 0]]);
  p.mouth = keyed(t, [[grab - 120, 0], [grab, 0.25], [release, 0.25], [release + 120, 0.1], [end, 0]]);
  breathe(p, clock, 3000, 0.6);
  return { pose: p, flags: noFlags() };
}

/** A lunge at something: a dip to gather, then a surge out of the water with the paws reaching. */
function lunge(input: ActInput): Act {
  const { t } = input;
  const flags = noFlags();
  const p = swim();
  const dip = span(t, 0, 160) * (1 - span(t, 170, 300));
  const surge = span(t, 160, 360) * (1 - span(t, 520, 820));
  p.py += 3 * dip - 2 * surge;
  p.sy += 4 * dip - 9 * surge;
  p.hy += 5 * dip - 13 * surge;
  p.hx += 4 * surge;
  p.hpitch = 10 * dip - 12 * surge;
  p.hyaw = 20;
  setPaw(p, 'frontNear', lerp(p.fnx, p.sx + 7, surge), lerp(p.fny, -6, surge), lerp(p.fna, -30, surge));
  setPaw(p, 'frontFar', lerp(p.ffx, p.sx + 5.5, surge), lerp(p.ffy, -4.5, surge), lerp(p.ffa, -30, surge));
  setPaw(p, 'backNear', p.px - 6, 5, 125);
  setPaw(p, 'backFar', p.px - 6.5 + B.farOffset, 5.5, 125);
  p.earN = 0.5;
  p.earF = 0.5;
  p.lids = -0.3;
  p.pupil = 1;
  p.tailA = 180 + 12 * surge;
  return { pose: p, flags };
}

/** On its back, washing: rubbing its face with both paws, then its chest. */
function groom(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  const p = onBack();
  flags.pawUp = true;
  breathe(p, clock, 3400, 0.6);
  bob(p, clock, 0.4);
  const raise = span(t, 0, 400);
  const cycle = 3600;
  const u = (t % cycle) / cycle;
  // 0..0.6: scrubbing the face; then the chest.
  const face = u < 0.6;
  const scrub = wave(t, 420);
  const reach = face ? 1 : 0;
  const fx = lerp(p.sx - 2.5, p.sx + 4.5, reach);
  const fy = lerp(-8.6, -11.5, reach);
  setPaw(p, 'frontNear', lerp(p.fnx, fx + scrub * 1.4, raise), lerp(p.fny, fy - Math.abs(scrub) * 1.2, raise), lerp(95, face ? 40 : 95, raise));
  setPaw(p, 'frontFar', lerp(p.ffx, fx - 1 - scrub * 1.4, raise), lerp(p.ffy, fy + 0.4 - Math.abs(scrub) * 1.2, raise), lerp(95, face ? 40 : 95, raise));
  p.hpitch = lerp(-6, face ? 18 : 4, raise);
  p.hx = lerp(p.hx, face ? p.sx + 6 : p.hx, raise);
  p.hy = lerp(p.hy, face ? -8.5 : p.hy, raise);
  p.hroll = face ? scrub * 8 * raise : 0;
  p.lids = 0.9;
  p.earN = face ? -0.5 : 0;
  p.earF = face ? -0.5 : 0;
  return { pose: p, flags };
}

/** Asleep floating on its back, paws folded over its chest, slowly bobbing. */
function sleep(input: ActInput): Act {
  const { clock, life } = input;
  const flags = noFlags();
  const p = onBack();
  breathe(p, clock, 4400, 1.6);
  bob(p, clock, 0.5);
  p.hpitch = -10;
  p.hy += 1;
  p.hyaw = 58;
  p.hroll = -8;
  p.lids = 1;
  setPaw(p, 'frontNear', p.sx - 2, -9, 80);
  setPaw(p, 'frontFar', p.sx - 3.2, -8.8, 80);
  p.earN = -0.2 + life.earN * 0.4;
  p.earF = -0.2;
  return { pose: p, flags };
}

/**
 * Peeking over the bottom edge, out of the water, chin and paws on the edge. He faces you,
 * so a step towards you shows DEPTH lower on the screen, which the paws and head allow for.
 */
function peek(input: ActInput): Act {
  const { keystrokes, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  flags.pawUp = true;
  const p = swim();
  const edge = B.peekEdge;
  const R = B.head.r;
  p.px = -6;
  p.py = -5;
  p.sx = -1;
  p.sy = -19;
  p.arch = 2;
  p.hx = 3;
  p.hy = edge - R * 0.8 - 3 * DEPTH;
  p.hpitch = 4;
  p.hyaw = 90;
  const pawA = 5.5;
  p.fspread = 5.5;
  setPaw(p, 'frontNear', pawA, edge - 0.3 - pawA * DEPTH, 92);
  setPaw(p, 'frontFar', pawA, edge - 0.3 - pawA * DEPTH, 92);
  setPaw(p, 'backNear', -4, 0, 60);
  setPaw(p, 'backFar', -4, 0, 60);
  p.tailA = 170;
  p.tailStiff = 0.3;
  breathe(p, clock, 3000, 0.5);
  const k = keystrokes;
  p.lookX = Math.sin(k * 1.7) * 0.55;
  p.lookY = 0.35 + Math.cos(k * 2.3) * 0.2;
  p.hroll = Math.sin(k * 0.9) * 6;
  p.earN = 0.4 + input.life.earN;
  p.earF = 0.4 + input.life.earF;
  return { pose: p, flags };
}

/** Held up by the scruff out of the water: a long, limp otter, swinging, tail hanging. */
function dangle(input: ActInput): Act {
  const { swing, clock } = input;
  const flags = noFlags();
  flags.noShadow = true;
  const p = swim();
  p.rot = swing;
  p.sx = 5;
  p.sy = -42;
  p.px = -1;
  p.py = -12;
  p.arch = -2.5;
  p.hx = 12;
  p.hy = -50;
  p.hpitch = 20;
  p.hyaw = 70;
  const hang = (-swing * 0.8 * Math.PI) / 180;
  const drop = (x: number, y: number, length: number) => ({ x: x - Math.sin(hang) * length, y: y + Math.cos(hang) * length });
  const kick = Math.max(0, wave(clock, 2400)) * 1.5;
  const fn = drop(9, -38, 9);
  const ff = drop(7, -38, 9);
  const bn = drop(1, -12, 10);
  const bf = drop(-1.5, -12, 10);
  setPaw(p, 'frontNear', fn.x, fn.y, -10);
  setPaw(p, 'frontFar', ff.x, ff.y - 0.5, -10);
  setPaw(p, 'backNear', bn.x + kick, bn.y - kick, 40);
  setPaw(p, 'backFar', bf.x, bf.y, 40);
  p.tailA = 175;
  p.tailBend = 1;
  p.tailStiff = 0.2;
  p.earN = -0.3;
  p.earF = -0.3;
  p.lookY = 0.4;
  p.lids = 0.1;
  return { pose: p, flags };
}

/**
 * Being stroked, and loving it: rolled on its back, wriggling from side to side, paws
 * rubbing its cheeks, eyes squeezed shut.
 */
function happy(input: ActInput): Act {
  const { t, clock } = input;
  const flags = noFlags();
  const p = onBack();
  flags.pawUp = true;
  breathe(p, clock, 1400, 1.2);
  const wriggle = wave(t, 1500) * span(t, 200, 700);
  p.roll = 1 - 0.18 * Math.abs(wriggle);
  p.hroll = wriggle * 16;
  p.hturn = wriggle * 14;
  p.hpitch = 2;
  p.hx = p.sx + 6.5;
  p.hy = -9;
  p.arch = -1.5 + Math.abs(wriggle) * 2;
  const cheeks = span(t, 0, 380);
  const rub = wave(t, 520);
  setPaw(p, 'frontNear', lerp(p.fnx, p.sx + 4 + rub, cheeks), lerp(p.fny, -11 + Math.abs(rub), cheeks), lerp(95, 30, cheeks));
  setPaw(p, 'frontFar', lerp(p.ffx, p.sx + 3 - rub, cheeks), lerp(p.ffy, -10.5 + Math.abs(rub), cheeks), lerp(95, 30, cheeks));
  // Hind feet paddling the air.
  p.bny += wave(t, 600) * 1.5;
  p.bfy += wave(t, 600, 0.5) * 1.5;
  p.happy = span(t, 80, 450);
  p.lids = 0.9;
  p.earN = -0.3;
  p.earF = -0.3;
  p.tailA = 180 + wriggle * 8;
  return { pose: p, flags };
}
