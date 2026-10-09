import type { AnimationName, AnimationSpec } from './types';

/**
 * Timing for every animation. The shapes themselves come from `poseFor` in pose.ts.
 * Moving animations redraw every frame; resting ones only a few times a second.
 */
export const ANIMATIONS: Record<AnimationName, AnimationSpec> = {
  idle: { fps: 6, durationMs: 12_000, loop: true, eyes: 'open' },
  walk: { fps: 60, durationMs: 600, loop: true, eyes: 'open' },
  run: { fps: 60, durationMs: 340, loop: true, eyes: 'open' },
  jump: { fps: 60, durationMs: 400, loop: false, eyes: 'wide' },
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
};
