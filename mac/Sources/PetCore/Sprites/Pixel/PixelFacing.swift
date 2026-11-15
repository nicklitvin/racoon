import Foundation

// The pixel pets walking towards you (down the screen) or away from you (up it)
// (src/sprites/pixel/facing.ts): from the front, his face looking where he's going, his front
// legs stepping towards you and his tail waving behind; from behind, the back of his head and
// his tail up in front of you. Same units as the side view: x across, y down, feet at 0.

/// How far a cheek tuft sticks out, for those that have them.
private let TUFT_OUT: [ChibiSpecies: Double] = [.raccoon: 1.18, .cat: 1.07]

public enum FacingView { case front, back }

public struct Walking {
    /// How far round the stride he is, 0..1.
    public var phase: Double
    /// 0 standing .. 1 walking .. 1.5 flat out.
    public var moving: Double
    /// Running (a bigger, bouncier stride).
    public var running: Bool
    /// Which way he last faced side on: the tail and the hat lean to that side.
    public var side: Double
}

public func drawPixelFacing(_ r: Raster, _ b: ChibiBuild, _ p: ChibiPose, _ view: FacingView, _ walk: Walking, _ clock: Double, _ dress: Dress) -> Box? {
    let FX = PIXEL.feetX, FY = PIXEL.feetY, K = PIXEL.k
    r.clear()
    let species = b.species
    let front = view == .front
    let swims = b.swims

    // A step: each pair of diagonal legs lifts in turn, and the body bobs up over each. A
    // hopper's feet go up together, with the hop.
    let hops = b.gait == .hop
    let u = walk.phase * Double.pi * 2
    let stride = walk.running ? 4.5 : 3
    func step(_ offset: Double) -> Double { hops ? Swift.max(0, -p.lift) * 0.8 : Swift.max(0, sin(u + offset)) * stride * Swift.min(1, walk.moving) }
    let bob = hops ? 0 : -abs(sin(u)) * (walk.running ? 1.8 : 1) * Swift.min(1, walk.moving)
    let lift = p.lift + bob
    func T(_ x: Double, _ y: Double) -> Pt { Pt(x: FX + x * K, y: FY + (y + lift) * K) }
    let sway = sin(u) * (walk.running ? 1.5 : 1) * Swift.min(1, walk.moving)

    let B = b.body
    let H = b.head
    // Seen end on, the body is round.
    let bodyR = B.ry * 1.05
    let bodyY = swims ? WATER_Y + 1.5 : B.at.y
    let headY = (swims ? WATER_Y - 2 : B.at.y) + (swims ? -H.ry * 0.95 : b.head.at.y) + p.hy * 0.5
    let clothes = outfitItem(dress.outfit)?.body
    let covered = clothes?.covered == true

    // A hedgehog rolled up is a spiky ball, coming at you or rolling away.
    if p.ball > 0.5 {
        let R = ballRadius(b)
        r.shape(ellipse(FX, FY + 0.5 * K, (R + 3) * K, 1.4), C.shadow, nil)
        drawSpikyBall(r, T(0, -R), R * K, p.sx, p.sy, 0, false)
        return r.bounds { $0 == C.shadow }
    }

    // --- Shadow, and the far side of the pond ---
    if !swims {
        r.shape(ellipse(FX, FY + 0.5 * K, (bodyR + 6) * K * (1 - Swift.min(0.6, -p.lift / 40)), 1.4), C.shadow, nil)
    } else {
        r.shape(ellipse(FX, FY + WATER_Y * K, 24 * K, 6 * K), C.water, C.waterDark, shade: Shade(light: C.waterLight, dark: C.water))
        r.clipBelow = floor(FY + (WATER_Y + 1.6) * K)
    }

    /// A hedgehog's spines seen end on: a zigzag of spikes round an ellipse (`rx` by `ry` art
    /// units) about `c`, from angle `a0` to `a1` (degrees, 90 up), filled in to the middle.
    func spikes(_ c: Pt, _ rx: Double, _ ry: Double, _ a0: Double, _ a1: Double, _ count: Int) {
        func round(_ a: Double, _ k: Double) -> Pt { Pt(x: c.x + cos((a * Double.pi) / 180) * rx * k * K, y: c.y - sin((a * Double.pi) / 180) * ry * k * K) }
        let step = (a1 - a0) / Double(count)
        var points = [round(a0, 0.96)]
        for i in 0..<count { points.append(contentsOf: [round(a0 + step * (Double(i) + 0.5), 1.3), round(a0 + step * Double(i + 1), 0.96)]) }
        let coat = polygon(points + [c])
        r.shape(coat, C.dark, C.outline, shade: Shade(light: C.band, dark: C.dark))
        for i in 0..<count {
            let a = a0 + step * (Double(i) + 0.5)
            let streak = capsule(round(a, 0.55), round(a, 1.08), 0.45)
            r.shape(intersect(streak.sd, coat.sd), streak.box, .colour(C.band), nil)
        }
    }

    /// Little + stars at these places on the body (in body radii from its middle).
    func stars(_ colour: Int, _ at: [(Double, Double)]) {
        for (x, y) in at {
            let q = T(x * bodyR, bodyY + y * bodyR)
            let c = Pt(x: floor(q.x), y: floor(q.y))
            r.dots([c, pt(c.x - 1, c.y), pt(c.x + 1, c.y), pt(c.x, c.y - 1), pt(c.x, c.y + 1)], colour)
        }
    }

    // --- The tail: from the front, sticking out behind him to one side; from behind, the
    // nearest thing to you: a cat's up in a curl, a raccoon's hanging down in its rings ---
    func drawTail() {
        if b.tail.length <= 0 { return }
        let count = 10
        let length = b.tail.length * 0.9
        let cat = species == .cat
        let base = front ? pt(B.ry * 0.55, bodyY - B.ry * 0.15) : pt(B.ry * 0.1, bodyY + B.ry * (cat ? 0.1 : 0.35))
        var spine = [T(base.x, base.y)]
        var at = base
        let start: Double = front ? (cat ? 5 : 15) : cat ? 70 : -75
        let curl: Double = cat ? 80 : species == .raccoon ? (front ? 20 : 8) : 10
        for i in 1...count {
            let s = Double(i) / Double(count)
            let a = ((start + curl * pow(s, 1.3) + sway * 12) * Double.pi) / 180
            at = Pt(x: at.x + cos(a) * (length / Double(count)) * walk.side, y: at.y - sin(a) * (length / Double(count)))
            spine.append(T(at.x, at.y))
        }
        let radii = spine.indices.map { i in Swift.max(0.6, b.tail.radius(Double(i) / Double(count)) * K) }
        let t = tube(spine, radii)
        let bands = TAIL_BANDS[species] ?? []
        r.shape(t.sd, t.box, .each { x, y in bands.contains { t.at(x, y) >= $0.0 && t.at(x, y) < $0.1 } ? C.band : C.fur }, C.outline)
    }
    if front && !swims { drawTail() }

    // --- A cape: from the front, behind him; from behind, it's what you see ---
    func drawCape(_ behind: Bool) {
        let w = bodyR * (behind ? 1.25 : 1.15)
        let flap = sin(clock / 140) * Swift.min(1, walk.moving) * 1.2
        let cape = polygon([T(-bodyR * 0.7, bodyY - bodyR * 1.05), T(bodyR * 0.7, bodyY - bodyR * 1.05), T(w + flap, bodyY + bodyR * 0.9), T(-w - flap, bodyY + bodyR * 0.9)])
        r.shape(cape, C.wearMain, C.outline, shade: Shade(light: C.wearLight, dark: C.wearAccent))
    }
    if clothes?.cape == true && front { drawCape(true) }

    // --- A costume's wings: from the front, behind him; from behind, over his back ---
    func drawWings(_ paint: Paint) {
        let beat = walk.moving > 0.1 ? sin(clock / 35) * 0.4 : sin(clock / 400) * 0.12
        for s in [-1.0, 1.0] {
            let a = s * (0.5 + beat)
            let c = T(s * bodyR * 1.25, bodyY - bodyR * 0.75)
            r.shape(ellipse(c.x, c.y, bodyR * 0.8 * K, bodyR * 0.42 * K, a), PaintSlots.wear.slot(paint), C.outline)
        }
    }
    if let wings = clothes?.wings, front { drawWings(wings) }

    // --- Legs: the far pair behind, out to the sides, the near pair in front ---
    func leg(_ x: Double, _ raise: Double, _ far: Bool) {
        let root = T(x * 0.9, bodyY + bodyR * 0.2)
        let paw = T(x, -raise - lift)
        let c = capsule(root, paw, (b.legWidth / 2) * K * (far ? 0.9 : 1))
        r.shape(c, far ? C.far : C.fur, C.outline)
        if let clothes, clothes.sleeves > 0 {
            let k = clothes.sleeves
            let cuff = Pt(x: root.x + (paw.x - root.x) * k, y: root.y + (paw.y - root.y) * k)
            let sleeve = capsule(root, cuff, (b.legWidth / 2) * K + 0.5)
            r.shape(intersect(sleeve.sd, c.sd), sleeve.box, .colour(far ? C.wearDark : C.wearMain), nil)
        }
    }
    if !swims {
        let out = bodyR * 0.72
        let near = bodyR * 0.42
        leg(-out, step(Double.pi), true)
        leg(out, step(0), true)
        leg(-near, step(0), false)
        leg(near, step(Double.pi), false)
    }

    // --- Body ---
    let bodyC = T(0, bodyY)
    // From the front, a hedgehog's spines stand out all round it, a dome bigger than its head.
    if species == .hedgehog && front { spikes(bodyC, bodyR * 1.18, bodyR * 1.12, -14, 194, 13) }
    let body = ellipse(bodyC.x, bodyC.y, bodyR * K, bodyR * K * 0.95)
    r.shape(body, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    if front {
        // A paler chest and tummy.
        let chest = ellipse(bodyC.x, bodyC.y + bodyR * 0.25 * K, bodyR * 0.55 * K, bodyR * 0.62 * K)
        r.shape(intersect(chest.sd, body.sd), chest.box, .colour(species == .raccoon ? C.light : C.belly), nil)
    }
    if covered, let clothes {
        r.shape(body, C.wearMain, nil, shade: Shade(light: C.wearLight, dark: C.wearDark))
        if front && clothes.shirt {
            let shirt = polygon([T(-bodyR * 0.4, bodyY - bodyR), T(bodyR * 0.4, bodyY - bodyR), T(0, bodyY + bodyR * 0.35)])
            r.shape(intersect(shirt.sd, body.sd), shirt.box, .colour(C.wearTrim), nil)
        }
        if let bands = clothes.bands {
            for i in 0..<bands.count {
                let y = bodyY - bodyR * 0.6 + (bodyR * 1.3 * (Double(i) + 0.5)) / Double(bands.count)
                let band = capsule(T(-bodyR - 2, y), T(bodyR + 2, y), Swift.max(0.5, bands.width * B.rx * K * 0.6))
                r.shape(intersect(band.sd, body.sd), band.box, .colour(PaintSlots.wear.slot(bands.paint)), nil)
            }
        }
        if front, let patch = clothes.patch {
            let shape = ellipse(bodyC.x, bodyC.y + bodyR * 0.25 * K, bodyR * 0.5 * K, bodyR * 0.55 * K)
            r.shape(intersect(shape.sd, body.sd), shape.box, .colour(PaintSlots.wear.slot(patch)), nil)
        }
        if front && clothes.buttons { r.dots([0.1, 0.4, 0.7].map { k in Pt(x: floor(bodyC.x), y: floor(bodyC.y + (k - 0.3) * bodyR * K)) }, C.wearAccent) }
        if let starPaint = clothes.stars { stars(PaintSlots.wear.slot(starPaint), [(-0.5, -0.35), (0.45, -0.1), (-0.1, 0.45)]) }
    }
    if let skirt = clothes?.skirt {
        let colour = PaintSlots.wear.slot(skirt.paint)
        if skirt.style == .tutu {
            let c = T(0, bodyY + bodyR * 0.35)
            r.shape(ellipse(c.x, c.y, bodyR * 1.35 * K, bodyR * 0.38 * K), .each { x, y in Int(jsMod(floor(x) + floor(y), 3)) == 0 ? C.wearAccent : colour }, C.outline)
        } else {
            let robe = polygon([T(-bodyR * 0.95, bodyY), T(bodyR * 0.95, bodyY), T(bodyR * 1.15, -2.5 - lift), T(-bodyR * 1.15, -2.5 - lift)])
            r.shape(robe, colour, C.outline, shade: Shade(light: colour, dark: C.wearDark))
            stars(C.wearTrim, [(0.5, 0.8), (-0.45, 1.05)])
        }
    }
    if let pack = clothes?.pack, !front {
        let shape = polygon([T(-bodyR * 0.5, bodyY - bodyR * 0.75), T(bodyR * 0.5, bodyY - bodyR * 0.75), T(bodyR * 0.5, bodyY + bodyR * 0.4), T(-bodyR * 0.5, bodyY + bodyR * 0.4)])
        r.shape(shape, PaintSlots.wear.slot(pack), C.outline)
    }
    // From behind, a row of spikes down the middle of his back.
    if let row = clothes?.spikes, !front {
        for i in 0..<row.count {
            let y = bodyY - bodyR * 0.9 + (bodyR * 1.5 * Double(i)) / Double(row.count)
            let spike = polygon([T(-bodyR * 0.24, y + bodyR * 0.3), T(0, y - bodyR * 0.15), T(bodyR * 0.24, y + bodyR * 0.3)])
            r.shape(spike, PaintSlots.wear.slot(row.paint), C.outline)
        }
    }
    if let wings = clothes?.wings, !front { drawWings(wings) }
    if clothes?.cape == true && !front { drawCape(false) }
    // From behind, it's all spines.
    if species == .hedgehog && !front { spikes(bodyC, bodyR * 1.05, bodyR, -30, 210, 11) }
    // From behind, a raccoon's tail hangs down over its back legs; a cat's comes up after its head.
    if !front && !swims && species != .cat { drawTail() }

    // --- Head ---
    let hc = T(0, headY)
    func at(_ x: Double, _ y: Double) -> Pt { Pt(x: hc.x + x * K, y: hc.y + y * K) }

    /// Something he's wearing, seen from the front or behind. Neckwear made for the side view
    /// keeps its band across the neck; what hangs at its front (a tie, a bell) comes round to the middle.
    func wear(_ item: Wearable?, _ origin: Pt, _ size: Double, _ slots: PaintSlots, _ neckwear: Bool) {
        guard let item else { return }
        for s in item.shapes {
            if neckwear && !front && isFrontPiece(s) { continue }
            let dx = neckwear && isFrontPiece(s) ? -0.85 : 0
            func place(_ x: Double, _ y: Double) -> Pt { at(origin.x + (x + dx) * size, origin.y + y * size) }
            let shape: Shape
            switch s {
            case let .poly(points, _):
                shape = polygon(points.map { place($0.x, $0.y) })
            case let .ellipse(cx, cy, rx, ry, _):
                let c = place(cx, cy)
                shape = ellipse(c.x, c.y, Swift.max(0.6, rx * size * K), Swift.max(0.6, ry * size * K))
            }
            r.shape(shape, slots.slot(s.paint), C.outline)
        }
    }

    // Round the neck: centred on the chest from the front, round the back from behind.
    if let neck = outfitItem(dress.outfit) { wear(neck, pt(0, H.ry * 1.02), H.rx * NECK_WIDTH, .wear, true) }

    // Ears, both up on top (a hedgehog's in front of the spines coming down over its brow).
    if species == .hedgehog && front { spikes(T(0, headY), H.rx * 1.12, H.ry * 1.05, 25, 155, 9) }
    let ear = EARS[species]!
    // A bunny's long ears poke up through a hat or a hood, so they go on after it.
    let earsThrough = ear.kind == .long && (hatItem(dress.hat) != nil || hoodOf(dress) != nil)
    func drawEars() {
        for side in [-1.0, 1.0] {
            let deg = 90 - (90 - ear.near) * side
            let base = Pt(x: cos((deg * Double.pi) / 180) * H.rx * 0.82, y: -sin((deg * Double.pi) / 180) * H.ry * 0.82)
            let tilt = ((90 - deg) * 0.55 * Double.pi) / 180
            func place(_ x: Double, _ y: Double) -> Pt { at(base.x + x * cos(tilt) - y * sin(tilt), base.y + x * sin(tilt) + y * cos(tilt)) }
            switch ear.kind {
            case .round:
                let c = place(0, -0.6)
                r.shape(ellipse(c.x, c.y, ear.w * K, ear.h * K), C.fur, C.outline)
            case .long:
                // Up from the top of the head, flopping out to the side as they swing, and laid
                // back (shorter, seen end on) when he's wary or tired.
                let swing = Swift.max(0, p.earFlap) * 0.55 + (p.ears < 0 ? -p.ears * 25 : 0)
                let length = ear.h * (1 - Swift.min(0.3, (p.ears < 0 ? -p.ears * 0.3 : 0) + Swift.max(0, p.earFlap) / 300))
                let count = 6
                var q = Pt(x: side * H.rx * 0.3, y: -H.ry * 0.6)
                var spine = [at(q.x, q.y)]
                for i in 1...count {
                    let s = Double(i) / Double(count)
                    let a = ((90 - side * (8 + swing * (0.4 + s))) * Double.pi) / 180
                    q = Pt(x: q.x + cos(a) * (length / Double(count)), y: q.y - sin(a) * (length / Double(count)))
                    spine.append(at(q.x, q.y))
                }
                let radii = spine.indices.map { i in ear.w * K * (0.5 + 0.55 * sin(Double.pi * Swift.min(1, (Double(i) / Double(count)) * 1.12))) }
                let e = tube(spine, radii)
                r.shape(e.sd, e.box, .colour(C.fur), C.outline)
                if front {
                    let inside = tube(spine, radii.map { $0 * 0.45 })
                    r.shape(intersect(inside.sd, e.sd), inside.box, .each { x, y in inside.at(x, y) > 0.15 && inside.at(x, y) < 0.88 ? C.inner : 0 }, nil)
                }
            case .point:
                func tri(_ k: Double) -> Shape { polygon([place(-ear.w * k, 1.5), place(0, -ear.h * k), place(ear.w * k, 1.5)]) }
                let outer = tri(1)
                r.shape(outer, C.fur, C.outline)
                if front {
                    let inner = tri(0.55)
                    r.shape(intersect(inner.sd, outer.sd), inner.box, .colour(C.inner), nil)
                }
            }
        }
    }
    if !earsThrough { drawEars() }

    // The head: round, with a cheek tuft either side.
    let skull = ellipse(hc.x, hc.y, H.rx * K, H.ry * K)
    var head = skull.sd
    if let out = TUFT_OUT[species] {
        func tuft(_ dir: Double) -> Sd { polygon([at(dir * H.rx * 0.92, H.ry * 0.25), at(dir * H.rx * out, H.ry * 0.5), at(dir * H.rx * 0.8, H.ry * 0.62)]).sd }
        head = union(skull.sd, tuft(-1), tuft(1))
    }
    let headSd = head
    let headBox = Box(x0: skull.box.x0 - 3, y0: skull.box.y0 - 3, x1: skull.box.x1 + 3, y1: skull.box.y1 + 3)
    r.shape(headSd, headBox, .colour(C.fur), C.outline, shade: Shade(light: C.furLight, dark: C.fur))
    func mark(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ colour: Int) {
        let c = at(cx, cy)
        let e = ellipse(c.x, c.y, rx * K, ry * K)
        r.shape(intersect(e.sd, headSd), e.box, .colour(colour), nil)
    }
    let rx = H.rx
    let ry = H.ry

    if front {
        // The face, square on.
        switch species {
        case .raccoon:
            for s in [-1.0, 1.0] { mark(s * rx * 0.33, -ry * 0.44, rx * 0.24, ry * 0.15, C.light) }
            for s in [-1.0, 1.0] { mark(s * rx * 0.34, ry * 0.04, rx * 0.3, ry * 0.22, C.dark) }
            mark(0, -ry * 0.02, rx * 0.2, ry * 0.12, C.dark)
            mark(0, ry * 0.5, rx * 0.42, ry * 0.3, C.light)
        case .cat:
            for x in [-0.18, 0, 0.18] {
                let stripe = capsule(at(rx * x, -ry * 1.05), at(rx * x, -ry * 0.62), 0.5)
                r.shape(intersect(stripe.sd, headSd), stripe.box, .colour(C.band), nil)
            }
            mark(0, ry * 0.52, rx * 0.38, ry * 0.28, C.light)
        case .otter:
            mark(0, ry * 0.48, rx * 0.52, ry * 0.36, C.light)
        case .bunny:
            // Puffy cheeks either side of the nose, and a pale chin.
            for s in [-1.0, 1.0] { mark(s * rx * 0.22, ry * 0.45, rx * 0.3, ry * 0.24, C.light) }
            mark(0, ry * 0.72, rx * 0.26, ry * 0.18, C.light)
        case .hedgehog:
            // A pale face, its snout pointing out at you.
            mark(0, ry * 0.35, rx * 0.62, ry * 0.55, C.light)
        case .fox:
            break
        }
        func pix(_ x: Double, _ y: Double) -> (x: Int, y: Int) {
            let q = at(x, y)
            return (cell(floor(q.x)), cell(floor(q.y)))
        }
        func dots(_ points: [(Int, Int)], _ c: Int) { for (x, y) in points { r.set(x, y, c) } }
        let eyes = species == .hedgehog ? pt(0.44, -0.08) : species == .bunny ? pt(0.42, 0) : pt(0.33, 0.04)
        for s in [-1.0, 1.0] {
            let (x, y) = pix(s * rx * eyes.x - (s < 0 ? 1 / K : 0), ry * eyes.y)
            switch p.eyes {
            case .closed:
                dots([(x - 1, y), (x, y + 1), (x + 1, y + 1), (x + 2, y)], C.eye)
            case .happy:
                dots([(x - 1, y + 1), (x, y), (x + 1, y), (x + 2, y + 1)], C.eye)
            case .blink:
                dots([(x - 1, y + 1), (x, y + 1), (x + 1, y + 1), (x + 2, y + 1)], C.eye)
            case .open, .wide:
                let wide = p.eyes == .wide
                // A hedgehog's are small and beady.
                let cols = wide ? [x - 1, x, x + 1] : [x, x + 1]
                let rows = species == .hedgehog && !wide ? [y - 1, y] : [y - 1, y, y + 1]
                for cx in cols { for cy in rows { r.set(cx, cy, C.eye) } }
                r.set(cols[cols.count - 1], y - 1, C.glint)
            }
        }
        let n = pix(0, ry * (species == .hedgehog ? 0.42 : 0.32))
        if species == .hedgehog {
            // Its shiny black nose, right in the middle.
            dots([(n.x - 1, n.y), (n.x, n.y)], C.nose)
        } else {
            dots(species == .otter ? [(n.x - 1, n.y), (n.x, n.y), (n.x + 1, n.y), (n.x, n.y + 1)] : [(n.x - 1, n.y), (n.x, n.y)], C.nose)
        }
        if p.mouth > 0.12 {
            let h = 1 + Int(jsRound(p.mouth * 2.5))
            for i in 1...h { dots([(n.x - 1, n.y + i), (n.x, n.y + i)], C.mouth) }
        }
        if p.blush >= 0.6 {
            let a = pix(-rx * 0.6, ry * 0.42)
            let z = pix(rx * 0.6, ry * 0.42)
            dots([(a.x, a.y), (a.x - 1, a.y), (z.x, z.y), (z.x + 1, z.y)], C.blush)
        }
    }

    // From behind, a hedgehog's head is all spines too.
    if species == .hedgehog && !front { spikes(hc, rx * 1.02, ry, -20, 200, 10) }

    // A costume's hood, then a hat on top.
    wear(hoodOf(dress), pt(0, -H.ry * 0.9), H.rx, .wear, false)
    wear(hatItem(dress.hat), pt(-H.rx * 0.0, -H.ry * 0.9), H.rx, .hat, false)
    if earsThrough { drawEars() }

    if !front && species == .cat { drawTail() }

    // --- The near side of the pond ---
    if swims {
        r.clipBelow = .infinity
        var crest: [Pt] = []
        for i in 0...12 {
            let x = -24 + (48 * Double(i)) / 12
            crest.append(Pt(x: FX + x * K, y: FY + (WATER_Y + 0.8 * sin(x * 0.4 + clock / 260)) * K))
        }
        var below: [Pt] = []
        for i in 1..<12 {
            let a = Double.pi * (Double(i) / 12)
            below.append(Pt(x: FX + cos(a) * 24 * K, y: FY + (WATER_Y + sin(a) * 6) * K))
        }
        r.shape(polygon(crest + below), C.water, C.waterDark, shade: Shade(light: C.waterLight, dark: C.water)) { x, y in r.get(cell(floor(x)), cell(floor(y))) == 0 }
        // Ripples out to either side as it swims.
        if walk.moving > 0.05 {
            for s in [-1.0, 1.0] { for i in 0..<3 { r.set(cell(jsRound(FX + s * (10 + Double(i)) * K * 1.6)), cell(jsRound(FY + (WATER_Y + 1) * K)), C.waterLight) } }
        }
    }

    if walk.side < 0 { r.mirror(FX) }
    return r.bounds { $0 == C.shadow }
}

/// A piece of neckwear that hangs at the front (a tie, a bell, a bow), rather than going round.
public func isFrontPiece(_ s: WearShape) -> Bool {
    switch s {
    case let .ellipse(cx, _, _, _, _): return cx > 0.2
    case let .poly(points, _): return points.map(\.x).jsMin > 0
    }
}
