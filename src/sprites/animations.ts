import type { AnimationName, AnimationSpec } from './types';

/**
 * Moments in the toy animations that the behaviour and the drawings must agree on, ms
 * from the start: when a swat's paw meets the toy, when a toss picks it up and lets go,
 * when a lift picks it up (to carry it off), and when a throw from carrying lets go.
 */
export const PLAY = {
  batMs: 650,
  batHitMs: 230,
  tossMs: 1250,
  tossGrabMs: 380,
  tossReleaseMs: 840,
  liftMs: 1000,
  liftGrabMs: 380,
  throwMs: 950,
  throwReleaseMs: 450,
};

/**
 * Timing for every animation. The shapes themselves come from `poseFor` in pose.ts.
 * Moving animations redraw every frame; resting ones only a few times a second.
 */
export const ANIMATIONS: Record<AnimationName, AnimationSpec> = {
  idle: { fps: 6, durationMs: 12_000, loop: true, eyes: 'open' },
  walk: { fps: 60, durationMs: 600, loop: true, eyes: 'open' },
  run: { fps: 60, durationMs: 340, loop: true, eyes: 'open' },
  jump: { fps: 60, durationMs: 400, loop: false, eyes: 'wide' },
  leap: { fps: 60, durationMs: 420, loop: false, eyes: 'wide' },
  sit: { fps: 6, durationMs: 12_000, loop: true, eyes: 'open' },
  groom: { fps: 10, durationMs: 1000, loop: true, eyes: 'closed' },
  yawn: { fps: 12, durationMs: 2200, loop: false, eyes: 'closed' },
  peek: { fps: 1, durationMs: 1000, loop: true, eyes: 'open', driver: 'keystrokes' },
  sleep: { fps: 4, durationMs: 3200, loop: true, eyes: 'closed' },
  chase: { fps: 60, durationMs: 300, loop: true, eyes: 'wide' },
  surprised: { fps: 30, durationMs: 450, loop: false, eyes: 'wide' },
  confused: { fps: 4, durationMs: 1800, loop: true, eyes: 'open' },
  dangle: { fps: 30, durationMs: 1400, loop: true, eyes: 'open' },
  happy: { fps: 30, durationMs: 1200, loop: true, eyes: 'closed' },
  bat: { fps: 60, durationMs: PLAY.batMs, loop: false, eyes: 'wide' },
  toss: { fps: 60, durationMs: PLAY.tossMs, loop: false, eyes: 'open' },
  lift: { fps: 60, durationMs: PLAY.liftMs, loop: false, eyes: 'open' },
  carry: { fps: 60, durationMs: 700, loop: true, eyes: 'open' },
  throw: { fps: 60, durationMs: PLAY.throwMs, loop: false, eyes: 'open' },
  work: { fps: 20, durationMs: 6000, loop: true, eyes: 'open' },
  browse: { fps: 20, durationMs: 6000, loop: true, eyes: 'open' },
  reels: { fps: 20, durationMs: 6000, loop: true, eyes: 'open' },
  attention: { fps: 30, durationMs: 1200, loop: true, eyes: 'open' },
};
