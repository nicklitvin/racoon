import Foundation

/// Every animal there's a build for: the chibis', and the ones only drawn in pixels.
public enum ChibiSpecies: String {
    case cat, raccoon, fox, otter, bunny, hedgehog
}

/// How one animal is put together: a bean of a body, a big round head, stubby legs and a
/// tail, all flat shapes. Body-relative points are from the body's middle, before it's
/// turned; everything else is from his feet. (Drawing units: x forward, he faces right, y
/// down, the floor at y = 0.)
public struct ChibiBuild {
    public struct Ellipse {
        public var rx: Double
        public var ry: Double
        public var at: Pt
    }
    public struct Stride {
        public var walk: Double
        public var walkCycle: Double
        public var runCycle: Double
    }
    public struct Tail {
        public var root: Pt
        public var length: Double
        /// Radius along the tail, 0 at the root to 1 at the tip.
        public var radius: (Double) -> Double
        /// Angle it leaves the body at (degrees, 0 = forward, 90 = up) and how far it curls.
        public var angle: Double
        public var curl: Double
    }
    public enum Gait { case hop }

    public var species: ChibiSpecies
    /// Half the body's length and height, and where its middle is when he stands.
    public var body: Ellipse
    /// Half the head's width and height, and where it sits from the body's middle.
    public var head: Ellipse
    /// Where the legs join the body, from its middle.
    public var shoulder: Pt
    public var hip: Pt
    /// How far the far legs sit behind the near ones on screen.
    public var farOffset: Double
    public var legWidth: Double
    /// One step: how far the paws swing either way, and how far a full stride carries him.
    public var stride: Stride
    public var tail: Tail
    /// Feet this far below the screen edge while peeking.
    public var peekSink: Double
    /// How far in front of his feet a toy block sits for him to swat or pick up (its middle).
    public var toyReach: Double
    /// Where his front paws rest on a keyboard, typing at his desk (the middle of the keys), and on the mouse.
    public var desk: Pt
    public var mouse: Pt
    public var swims = false
    /// Gets about in hops, both hind feet together (a bunny), rather than trotting.
    public var gait: Gait?
    /// Rolls up into a spiky ball: to go fast, to sleep, when startled or picked up (a hedgehog).
    public var curls = false
}

/// Edge of a toy block, in drawing units.
public let CHIBI_TOY = 15.0

public let CHIBI_RACCOON = ChibiBuild(
    species: .raccoon,
    body: .init(rx: 16, ry: 12, at: pt(-3, -15)),
    head: .init(rx: 17, ry: 14.5, at: pt(13.5, -18)),
    shoulder: pt(8.5, 5),
    hip: pt(-9, 5),
    farOffset: 4.5,
    legWidth: 6.6,
    stride: .init(walk: 4.2, walkCycle: 24, runCycle: 46),
    tail: .init(root: pt(-13, -2), length: 25, radius: { s in 4.4 + 3.4 * sin(Double.pi * Swift.min(1, s * 1.15)) - 1.2 * s }, angle: 150, curl: -24),
    peekSink: 28,
    toyReach: 26,
    desk: pt(15, -16),
    mouse: pt(27, -15)
)

public let CHIBI_CAT = ChibiBuild(
    species: .cat,
    body: .init(rx: 14.5, ry: 10.5, at: pt(-3, -15)),
    head: .init(rx: 16, ry: 13.5, at: pt(13, -17.5)),
    shoulder: pt(8, 5),
    hip: pt(-8, 5),
    farOffset: 4,
    legWidth: 5.4,
    stride: .init(walk: 4.4, walkCycle: 26, runCycle: 50),
    tail: .init(root: pt(-12.5, -3), length: 27, radius: { s in 2.7 - 0.5 * s }, angle: 112, curl: -70),
    peekSink: 26,
    toyReach: 25,
    desk: pt(14.5, -15),
    mouse: pt(26.5, -14)
)

