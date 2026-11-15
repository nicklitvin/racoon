import Foundation

// Draws a pixel-art pet from the same poses as the chibis (src/sprites/pixel/draw.ts): the same
// big head, bean body, stubby legs and tail, but rasterised into a small grid of whole pixels
// with a one-pixel outline, flat colours and a lit top edge, like a sprite from an old handheld.

/// The picture's size in pixels, where the feet are in it, and pixels per chibi drawing unit.
public enum PIXEL {
    public static let width = 64
    public static let height = 54
    public static let feetX = 32.0
    public static let feetY = 46.0
    public static let k = 0.5
}

/// Bands across the tail (from 0 at the root to 1 at the tip).
public let TAIL_BANDS: [ChibiSpecies: [(Double, Double)]] = [
    .raccoon: [(0.3, 0.42), (0.55, 0.67), (0.8, 1.01)],
    .cat: [(0.42, 0.5), (0.67, 0.75)],
    .otter: [],
    // A bunny's is all white, a cotton ball.
    .bunny: [(0, 1.01)],
    .hedgehog: [],
]

public struct EarSpec {
    public enum Kind { case point, round, long }
    public var kind: Kind
    public var w: Double
    public var h: Double
    public var near: Double
    public var far: Double
}

/// Ears: pointed, round or long (a bunny's), their half width and height at the base, and
/// where on the head they sit (degrees, 90 = top).
public let EARS: [ChibiSpecies: EarSpec] = [
    .cat: EarSpec(kind: .point, w: 6.4, h: 10.5, near: 58, far: 122),
    .raccoon: EarSpec(kind: .point, w: 6.6, h: 9.5, near: 56, far: 124),
    .otter: EarSpec(kind: .round, w: 3.6, h: 3.4, near: 42, far: 138),
    .bunny: EarSpec(kind: .long, w: 3.8, h: 25, near: 96, far: 120),
    .hedgehog: EarSpec(kind: .round, w: 2.4, h: 2.2, near: 84, far: 100),
]

/// Where the eyes are on the face, far one first, in head radii.
public let EYES: [ChibiSpecies: [Pt]] = [
    .raccoon: [pt(-0.18, 0.04), pt(0.4, 0.06)],
    .cat: [pt(-0.18, 0.04), pt(0.4, 0.06)],
    .otter: [pt(-0.18, 0.04), pt(0.4, 0.06)],
    // A bunny's and a hedgehog's eyes are on the sides of their heads: side on, you see one.
    .bunny: [pt(-0.16, 0.02), pt(0.2, -0.06)],
    .hedgehog: [pt(0.1, -0.02), pt(0.4, -0.12)],
]

/// Animals with an eye on each side of the head: side on, only the near one shows.
private let SIDE_EYED: Set<ChibiSpecies> = [.bunny, .hedgehog]

/// Cheek tufts: [angle round the head, how far out].
private let TUFTS: [ChibiSpecies: [(Double, Double)]] = [
    .raccoon: [(205, 0.2), (335, 0.16)],
    .cat: [(205, 0.08), (330, 0.08)],
    .otter: [],
    .bunny: [],
    .hedgehog: [],
]

/// The palette slot for each of an item's paints, for a hat or for clothes.
public enum PaintSlots {
    case hat, wear
    public func slot(_ paint: Paint) -> Int {
        switch (self, paint) {
        case (.hat, .main): return C.hatMain
        case (.hat, .trim): return C.hatTrim
        case (.hat, .accent): return C.hatAccent
        case (.wear, .main): return C.wearMain
        case (.wear, .trim): return C.wearTrim
        case (.wear, .accent): return C.wearAccent
        }
    }
}

/// Samples a quadratic Bezier, for turning the chibi's curved markings into polygons.
private func quad(_ a: Pt, _ c: Pt, _ b: Pt, _ steps: Int = 4) -> [Pt] {
    (1...steps).map { i in
        let t = Double(i) / Double(steps)
        return Pt(x: pow(1 - t, 2) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: pow(1 - t, 2) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y)
    }
}

/// A path of [start, (control, end)...] in head radii, as a polygon.
private func curvy(_ points: [(Double, Double)], _ rx: Double, _ ry: Double) -> [Pt] {
    let p = points.map { Pt(x: $0.0 * rx, y: $0.1 * ry) }
    var out = [p[0]]
    var i = 1
    while i + 1 < p.count {
        out.append(contentsOf: quad(out[out.count - 1], p[i], p[i + 1]))
        i += 2
    }
    return out
}

/// Three-quarter views, for going diagonally: towards you (down the screen) or away (up it).
public enum Quarter { case front, back }

/// In a three-quarter view the body is this much shorter, end on to you.
public let QUARTER_SQUASH = 0.62

