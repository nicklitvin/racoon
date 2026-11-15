import Foundation

// The floaties (src/sprites/floaty): little blobs that float about a hand's width off the
// ground, bobbing as they go, with a face that slides round them to look where they're going
// and a pair of floating hands. Same pixels and box as the pixel pets, the ground under them
// where a pet's feet would be.

public enum FloatyKind: String {
    case blip, mochi, ember
}

public struct FloatyBuild {
    public enum BodyShape { case round, squircle, drop }
    public enum Topper { case antenna, sprout }
    public var kind: FloatyKind
    /// Body radius (half its height), art pixels.
    public var R: Double
    /// How much wider than tall.
    public var wide: Double
    public var shape: BodyShape
    /// Something sticking up from the top of it.
    public var topper: Topper?
    /// Freckles on its cheeks.
    public var freckles: Bool
}

public let FLOATIES: [FloatyKind: FloatyBuild] = [
    /** A round little blue one with an antenna, its bulb blinking. */
    .blip: FloatyBuild(kind: .blip, R: 10.5, wide: 1.04, shape: .round, topper: .antenna, freckles: false),
    /** A soft, squarish pink one with a leafy sprout on top. */
    .mochi: FloatyBuild(kind: .mochi, R: 10, wide: 1.12, shape: .squircle, topper: .sprout, freckles: true),
    /** An orange drop drawn up into a flickering point, like a candle flame. */
    .ember: FloatyBuild(kind: .ember, R: 10, wide: 1.0, shape: .drop, topper: nil, freckles: false),
]

/// Shared by them all: the face and the marks.
private let FACE: Palette = PIXEL_COATS[.raccoon]!.merging([
    "outline": "#262033", "eye": "#1d1828", "mouth": "#6b2a3a", "light": "#ffffff",
    "far": "#000000", "belly": "#000000", "dark": "#000000", "inner": "#000000", "nose": "#000000",
]) { _, new in new }

/// Each one's colours: its body (`fur`, lit and shaded), and its topper (`band`).
public let FLOATY_COATS: [FloatyKind: Palette] = [
    .blip: FACE.merging(["fur": "#6cc4ff", "furLight": "#a8defe", "furDark": "#3f97d8", "band": "#8d97a8"]) { _, new in new },
    .mochi: FACE.merging(["fur": "#ffa9c9", "furLight": "#ffd3e3", "furDark": "#e47ca4", "band": "#69c46a"]) { _, new in new },
    .ember: FACE.merging(["fur": "#ffa04a", "furLight": "#ffc98a", "furDark": "#e2702a", "band": "#ffe27a"]) { _, new in new },
]

public enum FloatyEyes { case open, closed, happy, wide, cross, squint }
public enum FloatyMouth { case smile, grin, o, flat, frown, none }

/// Where a floaty is and what it's doing with its face and hands, for one picture.
public struct FloatyPose {
    /// Gap between the ground and the bottom of its body, px.
    public var hover: Double
    /// Squash and stretch: width and height of its body, 1 as built.
    public var sx = 1.0
    public var sy = 1.0
    /// Lean, radians, clockwise.
    public var tilt = 0.0
    /// Where its body is from the ground under it, sideways, px (a lunge, a swat).
    public var shift = 0.0
    /// Which way it faces on the ground (radians, screen axes: 0 right, PI/2 towards you).
    public var heading: Double
    public var eyes: FloatyEyes
    public var mouth: FloatyMouth = .smile
    /// Where it's looking, from its face, px (eyes slide a pixel that way).
    public var look = Pt.zero
    public var blush = false
    /// Its hands, px from the ground under it (facing right), or nil tucked away.
    public var hands: [Pt]?
    public var mark: ChibiMark?
    /// Going fast: speed lines behind it.
    public var dash = 0.0
}

/// The body's middle, px from the ground under it.
public func bodyCentre(_ b: FloatyBuild, _ p: FloatyPose) -> Pt { Pt(x: p.shift, y: -(p.hover + b.R * p.sy)) }

