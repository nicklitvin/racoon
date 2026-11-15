import Foundation

/// Moments in the toy animations that the behaviour and the drawings must agree on, ms
/// from the start: when a swat's paw meets the toy, when a toss picks it up and lets go,
/// when a lift picks it up (to carry it off), and when a throw from carrying lets go.
public enum PLAY {
    public static let batMs = 650.0
    public static let batHitMs = 230.0
    public static let tossMs = 1250.0
    public static let tossGrabMs = 380.0
    public static let tossReleaseMs = 840.0
    public static let liftMs = 1000.0
    public static let liftGrabMs = 380.0
    public static let throwMs = 950.0
    public static let throwReleaseMs = 450.0
}

/// Timing for every animation. Moving animations redraw every frame; resting ones only a few
/// times a second.
public let ANIMATIONS: [AnimationName: AnimationSpec] = [
    .idle: AnimationSpec(fps: 6, durationMs: 12_000, loop: true, eyes: .open),
    .walk: AnimationSpec(fps: 60, durationMs: 600, loop: true, eyes: .open),
    .run: AnimationSpec(fps: 60, durationMs: 340, loop: true, eyes: .open),
    .jump: AnimationSpec(fps: 60, durationMs: 400, loop: false, eyes: .wide),
    .leap: AnimationSpec(fps: 60, durationMs: 420, loop: false, eyes: .wide),
    .sit: AnimationSpec(fps: 6, durationMs: 12_000, loop: true, eyes: .open),
    .groom: AnimationSpec(fps: 10, durationMs: 1000, loop: true, eyes: .closed),
    .yawn: AnimationSpec(fps: 12, durationMs: 2200, loop: false, eyes: .closed),
    .peek: AnimationSpec(fps: 1, durationMs: 1000, loop: true, eyes: .open, driver: .keystrokes),
    .sleep: AnimationSpec(fps: 4, durationMs: 3200, loop: true, eyes: .closed),
    .chase: AnimationSpec(fps: 60, durationMs: 300, loop: true, eyes: .wide),
    .surprised: AnimationSpec(fps: 30, durationMs: 450, loop: false, eyes: .wide),
    .confused: AnimationSpec(fps: 4, durationMs: 1800, loop: true, eyes: .open),
    .dangle: AnimationSpec(fps: 30, durationMs: 1400, loop: true, eyes: .open),
    .happy: AnimationSpec(fps: 30, durationMs: 1200, loop: true, eyes: .closed),
    .bat: AnimationSpec(fps: 60, durationMs: PLAY.batMs, loop: false, eyes: .wide),
    .toss: AnimationSpec(fps: 60, durationMs: PLAY.tossMs, loop: false, eyes: .open),
    .lift: AnimationSpec(fps: 60, durationMs: PLAY.liftMs, loop: false, eyes: .open),
    .carry: AnimationSpec(fps: 60, durationMs: 700, loop: true, eyes: .open),
    .throw: AnimationSpec(fps: 60, durationMs: PLAY.throwMs, loop: false, eyes: .open),
    .work: AnimationSpec(fps: 20, durationMs: 6000, loop: true, eyes: .open),
    .browse: AnimationSpec(fps: 20, durationMs: 6000, loop: true, eyes: .open),
    .reels: AnimationSpec(fps: 20, durationMs: 6000, loop: true, eyes: .open),
    .attention: AnimationSpec(fps: 30, durationMs: 1200, loop: true, eyes: .open),
    .angry: AnimationSpec(fps: 30, durationMs: 800, loop: true, eyes: .open),
    .stalk: AnimationSpec(fps: 60, durationMs: 700, loop: true, eyes: .wide),
    .sniff: AnimationSpec(fps: 20, durationMs: 1200, loop: true, eyes: .open),
    .nudge: AnimationSpec(fps: 60, durationMs: 600, loop: true, eyes: .open),
    .fetch: AnimationSpec(fps: 60, durationMs: 600, loop: true, eyes: .open),
]

/// The timing for an animation (every animation has one).
public func spec(_ name: AnimationName) -> AnimationSpec { ANIMATIONS[name]! }

// MARK: - Typing (src/sprites/typing.ts)

/// How a pet types, shared by every drawing: bursts of quick taps, the paws taking turns,
/// then a pause to think (or to read what it wrote), and on again. Driven by the clock, so
/// it never jumps when the animation loops.
public struct Typing {
    /// How far each front paw is lifted off the keys, 0..1.
    public var near: Double
    public var far: Double
    /// 0 typing away .. 1 stopped to think.
    public var pause: Double
}

/// How long each reel plays before it's flicked away for the next (the screen and his paw keep time).
public let REEL_MS = 2400.0

public struct Reel {
    public var into: Double
    public var flick: Double
    public var funny: Bool
    public var index: Int
}

/// Watching reels: how far through this one, how hard he's flicking the mouse for the next
/// (0..1, at the end of each), and whether this one's funny.
public func reel(_ clock: Double) -> Reel {
    let index = floor(clock / REEL_MS)
    let into = jsMod(clock / REEL_MS, 1)
    let flick = into > 0.8 ? sin(((into - 0.8) / 0.2) * Double.pi) : 0
    let h = imul(toInt32(index + 7), toInt32(2_654_435_761))
    let funny = UInt32(bitPattern: h) % 5 < 2
    return Reel(into: into, flick: flick, funny: funny, index: Int(index))
}

private let CYCLE_MS = 7400.0
private let TAPS_PER_S = 3.4

public func typing(_ clock: Double) -> Typing {
    let u = jsMod(jsMod(clock, CYCLE_MS) + CYCLE_MS, CYCLE_MS) / CYCLE_MS
    // Thinking from about 60% to 80% of the way round, easing in and out.
    let pause = window(u, 0.58, 0.64, 0.76, 0.82)
    let busy = 1 - pause
    let a = (clock / 1000) * TAPS_PER_S * Double.pi * 2
    // Each paw taps at its own slightly wandering pace, so it never looks mechanical.
    let near = busy * pow(Swift.max(0, sin(a)), 0.7)
    let far = busy * pow(Swift.max(0, sin(a * 1.13 + 2.2)), 0.7)
    return Typing(near: near, far: far, pause: pause)
}

/// 0 before `a`, rising to 1 by `b`, holding until `c`, back to 0 by `d`.
private func window(_ u: Double, _ a: Double, _ b: Double, _ c: Double, _ d: Double) -> Double {
    func s(_ x: Double) -> Double { x * x * (3 - 2 * x) }
    if u <= a || u >= d { return 0 }
    if u < b { return s((u - a) / (b - a)) }
    if u <= c { return 1 }
    return s(1 - (u - c) / (d - c))
}
