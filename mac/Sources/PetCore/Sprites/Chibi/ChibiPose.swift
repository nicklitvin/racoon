import Foundation

// Poses for the pets that move like chibis: every pixel pet but the goose and the floaties
// (src/sprites/chibi/pose.ts).

public enum LegName: CaseIterable {
    case frontNear, frontFar, backNear, backFar
    public var isFront: Bool { self == .frontNear || self == .frontFar }
    public var isFar: Bool { self == .frontFar || self == .backFar }
}

public let LEGS = LegName.allCases

/// How the eyes are drawn: open, shut in a relaxed curve, happy ^ ^, wide, or mid-blink.
public enum ChibiEyes {
    case open, closed, happy, wide, blink
}

/// Little marks that float about him: sleep, alarm, puzzlement, love.
public enum ChibiMark {
    case zzz, alarm, puzzled, hearts, angry
}

public struct Paws {
    public var frontNear = Pt.zero
    public var frontFar = Pt.zero
    public var backNear = Pt.zero
    public var backFar = Pt.zero

    public subscript(leg: LegName) -> Pt {
        get {
            switch leg {
            case .frontNear: return frontNear
            case .frontFar: return frontFar
            case .backNear: return backNear
            case .backFar: return backFar
            }
        }
        set {
            switch leg {
            case .frontNear: frontNear = newValue
            case .frontFar: frontFar = newValue
            case .backNear: backNear = newValue
            case .backFar: backFar = newValue
            }
        }
    }
}

/// Everything the drawing needs for one moment. Positions are in drawing units from his
/// feet, facing right, y down. The numbers blend smoothly from one animation to the next.
public struct ChibiPose {
    /// The whole animal raised off the floor (negative is up).
    public var lift = 0.0
    /// The body: moved from where it stands, tipped nose-up by `rot` degrees, squashed.
    public var bx = 0.0
    public var by = 0.0
    public var rot = 0.0
    public var sx = 1.0
    /// Negative turns it over (an otter floating on its back).
    public var sy = 1.0
    /// The head: moved from its place on the body, and tipped chin-up.
    public var hx = 0.0
    public var hy = 0.0
    public var hrot = 0.0
    /// Where each paw is, from his feet as they'd be on the floor: `lift` carries them up with him.
    public var paws = Paws()
    /// Tail: the angle it leaves the body at, how far it curls, a sway, and how fluffed up.
    public var tailA = 0.0
    public var tailCurl = 0.0
    public var tailPuff = 1.0
    /// 1 brings the tail round in front of him (wrapped round his paws).
    public var tailFront = 0.0
    /// Ears: 1 pricked, 0 relaxed, -1 flat back.
    public var ears = 0.0
    public var mouth = 0.0
    public var tongue = 0.0
    public var lookX = 0.0
    public var lookY = 0.0
    public var blush = 0.55
    /// Sitting, the thigh shows as a round haunch.
    public var haunch = 0.0
    /// 1 brings the near front paw up in front of him (grooming), 2 both (paws on the screen edge).
    public var pawUp = 0.0
    /// An otter's shell, held on its chest.
    public var shell = 0.0
    /// 1 holds a toy block in both front paws (a raccoon), rather than in the mouth.
    public var hold = 0.0
    /// How far the face is turned from three-quarters towards you round to the way he faces, 0..1.
    public var turn = 0.0
    /// How much of a pond there is round him (swimmers only).
    public var wet = 0.0
    /// Rocking on the end of your grip, in degrees round the scruff.
    public var swing = 0.0
    public var eyes: ChibiEyes = .open
    public var mark: ChibiMark?
    /// Splashes about him: 0 none, 1 a few drops, 2 a proper splash.
    public var splash = 0.0
    /// Bubbles coming up where he is, under the water.
    public var bubbles = 0.0
    /// Rolled up in a ball (a hedgehog), and how far round it has rolled, in degrees.
    public var ball = 0.0
    public var roll = 0.0
    /// How far long ears (a bunny's) have swung back from where they'd be, in degrees. Set by the motion.
    public var earFlap = 0.0

    public init() {}
}

/// The water's surface for a swimmer, from its feet.
public let WATER_Y = -7.0

public struct ChibiInput {
    public var animation: AnimationName
    /// Time into the animation (ms).
    public var t: Double
    /// Wall-clock time (ms), for the movement that carries on through animations.
    public var clock: Double
    /// How far round the stride he is, 0..1, kept in step with the ground.
    public var phase: Double
    public var keystrokes: Int
    public var eyes: Eyes
    /// Where the pointer is from his feet, in drawing units, already turned to his facing.
    public var gaze: Pt?
}

private let NUMBERS: [WritableKeyPath<ChibiPose, Double>] = [
    \.lift, \.bx, \.by, \.rot, \.sx, \.sy, \.hx, \.hy, \.hrot, \.tailA, \.tailCurl, \.tailPuff, \.tailFront,
    \.ears, \.mouth, \.tongue, \.lookX, \.lookY, \.blush, \.haunch, \.pawUp, \.shell, \.hold, \.turn, \.wet,
    \.swing, \.splash, \.bubbles, \.ball, \.roll,
]

/// Where the body's middle is and how it's turned, and a way to place points on it.
public struct BodyFrame {
    public let cx: Double
    public let cy: Double
    let c: Double
    let s: Double
    let sx: Double
    let sy: Double

    /// A point on the body; `flat` ignores the squash's sign, for things that don't turn over with it.
    public func at(_ l: Pt, _ flat: Bool = false) -> Pt {
        let x = l.x * sx
        let y = l.y * (flat ? abs(sy) : sy)
        return Pt(x: cx + x * c - y * s, y: cy + x * s + y * c)
    }
}

public func bodyFrame(_ b: ChibiBuild, _ p: ChibiPose) -> BodyFrame {
    let th = -p.rot * DEG
    return BodyFrame(cx: b.body.at.x + p.bx, cy: b.body.at.y + p.by + p.lift, c: cos(th), s: sin(th), sx: p.sx, sy: p.sy)
}

/// Where a leg joins the body. Far legs sit a little behind and above the near ones.
public func legRoot(_ b: ChibiBuild, _ p: ChibiPose, _ leg: LegName) -> Pt {
    let base = leg.isFront ? b.shoulder : b.hip
    let root = bodyFrame(b, p).at(base)
    return leg.isFar ? Pt(x: root.x + b.farOffset * 0.6, y: root.y - 1) : root
}

public func headCentre(_ b: ChibiBuild, _ p: ChibiPose) -> Pt {
    let at = bodyFrame(b, p).at(b.head.at, true)
    return Pt(x: at.x + p.hx, y: at.y + p.hy)
}

/// Where he's held when he's picked up: the scruff, at the back of his neck.
public func scruffPoint(_ b: ChibiBuild, _ p: ChibiPose) -> Pt {
    let h = headCentre(b, p)
    let th = -p.hrot * DEG
    let l = Pt(x: -b.head.rx * 0.5, y: -b.head.ry * 0.82)
    return Pt(x: h.x + l.x * cos(th) - l.y * sin(th), y: h.y + l.x * sin(th) + l.y * cos(th))
}

/// Where a toy block he has hold of is (its middle): between his front paws if he's holding
/// it in them, or else hanging from his jaws, just under the corner of his mouth.
public func toyHoldPoint(_ b: ChibiBuild, _ p: ChibiPose) -> Pt {
    if p.hold > 0.5 {
        let a = p.paws.frontNear
        let z = p.paws.frontFar
        return Pt(x: (a.x + z.x) / 2 + 2.5, y: (a.y + z.y) / 2 + p.lift - 1)
    }
    let h = headCentre(b, p)
    let th = -p.hrot * DEG
    let l = Pt(x: b.head.rx * 0.78, y: b.head.ry * 0.55)
    let mouth = Pt(x: h.x + l.x * cos(th) - l.y * sin(th), y: h.y + l.x * sin(th) + l.y * cos(th))
    return Pt(x: mouth.x + 1, y: mouth.y + CHIBI_TOY * 0.37)
}

