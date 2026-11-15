import AppKit
import PetCore
import SwiftUI

/// The pictures in the settings: each pet standing on its tile, little scenes of the modes, and
/// the hats and outfits on their own.

/// A pixel image, shown crisp at `scale` screen points per pixel.
struct PixelImage: View {
    let image: CGImage?
    let pointsPerPixel: CGFloat

    var body: some View {
        if let image {
            Image(decorative: image, scale: 1)
                .interpolation(.none)
                .resizable()
                .frame(width: CGFloat(image.width) * pointsPerPixel, height: CGFloat(image.height) * pointsPerPixel)
        }
    }
}

/// A still of the pet, drawn once: standing, turned three-quarters towards you, in what it's wearing.
struct PetPreview: View {
    let type: PetType
    var dress = UNDRESSED
    /// Points per art pixel (the screen draws the pets at 3).
    var pointsPerPixel: CGFloat = 2

    var body: some View {
        let (image, _) = Self.still(type, dress)
        // Stood on the bottom of its tile: the picture down to just under its feet.
        PixelImage(image: image, pointsPerPixel: pointsPerPixel)
            .frame(height: CGFloat(PIXEL.feetY + 2) * pointsPerPixel, alignment: .top)
            .clipped()
    }

    static func still(_ type: PetType, _ dress: Dress) -> (CGImage?, Box?) {
        let pet = createPet(type)
        pet.setScale(1, devicePixelRatio: 1)
        pet.dress(dress)
        pet.draw(PetFrame(animation: .idle, timeMs: 1000, keystrokes: 0, eyes: .open, heading: 0.5, clockMs: 1000))
        return (Imaging.image(of: pet), pet.figure)
    }
}

/// A little picture of what your pet does in a mode, with your pet in it, dressed as it is:
/// swatting its blocks about, typing away at its desk, asleep, or running off.
struct ModeScene: View {
    let mode: PetMode
    let type: PetType
    let dress: Dress

    /// Points per art pixel in the scene.
    private static let ppp: CGFloat = 2
    /// The floor, points up from the bottom of the picture.
    private static let floor: CGFloat = 12

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1.0 / 12)) { context in
            Canvas { gc, size in
                draw(in: &gc, size: size, clock: context.date.timeIntervalSinceReferenceDate * 1000)
            }
        }
        .id("\(mode)|\(type)|\(dress.hat)|\(dress.outfit)")
    }

    private func draw(in gc: inout GraphicsContext, size: CGSize, clock: Double) {
        gc.withCGContext { cg in
            cg.interpolationQuality = .none
            let scene = SceneCache.shared.scene(mode, type, dress)
            let pet = scene.pet
            let ppp = Self.ppp
            let floorY = size.height - Self.floor
            let anchor = pet.anchor
            func put(_ image: CGImage?, x: CGFloat, y: CGFloat, ax: CGFloat, ay: CGFloat, pixels: CGFloat = ppp) {
                guard let image else { return }
                let w = CGFloat(image.width) * pixels, h = CGFloat(image.height) * pixels
                let rect = CGRect(x: size.width / 2 + x - ax * w, y: floorY - y - (1 - ay) * h, width: w, height: h)
                // CG draws images upright in a flipped context only if we flip them back.
                cg.saveGState()
                cg.translateBy(x: rect.minX, y: rect.maxY)
                cg.scaleBy(x: 1, y: -1)
                cg.draw(image, in: CGRect(origin: .zero, size: rect.size))
                cg.restoreGState()
            }
            var animation: AnimationName = .idle
            var velocity = Pt.zero
            var petX: CGFloat = 0
            switch mode {
            case .play:
                animation = .bat
                let block = CGFloat(PIXEL_TOY) * ppp
                let reach = CGFloat(pet.toyReach ?? 30) / CGFloat(PIXEL_PX) * ppp
                petX = -reach / 2 - 10
                for (i, (x, y, face)) in [(petX + reach, CGFloat(0), 0), (petX + reach + block * 1.6, 0, 1), (petX + reach + block * 1.6 + block * 0.15, block, 2)].enumerated() {
                    let drawing = scene.blocks[i]
                    drawing.draw(face == 2 ? 15 : 0)
                    put(Imaging.image(of: drawing.art), x: x, y: y + block / 2, ax: 0.5, ay: 0.5)
                }
            case .work:
                animation = .work
                if let desk = scene.desk {
                    desk.show(.terminal, clock)
                    let scale = ppp / CGFloat(PIXEL_PX)
                    let reachX = CGFloat(pet.deskReach?.x ?? 30) * scale
                    let unit = CGFloat(pet.baseSize.height * pet.anchor.y) * scale
                    let deskW = CGFloat(desk.width) * scale
                    let seat = CGFloat(desk.keyboardX) * scale - reachX
                    let left = seat - unit * 0.5
                    let deskLeft = -(left + deskW) / 2
                    put(Imaging.image(of: desk.art), x: deskLeft, y: -CGFloat(desk.below) * scale, ax: 0, ay: 1, pixels: ppp)
                    petX = deskLeft + seat
                }
            case .sleep:
                animation = .sleep
            case .hide:
                // Off he goes, past the edge.
                animation = .run
                velocity = Pt(x: 240, y: 0)
                petX = size.width / 2 - 18
            }
            let spec = ANIMATIONS[animation]!
            let t = clock
            let timeMs = animation == .bat ? Swift.min(jsMod(t, PLAY.batMs + 1400), PLAY.batMs) : spec.loop ? jsMod(t, spec.durationMs) : t
            if pet.draw(PetFrame(animation: animation, timeMs: timeMs, keystrokes: 0, eyes: spec.eyes == .closed ? .closed : spec.eyes == .wide ? .wide : .open, heading: 0, clockMs: clock, velocity: velocity)) {
                scene.petImage = Imaging.image(of: pet)
            }
            put(scene.petImage, x: petX, y: 0, ax: CGFloat(anchor.x), ay: CGFloat(anchor.y))
        }
    }
}