public let CHIBI_OTTER = ChibiBuild(
    species: .otter,
    body: .init(rx: 18, ry: 9.5, at: pt(-4, -12.5)),
    head: .init(rx: 14, ry: 12.2, at: pt(17.5, -11)),
    shoulder: pt(10.5, 4.5),
    hip: pt(-11, 4.5),
    farOffset: 4,
    legWidth: 5.2,
    stride: .init(walk: 3.6, walkCycle: 30, runCycle: 56),
    tail: .init(root: pt(-16, 0), length: 22, radius: { s in 5 - 3.9 * s }, angle: 186, curl: 10),
    peekSink: 26,
    toyReach: 30,
    desk: pt(12, -13),
    mouse: pt(21, -12),
    swims: true
)

// MARK: - The pixel pets' builds (src/sprites/pixel/species.ts)

/// The pixel pets are built like the chibis, but drawn this small, with a whole pixel of
/// outline round every part, a chibi's head ends up looking small for its body and the
/// tail too big. Pixel sprites want an even bigger head on a smaller, rounder body, so
/// these are the chibi builds with those proportions.
public let PIXEL_RACCOON: ChibiBuild = {
    var b = CHIBI_RACCOON
    b.species = .raccoon
    b.body = .init(rx: 14, ry: 11, at: pt(-2.5, -14.5))
    b.head = .init(rx: 18.5, ry: 15.5, at: pt(12.5, -17))
    b.shoulder = pt(7.5, 5)
    b.hip = pt(-8, 5)
    b.legWidth = 7.4
    b.tail = .init(root: pt(-11.5, -1.5), length: 19, radius: { s in 3.8 + 2.6 * sin(Double.pi * Swift.min(1, s * 1.15)) - 1 * s }, angle: 162, curl: -20)
    return b
}()

public let PIXEL_CAT: ChibiBuild = {
    var b = CHIBI_CAT
    b.species = .cat
    b.body = .init(rx: 13, ry: 10, at: pt(-2.5, -14.5))
    b.head = .init(rx: 17.5, ry: 14.8, at: pt(12.5, -17))
    b.shoulder = pt(7, 5)
    b.hip = pt(-7.5, 5)
    b.legWidth = 6.4
    b.tail = .init(root: pt(-11, -3), length: 23, radius: { s in 2.8 - 0.5 * s }, angle: 128, curl: -80)
    return b
}()

public let PIXEL_OTTER: ChibiBuild = CHIBI_OTTER

/// A bunny: a pear of a body with a big round haunch, its head held low in front, long
/// floppy ears, big flat hind feet, a cotton-ball tail, and it hops everywhere.
public let PIXEL_BUNNY: ChibiBuild = {
    var b = CHIBI_CAT
    b.species = .bunny
    b.gait = .hop
    b.body = .init(rx: 14.5, ry: 10.5, at: pt(-4, -12.5))
    b.head = .init(rx: 13.5, ry: 12, at: pt(13.5, -7.5))
    b.shoulder = pt(8.5, 6)
    b.hip = pt(-8, 4)
    b.legWidth = 5.6
    b.stride = .init(walk: 4, walkCycle: 30, runCycle: 52)
    b.tail = .init(root: pt(-13, -1.5), length: 3, radius: { _ in 4.2 }, angle: 160, curl: 0)
    return b
}()

/// A hedgehog: a low dome of spines over its back and the top of its head, a pointed snout
/// with a shiny black nose out in front, tiny legs, and it rolls up into a ball.
public let PIXEL_HEDGEHOG: ChibiBuild = {
    var b = CHIBI_CAT
    b.species = .hedgehog
    b.curls = true
    b.body = .init(rx: 13.5, ry: 12, at: pt(-2.5, -13))
    b.head = .init(rx: 11, ry: 9.5, at: pt(12.5, 1))
    b.shoulder = pt(7, 8)
    b.hip = pt(-7, 8)
    b.legWidth = 5
    b.stride = .init(walk: 3, walkCycle: 20, runCycle: 44)
    b.tail = .init(root: pt(-14, 0), length: 0, radius: { _ in 0 }, angle: 190, curl: 0)
    b.peekSink = 20
    b.toyReach = 27
    return b
}()
