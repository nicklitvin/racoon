import Foundation

// How a chibi-built pet moves between frames (src/sprites/chibi/index.ts).

/// Resting animations redraw often enough for the breathing and the floating marks to look smooth.
public let TIMING: [AnimationName: SpecChange] = [
    .idle: SpecChange(fps: 20),
    .sit: SpecChange(fps: 20),
    .groom: SpecChange(fps: 30),
    .yawn: SpecChange(fps: 30),
    .confused: SpecChange(fps: 20),
    .sleep: SpecChange(fps: 15),
    .happy: SpecChange(fps: 30),
    .peek: SpecChange(fps: 12),
]

/// Animations he walks along in, at a walking stride.
private let STROLLS: Set<AnimationName> = [.walk, .carry, .stalk, .nudge, .fetch]

/// Which way you see him: side on, three-quarters towards you or away, or straight on.
public enum ChibiView: String {
    case side, frontQuarter, backQuarter, front, back
}

/// How steep a heading (0 across the screen, 1 straight up or down it) each view starts at.
private let QUARTER_FROM = 0.38
private let STRAIGHT_FROM = 0.9
/// How far past a boundary he has to go to change view.
private let HOLD = 0.05

/// The view for a heading, given the one he's in now.
public func viewFor(_ heading: Double, _ current: ChibiView) -> ChibiView {
    let s = sin(heading)
    let steep = abs(s)
    let level = current == .side ? 0 : current == .frontQuarter || current == .backQuarter ? 1 : 2
    // Each boundary sits a little further away from the view he's in, so he has to go
    // clearly past it to change.
    let quarterFrom = QUARTER_FROM + (level == 0 ? HOLD : -HOLD)
    let straightFrom = STRAIGHT_FROM + (level == 2 ? -HOLD : HOLD)
    if steep > straightFrom { return s > 0 ? .front : .back }
    if steep > quarterFrom { return s > 0 ? .frontQuarter : .backQuarter }
    return .side
}

/// Going along in these (or pouncing), up or down the screen he's seen from the front or behind.
private let TURNS_FULLY: Set<AnimationName> = [.walk, .run, .chase, .leap, .fetch, .jump]
/// In these he turns only three-quarters: with a block in his mouth or paws, nosing one
/// along, or creeping up low (poses only the side views have).
private let TURNS_PART: Set<AnimationName> = [.carry, .nudge, .stalk]

/// The view for `heading` doing `animation`, given the one he's in now: side on unless he's going somewhere.
public func viewWhile(_ animation: AnimationName, _ heading: Double, _ current: ChibiView) -> ChibiView {
    if TURNS_FULLY.contains(animation) { return viewFor(heading, current) }
    if !TURNS_PART.contains(animation) { return .side }
    let view = viewFor(heading, current)
    return view == .front ? .frontQuarter : view == .back ? .backQuarter : view
}

/// How long a change of animation takes to blend through, and a turn round to flip.
private let BLEND_MS = 240.0
private let FLIP_MS = 90.0

/// Long ears hang on a spring: how stiff it is (a swing or two a second), how quickly a
/// swing dies away, and how hard the head's going up or down throws them about.
private let EAR_SPRING = 200.0
private let EAR_DAMPING = 5.0
private let EAR_THROW = 7.0
/// Running, they're blown back this far (degrees) at full tilt.
private let EAR_WIND = 14.0

/// Where a chibi is between frames: how far round its stride it is (kept in step with the
/// ground, so paws don't slide), which way it faces, and the pose it's blending from.
public final class ChibiMotion {
    public var phase = 0.0
    public var facing = 1.0
    /// The drawn facing, from -1 to 1: it squashes through zero as he turns round.
    public var flip = 1.0
    public var pose: ChibiPose?
    public var moving = 0.0
    /// Which way you see him: side on, or (walking towards you down the screen, or away up it)
    /// from the front or behind.
    public var view: ChibiView = .side
    private var clock = -1.0
    private var flap = 0.0
    private var flapSpeed = 0.0
    private var headY: Double?
    private var headSpeed = 0.0
    private var animation: AnimationName?
    private var from: ChibiPose?
    private var changedAt = 0.0
    private let build: ChibiBuild