/// Standing square on all fours, every paw under its shoulder or hip.
private func stand(_ b: ChibiBuild) -> ChibiPose {
    var p = ChibiPose()
    p.tailA = b.tail.angle
    p.tailCurl = b.tail.curl
    plant(b, &p)
    return p
}

/// Puts every paw on the floor straight under where its leg joins.
private func plant(_ b: ChibiBuild, _ p: inout ChibiPose) {
    for leg in LEGS { p.paws[leg] = Pt(x: legRoot(b, p, leg).x, y: 0) }
}

/// Sitting up: rump on the floor, front legs straight, hind feet forward under the haunch.
private func sit(_ b: ChibiBuild) -> ChibiPose {
    var p = stand(b)
    p.rot = 26
    p.bx = -1.5
    p.by = 2.5 - b.body.rx * 0.1
    p.hx = -2.5
    p.hy = 1.5
    for leg in [LegName.frontNear, .frontFar] { p.paws[leg] = Pt(x: legRoot(b, p, leg).x + 1, y: 0) }
    let hip = legRoot(b, p, .backNear)
    p.paws.backNear = Pt(x: hip.x + 7.5, y: 0)
    p.paws.backFar = Pt(x: hip.x + 9.5, y: 0)
    p.haunch = 1
    // The tail comes down and round in front of the paws.
    p.tailA = 205
    p.tailCurl = -150
    p.tailFront = 1
    return p
}

/// Settled down for a rest: a bunny hunkers down into a loaf, front paws tucked under and
/// its ears laid back; a hedgehog lies low on its tummy, nose down; anyone else sits up.
private func rest(_ b: ChibiBuild) -> ChibiPose {
    if b.species != .bunny && b.species != .hedgehog { return sit(b) }
    var p = stand(b)
    let bunny = b.species == .bunny
    p.by = bunny ? 3 : 2
    p.sx = 1.04
    p.sy = 0.94
    p.hy = bunny ? 2 : 2.5
    p.hrot = bunny ? -3 : -8
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + (leg.isFront ? 2.5 : 1.5), y: Swift.min(0, root.y + 2))
    }
    p.haunch = bunny ? 1 : 0
    p.ears = bunny ? -0.5 : 0
    return p
}

/// Lying curled up, paws tucked under, head down on the floor in front.
private func curl(_ b: ChibiBuild) -> ChibiPose {
    var p = stand(b)
    p.sy = 0.86
    p.sx = 1.05
    p.by = b.body.at.y * -0.3 + 1.5
    p.hx = -1
    p.hy = 6 - b.body.at.y * 0.12
    p.hrot = -8
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + (leg.isFront ? 4 : 2), y: Swift.min(0, root.y + 3))
    }
    p.tailA = 200
    p.tailCurl = -170
    p.tailFront = 1
    return p
}

private func mix(_ a: ChibiPose, _ b: ChibiPose, _ k: Double) -> ChibiPose {
    var out = k < 0.5 ? a : b
    for key in NUMBERS { out[keyPath: key] = lerp(a[keyPath: key], b[keyPath: key], k) }
    for leg in LEGS { out.paws[leg] = Pt(x: lerp(a.paws[leg].x, b.paws[leg].x, k), y: lerp(a.paws[leg].y, b.paws[leg].y, k)) }
    return out
}

/// Eases one pose towards another: `k` of the way there.
public func blendPose(_ from: ChibiPose, _ to: ChibiPose, _ k: Double) -> ChibiPose { mix(from, to, k) }

/// How far apart two poses are, to tell when a blend has settled.
public func poseDistance(_ a: ChibiPose, _ b: ChibiPose) -> Double {
    var d = 0.0
    for key in NUMBERS { d = Swift.max(d, abs(a[keyPath: key] - b[keyPath: key])) }
    for leg in LEGS { d = Swift.max(d, abs(a.paws[leg].x - b.paws[leg].x), abs(a.paws[leg].y - b.paws[leg].y)) }
    return d
}

/// Breathing and a slow sway of the tail, so he's never quite still.
private func alive(_ p: inout ChibiPose, _ clock: Double, _ amount: Double = 1) {
    let breath = wave(clock, 2600)
    p.sy *= 1 + 0.025 * breath * amount
    p.sx *= 1 - 0.012 * breath * amount
    p.tailA += noise1(clock / 1700, 3) * 9 * amount
    p.tailCurl += noise1(clock / 2300, 5) * 14 * amount
    // Now and then an ear flicks.
    let flick = bump(jsMod(clock / 3900, 1) * 9 - 7.6)
    p.ears += flick * 0.6
}

/// Turns the head and eyes to the pointer.
private func look(_ b: ChibiBuild, _ p: inout ChibiPose, _ gaze: Pt?, _ weight: Double = 1) {
    guard let gaze else { return }
    let h = headCentre(b, p)
    let dx = gaze.x - h.x
    let dy = gaze.y - h.y
    let h0 = hypot(dx, dy)
    let d = h0 == 0 ? 1 : h0
    p.lookX = lerp(p.lookX, clamp((dx / d) * 1.2, -1, 1), weight)
    p.lookY = lerp(p.lookY, clamp((dy / d) * 1.2, -1, 1), weight)
    // Looking up he lifts his chin a little; behind him, he doesn't screw his head round.
    p.hrot += clamp(-dy / 50, -1, 1) * 9 * weight * (dx > -10 ? 1 : 0.4)
}

private func eyesFrom(_ input: ChibiInput) -> ChibiEyes {
    switch input.eyes {
    case .closed: return .closed
    case .wide: return .wide
    case .blink: return .blink
    case .open: return .open
    }
}

/// Trotting: diagonal pairs of paws step together, the body bobbing twice a stride.
private func walk(_ b: ChibiBuild, _ p: inout ChibiPose, _ phase: Double, _ amount: Double = 1) {
    let u = phase * Double.pi * 2
    func offset(_ leg: LegName) -> Double { leg == .frontNear || leg == .backFar ? 0 : Double.pi }
    let bob = cos(2 * u)
    p.by += 0.7 * bob * amount
    p.rot += 1.6 * sin(2 * u + 0.5) * amount
    p.hy += 0.5 * cos(2 * u - 0.6) * amount
    for leg in LEGS {
        let v = u + offset(leg)
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + b.stride.walk * sin(v) * amount, y: -3 * Swift.max(0, cos(v)) * amount)
    }
    p.tailA += 5 * sin(u) * amount
}

/// Bounding along: front paws together, then hind, the body rocking over them.
private func gallop(_ b: ChibiBuild, _ p: inout ChibiPose, _ phase: Double, _ reach: Double) {
    let u = phase * Double.pi * 2
    func offset(_ leg: LegName) -> Double {
        switch leg {
        case .frontNear: return 0
        case .frontFar: return -0.45
        case .backNear: return Double.pi * 0.95
        case .backFar: return Double.pi * 0.95 - 0.45
        }
    }
    p.rot += 8 * sin(u + 0.3)
    p.lift += -3.2 * Swift.max(0, sin(u - 0.9))
    p.sx *= 1 + 0.07 * sin(u + Double.pi / 2)
    p.sy *= 1 - 0.06 * sin(u + Double.pi / 2)
    p.hy += 1 + 1.2 * sin(u - 0.8)
    p.hx += 1.5
    for leg in LEGS {
        let v = u + offset(leg)
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + reach * sin(v), y: -4.2 * Swift.max(0, cos(v)))
    }
    p.ears = -0.6
    p.tailA = lerp(p.tailA, 172, 0.6) + 8 * sin(u - 1)
    p.tailCurl *= 0.4
}