/// Where its paws go on a keyboard, from the ground under it facing right, px: the desk is built to fit.
public func keyboardReach(_ b: FloatyBuild) -> Pt { Pt(x: b.R * 0.95 + 3, y: -(WORK_HOVER + b.R * 0.55)) }

/// How high it floats at its desk.
private let WORK_HOVER = 4.0
/// How high it floats, idling about, art pixels.
public let HOVER = 6.0

private func ease(_ t: Double) -> Double { t * t * (3 - 2 * t) }
/// 0 to 1 and back, `t` of the way through.
private func hump(_ t: Double) -> Double { sin(Double.pi * clamp01(t)) }

/// How it looks doing `animation`, `t` ms in. Hands are given facing right.
public func floatyPose(_ b: FloatyBuild, _ animation: AnimationName, _ t: Double, _ clock: Double, _ eyes: Eyes, _ heading: Double, _ speed: Double, _ keystrokes: Int) -> FloatyPose {
    let R = b.R
    let bob = sin(clock / 420) * 1.2
    func rest(_ hover: Double = HOVER) -> [Pt] {
        [pt(R * 0.95, -(hover + R * 0.55) + sin(clock / 420 + 0.8) * 0.8), pt(-R * 0.95, -(hover + R * 0.55) + sin(clock / 420 + 1.6) * 0.8)]
    }
    var p = FloatyPose(hover: HOVER + bob, heading: heading, eyes: eyes == .closed || eyes == .blink ? .closed : eyes == .wide ? .wide : .open, hands: rest())
    // Moving along: leaning into it, the hands trailing, bobbing faster.
    func travel(_ lean: Double, _ fast: Bool) {
        let cycle: Double = fast ? 260 : 520
        let swing = sin((clock / cycle) * Double.pi * 2)
        p.hover = HOVER + 1 + swing * (fast ? 1.6 : 1)
        p.tilt = lean
        p.sx = 1 + abs(swing) * 0.04
        p.sy = 1 - abs(swing) * 0.04
        p.hands = [pt(R * 0.7 - (fast ? 4 : 2), -(p.hover + R * 0.5) + swing * 1.5), pt(-R * 1.05 - (fast ? 3 : 1), -(p.hover + R * 0.6) - swing * 1.5)]
        if fast { p.dash = clamp01(speed / 300) }
    }

    switch animation {
    case .idle:
        break
    case .walk, .stalk, .nudge:
        travel(0.12, false)
        if animation == .stalk {
            p.hover = 2 + bob * 0.5
            p.eyes = .squint
            p.mouth = .flat
            p.sy = 0.9
            p.sx = 1.06
        }
        if animation == .nudge { p.tilt = 0.3 }
    case .run, .chase:
        travel(0.26, true)
        if animation == .chase { p.mouth = .grin }
    case .fetch, .carry:
        travel(0.1, false)
        // Holding the block in front, in both hands.
        p.hands = [pt(R * 1.05, -(p.hover + R * 0.6)), pt(R * 0.55, -(p.hover + R * 0.3))]
        p.mouth = .grin
    case .jump, .leap:
        let k = hump(t / (animation == .jump ? 400 : 420))
        p.hover = HOVER + k * 10
        p.sy = 1 + k * 0.14
        p.sx = 1 - k * 0.08
        p.tilt = 0.18
        p.hands = [pt(R * 0.4, -(p.hover + R * 1.9)), pt(-R * 0.8, -(p.hover + R * 1.7))]
        p.mouth = .o
    case .sit:
        // Settled down low, floating gently.
        p.hover = 3 + bob * 0.6
        p.hands = rest(3)
    case .groom:
        // Rubbing its face, one hand then the other.
        p.hover = 3 + bob * 0.5
        let k = sin((t / 1000) * Double.pi * 4)
        p.eyes = .happy
        p.mouth = .smile
        p.hands = [pt(R * 0.55 + k * 1.5, -(p.hover + R * 0.9) - abs(k)), pt(R * 0.15 - k * 1.5, -(p.hover + R * 0.8))]
    case .yawn:
        let k = hump(t / 2200)
        p.hover = 4 + bob * 0.5
        p.sy = 1 + k * 0.1
        p.sx = 1 - k * 0.05
        p.eyes = .closed
        p.mouth = k > 0.3 ? .o : .smile
        p.hands = [pt(R * 0.75, -(p.hover + R * 0.55) - k * 3), pt(-R * 1.1 - k * 3, -(p.hover + R * 1.2) - k * 4)]
    case .sleep:
        // Down on the ground, a little squashed, breathing.
        let breath = sin((t / 3200) * Double.pi * 2)
        p.hover = 0
        p.sx = 1.1 + breath * 0.02
        p.sy = 0.86 - breath * 0.02
        p.eyes = .closed
        p.mouth = .none
        p.hands = nil
        p.mark = .zzz
        p.blush = true
    case .peek:
        // Peering up over the bottom of the screen, hands on the edge, eyes darting about with your typing.
        p.hover = 1
        p.hands = [pt(R * 0.75, -(1 + R * 1.25)), pt(-R * 0.75, -(1 + R * 1.25))]
        p.look = pt(keystrokes % 2 != 0 ? 1 : -1, -1)
        p.mouth = .o
    case .surprised:
        let k = hump(t / 450)
        p.hover = HOVER + k * 4
        p.sy = 1 + k * 0.12
        p.sx = 1 - k * 0.06
        p.eyes = .wide
        p.mouth = .o
        p.mark = .alarm
        p.hands = [pt(R * 1.3, -(p.hover + R * 1.4)), pt(-R * 1.3, -(p.hover + R * 1.4))]
    case .confused:
        // Head on one side, scratching the top of it.
        p.tilt = -0.18
        p.mouth = .flat
        p.mark = .puzzled
        p.look = pt(0, -1)
        p.hands = [pt(R * 0.2 + sin(t / 90), -(p.hover + R * 2.05)), pt(-R * 0.95, -(p.hover + R * 0.5))]
    case .dangle:
        // Held up by the top: stretched, swinging, hands up.
        let swing = sin((t / 1400) * Double.pi * 2)
        p.hover = HOVER
        p.sy = 1.12
        p.sx = 0.92
        p.tilt = swing * 0.12
        p.eyes = .wide
        p.mouth = .o
        p.hands = [pt(R * 1.0, -(p.hover + R * 2.1)), pt(-R * 1.0, -(p.hover + R * 2.1))]
    case .happy:
        let k = abs(sin((t / 1200) * Double.pi * 2))
        p.hover = HOVER + k * 4
        p.sx = 1 + (1 - k) * 0.05
        p.sy = 1 - (1 - k) * 0.05
        p.eyes = .happy
        p.mouth = .grin
        p.blush = true
        p.mark = .hearts
        p.hands = [pt(R * 1.25, -(p.hover + R * 1.3) - k * 2), pt(-R * 1.25, -(p.hover + R * 1.3) - k * 2)]
    case .bat:
        // A swat with the front hand, leaning into it.
        let k = t < 230 ? ease(t / 230) : 1 - ease((t - 230) / 420)
        p.tilt = 0.2 * k
        p.shift = 2 * k
        p.eyes = .wide
        p.mouth = .grin
        p.hands = [pt(R * 0.9 + k * 7, -(p.hover + R * 0.4) + k * 3), pt(-R * 0.95, -(p.hover + R * 0.7))]
    case .toss, .lift, .throw:
        // Scooping the block up in both hands, then flinging it up and away.
        let length: Double = animation == .toss ? 1250 : animation == .lift ? 1000 : 950
        let grab = animation == .throw ? 0 : 380 / length
        let u = t / length
        let up = u < grab ? ease(u / grab) * 0.2 : animation == .lift ? 0.3 : hump((u - grab) / (1 - grab))
        p.tilt = u < grab ? 0.25 : 0.25 - up * 0.45
        p.mouth = up > 0.5 ? .grin : .smile
        p.hands = [pt(R * 1.05 + up * 2, -(p.hover + R * 0.4 + up * R * 1.2)), pt(R * 0.6 + up * 2, -(p.hover + R * 0.2 + up * R * 1.2))]
    case .sniff:
        // Leaning down for a good look at it.
        p.tilt = 0.3 + sin(t / 120) * 0.04
        p.hover = 4 + bob * 0.5
        p.look = pt(1, 1)
        p.mouth = .o
    case .work, .browse, .reels:
        // At its desk, hands on the keyboard (or one on the mouse), eyes on the screen.
        let keys = keyboardReach(b)
        p.hover = WORK_HOVER + bob * 0.4
        p.look = pt(1, -1)
        p.mouth = animation == .reels ? .grin : .flat
        func lift(_ phase: Double) -> Double { sin(clock / 70 + phase) > 0.2 ? -2 : 0 }
        if animation == .work {
            p.hands = [pt(keys.x + 2, keys.y + lift(0)), pt(keys.x - 3, keys.y + lift(2.1))]
        } else {
            let click: Double = sin(clock / (animation == .reels ? 180 : 400)) > 0.7 ? -1 : 0
            p.hands = [pt(keys.x + 7, keys.y + click), pt(-R * 0.95, -(p.hover + R * 0.55))]
            if animation == .reels {
                p.tilt = -0.12
                p.blush = sin(clock / 900) > 0.4
            }
        }
    case .attention:
        // Up and down, waving both hands over its head.
        let k = abs(sin((t / 1200) * Double.pi * 2))
        let waving = sin((t / 1200) * Double.pi * 6)
        p.hover = HOVER + k * 5
        p.mouth = .grin
        p.hands = [pt(R * 1.15 + waving * 2, -(p.hover + R * 2)), pt(-R * 1.15 + waving * 2, -(p.hover + R * 2))]
    case .angry:
        // Shaking its fists, bouncing up and down on the spot.
        let k = abs(sin((t / 800) * Double.pi * 2))
        let shake = sin(t / 45)
        p.hover = HOVER + k * 2
        p.sx = 1.04
        p.sy = 0.96
        p.eyes = .cross
        p.mouth = .frown
        p.mark = .angry
        p.hands = [pt(R * 1.2 + shake, -(p.hover + R * 1.2)), pt(-R * 1.2 - shake, -(p.hover + R * 1.2))]
    }
    return p
}

