import Foundation

// Steering, easing, Bezier paths and seeded random numbers (src/core/behavior/motion.ts).

/// Moves `value` toward `target` by at most `maxDelta`.
public func approach(_ value: Double, _ target: Double, _ maxDelta: Double) -> Double {
    let delta = target - value
    if abs(delta) <= maxDelta { return target }
    return value + jsSign(delta) * maxDelta
}

/// Of his acceleration, how much he brakes with when arriving somewhere.
private let BRAKING = 0.8

/// The fastest he can be going this far from where he's stopping and still stop there,
/// braking with `accel` (with a little to spare), so he never overshoots and slides back.
public func stoppingSpeed(_ distance: Double, _ accel: Double) -> Double { (2 * accel * BRAKING * distance).squareRoot() }

/// Two-dimensional arrive steering.
public func steer2d(_ position: Pt, _ velocity: Pt, _ target: Pt, _ maxSpeed: Double, _ accel: Double, _ dt: Double, _ slowRadius: Double = 120) -> Pt {
    let dx = target.x - position.x
    let dy = target.y - position.y
    let distance = hypot(dx, dy)
    let desiredSpeed = Swift.min(maxSpeed * Swift.min(1, distance / slowRadius), stoppingSpeed(distance, accel))
    let desired = distance > 0 ? Pt(x: (dx / distance) * desiredSpeed, y: (dy / distance) * desiredSpeed) : .zero
    let change = Pt(x: desired.x - velocity.x, y: desired.y - velocity.y)
    let changeLength = hypot(change.x, change.y)
    let maxChange = accel * dt
    if changeLength <= maxChange { return desired }
    return Pt(x: velocity.x + (change.x / changeLength) * maxChange, y: velocity.y + (change.y / changeLength) * maxChange)
}

/// Below this speed (px/s) he can set off in any direction.
private let STANDING_SPEED = 40.0
/// The quickest he can swing round on the move, rad/s.
private let MAX_TURN_RATE = 9.0
/// Sideways acceleration he can corner with, as a multiple of his forward acceleration.
private let CORNER_GRIP = 1.3

/// Arrive steering for an animal rather than a hovercraft: on the move, the direction of
/// travel can only swing round so fast (the faster he goes, the wider the turn), and he slows
/// down to turn sharply. From a standstill he sets off straight towards the target.
public func steerArc(_ position: Pt, _ velocity: Pt, _ target: Pt, _ maxSpeed: Double, _ accel: Double, _ dt: Double, _ slowRadius: Double = 120) -> Pt {
    let dx = target.x - position.x
    let dy = target.y - position.y
    let distance = hypot(dx, dy)
    let speed = hypot(velocity.x, velocity.y)
    if speed < STANDING_SPEED || distance < 1e-6 { return steer2d(position, velocity, target, maxSpeed, accel, dt, slowRadius) }
    let heading = atan2(velocity.y, velocity.x)
    let want = atan2(dy, dx)
    var off = want - heading
    off -= Double.pi * 2 * jsRound(off / (Double.pi * 2))
    // Cornering: sideways grip limits the turn rate at speed; slowing down tightens the turn.
    let rate = Swift.min(MAX_TURN_RATE, (accel * CORNER_GRIP) / speed)
    let turned = heading + Swift.max(-rate * dt, Swift.min(rate * dt, off))
    let facing = (1 + cos(off)) / 2
    let desired = Swift.min(maxSpeed * Swift.min(1, distance / slowRadius) * (0.2 + 0.8 * pow(facing, 1.5)), stoppingSpeed(distance, accel))
    let next = approach(speed, desired, accel * dt)
    return Pt(x: cos(turned) * next, y: sin(turned) * next)
}

public func easeInOutSine(_ t: Double) -> Double { -(cos(Double.pi * t) - 1) / 2 }

/// Shrinks a vector's length toward zero by at most `maxDelta`, keeping its direction.
public func brake2d(_ v: Pt, _ maxDelta: Double) -> Pt {
    let length = hypot(v.x, v.y)
    if length <= maxDelta { return .zero }
    let k = (length - maxDelta) / length
    return Pt(x: v.x * k, y: v.y * k)
}

public func quadraticBezier(_ p0: Pt, _ p1: Pt, _ p2: Pt, _ t: Double) -> Pt {
    let u = 1 - t
    return Pt(x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y)
}

/// Deterministic random numbers for tests and reproducible behaviour.
public func seededRandom(_ seed: Double) -> Random { rng(seed) }

// MARK: - Geometry (src/core/geometry.ts)

public func clampRange(_ value: Double, _ min: Double, _ max: Double) -> Double {
    if max < min { return min }
    return Swift.min(max, Swift.max(min, value))
}

public func inflate(_ rect: Rect, _ by: Double) -> Rect {
    Rect(x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2)
}

public func pointInRect(_ p: Pt, _ rect: Rect) -> Bool {
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
}