    public init(_ build: ChibiBuild) {
        self.build = build
    }

    public var settling: Bool {
        abs(flip - facing) > 0.01 || (from != nil && clock - changedAt < BLEND_MS)
    }

    public func update(_ frame: PetFrame, _ unitsPerPx: Double) -> ChibiPose {
        let clock = frame.clockMs ?? frame.timeMs
        let dt = self.clock < 0 ? 0 : Swift.min(0.1, Swift.max(0, (clock - self.clock) / 1000))
        self.clock = clock

        // Facing: the way he's heading, held while he goes straight up or down the screen.
        let heading = frame.heading ?? 0
        let c = cos(heading)
        if frame.animation != .dangle && abs(c) > 0.2 { facing = c < 0 ? -1 : 1 }
        // Going up or down the screen, you see him from behind or in front, and going diagonally,
        // three-quarters. Each view holds until he's clearly going another way.
        view = viewWhile(frame.animation, heading, view)
        let turn = dt / (FLIP_MS / 1000)
        flip = flip < facing ? Swift.min(facing, flip + turn) : Swift.max(facing, flip - turn)

        // The stride follows the ground he covers.
        let v = frame.velocity ?? .zero
        let speed = hypot(v.x, v.y) * unitsPerPx
        let stride = build.stride
        let strolling = STROLLS.contains(frame.animation)
        let cycle = strolling ? stride.walkCycle : stride.runCycle
        let locomotion = strolling || frame.animation == .run || frame.animation == .chase || frame.animation == .leap
        if locomotion { phase = jsMod(phase + (Swift.max(speed, cycle * 1.2) * dt) / cycle, 1) }
        moving += ((locomotion ? Swift.min(1.5, speed / 60) : 0) - moving) * Swift.min(1, dt * 6)

        let gaze = frame.gaze.map { Pt(x: $0.x * unitsPerPx * facing, y: $0.y * unitsPerPx) }
        let target = chibiPose(build, ChibiInput(animation: frame.animation, t: frame.timeMs, clock: clock, phase: phase, keystrokes: frame.keystrokes, eyes: frame.eyes, gaze: gaze))

        if frame.animation != animation {
            from = pose
            changedAt = clock
            animation = frame.animation
        }
        let k = (clock - changedAt) / BLEND_MS
        var pose: ChibiPose
        if let from, k < 1 {
            pose = blendPose(from, target, k * k * (3 - 2 * k))
        } else {
            pose = target
        }
        if k >= 1 || poseDistance(pose, target) < 0.01 { from = nil }
        pose.earFlap = swingEars(pose, dt)
        self.pose = pose
        return pose
    }

    /// Swings long ears on their spring: left behind as the head springs up, flopping on as it
    /// comes down and lands, and blown back as he runs.
    private func swingEars(_ pose: ChibiPose, _ dt: Double) -> Double {
        let y = pose.lift + pose.by + pose.hy
        guard let lastY = headY, dt > 0 else {
            headY = y
            return flap + moving * EAR_WIND
        }
        let speed = (y - lastY) / dt
        let accel = Swift.max(-3000, Swift.min(3000, (speed - headSpeed) / dt))
        headY = y
        headSpeed = speed
        // In small steps, so a slow frame can't set it flying.
        let steps = Int(ceil(dt / (1.0 / 120)))
        let h = dt / Double(steps)
        for _ in 0..<steps {
            flapSpeed += (-EAR_SPRING * flap - EAR_DAMPING * flapSpeed - accel * EAR_THROW) * h
            flap += flapSpeed * h
        }
        flap = Swift.max(-45, Swift.min(70, flap))
        return flap + moving * EAR_WIND
    }
}