/// Draws the pet into `r` (cleared first) and returns the box round the figure itself, for
/// grabbing it. `facing` -1 mirrors it to face left; the marks over its head stay readable.
/// `quarter` turns him three-quarters towards you or away from you.
public func drawPixelPet(_ r: Raster, _ b: ChibiBuild, _ p: ChibiPose, _ clock: Double, _ facing: Double, _ moving: Double, _ scruff: Pt, _ dress: Dress = UNDRESSED, _ quarter: Quarter? = nil) -> Box? {
    let FX = PIXEL.feetX, FY = PIXEL.feetY, K = PIXEL.k
    let species = b.species
    r.clear()

    // Carried, the whole figure swings about the scruff.
    let sw = p.swing * DEG
    let cs = cos(sw)
    let ss = sin(sw)
    let squash = quarter != nil ? QUARTER_SQUASH : 1
    let behind = quarter == .back
    /// A point in drawing units to pixels.
    func T(_ u: Pt) -> Pt {
        var x = u.x, y = u.y
        if sw != 0 {
            let dx = x - scruff.x
            let dy = y - scruff.y
            x = scruff.x + dx * cs - dy * ss
            y = scruff.y + dx * ss + dy * cs
        }
        return Pt(x: FX + x * K * squash, y: FY + y * K)
    }

    let frame = bodyFrame(b, p)
    let bodyAngle = -p.rot * DEG + sw
    let wet = p.wet > 0.5

    // --- The shadow, and the far side of the pond ---
    let lifted = clamp01(-p.lift / 26)
    let hidden = p.swing != 0 || wet || p.paws.frontNear.y < -b.peekSink + 2
    if !hidden {
        let at = T(pt(-2, 0.5))
        r.shape(ellipse(at.x, at.y, (b.body.rx * squash + 7) * K * (1 - lifted * 0.6), 1.4), C.shadow, nil)
    }
    // A hedgehog rolled up is just its spiky ball (it's still held by its middle).
    if p.ball > 0.5 {
        let at = T(pt(frame.cx, frame.cy))
        let R = ballRadius(b)
        drawSpikyBall(r, at, R * K, p.sx, p.sy, p.roll, moving < 0.2)
        if facing < 0 { r.mirror(FX) }
        let box = r.bounds { $0 == C.shadow }
        drawMarks(r, p.mark, pt(FX + frame.cx * K * facing, FY + (frame.cy - R - 6) * K), facing, clock)
        return box
    }
    let pond = (cx: -3 - moving * 4, rx: 34 + moving * 6, ry: 7.0)
    if wet {
        let at = T(pt(pond.cx, WATER_Y))
        r.shape(ellipse(at.x, at.y, pond.rx * K, pond.ry * K), C.water, C.waterDark, shade: Shade(light: C.waterLight, dark: C.water))
        // In the water, whatever of it is under the surface is out of sight.
        r.clipBelow = floor(FY + (WATER_Y + 1.6) * K)
    }

    // --- Tail ---
    func tailShape() -> Tube {
        let root = frame.at(b.tail.root)
        let count = 12
        let step = b.tail.length / Double(count)
        var spine = [T(root)]
        var at = root
        for i in 1...count {
            let s = Double(i) / Double(count)
            let a = (p.tailA + p.rot + p.tailCurl * pow(s, 1.4)) * DEG
            at = Pt(x: at.x + cos(a) * step, y: at.y - sin(a) * step)
            spine.append(T(at))
        }
        let radii = spine.indices.map { i in Swift.max(0.6, b.tail.radius(Double(i) / Double(count)) * p.tailPuff * K) }
        return tube(spine, radii)
    }
    func drawTail() {
        if b.tail.length <= 0 { return }
        let t = tailShape()
        let bands = TAIL_BANDS[species] ?? []
        r.shape(t.sd, t.box, .each { x, y in
            let s = t.at(x, y)
            return bands.contains { s >= $0.0 && s < $0.1 } ? C.band : C.fur
        }, C.outline)
    }
    // Going away from you, his tail is the nearest thing to you: it comes after his body.
    if p.tailFront <= 0.5 && !behind { drawTail() }

    // What he's wearing on his body, if anything.
    let clothes = outfitItem(dress.outfit)?.body
    let covered = clothes?.covered == true

    // --- Legs ---
    func raised(_ leg: LegName) -> Bool { (leg == .frontNear && p.pawUp > 0.5) || (leg == .frontFar && p.pawUp > 1.5) }
    func drawLeg(_ leg: LegName) {
        let root = T(legRoot(b, p, leg))
        let paw = T(pt(p.paws[leg].x, p.paws[leg].y + p.lift))
        let front = leg.isFront
        let w = (b.legWidth / 2) * K * (species == .bunny && front ? 0.8 : 1)
        let far = leg.isFar
        let c = capsule(root, paw, w)
        let colour = species == .hedgehog ? (far ? C.dark : C.furDark) : far ? C.far : C.fur
        r.shape(c, colour, C.outline)
        if species == .bunny && !front {
            // A big flat hind foot: along the floor from the heel, or trailing out behind in a hop.
            let air = clamp01(-(p.paws[leg].y + p.lift) / 3)
            let dx = paw.x - root.x
            let dy = paw.y - root.y
            let d0 = hypot(dx, dy)
            let d = d0 == 0 ? 1 : d0
            let ax = 1 + (dx / d - 1) * air * 0.8
            let ay = (dy / d) * air * 0.8
            let a0 = hypot(ax, ay)
            let a = a0 == 0 ? 1 : a0
            let length = 6.5 * K
            let toe = Pt(x: paw.x + (ax / a) * length, y: paw.y + (ay / a) * length)
            r.shape(capsule(Pt(x: paw.x - 0.5, y: paw.y), toe, w, w * 0.8), colour, C.outline)
        }
        // Sleeves and trouser legs, down to the cuffs.
        if let clothes, clothes.sleeves > 0 {
            let k = clothes.sleeves
            let cuff = Pt(x: root.x + (paw.x - root.x) * k, y: root.y + (paw.y - root.y) * k)
            let sleeve = capsule(root, cuff, w + 0.5)
            r.shape(intersect(sleeve.sd, c.sd), sleeve.box, .colour(far ? C.wearDark : C.wearMain), nil)
        }
    }
    for leg in [LegName.backFar, .frontFar] where !raised(leg) { drawLeg(leg) }
    for leg in [LegName.backNear, .frontNear] where !raised(leg) { drawLeg(leg) }

    // --- Body ---
    let bc = T(pt(frame.cx, frame.cy))
    let sx = abs(p.sx)
    let sy = abs(p.sy)
    let B = b.body

    /// Little + stars at these places on the body (in body radii).
    func sprinkle(_ colour: Int, _ at: [(Double, Double)]) {
        for (x, y) in at {
            let q = T(frame.at(pt(B.rx * x, B.ry * y)))
            let c = Pt(x: floor(q.x), y: floor(q.y))
            r.dots([c, pt(c.x - 1, c.y), pt(c.x + 1, c.y), pt(c.x, c.y - 1), pt(c.x, c.y + 1)], colour)
        }
    }
    /// Spikes standing up along his back, from his hips to his shoulders.
    func drawSpikes(_ spikes: BodyWear.Spikes) {
        for i in 0..<spikes.count {
            let x = -0.9 + (1.25 * (Double(i) + 0.5)) / Double(spikes.count)
            func edge(_ u: Double) -> Double { -Swift.max(0, 1 - u * u).squareRoot() * 0.92 }
            let w = 0.2
            let spike = polygon([
                pt(B.rx * (x - w), B.ry * edge(x - w)),
                pt(B.rx * (x - 0.08), B.ry * (edge(x) - 0.8)),
                pt(B.rx * (x + w), B.ry * edge(x + w)),
            ].map { T(frame.at($0)) })
            r.shape(spike, PaintSlots.wear.slot(spikes.paint), C.outline)
        }
    }
    /// A little wing on his back, buzzing as he goes (slowly as he stands).
    func drawWing(_ paint: Paint, _ far: Bool) {
        let beat = moving > 0.1 ? sin(clock / 35) * 0.5 : sin(clock / 400) * 0.15
        let root = T(frame.at(pt(-B.rx * (far ? 0.2 : 0.35), -B.ry * 1.0)))
        let a = bodyAngle - (far ? 1.2 : 0.8) + beat
        let len = B.rx * 0.75 * K
        let at = Pt(x: root.x - cos(a) * len, y: root.y - sin(a) * len)
        r.shape(ellipse(at.x, at.y, len, B.rx * 0.38 * K, a), PaintSlots.wear.slot(paint), C.outline)
    }

    // A costume's spikes and far wing, behind the body.
    if let spikes = clothes?.spikes { drawSpikes(spikes) }
    if let wings = clothes?.wings { drawWing(wings, true) }
    let body = ellipse(bc.x, bc.y, b.body.rx * sx * K * squash, b.body.ry * sy * K, bodyAngle)
    r.shape(body, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    /// A marking on the body: an ellipse in the body's own frame, cut to the body.
    func bodyMark(_ lx: Double, _ ly: Double, _ rx: Double, _ ry: Double, _ colour: Int) {
        let at = T(frame.at(pt(lx, ly)))
        let e = ellipse(at.x, at.y, rx * sx * K * squash, ry * sy * K, bodyAngle)
        r.shape(intersect(e.sd, body.sd), e.box, .colour(colour), nil)
    }
    // From behind, his tummy and chest are out of sight.
    if !behind { bodyMark(B.rx * 0.2, B.ry * 0.62, B.rx * 0.78, B.ry * 0.55, C.belly) }
    if species == .raccoon && !behind { bodyMark(B.rx * 0.82, B.ry * 0.25, B.rx * 0.38, B.ry * 0.8, C.light) }
    if species == .cat {
        for x in [-0.45, -0.1, 0.25] {
            let a = T(frame.at(pt(B.rx * x - 2, -B.ry - 1)))
            let z = T(frame.at(pt(B.rx * x + 2, -B.ry * 0.4)))
            let stripe = capsule(a, z, 0.5)
            r.shape(intersect(stripe.sd, body.sd), stripe.box, .colour(C.band), nil)
        }
    }
    /// Clothes over the body: the cloth, then stripes, a shirt front and buttons on it.
    func dressBody() {
        guard let clothes else { return }
        r.shape(body, C.wearMain, nil, shade: Shade(light: C.wearLight, dark: C.wearDark))
        func onBody(_ sd: @escaping Sd, _ box: Box, _ colour: Int) { r.shape(intersect(sd, body.sd), box, .colour(colour), nil) }
        if let bands = clothes.bands {
            for i in 0..<bands.count {
                let x = B.rx * (-0.75 + (1.5 * (Double(i) + 0.5)) / Double(bands.count))
                let band = capsule(T(frame.at(pt(x, -B.ry - 2))), T(frame.at(pt(x, B.ry + 2))), Swift.max(0.5, bands.width * B.rx * sx * K))
                onBody(band.sd, band.box, PaintSlots.wear.slot(bands.paint))
            }
        }
        if clothes.shirt {
            let shirt = polygon([frame.at(pt(B.rx * 0.45, -B.ry * 1.1)), frame.at(pt(B.rx * 1.2, -B.ry * 1.1)), frame.at(pt(B.rx * 0.95, B.ry * 0.55))].map(T))
            onBody(shirt.sd, shirt.box, C.wearTrim)
        }
        if let patch = clothes.patch, !behind {
            let at = T(frame.at(pt(B.rx * 0.3, B.ry * 0.45)))
            let e = ellipse(at.x, at.y, B.rx * 0.55 * sx * K * squash, B.ry * 0.42 * sy * K, bodyAngle)
            onBody(e.sd, e.box, PaintSlots.wear.slot(patch))
        }
        if clothes.buttons {
            r.dots([0.15, 0.5, 0.85].map { k in
                let at = T(frame.at(pt(B.rx * (0.62 + 0.1 * k), -B.ry * 0.35 + B.ry * 0.9 * k)))
                return Pt(x: floor(at.x), y: floor(at.y))
            }, C.wearAccent)
        }
        if let stars = clothes.stars { sprinkle(PaintSlots.wear.slot(stars), [(-0.55, -0.35), (0.1, -0.55), (-0.15, 0.3)]) }
    }
    if covered { dressBody() }
    // A bunny's big round haunch shows all the time, sat or not.
    let bunny = species == .bunny
    if p.haunch > 0.5 || bunny {
        let rr = B.ry * (bunny ? 0.8 : 0.62)
        let at = T(frame.at(bunny ? pt(b.hip.x + 1.5, b.hip.y - 4) : pt(b.hip.x + 2, b.hip.y - 2)))
        let e = ellipse(at.x, at.y, rr * sx * K, rr * 0.9 * sy * K, bodyAngle)
        if covered { r.shape(e, C.wearMain, C.outline, shade: Shade(light: C.wearLight, dark: C.wearDark)) }
        else { r.shape(e, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark)) }
    }
    /// A tutu sticking out round his middle, or a robe hanging down to the floor.
    func drawSkirt(_ skirt: BodyWear.Skirt) {
        let colour = PaintSlots.wear.slot(skirt.paint)
        if skirt.style == .tutu {
            let at = T(frame.at(pt(B.rx * 0.05, B.ry * 0.38)))
            let e = ellipse(at.x, at.y, B.rx * 1.2 * sx * K * squash, B.ry * 0.42 * sy * K, bodyAngle)
            r.shape(e, .each { x, y in Int(jsMod(floor(x) + floor(y), 3)) == 0 ? C.wearAccent : colour }, C.outline)
            return
        }
        // Down from his middle to just above his paws, a little wider at the hem.
        let hem = Swift.max(-2.5, frame.cy - p.lift + B.ry * 0.9 + 1)
        let robe = polygon([
            T(frame.at(pt(-B.rx * 0.95, B.ry * 0.05))),
            T(frame.at(pt(B.rx * 0.95, B.ry * 0.05))),
            T(pt(frame.cx + B.rx * 1.05, hem + p.lift)),
            T(pt(frame.cx - B.rx * 1.1, hem + p.lift)),
        ])
        r.shape(robe, colour, C.outline, shade: Shade(light: colour, dark: C.wearDark))
        sprinkle(C.wearTrim, [(0.45, 0.9), (-0.5, 1.15)])
    }
    /// A cape over his back, flying out behind him as he goes.
    func drawCape() {
        let fly = Swift.min(1, moving) * (0.8 + 0.2 * sin(clock / 120))
        let cape = polygon([
            pt(B.rx * 0.55, -B.ry * 1.05),
            pt(-B.rx * 0.5, -B.ry * 1.2 - fly * 2),
            pt(-B.rx * (1.3 + 0.35 * fly), -B.ry * (0.45 + 0.6 * fly)),
            pt(-B.rx * (1.2 + 0.3 * fly), B.ry * (0.75 - 0.6 * fly)),
            pt(-B.rx * 0.35, B.ry * 0.05),
            pt(B.rx * 0.35, -B.ry * 0.35),
        ].map { T(frame.at($0)) })
        r.shape(cape, C.wearMain, C.outline, shade: Shade(light: C.wearLight, dark: C.wearAccent))
    }
    if let skirt = clothes?.skirt { drawSkirt(skirt) }
    if let pack = clothes?.pack {
        let shape = polygon([pt(-B.rx * 0.6, -B.ry * 1.18), pt(B.rx * 0.12, -B.ry * 1.22), pt(B.rx * 0.18, -B.ry * 0.5), pt(-B.rx * 0.55, -B.ry * 0.42)].map { T(frame.at($0)) })
        r.shape(shape, PaintSlots.wear.slot(pack), C.outline)
    }
    if let wings = clothes?.wings { drawWing(wings, false) }
    if clothes?.cape == true { drawCape() }
    if p.tailFront > 0.5 || (behind && p.tailFront <= 0.5) { drawTail() }

    // --- Head ---
    let H = b.head
    let hc = headCentre(b, p)
    let th = -p.hrot * DEG
    let hcos = cos(th)
    let hsin = sin(th)
    let centre = T(hc)
    /// A point on the head (head units from its middle) in pixels. The head is round whichever
    /// way he's turned: only where it is foreshortens, not its shape.
    func onHead(_ l: Pt) -> Pt {
        let lx = l.x * hcos - l.y * hsin
        let ly = l.x * hsin + l.y * hcos
        return Pt(x: centre.x + (lx * cs - ly * ss) * K, y: centre.y + (lx * ss + ly * cs) * K)
    }
    let headAngle = th + sw

    /// Something he's wearing, its units `size` head units across, placed at `origin` on the head.
    func wear(_ item: Wearable?, _ origin: Pt, _ size: Double, _ slots: PaintSlots) {
        guard let item else { return }
        func at(_ x: Double, _ y: Double) -> Pt { onHead(pt(origin.x + x * size, origin.y + y * size)) }
        for s in item.shapes {
            let shape: Shape
            switch s {
            case let .poly(points, _):
                shape = polygon(points.map { at($0.x, $0.y) })
            case let .ellipse(cx, cy, rx, ry, _):
                let c = at(cx, cy)
                shape = ellipse(c.x, c.y, Swift.max(0.6, rx * size * K), Swift.max(0.6, ry * size * K), headAngle)
            }
            r.shape(shape, slots.slot(s.paint), C.outline)
        }
    }
    // Round his neck, under his chin: drawn before the head, so the chin comes over its top.
    wear(outfitItem(dress.outfit), pt(-H.rx * 0.05, H.ry * 1.06), H.rx * NECK_WIDTH, .wear)

    // Ears, behind the head.
    let ear = EARS[species]!
    func drawEar(_ deg: Double, _ near: Bool) {
        let at = Pt(x: cos(deg * DEG) * H.rx * 0.82, y: -sin(deg * DEG) * H.ry * 0.82)
        let outward = (deg - 90) * -0.55
        let back = p.ears < 0 ? p.ears * 40 : p.ears * -8
        let tilt = (outward - back * (near ? 1 : 0.8)) * DEG
        func place(_ l: Pt) -> Pt { onHead(Pt(x: at.x + l.x * cos(tilt) - l.y * sin(tilt), y: at.y + l.x * sin(tilt) + l.y * cos(tilt))) }
        switch ear.kind {
        case .round:
            let c = place(pt(0, -0.6))
            r.shape(ellipse(c.x, c.y, ear.w * K, ear.h * K, headAngle), near ? C.fur : C.far, C.outline)
        case .long:
            // Long and floppy, pink inside: up from the back of the head, laid back when he's
            // wary or tired, swinging back as he springs up and flopping on as he lands.
            let spine = longEar(H.rx, H.ry, ear.h, deg, near, p.ears, p.earFlap).map(onHead)
            let radii = spine.indices.map { i in ear.w * K * (0.5 + 0.55 * sin(Double.pi * Swift.min(1, (Double(i) / Double(spine.count - 1)) * 1.12))) }
            let e = tube(spine, radii)
            r.shape(e.sd, e.box, .colour(near ? C.fur : C.far), C.outline)
            if !behind && near {
                let inside = tube(spine, radii.map { $0 * 0.45 })
                r.shape(intersect(inside.sd, e.sd), inside.box, .each { x, y in inside.at(x, y) > 0.15 && inside.at(x, y) < 0.88 ? C.inner : 0 }, nil)
            }
        case .point:
            func tri(_ size: Double, _ dx: Double = 0, _ dy: Double = 0) -> Shape {
                polygon([pt(-ear.w * size, 1.5), pt(-0.8 * size, -ear.h * size), pt(ear.w * size, 1.5)].map { place(pt($0.x + dx, $0.y + dy)) })
            }
            let outer = tri(1)
            r.shape(outer, near ? C.fur : C.far, C.outline)
            if !behind {
                let inner = tri(0.55)
                r.shape(intersect(inner.sd, outer.sd), inner.box, .colour(C.inner), nil)
            }
        }
    }
    // A hat or a hood goes on over the top of the head; a bunny's long ears poke up in front of it.
    let hatAt = ear.kind == .long ? pt(-H.rx * 0.32, -H.ry * 0.82) : pt(-H.rx * 0.06, -H.ry * 0.9)
    func dressHead() {
        wear(hoodOf(dress), hatAt, H.rx, .wear)
        wear(hatItem(dress.hat), hatAt, H.rx, .hat)
    }
    let earsThrough = ear.kind == .long && (hatItem(dress.hat) != nil || hoodOf(dress) != nil)
    // A hedgehog's ear peeks out from its spines, so it goes on after them.
    if !earsThrough && species != .hedgehog {
        drawEar(ear.far, false)
        drawEar(ear.near, true)
    }

    let rx = H.rx
    let ry = H.ry
    /// A point on the face, with the face turned round towards where he's looking: everything
    /// slides forward, the back of it most, so the near eye and the nose come round to the front.
    func onFace(_ l: Pt) -> Pt {
        let back = 1 - 0.6 * clamp01((l.x / rx + 1) / 2)
        // Three-quarters towards you, his face is turned out to you: the features come in towards the middle.
        let out = quarter == .front ? 0.7 : 1
        return onHead(Pt(x: (l.x + p.turn * rx * 0.3 * back) * out, y: l.y))
    }

    // The head: round, with cheek tufts, a bunny's puffy muzzle, or a hedgehog's pointed snout.
    let skull = ellipse(centre.x, centre.y, H.rx * K, H.ry * K, headAngle)
    let tufts: [Sd] = (TUFTS[species] ?? []).map { tuft in
        let (deg, out) = tuft
        func point(_ a: Double, _ k: Double) -> Pt { onHead(Pt(x: cos(a * DEG) * H.rx * k, y: -sin(a * DEG) * H.ry * k)) }
        return polygon([point(deg - 16, 0.96), point(deg, 1 + out), point(deg + 16, 0.96)]).sd
    }
    var extra: [Shape] = []
    if species == .bunny {
        let m = onFace(pt(rx * 0.5, ry * 0.3))
        extra.append(ellipse(m.x, m.y, rx * 0.62 * K, ry * 0.52 * K, headAngle))
    }
    if species == .hedgehog && !behind { extra.append(capsule(onFace(pt(rx * 0.3, ry * 0.2)), onFace(snoutTip(rx, ry)), ry * 0.62 * K, ry * 0.2 * K)) }
    let head = union([skull.sd] + tufts + extra.map(\.sd))
    let headBox = joinBoxes([Box(x0: skull.box.x0 - 3, y0: skull.box.y0 - 3, x1: skull.box.x1 + 3, y1: skull.box.y1 + 3)] + extra.map(\.box))
    r.shape(head, headBox, .colour(C.fur), C.outline, shade: Shade(light: C.furLight, dark: C.fur))
    let eyeAt = (EYES[species] ?? []).map { Pt(x: $0.x * rx, y: $0.y * ry) }
    /// A marking on the face, cut to the head.
    func faceMark(_ sd: @escaping Sd, _ box: Box, _ colour: Int) { r.shape(intersect(sd, head), box, .colour(colour), nil) }
    func faceEllipse(_ x: Double, _ y: Double, _ ex: Double, _ ey: Double, _ colour: Int) {
        let at = onFace(pt(x, y))
        let e = ellipse(at.x, at.y, ex * K, ey * K, headAngle)
        faceMark(e.sd, e.box, colour)
    }
    func facePoly(_ points: [(Double, Double)], _ colour: Int) {
        let poly = polygon(curvy(points, rx, ry).map(onFace))
        faceMark(poly.sd, poly.box, colour)
    }
    // From behind, there's no face to see.
    if !behind {
        switch species {
        case .raccoon:
            // White brows over the mask, one over each eye.
            faceEllipse(-rx * 0.26, -ry * 0.46, rx * 0.24, ry * 0.15, C.light)
            faceEllipse(rx * 0.5, -ry * 0.5, rx * 0.24, ry * 0.15, C.light)
            facePoly([(-0.62, 0.12), (-0.3, -0.42), (0.1, -0.08), (0.45, -0.5), (0.95, -0.05), (0.7, 0.42), (0.35, 0.38), (0.1, 0.2), (-0.15, 0.4), (-0.5, 0.45), (-0.62, 0.12)], C.dark)
            faceEllipse(rx * 0.62, ry * 0.58, rx * 0.45, ry * 0.32, C.light)
        case .cat:
            for x in [-0.18, 0.04, 0.26] {
                let stripe = capsule(onFace(pt(rx * x, -ry * 1.05)), onFace(pt(rx * x + 0.6, -ry * 0.62)), 0.5)
                faceMark(stripe.sd, stripe.box, C.band)
            }
            faceEllipse(rx * 0.6, ry * 0.55, rx * 0.42, ry * 0.3, C.light)
        case .otter:
            faceEllipse(rx * 0.42, ry * 0.5, rx * 0.72, ry * 0.42, C.light)
        case .bunny:
            // A pale puff of a muzzle, and a pale chin under it.
            faceEllipse(rx * 0.72, ry * 0.36, rx * 0.4, ry * 0.32, C.light)
            faceEllipse(rx * 0.45, ry * 0.72, rx * 0.36, ry * 0.2, C.light)
        case .hedgehog:
            // A paler cheek and snout.
            faceEllipse(rx * 0.75, ry * 0.42, rx * 0.65, ry * 0.36, C.light)
        case .fox:
            break
        }
        let nose = species == .otter ? pt(rx * 0.78, ry * 0.22) : species == .hedgehog ? snoutTip(rx, ry) : species == .bunny ? pt(rx * 1.06, ry * 0.14) : pt(rx * 0.8, ry * 0.3)
        if species == .otter {
            for dx in [-1.9, 1.9] {
                let at = onFace(pt(nose.x + dx * 0.8 - 0.5, nose.y + 2.7))
                r.shape(ellipse(at.x, at.y, 1.3, 1.1), C.light, C.furDark)
            }
        }

        // Eyes.
        func pix(_ l: Pt) -> (x: Int, y: Int) {
            let q = onFace(l)
            return (cell(floor(q.x)), cell(floor(q.y)))
        }
        func dots(_ points: [(Int, Int)], _ c: Int) { for (x, y) in points { r.set(x, y, c) } }
        let lookX = p.lookX > 0.5 ? 1 : p.lookX < -0.5 ? -1 : 0
        let lookY = p.lookY > 0.6 ? 1 : p.lookY < -0.7 ? -1 : 0
        func eye(_ at: Pt) {
            let (x, y) = pix(at)
            switch p.eyes {
            case .closed:
                dots([(x - 1, y), (x, y + 1), (x + 1, y + 1), (x + 2, y)], C.eye)
            case .happy:
                dots([(x - 1, y + 1), (x, y), (x + 1, y), (x + 2, y + 1)], C.eye)
            case .blink:
                dots([(x - 1, y + 1), (x, y + 1), (x + 1, y + 1), (x + 2, y + 1)], C.eye)
            case .open, .wide:
                let wide = p.eyes == .wide
                let ex = x + (wide ? 0 : lookX)
                let ey = y + lookY
                if species == .hedgehog && !wide {
                    // Small and beady.
                    dots([(ex, ey), (ex + 1, ey), (ex, ey - 1)], C.eye)
                    r.set(ex + 1, ey - 1, C.glint)
                    return
                }
                if species == .bunny {
                    // Big, round and dark, with a shine at the top.
                    for cx in [ex - 1, ex, ex + 1] { for cy in [ey - 1, ey, ey + 1] where wide || cx != ex - 1 || cy != ey + 1 { r.set(cx, cy, C.eye) } }
                    r.set(ex + 1, ey - 1, C.glint)
                    return
                }
                let cols = wide ? [ex - 1, ex, ex + 1] : [ex, ex + 1]
                let rows = [ey - 1, ey, ey + 1]
                for cx in cols { for cy in rows { r.set(cx, cy, C.eye) } }
                r.set(cols[cols.count - 1], rows[0], C.glint)
            }
        }
        for e in SIDE_EYED.contains(species) ? Array(eyeAt.dropFirst()) : eyeAt { eye(e) }

        // Nose, mouth and blush.
        let n = pix(nose)
        if species == .hedgehog {
            // A little shiny black button of a nose on the end of its snout.
            dots([(n.x, n.y), (n.x - 1, n.y), (n.x, n.y + 1), (n.x - 1, n.y + 1)], C.nose)
            r.set(n.x - 1, n.y, C.glint)
        } else if species == .bunny {
            // A little pink nose, twitching now and then, over a split lip.
            let twitch = sin(clock / 70) > 0 && jsMod(clock, 2600) < 700 ? 1 : 0
            dots([(n.x - 1, n.y - twitch), (n.x, n.y - twitch), (n.x - 1, n.y + 1 - twitch)], C.nose)
            dots([(n.x - 1, n.y + 2), (n.x - 2, n.y + 3)], C.mouth)
        } else {
            dots(species == .otter ? [(n.x - 1, n.y), (n.x, n.y), (n.x + 1, n.y), (n.x, n.y + 1)] : [(n.x - 1, n.y), (n.x, n.y)], C.nose)
        }
        if p.mouth > 0.12 {
            // Open under the nose.
            let h = 1 + Int(jsRound(p.mouth * 2.5))
            for i in 1...h { dots([(n.x - 1, n.y + i), (n.x, n.y + i)], i == h && p.tongue > 0.25 ? C.tongue : C.mouth) }
        }
        if p.blush >= 0.6 {
            let near = pix(pt(rx * 0.62, ry * 0.42))
            let far = pix(pt(-rx * 0.32, ry * 0.4))
            dots([(near.x, near.y), (near.x + 1, near.y), (far.x, far.y)], C.blush)
        }
    }

    /// A hedgehog's spines: a dome of spikes from its rump up over its back and the top of its
    /// head to its brow, with a fringe along the front edge, and pale-tipped streaks down them.
    func mantle() {
        let cx = B.rx * 0.08
        let cy = -B.ry * 0.12
        let RX = B.rx * 1.1
        let RY = B.ry * 1.2
        let from = 208.0
        let to = 24.0
        let count = 12
        let step = (to - from) / Double(count)
        func round(_ a: Double, _ k: Double) -> Pt { Pt(x: cx + cos(a * DEG) * RX * k, y: cy - sin(a * DEG) * RY * k) }
        func place(_ l: Pt) -> Pt { T(frame.at(l)) }
        var edge = [round(from, 0.95)]
        for i in 0..<count { edge.append(contentsOf: [round(from + step * (Double(i) + 0.5), 1.17), round(from + step * Double(i + 1), 0.95)]) }
        // Underneath: back along the brow and down behind the cheek, then along the flank.
        let under = [pt(B.rx * 0.68, B.ry * 0.05), pt(B.rx * 0.3, B.ry * 0.38), pt(-B.rx * 0.5, B.ry * 0.48), pt(-B.rx * 0.98, B.ry * 0.32)]
        let coat = polygon((edge + under).map(place))
        r.shape(coat, C.dark, C.outline, shade: Shade(light: C.band, dark: C.dark))
        for i in 0..<count {
            let a = from + step * (Double(i) + 0.5)
            let streak = capsule(place(round(a, 0.62)), place(round(a, 1.06)), 0.45)
            r.shape(intersect(streak.sd, coat.sd), streak.box, .colour(C.band), nil)
            if i % 2 == 1 {
                let b2 = from + step * Double(i + 1)
                let inner = capsule(place(round(b2, 0.2)), place(round(b2, 0.55)), 0.45)
                r.shape(intersect(inner.sd, coat.sd), inner.box, .colour(C.band), nil)
            }
        }
    }
    // A hedgehog's coat of spines, over its back and the top of its head, and its little round
    // ear peeking out of the front of it.
    if species == .hedgehog {
        mantle()
        if !earsThrough { drawEar(ear.near, true) }
    }

    // A costume's hood, then a hat, over the ears and the top of the head.
    dressHead()
    if earsThrough {
        drawEar(ear.far, false)
        drawEar(ear.near, true)
    }

    // --- Paws raised in front, and an otter's shell ---
    for leg in [LegName.frontFar, .frontNear] where raised(leg) { drawLeg(leg) }
    if p.shell > 0.5 {
        let chest = T(frame.at(pt(b.shoulder.x - 3, -B.ry * jsSign(p.sy) * 1.05)))
        r.shape(ellipse(chest.x, chest.y - 0.8, 2.3, 1.7, bodyAngle - 10 * DEG), C.shell, C.outline, shade: Shade(light: C.shell, dark: C.shellDark))
    }

    // --- The near side of the pond, over whatever of it is under the surface ---
    if wet {
        r.clipBelow = .infinity
        var crest: [Pt] = []
        for i in 0...16 {
            let x = pond.cx - pond.rx + (pond.rx * 2 * Double(i)) / 16
            let edge = Swift.max(0, 1 - pow((x - pond.cx) / pond.rx, 2)).squareRoot()
            crest.append(T(pt(x, WATER_Y + 0.9 * sin(x * 0.35 + clock / 260) * edge)))
        }
        var below: [Pt] = []
        for i in 1..<16 {
            let a = Double.pi * (Double(i) / 16)
            below.append(T(pt(pond.cx + cos(a) * pond.rx, WATER_Y + sin(a) * pond.ry)))
        }
        let front = polygon(crest + below)
        // Outlined only round the bottom, where it meets the dry ground, not across the swimmer.
        r.shape(front, C.water, C.waterDark, shade: Shade(light: C.waterLight, dark: C.water)) { x, y in r.get(cell(floor(x)), cell(floor(y))) == 0 }
        // A wake behind, and drops thrown up when it splashes.
        if moving > 0.05 {
            let x0 = frame.cx - B.rx * 0.6
            let w = (6 + moving * 8) * K
            for (dx, dy, k) in [(-8.0, 2.6, 1.0), (-14.0, -1.6, 0.8), (-22.0, 1.0, 0.6)] {
                let a = T(pt(x0 + dx, WATER_Y + dy))
                let n = Int(jsRound(w * k))
                if n > 0 { for i in 0..<n { r.set(cell(floor(a.x)) - i, cell(floor(a.y)), C.waterLight) } }
            }
        }
        if p.splash > 0.05 {
            for i in 0..<5 {
                let age = jsMod(clock / 520 + Double(i) / 5, 1)
                if age > 0.85 { continue }
                let at = T(pt(hc.x + 4 + Double(i - 2) * 2.2 * (1 + age), WATER_Y - p.splash * (5 + Double(i % 3)) * sin(Double.pi * age) - 0.5))
                r.stamp(["#"], at.x, at.y, C.waterLight, C.waterDark)
            }
        }
        // Bubbles coming up where it's gone under.
        if p.bubbles > 0.05 {
            for i in 0..<3 {
                let age = jsMod(clock / 700 + Double(i) / 3, 1)
                let at = T(pt(frame.cx + Double(i - 1) * 5 + sin(clock / 180 + Double(i) * 2), WATER_Y - 2.5 - age * 8 * p.bubbles))
                r.shape(ellipse(at.x, at.y, 1 + 0.5 * age, 1 + 0.5 * age), C.waterLight, C.waterDark)
            }
        }
    }

    if facing < 0 { r.mirror(FX) }
    let box = r.bounds { $0 == C.shadow }

    // --- Marks over the head, always the right way round ---
    drawMarks(r, p.mark, pt(FX + hc.x * K * facing, FY + (hc.y - H.ry - 6) * K), facing, clock)
    return box
}

