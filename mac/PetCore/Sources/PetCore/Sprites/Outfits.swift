import Foundation

// Hats, clothes and things to wear round the neck, as plain shapes (src/sprites/outfits.ts).
//
// A hat is drawn in head units: the head's half-width is 1, the origin is the crown of the
// head (its top, a little back from the middle), x points the way he faces and y down. The
// head itself is roughly a unit circle centred at (0, 1).
//
// Neckwear is drawn in neck units: the neck's half-width is 1, the origin is the middle of the
// collar, x points the way he faces and y down, away from the head.
//
// Clothes are neckwear (a tie, a collar) plus `body`: what covers the body and legs. A costume
// can also have a `hood`, drawn over the head in hat units.

/// Which of the item's colours a shape is painted in.
public enum Paint {
    case main, trim, accent
}

public enum WearShape {
    case poly(points: [Pt], paint: Paint)
    case ellipse(cx: Double, cy: Double, rx: Double, ry: Double, paint: Paint)

    public var paint: Paint {
        switch self {
        case let .poly(_, paint), let .ellipse(_, _, _, _, paint): return paint
        }
    }
}

public struct WearColours {
    public var main: String
    public var trim: String
    public var accent: String
    public subscript(paint: Paint) -> String {
        switch paint {
        case .main: return main
        case .trim: return trim
        case .accent: return accent
        }
    }
}

/// Clothes on the body: covered in the main colour, with stripes, a shirt front, buttons, or a cape.
public struct BodyWear {
    public struct Bands {
        public var paint: Paint
        public var count: Int
        public var width: Double
    }
    public struct Spikes {
        public var paint: Paint
        public var count: Int
    }
    public enum SkirtStyle { case tutu, robe }
    public struct Skirt {
        public var paint: Paint
        public var style: SkirtStyle
    }
    /// Body covered in `main`; false for a cape, which hangs behind instead.
    public var covered: Bool
    /// How far down the legs the sleeves and trouser legs come, 0 (none) to 1 (to the paws).
    public var sleeves: Double
    /// Rings round the body (seen side on, bands across it), in this paint.
    public var bands: Bands?
    /// A white shirt showing at the chest (in `trim`), as under a jacket.
    public var shirt = false
    /// A row of buttons down the chest, in `accent`.
    public var buttons = false
    /// A cape over the back, flying out behind as he goes, in `main` lined with `accent`.
    public var cape = false
    /// An all-in-one, hood and all.
    public var onesie = false
    /// A patch on the tummy or chest, in this paint.
    public var patch: Paint?
    /// A row of spikes down the back.
    public var spikes: Spikes?
    /// Little wings on the back, buzzing as he goes.
    public var wings: Paint?
    /// A pack on the back (an astronaut's air).
    public var pack: Paint?
    /// Little stars sprinkled over it.
    public var stars: Paint?
    /// A skirt: a tutu sticking out round the middle, or a robe down to the floor.
    public var skirt: Skirt?
}

public struct Wearable {
    public var label: String
    public var colours: WearColours
    /// Back to front.
    public var shapes: [WearShape]
    public var body: BodyWear?
    /// For a costume, what goes over the head, in hat units, under any hat.
    public var hood: [WearShape]?
    /// Its picture in the settings, when the shapes alone wouldn't say what it is.
    public var icon: [WearShape]?
}

public struct Dress: Equatable {
    public var hat: Hat
    public var outfit: Outfit
    public init(hat: Hat, outfit: Outfit) {
        self.hat = hat
        self.outfit = outfit
    }
}

public let UNDRESSED = Dress(hat: .none, outfit: .none)

/// For the flat pets, whose necks don't show: half the collar's width, in head half-widths.
public let NECK_WIDTH = 0.56

private func poly(_ paint: Paint, _ points: [(Double, Double)]) -> WearShape { .poly(points: points.map { Pt(x: $0.0, y: $0.1) }, paint: paint) }
private func poly(_ paint: Paint, _ points: (Double, Double)...) -> WearShape { poly(paint, points) }
private func oval(_ paint: Paint, _ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double? = nil) -> WearShape {
    .ellipse(cx: cx, cy: cy, rx: rx, ry: ry ?? rx, paint: paint)
}