/// Hopping, both hind feet together: a crouch, a spring forward stretched out with the front
/// paws reaching for the ground, and a landing that gathers into the next crouch. One hop a stride.
private func hop(_ b: ChibiBuild, _ p: inout ChibiPose, _ phase: Double, _ height: Double) {
    let flying = phase > 0.15 && phase < 0.85
    let air = clamp01((phase - 0.15) / 0.7)
    let up = flying ? sin(Double.pi * air) : 0
    // Crouched from landing (0.85) round to take-off (0.15).
    let crouch = flying ? 0 : sin(Double.pi * jsMod(phase + 0.15, 1) / 0.3)
    p.lift = -height * up
    p.by += 2.2 * crouch
    p.sy *= 1 - 0.12 * crouch + 0.04 * up
    p.sx *= 1 + 0.06 * crouch + 0.08 * up
    p.rot += lerp(16, -14, smooth(air)) * up - 3 * crouch
    p.hy += 1.2 * crouch - 0.6 * up
    p.haunch = crouch > 0.5 ? 1 : 0
    let k = Swift.min(1, up * 2.2)
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        let front = leg.isFront
        // Down, the hind feet are tucked under the haunch; up, they trail behind and the front paws reach forward.
        let ground = Pt(x: root.x + (front ? 1 : 3), y: 0)
        let reach = Pt(x: root.x + (front ? 5 : -7), y: root.y - p.lift + (front ? 5 : 3.5))
        p.paws[leg] = Pt(x: lerp(ground.x, reach.x, k), y: lerp(ground.y, reach.y, k))
    }
    p.ears = lerp(p.ears, -0.7, up)
    p.tailA += 10 * up
}

/// A pounce or a leap: gather, spring up in an arc, land. `gather` is how much of it is the crouch.
private func spring(_ b: ChibiBuild, _ p: inout ChibiPose, _ u: Double, _ height: Double, _ gather: Double) {
    let crouch = gather > 0 ? bump(Swift.min(1, u / gather) * 0.5) : 0
    let air = clamp01((u - gather) / (1 - gather))
    let up = sin(Double.pi * air)
    p.by += 2.2 * crouch
    p.sy *= 1 - 0.14 * crouch + 0.08 * up
    p.sx *= 1 + 0.08 * crouch - 0.04 * up
    p.rot += -6 * crouch + lerp(18, -14, smooth(air)) * up
    p.lift = -height * up
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        let front = leg.isFront
        // In the air the front paws reach forward and the hind legs stretch out behind.
        let reach = Pt(x: root.x + (front ? 5.5 : -6), y: root.y - p.lift + 5)
        let ground = Pt(x: p.paws[leg].x, y: 0)
        p.paws[leg] = Pt(x: lerp(ground.x, reach.x, Swift.min(1, up * 2)), y: lerp(ground.y, reach.y, Swift.min(1, up * 2)))
    }
    p.tailA = lerp(p.tailA, 168, up)
    p.ears = lerp(p.ears, -0.4, up)
}

/// A fox's mousing pounce: a crouch, a high arc, and down nose first onto whatever it's after.
private func pounce(_ b: ChibiBuild, _ p: inout ChibiPose, _ u: Double) {
    spring(b, &p, u, 24, 0.35)
    let air = clamp01((u - 0.35) / 0.65)
    let up = sin(Double.pi * air)
    let dive = smooth(clamp01((air - 0.4) / 0.6))
    p.rot -= 42 * dive * up
    p.hrot -= 18 * dive * up
    p.tailA += 30 * up
}

/// Sat up on its hind legs to have a look about, front paws tucked to its chest (a bunny).
private func lookout(_ b: ChibiBuild) -> ChibiPose {
    var p = upright(b)
    p.hold = 0
    p.haunch = 1
    let shoulder = legRoot(b, p, .frontNear)
    p.paws.frontNear = Pt(x: shoulder.x + 3, y: shoulder.y + 4)
    p.paws.frontFar = Pt(x: shoulder.x + 1.5, y: shoulder.y + 3)
    p.ears = 1
    p.lookX = 0.5
    p.lookY = -0.3
    return p
}

/// How big a hedgehog is rolled up: the radius of its ball.
public func ballRadius(_ b: ChibiBuild) -> Double { b.body.ry * 1.25 }

/// What a hedgehog rolls up for.
private let CURLS: Set<AnimationName> = [.run, .chase, .leap, .sleep, .surprised, .dangle]

/// Rolled up in a spiky ball: rolling along, bouncing, asleep, startled, or hanging from your grip.
private func curled(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let phase = input.phase
    let R = ballRadius(b)
    var p = input.animation == .dangle ? dangle(b, input) : stand(b)
    p.ball = 1
    p.eyes = .closed
    p.ears = -1
    if input.animation == .dangle {
        // Hanging just under your grip: the ball moves, and the head (where it's held) stays put.
        let s = scruffPoint(b, p)
        let f = bodyFrame(b, p)
        let dx = s.x - f.cx
        let dy = s.y + R * 0.95 - f.cy
        p.bx += dx
        p.by += dy
        p.hx -= dx
        p.hy -= dy
        return p
    }
    p.by = -R - b.body.at.y
    switch input.animation {
    case .run, .chase:
        // Half a turn a stride (a whole number of spikes, so it rolls on seamlessly), bumping along.
        p.roll = phase * 180
        p.lift = -1.2 * abs(sin(phase * Double.pi * 4))
    case .leap:
        p.roll = phase * 180
        p.lift = -14 * sin(Double.pi * clamp01(t / 420))
    case .sleep:
        let breath = wave(t, 3200)
        p.sy *= 1 + 0.04 * breath
        p.sx *= 1 + 0.02 * breath
        p.blush = 0.7
        p.mark = .zzz
    case .surprised:
        // Pops up, bristling.
        p.lift = -7 * sin(Double.pi * Swift.min(1, clamp01(t / 450) * 1.7))
        p.sx = 1.08
        p.sy = 1.08
        p.mark = .alarm
    default:
        break
    }
    return p
}

/// Hanging from your grip by the scruff: body straight down, legs and tail dangling.
private func dangle(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    var p = stand(b)
    p.rot = 80
    p.bx = -4 - b.body.at.x * 0.2
    p.by = b.body.rx * 0.3
    // Turned upright, the head would end up behind; it goes on top.
    p.hx = 12
    p.hy = -b.body.rx * 0.5 + 4
    p.hrot = -4
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        let sway = sin(input.t / 260 + (leg.isFront ? 0 : 1.4)) * 0.8
        p.paws[leg] = Pt(x: root.x + (leg.isFront ? 3 : 1.5) + sway, y: root.y + 6.5)
    }
    p.tailA = -95
    p.tailCurl = 25
    p.ears = -0.3
    p.swing = 7 * sin((input.t / 1400) * Double.pi * 2)
    p.mouth = 0.12
    p.blush = 0.8
    p.eyes = eyesFrom(input)
    return p
}

