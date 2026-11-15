import Foundation

// The small pieces of the pet's behaviour: which way he faces, the animation clock, when the
// overlay takes the mouse, and how busy the pointer and the keyboard are (src/core/*.ts).

// MARK: - Heading (src/core/heading.ts)

/// Below this speed (px/s) he's standing, and keeps whatever way he faced.
private let MOVING_PX_PER_S = 15.0
/// How quickly he turns towards a new heading, per second. Higher is snappier.
private let TURN_RATE = 9.0
/// Close enough to count as facing the target.
private let SETTLED_RAD = 0.004

/// Wraps an angle into -PI..PI.
public func wrapAngle(_ a: Double) -> Double {
    let turn = Double.pi * 2
    return a - turn * floor((a + Double.pi) / turn)
}

public struct HeadingInput {
    public var velocity: Pt
    /// The behaviour's left/right facing (it turns him to look at things).
    public var facing: Double
    public var animation: AnimationName
    /// Standing, a way the behaviour wants him to face (square on to a toy), if any.
    public var aim: Double?
}

/// The heading he wants to turn to, given what he's doing.
public func targetHeading(_ current: Double, _ input: HeadingInput) -> Double {
    // Dangling from the pointer: don't spin with the drag.
    if input.animation == .dangle { return current }
    // Peeking over the bottom edge: face you, so you see his eyes follow your typing.
    if input.animation == .peek { return Double.pi / 2 }
    if hypot(input.velocity.x, input.velocity.y) > MOVING_PX_PER_S { return atan2(input.velocity.y, input.velocity.x) }
    if let aim = input.aim { return wrapAngle(aim) }
    // Standing, but the behaviour turned him round: mirror left/right and keep the same tilt.
    if input.facing * cos(current) < -0.2 { return wrapAngle(Double.pi - current) }
    return current
}

/// Turns smoothly from `current` towards `target` the short way round. Turning right round, he
/// turns through facing you rather than turning his back.
public func turnTowards(_ current: Double, _ target: Double, _ dtMs: Double) -> Double {
    var diff = wrapAngle(target - current)
    if abs(diff) > Double.pi - 0.3 && passesBack(current, diff) { diff -= jsSign(diff) * Double.pi * 2 }
    if abs(diff) < SETTLED_RAD { return wrapAngle(target) }
    return wrapAngle(current + diff * (1 - exp((-TURN_RATE * dtMs) / 1000)))
}

/// Turning `diff` from `current`, he'd pass the way that has his back to you (straight up the screen).
private func passesBack(_ current: Double, _ diff: Double) -> Bool {
    let turn = Double.pi * 2
    let toBack = diff > 0 ? -Double.pi / 2 - current : current + Double.pi / 2
    let along = jsMod(jsMod(toBack, turn) + turn, turn)
    return along > 0 && along < abs(diff)
}

public func isTurning(_ current: Double, _ target: Double) -> Bool { abs(wrapAngle(target - current)) >= SETTLED_RAD }

// MARK: - Animator (src/core/animator.ts)

private let BLINK_MS = 140.0

/// Keeps the clock for the current animation and decides when the eyes blink. Knows nothing
/// about how the pet is drawn.
public final class Animator {
    public private(set) var animation: AnimationName = .idle
    private var elapsedMs = 0.0
    public private(set) var keystrokes = 0
    private var blinkInMs: Double
    private var blinkLeftMs = 0.0
    private var specs: [AnimationName: AnimationSpec]
    private let random: Random

    public init(_ specs: [AnimationName: AnimationSpec], random: @escaping Random = systemRandom) {
        self.specs = specs
        self.random = random
        blinkInMs = 2000 + random() * 4000
    }

    public func play(_ name: AnimationName) {
        if name == animation { return }
        animation = name
        elapsedMs = 0
    }

    /// Swaps the timing table, e.g. for a drawing that animates at a different rate.
    public func setSpecs(_ specs: [AnimationName: AnimationSpec]) { self.specs = specs }

    /// Advances keystroke-driven animations. Receives no key information.
    public func keystroke() { keystrokes += 1 }

    public func update(_ dtMs: Double) {
        elapsedMs += dtMs
        if blinkLeftMs > 0 {
            blinkLeftMs = Swift.max(0, blinkLeftMs - dtMs)
            return
        }
        blinkInMs -= dtMs
        if blinkInMs <= 0 {
            blinkLeftMs = BLINK_MS
            blinkInMs = 2000 + random() * 4000
        }
    }