/// The top half of an ellipse, as a polygon (a dome).
private func dome(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ steps: Int = 14) -> [(Double, Double)] {
    (0...steps).map { i in
        let a = Double.pi * (1 - Double(i) / Double(steps))
        return (cx + cos(a) * rx, cy - sin(a) * ry)
    }
}

/// A thick arc round (cx, cy), between radii `inner` and `outer`, from `from` to `to` degrees (90 = up).
private func arc(_ cx: Double, _ cy: Double, _ outer: Double, _ inner: Double, _ from: Double, _ to: Double, _ steps: Int = 12) -> [(Double, Double)] {
    func at(_ r: Double, _ deg: Double) -> (Double, Double) { (cx + cos((deg * Double.pi) / 180) * r, cy - sin((deg * Double.pi) / 180) * r) }
    var out: [(Double, Double)] = []
    for i in 0...steps { out.append(at(outer, from + ((to - from) * Double(i)) / Double(steps))) }
    for i in stride(from: steps, through: 0, by: -1) { out.append(at(inner, from + ((to - from) * Double(i)) / Double(steps))) }
    return out
}

/// A band across a cone, between `a` and `b` of the way from its base to its tip.
private func coneBand(_ left: (Double, Double), _ right: (Double, Double), _ tip: (Double, Double), _ a: Double, _ b: Double) -> [(Double, Double)] {
    func along(_ p: (Double, Double), _ s: Double) -> (Double, Double) { (p.0 + (tip.0 - p.0) * s, p.1 + (tip.1 - p.1) * s) }
    return [along(left, a), along(left, b), along(right, b), along(right, a)]
}

private let PARTY_L = (-0.55, 0.24)
private let PARTY_R = (0.6, 0.14)
private let PARTY_TIP = (0.2, -1.3)

private func colours(_ main: String, _ trim: String, _ accent: String) -> WearColours { WearColours(main: main, trim: trim, accent: accent) }