/// Peeking up over the bottom of the screen, paws on the edge.
private func peek(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    var p = stand(b)
    p.rot = 74
    p.bx = 1
    p.by = -2
    // Turned upright, the head would end up behind; it goes on top.
    p.hx = 12.5
    p.hy = -1
    let edge = -b.peekSink
    let h = headCentre(b, p)
    p.paws.frontNear = Pt(x: h.x + b.head.rx * 0.35, y: edge)
    p.paws.frontFar = Pt(x: h.x - b.head.rx * 0.2, y: edge - 0.5)
    for leg in [LegName.backNear, .backFar] { p.paws[leg] = Pt(x: legRoot(b, p, leg).x + 3, y: 0) }
    p.pawUp = 2
    p.tailA = -80
    p.tailCurl = 30
    // His eyes dart from side to side with your typing.
    let k = input.keystrokes
    p.lookX = k == 0 ? 0 : (Double(k % 4) - 1.5) / 1.5
    p.lookY = -0.2
    p.hrot = p.lookX * -4
    p.ears = 0.6
    p.eyes = eyesFrom(input)
    return p
}

/// Swatting a toy block along the floor: a crouch with the bottom up and the tail lashing,
/// the paw cocked, a quick swipe that meets the block on the beat, and the follow-through.
private func bat(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    let hit = PLAY.batHitMs
    var p = stand(b)
    let crouch = keyed(t, [(0, 0), (140, 1), (hit + 150, 1), (PLAY.batMs - 50, 0)])
    p.by += 1.8 * crouch
    p.rot -= 4 * crouch
    p.hrot -= 9 * crouch
    p.hx += 1.5 * crouch
    p.tailA += 16 * crouch
    p.tailCurl += 30 * sin(clock / 70) * crouch
    p.ears = 0.8 * crouch
    plant(b, &p)
    let root = legRoot(b, p, .frontNear)
    let contact = b.toyReach - CHIBI_TOY / 2 - 0.5
    p.paws.frontNear = Pt(
        x: keyed(t, [(0, root.x), (150, root.x + 5), (hit, contact), (hit + 100, contact + 2.5), (PLAY.batMs - 60, root.x)]),
        y: keyed(t, [(0, 0), (150, -12), (hit, -4), (hit + 100, -1.5), (PLAY.batMs - 60, 0)])
    )
    p.pawUp = t > 40 && t < PLAY.batMs - 90 ? 1 : 0
    p.lookX = 0.9
    p.lookY = 0.8 * crouch
    p.mouth = 0.2 * keyed(t, [(hit - 40, 0), (hit + 20, 1), (hit + 260, 0)])
    p.eyes = t < hit + 200 ? .wide : eyesFrom(input)
    return p
}

/// Picking a block up in his mouth and flinging it: down to it, a toss of the head back and
/// up as he lifts it, then a whip forward that lets it go at the top of the swing.
private func toss(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let grab = PLAY.tossGrabMs, release = PLAY.tossReleaseMs, end = PLAY.tossMs
    let wind = release - 220
    var p = stand(b)
    p.rot = keyed(t, [(0, 0), (grab, -9), (grab + 60, -9), (wind, 10), (release, -3), (release + 150, -5), (end, 0)])
    p.by = keyed(t, [(0, 0), (grab, 2), (wind, -0.5), (release, 0)])
    p.hx = keyed(t, [(0, 0), (grab, 2.5), (grab + 60, 2.5), (wind, -3), (release, 4), (release + 150, 4.5), (end, 0)])
    p.hy = keyed(t, [(0, 0), (grab, 4), (grab + 60, 4), (wind, -3), (release, -2), (end, 0)])
    p.hrot = keyed(t, [(0, 0), (grab, -24), (grab + 60, -24), (wind, 26), (release, 6), (release + 150, -4), (end, 0)])
    plant(b, &p)
    p.tailA += keyed(t, [(0, 0), (wind, 25), (release, -10), (end, 0)])
    p.ears = keyed(t, [(0, 0.3), (wind, -0.2), (release, 0.8), (end, 0.3)])
    p.lookX = 0.7
    p.lookY = keyed(t, [(0, 0.3), (grab - 100, 0.9), (grab + 60, 0.9), (wind, -0.5), (release + 100, -0.8), (end, -0.3)])
    p.mouth = 0.35 * keyed(t, [(release, 0), (release + 60, 1), (end, 0)])
    p.eyes = t > release + 40 && t < end - 120 ? .happy : eyesFrom(input)
    return p
}

/// Up on his hind legs, hugging a toy block to his tummy in both front paws.
private func upright(_ b: ChibiBuild) -> ChibiPose {
    var p = stand(b)
    p.rot = 70
    p.bx = 1
    p.by = -2.2
    // Turned upright, the head would end up behind; it goes on top.
    p.hx = 15
    p.hy = -3
    p.hrot = -4
    for leg in [LegName.backNear, .backFar] { p.paws[leg] = Pt(x: legRoot(b, p, leg).x + 0.5, y: 0) }
    let shoulder = legRoot(b, p, .frontNear)
    p.paws.frontNear = Pt(x: shoulder.x + 6.5, y: shoulder.y + 3)
    p.paws.frontFar = Pt(x: shoulder.x + 4.5, y: shoulder.y + 1.5)
    p.pawUp = 2
    p.hold = 1
    // The tail out behind him along the floor, to balance (its angle is from the body, which is upright).
    p.tailA = 118
    p.tailCurl = 30
    p.ears = 0.3
    p.lookX = 0.6
    p.lookY = 0.3
    return p
}

/// Bent down over a block in front of him, front paws round it.
private func reachDown(_ b: ChibiBuild) -> ChibiPose {
    var p = stand(b)
    p.rot = -9
    p.by = 2
    p.hx = 2.5
    p.hy = 4
    p.hrot = -20
    plant(b, &p)
    let contact = b.toyReach - CHIBI_TOY / 2
    p.paws.frontNear = Pt(x: contact + 0.5, y: -4)
    p.paws.frontFar = Pt(x: contact - 1, y: -5)
    p.pawUp = 2
    p.ears = 0.4
    p.lookX = 0.8
    p.lookY = 0.9
    return p
}

/// Eases from each pose to the next at the times given (ms), holding the last.
private func through(_ t: Double, _ keys: [(Double, ChibiPose)]) -> ChibiPose {
    for i in 1..<keys.count {
        let (t0, from) = keys[i - 1]
        let (t1, to) = keys[i]
        if t <= t1 { return mix(from, to, smooth(clamp01((t - t0) / (t1 - t0)))) }
    }
    return keys[keys.count - 1].1
}

/// A raccoon picking a block up in his front paws and standing up with it.
private func liftUp(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let grab = PLAY.liftGrabMs, end = PLAY.liftMs
    let reach = reachDown(b)
    var p = through(t, [(0, stand(b)), (grab - 40, reach), (grab + 60, reach), (end - 120, upright(b))])
    // He only has it from the moment he grabs it.
    p.hold = t >= grab ? 1 : 0
    p.eyes = t > end - 250 ? .happy : eyesFrom(input)
    p.mouth = 0.25 * span(t, end - 300, end - 120)
    return p
}

/// Toddling along on his hind legs with the block: quick little steps, bobbing up over each
/// foot, rocking from side to side, the tail swinging to balance him.
private func carry(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    var p = upright(b)
    let u = input.phase * Double.pi * 4
    let rock = sin(u / 2)
    p.by += 0.6 * cos(2 * u)
    p.rot += 4 * rock
    p.hrot += 5 * rock
    p.tailA += 12 * rock
    for (leg, offset) in [(LegName.backNear, 0.0), (LegName.backFar, Double.pi)] {
        let v = u + offset
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + 0.5 + b.stride.walk * 0.8 * sin(v), y: -2.6 * Swift.max(0, cos(v)))
    }
    // The block bobs along with him.
    let bob = 0.6 * cos(2 * u)
    p.paws.frontNear.y += bob
    p.paws.frontFar.y += bob
    p.mouth = 0.15
    p.eyes = eyesFrom(input)
    return p
}