/// The body's outline, as a signed distance, given its middle (pixels), radius, stretch and lean.
private func bodyShape(_ b: FloatyBuild, _ c: Pt, _ p: FloatyPose, _ clock: Double) -> Shape {
    let rx = b.R * b.wide * p.sx
    let ry = b.R * p.sy
    let co = cos(p.tilt)
    let si = sin(p.tilt)
    let box = Box(x0: c.x - rx - 2, y0: c.y - ry * 1.7, x1: c.x + rx + 2, y1: c.y + ry + 2)
    switch b.shape {
    case .round:
        return ellipse(c.x, c.y, rx, ry, p.tilt)
    case .squircle:
        let n = 3.2
        return Shape(sd: { x, y in
            let dx = x - c.x
            let dy = y - c.y
            let u = (dx * co + dy * si) / rx
            let v = (-dx * si + dy * co) / ry
            return (pow(pow(abs(u), n) + pow(abs(v), n), 1 / n) - 1) * Swift.min(rx, ry)
        }, box: box)
    case .drop:
        // A round bottom drawn up into a point on top, the point swaying like a flame.
        let sway = sin(clock / 160) * 1.4 + sin(clock / 70) * 0.5
        func at(_ x: Double, _ y: Double) -> Pt { Pt(x: c.x + x * co - y * si, y: c.y + x * si + y * co) }
        let round = ellipse(c.x, c.y, rx, ry, p.tilt)
        let tip = polygon([at(-rx * 0.72, -ry * 0.35), at(sway - (p.heading > Double.pi / 2 ? -1 : 1) * 1.5, -ry * 1.65), at(rx * 0.72, -ry * 0.35)])
        return Shape(sd: union(round.sd, tip.sd), box: box)
    }
}

