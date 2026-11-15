import Foundation

// A tiny pixel canvas of palette indices (0 is transparent), and shapes to fill it with.
// Shapes are signed distance functions sampled at each pixel's centre: inside is filled,
// the pixels just outside get a one-pixel outline. Nothing is anti-aliased, so every pixel
// is one of the palette's colours, as in hand-made pixel art.

/// Signed distance from a shape's edge, in pixels: negative inside.
public typealias Sd = (Double, Double) -> Double

public struct Box: Equatable {
    public var x0: Double
    public var y0: Double
    public var x1: Double
    public var y1: Double
    public init(x0: Double, y0: Double, x1: Double, y1: Double) {
        self.x0 = x0
        self.y0 = y0
        self.x1 = x1
        self.y1 = y1
    }
}

/// How a shape is filled: one colour, or a colour for each pixel (0 leaves it alone).
public enum Fill {
    case colour(Int)
    case each((Double, Double) -> Int)
}

public struct Shade {
    /// Colour along the lit (top) edge, and the shaded (bottom) edge.
    public var light: Int
    public var dark: Int
    public init(light: Int, dark: Int) {
        self.light = light
        self.dark = dark
    }
}

/// A shape: its distance function and the box it fits in.
public struct Shape {
    public var sd: Sd
    public var box: Box
    public init(sd: @escaping Sd, box: Box) {
        self.sd = sd
        self.box = box
    }
}

/// A Double to an Int index without trapping on huge or infinite values.
@inline(__always) func cell(_ v: Double) -> Int {
    v.isNaN ? 0 : Int(clamp(v, -1_000_000, 1_000_000))
}

public final class Raster {
    public let width: Int
    public let height: Int
    public var data: [UInt8]
    /// Rows below this aren't drawn (under the water).
    public var clipBelow = Double.infinity

    public init(_ width: Int, _ height: Int) {
        self.width = width
        self.height = height
        data = [UInt8](repeating: 0, count: width * height)
    }

    public func clear() {
        data.withUnsafeMutableBufferPointer { $0.update(repeating: 0) }
        clipBelow = .infinity
    }

    public func get(_ x: Int, _ y: Int) -> Int {
        x < 0 || y < 0 || x >= width || y >= height ? 0 : Int(data[y * width + x])
    }

    public func set(_ x: Int, _ y: Int, _ c: Int) {
        if x < 0 || y < 0 || x >= width || y >= height || Double(y) >= clipBelow { return }
        data[y * width + x] = UInt8(truncatingIfNeeded: c)
    }

    /// Fills a shape, with a one-pixel outline round it (over whatever is already there, so
    /// overlapping parts stay separate) unless `outline` is nil. `shade` lights the top edge
    /// and shades the bottom one of a shape filled with one colour. `outlineWhere` limits the
    /// outline to some pixels.
    public func shape(_ sd: Sd, _ box: Box, _ fill: Fill, _ outline: Int?, shade: Shade? = nil, outlineWhere: ((Double, Double) -> Bool)? = nil) {
        let x0 = Swift.max(0, cell(floor(box.x0) - 2))
        let y0 = Swift.max(0, cell(floor(box.y0) - 2))
        let x1 = Swift.min(width - 1, cell(ceil(box.x1) + 2))
        let y1 = Swift.min(height - 1, cell(ceil(box.y1) + 2))
        if x0 > x1 || y0 > y1 { return }
        for y in y0...y1 {
            for x in x0...x1 {
                let cx = Double(x) + 0.5
                let cy = Double(y) + 0.5
                let d = sd(cx, cy)
                if d <= 0 {
                    var c: Int
                    switch fill {
                    case let .colour(colour):
                        c = colour
                        if let shade {
                            if sd(cx + 0.4, cy - 1.6) > 0 { c = shade.light }
                            else if sd(cx - 0.6, cy + 1.8) > 0 { c = shade.dark }
                        }
                    case let .each(f):
                        c = f(cx, cy)
                    }
                    if c != 0 { set(x, y, c) }
                } else if let outline, d <= 1, outlineWhere?(cx, cy) ?? true {
                    set(x, y, outline)
                }
            }
        }
    }

