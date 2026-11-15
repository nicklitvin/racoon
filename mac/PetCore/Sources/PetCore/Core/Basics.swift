import Foundation

/// A point, in whatever units the code around it uses (screen px, art pixels, head units).
public struct Pt: Equatable, Hashable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
    public static let zero = Pt(x: 0, y: 0)
}

/// A rectangle by its top-left corner and size (screen axes: y goes down).
public struct Rect: Equatable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double
    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct Size: Equatable {
    public var width: Double
    public var height: Double
    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

// JavaScript's arithmetic, where it differs from Swift's: the pet was written in TypeScript,
// and these keep every pixel and every decision where it was.

/// `Math.round`: halves go up (towards +∞), not away from zero.
@inline(__always) public func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }
/// `a % b` on numbers: the remainder takes the sign of `a`.
@inline(__always) public func jsMod(_ a: Double, _ b: Double) -> Double { a.truncatingRemainder(dividingBy: b) }
/// `Math.sign`.
@inline(__always) public func jsSign(_ x: Double) -> Double { x > 0 ? 1 : x < 0 ? -1 : x }
@inline(__always) public func clamp(_ x: Double, _ lo: Double, _ hi: Double) -> Double { Swift.min(hi, Swift.max(lo, x)) }
@inline(__always) public func hypot2(_ x: Double, _ y: Double) -> Double { (x * x + y * y).squareRoot() }

public extension Array where Element == Double {
    /// `Math.max(...xs)`: -∞ for none.
    var jsMax: Double { reduce(-Double.infinity) { Swift.max($0, $1) } }
    /// `Math.min(...xs)`: +∞ for none.
    var jsMin: Double { reduce(Double.infinity) { Swift.min($0, $1) } }
}

/// A random number in [0, 1), like `Math.random`; the brain takes one so tests can replay it.
public typealias Random = () -> Double

public let systemRandom: Random = { Double.random(in: 0..<1) }