public struct FloatyDrawn {
    public var box: Box?
    public var top: Pt
    public var hands: [Pt]?
}

/// Draws a floaty into `r` with the ground under it at the feet point. Returns the box round
/// what it drew (for grabbing it), and where its top and its hands are.
public func drawFloaty(_ r: Raster, _ b: FloatyBuild, _ p: FloatyPose, _ clock: Double, _ dress: Dress = UNDRESSED) -> FloatyDrawn {
    let FX = PIXEL.feetX, FY = PIXEL.feetY
    r.clear()
    let R = b.R
    let dir: Double = cos(p.heading) < 0 ? -1 : 1
    let towards = sin(p.heading)
    let back = towards < -0.35
    let cOff = bodyCentre(b, p)
    let c = Pt(x: FX + cOff.x * dir, y: FY + cOff.y)
    func hand(_ h: Pt) -> Pt { Pt(x: FX + h.x * dir, y: FY + h.y) }

    // Its shadow on the ground, smaller the higher it floats.
    let shadowW = R * b.wide * (1 - Swift.min(0.5, p.hover / 30))
    r.shape(ellipse(FX + p.shift * dir, FY - 0.5, shadowW, 1.6), C.shadow, nil)

    // Speed lines behind it.
    if p.dash > 0.2 {
        for (dy, len) in [(-R * 0.6, 5.0), (0, 7.0), (R * 0.5, 4.0)] {
            let y = cell(jsRound(c.y + dy))
            let x0 = jsRound(c.x - dir * (R * b.wide + 3))
            let n = Int(jsRound(len * p.dash))
            if n > 0 { for i in 0..<n { r.set(cell(x0 - dir * Double(i)), y, C.light) } }
        }
    }

    let hands = p.hands.map { [hand($0[0]), hand($0[1])] }
    func drawHand(_ h: Pt) { r.shape(ellipse(h.x, h.y, 1.9, 1.7), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark)) }
    // The far hand behind its body.
    if let hands { drawHand(back ? hands[0] : hands[1]) }

    // Something on top: an antenna, or a sprout, behind any hat.
    let topY = c.y - R * p.sy
    let tipX = c.x + sin(p.tilt) * R * p.sy
    if b.topper == .antenna {
        let sway = sin(clock / 300) * 1.2 - p.tilt * 6 * dir
        let end = Pt(x: tipX + sway, y: topY - 4.5)
        r.shape(capsule(Pt(x: tipX, y: topY + 1), end, 0.5), C.outline, nil)
        let glow = sin(clock / 500) > -0.3
        r.shape(ellipse(end.x, end.y - 1, 1.7, 1.7), glow ? C.alarm : C.band, C.outline)
    } else if b.topper == .sprout {
        let sway = sin(clock / 380) * 0.8
        let stem = Pt(x: tipX + sway * 0.5, y: topY - 3)
        r.shape(capsule(Pt(x: tipX, y: topY + 1), stem, 0.5), C.band, nil)
        r.shape(ellipse(stem.x - 2.4 + sway, stem.y - 1, 2.6, 1.3, -0.5), C.band, C.outline)
        r.shape(ellipse(stem.x + 2.4 + sway, stem.y - 1.4, 2.6, 1.3, 0.5), C.band, C.outline)
    }

    // Its body, lit along the top.
    r.shape(bodyShape(b, c, p, clock), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    // A shine on it, up on the far side.
    let shine = Pt(x: jsRound(c.x - dir * R * 0.45 * p.sx), y: jsRound(c.y - R * 0.55 * p.sy))
    r.dots([shine, Pt(x: shine.x, y: shine.y + 1), Pt(x: shine.x + dir, y: shine.y)], C.light)
    // Ember's tip burns brighter.
    if b.shape == .drop {
        let flick = sin(clock / 90) > 0
        for i in 0..<3 { r.set(cell(jsRound(tipX + sin(clock / 160) * 1.4)), cell(jsRound(topY - R * 0.45 - Double(i) + (flick ? 1 : 0))), C.band) }
    }
    // Freckles, for those that have them.
    if b.freckles && !back {
        let fx = c.x + cos(p.heading) * R * 0.4
        for s in [-1.0, 1.0] { r.dots([Pt(x: fx + s * R * 0.45, y: c.y + R * 0.15), Pt(x: fx + s * R * 0.45 + 1, y: c.y + R * 0.15 + 1)], C.furDark) }
    }

    // The face: turned round its body to look the way it's going.
    if !back { drawFace(r, b, p, c, clock) }

    // Round its middle, then on top.
    let size = R * 0.85
    floatyWear(r, outfitItem(dress.outfit), Pt(x: c.x, y: c.y + R * 0.62 * p.sy), size * NECK_WIDTH, dir, .wear)
    floatyWear(r, hatItem(dress.hat), Pt(x: tipX - dir * R * 0.05, y: topY + R * 0.12), size, dir, .hat)

    if let hands { drawHand(back ? hands[1] : hands[0]) }

    let box = r.bounds { $0 == C.shadow }
    let top = Pt(x: tipX, y: topY - (b.topper != nil ? 5 : 0))
    drawMarks(r, p.mark, Pt(x: top.x, y: top.y - 3), dir, clock)
    return FloatyDrawn(box: box, top: top, hands: hands)
}