/// A hedgehog rolled up: a ball of spikes `R` pixels round (squashed by `sx` and `sy`) turned
/// `roll` degrees, with its pale tummy tucked in at the bottom and, at rest, the tip of its
/// snout peeking out.
public func drawSpikyBall(_ r: Raster, _ at: Pt, _ R: Double, _ sx: Double, _ sy: Double, _ roll: Double, _ peeking: Bool) {
    let count = 12
    func point(_ deg: Double, _ k: Double) -> Pt { Pt(x: at.x + cos(deg * DEG) * R * k * sx, y: at.y - sin(deg * DEG) * R * k * sy) }
    let outline = (0..<(count * 2)).map { i in point(-roll + (Double(i) * 180) / Double(count), i % 2 == 1 ? 1.16 : 0.9) }
    let ball = polygon(outline)
    r.shape(ball, C.dark, C.outline, shade: Shade(light: C.band, dark: C.dark))
    // The tummy and face tucked in, turning with the ball.
    let tummy = point(-roll - 55, 0.42)
    let t = ellipse(tummy.x, tummy.y, R * 0.5 * sx, R * 0.38 * sy, (-roll - 55) * -DEG)
    r.shape(intersect(t.sd, ball.sd), t.box, .colour(C.fur), nil)
    for i in 0..<count {
        let a = -roll + (Double(i * 2 + 1) * 180) / Double(count)
        let streak = capsule(point(a, 0.5), point(a, 0.95), 0.45)
        r.shape(intersect(streak.sd, ball.sd), streak.box, .colour(C.band), nil)
    }
    if peeking {
        let tip = point(-28, 0.92)
        r.shape(ellipse(tip.x, tip.y, R * 0.3, R * 0.22), C.light, C.outline)
        r.dots([Pt(x: floor(tip.x + R * 0.26), y: floor(tip.y))], C.nose)
    }
}

