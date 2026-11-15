import Foundation

// Toy blocks on the floor, and how they fly, bounce and tumble (src/core/toys/toybox.ts).
// Time only moves when `step` is called, so it's deterministic and testable. A block stands on
// the floor at (x, y), the middle of its bottom face, and is lifted `z` px off it.

public enum Holder { case pet, user }

public final class Toy {
    public let id: Int
    /// Which block it is: picks its letter and colour.
    public let face: Int
    public var x: Double, y: Double, z = 0.0
    public var vx = 0.0, vy = 0.0, vz = 0.0
    /// How far it has tumbled over, screen degrees, and how fast it's turning (deg/s).
    public var angle = 0.0, spin = 0.0
    /// Who has hold of it, if anyone; and who sent it flying last.
    public var holder: Holder?
    public var thrownBy: Holder?

    init(id: Int, face: Int, x: Double, y: Double) {
        self.id = id
        self.face = face
        self.x = x
        self.y = y
    }

    func copy() -> Toy {
        let t = Toy(id: id, face: face, x: x, y: y)
        t.z = z; t.vx = vx; t.vy = vy; t.vz = vz; t.angle = angle; t.spin = spin; t.holder = holder; t.thrownBy = thrownBy
        return t
    }
}

public struct Velocity3 {
    public var x: Double, y: Double, z: Double
    public init(x: Double, y: Double, z: Double) { self.x = x; self.y = y; self.z = z }
}

private let GRAVITY = 2100.0
private let BOUNCE = 0.36
private let SETTLE_VZ = 90.0
private let BOUNCE_GRIP = 0.68
private let FRICTION = 950.0
private let WALL = 0.5
private let STILL = 6.0

public final class Toybox {
    public private(set) var toys: [Toy] = []
    /// Where blocks may go: the floor.
    public private(set) var bounds = Rect(x: 0, y: 0, width: 0, height: 0)
    /// Edge of a block, px.
    public var size = 18.0
    private var nextId = 1

    public init() {}

    @discardableResult
    public func add(_ face: Int, _ at: Pt) -> Toy {
        let toy = Toy(id: nextId, face: face, x: at.x, y: at.y)
        nextId += 1
        toys.append(toy)
        keepIn(toy)
        return toy
    }

    public func clear() { toys.removeAll() }

    /// A new floor (the screen changed): blocks off the edge of it come back on.
    public func setBounds(_ bounds: Rect) {
        self.bounds = bounds
        for toy in toys { keepIn(toy) }
    }

    public func get(_ id: Int) -> Toy? { toys.first { $0.id == id } }

    /// The block someone has hold of.
    public func heldBy(_ holder: Holder) -> Toy? { toys.first { $0.holder == holder } }

    /// On the floor and still: not flying, sliding or held.
    public func isResting(_ toy: Toy) -> Bool { toy.holder == nil && toy.z <= 0 && hypot(toy.vx, toy.vy) < STILL }

    /// Nothing about any block will change until something touches it.
    public var settled: Bool { toys.allSatisfy { $0.holder == nil && isResting($0) && $0.spin == 0 && jsMod($0.angle, 90) == 0 } }

    /// Takes hold of a block, unless someone else has it; you can take one from the pet.
    @discardableResult
    public func hold(_ id: Int, _ holder: Holder) -> Bool {
        guard let toy = get(id) else { return false }
        if let current = toy.holder, !(holder == .user && current == .pet) { return false }
        toy.holder = holder
        toy.vx = 0; toy.vy = 0; toy.vz = 0; toy.spin = 0
        return true
    }

    /// Carries a held block to a point on the floor, `z` up off it.
    public func moveHeld(_ id: Int, _ at: Pt, _ z: Double) {
        guard let toy = get(id), toy.holder != nil else { return }
        toy.x = at.x
        toy.y = at.y
        toy.z = Swift.max(0, z)
    }

    /// Lets go of a block with a throw (or just drops it, with no velocity).
    public func release(_ id: Int, _ holder: Holder, _ v: Velocity3, _ spin: Double = 0) {
        guard let toy = get(id), toy.holder == holder else { return }
        toy.thrownBy = toy.holder
        toy.holder = nil
        toy.vx = v.x; toy.vy = v.y; toy.vz = v.z
        toy.spin = spin
        keepIn(toy)
    }