private func drawFace(_ r: Raster, _ b: FloatyBuild, _ p: FloatyPose, _ c: Pt, _ clock: Double) {
    let R = b.R
    let across = cos(p.heading)
    let towards = Swift.max(0, sin(p.heading))
    // The face's middle, slid round towards the way it faces; the eyes closer together side on.
    let fx = c.x + across * R * 0.42 * p.sx + p.look.x * 0.6
    let fy = c.y + R * 0.05 * p.sy + sin(p.tilt) * across * R * 0.3
    let spread = R * 0.33 * (0.5 + 0.5 * towards) * p.sx
    let eyeY = cell(jsRound(fy - 1 + p.look.y * 0.6))
    let eyes = [cell(jsRound(fx - spread)), cell(jsRound(fx + spread))]
    let dx = jsSign(p.look.x)
    let blinking = p.eyes == .open && jsMod(clock, 4200) < 130
    func dots(_ points: [(Int, Int)], _ colour: Int) { for (x, y) in points { r.set(x, y, colour) } }
    for (i, ex) in eyes.enumerated() {
        switch blinking ? .closed : p.eyes {
        case .open:
            let shift = dx > 0 ? 0 : dx < 0 ? -1 : 0
            dots([(ex, eyeY - 1), (ex, eyeY), (ex, eyeY + 1), (ex + 1, eyeY - 1), (ex + 1, eyeY), (ex + 1, eyeY + 1)].map { ($0.0 + shift, $0.1) }, C.eye)
            r.set(ex + 1 + (dx < 0 ? -1 : 0), eyeY - 1, C.glint)
        case .wide:
            for y in -1...1 { for x in -1...1 { r.set(ex + x, eyeY + y, C.eye) } }
            r.set(ex + 1, eyeY - 1, C.glint)
        case .closed:
            dots([(ex - 1, eyeY + 1), (ex, eyeY + 1), (ex + 1, eyeY + 1)], C.eye)
        case .happy:
            dots([(ex - 1, eyeY + 1), (ex, eyeY), (ex + 1, eyeY + 1)], C.eye)
        case .squint:
            dots([(ex - 1, eyeY), (ex, eyeY), (ex + 1, eyeY), (ex, eyeY + 1)], C.eye)
        case .cross:
            // Brows down towards the middle.
            let inward = i == 0 ? 1 : -1
            dots([(ex, eyeY), (ex + 1, eyeY), (ex, eyeY + 1), (ex + 1, eyeY + 1)], C.eye)
            dots([(ex - inward, eyeY - 3), (ex, eyeY - 2), (ex + inward, eyeY - 1)], C.outline)
        }
    }
    if p.blush {
        for ex in eyes { dots([(ex + (Double(ex) < fx ? -2 : 2), eyeY + 3), (ex + (Double(ex) < fx ? -1 : 3), eyeY + 3)], C.blush) }
    }
    let mx = cell(jsRound(fx))
    let my = eyeY + 4
    switch p.mouth {
    case .smile:
        dots([(mx - 1, my), (mx, my + 1), (mx + 1, my)], C.mouth)
    case .grin:
        dots([(mx - 2, my), (mx - 1, my + 1), (mx, my + 1), (mx + 1, my + 1), (mx + 2, my), (mx - 1, my), (mx, my), (mx + 1, my)], C.mouth)
        dots([(mx, my + 1)], C.tongue)
    case .o:
        let big = sin(clock / 200) > 0
        dots([(mx, my), (mx + 1, my), (mx, my + 1), (mx + 1, my + 1)] + (big ? [(mx, my + 2), (mx + 1, my + 2)] : []), C.mouth)
    case .flat:
        dots([(mx - 1, my + 1), (mx, my + 1), (mx + 1, my + 1)], C.mouth)
    case .frown:
        dots([(mx - 1, my + 1), (mx, my), (mx + 1, my + 1)], C.mouth)
    case .none:
        break
    }
}

