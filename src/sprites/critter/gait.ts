import type { LegName } from '../rig';
import { frac, lerp, smoother } from './kit';

/**
 * Footfall patterns. The phase advances with distance actually covered, so a paw on the
 * ground stays put on the ground instead of skating, at any speed.
 */
export interface Gait {
  /** Stride length (one full cycle) at `speed`, in drawing units. */
  stride: number;
  /** Speed the stride is tuned for, in units per second. Slower shortens the stride. */
  speed: number;
  /** Fraction of the cycle each paw is on the ground. */
  duty: number;
  /** When each paw lifts, as a fraction of the cycle. */
  offsets: Record<LegName, number>;
  /** Swing height, front and back. */
  lift: [number, number];
  /** How far the hand or foot curls back mid-swing, in degrees, front and back. */
  curl: [number, number];
  /** Body rise and fall, per pair of legs. */
  bob: number;
  /** Where the front paw's swing peaks (0..1): cats lift the front paw early and high. */
  peak: [number, number];
}

/** A paw's place in its cycle: stance plants it and slides it back as the body passes over. */
export interface Step {
  x: number;
  y: number;
  a: number;
  /** On the ground. */
  planted: boolean;
  /** 0..1 progress through the current stance or swing. */
  s: number;
}

/** Stride length at a given speed: real animals take shorter, slower steps when they slow down. */
export function strideAt(gait: Gait, speed: number): number {
  return gait.stride * Math.min(1.3, Math.max(0.4, Math.sqrt(Math.max(0, speed) / gait.speed)));
}

/**
 * Where a paw is at gait `phase` (cycles), relative to its standing spot `homeX` with the
 * hand or foot at angle `homeA`. `amp` 0..1 scales the whole movement (for starting off).
 */
export function step(gait: Gait, leg: LegName, phase: number, stride: number, homeX: number, homeA: number, amp = 1): Step {
  const front = leg.startsWith('front');
  const i = front ? 0 : 1;
  const u = frac(phase - gait.offsets[leg]);
  const sweep = gait.duty * stride * amp;
  const beta = gait.duty;
  // A paw out in front leans the bone back towards the body; as the body passes over it the
  // bone tilts forward, then rolls up onto the toes.
  const lean = (x: number) => homeA + (x - homeX) * (front ? 1.6 : 1.2);
  if (u < beta) {
    const s = u / beta;
    const x = homeX + sweep * (0.5 - s);
    const roll = smoother((s - 0.6) / 0.4) * (front ? 22 : 30) * amp;
    return { x, y: 0, a: lean(x) - roll, planted: true, s };
  }
  const s = (u - beta) / (1 - beta);
  // Reach: an eased swing, fastest mid-way, so the paw seems to float forward and settle.
  const reach = smoother(s);
  const x = homeX + sweep * (reach - 0.5);
  const peak = gait.peak[i];
  const k = s < peak ? s / peak : 1 - (s - peak) / (1 - peak);
  const arc = Math.sin((k * Math.PI) / 2) ** 1.5;
  const y = -gait.lift[i] * arc * amp;
  // Hand curls back as it lifts and unrolls to reach before touching down.
  const curl = gait.curl[i] * Math.sin(Math.PI * Math.min(1, s * 1.15)) * amp;
  const a = lerp(lean(x), homeA + (front ? 6 : 4) * amp, smoother((s - 0.55) / 0.45)) - curl;
  return { x, y, a, planted: false, s };
}

/**
 * How high a pair of legs carries the body: highest as each leg passes under it (an
 * inverted pendulum), so the hips and shoulders each rise twice a stride.
 */
export function bob(gait: Gait, phase: number, leg: LegName): number {
  const u = frac(phase - gait.offsets[leg] - gait.duty / 2);
  return Math.cos(u * Math.PI * 4);
}