/// Throwing the block he's carrying: up over his head, a two-pawed throw, and back down on all fours.
private func throwIt(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let release = PLAY.throwReleaseMs, end = PLAY.throwMs
    let wind = release - 230
    let down = release + 300
    let held = upright(b)
    var over = upright(b)
    over.rot = 62
    over.hrot = 14
    over.ears = -0.3
    over.lookY = -0.8
    // Arms up behind his big head, the block held high over it.
    over.pawUp = 0
    let h = headCentre(b, over)
    over.paws.frontNear = Pt(x: h.x + 1, y: h.y - b.head.ry - 2)
    over.paws.frontFar = Pt(x: h.x - 2, y: h.y - b.head.ry - 1)
    var flung = upright(b)
    flung.rot = 76
    flung.hrot = 6
    flung.ears = 0.8
    flung.lookY = -0.6
    // Paws out in front after it, below his chin.
    let chin = headCentre(b, flung)
    flung.paws.frontNear = Pt(x: chin.x + b.head.rx * 1.05, y: chin.y + b.head.ry * 0.75)
    flung.paws.frontFar = Pt(x: chin.x + b.head.rx * 0.85, y: chin.y + b.head.ry * 0.85)
    flung.hold = 0
    var p = through(t, [(0, held), (wind, over), (release, flung), (down, stand(b))])
    p.hold = t < release ? 1 : 0
    p.mouth = 0.35 * keyed(t, [(release, 0), (release + 60, 1), (end, 0)])
    p.eyes = t > release + 40 && t < end - 120 ? .happy : eyesFrom(input)
    return p
}

/// Sat at the desk, front paws up on the keyboard: typing in bursts, then stopping to
/// think, head tilted, eyes on the screen.
private func work(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let k = typing(input.clock)
    var p = upright(b)
    p.hold = 0
    // Sat down on his bottom, hind feet out in front.
    p.rot = 64
    p.by += 3
    p.haunch = 1
    for leg in [LegName.backNear, .backFar] { p.paws[leg] = Pt(x: legRoot(b, p, leg).x + (leg == .backNear ? 6 : 4), y: 0) }
    p.hrot = lerp(-5, 8, k.pause)
    p.paws.frontNear = Pt(x: b.desk.x + 1.5, y: b.desk.y - k.near * 2.2)
    p.paws.frontFar = Pt(x: b.desk.x - 1.5, y: b.desk.y - k.far * 2.2)
    p.pawUp = 2
    // Face turned round to the screen, eyes on it, the chin up a little more to think.
    p.turn = 0.9
    p.lookX = 0.9
    p.lookY = -0.4
    look(b, &p, input.gaze)
    p.lookY -= 0.25 * k.pause
    p.ears = 0.3
    p.tailA = 125
    p.tailCurl = 20 + 20 * sin(input.clock / 500) * k.pause
    p.mouth = 0
    p.eyes = eyesFrom(input)
    return p
}

/// Browsing the web: a paw on the mouse, now and then clicking, reading down the page.
private func browse(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let clock = input.clock
    var p = work(b, input)
    p.bx += 2
    let click = pow(Swift.max(0, sin((clock / 1000) * Double.pi * 2 * 0.45)), 14)
    p.paws.frontNear = Pt(x: b.mouse.x + sin(clock / 900) * 0.8, y: b.mouse.y - click * 1.6)
    p.paws.frontFar = Pt(x: b.desk.x - 1.5, y: b.desk.y)
    // Reading: the eyes run down the page, and back up to the top of the next bit.
    let read = jsMod(clock, 2600) / 2600
    p.lookY = clamp(p.lookY + lerp(-0.3, 0.3, read), -1, 1)
    p.hrot += 2 * sin(clock / 2300)
    return p
}

/// Watching reels: leant back, flicking the mouse for the next one, giggling at the funny ones.
private func watchReels(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let clock = input.clock
    var p = work(b, input)
    let r = reel(clock)
    p.rot -= 6
    p.bx += 1
    p.paws.frontNear = Pt(x: b.mouse.x - r.flick * 2, y: b.mouse.y - r.flick * 2.2)
    // The other paw back on his tummy.
    p.pawUp = 1
    let chest = legRoot(b, p, .frontFar)
    p.paws.frontFar = Pt(x: chest.x + 4, y: chest.y + 5)
    let giggle = r.funny && r.into > 0.2 && r.into < 0.8
    if giggle {
        let shake = sin(clock / 70)
        p.eyes = .happy
        p.mouth = 0.35 + 0.15 * shake
        p.hrot += 4 * shake
        p.blush = 1
    }
    return p
}

/// Wants to play: up on his toes, bouncing and waving a paw over his head at you.
private func attention(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    var p = upright(b)
    p.hold = 0
    let hop = abs(sin((t / 600) * Double.pi))
    p.lift = -3 * hop
    let waving = sin((t / 300) * Double.pi * 2)
    // One paw held out in front of him (clear of his face), waving.
    let shoulder = legRoot(b, p, .frontNear)
    p.paws.frontNear = Pt(x: shoulder.x + 17, y: shoulder.y - p.lift - 9 + waving * 3.5)
    p.hrot = 6 * waving
    p.ears = 0.8
    p.mouth = 0.4
    p.blush = 1
    p.lookX = 0.4
    p.lookY = -0.2
    p.tailA += 12 * waving
    p.eyes = eyesFrom(input)
    return p
}

/// Cross: stamping a front paw, ears flat back, a scowl, tail lashing.
private func angry(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    var p = stand(b)
    let stamp = Swift.max(0, sin((t / 400) * Double.pi * 2))
    p.paws.frontNear = Pt(x: p.paws.frontNear.x + 1, y: -4 * stamp)
    p.by += 1.2 * (1 - stamp)
    p.sy *= 1 + 0.04 * stamp
    p.hrot = -6
    p.hy += 1
    p.ears = -1
    p.tailPuff = 1.25
    p.tailA += 18 * sin(clock / 90)
    p.mouth = 0.18
    p.blush = 0
    p.eyes = .blink
    p.mark = .angry
    return p
}

/// Creeping up on a block: low to the ground, eyes fixed on it, tail tip twitching, bottom wiggling.
private func stalk(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let clock = input.clock
    var p = stand(b)
    walk(b, &p, input.phase, 0.55)
    // Down low over its paws (they stay where they are, so the legs fold).
    p.by += 3.2 + 0.5 * sin(clock / 45)
    p.rot -= 2
    p.hx += 2
    p.hy += 2.5
    p.hrot -= 6
    p.ears = 0.9
    p.lookX = 1
    p.lookY = 0.5
    p.tailA = lerp(p.tailA, 175, 0.7)
    p.tailCurl = 25 * sin(clock / 120)
    p.eyes = .wide
    return p
}

/// Nose down to a block, sniffing at it: little quick dips of the head.
private func sniff(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    var p = stand(b)
    p.rot -= 5
    p.by += 1
    p.hx += 3
    p.hy += 5.5
    p.hrot -= 22 + 4 * Swift.max(0, sin(t / 85))
    p.ears = 0.6 + 0.2 * sin(t / 300)
    p.lookX = 0.8
    p.lookY = 1
    p.tailA += 10 * sin(clock / 400)
    p.eyes = eyesFrom(input)
    return p
}

/// Walking along with its head down, nosing a block along in front of it.
private func noseAlong(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    var p = stand(b)
    if b.gait == .hop { hop(b, &p, input.phase, 3) } else { walk(b, &p, input.phase, 0.8) }
    p.hx += 3
    p.hy += 4.5
    p.hrot -= 18
    p.ears = 0.4
    p.lookX = 1
    p.lookY = 1
    p.eyes = eyesFrom(input)
    return p
}

