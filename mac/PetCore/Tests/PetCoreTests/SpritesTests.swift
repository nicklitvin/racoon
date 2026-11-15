import XCTest
@testable import PetCore

final class SpritesTests: XCTestCase {
    func testJavaScriptArithmetic() {
        XCTAssertEqual(jsRound(2.5), 3)
        XCTAssertEqual(jsRound(-2.5), -2)
        XCTAssertEqual(jsMod(-7, 3), -1)
        XCTAssertEqual(toInt32(4_294_967_297), 1)
        XCTAssertEqual(toInt32(2_654_435_761), -1_640_531_535)
        // mulberry32 with seed 1, as `rng(1)` gives in the TypeScript.
        let r = rng(1)
        XCTAssertEqual(r(), 0.6270739405881613, accuracy: 1e-15)
        XCTAssertEqual(r(), 0.002735721180215478, accuracy: 1e-15)
        XCTAssertEqual(noise1(3.7, 2), -0.3325649338625374, accuracy: 1e-12)
        XCTAssertEqual(noise1(-1.2, 9), -0.8597696610391141, accuracy: 1e-12)
        XCTAssertEqual(reel(123456).index, 51)
        XCTAssertFalse(reel(123456).funny)
    }

    func testRasterShapes() {
        let r = Raster(10, 10)
        r.shape(ellipse(5, 5, 3, 3), 2, 1)
        XCTAssertEqual(r.get(5, 5), 2)
        XCTAssertEqual(r.get(0, 0), 0)
        let box = r.bounds()
        XCTAssertNotNil(box)
        r.mirror(5)
        XCTAssertEqual(r.get(4, 5), 2)
    }

    /// Every pet on offer draws something, in every animation, facing either way, and in
    /// every hat and outfit, without crashing.
    func testEveryPetDrawsInEveryAnimation() {
        for type in PetType.allCases {
            let pet = createPet(type)
            pet.setScale(1, devicePixelRatio: 2)
            var clock = 1000.0
            for animation in AnimationName.allCases {
                for heading in [0.0, Double.pi, Double.pi / 2, -Double.pi / 2, 0.8] {
                    clock += 200
                    pet.draw(PetFrame(animation: animation, timeMs: 300, keystrokes: 3, eyes: .open, heading: heading, clockMs: clock, velocity: Pt(x: 120, y: 30), gaze: Pt(x: 40, y: -60)))
                    XCTAssertTrue(pet.raster.data.contains { $0 != 0 }, "\(type) drew nothing in \(animation)")
                }
            }
            XCTAssertNotNil(pet.figure, "\(type) has nothing to grab")
        }
    }

    func testDressingUp() {
        let pet = createPet(.raccoonPixel)
        for (hat, outfit) in zip(Hat.allCases, Outfit.allCases + Array(repeating: Outfit.none, count: Hat.allCases.count)) {
            pet.dress(Dress(hat: hat, outfit: outfit))
            pet.draw(PetFrame(animation: .walk, timeMs: 100, clockMs: Double.random(in: 0..<100_000), velocity: Pt(x: 80, y: 0)))
            XCTAssertTrue(pet.raster.data.contains { $0 != 0 })
        }
    }

    func testHatsAndOutfitsAllHaveShapes() {
        for hat in Hat.allCases where hat != .none { XCTAssertFalse(HAT_ITEMS[hat]!.shapes.isEmpty, "\(hat)") }
        for outfit in Outfit.allCases where outfit != .none { XCTAssertFalse(OUTFIT_ITEMS[outfit]!.shapes.isEmpty, "\(outfit)") }
    }

    func testPaletteShade() {
        XCTAssertEqual(shade("#808080", 0.5), "#c0c0c0")
        XCTAssertEqual(shade("#808080", -0.5), "#404040")
        let table = rgbaTable(PIXEL_COATS[.raccoon]!)
        XCTAssertEqual(table[0], 0)
        // The shadow is see-through.
        XCTAssertEqual(table[C.shadow] >> 24, 61)
    }
}