public let HAT_ITEMS: [Hat: Wearable] = [
    .party: Wearable(label: "Party hat", colours: colours("#ff6f91", "#ffd84a", "#5fc3ff"), shapes: [
        poly(.main, PARTY_L, PARTY_TIP, PARTY_R),
        poly(.accent, coneBand(PARTY_L, PARTY_R, PARTY_TIP, 0.22, 0.36)),
        poly(.trim, coneBand(PARTY_L, PARTY_R, PARTY_TIP, 0.55, 0.68)),
        oval(.trim, PARTY_TIP.0, PARTY_TIP.1, 0.22),
    ]),
    .beanie: Wearable(label: "Beanie", colours: colours("#4d8fd6", "#f4f1ea", "#f4f1ea"), shapes: [
        poly(.main, dome(0, 0.6, 0.96, 0.82)),
        poly(.trim, (-1.04, 0.36), (1.04, 0.36), (1.04, 0.72), (-1.04, 0.72)),
        oval(.accent, 0, -0.26, 0.27),
    ]),
    .tophat: Wearable(label: "Top hat", colours: colours("#2f2b36", "#d94f5c", "#2f2b36"), shapes: [
        oval(.main, 0, 0.12, 0.9, 0.17),
        poly(.main, (-0.5, 0.12), (-0.56, -1.05), (0.56, -1.05), (0.5, 0.12)),
        poly(.trim, (-0.51, -0.06), (-0.52, -0.3), (0.52, -0.3), (0.51, -0.06)),
    ]),
    .crown: Wearable(label: "Crown", colours: colours("#ffcf3f", "#e6a52a", "#e2435a"), shapes: [
        poly(.main, (-0.62, 0.22), (-0.66, -0.48), (-0.33, -0.14), (0, -0.6), (0.33, -0.14), (0.66, -0.48), (0.62, 0.22)),
        poly(.trim, (-0.63, 0.04), (0.63, 0.04), (0.62, 0.22), (-0.62, 0.22)),
        oval(.accent, 0, -0.06, 0.12),
        oval(.accent, -0.4, 0.13, 0.07),
        oval(.accent, 0.4, 0.13, 0.07),
    ]),
    .cap: Wearable(label: "Cap", colours: colours("#e2435a", "#b8303f", "#f4f1ea"), shapes: [
        poly(.trim, (0.45, 0.28), (1.55, 0.34), (1.5, 0.5), (0.45, 0.5)),
        poly(.main, dome(0, 0.48, 0.92, 0.74)),
        oval(.accent, 0, -0.26, 0.1),
    ]),
    .nightcap: Wearable(label: "Nightcap", colours: colours("#7d8fe0", "#f4f1ea", "#ffe27a"), shapes: [
        poly(.main, (-0.86, 0.5), (0.86, 0.5), (0.62, -0.35), (0.05, -0.62), (-0.7, -0.75), (-1.3, -0.25), (-1.0, 0.1)),
        poly(.trim, (-0.92, 0.3), (0.92, 0.3), (0.92, 0.6), (-0.92, 0.6)),
        oval(.accent, -1.32, -0.18, 0.22),
    ]),
    .headphones: Wearable(label: "Headphones", colours: colours("#33363f", "#5a5f6d", "#58c4a8"), shapes: [
        poly(.main, arc(0, 1, 1.12, 0.94, 165, 15)),
        oval(.trim, -1.0, 0.72, 0.26, 0.32),
        oval(.accent, -0.98, 0.72, 0.15, 0.22),
        oval(.trim, 1.0, 0.68, 0.2, 0.28),
    ]),
    .wizard: Wearable(label: "Wizard hat", colours: colours("#4b3a9c", "#ffd84a", "#ffd84a"), shapes: [
        oval(.main, 0, 0.2, 1.15, 0.2),
        poly(.main, (-0.62, 0.2), (0.6, 0.2), (0.28, -0.55), (-0.15, -1.05), (-0.7, -1.3), (-0.42, -0.62)),
        poly(.trim, (-0.6, 0.02), (0.58, 0.02), (0.5, -0.14), (-0.56, -0.14)),
        oval(.accent, 0.08, -0.42, 0.13),
        oval(.accent, -0.68, -1.28, 0.12),
    ]),
    .bow: Wearable(label: "Bow", colours: colours("#ff7ab0", "#d94f8a", "#ffffff"), shapes: [
        poly(.main, (0.32, 0.05), (-0.25, -0.32), (-0.2, 0.34)),
        poly(.main, (0.32, 0.05), (0.9, -0.3), (0.86, 0.38)),
        oval(.trim, 0.32, 0.05, 0.15),
    ]),
    .cowboy: Wearable(label: "Cowboy hat", colours: colours("#a5693a", "#5b3820", "#ffd84a"), shapes: [
        // The brim, turned up at the sides, then the crown with its dent.
        poly(.main, (-1.55, -0.12), (-1.25, 0.2), (0, 0.32), (1.25, 0.2), (1.55, -0.12), (1.15, 0.04), (0, 0.12), (-1.15, 0.04)),
        poly(.main, (-0.6, 0.1), (-0.68, -0.55), (-0.3, -0.78), (0, -0.6), (0.3, -0.78), (0.68, -0.55), (0.6, 0.1)),
        poly(.trim, (-0.62, -0.06), (0.62, -0.06), (0.6, 0.1), (-0.6, 0.1)),
        oval(.accent, 0.32, 0.02, 0.09),
    ]),
    .chef: Wearable(label: "Chef’s hat", colours: colours("#fbfaf5", "#d9d8d0", "#d9d8d0"), shapes: [
        oval(.main, -0.5, -0.62, 0.48, 0.42),
        oval(.main, 0.5, -0.62, 0.48, 0.42),
        oval(.main, 0, -0.9, 0.55, 0.45),
        poly(.main, (-0.66, 0.24), (-0.72, -0.5), (0.72, -0.5), (0.66, 0.24)),
        poly(.trim, (-0.3, 0.2), (-0.32, -0.42), (-0.22, -0.42), (-0.2, 0.2)),
        poly(.trim, (0.2, 0.2), (0.22, -0.42), (0.32, -0.42), (0.3, 0.2)),
    ]),
    .pirate: Wearable(label: "Pirate hat", colours: colours("#26222c", "#e2b33c", "#f4f1ea"), shapes: [
        poly(.main, (-1.25, 0.18), (-0.95, -0.6), (-0.35, -0.38), (0, -0.68), (0.35, -0.38), (1.0, -0.6), (1.25, 0.18)),
        poly(.trim, (-1.25, 0.18), (1.25, 0.18), (1.14, 0.03), (-1.14, 0.03)),
        // A little skull and crossbones.
        poly(.accent, (-0.3, -0.02), (-0.26, -0.1), (0.26, -0.3), (0.3, -0.22)),
        poly(.accent, (0.3, -0.02), (0.26, -0.1), (-0.26, -0.3), (-0.3, -0.22)),
        oval(.accent, 0, -0.3, 0.17, 0.15),
    ]),
    .viking: Wearable(label: "Viking helmet", colours: colours("#a3abb8", "#6c7382", "#f1e6c8"), shapes: [
        // Horns out either side, then the helmet over them.
        poly(.accent, (-0.7, 0.1), (-1.08, -0.12), (-1.32, -0.55), (-1.3, -0.95), (-1.08, -0.5), (-0.66, -0.26)),
        poly(.accent, (0.7, 0.1), (1.08, -0.12), (1.32, -0.55), (1.3, -0.95), (1.08, -0.5), (0.66, -0.26)),
        poly(.main, dome(0, 0.42, 0.95, 0.95)),
        poly(.trim, (-1.0, 0.24), (1.0, 0.24), (1.0, 0.5), (-1.0, 0.5)),
        poly(.trim, (-0.08, 0.24), (-0.08, -0.5), (0.08, -0.5), (0.08, 0.24)),
    ]),
    .santa: Wearable(label: "Santa hat", colours: colours("#d9333f", "#fbfaf5", "#fbfaf5"), shapes: [
        // Flopping over to the back, a pompom on the end.
        poly(.main, (-0.88, 0.45), (0.88, 0.45), (0.7, -0.4), (0.1, -0.85), (-0.75, -0.95), (-1.35, -0.55), (-1.2, -0.3), (-0.9, -0.2)),
        poly(.trim, (-0.98, 0.25), (0.98, 0.25), (0.98, 0.62), (-0.98, 0.62)),
        oval(.accent, -1.32, -0.42, 0.25),
    ]),
    .propeller: Wearable(label: "Propeller cap", colours: colours("#e2435a", "#ffd23f", "#4d8fd6"), shapes: [
        poly(.main, dome(0, 0.48, 0.94, 0.8)),
        poly(.trim, (-0.32, 0.48), (-0.2, -0.3), (0.2, -0.3), (0.32, 0.48)),
        poly(.trim, (-0.05, -0.3), (-0.05, -0.62), (0.05, -0.62), (0.05, -0.3)),
        oval(.accent, -0.36, -0.66, 0.36, 0.09),
        oval(.accent, 0.36, -0.66, 0.36, 0.09),
        oval(.trim, 0, -0.66, 0.09),
    ]),
    .graduate: Wearable(label: "Graduation cap", colours: colours("#26222c", "#3a3542", "#ffd23f"), shapes: [
        poly(.trim, (-0.62, 0.28), (-0.62, -0.32), (0.62, -0.32), (0.62, 0.28)),
        poly(.main, (-1.2, -0.32), (0, -0.62), (1.2, -0.32), (0, -0.08)),
        // The tassel, hanging off one corner.
        poly(.accent, (-0.02, -0.38), (0.02, -0.4), (0.98, -0.3), (0.98, -0.2)),
        poly(.accent, (0.92, -0.28), (1.02, -0.28), (1.02, 0.18), (0.92, 0.18)),
        oval(.accent, 0.97, 0.24, 0.1, 0.13),
    ]),
    .flowers: Wearable(label: "Flower crown", colours: colours("#ff8fb8", "#9bd0ff", "#ffe066"), shapes: [
        poly(.trim, arc(0, 1, 1.04, 0.9, 160, 20)),
        oval(.main, -0.82, 0.32, 0.24),
        oval(.trim, -0.4, 0.0, 0.24),
        oval(.main, 0.05, -0.08, 0.26),
        oval(.trim, 0.5, 0.02, 0.24),
        oval(.main, 0.86, 0.34, 0.22),
        oval(.accent, -0.82, 0.32, 0.09),
        oval(.accent, -0.4, 0.0, 0.09),
        oval(.accent, 0.05, -0.08, 0.1),
        oval(.accent, 0.5, 0.02, 0.09),
        oval(.accent, 0.86, 0.34, 0.08),
    ]),
    .sombrero: Wearable(label: "Sombrero", colours: colours("#f0c66a", "#e2435a", "#3fae6a"), shapes: [
        oval(.main, 0, 0.14, 1.75, 0.26),
        poly(.main, (-0.6, 0.14), (-0.5, -0.6), (-0.25, -0.86), (0.25, -0.86), (0.5, -0.6), (0.6, 0.14)),
        poly(.trim, (-0.58, -0.02), (0.58, -0.02), (0.6, 0.14), (-0.6, 0.14)),
        poly(.accent, (-0.55, -0.24), (0.55, -0.24), (0.57, -0.1), (-0.57, -0.1)),
        poly(.trim, (-1.6, 0.2), (1.6, 0.2), (1.5, 0.3), (-1.5, 0.3)),
    ]),
    .beret: Wearable(label: "Beret", colours: colours("#2f2b36", "#2f2b36", "#2f2b36"), shapes: [
        // Tilted over to one side, a little stalk on top.
        oval(.main, -0.18, 0.04, 1.1, 0.45),
        poly(.main, (-0.98, 0.28), (0.8, 0.28), (0.6, 0.48), (-0.85, 0.46)),
        poly(.accent, (-0.06, -0.38), (0.02, -0.62), (0.12, -0.6), (0.06, -0.36)),
    ]),
]

