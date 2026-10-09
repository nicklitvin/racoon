import { PEEK_SINK } from '../core/behavior/brain';
import { plantedLeg, RIG, type Leg, type Pose } from './rig';
import type { AnimationName } from './types';

/**
 * Every animation as a pure function of time (and key presses, for peek): no DOM,
 * no state. The renderer draws whatever pose comes out, and the tests check poses
 * directly, e.g. that paws stay on the ground.
 */

/** Sine wave with the given period, -1..1. */
const wave = (t: number, periodMs: number, phase = 0) => Math.sin(2 * Math.PI * (t / periodMs + phase));
/** 0..1..0 bump over `durationMs`, held at 0 afterwards. */
const bump = (t: number, durationMs: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, t / durationMs)));

const leg = (angle: number, length: number = RIG.legLength): Leg => ({ angle, length });

/** Where the bottom edge of the screen is in the drawing while peeking. */
export const PEEK_EDGE_Y = RIG.view.y + RIG.view.height * (1 - PEEK_SINK);

function standing(): Pose {
  return {
    y: 0,
    pitch: 0,
    swing: 0,
    breathe: 1,
    head: { angle: 0, x: 0, y: 0 },
    tail: { angle: 15, puff: 1 },
    legs: { frontNear: leg(0), frontFar: leg(0), backNear: leg(0), backFar: leg(0) },
    look: { x: 0, y: 0 },
    mouth: 0,
    ears: 0,
  };
}

/** Sitting up on his haunches, front paws planted. */
function sitting(t: number): Pose {
  const pose = standing();
  pose.y = 12;
  pose.pitch = -36;
  pose.head.angle = 26;
  pose.tail.angle = 40 + 5 * wave(t, 4000);
  pose.breathe = 1 + 0.025 * wave(t, 2800);
  pose.legs.backNear = leg(85, 13);
  pose.legs.backFar = leg(80, 13);
  pose.legs.frontNear = plantedLeg(pose, 'frontNear', 4);
  pose.legs.frontFar = plantedLeg(pose, 'frontFar', 8);
  return pose;
}

function gait(t: number, periodMs: number, swing: number, bob: number): Pose {
  const pose = standing();
  const s = wave(t, periodMs);
  pose.legs.frontNear = leg(swing * s);
  pose.legs.backFar = leg(swing * s);
  pose.legs.frontFar = leg(-swing * s);
  pose.legs.backNear = leg(-swing * s);
  // Two bobs per stride, one per footfall.
  pose.y = -bob * (1 - Math.cos((4 * Math.PI * t) / periodMs)) * 0.5;
  pose.head.angle = 2 * wave(t, periodMs, 0.25);
  pose.tail.angle = 18 + 5 * wave(t, periodMs * 2);
  return pose;
}

function gallop(t: number, periodMs: number): Pose {
  const pose = standing();
  const front = wave(t, periodMs);
  const back = wave(t, periodMs, 0.45);
  pose.legs.frontNear = leg(40 * front);
  pose.legs.frontFar = leg(40 * wave(t, periodMs, 0.08));
  pose.legs.backNear = leg(-38 * back);
  pose.legs.backFar = leg(-38 * wave(t, periodMs, 0.53));
  // Rocks front-down while the body is at the top of its bound, so the front paws stay on the ground.
  const rock = wave(t, periodMs, 0.25);
  pose.pitch = 6 * rock;
  pose.y = -3.5 * (1 + rock) * 0.5;
  pose.tail.angle = 8;
  pose.ears = 0.5;
  return pose;
}