/// The scenes' drawings, kept between frames (one set per mode, pet and outfit).
final class SceneCache {
    static let shared = SceneCache()

    final class Scene {
        let pet: PetRenderer
        let blocks = [ToyDrawing(face: 0), ToyDrawing(face: 1), ToyDrawing(face: 2)]
        let desk: DeskDrawing?
        var petImage: CGImage?
        init(pet: PetRenderer, desk: DeskDrawing?) {
            self.pet = pet
            self.desk = desk
        }
    }

    private var scenes: [String: Scene] = [:]

    func scene(_ mode: PetMode, _ type: PetType, _ dress: Dress) -> Scene {
        let key = "\(mode)|\(type)|\(dress.hat)|\(dress.outfit)"
        if let scene = scenes[key] { return scene }
        let pet = createPet(type)
        pet.setScale(1, devicePixelRatio: 1)
        pet.dress(dress)
        var desk: DeskDrawing?
        if mode == .work {
            let unit = pet.baseSize.height * pet.anchor.y
            let reach = pet.deskReach ?? Pt(x: unit * 0.3, y: -unit * 0.35)
            let mouse = pet.mouseReach ?? Pt(x: reach.x + unit * 0.15, y: reach.y)
            desk = DeskDrawing(unit: unit, keysTop: -reach.y, mouseDx: mouse.x - reach.x, pixel: PIXEL_PX)
        }
        let scene = Scene(pet: pet, desk: desk)
        if scenes.count > 24 { scenes.removeAll() }
        scenes[key] = scene
        return scene
    }
}

/// A hat or an outfit on its own, for its tile: its shapes, outlined, fitted to the tile.
struct WearIcon: View {
    let item: Wearable?

    var body: some View {
        Canvas { gc, size in
            guard let item else {
                // None: a circle with a line through it.
                let r = min(size.width, size.height) * 0.32
                let c = CGPoint(x: size.width / 2, y: size.height / 2)
                var path = Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                path.move(to: CGPoint(x: c.x - r * 0.7, y: c.y - r * 0.7))
                path.addLine(to: CGPoint(x: c.x + r * 0.7, y: c.y + r * 0.7))
                gc.stroke(path, with: .color(Theme.muted), lineWidth: 1.5)
                return
            }
            let (shapes, box) = wearableIconBox(item)
            let k = min(size.width / CGFloat(box.width), size.height / CGFloat(box.height))
            func at(_ x: Double, _ y: Double) -> CGPoint {
                CGPoint(x: (CGFloat(x - box.x) * k) + (size.width - CGFloat(box.width) * k) / 2, y: (CGFloat(y - box.y) * k) + (size.height - CGFloat(box.height) * k) / 2)
            }
            let line = Color(red: 0x2b / 255, green: 0x26 / 255, blue: 0x30 / 255)
            for s in shapes {
                var path = Path()
                switch s {
                case let .poly(points, _):
                    path.addLines(points.map { at($0.x, $0.y) })
                    path.closeSubpath()
                case let .ellipse(cx, cy, rx, ry, _):
                    let a = at(cx - rx, cy - ry), b = at(cx + rx, cy + ry)
                    path.addEllipse(in: CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y))
                }
                gc.fill(path, with: .color(Color(hex: item.colours[s.paint])))
                gc.stroke(path, with: .color(line), style: StrokeStyle(lineWidth: 0.09 * k, lineJoin: .round))
            }
        }
    }
}

extension Color {
    /// A CSS `#rrggbb` colour.
    init(hex: String) {
        let (r, g, b, a) = parseColour(hex)
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}