/// Where a hedgehog's snout ends, in head units, for a head `rx` by `ry`.
private func snoutTip(_ rx: Double, _ ry: Double) -> Pt { Pt(x: rx * 1.3, y: ry * 0.4) }

/// The spine of a long ear (a bunny's) `h` long, in drawing units from the middle of a head
/// `rx` by `ry`: from its root at `deg` round the head (90 = top), up and a little back, laid
/// back by `ears` below 0 and swung back by `flap` degrees, bending over more towards the tip
/// the further it swings.
public func longEar(_ rx: Double, _ ry: Double, _ h: Double, _ deg: Double, _ near: Bool, _ ears: Double, _ flap: Double) -> [Pt] {
    var at = Pt(x: cos(deg * DEG) * rx * 0.6, y: -sin(deg * DEG) * ry * 0.6)
    let lay = (ears < 0 ? -ears * 50 : -ears * 6) + flap * (near ? 1 : 0.85)
    let bend = 14 + Swift.max(0, flap) * 0.6
    let count = 7
    var out = [at]
    for i in 1...count {
        let s = Double(i) / Double(count)
        let a = (104 + (near ? 0 : 8) + lay + bend * pow(s, 1.6)) * DEG
        at = Pt(x: at.x + cos(a) * (h / Double(count)), y: at.y - sin(a) * (h / Double(count)))
        out.append(at)
    }
    return out
}