/// Trotting off with a block in its mouth: head up, tail up, very pleased with itself.
private func trot(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    var p = stand(b)
    if b.gait == .hop { hop(b, &p, input.phase, 5) } else { walk(b, &p, input.phase) }
    p.hrot += 10
    p.hy -= 1
    p.tailA = lerp(p.tailA, 110, 0.5)
    p.ears = 0.7
    p.blush = 0.8
    p.eyes = eyesFrom(input)
    return p
}

/// The pose for a land animal at this moment.
private func walkerPose(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    let phase = input.phase
    if b.curls && CURLS.contains(input.animation) { return curled(b, input) }
    let hops = b.gait == .hop
    switch input.animation {
    case .idle:
        var p = stand(b)
        alive(&p, clock)
        // Now and then a curious tilt of the head.
        p.hrot += noise1(clock / 3100, 9) * 7
        // A bunny sits up every so often to have a look round.
        if b.species == .bunny {
            let k = jsMod(clock, 9000)
            p = mix(p, lookout(b), span(k, 6000, 6400) * (1 - span(k, 8200, 8600)))
        }
        look(b, &p, input.gaze)
        p.eyes = eyesFrom(input)
        return p
    case .walk:
        var p = stand(b)
        if hops { hop(b, &p, phase, 6) } else { walk(b, &p, phase) }
        p.eyes = eyesFrom(input)
        return p
    case .run, .chase:
        var p = stand(b)
        if hops { hop(b, &p, phase, input.animation == .chase ? 11 : 10) } else { gallop(b, &p, phase, input.animation == .chase ? 7.5 : 6.5) }
        p.eyes = input.animation == .chase ? .wide : eyesFrom(input)
        p.mouth = input.animation == .chase ? 0.15 : 0
        return p
    case .jump:
        var p = stand(b)
        if b.species == .fox { pounce(b, &p, clamp01(t / 400)) } else { spring(b, &p, clamp01(t / 400), 17, 0.32) }
        p.eyes = .wide
        return p
    case .leap:
        var p = stand(b)
        gallop(b, &p, phase, 6.5)
        spring(b, &p, clamp01(t / 420), 13, 0)
        p.eyes = .wide
        p.mouth = 0.3
        return p
    case .sit:
        var p = rest(b)
        alive(&p, clock, 0.8)
        p.hrot += noise1(clock / 3600, 4) * 6
        look(b, &p, input.gaze)
        p.eyes = eyesFrom(input)
        return p
    case .groom:
        var p = rest(b)
        let lick = jsMod(t, 1000) / 1000
        let stroke = sin(lick * Double.pi * 2)
        p.pawUp = 1
        // The paw comes up to the mouth and goes over the face, ear to chin.
        let h = headCentre(b, p)
        p.paws.frontNear = Pt(x: h.x + b.head.rx * 0.45 - stroke * 1.5, y: h.y + b.head.ry * 0.8 - stroke * 2.5)
        p.hrot = -10 + stroke * 5
        p.hx -= 1
        p.tongue = clamp01(stroke) * 0.8
        p.mouth = p.tongue * 0.3
        p.eyes = .closed
        p.blush = 0.8
        return p
    case .yawn:
        var p = rest(b)
        let open = span(t, 200, 800) * (1 - span(t, 1500, 2000))
        p.mouth = open
        p.tongue = open * 0.6
        p.hrot = 16 * open
        p.hy -= 1.5 * open
        p.ears = -0.5 * open
        p.sy *= 1 + 0.05 * open
        p.eyes = .closed
        return p
    case .sleep:
        var p = curl(b)
        let breath = wave(t, 3200)
        p.sy *= 1 + 0.04 * breath
        p.sx *= 1 + 0.015 * breath
        p.ears = -0.25
        p.eyes = .closed
        p.blush = 0.7
        p.mark = .zzz
        return p
    case .peek:
        return peek(b, input)
    case .surprised:
        var p = stand(b)
        let u = clamp01(t / 450)
        let pop = sin(Double.pi * Swift.min(1, u * 1.7))
        p.lift = -9 * pop
        p.sx = 1.08
        p.sy = 1.12
        p.tailPuff = 1.45
        p.tailA = lerp(p.tailA, 100, 0.8)
        p.tailCurl = 10
        p.ears = 1
        p.mouth = 0.45
        p.eyes = .wide
        p.mark = .alarm
        return p
    case .confused:
        var p = rest(b)
        // Head tilted one way, then the other.
        let side: Double = sin((t / 1800) * Double.pi * 2) > 0 ? 1 : -1
        p.hrot = 14 * side
        p.lookY = -0.6
        p.lookX = 0.3 * side
        p.ears = side > 0 ? 0.5 : -0.4
        p.eyes = eyesFrom(input)
        p.mark = .puzzled
        return p
    case .dangle:
        return dangle(b, input)
    case .bat:
        return bat(b, input)
    case .toss:
        return toss(b, input)
    // Only a raccoon carries a block about in his paws; anyone else just throws it.
    case .lift:
        return b.species == .raccoon ? liftUp(b, input) : toss(b, input)
    case .carry:
        if b.species == .raccoon { return carry(b, input) }
        var walking = input
        walking.animation = .walk
        return walkerPose(b, walking)
    case .throw:
        return b.species == .raccoon ? throwIt(b, input) : toss(b, input)
    case .work:
        return work(b, input)
    case .browse:
        return browse(b, input)
    case .reels:
        return watchReels(b, input)
    case .attention:
        return attention(b, input)
    case .angry:
        return angry(b, input)
    case .stalk:
        return stalk(b, input)
    case .sniff:
        return sniff(b, input)
    case .nudge:
        return noseAlong(b, input)
    case .fetch:
        return trot(b, input)
    case .happy:
        var p = stand(b)
        let hopping = abs(sin((t / 600) * Double.pi * 2))
        // A hopper jumps for joy, with a twist in the air.
        p.lift = (hops ? -7 : -2.6) * hopping
        if hops { p.rot += 12 * sin((t / 600) * Double.pi * 2) }
        p.sy *= 1 + 0.05 * hopping
        p.tailA += 14 * sin((t / 300) * Double.pi * 2)
        p.tailCurl += 30 * sin((t / 300) * Double.pi * 2 + 1)
        p.hrot = 6 * sin((t / 1200) * Double.pi * 2)
        p.ears = 0.5
        p.mouth = 0.4
        p.blush = 1
        p.eyes = .happy
        p.mark = .hearts
        return p
    }
}

// MARK: - The otter, which swims.

/// Swimming at the surface: back and head out, legs paddling below.
private func swim(_ b: ChibiBuild, _ phase: Double, _ speed: Double) -> ChibiPose {
    var p = stand(b)
    let u = phase * Double.pi * 2
    p.wet = 1
    p.by = WATER_Y - b.body.at.y + 1.5 + 0.6 * sin(2 * u)
    p.rot = -2 + speed * 4 * sin(u + 0.6)
    p.hy = 2.5 + 0.6 * sin(2 * u - 0.5)
    p.hx = 1
    p.hrot = 4
    for leg in LEGS {
        let front = leg.isFront
        let v = u + (leg == .frontNear || leg == .backFar ? 0 : Double.pi)
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + cos(v) * (front ? 3.5 : 4.5) - (front ? 0 : 2), y: root.y + 5 + sin(v) * 1.8)
    }
    p.tailA = 182 + 5 * sin(u - 1.2)
    p.tailCurl = 6 * sin(u - 2)
    p.ears = -0.2
    p.splash = speed
    return p
}

