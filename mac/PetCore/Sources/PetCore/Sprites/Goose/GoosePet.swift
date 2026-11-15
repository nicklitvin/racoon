import Foundation

/// A white goose with an orange beak and feet (`band`, and `dark` for the far foot and under its beak).
public let GOOSE_COAT: Palette = PIXEL_COATS[.raccoon]!.merging([
    "outline": "#2c2a33",
    "fur": "#f7f5ef",
    "furLight": "#ffffff",
    "furDark": "#d3d0c8",
    "far": "#c4c0b6",
    "belly": "#e4e1d9",
    "light": "#ffffff",
    "band": "#f59a2c",
    "dark": "#c9681c",
    "eye": "#17141c",
    "mouth": "#7a2f3a",
]) { _, new in new }

/// How quickly it moves into a new pose, per second (bigger is quicker).
private let EASE_RATE = 16.0
/// Peeking, its feet go this far below the edge: only its neck and head show over it.
private let GOOSE_PEEK_SINK = 21.0

/// The goose (src/sprites/goose/index.ts): in pixels like the pixel pets, and up to no good. It
/// waddles about with its neck up, goes for your pointer with its wings out, honking, and runs
/// off with the blocks. Its own ways of doing things are in the brain (`WorldInput.goose`).
public final class GoosePet: PetRenderer {
    private let view = PixelCanvas(GOOSE_COAT)
    private struct Eased {
        var lift, tilt, bow, nod, beak, wing: Double
        var head: Pt
    }
    private var shown: Eased?
    private var settling = false
    private var lastClock = Double.nan
    private var shownTick = Double.nan
    private var back: Pt?
    private var tip: Pt?
    private var dir = 1.0
    /// Which way you see it: side on, or going up or down the screen from behind or in front.
    private var turned: ChibiView = .side

    public init() {
        view.onChange = { [weak self] in self?.shownTick = .nan }
        view.sizeTo()
    }

    private func px(_ art: Double) -> Double { art * view.cell }

    public var raster: Raster { view.raster }
    public var colours: [UInt32] { view.colours }
    public var cell: Double { view.cell }
    public var figure: Box? { view.figure }
    public var baseSize: Size { Size(width: Double(PIXEL.width) * PIXEL_PX, height: Double(PIXEL.height) * PIXEL_PX) }
    public var anchor: Pt { Pt(x: PIXEL.feetX / Double(PIXEL.width), y: PIXEL.feetY / Double(PIXEL.height)) }
    public var peekSink: Double? { GOOSE_PEEK_SINK * PIXEL_PX }
    public var turnsItself: Bool { true }
    public var pixelated: Bool { true }
    public var animations: [AnimationName: SpecChange] {
        TIMING.merging([.work: SpecChange(fps: 20), .browse: SpecChange(fps: 20), .reels: SpecChange(fps: 20), .attention: SpecChange(fps: 30)]) { _, new in new }
    }
    public func isSettling() -> Bool { settling }
    /// Picked up by the back, between its wings.
    public func holdPoint() -> Pt? { back.map { Pt(x: px($0.x - PIXEL.feetX), y: px($0.y - PIXEL.feetY)) } }
    public var toyReach: Double? { 17 * PIXEL_PX }
    public var toySize: Double? { PIXEL_TOY * PIXEL_PX }
    public var toyLook: ToyLook { .pixel }
    public var carriesToys: Bool { false }
    public var deskReach: Pt? { Pt(x: KEYBOARD.x * PIXEL_PX, y: KEYBOARD.y * PIXEL_PX) }
    public var mouseReach: Pt? { Pt(x: (KEYBOARD.x + 7) * PIXEL_PX, y: KEYBOARD.y * PIXEL_PX) }
    public var hover: Double { 0 }
    public var goose: Bool { true }
    public var drawsMarks: Bool { true }
    /// A block hangs from its beak by one edge.
    public func toyPoint() -> Pt? { tip.map { Pt(x: px($0.x - PIXEL.feetX + dir * 1), y: px($0.y - PIXEL.feetY + PIXEL_TOY / 2 - 1)) } }
    public func dress(_ dress: Dress) { view.dress(dress) }

    public func setScale(_ scale: Double, devicePixelRatio: Double) {
        view.scale = scale
        view.devicePixelRatio = devicePixelRatio
        view.sizeTo()
    }

    @discardableResult
    public func draw(_ frame: PetFrame) -> Bool {
        let clock = frame.clockMs ?? frame.timeMs
        let v = frame.velocity ?? .zero
        let heading = frame.heading ?? 0.6
        let target = goosePose(frame.animation, frame.timeMs, clock, frame.eyes, hypot(v.x, v.y), frame.keystrokes)
        // Moves from pose to pose rather than jumping.
        let dt = lastClock.isNaN ? 1 : Swift.min(0.25, Swift.max(0, (clock - lastClock) / 1000))
        lastClock = clock
        let k = 1 - exp(-EASE_RATE * dt)
        var s = shown ?? Eased(lift: target.lift, tilt: target.tilt, bow: target.bow, nod: target.nod, beak: target.beak, wing: target.wing, head: target.head)
        var far = hypot(target.head.x - s.head.x, target.head.y - s.head.y)
        s.head.x += (target.head.x - s.head.x) * k
        s.head.y += (target.head.y - s.head.y) * k
        func ease(_ value: inout Double, _ to: Double, _ weight: Double) {
            value += (to - value) * k
            far = Swift.max(far, abs(to - value) * weight)
        }
        ease(&s.lift, target.lift, 1)
        ease(&s.tilt, target.tilt, 10)
        ease(&s.bow, target.bow, 1)
        ease(&s.nod, target.nod, 10)
        ease(&s.beak, target.beak, 10)
        ease(&s.wing, target.wing, 10)
        shown = s
        settling = far > 0.3
        var pose = target
        pose.lift = s.lift
        pose.tilt = s.tilt
        pose.bow = s.bow
        pose.nod = s.nod
        pose.beak = s.beak
        pose.wing = s.wing
        pose.head = s.head
        // Facing the way it's going, held while it goes straight up or down the screen; and
        // going up or down, seen from behind or in front (three-quarters going diagonally).
        let facing = frame.animation != .dangle && abs(cos(heading)) > 0.2 ? (cos(heading) < 0 ? -1.0 : 1.0) : dir
        let seen = viewWhile(frame.animation, heading, turned)
        // A new picture only every so often, like an old game, but at once when it turns.
        let tick = floor(clock / (1000 / PIXEL_FPS))
        if tick == shownTick && facing == dir && seen == turned { return false }
        shownTick = tick
        dir = facing
        turned = seen
        let drawn = turned == .front || turned == .back
            ? drawGooseFacing(view.raster, pose, turned == .front ? .front : .back, dir, clock, view.dressed)
            : drawGoose(view.raster, pose, dir, clock, view.dressed, turned == .side ? 1 : GOOSE_QUARTER)
        back = drawn.back
        tip = drawn.tip
        view.paint(drawn.box)
        return true
    }
}
