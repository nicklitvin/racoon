import type { AnimationName, AnimationSpec } from './types';

/**
 * Moments in the toy animations that the behaviour and the drawings must agree on, ms
 * from the start: when a swat's paw meets the toy, when a toss picks it up and lets go,
 * when a lift picks it up (to carry it off), when a throw from carrying lets go, how long
 * a hop into or out of the trash can takes, and popping up out of it.
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
  climbMs: 560,
  emergeMs: 650,
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
  angry: { fps: 30, durationMs: 800, loop: true, eyes: 'open' },
  stalk: { fps: 60, durationMs: 700, loop: true, eyes: 'wide' },
  sniff: { fps: 20, durationMs: 1200, loop: true, eyes: 'open' },
  nudge: { fps: 60, durationMs: 600, loop: true, eyes: 'open' },
  fetch: { fps: 60, durationMs: 600, loop: true, eyes: 'open' },
  climb: { fps: 60, durationMs: PLAY.climbMs, loop: false, eyes: 'wide' },
  rummage: { fps: 30, durationMs: 1200, loop: true, eyes: 'closed' },
  emerge: { fps: 60, durationMs: PLAY.emergeMs, loop: false, eyes: 'open' },
};

/** The animations there were before the toy games and the trash can. */
export type ClassicAnimation = Exclude<AnimationName, 'stalk' | 'sniff' | 'nudge' | 'fetch' | 'climb' | 'rummage' | 'emerge'>;

const NEAREST_CLASSIC: Record<Exclude<AnimationName, ClassicAnimation>, ClassicAnimation> = {
  stalk: 'walk',
  sniff: 'idle',
  nudge: 'walk',
  fetch: 'walk',
  climb: 'jump',
  rummage: 'idle',
  emerge: 'idle',
};

/** For drawings made before the newer animations (the lifelike and retired pets): the nearest one they have. */
export function classic(animation: AnimationName): ClassicAnimation {
  return animation in NEAREST_CLASSIC ? NEAREST_CLASSIC[animation as keyof typeof NEAREST_CLASSIC] : (animation as ClassicAnimation);
}