/// Something it's wearing, in hat units `size` px across, its origin at `origin`, turned to face `dir`.
private func floatyWear(_ r: Raster, _ item: Wearable?, _ origin: Pt, _ size: Double, _ dir: Double, _ slots: PaintSlots) {
    guard let item else { return }
    func at(_ x: Double, _ y: Double) -> Pt { Pt(x: origin.x + x * size * dir, y: origin.y + y * size) }
    for s in item.shapes {
        let shape: Shape
        switch s {
        case let .poly(points, _): shape = polygon(points.map { at($0.x, $0.y) })
        case let .ellipse(cx, cy, rx, ry, _):
            let c = at(cx, cy)
            shape = ellipse(c.x, c.y, Swift.max(0.6, rx * size), Swift.max(0.6, ry * size))
        }
        r.shape(shape, slots.slot(s.paint), C.outline)
    }
}

/// How quickly it eases into a new pose, per second (bigger is quicker).
private let FLOATY_EASE_RATE = 9.0

/// A floaty: a little blob that floats about instead of walking. It goes everywhere the pets go
/// and does everything they do, its own way: bobbing along, waving its floating hands, typing
/// at its desk with them.
public final class FloatyPet: PetRenderer {
    private let build: FloatyBuild
    private let view: PixelCanvas
    private struct Eased { var hover, sx, sy, tilt, shift: Double }
    private var shown: Eased?
    private var settling = false
    private var lastClock = Double.nan
    private var shownTick = Double.nan
    private var top: Pt?
    private var held: Pt?
    private var dir = 1.0