/// A costume's hood, as something to wear (in hat units), or nil.
public func hoodOf(_ dress: Dress) -> Wearable? {
    guard var item = outfitItem(dress.outfit), let hood = item.hood else { return nil }
    item.shapes = hood
    return item
}

/// The marks that float over his head (z's asleep, hearts, a ! or a ?), from `top`, the right
/// way round whichever way he faces.
public func drawMarks(_ r: Raster, _ mark: ChibiMark?, _ top: Pt, _ facing: Double, _ clock: Double) {
    let K = PIXEL.k
    let f: Double = facing < 0 ? -1 : 1
    guard let mark else { return }
    switch mark {
    case .zzz:
        for i in 0..<3 {
            let age = jsMod(clock / 2400 + Double(i) / 3, 1)
            if sin(Double.pi * age) < 0.3 { continue }
            r.stamp(Glyphs.z, top.x + f * (6 + age * 10) * K, top.y + (4 - age * 14) * K, C.mark, C.outline)
        }
    case .alarm:
        r.stamp(Glyphs.bang, top.x + f * 9 * K, top.y - 3, C.alarm, C.outline)
    case .puzzled:
        r.stamp(Glyphs.question, top.x + f * 9 * K, top.y - 3 + jsRound(sin(clock / 300)), C.mark, C.outline)
    case .hearts:
        for i in 0..<3 {
            let age = jsMod(clock / 1500 + Double(i) / 3, 1)
            if sin(Double.pi * age) < 0.25 { continue }
            r.stamp(Glyphs.heart, top.x + f * (4 + Double(i) * 5 + sin(age * 6 + Double(i)) * 1.5) * K, top.y + (6 - age * 16) * K, C.heart, C.outline)
        }
    case .angry:
        // Throbbing.
        let big = sin(clock / 120) > 0
        r.stamp(Glyphs.angry, top.x + f * (8 + (big ? 0 : 1)) * K, top.y - 2, C.heart, big ? C.outline : nil)
    }
}