    public func shape(_ s: Shape, _ fill: Fill, _ outline: Int?, shade: Shade? = nil, outlineWhere: ((Double, Double) -> Bool)? = nil) {
        shape(s.sd, s.box, fill, outline, shade: shade, outlineWhere: outlineWhere)
    }

    public func shape(_ s: Shape, _ colour: Int, _ outline: Int?, shade: Shade? = nil, outlineWhere: ((Double, Double) -> Bool)? = nil) {
        shape(s.sd, s.box, .colour(colour), outline, shade: shade, outlineWhere: outlineWhere)
    }

    /// Sets single pixels, rounding each point to the pixel it falls in.
    public func dots(_ points: [Pt], _ c: Int) {
        for p in points { set(cell(floor(p.x)), cell(floor(p.y)), c) }
    }

    /// A little bitmap (rows of '#' and '.'), with a one-pixel outline round it on empty pixels.
    public func stamp(_ rows: [String], _ x: Double, _ y: Double, _ fill: Int, _ outline: Int?) {
        let grid = rows.map { Array($0) }
        let ox = cell(jsRound(x - Double(grid[0].count) / 2))
        let oy = cell(jsRound(y - Double(grid.count) / 2))
        if let outline {
            for (j, row) in grid.enumerated() {
                for (i, ch) in row.enumerated() where ch == "#" {
                    for dy in -1...1 {
                        for dx in -1...1 where get(ox + i + dx, oy + j + dy) == 0 {
                            set(ox + i + dx, oy + j + dy, outline)
                        }
                    }
                }
            }
        }
        for (j, row) in grid.enumerated() {
            for (i, ch) in row.enumerated() where ch == "#" { set(ox + i, oy + j, fill) }
        }
    }

    /// Mirrors the picture left to right about column `about` (between pixels).
    public func mirror(_ about: Double) {
        let copy = data
        data.withUnsafeMutableBufferPointer { $0.update(repeating: 0) }
        for y in 0..<height {
            for x in 0..<width {
                let mx = cell(jsRound(2 * about - Double(x) - 1))
                if mx >= 0 && mx < width { data[y * width + mx] = copy[y * width + x] }
            }
        }
    }

    /// The box round every coloured pixel, or nil if there are none.
    public func bounds(skip: ((Int) -> Bool)? = nil) -> Box? {
        var x0 = Int.max, y0 = Int.max, x1 = Int.min, y1 = Int.min
        for y in 0..<height {
            for x in 0..<width {
                let c = Int(data[y * width + x])
                if c == 0 || skip?(c) == true { continue }
                if x < x0 { x0 = x }
                if x > x1 { x1 = x }
                if y < y0 { y0 = y }
                if y > y1 { y1 = y }
            }
        }
        return x0 == Int.max ? nil : Box(x0: Double(x0), y0: Double(y0), x1: Double(x1 + 1), y1: Double(y1 + 1))
    }
}

// MARK: - Shapes

/// An ellipse turned by `angle` radians (clockwise on screen). Distance is approximate but good near the edge.
public func ellipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double, _ angle: Double = 0) -> Shape {
    let c = cos(angle)
    let s = sin(angle)
    let ax = Swift.max(0.3, abs(rx))
    let ay = Swift.max(0.3, abs(ry))
    let sd: Sd = { x, y in
        let dx = x - cx
        let dy = y - cy
        let u = dx * c + dy * s
        let v = -dx * s + dy * c
        let k0 = hypot(u / ax, v / ay)
        let k1 = hypot(u / (ax * ax), v / (ay * ay))
        return k1 == 0 ? -Swift.min(ax, ay) : (k0 * (k0 - 1)) / k1
    }
    let r = Swift.max(ax, ay)
    return Shape(sd: sd, box: Box(x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r))
}

