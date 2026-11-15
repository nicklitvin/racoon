import Foundation

// Tuning for the behaviour state machine (src/core/behavior/config.ts). Plain data, grouped by
// behaviour. All distances are in px, speeds in px/s, accelerations in px/s², times in ms.

public struct Range {
    public var min: Double
    public var max: Double
    public init(_ min: Double, _ max: Double) {
        self.min = min
        self.max = max
    }
}

public struct MotionConfig {
    public var walkSpeed = 85.0
    public var runSpeed = 340.0
    public var chaseSpeed = 650.0
    public var pounceSpeed = 950.0
    public var accel = 380.0
    public var runAccel = 1500.0
    public var chaseAccel = 2600.0
    /// How long an excited leap mid-run lasts; he flies straight on through it.
    public var leapMs = 420.0
    /// Time between one leap and the next while chasing or dashing about.
    public var leapEvery = Range(900, 2600)
}

public struct WanderConfig {
    /// Length of a single walk.
    public var walkDistance = Range(120, 520)
    /// Each walk's top speed varies by up to ± this fraction of `motion.walkSpeed`.
    public var speedJitter = 0.15
    /// How far a walk bows to one side, as a fraction of its length.
    public var curve = 0.2
    /// The screen is a floor seen from a little above, so a step towards or away from you
    /// covers this fraction of the screen distance of a step across.
    public var floorDepth = 0.55
    /// Standing still between one activity and the next.
    public var pauseMs = Range(2500, 7000)
    /// Chance that the next activity is sitting down (grooming, yawning or resting).
    public var sitChance = 0.25
    /// How long a sit lasts (a yawn always takes as long as the yawn).
    public var sitMs = Range(3000, 7000)
    /// Chance that the next activity is just turning round and looking about.
    public var lookAroundChance = 0.15
    /// Chance that the next activity is a mad dash about the screen ("zoomies").
    public var zoomiesChance = 0.06
    /// How many dashes, each in a new direction, before he stops.
    public var zoomiesDashes = Range(2, 4)
    /// Calm time after which he takes a nap.
    public var sleepAfterMs = 3 * 60_000.0
    /// He naps next to the pointer only if it has been still at least this long.
    public var napByCursorAfterMs = 4000.0
    /// Chance that the next activity is playing with one of the toy blocks, if there are any.
    public var playChance = 0.14
}

public struct PlayMoves {
    public var bat = 0.4
    public var sniff = 0.2
    public var nudge = 0.2
    public var fetch = 0.2
}

public struct PlayConfig {
    /// How many swats and throws a game lasts.
    public var turns = Range(2, 5)
    /// Chance that a turn is picking the block up and throwing it, rather than swatting it.
    public var tossChance = 0.45
    /// Chance of pouncing on a block from a little way off, rather than walking up to it.
    public var pounceChance = 0.35
    /// How hard a swat sends a block along the floor, and how high it hops, px/s.
    public var batSpeed = Range(230, 430)
    public var batLift = Range(140, 300)
    /// How fast a throw sends a block out, and up, px/s.
    public var tossSpeed = Range(260, 430)
    public var tossLift = Range(480, 680)
    /// For animals that can carry a block in their hands (raccoons): the chance that a throw
    /// is picking it up and walking off with it first, and how far he takes it.
    public var carryChance = 0.6
    public var carryDistance = Range(110, 280)
    /// Running at least this fast (px/s), he kicks any block in his way.
    public var kickSpeed = 260.0
    /// Waiting for you to throw a block you've picked up, he gives up after this long.
    public var waitMs = 9000.0
    /// Of the turns that aren't throws, how likely each other thing is.
    public var moves = PlayMoves()
    /// Chance that a pounce starts with creeping up on the block, low to the ground.
    public var stalkChance = 0.5
    /// A long way from a block, the chance of charging straight through it and kicking it on.
    public var chargeChance = 0.3
    /// How many pushes he gives a block he's nosing along, and how far he trots off with one.
    public var nudges = Range(3, 5)
    public var fetchDistance = Range(120, 300)
}

/// What he can be doing at his computer.
public enum DeskTask: String, CaseIterable {
    case terminal, web, reels
}

public struct WorkConfig {
    /// What he does at the computer, switching from one to another: how likely each is to be
    /// next, and how long it lasts. He always starts in the terminal. A tab for 15-30 seconds,
    /// then another: mostly code, some browsing, a few reels.
    public var tasks: [DeskTask: (weight: Double, ms: Range)] = [
        .terminal: (0.4, Range(15_000, 30_000)),
        .web: (0.35, Range(15_000, 30_000)),
        .reels: (0.25, Range(15_000, 30_000)),
    ]
}

public struct ReactionConfig {
    public var fleeRadius = 90.0
    public var fleeChance = 0.6
    public var pounceAfterStillMs = 450.0
    public var chaseMaxMs = 25_000.0
}

public struct BehaviorConfig {
    public var motion = MotionConfig()
    public var wander = WanderConfig()
    public var reactions = ReactionConfig()
    public var play = PlayConfig()
    public var work = WorkConfig()
    public init() {}
}

public let DEFAULT_CONFIG = BehaviorConfig()

/// A random value in `range`, using an injected random source.
public func pick(_ range: Range, _ random: Random) -> Double { range.min + random() * (range.max - range.min) }
