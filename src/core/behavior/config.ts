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
  /** How long an excited leap mid-run lasts; he flies straight on through it. */
  leapMs: number;
  /** Time between one leap and the next while chasing or dashing about. */
  leapEvery: Range;
}

export interface WanderConfig {
  /** Length of a single walk. */
  walkDistance: Range;
  /** Each walk's top speed varies by up to ± this fraction of `motion.walkSpeed`. */
  speedJitter: number;
  /** How far a walk bows to one side, as a fraction of its length, so paths aren't ruler-straight. */
  curve: number;
  /**
   * The screen is a floor seen from a little above, so a step towards or away from you
   * covers this fraction of the screen distance of a step across. Walks up and down the
   * screen go that much slower, so his pace looks the same every way he walks.
   */
  floorDepth: number;
  /** Standing still between one activity and the next. */
  pauseMs: Range;
  /** Chance that the next activity is sitting down (grooming, yawning or resting). */
  sitChance: number;
  /** How long a sit lasts (a yawn always takes as long as the yawn). */
  sitMs: Range;
  /** Chance that the next activity is just turning round and looking about. */
  lookAroundChance: number;
  /** Chance that the next activity is a mad dash about the screen, leaping as he goes ("zoomies"). */
  zoomiesChance: number;
  /** How many dashes, each in a new direction, before he stops. */
  zoomiesDashes: Range;
  /**
   * Calm time after which he takes a nap: he goes and curls up next to the pointer, or
   * somewhere out of the way, yawns and falls asleep.
   */
  sleepAfterMs: number;
  /** He naps next to the pointer only if it has been still at least this long (you're reading, say). */
  napByCursorAfterMs: number;
  /** Chance that the next activity is playing with one of the toy blocks, if there are any. */
  playChance: number;
}

export interface PlayConfig {
  /** How many swats and throws a game lasts. */
  turns: Range;
  /** Chance that a turn is picking the block up and throwing it, rather than swatting it. */
  tossChance: number;
  /** Chance of pouncing on a block from a little way off, rather than walking up to it. */
  pounceChance: number;
  /** How hard a swat sends a block along the floor, and how high it hops, px/s. */
  batSpeed: Range;
  batLift: Range;
  /** How fast a throw sends a block out, and up, px/s. */
  tossSpeed: Range;
  tossLift: Range;
  /**
   * For animals that can carry a block in their hands (raccoons): the chance that a throw
   * is picking it up and walking off with it on his hind legs first, and how far he takes it.
   */
  carryChance: number;
  carryDistance: Range;
  /** Running at least this fast (px/s), he kicks any block in his way. */
  kickSpeed: number;
  /** Waiting for you to throw a block you've picked up, he gives up after this long. */
  waitMs: number;
  /**
   * Of the turns that aren't throws, how likely each other thing is: a swat, a good sniff
   * at it first, nosing it along the floor, or trotting off with it in his mouth (a raccoon
   * walks off with it in his hands instead).
   */
  moves: { bat: number; sniff: number; nudge: number; fetch: number };
  /** Chance that a pounce starts with creeping up on the block, low to the ground. */
  stalkChance: number;
  /** A long way from a block, the chance of charging straight through it and kicking it on. */
  chargeChance: number;
  /** How many pushes he gives a block he's nosing along, and how far he trots off with one. */
  nudges: Range;
  fetchDistance: Range;
}

/** What he can be doing at his computer. */
export type DeskTask = 'terminal' | 'web' | 'reels';

export interface WorkConfig {
  /**
   * What he does at the computer, switching from one to another: how likely each is to be
   * next, and how long it lasts. He always starts in the terminal.
   */
  tasks: Record<DeskTask, { weight: number; ms: Range }>;
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
  play: PlayConfig;
  work: WorkConfig;
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
    leapMs: 420,
    leapEvery: { min: 900, max: 2600 },
  },
  wander: {
    walkDistance: { min: 120, max: 520 },
    speedJitter: 0.15,
    curve: 0.2,
    floorDepth: 0.55,
    pauseMs: { min: 2500, max: 7000 },
    sitChance: 0.25,
    sitMs: { min: 3000, max: 7000 },
    lookAroundChance: 0.15,
    zoomiesChance: 0.06,
    zoomiesDashes: { min: 2, max: 4 },
    sleepAfterMs: 3 * 60_000,
    napByCursorAfterMs: 4000,
    playChance: 0.14,
  },
  reactions: {
    fleeRadius: 90,
    fleeChance: 0.6,
    pounceAfterStillMs: 450,
    chaseMaxMs: 25_000,
  },
  play: {
    turns: { min: 2, max: 5 },
    tossChance: 0.45,
    pounceChance: 0.35,
    batSpeed: { min: 230, max: 430 },
    batLift: { min: 140, max: 300 },
    tossSpeed: { min: 260, max: 430 },
    tossLift: { min: 480, max: 680 },
    carryChance: 0.6,
    carryDistance: { min: 110, max: 280 },
    kickSpeed: 260,
    waitMs: 9000,
    moves: { bat: 0.4, sniff: 0.2, nudge: 0.2, fetch: 0.2 },
    stalkChance: 0.5,
    chargeChance: 0.3,
    nudges: { min: 3, max: 5 },
    fetchDistance: { min: 120, max: 300 },
  },
  work: {
    // A tab for 15-30 seconds, then another: mostly code, some browsing, a few reels.
    tasks: {
      terminal: { weight: 0.4, ms: { min: 15_000, max: 30_000 } },
      web: { weight: 0.35, ms: { min: 15_000, max: 30_000 } },
      reels: { weight: 0.25, ms: { min: 15_000, max: 30_000 } },
    },
  },
};

export type ConfigOverrides = { [K in keyof BehaviorConfig]?: Partial<BehaviorConfig[K]> };

/** The default config with some values replaced. */
export function withConfig(overrides: ConfigOverrides, base: BehaviorConfig = DEFAULT_CONFIG): BehaviorConfig {
  return {
    motion: { ...base.motion, ...overrides.motion },
    wander: { ...base.wander, ...overrides.wander },
    reactions: { ...base.reactions, ...overrides.reactions },
    play: { ...base.play, ...overrides.play },
    work: { ...base.work, ...overrides.work },
  };
}

/** A random value in `range`, using an injected random source. */
export function pick(range: Range, random: () => number): number {
  return range.min + random() * (range.max - range.min);
}