/// Floating on its back, belly up, paws on its chest and hind feet out of the water.
private func onBack(_ b: ChibiBuild, _ clock: Double) -> ChibiPose {
    var p = stand(b)
    p.wet = 1
    p.sy = -1
    let bob = 0.7 * noise1(clock / 1500, 2)
    p.by = WATER_Y - b.body.at.y + 1 + bob
    p.rot = 1.5 * noise1(clock / 1900, 7)
    p.hx = 4
    p.hy = 3 + bob * 0.3
    p.hrot = 16
    let top = bodyFrame(b, p).cy - b.body.ry
    let shoulder = legRoot(b, p, .frontNear)
    // Both front paws together on its chest, in front of it.
    p.pawUp = 2
    p.paws.frontNear = Pt(x: shoulder.x - 3, y: top - 2.5)
    p.paws.frontFar = Pt(x: shoulder.x - 6.5, y: top - 2)
    let hip = legRoot(b, p, .backNear)
    p.paws.backNear = Pt(x: hip.x - 3, y: top - 1.5)
    p.paws.backFar = Pt(x: hip.x - 6, y: top - 0.5)
    p.tailA = 178
    p.tailCurl = 8
    p.ears = -0.1
    return p
}

/// Treading water upright to look about: chest and head out, paws up.
private func tread(_ b: ChibiBuild, _ clock: Double) -> ChibiPose {
    var p = stand(b)
    p.wet = 1
    p.rot = 64
    p.bx = 1
    p.by = 4 + noise1(clock / 1300, 4) * 0.6
    p.hx = 0.5
    p.hy = -1
    p.hrot = 2
    let h = headCentre(b, p)
    let u = (clock / 800) * Double.pi * 2
    p.paws.frontNear = Pt(x: h.x + 2 + cos(u) * 0.8, y: h.y + b.head.ry + 3 + sin(u) * 0.8)
    p.paws.frontFar = Pt(x: h.x - 3 + cos(u + Double.pi) * 0.8, y: h.y + b.head.ry + 3.5 + sin(u + Double.pi) * 0.8)
    for leg in [LegName.backNear, .backFar] {
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + 2 + sin(u * 0.7 + (leg == .backFar ? 2 : 0)) * 2, y: root.y + 5)
    }
    p.tailA = 250
    p.tailCurl = 40
    p.ears = 0.3
    return p
}

/// Where in a dive (or another trick) on a loop of the wall clock it is, 0..1, or -1 between them.
private func trick(_ clock: Double, _ period: Double, _ from: Double, _ length: Double) -> Double {
    let k = jsMod(clock, period) - from
    return k >= 0 && k < length ? k / length : -1
}

/// A dive as it swims along: nose down under the surface, its tail flipping up after it,
/// bubbles coming up while it's under, and up again nose first with a splash.
private func dive(_ b: ChibiBuild, _ phase: Double, _ u: Double) -> ChibiPose {
    var p = swim(b, phase, 0.6)
    p.rot = keyed(u, [(0, p.rot), (0.22, -50), (0.4, -8), (0.7, 6), (0.84, 34), (1, -2)])
    p.lift = keyed(u, [(0, 0), (0.08, -2), (0.3, 22), (0.42, 36), (0.68, 36), (0.86, 4), (1, 0)])
    p.tailA = keyed(u, [(0, 182), (0.2, 168), (0.32, 120), (0.44, 182)])
    p.tailCurl = keyed(u, [(0, 0), (0.32, -30), (0.44, 0)])
    p.hrot = keyed(u, [(0, 4), (0.2, -18), (0.75, 20), (1, 4)])
    p.ears = keyed(u, [(0, -0.2), (0.15, -1), (0.86, -1), (0.92, 0.8), (1, -0.2)])
    p.splash = 1.8 * bump(clamp01((u - 0.12) / 0.2)) + 1.6 * bump(clamp01((u - 0.78) / 0.18))
    p.bubbles = keyed(u, [(0.36, 0), (0.42, 1), (0.7, 1), (0.76, 0)])
    return p
}

/// Rolling right over as it swims, belly up and back, paws in the air halfway round.
private func rollOver(_ b: ChibiBuild, _ phase: Double, _ u: Double) -> ChibiPose {
    var p = swim(b, phase, 0.6)
    p.sy = cos(2 * Double.pi * u)
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + (leg.isFront ? 1 : -2), y: root.y + 5 * p.sy)
    }
    p.splash = 1.2 * bump(u)
    p.eyes = .happy
    return p
}

/// An arc right out of the water and back in, nose first.
private func porpoise(_ b: ChibiBuild, _ u: Double, _ height: Double) -> ChibiPose {
    var p = swim(b, 0, 0)
    let up = sin(Double.pi * u)
    p.lift = -height * up
    p.rot = lerp(32, -38, smooth(u))
    p.hrot = lerp(12, -12, u)
    for leg in LEGS {
        let root = legRoot(b, p, leg)
        p.paws[leg] = Pt(x: root.x + (leg.isFront ? -1.5 : -5), y: root.y - p.lift + 3)
    }
    p.tailA = lerp(190, 168, u)
    p.tailCurl = lerp(-20, 30, u)
    p.ears = -0.6
    p.splash = 2 * (bump(clamp01(u / 0.3)) + bump(clamp01((u - 0.7) / 0.3)))
    p.eyes = .happy
    return p
}

/// A bonk with the nose: it lunges along the surface at the block and sends it skimming off.
private func otterNudge(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let hit = PLAY.batHitMs
    var p = swim(b, 0, 0)
    let lunge = keyed(t, [(0, 0), (150, -0.4), (hit, 1), (hit + 170, 0.6), (PLAY.batMs, 0)])
    p.hx += 5 * lunge
    p.hy += 1.5 * lunge
    p.hrot -= 12 * lunge
    p.rot -= 3 * lunge
    p.splash = 1.6 * bump(clamp01((t - 150) / 280))
    p.ears = 0.6
    p.lookX = 0.9
    p.lookY = 0.5
    p.eyes = t < hit + 170 ? .wide : eyesFrom(input)
    return p
}

/// Ducks its head to take the block, rears up out of the water with it, and flicks it away.
private func otterToss(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    let grab = PLAY.tossGrabMs, release = PLAY.tossReleaseMs, end = PLAY.tossMs
    let wind = release - 220
    let up = keyed(t, [(grab + 40, 0), (wind, 1), (release + 120, 0.7), (end, 0)])
    var p = mix(swim(b, 0, 0), tread(b, clock), up * 0.65)
    p.hx += keyed(t, [(0, 0), (grab, 3.5), (wind, -2), (release, 4), (end, 0)])
    p.hy += keyed(t, [(0, 0), (grab, 1), (wind, -4), (release, -2), (end, 0)])
    p.hrot = keyed(t, [(0, 4), (grab, -10), (grab + 60, -10), (wind, 28), (release, 6), (end, 4)])
    p.ears = keyed(t, [(0, 0), (wind, -0.3), (release, 0.8), (end, 0)])
    p.lookX = 0.7
    p.lookY = keyed(t, [(0, 0.3), (grab, 0.8), (wind, -0.5), (release + 100, -0.8), (end, -0.3)])
    p.mouth = 0.35 * keyed(t, [(release, 0), (release + 60, 1), (end, 0)])
    p.splash = 1.2 * bump(clamp01((t - grab + 120) / 300)) + 0.8 * bump(clamp01((t - release) / 300))
    p.eyes = t > release + 40 && t < end - 120 ? .happy : eyesFrom(input)
    return p
}

