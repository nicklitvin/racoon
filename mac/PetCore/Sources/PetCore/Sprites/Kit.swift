import Foundation

// Small maths helpers for the drawings (src/sprites/critter/kit.ts).

public let DEG = Double.pi / 180

@inline(__always) public func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double { a + (b - a) * t }
@inline(__always) public func clamp01(_ v: Double) -> Double { clamp(v, 0, 1) }
/// Hermite ease in and out.
@inline(__always) public func smooth(_ t: Double) -> Double {
    let x = clamp01(t)
    return x * x * (3 - 2 * x)
}
/// Smoother ease (zero acceleration at the ends too).
@inline(__always) public func smoother(_ t: Double) -> Double {
    let x = clamp01(t)
    return x * x * x * (x * (x * 6 - 15) + 10)
}
public func easeOut(_ t: Double) -> Double { 1 - pow(1 - clamp01(t), 3) }
public func easeIn(_ t: Double) -> Double { pow(clamp01(t), 3) }
/// 0 → 1 → 0 over t in [0, 1], smooth at both ends.
public func bump(_ t: Double) -> Double { t <= 0 || t >= 1 ? 0 : pow(sin(Double.pi * t), 2) }
/// Fraction of t in [a, b], eased.
public func span(_ t: Double, _ a: Double, _ b: Double) -> Double { smooth((t - a) / (b - a)) }
public func frac(_ v: Double) -> Double { v - floor(v) }

/// A value through keyframes ([time, value], in time order), eased in and out between each
/// pair, and held before the first and after the last.
public func keyed(_ t: Double, _ keys: [(Double, Double)]) -> Double {
    var (t0, v0) = keys[0]
    if t <= t0 { return v0 }
    for (t1, v1) in keys {
        if t <= t1 { return t1 > t0 ? lerp(v0, v1, smooth((t - t0) / (t1 - t0))) : v1 }
        (t0, v0) = (t1, v1)
    }
    return v0
}

/// A sine wave with period `ms`, from -1 to 1.
public func wave(_ t: Double, _ ms: Double, _ phase: Double = 0) -> Double { sin((t / ms + phase) * Double.pi * 2) }

public func pt(_ x: Double, _ y: Double) -> Pt { Pt(x: x, y: y) }
public func add(_ a: Pt, _ b: Pt) -> Pt { Pt(x: a.x + b.x, y: a.y + b.y) }
public func sub(_ a: Pt, _ b: Pt) -> Pt { Pt(x: a.x - b.x, y: a.y - b.y) }
public func scalePt(_ a: Pt, _ k: Double) -> Pt { Pt(x: a.x * k, y: a.y * k) }
public func len(_ a: Pt) -> Double { hypot(a.x, a.y) }
public func dist(_ a: Pt, _ b: Pt) -> Double { hypot(a.x - b.x, a.y - b.y) }
public func mixPt(_ a: Pt, _ b: Pt, _ t: Double) -> Pt { Pt(x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t)) }
public func unit(_ a: Pt) -> Pt {
    let l = len(a)
    let d = l == 0 ? 1 : l
    return Pt(x: a.x / d, y: a.y / d)
}
/// Unit vector at `deg` degrees, screen axes (0 = right, 90 = down).
public func dir(_ deg: Double) -> Pt { Pt(x: cos(deg * DEG), y: sin(deg * DEG)) }
public func angleOf(_ a: Pt) -> Double { atan2(a.y, a.x) / DEG }
public func rotate(_ p: Pt, _ deg: Double, _ about: Pt = .zero) -> Pt {
    let c = cos(deg * DEG)
    let s = sin(deg * DEG)
    let dx = p.x - about.x
    let dy = p.y - about.y
    return Pt(x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c)
}
/// Shortest signed difference between two angles in degrees.
public func angleDiff(_ from: Double, _ to: Double) -> Double { jsMod(jsMod(to - from + 180, 360) + 360, 360) - 180 }

/// Middle joint of a two-bone limb reaching from `root` to `end`. `bend` picks the side the
/// joint pokes out to (1 = clockwise of the root→end line on screen). Out of reach, the limb
/// straightens along the line.
public func ik(_ root: Pt, _ end: Pt, _ upper: Double, _ lower: Double, _ bend: Double) -> Pt {
    let dx = end.x - root.x
    let dy = end.y - root.y
    let h0 = hypot(dx, dy)
    let d = h0 == 0 ? 0.001 : h0
    let ux = dx / d
    let uy = dy / d
    let reach = upper + lower
    if d >= reach * 0.999 { return Pt(x: root.x + ux * d * (upper / reach), y: root.y + uy * d * (upper / reach)) }
    let a = (upper * upper - lower * lower + d * d) / (2 * d)
    let h = Swift.max(0, upper * upper - a * a).squareRoot()
    return Pt(x: root.x + ux * a - uy * h * bend, y: root.y + uy * a + ux * h * bend)
}

// MARK: - 32-bit integer maths, as JavaScript does it

/// `ToInt32`: a number to a 32-bit integer, wrapping.
public func toInt32(_ x: Double) -> Int32 {
    guard x.isFinite else { return 0 }
    let t = x < 0 ? -(-x).rounded(.down) : x.rounded(.down)
    var m = fmod(t, 4_294_967_296)
    if m < 0 { m += 4_294_967_296 }
    return Int32(bitPattern: UInt32(m))
}

/// `Math.imul`.
@inline(__always) public func imul(_ a: Int32, _ b: Int32) -> Int32 { a &* b }
/// `x >>> n` on an int32 value.
@inline(__always) public func ushr(_ x: Int32, _ n: UInt32) -> Int32 { Int32(bitPattern: UInt32(bitPattern: x) >> n) }
/// `x >>> 0`: the int32 value as an unsigned number.
@inline(__always) public func u32(_ x: Int32) -> Double { Double(UInt32(bitPattern: x)) }

/// A deterministic pseudo-random generator (mulberry32), so behaviour is reproducible in tests.
public func rng(_ seed: Double) -> Random {
    var s = UInt32(bitPattern: toInt32(seed))
    return {
        s = s &+ 0x6D2B_79F5
        var t = Int32(bitPattern: s)
        t = imul(t ^ ushr(t, 15), t | 1)
        t ^= t &+ imul(t ^ ushr(t, 7), t | 61)
        return u32(t ^ ushr(t, 14)) / 4_294_967_296
    }
}

/// Smooth 1D noise in [-1, 1]: wobbles organically rather than looping.
public func noise1(_ x: Double, _ seed: Double = 0) -> Double {
    let mixed = toInt32(seed * Double(0x9E37_79B1))
    func hash(_ i: Double) -> Double {
        var h = imul(toInt32(i) ^ mixed, toInt32(Double(0x85EB_CA6B)))
        h ^= ushr(h, 13)
        h = imul(h, toInt32(Double(0xC2B2_AE35)))
        h ^= ushr(h, 16)
        return (u32(h) / 4_294_967_296) * 2 - 1
    }
    let i = floor(x)
    let f = x - i
    let u = f * f * (3 - 2 * f)
    return lerp(hash(i), hash(i + 1), u)
}