    public init(_ kind: FloatyKind) {
        build = FLOATIES[kind]!
        view = PixelCanvas(FLOATY_COATS[kind]!)
        view.onChange = { [weak self] in self?.shownTick = .nan }
        view.sizeTo()
    }

    private func px(_ art: Double) -> Double { art * view.cell }
    private var keys: Pt { keyboardReach(build) }

    public var raster: Raster { view.raster }
    public var colours: [UInt32] { view.colours }
    public var cell: Double { view.cell }
    public var figure: Box? { view.figure }
    public var baseSize: Size { Size(width: Double(PIXEL.width) * PIXEL_PX, height: Double(PIXEL.height) * PIXEL_PX) }
    public var anchor: Pt { Pt(x: PIXEL.feetX / Double(PIXEL.width), y: PIXEL.feetY / Double(PIXEL.height)) }
    /// Peeking, it sinks until only its eyes and hands are over the edge.
    public var peekSink: Double? { build.R * 1.05 * PIXEL_PX }
    public var turnsItself: Bool { true }
    public var pixelated: Bool { true }
    public var animations: [AnimationName: SpecChange] {
        TIMING.merging([.work: SpecChange(fps: 20), .browse: SpecChange(fps: 20), .reels: SpecChange(fps: 20)]) { _, new in new }
    }
    public func isSettling() -> Bool { settling }
    public func holdPoint() -> Pt? { top.map { Pt(x: px($0.x - PIXEL.feetX), y: px($0.y - PIXEL.feetY)) } }
    public var toyReach: Double? { (build.R * build.wide + 4) * PIXEL_PX }
    public var toySize: Double? { PIXEL_TOY * PIXEL_PX }
    public var toyLook: ToyLook { .pixel }
    public var carriesToys: Bool { false }
    public var deskReach: Pt? { Pt(x: keys.x * PIXEL_PX, y: keys.y * PIXEL_PX) }
    public var mouseReach: Pt? { Pt(x: (keys.x + 7) * PIXEL_PX, y: keys.y * PIXEL_PX) }
    public var hover: Double { HOVER * PIXEL_PX }
    public var goose: Bool { false }
    public var drawsMarks: Bool { true }
    public func toyPoint() -> Pt? { held.map { Pt(x: px($0.x - PIXEL.feetX), y: px($0.y - PIXEL.feetY)) } }
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
        let target = floatyPose(build, frame.animation, frame.timeMs, clock, frame.eyes, heading, hypot(v.x, v.y), frame.keystrokes)
        // Eases from pose to pose rather than jumping.
        let dt = lastClock.isNaN ? 1 : Swift.min(0.25, Swift.max(0, (clock - lastClock) / 1000))
        lastClock = clock
        let k = 1 - exp(-FLOATY_EASE_RATE * dt)
        var s = shown ?? Eased(hover: target.hover, sx: target.sx, sy: target.sy, tilt: target.tilt, shift: target.shift)
        var far = 0.0
        func ease(_ value: inout Double, _ to: Double, _ weight: Double) {
            value += (to - value) * k
            far = Swift.max(far, abs(to - value) * weight)
        }
        ease(&s.hover, target.hover, 1)
        ease(&s.sx, target.sx, 20)
        ease(&s.sy, target.sy, 20)
        ease(&s.tilt, target.tilt, 20)
        ease(&s.shift, target.shift, 1)
        shown = s
        settling = far > 0.3
        var pose = target
        pose.hover = s.hover
        pose.sx = s.sx
        pose.sy = s.sy
        pose.tilt = s.tilt
        pose.shift = s.shift
        // A new picture only every so often, like an old game, but at once when it turns round.
        let tick = floor(clock / (1000 / PIXEL_FPS))
        let facing: Double = cos(heading) < 0 ? -1 : 1
        if tick == shownTick && facing == dir { return false }
        shownTick = tick
        dir = facing
        let drawn = drawFloaty(view.raster, build, pose, clock, view.dressed)
        // Held up by the top of its head; a block in its hands, between them.
        let c = bodyCentre(build, pose)
        top = Pt(x: PIXEL.feetX + c.x * facing, y: PIXEL.feetY + c.y - build.R * pose.sy)
        held = drawn.hands.map { Pt(x: ($0[0].x + $0[1].x) / 2, y: Swift.min($0[0].y, $0[1].y) - 2) }
        view.paint(drawn.box)
        return true
    }
}
