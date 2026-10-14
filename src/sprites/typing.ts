/**
 * How a pet types, shared by every drawing: bursts of quick taps, the paws taking turns,
 * then a pause to think (or to read what it wrote), and on again. Driven by the clock, so
 * it never jumps when the animation loops.
 */
export interface Typing {
  /** How far each front paw is lifted off the keys, 0..1. */
  near: number;
  far: number;
  /** 0 typing away .. 1 stopped to think. */
  pause: number;
}

const CYCLE_MS = 7400;
const TAPS_PER_S = 3.4;

export function typing(clock: number): Typing {
  const u = (((clock % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
  // Thinking from about 60% to 80% of the way round, easing in and out.
  const pause = window(u, 0.58, 0.64, 0.76, 0.82);
  const busy = 1 - pause;
  const a = (clock / 1000) * TAPS_PER_S * Math.PI * 2;
  // Each paw taps at its own slightly wandering pace, so it never looks mechanical.
  const near = busy * Math.max(0, Math.sin(a)) ** 0.7;
  const far = busy * Math.max(0, Math.sin(a * 1.13 + 2.2)) ** 0.7;
  return { near, far, pause };
}

/** 0 before `a`, rising to 1 by `b`, holding until `c`, back to 0 by `d`. */
function window(u: number, a: number, b: number, c: number, d: number): number {
  const s = (x: number) => x * x * (3 - 2 * x);
  if (u <= a || u >= d) return 0;
  if (u < b) return s((u - a) / (b - a));
  if (u <= c) return 1;
  return s(1 - (u - c) / (d - c));
}