export function poseFor(animation: AnimationName, t: number, keystrokes = 0): Pose {
  switch (animation) {
    case 'idle': {
      const pose = standing();
      pose.breathe = 1 + 0.025 * wave(t, 2600);
      pose.tail.angle = 15 + 6 * wave(t, 3600);
      pose.head.angle = 3 * wave(t, 6000);
      pose.look = { x: 0.5 * wave(t, 12_000), y: 0 };
      return pose;
    }

    case 'walk':
      return gait(t, 600, 24, 1.2);

    case 'run':
      return gallop(t, 340);

    case 'chase': {
      const pose = gallop(t, 300);
      pose.ears = 0.8;
      pose.head.angle = -6;
      pose.tail.angle = 25;
      return pose;
    }

    case 'jump': {
      const pose = standing();
      pose.y = -6 * bump(t, 400);
      pose.pitch = -8;
      pose.legs = { frontNear: leg(55), frontFar: leg(48), backNear: leg(-50), backFar: leg(-44) };
      pose.tail.angle = 25;
      pose.ears = 0.7;
      pose.head.angle = 6;
      return pose;
    }

    case 'surprised': {
      const pose = standing();
      const up = bump(t, 450);
      pose.y = -14 * up;
      pose.legs = { frontNear: leg(18 * up), frontFar: leg(14 * up), backNear: leg(-18 * up), backFar: leg(-14 * up) };
      pose.tail = { angle: 60, puff: 1.35 };
      pose.head.angle = -8;
      pose.look = { x: 0, y: -0.3 };
      return pose;
    }

    case 'sit': {
      const pose = sitting(t);
      pose.head.angle += 3 * wave(t, 6000);
      return pose;
    }

    case 'groom': {
      const pose = sitting(t);
      pose.head.angle += 18 + 5 * wave(t, 500);
      pose.legs.frontNear = leg(140, 15);
      return pose;
    }

    case 'yawn': {
      const pose = sitting(t);
      const open = bump(t, 2200);
      pose.mouth = open;
      pose.head.angle -= 18 * open;
      return pose;
    }

    case 'confused': {
      const pose = sitting(t);
      const side = Math.floor(t / 900) % 2 === 0 ? -1 : 1;
      pose.head.angle += -12 + (side > 0 ? 6 : -2);
      pose.look = { x: 0.8 * side, y: -0.7 };
      return pose;
    }

    case 'sleep': {
      const pose = standing();
      pose.y = 11;
      pose.breathe = 1 + 0.04 * wave(t, 3200);
      pose.legs = { frontNear: leg(80, 12), frontFar: leg(80, 12), backNear: leg(80, 10), backFar: leg(75, 10) };
      pose.head = { angle: 20, x: 0, y: 1 };
      pose.tail.angle = 2 * wave(t, 3200);
      pose.ears = 0.3;
      return pose;
    }

    case 'peek': {
      // Standing up behind the bottom edge of the screen with paws on it, eyes scanning
      // along with the typing like reading a line of text.
      const pose = standing();
      pose.pitch = -60;
      pose.head.angle = 48 + (keystrokes % 2) * 2;
      pose.legs.frontNear = plantedLeg(pose, 'frontNear', 50, PEEK_EDGE_Y);
      pose.legs.frontFar = plantedLeg(pose, 'frontFar', 55, PEEK_EDGE_Y);
      pose.ears = 0.1;
      pose.look = { x: -1 + ((keystrokes % 8) / 7) * 2, y: 0.6 };
      return pose;
    }

    case 'happy': {
      // Being petted: sits, eyes shut, leans his head up into the pat and wags.
      const pose = sitting(t);
      pose.head.angle -= 12 - 6 * wave(t, 1200);
      pose.tail.angle = 48 + 16 * wave(t, 400);
      pose.ears = 0.45;
      pose.breathe = 1 + 0.03 * wave(t, 600);
      return pose;
    }

    case 'dangle': {
      // Held by the scruff: body hanging, legs dangling straight down, gently swinging.
      const pose = standing();
      const sway = wave(t, 1400);
      pose.pitch = -70;
      pose.swing = 10 * sway;
      pose.head.angle = 58;
      const dangle = 4 * wave(t, 1400, 0.25);
      pose.legs = { frontNear: leg(dangle, 17), frontFar: leg(dangle, 17), backNear: leg(dangle, 19), backFar: leg(dangle, 19) };
      pose.tail.angle = -20 + 6 * sway;
      pose.ears = 0.2;
      pose.look = { x: 0, y: 0.3 };
      return pose;
    }
  }
}