/// A shirt laid out flat, for pictures of clothes: sleeves out, the neck at the top.
private let SHIRT: [(Double, Double)] = [(-0.35, -0.6), (-1.1, -0.25), (-0.85, 0.15), (-0.6, 0), (-0.6, 0.95), (0.6, 0.95), (0.6, 0), (0.85, 0.15), (1.1, -0.25), (0.35, -0.6), (0, -0.42)]
private func band(_ paint: Paint, _ y0: Double, _ y1: Double, _ x0: Double = -0.6, _ x1: Double = 0.6) -> WearShape { poly(paint, (x0, y0), (x1, y0), (x1, y1), (x0, y1)) }

/// A collar band round the neck, `h` either side of its middle.
private func neckband(_ paint: Paint, _ h: Double = 0.24) -> WearShape { poly(paint, (-1.05, -h), (1.05, -h), (1.05, h), (-1.05, h)) }

public let OUTFIT_ITEMS: [Outfit: Wearable] = [
    .dino: Wearable(
        label: "Dino onesie", colours: colours("#5fbf5a", "#d4f0a6", "#f59f3a"),
        shapes: [neckband(.main)],
        body: BodyWear(covered: true, sleeves: 1, onesie: true, patch: .trim, spikes: .init(paint: .accent, count: 4)),
        hood: [
            poly(.accent, (-0.62, 0.16), (-0.42, -0.3), (-0.2, 0.04)),
            poly(.accent, (-0.2, 0.02), (0.04, -0.44), (0.28, 0.02)),
            poly(.accent, (0.28, 0.06), (0.5, -0.3), (0.7, 0.18)),
        ],
        icon: [
            poly(.accent, (-0.6, -0.5), (-0.42, -0.95), (-0.22, -0.55)),
            poly(.accent, (-0.18, -0.55), (0.02, -1.0), (0.22, -0.55)),
            poly(.accent, (0.22, -0.55), (0.42, -0.95), (0.6, -0.5)),
            poly(.main, SHIRT),
            oval(.trim, 0, 0.35, 0.36, 0.48),
        ]
    ),
    .bee: Wearable(
        label: "Bee costume", colours: colours("#ffd23f", "#eaf6ff", "#2b2630"),
        shapes: [neckband(.accent, 0.18)],
        body: BodyWear(covered: true, sleeves: 0.5, bands: .init(paint: .accent, count: 3, width: 0.11), onesie: true, wings: .trim),
        hood: [
            poly(.accent, (-0.26, 0.08), (-0.12, 0.08), (-0.38, -0.62), (-0.52, -0.56)),
            oval(.accent, -0.48, -0.66, 0.15),
            poly(.accent, (0.14, 0.08), (0.28, 0.08), (0.52, -0.56), (0.38, -0.62)),
            oval(.accent, 0.46, -0.66, 0.15),
        ],
        icon: [
            oval(.trim, -0.72, -0.45, 0.42, 0.3),
            oval(.trim, 0.72, -0.45, 0.42, 0.3),
            poly(.main, SHIRT),
            band(.accent, -0.1, 0.12),
            band(.accent, 0.42, 0.64),
        ]
    ),
    .astronaut: Wearable(
        label: "Space suit", colours: colours("#f1f3f6", "#9aa6b6", "#e2435a"),
        shapes: [neckband(.trim, 0.3)],
        body: BodyWear(covered: true, sleeves: 1, buttons: true, onesie: true, patch: .trim, pack: .trim),
        // A glass bubble of a helmet: just its rim shows, and a glint on it.
        hood: [poly(.trim, arc(0, 0.85, 1.46, 1.38, -58, 238, 28)), oval(.main, 0.7, -0.18, 0.1, 0.16), oval(.main, 0.92, 0.0, 0.07)],
        icon: [
            poly(.main, SHIRT),
            band(.trim, -0.1, 0.4, -0.32, 0.32),
            oval(.accent, -0.16, 0.15, 0.08),
            oval(.accent, 0.16, 0.15, 0.08),
            band(.trim, 0.62, 0.74),
        ]
    ),
    .knight: Wearable(
        label: "Knight armour", colours: colours("#c3cad6", "#7f8a9b", "#d63a4a"),
        shapes: [neckband(.trim, 0.28)],
        body: BodyWear(covered: true, sleeves: 1, bands: .init(paint: .trim, count: 3, width: 0.05), onesie: true),
        hood: [
            poly(.accent, (-0.15, -0.2), (0.2, -0.6), (-0.4, -0.85), (-0.95, -0.55), (-0.5, -0.12)),
            poly(.main, dome(0, 0.5, 1.04, 0.76)),
            poly(.trim, (-1.0, 0.32), (1.04, 0.32), (1.04, 0.48), (-1.0, 0.48)),
        ],
        icon: [
            poly(.accent, (-0.1, -0.72), (0.3, -1.05), (-0.35, -1.25), (-0.85, -0.95), (-0.4, -0.65)),
            poly(.main, dome(0, 0.7, 0.95, 1.45)),
            poly(.trim, (-0.95, 0.12), (0.95, 0.12), (0.95, 0.3), (-0.95, 0.3)),
            poly(.trim, (-0.08, 0.3), (0.08, 0.3), (0.08, 0.7), (-0.08, 0.7)),
        ]
    ),
    .robe: Wearable(
        label: "Wizard robe", colours: colours("#5a3ea8", "#ffd84a", "#ffd84a"),
        shapes: [neckband(.main, 0.22), oval(.trim, 0.72, 0.06, 0.2)],
        body: BodyWear(covered: true, sleeves: 0.9, stars: .trim, skirt: .init(paint: .main, style: .robe)),
        icon: [
            poly(.main, (-0.35, -0.75), (0.35, -0.75), (0.6, -0.3), (1.0, -0.05), (0.75, 0.15), (0.65, 0.05), (0.95, 1.0), (-0.95, 1.0), (-0.65, 0.05), (-0.75, 0.15), (-1.0, -0.05), (-0.6, -0.3)),
            oval(.trim, 0, -0.62, 0.13),
            oval(.trim, -0.3, 0.2, 0.09),
            oval(.trim, 0.32, 0.5, 0.09),
            oval(.trim, -0.1, 0.78, 0.07),
        ]
    ),
    .tutu: Wearable(
        label: "Tutu", colours: colours("#ff8fc0", "#ffd0e6", "#ffffff"),
        shapes: [poly(.main, (-1.0, -0.14), (1.0, -0.14), (1.0, 0.14), (-1.0, 0.14))],
        body: BodyWear(covered: true, sleeves: 0, skirt: .init(paint: .trim, style: .tutu)),
        icon: [
            poly(.main, (-0.5, -0.8), (-0.3, -0.8), (-0.15, -0.55), (0.15, -0.55), (0.3, -0.8), (0.5, -0.8), (0.45, 0.2), (-0.45, 0.2)),
            oval(.trim, 0, 0.35, 1.05, 0.3),
            oval(.accent, 0, -0.2, 0.08),
        ]
    ),
    .suit: Wearable(
        label: "Suit and tie", colours: colours("#2f3440", "#f7f5ef", "#c8323e"),
        shapes: [
            // Shirt collar points, then the tie: its knot and blade down the chest.
            poly(.trim, (0.25, -0.3), (0.95, -0.25), (0.6, 0.3)),
            poly(.accent, (0.68, -0.12), (1.0, -0.12), (0.94, 0.2), (0.74, 0.2)),
            poly(.accent, (0.74, 0.2), (0.94, 0.2), (1.06, 1.25), (0.86, 1.55), (0.66, 1.25)),
        ],
        body: BodyWear(covered: true, sleeves: 0.6, shirt: true),
        icon: [
            poly(.main, SHIRT),
            poly(.trim, (-0.32, -0.58), (0.32, -0.58), (0, 0.32)),
            poly(.accent, (-0.08, -0.5), (0.08, -0.5), (0.12, 0.2), (0, 0.36), (-0.12, 0.2)),
        ]
    ),
    .pajamas: Wearable(
        label: "Pajamas", colours: colours("#9cc1ee", "#f7f5ef", "#ffd84a"),
        shapes: [poly(.trim, (-1.05, -0.2), (1.05, -0.2), (1.05, 0.16), (-1.05, 0.16))],
        body: BodyWear(covered: true, sleeves: 0.78, bands: .init(paint: .trim, count: 5, width: 0.08), buttons: true),
        icon: [
            poly(.main, SHIRT),
            band(.trim, -0.45, 0.95, -0.36, -0.28),
            band(.trim, -0.45, 0.95, 0.28, 0.36),
            oval(.accent, 0.08, -0.15, 0.07),
            oval(.accent, 0.08, 0.2, 0.07),
            oval(.accent, 0.08, 0.55, 0.07),
        ]
    ),
    .sweater: Wearable(
        label: "Sweater", colours: colours("#d9534f", "#f4f1ea", "#f4f1ea"),
        shapes: [poly(.main, (-1.08, -0.3), (1.08, -0.3), (1.08, 0.25), (-1.08, 0.25))],
        body: BodyWear(covered: true, sleeves: 0.55, bands: .init(paint: .trim, count: 2, width: 0.12)),
        icon: [poly(.main, SHIRT), band(.trim, 0.12, 0.28), band(.trim, 0.5, 0.66), band(.trim, -0.62, -0.5, -0.32, 0.32)]
    ),
    .cape: Wearable(
        label: "Superhero cape", colours: colours("#d63a4a", "#ffcf3f", "#8e2230"),
        shapes: [oval(.trim, 0.7, 0.05, 0.26)],
        body: BodyWear(covered: false, sleeves: 0, cape: true),
        icon: [poly(.main, (-0.42, -0.6), (0.42, -0.6), (0.9, 0.95), (-0.9, 0.95)), poly(.accent, (-0.2, -0.45), (0.2, -0.45), (0.5, 0.82), (-0.5, 0.82)), oval(.trim, 0, -0.58, 0.15)]
    ),
    .scarf: Wearable(label: "Scarf", colours: colours("#e2435a", "#f4f1ea", "#e2435a"), shapes: [
        poly(.main, (-1.1, -0.42), (1.1, -0.42), (1.1, 0.42), (-1.1, 0.42)),
        poly(.trim, (-1.1, -0.06), (1.1, -0.06), (1.1, 0.1), (-1.1, 0.1)),
        poly(.main, (0.25, 0.2), (0.95, 0.2), (0.9, 1.75), (0.3, 1.7)),
        poly(.trim, (0.29, 1.25), (0.92, 1.28), (0.91, 1.45), (0.3, 1.42)),
    ]),
    .bowtie: Wearable(label: "Bow tie", colours: colours("#d94f5c", "#9e2c3a", "#d94f5c"), shapes: [
        poly(.main, (0.85, 0.15), (0.25, -0.35), (0.25, 0.65)),
        poly(.main, (0.85, 0.15), (1.45, -0.35), (1.45, 0.65)),
        oval(.trim, 0.85, 0.15, 0.19),
    ]),
    .bandana: Wearable(label: "Bandana", colours: colours("#3f7fd0", "#f4f1ea", "#f4f1ea"), shapes: [
        poly(.main, (-1.02, -0.24), (1.02, -0.24), (1.02, 0.2), (-1.02, 0.2)),
        poly(.main, (-0.15, 0.0), (1.2, 0.0), (0.72, 1.35)),
        oval(.trim, 0.42, 0.28, 0.09),
        oval(.trim, 0.82, 0.3, 0.09),
        oval(.trim, 0.66, 0.7, 0.09),
    ]),
    .collar: Wearable(label: "Collar and bell", colours: colours("#d94f5c", "#a8323e", "#ffcf3f"), shapes: [
        poly(.main, (-1.02, -0.22), (1.02, -0.22), (1.02, 0.22), (-1.02, 0.22)),
        oval(.accent, 0.92, 0.55, 0.34),
    ]),
]

