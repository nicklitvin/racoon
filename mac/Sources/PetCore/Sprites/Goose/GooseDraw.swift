import Foundation

// The goose (src/sprites/goose/draw.ts): a white goose seen side on, with a long neck, an
// orange beak and feet, and wings it throws out wide when it means business. Drawn in the same
// pixels as the pixel pets, in the same box, its feet where theirs are.

private let FX = PIXEL.feetX
private let FY = PIXEL.feetY

public enum GooseEyes { case open, closed, wide, cross, happy }

/// Everything about how the goose stands, for one picture. Points are from the ground under it,
/// facing right, px (up is negative).
public struct GoosePose {
    /// How high its body is off the ground: hopping, flapping.
    public var lift = 0.0
    /// Down on the ground, legs folded under it.
    public var sitting = false
    /// Lean of its body, radians: plus tips the front down.
    public var tilt = 0.0
    /// Its head's middle.
    public var head = UP
    /// How far the middle of its neck bows back (an S) or, less than 0, forward.
    public var bow = 1.6
    /// Which way its beak points, radians from straight ahead: plus is down.
    public var nod = 0.0
    /// How wide its beak is open, 0 to 1.
    public var beak = 0.0
    /// Wings: 0 folded on its back, 1 thrown up and out; `flap` beats them up and down.
    public var wing = 0.0
    public var flap = 0.0
    /// Its feet on (or off) the ground: near, far.
    public var feet: [Pt] = [pt(2.5, 0), pt(-1.5, 0)]
    /// Head tucked in on its back, asleep.
    public var tucked = false
    public var eyes: GooseEyes = .open
    public var mark: ChibiMark?
    /// Going fast: speed lines behind it.
    public var dash = 0.0
}

private func rot(_ p: Pt, _ a: Double) -> Pt { Pt(x: p.x * cos(a) - p.y * sin(a), y: p.x * sin(a) + p.y * cos(a)) }
private func ease(_ t: Double) -> Double { t * t * (3 - 2 * t) }
/// 0 to 1 and back, `t` of the way through.
private func hump(_ t: Double) -> Double { sin(Double.pi * clamp01(t)) }
private func mixPoint(_ a: Pt, _ b: Pt, _ k: Double) -> Pt { Pt(x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k) }

/// Its beak's tip from its head's middle, for a beak pointing `nod` down.
public func beakTip(_ nod: Double) -> Pt { rot(pt(7.6, 0.2), nod) }

/// Where its beak pecks at the keys, from the ground under it facing right: the desk is built to fit.
public let KEYBOARD = pt(21, -13)
/// Its beak's angle pecking at the keys.
private let KEYS_NOD = 0.85
/// Its body's middle when standing, and sitting.
private let BODY_Y = -13.0
private let SIT_Y = -8.0
/// Standing tall: where its head is.
private let UP = pt(10, -31)

/// The middle of its body, from the ground under it.
public func bodyCentre(_ p: GoosePose) -> Pt { Pt(x: -1, y: (p.sitting ? SIT_Y : BODY_Y) - p.lift) }

/// Where its head has to be for its beak to touch `at`, pointing `nod` down.
private func headFor(_ at: Pt, _ nod: Double) -> Pt {
    let tip = beakTip(nod)
    return Pt(x: at.x - tip.x, y: at.y - tip.y)
}

