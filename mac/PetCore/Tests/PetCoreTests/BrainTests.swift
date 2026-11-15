import XCTest
@testable import PetCore

/// The behaviour, as tests/brain.test.ts checks it: deterministic runs with a seeded random.
final class BrainTests: XCTestCase {
    private let bounds = Rect(x: 0, y: 0, width: 1600, height: 900)
    private var bottom: Double { bounds.y + bounds.height }
    private let size = Size(width: 150, height: 90)
    private let step = 16.0

    private func world(cursor: Pt? = nil, excited: Bool = false, stillMs: Double = .infinity, typing: Bool = false, desk: Desk? = nil, mode: PetMode = .play) -> WorldInput {
        WorldInput(bounds: bounds, size: size, cursor: cursor, cursorExcited: excited, cursorStillMs: stillMs, typingActive: typing, desk: desk, mode: mode)
    }

    private func brain(_ seed: Double = 1) -> Brain { Brain(world(), random: seededRandom(seed)) }

    /// Runs for `ms`, checking on every step that he never teleports.
    @discardableResult
    private func run(_ brain: Brain, _ ms: Double, _ input: WorldInput? = nil) -> [PetSnapshot] {
        var out: [PetSnapshot] = []
        var prev: PetSnapshot?
        var t = 0.0
        while t < ms {
            let snap = brain.update(step, input ?? world())
            if let prev {
                let jump = hypot(snap.position.x - prev.position.x, snap.position.y - prev.position.y)
                XCTAssertLessThan(jump, 80, "moved \(jump)px in one step (\(prev.mode)/\(String(describing: prev.reaction)) -> \(snap.mode)/\(String(describing: snap.reaction)))")
            }
            out.append(snap)
            prev = snap
            t += step
        }
        return out
    }

    private func runUntil(_ brain: Brain, _ input: WorldInput? = nil, maxMs: Double = 30_000, _ until: (PetSnapshot) -> Bool) -> PetSnapshot? {
        var t = 0.0
        while t < maxMs {
            let snap = run(brain, step, input)[0]
            if until(snap) { return snap }
            t += step
        }
        return nil
    }

    private func place(_ brain: Brain, _ feet: Pt) {
        brain.grab()
        brain.dragTo(feet)
        run(brain, 100)
        brain.release()
    }

    func testStartsIdleAtTheBottomMiddle() {
        let snap = brain().update(0, world())
        XCTAssertEqual(snap.mode, .idle)
        XCTAssertEqual(snap.position, Pt(x: 800, y: bottom))
    }

    func testRoamsTheWholeScreenWithoutLeavingItOrTeleporting() {
        let snaps = run(brain(7), 5 * 60_000)
        let ys = snaps.map(\.position.y)
        XCTAssertLessThan(ys.jsMin, bottom - 200)
        for s in snaps {
            XCTAssertGreaterThanOrEqual(s.position.x, size.width / 2 - 0.001)
            XCTAssertLessThanOrEqual(s.position.x, bounds.width - size.width / 2 + 0.001)
            XCTAssertLessThanOrEqual(s.position.y, bottom + 0.001)
        }
    }

    func testIsDeterministicForASeed() {
        let a = run(brain(3), 20_000).map(\.position)
        let b = run(brain(3), 20_000).map(\.position)
        XCTAssertEqual(a, b)
    }

    func testChasesAWildCursor() {
        let b = brain(1)
        run(b, 500)
        let snap = runUntil(b, world(cursor: Pt(x: 300, y: 400), excited: true, stillMs: 0), maxMs: 2000) { $0.reaction == .chase }
        XCTAssertNotNil(snap)
    }

    func testAClickPetsIt() {
        let b = brain(1)
        run(b, 500)
        b.poke()
        XCTAssertEqual(run(b, 100).last?.animation, .happy)
        XCTAssertNotNil(runUntil(b, maxMs: 5000) { $0.reaction != .petted })
    }

    func testFollowsTheDragAndSettlesWhereDropped() {
        let b = brain(1)
        b.grab()
        b.dragTo(Pt(x: 400, y: 600))
        let snaps = run(b, 200)
        XCTAssertEqual(snaps.last?.animation, .dangle)
        b.release()
        let after = run(b, 500)
        XCTAssertEqual(after.last?.position, Pt(x: 400, y: 600))
    }

    func testWorksAtItsDesk() {
        let desk = Desk(seat: Pt(x: 1300, y: bottom), facing: 1, screen: Pt(x: 1420, y: bottom - 80))
        let b = brain(4)
        place(b, Pt(x: 400, y: 700))
        XCTAssertEqual(run(b, 50, world(desk: desk, mode: .work)).last?.say, "Work time!")
        let snap = runUntil(b, world(desk: desk, mode: .work), maxMs: 20_000) { $0.animation == .work }
        XCTAssertNotNil(snap)
        XCTAssertEqual(snap?.screen, .terminal)
    }

    func testTalksToAlarmieAndCarriesOn() {
        let b = brain(2)
        place(b, Pt(x: 600, y: 700))
        run(b, 3000)
        b.talk(.listen)
        let snaps = run(b, 20_000, world(cursor: Pt(x: 640, y: 640), excited: true, typing: true))
        XCTAssertTrue(snaps.allSatisfy { $0.reaction == .talk && $0.animation == .sit })
        XCTAssertEqual(snaps.last?.resting, true)
        b.talk(.think)
        XCTAssertTrue(run(b, 2000).allSatisfy { $0.animation == .confused })
        b.talk(.answer)
        XCTAssertEqual(b.talking, .answer)
        b.talk(nil)
        XCTAssertNil(b.talking)
        XCTAssertNotEqual(run(b, 100).last?.reaction, .talk)
    }

    func testPlaysWithItsBlocks() {
        let toys = Toybox()
        toys.setBounds(Rect(x: 0, y: 300, width: 1600, height: 600))
        toys.add(0, Pt(x: 700, y: 860))
        let b = Brain(world(), random: seededRandom(5), toys: toys)
        let snaps = run(b, 10 * 60_000)
        XCTAssertTrue(snaps.contains { $0.reaction == .play })
    }

    func testGooseHonks() {
        XCTAssertEqual(honk("Shh! Working.", 0), "Hssss!")
        XCTAssertEqual(honk("Throw me a block?", 0), "Honk?")
        XCTAssertTrue(honk("Hey!", 0).hasPrefix("HONK"))
    }
}