public func hatItem(_ hat: Hat) -> Wearable? { hat == .none ? nil : HAT_ITEMS[hat] }
public func outfitItem(_ outfit: Outfit) -> Wearable? { outfit == .none ? nil : OUTFIT_ITEMS[outfit] }

/// The box a picture of the item fits in, for its tile in the settings: fitted round its own
/// shapes (its `icon` if it has one), padded, and widened to the tile's 34 by 26.
public func wearableIconBox(_ item: Wearable) -> (shapes: [WearShape], box: Rect) {
    var xs: [Double] = []
    var ys: [Double] = []
    let shapes = item.icon ?? item.shapes
    for s in shapes {
        switch s {
        case let .poly(points, _):
            for p in points {
                xs.append(p.x)
                ys.append(p.y)
            }
        case let .ellipse(cx, cy, rx, ry, _):
            xs.append(contentsOf: [cx - rx, cx + rx])
            ys.append(contentsOf: [cy - ry, cy + ry])
        }
    }
    let pad = 0.15
    let x0 = xs.jsMin - pad
    let y0 = ys.jsMin - pad
    var w = xs.jsMax - x0 + pad
    var h = ys.jsMax - y0 + pad
    let aspect = 34.0 / 26.0
    let cx = x0 + w / 2
    let cy = y0 + h / 2
    if w / h < aspect { w = h * aspect } else { h = w / aspect }
    return (shapes, Rect(x: cx - w / 2, y: cy - h / 2, width: w, height: h))
}
