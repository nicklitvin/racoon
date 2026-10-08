/**
 * Tuning for the behaviour state machine. Plain data, grouped by behaviour, so timings
 * can be adjusted in one place and tests can override just the part they care about.
 * All distances are in px, speeds in px/s, accelerations in px/s², times in ms.
 */

export interface Range {
  min: number;
  max: number;
}

export interface MotionConfig {
  walkSpeed: number;
  runSpeed: number;
  chaseSpeed: number;
  pounceSpeed: number;
  accel: number;
  runAccel: number;
  chaseAccel: number;
}

export interface WanderConfig {
  /** Length of a single walk. */
  walkDistance: Range;
  /** Each walk's top speed varies by up to ± this fraction of `motion.walkSpeed`. */
  speedJitter: number;
  /** How far a walk bows to one side, as a fraction of its length, so paths aren't ruler-straight. */
  curve: number;
  /** Standing still between one activity and the next. */
  pauseMs: Range;
  /** Chance that the next activity is sitting down (grooming, yawning or resting). */
  sitChance: number;
  /** How long a sit lasts (a yawn always takes as long as the yawn). */
  sitMs: Range;
  /** Chance that the next activity is just turning round and looking about. */
  lookAroundChance: number;
  /** Calm time after which he yawns and falls asleep. */
  sleepAfterMs: number;
}

export interface ReactionConfig {
  fleeRadius: number;
  fleeChance: number;
  pounceAfterStillMs: number;
  chaseMaxMs: number;
}

export interface BehaviorConfig {
  motion: MotionConfig;
  wander: WanderConfig;
  reactions: ReactionConfig;
}

export const DEFAULT_CONFIG: BehaviorConfig = {
  motion: {
    walkSpeed: 85,
    runSpeed: 340,
    chaseSpeed: 650,
    pounceSpeed: 950,
    accel: 380,
    runAccel: 1500,
    chaseAccel: 2600,
  },
  wander: {
    walkDistance: { min: 120, max: 520 },
    speedJitter: 0.15,
    curve: 0.2,
    pauseMs: { min: 2500, max: 7000 },
    sitChance: 0.25,
    sitMs: { min: 3000, max: 7000 },
    lookAroundChance: 0.15,
    sleepAfterMs: 3 * 60_000,
  },
  reactions: {
    fleeRadius: 90,
    fleeChance: 0.6,
    pounceAfterStillMs: 450,
    chaseMaxMs: 25_000,
  },
};

export type ConfigOverrides = { [K in keyof BehaviorConfig]?: Partial<BehaviorConfig[K]> };

/** The default config with some values replaced. */
export function withConfig(overrides: ConfigOverrides, base: BehaviorConfig = DEFAULT_CONFIG): BehaviorConfig {
  return {
    motion: { ...base.motion, ...overrides.motion },
    wander: { ...base.wander, ...overrides.wander },
    reactions: { ...base.reactions, ...overrides.reactions },
  };
}

/** A random value in `range`, using an injected random source. */
export function pick(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}