/// A stroke from a to b with round ends, radius ra at a and rb at b.
public func capsule(_ a: Pt, _ b: Pt, _ ra: Double, _ rb: Double? = nil) -> Shape {
    let rb = rb ?? ra
    let bx = b.x - a.x
    let by = b.y - a.y
    let l2 = bx * bx + by * by
    let sd: Sd = { x, y in
        let px = x - a.x
        let py = y - a.y
        let h = l2 == 0 ? 0 : Swift.max(0, Swift.min(1, (px * bx + py * by) / l2))
        return hypot(px - bx * h, py - by * h) - (ra + (rb - ra) * h)
    }
    let r = Swift.max(ra, rb)
    return Shape(sd: sd, box: Box(x0: Swift.min(a.x, b.x) - r, y0: Swift.min(a.y, b.y) - r, x1: Swift.max(a.x, b.x) + r, y1: Swift.max(a.y, b.y) + r))
}

/// A filled polygon.
public func polygon(_ pts: [Pt]) -> Shape {
    let sd: Sd = { x, y in
        var d = Double.infinity
        var inside = false
        var j = pts.count - 1
        for i in 0..<pts.count {
            let a = pts[j]
            let b = pts[i]
            let ex = b.x - a.x
            let ey = b.y - a.y
            let wx = x - a.x
            let wy = y - a.y
            let len = ex * ex + ey * ey
            let h = Swift.max(0, Swift.min(1, (wx * ex + wy * ey) / (len == 0 ? 1 : len)))
            d = Swift.min(d, hypot(wx - ex * h, wy - ey * h))
            if (a.y > y) != (b.y > y) && x < a.x + ((y - a.y) / (b.y - a.y)) * ex { inside.toggle() }
            j = i
        }
        return inside ? -d : d
    }
    return Shape(sd: sd, box: boxOf(pts))
}

/// A tube along a path, its radius varying along it: a tail. `at` says how far along (0..1) a pixel is.
public struct Tube {
    public var sd: Sd
    public var box: Box
    public var at: (Double, Double) -> Double
    public var shape: Shape { Shape(sd: sd, box: box) }
}

public func tube(_ spine: [Pt], _ radii: [Double]) -> Tube {
    let parts = spine.count < 2 ? [] : (1..<spine.count).map { i in capsule(spine[i - 1], spine[i], radii[i - 1], radii[i]) }
    let sd: Sd = { x, y in
        var d = Double.infinity
        for part in parts { d = Swift.min(d, part.sd(x, y)) }
        return d
    }
    let at: (Double, Double) -> Double = { x, y in
        var best = 0
        var bestD = Double.infinity
        for (i, part) in parts.enumerated() {
            let d = part.sd(x, y)
            if d < bestD {
                bestD = d
                best = i
            }
        }
        return (Double(best) + 0.5) / Double(parts.count)
    }
    let r = radii.jsMax
    let box = boxOf(spine)
    return Tube(sd: sd, box: Box(x0: box.x0 - r, y0: box.y0 - r, x1: box.x1 + r, y1: box.y1 + r), at: at)
}

public func union(_ sds: Sd...) -> Sd { union(sds) }
public func union(_ sds: [Sd]) -> Sd {
    { x, y in
        var d = Double.infinity
        for f in sds { d = Swift.min(d, f(x, y)) }
        return d
    }
}

public func intersect(_ sds: Sd...) -> Sd { intersect(sds) }
public func intersect(_ sds: [Sd]) -> Sd {
    { x, y in
        var d = -Double.infinity
        for f in sds { d = Swift.max(d, f(x, y)) }
        return d
    }
}

public func boxOf(_ pts: [Pt]) -> Box {
    Box(x0: pts.map(\.x).jsMin, y0: pts.map(\.y).jsMin, x1: pts.map(\.x).jsMax, y1: pts.map(\.y).jsMax)
}

public func joinBoxes(_ boxes: Box...) -> Box { joinBoxes(boxes) }
public func joinBoxes(_ boxes: [Box]) -> Box {
    Box(x0: boxes.map(\.x0).jsMin, y0: boxes.map(\.y0).jsMin, x1: boxes.map(\.x1).jsMax, y1: boxes.map(\.y1).jsMax)
}
