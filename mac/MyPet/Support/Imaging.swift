import AppKit
import PetCore

/// Pictures for the screen from the pets' pixel grids: every pixel one of the palette's
/// colours, shown blown up into crisp squares (layers with nearest-neighbour scaling).
enum Imaging {
    private static let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()

    /// An image of packed RGBA words (bytes R, G, B, A in memory, straight alpha).
    static func image(_ words: [UInt32], width: Int, height: Int) -> CGImage? {
        let data = words.withUnsafeBufferPointer { Data(buffer: $0) }
        guard let provider = CGDataProvider(data: data as CFData) else { return nil }
        return CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: colorSpace,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: false,
            intent: .defaultIntent
        )
    }

    /// The pet's picture as it was last drawn.
    static func image(of pet: PetRenderer) -> CGImage? {
        let raster = pet.raster
        let colours = pet.colours
        var words = [UInt32](repeating: 0, count: raster.data.count)
        for i in raster.data.indices { words[i] = colours[Int(raster.data[i])] }
        return image(words, width: raster.width, height: raster.height)
    }

    static func image(of grid: ColorGrid) -> CGImage? { image(grid.pixels, width: grid.width, height: grid.height) }

    /// A layer that shows pixel art crisply, with a soft light halo so it reads on any background.
    static func pixelLayer() -> CALayer {
        let layer = CALayer()
        layer.magnificationFilter = .nearest
        layer.minificationFilter = .nearest
        layer.contentsGravity = .resize
        layer.shadowColor = NSColor.white.cgColor
        layer.shadowOpacity = 0.92
        layer.shadowRadius = 1.5
        layer.shadowOffset = .zero
        layer.actions = noAnimations
        return layer
    }

    /// Layers move where they're put, every frame, without Core Animation easing them there.
    static let noAnimations: [String: CAAction] = [
        "position": NSNull(), "bounds": NSNull(), "frame": NSNull(), "contents": NSNull(),
        "hidden": NSNull(), "opacity": NSNull(), "transform": NSNull(), "zPosition": NSNull(),
    ]
}
