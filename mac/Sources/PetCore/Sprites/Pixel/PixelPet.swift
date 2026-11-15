import Foundation

// A pet drawn in pixels (src/sprites/pixel/index.ts): it moves like a chibi (the same poses and
// timing), but every picture is rasterised into a small grid, which the app shows with each
// pixel blown up into a crisp square, a whole number of screen pixels across.

/// Screen px per art pixel at size 1.
public let PIXEL_PX = 3.0
/// Edge of a pixel toy block, in art pixels: room for a 3 by 5 letter inside its lit and shaded edges.
public let PIXEL_TOY = 9.0
/// Pixel pets move on in steps, like an old game: this many new pictures a second.
public let PIXEL_FPS = 12.0

/// The raster a pixel pet is drawn into, its palette (with whatever he's wearing), and the box
/// you grab him by. Shared by every pixel drawing: the pets, the goose and the floaties.
public final class PixelCanvas {
    public let raster: Raster
    public private(set) var colours: [UInt32]
    public private(set) var dressed = UNDRESSED
    /// Screen px per art pixel: a whole number of device pixels.
    public private(set) var cell = PIXEL_PX
    public var scale = 1.0
    public var devicePixelRatio = 2.0
    /// The box round the drawn pixels, in art pixels.
    public private(set) var figure: Box?
    /// Called when the picture must be drawn again even if nothing moved.
    public var onChange: () -> Void = {}
    private let palette: Palette

    public init(_ palette: Palette, width: Int = PIXEL.width, height: Int = PIXEL.height) {
        self.palette = palette
        raster = Raster(width, height)
        colours = rgbaTable(palette)
    }

    public func sizeTo() {
        let dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
        cell = Swift.max(1, jsRound(PIXEL_PX * scale * dpr)) / dpr
        onChange()
    }

    public func dress(_ d: Dress) {
        dressed = d
        var p = palette
        if let hat = hatItem(d.hat)?.colours {
            p["hatMain"] = hat.main
            p["hatTrim"] = hat.trim
            p["hatAccent"] = hat.accent
        }
        if let wear = outfitItem(d.outfit)?.colours {
            p["wearMain"] = wear.main
            p["wearTrim"] = wear.trim
            p["wearAccent"] = wear.accent
            p["wearLight"] = shade(wear.main, 0.25)
            p["wearDark"] = shade(wear.main, -0.25)
        }
        colours = rgbaTable(p)
        onChange()
    }

    /// Shows what's in the raster, and fits the grab box to `box`.
    public func paint(_ box: Box?) {
        if let box { figure = box }
    }
}

public final class PixelPet: PetRenderer {
    private let build: ChibiBuild
    private let view: PixelCanvas
    private let motion: ChibiMotion
    private var scruff: Pt?
    private var toy: Pt?
    private var shownTick = Double.nan
    private var shownFacing = 0.0
    private var shownView: ChibiView?
    /// Turned three-quarters, everything across him is this much shorter.
    private var across = 1.0

    public init(_ build: ChibiBuild, _ palette: Palette) {
        self.build = build
        view = PixelCanvas(palette)
        motion = ChibiMotion(build)
        view.onChange = { [weak self] in self?.shownTick = .nan }
        view.sizeTo()
    }

    private var K: Double { PIXEL.k }
    public var raster: Raster { view.raster }
    public var colours: [UInt32] { view.colours }
    public var cell: Double { view.cell }
    public var figure: Box? { view.figure }
    public var baseSize: Size { Size(width: Double(PIXEL.width) * PIXEL_PX, height: Double(PIXEL.height) * PIXEL_PX) }
    public var anchor: Pt { Pt(x: PIXEL.feetX / Double(PIXEL.width), y: PIXEL.feetY / Double(PIXEL.height)) }
    public var peekSink: Double? { build.peekSink * K * PIXEL_PX }
    public var turnsItself: Bool { true }
    public var pixelated: Bool { true }
    public var animations: [AnimationName: SpecChange] { TIMING }
    public func isSettling() -> Bool { motion.settling }
    public func holdPoint() -> Pt? { scruff.map { Pt(x: $0.x * across * motion.facing * K * view.cell, y: $0.y * K * view.cell) } }
    public var toyReach: Double? { build.toyReach * K * PIXEL_PX }
    public var toySize: Double? { PIXEL_TOY * PIXEL_PX }
    public var toyLook: ToyLook { .pixel }
    public var carriesToys: Bool { build.species == .raccoon }
    public var deskReach: Pt? { Pt(x: build.desk.x * K * PIXEL_PX, y: build.desk.y * K * PIXEL_PX) }
    public var mouseReach: Pt? { Pt(x: build.mouse.x * K * PIXEL_PX, y: build.mouse.y * K * PIXEL_PX) }
    public var hover: Double { 0 }
    public var goose: Bool { false }
    public var drawsMarks: Bool { true }
    public func toyPoint() -> Pt? { toy.map { Pt(x: $0.x * across * motion.facing * K * view.cell, y: $0.y * K * view.cell) } }
    public func dress(_ dress: Dress) { view.dress(dress) }

    public func setScale(_ scale: Double, devicePixelRatio: Double) {
        view.scale = scale
        view.devicePixelRatio = devicePixelRatio
        view.sizeTo()
    }

    @discardableResult
    public func draw(_ frame: PetFrame) -> Bool {
        let pose = motion.update(frame, 1 / (K * view.cell))
        let clock = frame.clockMs ?? frame.timeMs
        // A new picture only every so often, but at once when he turns round.
        let tick = floor(clock / (1000 / PIXEL_FPS))
        let facing = motion.facing
        let turned = motion.view
        if tick == shownTick && facing == shownFacing && turned == shownView { return false }
        shownTick = tick
        shownFacing = facing
        shownView = turned
        scruff = scruffPoint(build, pose)
        toy = toyHoldPoint(build, pose)
        let quarter: Quarter? = turned == .frontQuarter ? .front : turned == .backQuarter ? .back : nil
        across = quarter != nil ? QUARTER_SQUASH : 1
        let box: Box?
        if turned != .front && turned != .back {
            box = drawPixelPet(view.raster, build, pose, clock, facing, motion.moving, scruff!, view.dressed, quarter)
        } else {
            box = drawPixelFacing(view.raster, build, pose, turned == .front ? .front : .back, Walking(phase: motion.phase, moving: motion.moving, running: frame.animation != .walk, side: facing), clock, view.dressed)
        }
        view.paint(box)
        return true
    }
}