private func otterPose(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    let t = input.t
    let clock = input.clock
    let phase = input.phase
    switch input.animation {
    case .idle:
        // Treads water to look about, then lies back to float.
        var p = mix(tread(b, clock), onBack(b, clock), span(t, 4200, 5200))
        look(b, &p, input.gaze)
        p.eyes = eyesFrom(input)
        return p
    case .walk:
        // Now and then it dives, or rolls over.
        let under = trick(clock, 9000, 5000, 1800)
        if under >= 0 { return dive(b, phase, under) }
        let over = trick(clock, 9000, 2600, 900)
        if over >= 0 { return rollOver(b, phase, over) }
        var p = swim(b, phase, 0.6)
        p.eyes = eyesFrom(input)
        return p
    case .run, .chase:
        // Going fast, it porpoises out of the water every so often.
        let arc = trick(clock, 4200, 3000, 800)
        if arc >= 0 { return porpoise(b, arc, 12) }
        var p = swim(b, phase, input.animation == .chase ? 1.6 : 1.2)
        p.rot = 6 * sin(phase * Double.pi * 2)
        p.hy += 1.5
        p.ears = -0.6
        p.eyes = input.animation == .chase ? .wide : eyesFrom(input)
        return p
    case .jump:
        return porpoise(b, clamp01(t / 400), 18)
    case .leap:
        return porpoise(b, clamp01(t / 420), 14)
    case .sit:
        // On its back with its favourite shell, tapping it now and then.
        var p = onBack(b, clock)
        p.shell = 1
        let tap = Swift.max(0, sin((t / 2600) * Double.pi * 2)) * abs(sin((t / 140) * Double.pi))
        p.paws.frontNear.y -= tap * 2
        p.paws.frontFar.y -= tap * 1.5
        look(b, &p, input.gaze, 0.7)
        p.eyes = eyesFrom(input)
        return p
    case .groom:
        // Rubbing its face with both paws.
        var p = onBack(b, clock)
        let h = headCentre(b, p)
        let rub = sin((t / 500) * Double.pi * 2)
        p.paws.frontNear = Pt(x: h.x + 2 + rub * 1.5, y: h.y + 3 - abs(rub))
        p.paws.frontFar = Pt(x: h.x - 3 - rub * 1.5, y: h.y + 3.5 - abs(rub))
        p.hrot += rub * 4
        p.eyes = .closed
        p.blush = 0.9
        return p
    case .yawn:
        var p = onBack(b, clock)
        let open = span(t, 200, 800) * (1 - span(t, 1500, 2000))
        p.mouth = open
        p.tongue = open * 0.6
        p.hrot += 10 * open
        p.paws.backNear.y -= 2 * open
        p.eyes = .closed
        return p
    case .sleep:
        var p = onBack(b, clock)
        p.paws.frontFar.x += 2
        p.eyes = .closed
        p.blush = 0.7
        p.mark = .zzz
        return p
    case .happy:
        // Wriggling on its back, clapping its paws.
        var p = onBack(b, clock)
        let clap = abs(sin((t / 600) * Double.pi * 2))
        p.paws.frontNear.x += clap * 2.5
        p.paws.frontFar.x -= clap * 2.5
        p.rot = 5 * sin((t / 1200) * Double.pi * 2)
        p.mouth = 0.4
        p.blush = 1
        p.eyes = .happy
        p.mark = .hearts
        return p
    case .surprised:
        var p = tread(b, clock)
        let pop = easeOut(t / 200) * (1 - 0.4 * span(t, 250, 450))
        p.lift = -7 * pop
        p.ears = 1
        p.mouth = 0.45
        p.eyes = .wide
        p.mark = .alarm
        p.splash = 1.5 * bump(clamp01(t / 300))
        return p
    case .confused:
        var p = tread(b, clock)
        let side: Double = sin((t / 1800) * Double.pi * 2) > 0 ? 1 : -1
        p.hrot = 14 * side
        p.lookY = -0.6
        p.eyes = eyesFrom(input)
        p.mark = .puzzled
        return p
    case .peek:
        return peek(b, input)
    case .dangle:
        var p = dangle(b, input)
        p.tailA = -90
        return p
    case .bat:
        return otterNudge(b, input)
    case .toss, .lift, .throw:
        return otterToss(b, input)
    case .carry, .fetch:
        var walking = input
        walking.animation = .walk
        return otterPose(b, walking)
    case .stalk:
        // Gliding in slowly, low in the water, eyes just over the surface.
        var p = swim(b, phase, 0.3)
        p.by += 2
        p.hy += 1.5
        p.ears = -0.6
        p.lookX = 1
        p.eyes = .wide
        return p
    case .sniff, .nudge:
        // Nosing at it along the surface.
        let nudging = input.animation == .nudge
        var p = swim(b, nudging ? phase : 0, nudging ? 0.5 : 0)
        p.hx += 2.5
        p.hy += 1.5
        p.hrot -= 10 + (input.animation == .sniff ? 4 * Swift.max(0, sin(t / 85)) : 0)
        p.lookX = 0.9
        p.lookY = 0.6
        p.eyes = eyesFrom(input)
        return p
    case .angry:
        // Slapping the water, ears back.
        var p = tread(b, clock)
        let slap = Swift.max(0, sin((t / 400) * Double.pi * 2))
        let shoulder = legRoot(b, p, .frontNear)
        p.paws.frontNear = Pt(x: shoulder.x + 6, y: shoulder.y + 2 - 4 * slap)
        p.pawUp = 1
        p.ears = -1
        p.hrot = -6
        p.mouth = 0.18
        p.splash = 1.5 * slap
        p.eyes = .blink
        p.mark = .angry
        return p
    case .work, .browse, .reels:
        // Treading water at its desk, paws up on the keyboard, or one on the mouse.
        let k = typing(clock)
        let r = reel(clock)
        var p = tread(b, clock)
        let mouse = input.animation != .work
        let flick = input.animation == .reels ? r.flick : 0
        p.paws.frontNear = mouse ? Pt(x: b.mouse.x - flick * 1.5, y: b.mouse.y - flick * 1.8) : Pt(x: b.desk.x + 1.2, y: b.desk.y - k.near * 1.8)
        p.paws.frontFar = Pt(x: b.desk.x - 1.2, y: b.desk.y - (mouse ? 0 : k.far * 1.8))
        p.pawUp = 2
        p.hrot = lerp(-3, 8, k.pause)
        p.turn = 0.8
        p.lookX = 0.8
        p.lookY = -0.4
        look(b, &p, input.gaze)
        p.eyes = eyesFrom(input)
        if input.animation == .reels && r.funny && r.into > 0.2 && r.into < 0.8 {
            p.eyes = .happy
            p.mouth = 0.4
            p.blush = 1
        }
        return p
    case .attention:
        // Bobbing up out of the water, waving both paws over its head.
        var p = tread(b, clock)
        let hopping = abs(sin((t / 600) * Double.pi))
        p.by -= 2 * hopping
        let waving = sin((t / 300) * Double.pi * 2)
        // Both paws held out in front, clear of its face, waving.
        let shoulder = legRoot(b, p, .frontNear)
        p.paws.frontNear = Pt(x: shoulder.x + 15, y: shoulder.y - 6 + waving * 3)
        p.paws.frontFar = Pt(x: shoulder.x + 12, y: shoulder.y - 3 - waving * 3)
        p.pawUp = 2
        p.mouth = 0.4
        p.blush = 1
        p.splash = 1
        p.eyes = eyesFrom(input)
        return p
    }
}

/// The pose for this moment of an animation.
public func chibiPose(_ b: ChibiBuild, _ input: ChibiInput) -> ChibiPose {
    b.swims ? otterPose(b, input) : walkerPose(b, input)
}