    /// Time into the animation, stepped down to its fps, wrapped for loops and held at the end otherwise.
    public var time: Double {
        let spec = specs[animation]!
        let frameMs = 1000 / spec.fps
        let stepped = floor(elapsedMs / frameMs) * frameMs
        return spec.loop ? jsMod(stepped, spec.durationMs) : Swift.min(stepped, spec.durationMs)
    }

    public var eyes: Eyes {
        let style = specs[animation]!.eyes
        if style == .open && blinkLeftMs > 0 { return .blink }
        switch style {
        case .open: return .open
        case .closed: return .closed
        case .wide: return .wide
        }
    }

    /// Milliseconds until the picture could change on its own (next step or blink edge).
    public func msUntilChange() -> Double {
        let spec = specs[animation]!
        var next = Double.infinity
        let finished = !spec.loop && elapsedMs >= spec.durationMs
        if spec.driver != .keystrokes && !finished {
            let frameMs = 1000 / spec.fps
            next = frameMs - jsMod(elapsedMs, frameMs)
        }
        if spec.eyes == .open { next = Swift.min(next, blinkLeftMs > 0 ? blinkLeftMs : blinkInMs) }
        return Swift.max(0, next)
    }
}

/// The shared animation timings with a drawing's own changes applied.
public func specsFor(_ renderer: PetRenderer) -> [AnimationName: AnimationSpec] {
    var specs = ANIMATIONS
    for (name, change) in renderer.animations {
        if let fps = change.fps { specs[name]!.fps = fps }
        if let ms = change.durationMs { specs[name]!.durationMs = ms }
    }
    return specs
}

// MARK: - Click-through (src/core/clickThrough.ts)

/// Decides when the pet window should capture the mouse: click-through until the pointer is
/// over the pet or one of his toys (plus a small margin), and interactive for the whole of a
/// drag. `apply` only fires on change, so it's cheap to call on every move.
public final class ClickThroughController {
    private var hovering = false
    private var dragging = false
    public private(set) var isInteractive = false
    private let apply: (Bool) -> Void
    private let margin: Double

    public init(apply: @escaping (Bool) -> Void, margin: Double = 6) {
        self.apply = apply
        self.margin = margin
    }

    public func pointerMoved(_ pointer: Pt, _ targets: [Rect]) {
        hovering = over(pointer, targets)
        sync()
    }

    public func pointerLeft() {
        hovering = false
        sync()
    }

    public func dragStarted() {
        dragging = true
        sync()
    }

    public func dragEnded(_ pointer: Pt?, _ targets: [Rect]) {
        dragging = false
        hovering = pointer.map { over($0, targets) } ?? false
        sync()
    }

    private func over(_ pointer: Pt, _ targets: [Rect]) -> Bool {
        targets.contains { pointInRect(pointer, inflate($0, margin)) }
    }

    private func sync() {
        let next = hovering || dragging
        if next == isInteractive { return }
        isInteractive = next
        apply(next)
    }
}

// MARK: - Cursor activity (src/core/activity/cursor.ts)

/// Below this the cursor counts as not moving (pointer jitter, high-DPI rounding).
private let MOVE_EPSILON_PX = 2.0
/// Average speed that counts as "fast" on its own, at sensitivity 1.
private let FAST_PX_PER_S = 1400.0
/// Lower speed that still counts when the path is zig-zagging.
private let ERRATIC_PX_PER_S = 650.0
/// Direction reversals within the window that make movement "erratic".
private let ERRATIC_TURNS = 4
/// How long movement must stay fast or erratic before the pet gets excited.
private let CURSOR_SUSTAIN_MS = 1500.0

/// Rolling-window statistics over cursor positions: speed, path length and how erratic the
/// movement is, plus whether that has been sustained long enough to excite the pet.
public final class CursorActivityTracker {
    private var samples: [(t: Double, p: Pt)] = []
    private var lastMoveAt = -Double.infinity
    private var franticSince: Double?
    private var sensitivity: Double
    private let windowMs: Double

    public init(sensitivity: Double = 1, windowMs: Double = 1000) {
        self.sensitivity = sensitivity
        self.windowMs = windowMs
    }

    public func setSensitivity(_ sensitivity: Double) { self.sensitivity = sensitivity }

    /// Records a cursor position. `nil` means the cursor left the screen.
    public func addSample(_ t: Double, _ p: Pt?) {
        guard let p else {
            samples = []
            return
        }
        if let last = samples.last {
            if hypot(p.x - last.p.x, p.y - last.p.y) >= MOVE_EPSILON_PX { lastMoveAt = t }
        } else {
            lastMoveAt = t
        }
        samples.append((t, p))
        prune(t)
    }