    /// Knocks a loose block: a swat, or a kick from a passing paw.
    public func hit(_ id: Int, _ v: Velocity3, _ spin: Double, _ by: Holder = .pet) {
        guard let toy = get(id), toy.holder == nil else { return }
        toy.vx = v.x; toy.vy = v.y
        toy.vz = Swift.max(toy.vz, v.z)
        toy.spin = spin
        toy.thrownBy = by
    }

    public func step(_ dt: Double) {
        for toy in toys where toy.holder == nil { move(toy, dt) }
        separate()
    }

    /// Where a block will come to rest on the floor, if nothing touches it.
    public func landing(_ id: Int) -> Pt? {
        guard let toy = get(id) else { return nil }
        if toy.holder != nil { return Pt(x: toy.x, y: toy.y) }
        let ghost = toy.copy()
        var i = 0
        while i < 400 && !isResting(ghost) {
            move(ghost, 1.0 / 60)
            i += 1
        }
        return Pt(x: ghost.x, y: ghost.y)
    }

    private func move(_ toy: Toy, _ dt: Double) {
        if toy.z > 0 || toy.vz > 0 {
            toy.vz -= GRAVITY * dt
            toy.z += toy.vz * dt
            if toy.z <= 0 {
                toy.z = 0
                if -toy.vz > SETTLE_VZ {
                    toy.vz = -toy.vz * BOUNCE
                    toy.vx *= BOUNCE_GRIP
                    toy.vy *= BOUNCE_GRIP
                    toy.spin *= 0.6
                } else {
                    toy.vz = 0
                }
            }
        }
        let speed = hypot(toy.vx, toy.vy)
        if toy.z <= 0 && speed > 0 {
            // Sliding along the floor it tumbles over, a quarter turn for each side's length.
            let slower = Swift.max(0, speed - FRICTION * dt)
            toy.vx *= slower / speed
            toy.vy *= slower / speed
            let roll = (toy.vx / size) * 90
            toy.spin += (roll - toy.spin) * Swift.min(1, dt * 10)
            if slower < STILL { toy.vx = 0; toy.vy = 0 }
        }
        toy.x += toy.vx * dt
        toy.y += toy.vy * dt
        if isResting(toy) {
            // Come to a stop, it falls flat onto whichever face is nearest.
            let flat = jsRound(toy.angle / 90) * 90
            let left = flat - toy.angle
            toy.spin = 0
            toy.angle = abs(left) < 0.5 ? flat : toy.angle + left * Swift.min(1, dt * 14)
            if toy.angle == flat { toy.angle = jsMod(jsMod(flat, 360) + 360, 360) }
        } else {
            toy.angle += toy.spin * dt
        }
        keepIn(toy)
    }

    /// Keeps a block on the floor: it bounces off the sides, and stops at the top and bottom.
    private func keepIn(_ toy: Toy) {
        let b = bounds
        if b.width <= 0 { return }
        let half = size / 2
        let minX = b.x + half, maxX = b.x + b.width - half
        let minY = b.y + size, maxY = b.y + b.height - 2
        if toy.x < minX || toy.x > maxX {
            toy.x = Swift.min(maxX, Swift.max(minX, toy.x))
            toy.vx = -toy.vx * WALL
            toy.spin = -toy.spin * WALL
        }
        if toy.y < minY || toy.y > maxY {
            toy.y = Swift.min(maxY, Swift.max(minY, toy.y))
            toy.vy = -toy.vy * WALL
        }
    }

    /// Blocks on the floor don't sit inside each other: one knocks the other on.
    private func separate() {
        let s = size
        for i in 0..<toys.count {
            for j in (i + 1)..<Swift.max(i + 1, toys.count) {
                let a = toys[i], b = toys[j]
                if a.holder != nil || b.holder != nil || a.z > s * 0.6 || b.z > s * 0.6 { continue }
                let dx = b.x - a.x
                // Seen from above, a block's footprint is shallower than it is wide.
                let dy = (b.y - a.y) / 0.55
                let d = hypot(dx, dy)
                if d >= s || d == 0 { continue }
                let nx = dx / d, ny = dy / d
                let push = (s - d) / 2
                a.x -= nx * push
                a.y -= ny * push * 0.55
                b.x += nx * push
                b.y += ny * push * 0.55
                // Whatever was moving into the other passes some of it on.
                let closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny * 0.55
                if closing > 0 {
                    let share = closing * 0.55
                    a.vx -= nx * share
                    a.vy -= ny * share * 0.55
                    b.vx += nx * share
                    b.vy += ny * share * 0.55
                }
                keepIn(a)
                keepIn(b)
            }
        }
    }
}