/// How the goose looks doing `animation`, `t` ms in, at `clock`: a goose's version of each
/// thing the pets do. Facing right; the drawing turns it round.
public func goosePose(_ animation: AnimationName, _ t: Double, _ clock: Double, _ eyes: Eyes, _ speed: Double, _ keystrokes: Int) -> GoosePose {
    var p = GoosePose()
    p.eyes = eyes == .closed || eyes == .blink ? .closed : eyes == .wide ? .wide : .open
    /// A honk: its beak flung open and shut, `every` ms.
    func honking(_ every: Double) -> Double {
        let u = jsMod(clock, every) / every
        return u < 0.45 ? hump(u / 0.45) : 0
    }
    /// A waddle: its feet stepping, body rocking, head bobbing with each step.
    func waddle(_ cycle: Double, _ stride: Double) {
        let a = (clock / cycle) * Double.pi * 2
        let s = sin(a)
        p.feet = [pt(1 + s * stride, -Swift.max(0, cos(a)) * 1.6), pt(-1 - s * stride, -Swift.max(0, -cos(a)) * 1.6)]
        p.tilt += sin(a * 2) * 0.05
        p.lift += abs(s) * 0.7
        p.head = Pt(x: p.head.x + sin(a * 2) * 0.9, y: p.head.y + abs(cos(a)) * 0.8)
    }

    switch animation {
    case .idle:
        // Standing about, looking round; every so often it has a graze.
        let graze = jsMod(clock, 9000) > 6000 && jsMod(clock, 9000) < 7600
        if graze {
            p.head = headFor(pt(15, -1), 0.9)
            p.nod = 0.9
            p.tilt = 0.12
            p.beak = sin(clock / 70) > 0.3 ? 0.3 : 0
        } else {
            p.head = Pt(x: UP.x + sin(clock / 2300) * 1.2, y: UP.y + sin(clock / 900) * 0.4)
            p.nod = sin(clock / 3100) * 0.12
        }
    case .walk:
        p.head = pt(12, -29)
        p.tilt = 0.04
        waddle(560, 2.4)
    case .nudge:
        // Head down, pushing it along with its beak.
        p.head = headFor(pt(17, -3), 0.6)
        p.nod = 0.6
        p.tilt = 0.15
        p.bow = -0.5
        waddle(560, 2.2)
    case .stalk:
        // Creeping up, neck low and out in front, wings half open.
        p.head = pt(17, -14)
        p.bow = -0.8
        p.tilt = 0.14
        p.wing = 0.25
        waddle(820, 1.6)
        p.eyes = .cross
    case .run, .fetch:
        p.head = animation == .fetch ? pt(13, -28) : pt(16, -24)
        p.bow = animation == .fetch ? 0.8 : 0
        p.tilt = 0.12
        p.wing = 0.35
        p.flap = sin(clock / 110) * 0.3
        waddle(330, 3.4)
        p.dash = clamp01((speed - 150) / 250)
    case .chase:
        // The goose's charge: neck straight out, beak open, wings thrown wide, honking.
        p.head = pt(19, -17)
        p.bow = -1
        p.nod = 0.1
        p.tilt = 0.22
        p.wing = 0.95
        p.flap = sin(clock / 85) * 0.45
        p.beak = Swift.max(0.35, honking(520))
        p.eyes = .cross
        waddle(300, 3.6)
        p.dash = clamp01((speed - 150) / 250)
    case .jump, .leap:
        // Up with a flap or two, feet tucked back.
        let k = hump(t / (animation == .jump ? 400 : 420))
        p.lift = k * 9
        p.head = pt(15, -27)
        p.bow = 0.2
        p.tilt = 0.1
        p.wing = 1
        p.flap = sin(clock / 60) * 0.7
        p.beak = 0.5
        p.feet = [pt(-3, -1.5), pt(-5, -1)]
    case .sit:
        p.sitting = true
        p.head = Pt(x: 9, y: -27 + sin(clock / 1100) * 0.4)
        p.nod = sin(clock / 2900) * 0.1
    case .groom:
        // Preening: head turned round to its back, nibbling at its feathers.
        p.sitting = true
        let k = sin((t / 1000) * Double.pi * 4)
        p.head = Pt(x: 1 + k * 0.8, y: -21)
        p.bow = 2.6
        p.nod = Double.pi - 0.7
        p.beak = k > 0.2 ? 0.4 : 0
        p.wing = 0.12
        p.eyes = .closed
    case .yawn:
        let k = hump(t / 2200)
        p.head = Pt(x: 10, y: -31 - k * 2)
        p.nod = -k * 0.5
        p.beak = k > 0.25 ? k : 0
        p.wing = k * 0.45
        p.eyes = .closed
    case .peek:
        // Head up over the bottom of the screen, eyes darting with your typing.
        p.sitting = true
        p.head = Pt(x: 10 + (keystrokes % 2 != 0 ? 1 : -1), y: -33)
        p.nod = keystrokes % 2 != 0 ? 0.15 : -0.1
    case .sleep:
        // Sat down, head tucked in on its back.
        let breath = sin((t / 3200) * Double.pi * 2)
        p.sitting = true
        p.tucked = true
        p.lift = -breath * 0.4
        p.head = pt(-3, -17)
        p.nod = Double.pi - 0.5
        p.eyes = .closed
        p.mark = .zzz
    case .surprised:
        let k = hump(t / 450)
        p.head = pt(9, -33)
        p.nod = -0.2
        p.wing = k * 0.8
        p.flap = k * 0.3
        p.beak = 0.6
        p.lift = k * 2
        p.eyes = .wide
        p.mark = .alarm
    case .confused:
        p.head = pt(9, -32)
        p.nod = -0.35 + sin(t / 300) * 0.05
        p.mark = .puzzled
    case .dangle:
        // Picked up: flapping like mad, feet paddling, honking its head off.
        let k = sin(clock / 70)
        p.head = pt(12, -30)
        p.bow = 0.6
        p.wing = 1
        p.flap = k * 0.8
        p.beak = Swift.max(0.2, honking(420))
        p.eyes = .wide
        p.feet = [pt(1 + sin(clock / 90) * 1.5, -1), pt(-2 - sin(clock / 90) * 1.5, -0.5)]
    case .happy:
        // A pleased little ruffle of the feathers.
        let k = abs(sin((t / 1200) * Double.pi * 2))
        p.head = Pt(x: 10, y: -32 + k)
        p.wing = 0.2 + k * 0.15
        p.flap = sin(clock / 120) * 0.2
        p.eyes = .happy
        p.mark = .hearts
    case .bat:
        // A peck at the block: neck shot out and down, then back.
        let k = t < 230 ? ease(t / 230) : 1 - ease((t - 230) / 420)
        p.nod = 0.8 * k
        p.head = mixPoint(UP, headFor(pt(21, -4), 0.8), k)
        p.bow = 1.6 - k * 2.2
        p.tilt = 0.18 * k
        p.wing = 0.4 * k
        p.beak = k > 0.8 ? 0.5 : 0
        p.eyes = .wide
    case .toss, .lift, .throw:
        // Down for the block in its beak, then a fling of the head up and away.
        let length: Double = animation == .toss ? 1250 : animation == .lift ? 1000 : 950
        let grab = animation == .throw ? 0 : 380 / length
        let u = t / length
        let down = u < grab ? ease(u / grab) : animation == .lift ? 0.6 : 1 - ease(clamp01((u - grab) / ((1 - grab) * 0.55)))
        p.nod = 0.85 * down - 0.4 * (1 - down) * (u > grab ? 1 : 0)
        p.head = mixPoint(pt(9, -34), headFor(pt(17, -2), 0.85), down)
        p.bow = 1.6 - down * 2
        p.tilt = 0.15 * down
        p.wing = u > grab ? 0.5 * hump((u - grab) / (1 - grab)) : 0
        p.beak = u < grab * 0.8 ? 0.6 : 0.15
    case .carry:
        p.head = pt(13, -28)
        p.bow = 0.8
        p.wing = 0.25
        waddle(480, 2.4)
    case .sniff:
        // Head down, having a nibble at it.
        p.head = headFor(pt(18, -3), 0.9)
        p.nod = 0.9
        p.bow = -0.4
        p.tilt = 0.15
        p.beak = sin(t / 60) > 0.2 ? 0.35 : 0
    case .work, .browse, .reels:
        p.tilt = 0.1
        if animation == .reels {
            // Head up watching, honking with laughter now and then.
            p.head = pt(12, -30)
            p.nod = -0.1
            p.beak = sin(clock / 900) > 0.5 ? honking(260) * 0.7 : 0
            p.wing = sin(clock / 900) > 0.5 ? 0.25 : 0
            p.flap = sin(clock / 80) * 0.2
            break
        }
        // Pecking away at the keys (or clicking the mouse with its beak).
        let at = animation == .work ? KEYBOARD : Pt(x: KEYBOARD.x + 7, y: KEYBOARD.y)
        let peck = animation == .work ? Swift.max(0, sin(clock / 65)) * 2.2 : sin(clock / 400) > 0.7 ? 1.2 : 0
        p.nod = KEYS_NOD
        p.head = add(headFor(at, KEYS_NOD), Pt(x: -peck * 0.3, y: -peck))
        p.bow = 0.2
    case .attention:
        // A big honk: neck up and out, beak wide, wings flapping.
        p.head = pt(12, -32.5)
        p.nod = -0.3
        p.bow = 0.6
        p.beak = honking(600)
        p.wing = 0.75
        p.flap = sin(clock / 110) * 0.4
        p.lift = honking(600) * 1.2
    case .angry:
        // A hiss: neck low and straight out, beak open, wings up, stamping.
        let stamp = sin((t / 800) * Double.pi * 2)
        p.head = Pt(x: 18, y: -16 + sin(t / 45) * 0.4)
        p.bow = -1
        p.nod = 0.15
        p.beak = 0.9
        p.wing = 0.9
        p.flap = sin(t / 50) * 0.08
        p.tilt = 0.2
        p.feet = [pt(2.5, -Swift.max(0, stamp) * 2), pt(-1.5, -Swift.max(0, -stamp) * 2)]
        p.eyes = .cross
        p.mark = .angry
    }
    return p
}