    /// Re-evaluates at time `t`; call every tick, since a stopped cursor sends no samples.
    public func evaluate(_ t: Double) {
        prune(t)
        if isFrantic(t) {
            if franticSince == nil { franticSince = t }
        } else {
            franticSince = nil
        }
    }

    /// Total distance travelled within the window, in px.
    public var pathLength: Double {
        var length = 0.0
        if samples.count > 1 { for i in 1..<samples.count { length += hypot(samples[i].p.x - samples[i - 1].p.x, samples[i].p.y - samples[i - 1].p.y) } }
        return length
    }

    /// Average speed over the window, in px/s.
    public func speed(_ t: Double) -> Double {
        if samples.count < 2 { return 0 }
        let span = Swift.max(t - samples[0].t, 100)
        return (pathLength / span) * 1000
    }

    /// Number of sharp direction changes (over 90 degrees) within the window.
    public var turns: Int {
        var turns = 0
        var prev: Pt?
        if samples.count > 1 {
            for i in 1..<samples.count {
                let d = Pt(x: samples[i].p.x - samples[i - 1].p.x, y: samples[i].p.y - samples[i - 1].p.y)
                if hypot(d.x, d.y) < 4 { continue }
                if let prev, prev.x * d.x + prev.y * d.y < 0 { turns += 1 }
                prev = d
            }
        }
        return turns
    }

    public func isFrantic(_ t: Double) -> Bool {
        let s = speed(t) * sensitivity
        return s >= FAST_PX_PER_S || (s >= ERRATIC_PX_PER_S && turns >= ERRATIC_TURNS)
    }

    /// True once movement has been fast or erratic for a sustained stretch.
    public func isExcited(_ t: Double) -> Bool {
        guard let since = franticSince else { return false }
        return t - since >= CURSOR_SUSTAIN_MS / sensitivity.squareRoot()
    }

    public func stillFor(_ t: Double) -> Double { t - lastMoveAt }

    public var latest: Pt? { samples.last?.p }

    private func prune(_ t: Double) {
        let cutoff = t - windowMs
        var drop = 0
        while drop < samples.count - 1 && samples[drop].t < cutoff { drop += 1 }
        if drop > 0 { samples.removeFirst(drop) }
        // Keep the last sample even when stale, as the reference point for the next move.
        if samples.count == 1 && samples[0].t < cutoff { samples[0].t = cutoff }
    }
}

// MARK: - Typing activity (src/core/activity/typing.ts)

private let TYPING_WINDOW_MS = 5000.0
/// Key presses per second that count as typing, at sensitivity 1.
private let MIN_RATE = 2.0
/// How long the rate must hold before the pet comes to watch.
private let TYPING_SUSTAIN_MS = 2500.0
/// Quiet time after which typing counts as stopped.
private let STOP_AFTER_MS = 5000.0

/// Typing rate over a rolling window. Privacy: the only input is the *time* of a key press.
/// This never sees, stores or forwards which key was pressed, and it only keeps timestamps
/// from the last few seconds.
public final class TypingActivityTracker {
    private var presses: [Double] = []
    private var lastPressAt = -Double.infinity
    private var rateSince: Double?
    public private(set) var isActive = false
    private var sensitivity: Double

    public init(sensitivity: Double = 1) {
        self.sensitivity = sensitivity
    }

    public func keyDown(_ t: Double) {
        presses.append(t)
        lastPressAt = t
        prune(t)
    }

    public func evaluate(_ t: Double) {
        prune(t)
        if isActive {
            if t - lastPressAt >= STOP_AFTER_MS { isActive = false }
            return
        }
        if rate() * sensitivity >= MIN_RATE {
            if rateSince == nil { rateSince = t }
            if t - rateSince! >= TYPING_SUSTAIN_MS { isActive = true }
        } else {
            rateSince = nil
        }
    }

    /// Key presses per second over the window.
    public func rate() -> Double { Double(presses.count) / (TYPING_WINDOW_MS / 1000) }

    public func idleFor(_ t: Double) -> Double { t - lastPressAt }

    /// Forgets everything, e.g. when the feature is switched off.
    public func reset() {
        presses = []
        lastPressAt = -.infinity
        rateSince = nil
        isActive = false
    }

    /// Number of timestamps currently held (for the privacy tests).
    public var retained: Int { presses.count }

    private func prune(_ t: Double) {
        let cutoff = t - TYPING_WINDOW_MS
        var drop = 0
        while drop < presses.count && presses[drop] < cutoff { drop += 1 }
        if drop > 0 { presses.removeFirst(drop) }
    }
}