/// One of its wings, thrown up and out from its shoulder: a long feathered kite, `squash` as wide.
private func spreadWing(_ shoulder: Pt, _ angle: Double, _ length: Double, _ dir: Double, _ squash: Double = 1) -> [Pt] {
    let along = Pt(x: cos(angle) * dir, y: -sin(angle))
    let across = Pt(x: -along.y, y: along.x)
    func at(_ u: Double, _ v: Double) -> Pt { Pt(x: shoulder.x + (along.x * u + across.x * v) * squash, y: shoulder.y + along.y * u + across.y * v) }
    return [at(0, -2.6), at(length * 0.4, -4.6 * dir), at(length, -1 * dir), at(length * 0.9, 1.6 * dir), at(length * 0.55, 3.6 * dir), at(0, 3)]
}

/// Turned three-quarters towards you or away (going diagonally), everything across it is this much shorter.
public let GOOSE_QUARTER = 0.64

/// What the goose drawings give back: the box round it (for grabbing it), its back (where you
/// hold it up by) and its beak's tip (where it holds a block).
public struct GooseDrawn {
    public var box: Box?
    public var back: Pt
    public var tip: Pt
}

/// Draws the goose into `r` (cleared first), its feet at the feet point, facing `dir` (1 right,
/// -1 left). `squash` below 1 turns it three-quarters.
public func drawGoose(_ r: Raster, _ p: GoosePose, _ dir: Double, _ clock: Double, _ dress: Dress = UNDRESSED, _ squash: Double = 1) -> GooseDrawn {
    r.clear()
    func P(_ q: Pt) -> Pt { Pt(x: FX + q.x * dir * squash, y: FY + q.y) }
    func local(_ q: Pt) -> Pt { rot(q, p.tilt * dir) }
    let b = bodyCentre(p)
    let B = P(b)
    func onBody(_ q: Pt) -> Pt {
        let l = local(Pt(x: q.x * dir, y: q.y))
        return add(B, Pt(x: l.x * squash, y: l.y))
    }

    // Its shadow on the ground, smaller the higher it hops.
    r.shape(ellipse(FX - dir, FY - 0.5, (11 * squash + 2 * (1 - squash)) * (1 - Swift.min(0.4, p.lift / 25)), 1.6), C.shadow, nil)

    // Speed lines behind it.
    if p.dash > 0.2 {
        for (dy, len) in [(-4.0, 5.0), (0.0, 7.0), (4.0, 4.0)] {
            let x0 = jsRound(B.x - dir * 15 * squash)
            let n = Int(jsRound(len * p.dash))
            if n > 0 { for i in 0..<n { r.set(cell(x0 - dir * Double(i)), cell(jsRound(B.y + dy)), C.light) } }
        }
    }

    let spread = p.wing > 0.15
    let wingAngle = Double.pi * (0.98 - 0.36 * p.wing) + p.flap
    let shoulder = onBody(pt(4, -3))
    // The far wing, up behind it.
    if spread {
        r.shape(polygon(spreadWing(add(shoulder, Pt(x: dir * 1.5 * squash, y: -1)), wingAngle - 0.2, 13 + p.wing * 2, dir, squash)), C.far, C.outline)
    }

    // Legs and feet, unless it's sat on them.
    if !p.sitting {
        func leg(_ foot: Pt, _ hipX: Double, _ colour: Int) {
            let hip = onBody(pt(hipX, 5))
            // Hopping, its feet go up with it.
            let f = P(Pt(x: foot.x, y: foot.y - p.lift * 0.85))
            r.shape(capsule(hip, Pt(x: f.x, y: f.y - 1), 0.7), colour, C.outline)
            r.shape(polygon([pt(f.x - dir * 1.5, f.y), pt(f.x + dir * 3.5, f.y), pt(f.x + dir * 2.5, f.y - 1.6), pt(f.x - dir * 0.5, f.y - 1.6)]), colour, C.outline)
        }
        leg(p.feet[1], -1.5, C.dark)
        leg(p.feet[0], 1.5, C.band)
    }

    // Its body: a plump oval, a tail flicked up at the back.
    let tail = polygon([onBody(pt(-8, -3.5)), onBody(pt(-15, -6.5)), onBody(pt(-13.5, -2.5)), onBody(pt(-8, 2))])
    r.shape(tail, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    r.shape(ellipse(B.x, B.y, Swift.max(7, 11 * squash), p.sitting ? 7.5 : 7, p.tilt * dir * squash), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))

    // The neck, from the front of its body up to its head, curved like an S; or, asleep, the head on its back.
    let neckBase = onBody(pt(7.5, -3))
    let H = P(p.head)
    if !p.tucked {
        let mid = Pt(x: (neckBase.x + H.x) / 2, y: (neckBase.y + H.y) / 2)
        let dx = H.x - neckBase.x
        let dy = H.y - neckBase.y
        let d0 = hypot(dx, dy)
        let d = d0 == 0 ? 1 : d0
        // Bowed back, away from the way it faces (across the line from its body to its head).
        let bend = Pt(x: mid.x + (-dy / d) * -dir * p.bow, y: mid.y + (dx / d) * -dir * p.bow)
        let neck = tube([neckBase, bend, H], [3.4, 2.4, 2.3])
        r.shape(neck.shape, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
        // Filled again over its body's outline, so it grows out of its body without a line across.
        let join = tube([neckBase, bend], [3.4, 2.4])
        r.shape(join.shape, C.fur, nil)
    }

    // The near wing: folded on its back, or thrown wide.
    if spread {
        let pts = spreadWing(shoulder, wingAngle, 14 + p.wing * 2, dir, squash)
        r.shape(polygon(pts), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
        // Grey flight feathers along its trailing edge.
        let tip = pts[2], back = pts[3], tail2 = pts[4]
        for (a, c) in [(tip, back), (back, tail2)] {
            for i in 0...4 {
                let q = Pt(x: a.x + (c.x - a.x) * (Double(i) / 4), y: a.y + (c.y - a.y) * (Double(i) / 4))
                let qx = cell(jsRound(q.x - dir * 0.5))
                let qy = cell(jsRound(q.y - 0.5))
                if r.get(qx, qy) == C.fur || r.get(qx, qy) == C.furDark { r.set(qx, qy, C.furDark) }
            }
        }
    } else {
        let at = onBody(pt(-2.5, -0.6))
        r.shape(ellipse(at.x, at.y, Swift.max(4.5, 7.5 * squash), 3.4, (p.tilt * dir - 0.1 * dir) * squash), C.fur, C.furDark) { _, y in y > at.y - 1.5 }
        // The tips of its folded feathers, down by its tail.
        let tipAt = onBody(pt(-9.5, 0))
        r.dots([tipAt, Pt(x: tipAt.x - dir, y: tipAt.y + 1), Pt(x: tipAt.x + dir, y: tipAt.y)], C.far)
    }

    // Head, beak and eye.
    r.shape(ellipse(H.x, H.y, 4.4, 3.8), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    drawBeak(r, H, p.nod, p.beak, dir, squash)
    drawEye(r, H, p, dir, clock)

    // Round its neck, and on its head.
    if !p.tucked { gooseWear(r, outfitItem(dress.outfit), add(neckBase, Pt(x: dir * 0.5, y: -1)), 7 * NECK_WIDTH, dir, .wear) }
    let crown = add(H, Pt(x: -dir * 0.6, y: -3.2))
    if !p.tucked { gooseWear(r, hatItem(dress.hat), crown, 6, dir, .hat) }

    let box = r.bounds { $0 == C.shadow }
    let top = p.tucked ? add(B, pt(0, -8)) : add(H, pt(0, -4))
    drawMarks(r, p.mark, Pt(x: top.x, y: top.y - 3), dir, clock)
    let tipPt = add(H, Pt(x: beakOut(beakTip(p.nod).x, squash) * dir, y: beakTip(p.nod).y))
    return GooseDrawn(box: box, back: onBody(pt(-1, -7)), tip: tipPt)
}

/// How far out from its head's middle a point `x` along its beak shows, turned three-quarters
/// (`squash`): shorter, from where it meets its head (which is round, the same any way on).
private func beakOut(_ x: Double, _ squash: Double) -> Double { x > 2.4 ? 2.4 + (x - 2.4) * (0.35 + 0.65 * squash) : x }

/// Its orange beak, pointing `nod` down from straight ahead, `open` 0 to 1.
private func drawBeak(_ r: Raster, _ H: Pt, _ nod: Double, _ open: Double, _ dir: Double, _ squash: Double = 1) {
    let o = open * 1.6
    func at(_ x: Double, _ y: Double) -> Pt {
        let q = rot(pt(x, y), nod)
        return Pt(x: H.x + beakOut(q.x, squash) * dir, y: H.y + q.y)
    }
    if o > 0.3 { r.shape(polygon([at(2.6, -0.2), at(6.6, -0.6 - o), at(6, 1.6 + o), at(2.6, 0.8)]), C.mouth, nil) }
    r.shape(polygon([at(2.4, -1.9), at(5, -1.6 - o * 0.4), at(7.8, -0.6 - o), at(7.6, 0.1 - o), at(2.4, 0.3)]), C.band, C.outline)
    r.shape(polygon([at(2.4, 0.5), at(6.8, 0.9 + o), at(6.4, 1.8 + o), at(2.4, 2)]), C.dark, C.outline)
    // A black knob where it meets the head.
    let knob = at(2.4, -0.6)
    r.set(cell(floor(knob.x)), cell(floor(knob.y)), C.outline)
}

private func drawEye(_ r: Raster, _ H: Pt, _ p: GoosePose, _ dir: Double, _ clock: Double) {
    let e = rot(pt(1.2, -1.2), Swift.max(-0.4, Swift.min(0.5, p.nod * 0.5)))
    let ex = cell(floor(H.x + e.x * dir))
    let ey = cell(floor(H.y + e.y))
    let d = Int(dir)
    let blinking = p.eyes == .open && jsMod(clock, 5200) < 140
    func dots(_ points: [(Int, Int)], _ c: Int) { for (x, y) in points { r.set(x, y, c) } }
    switch blinking ? .closed : p.eyes {
    case .open:
        dots([(ex, ey), (ex, ey + 1)], C.eye)
    case .wide:
        dots([(ex, ey), (ex + d, ey), (ex, ey + 1), (ex + d, ey + 1)], C.eye)
        r.set(ex + d, ey, C.glint)
    case .closed:
        dots([(ex - 1, ey + 1), (ex, ey + 1), (ex + 1, ey + 1)], C.eye)
    case .happy:
        dots([(ex - 1, ey + 1), (ex, ey), (ex + 1, ey + 1)], C.eye)
    case .cross:
        // A mean little eye under a brow slanting down to its beak.
        dots([(ex, ey), (ex, ey + 1)], C.eye)
        dots([(ex - d, ey - 2), (ex, ey - 1), (ex + d, ey - 1)], C.outline)
    }
}

/// Something it's wearing, `size` px to a hat unit, its origin at `origin`, turned to face `dir`.
private func gooseWear(_ r: Raster, _ item: Wearable?, _ origin: Pt, _ size: Double, _ dir: Double, _ slots: PaintSlots) {
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

/// Seen end on, how much lower a point in front of it shows (nearer you, down the screen), per px.
private let DEPTH = 0.15

/// The goose coming straight at you (`front`, down the screen) or going away (up it): from the
/// front, its round white chest, its neck up the middle, its beak pointing at you and its eyes
/// either side; from behind, its folded wings and its tail, and the back of its head.
public func drawGooseFacing(_ r: Raster, _ p: GoosePose, _ view: FacingView, _ side: Double, _ clock: Double, _ dress: Dress = UNDRESSED) -> GooseDrawn {
    r.clear()
    let front = view == .front
    // Waddling, its body rocks over the foot that's down.
    func lifted(_ k: Int) -> Double { p.sitting ? 0 : Swift.min(0, p.feet[k].y) }
    let sway = (lifted(1) - lifted(0)) * 0.55
    let B = Pt(x: FX + sway, y: FY + bodyCentre(p).y)
    // (On the middle of a pixel, so its face comes out the same both sides.)
    let H = Pt(x: floor(FX + sway * 0.6) + 0.5, y: FY + p.head.y + (front ? 1 : -1) * DEPTH * p.head.x)

    r.shape(ellipse(FX, FY - 0.5, 9 * (1 - Swift.min(0.4, p.lift / 25)), 1.6), C.shadow, nil)

    // Its wings thrown out to either side: from the front they come up behind it, from
    // behind up off its back, nearer you than its body.
    let spread = p.wing > 0.15
    let wingAngle = Double.pi * (0.98 - 0.36 * p.wing) + p.flap
    func wings() {
        for s in [-1.0, 1.0] {
            // (Thrown back side on is out to its side end on.)
            let pts = spreadWing(Pt(x: B.x + s * 4.5, y: B.y - 3), wingAngle, 12 + p.wing * 2, -s, 0.9)
            r.shape(polygon(pts), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
            // Grey feathers at its tip.
            let tip = pts[2]
            r.dots([Pt(x: tip.x - s, y: tip.y), Pt(x: tip.x - s * 2, y: tip.y + 1)], C.furDark)
        }
    }
    if spread && front { wings() }

    // Its legs under it, each foot stepping up in turn.
    if !p.sitting {
        for k in [0, 1] {
            let s = k == 0 ? side : -side
            let x = FX + s * 3
            let fy = FY + lifted(k) - p.lift * 0.85
            r.shape(capsule(Pt(x: B.x + s * 3, y: B.y + 4), Pt(x: x, y: fy - 1), 0.7), C.band, C.outline)
            // Webbed, pointing at you (wide), or away (only their backs show).
            let w = front ? 2.4 : 1.6
            r.shape(polygon([pt(x - w, fy), pt(x + w, fy), pt(x + w * 0.5, fy - 1.6), pt(x - w * 0.5, fy - 1.6)]), front ? C.band : C.dark, C.outline)
        }
    }

    // Its neck comes up from behind its chest, or the top of its back; its head is in front
    // of its body from the front, and behind it (out of sight, if it's down low) from behind.
    let neckBase = Pt(x: B.x, y: B.y + (front ? -3 : -4))
    let neckMid = Pt(x: (neckBase.x + H.x) / 2, y: (neckBase.y + H.y) / 2)
    func neck() {
        r.shape(tube([neckBase, neckMid, H], [3.2, 2.4, 2.3]).shape, C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    }
    /// From the front: its eyes either side, and its beak down the middle, pointing at you.
    func face() {
        let len = beakLength(p)
        let o = p.beak * 1.8
        let top = H.y + 0.2
        if o > 0.3 {
            r.shape(polygon([pt(H.x - 1.3, top + 1), pt(H.x + 1.3, top + 1), pt(H.x + 1, top + len + o), pt(H.x - 1, top + len + o)]), C.mouth, nil)
            r.shape(polygon([pt(H.x - 1.1, top + len + o - 1), pt(H.x + 1.1, top + len + o - 1), pt(H.x + 0.8, top + len + o + 0.8), pt(H.x - 0.8, top + len + o + 0.8)]), C.dark, C.outline)
        }
        // (Outlined only round its tip: orange on white shows well enough.)
        r.shape(polygon([pt(H.x - 1.4, top), pt(H.x + 1.4, top), pt(H.x + 1, top + len), pt(H.x - 1, top + len)]), C.band, C.outline) { _, y in y > top + len - 0.2 }
        let blinking = p.eyes == .open && jsMod(clock, 5200) < 140
        func dots(_ points: [(Int, Int)], _ c: Int) { for (x, y) in points { r.set(x, y, c) } }
        for s in [-1, 1] {
            // Either side of the top of its beak (under a hat's brim).
            let ex = cell(floor(H.x)) + s * 3
            let ey = cell(floor(H.y - 1.2))
            switch blinking ? .closed : p.eyes {
            case .open:
                dots([(ex, ey), (ex, ey + 1)], C.eye)
            case .wide:
                dots([(ex, ey - 1), (ex, ey), (ex, ey + 1)], C.eye)
                r.set(ex, ey - 1, C.glint)
            case .closed:
                dots([(ex - s, ey + 1), (ex, ey + 1)], C.eye)
            case .happy:
                dots([(ex - s, ey + 1), (ex, ey)], C.eye)
            case .cross:
                // Mean little eyes under brows slanting down to its beak.
                dots([(ex, ey), (ex, ey + 1)], C.eye)
                dots([(ex + s, ey - 2), (ex, ey - 1)], C.outline)
            }
        }
    }
    func head() {
        r.shape(ellipse(H.x, H.y, 4.3, 4), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
        if front { face() }
    }
    if !p.tucked { neck() }
    if !front && !p.tucked { head() }

    // Its body, round, end on.
    r.shape(ellipse(B.x, B.y, 8, p.sitting ? 7.5 : 7.2, sway * 0.05), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))

    if front {
        if !p.tucked { head() }
    } else {
        // Its folded wings down its back, meeting over its tail, and its tail sticking up between them.
        if !spread {
            for i in 0..<5 {
                let y = jsRound(B.y - 3 + Double(i) * 1.5)
                let x = jsRound(B.x + 0.5 - Double(4 - i) * 0.9)
                r.dots([Pt(x: x, y: y), Pt(x: jsRound(2 * B.x - x), y: y)], C.furDark)
            }
        }
        r.shape(polygon([pt(B.x - 2.2, B.y + 4), pt(B.x, B.y + 1), pt(B.x + 2.2, B.y + 4), pt(B.x, B.y + 5.5)]), C.furLight, C.furDark)
        if spread { wings() }
    }
    // Asleep, its head tucked in on its back.
    if p.tucked {
        r.shape(ellipse(B.x + side * 2, B.y - 5, 3.6, 3.2), C.fur, C.outline, shade: Shade(light: C.furLight, dark: C.furDark))
    }

    // Round its neck, and on its head.
    if !p.tucked {
        let collar = Pt(x: neckBase.x + (H.x - neckBase.x) * 0.25, y: neckBase.y + (H.y - neckBase.y) * 0.25 - 1)
        wearEndOn(r, outfitItem(dress.outfit), collar, 7 * NECK_WIDTH, side, front, .wear, true)
        wearEndOn(r, hatItem(dress.hat), Pt(x: H.x, y: H.y - 3.9), 6, side, front, .hat, false)
    }

    let box = r.bounds { $0 == C.shadow }
    let top = p.tucked ? Pt(x: B.x, y: B.y - 8) : Pt(x: H.x, y: H.y - 4)
    drawMarks(r, p.mark, Pt(x: top.x, y: top.y - 3), side, clock)
    return GooseDrawn(box: box, back: Pt(x: B.x, y: B.y - 7), tip: Pt(x: H.x, y: H.y + 1 + (front ? beakLength(p) : 0)))
}

/// From the front, how far down its face its beak shows: longer pointing down, foreshortened pointing at you.
private func beakLength(_ p: GoosePose) -> Double { 2.6 + Swift.max(0, p.nod) * 1.6 - Swift.max(0, -p.nod) * 1.2 }

/// Something it's wearing, seen end on: drawn as from the side, but neckwear that hangs at its
/// front (a tie, a bell) comes round to the middle, and is out of sight from behind.
private func wearEndOn(_ r: Raster, _ item: Wearable?, _ origin: Pt, _ size: Double, _ side: Double, _ front: Bool, _ slots: PaintSlots, _ neckwear: Bool) {
    guard let item else { return }
    func at(_ x: Double, _ y: Double) -> Pt { Pt(x: origin.x + x * size * side, y: origin.y + y * size) }
    for s in item.shapes {
        let hangs = neckwear && isFrontPiece(s)
        if hangs && !front { continue }
        let dx = hangs ? -0.85 : 0
        let shape: Shape
        switch s {
        case let .poly(points, _): shape = polygon(points.map { at($0.x + dx, $0.y) })
        case let .ellipse(cx, cy, rx, ry, _):
            let c = at(cx + dx, cy)
            shape = ellipse(c.x, c.y, Swift.max(0.6, rx * size), Swift.max(0.6, ry * size))
        }
        r.shape(shape, slots.slot(s.paint), C.outline)
    }
}
