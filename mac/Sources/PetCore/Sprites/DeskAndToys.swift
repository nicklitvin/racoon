import Foundation

// The work-mode desk and the toy blocks, in pixel art (src/sprites/desk.ts, src/sprites/toys.ts).
// Both draw into a grid of packed RGBA colours (0 is transparent), which the app shows with
// each pixel blown up into a crisp square.

/// A small picture of packed RGBA colours (bytes R, G, B, A), row by row; 0 is transparent.
public final class ColorGrid {
    public let width: Int
    public let height: Int
    public var pixels: [UInt32]

    public init(_ width: Int, _ height: Int) {
        self.width = Swift.max(1, width)
        self.height = Swift.max(1, height)
        pixels = [UInt32](repeating: 0, count: self.width * self.height)
    }

    public func set(_ x: Int, _ y: Int, _ colour: UInt32) {
        if x >= 0 && y >= 0 && x < width && y < height { pixels[y * width + x] = colour }
    }

    public func get(_ x: Int, _ y: Int) -> UInt32 { x >= 0 && y >= 0 && x < width && y < height ? pixels[y * width + x] : 0 }

    public func fill(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ colour: UInt32) {
        if w <= 0 || h <= 0 { return }
        for yy in y..<(y + h) { for xx in x..<(x + w) { set(xx, yy, colour) } }
    }

    public func clear() { pixels.withUnsafeMutableBufferPointer { $0.update(repeating: 0) } }
}

/// A CSS hex colour (`#rrggbb`) as a packed RGBA word.
public func rgba(_ hex: String) -> UInt32 {
    let (r, g, b, a) = parseColour(hex)
    return (UInt32(a) << 24) | (UInt32(b) << 16) | (UInt32(g) << 8) | UInt32(r)
}

// MARK: - The desk

/// What's on the screen.
public enum DeskApp: String {
    case terminal, web, reels, idle
}

private enum DeskColours {
    static let line = rgba("#2a1f2d")
    static let wood = rgba("#c99460")
    static let woodLight = rgba("#ddb07c")
    static let woodDark = rgba("#9b6a3e")
    static let metal = rgba("#3b404c")
    static let metalLight = rgba("#565c6b")
    static let metalSide = rgba("#2c3039")
    static let keys = rgba("#ece8e0")
    static let key = rgba("#b9b2a6")
    static let mug = rgba("#f2775f")
}

/// The screen redraws this often while something's on it.
private let SCREEN_FPS = 8.0

/// A little wooden desk with a computer on it (a monitor, keyboard and mouse) and a mug, built
/// to fit the pet: the keyboard and the mouse sit just where his paws come down. Drawn facing
/// right, as he sits at it: keyboard nearest him, then the mouse, then the monitor, its screen
/// facing out so you can see what he's up to.
public final class DeskDrawing {
    /// The picture, in art pixels.
    public let art: ColorGrid
    /// Screen px per art pixel.
    public let pixel: Double
    /// Size on screen, px.
    public var width: Double { Double(art.width) * pixel }
    public var height: Double { Double(art.height) * pixel }
    /// The middle of the keyboard, px from the desk's left edge.
    public let keyboardX: Double
    /// How far the drawing reaches below the floor it stands on, px.
    public let below: Double
    /// The middle of the screen, px from the desk's left edge and up from the floor.
    public let screen: Pt

    private let monX: Int
    private let scrX0: Int
    private let scrX1: Int
    private let screenW: Int
    private let screenH: Int
    private let faceTop: Int
    private var shown = ""
    private var content: [UInt32]

    /// - Parameters:
    ///   - unit: his height, px: the desk is sized to it
    ///   - keysTop: how high the top of the keyboard is off the floor, px: where his paws rest
    ///   - mouseDx: how far right of the keyboard's middle the mouse goes, px
    ///   - pixel: px per art pixel
    public init(unit: Double, keysTop: Double, mouseDx: Double, pixel: Double) {
        let P = Swift.max(1, pixel)
        self.pixel = P
        let u = unit / P
        func r(_ v: Double) -> Int { Swift.max(1, Int(jsRound(v))) }
        let keysH = 2
        let surface = Swift.max(5, Int(jsRound(keysTop / P)) - keysH)
        let top = 2
        let legW = 2
        let mouseW = 3
        let mouseX = Int(jsRound(mouseDx / P))
        // The keyboard fills what room there is between his near paw and the mouse.
        let keysW = Swift.max(6, Swift.min(r(u * 0.26), 2 * (mouseX - Int(ceil(Double(mouseW) / 2)) - 1)))
        let keysX = 1
        let keysMid = Double(keysX) + Double(keysW) / 2
        let mouseLeft = Int(jsRound(keysMid + Double(mouseX) - Double(mouseW) / 2))
        let mugX = mouseLeft + mouseW + 2
        // The monitor: its face, and its case showing `depth` deep behind.
        let faceW = r(u * 0.46)
        let faceH = r(u * 0.33)
        let depth = 2
        let stand = r(u * 0.08) + 2
        let monX = mugX + 6
        let width = monX + faceW + depth + 3
        // A row under the floor for the outline along the bottom of the legs and drawers.
        let base = 1
        let height = base + surface + stand + faceH + depth + 2
        func Y(_ up: Int) -> Int { height - base - up }
        let C = DeskColours.self
        let g = ColorGrid(width, height)

        // Under the top: a leg at each end down to the floor, and a drawer hanging between them.
        let legH = surface - top
        let rightLeg = width - 1 - legW
        let drawerX = monX + 1
        let drawerW = rightLeg - 1 - drawerX
        let drawerH = Swift.max(2, Int(jsRound(Double(legH) * 0.55)))
        var rects: [(x: Int, y: Int, w: Int, h: Int, fill: UInt32, flat: Bool)] = [
            (1, Y(legH), legW, legH, C.woodDark, false),
            (rightLeg, Y(legH), legW, legH, C.woodDark, false),
            (drawerX, Y(legH), drawerW, drawerH, C.wood, false),
            (drawerX + Int(floor(Double(drawerW) / 2)) - 1, Y(legH) + Int(floor(Double(drawerH) / 2)), 2, 1, C.woodDark, true),
            (0, Y(surface), width, top, C.wood, false),
            (1, Y(surface), width - 2, 1, C.woodLight, true),
            // A mug, keyboard and mouse.
            (mugX, Y(surface + 3), 3, 3, C.mug, false),
            (keysX, Y(surface + keysH), keysW, keysH, C.keys, false),
            (mouseLeft, Y(surface + 1), mouseW, 1, C.keys, false),
        ]
        var kx = keysX + 1
        while kx < keysX + keysW - 1 {
            rects.append((kx, Y(surface + keysH), 1, 1, C.key, true))
            kx += 2
        }
        for p in rects {
            if !p.flat { g.fill(p.x - 1, p.y - 1, p.w + 2, p.h + 2, C.line) }
            g.fill(p.x, p.y, p.w, p.h, p.fill)
        }
        // The mug's handle.
        g.set(mugX + 3, Y(surface + 2), C.line)
        g.set(mugX + 4, Y(surface + 2), C.line)
        g.set(mugX + 4, Y(surface + 1), C.line)

        // The monitor. Column i of its face runs from colTop down to colBottom.
        let faceBottom = Y(surface + stand)
        let colBottom = faceBottom
        let colTop = colBottom - faceH + 1
        let mid = faceW / 2
        // Everything that's monitor, so it can be outlined as one: the case behind, the face, and the stand.
        var mask = [UInt8](repeating: 0, count: width * height)
        func mark(_ x: Int, _ y: Int, _ v: UInt8) { if x >= 0 && y >= 0 && x < width && y < height { mask[y * width + x] = v } }
        for d in stride(from: depth, through: 1, by: -1) { for i in 0..<faceW { for y in colTop...colBottom { mark(monX + i + d, y - d, 1) } } }
        for i in 0..<faceW { for y in colTop...colBottom { mark(monX + i, y, 2) } }
        let neckX = monX + mid
        if colBottom + 1 < Y(surface + 1) { for y in (colBottom + 1)..<Y(surface + 1) { mark(neckX, y, 3); mark(neckX + 1, y, 3) } }
        for x in -3...3 { mark(neckX + x, Y(surface + 1), 3) }
        for x in -1...4 { mark(neckX + x, Y(surface + 2), 3) }
        let colour: [UInt32] = [0, C.metalSide, C.metal, C.metalLight]
        for y in 0..<height {
            for x in 0..<width {
                let v = mask[y * width + x]
                if v != 0 {
                    g.set(x, y, colour[Int(v)])
                } else {
                    let near = [(1, 0), (-1, 0), (0, 1), (0, -1)].contains { dx, dy in
                        let xx = x + dx, yy = y + dy
                        return xx >= 0 && xx < width && yy >= 0 && yy < height && mask[yy * width + xx] != 0
                    }
                    if near { g.set(x, y, C.line) }
                }
            }
        }
        // A glint along the case's top edge, where the light catches it.
        if faceW - 1 > 2 { for i in 2..<(faceW - 1) { g.set(monX + i + 1, colTop - 1, C.metalLight) } }

        art = g
        self.monX = monX
        scrX0 = 1
        scrX1 = faceW - 2
        screenW = Swift.max(1, faceW - 2)
        screenH = Swift.max(1, faceH - 3)
        faceTop = colTop + 1
        content = [UInt32](repeating: 0, count: screenW * screenH)
        keyboardX = (Double(keysX) + Double(keysW) / 2) * P
        below = Double(base) * P
        screen = Pt(x: Double(monX + mid) * P, y: (Double(surface + stand) + Double(faceH) / 2) * P)
    }

    /// Shows `app` on the screen as it is at `clock` (ms). Cheap to call every frame; returns
    /// whether the picture changed.
    @discardableResult
    public func show(_ app: DeskApp, _ clock: Double) -> Bool {
        let frame = app == .idle ? floor(clock / 250) : floor(clock / (1000 / SCREEN_FPS))
        let key = "\(app.rawValue)|\(frame)"
        if key == shown { return false }
        shown = key
        paintScreen(app, clock, screenW, screenH, &content)
        for i in scrX0...Swift.max(scrX0, scrX1) {
            let cx = i - scrX0
            if cx >= screenW { continue }
            for y in 0..<screenH { art.set(monX + i, faceTop + y, content[y * screenW + cx]) }
        }
        return true
    }
}

/// Pseudo-random but steady numbers, for text that doesn't flicker.
private func steadyHash(_ n: Double) -> Double {
    var h = imul(toInt32(n) ^ toInt32(Double(0x9E37_79B9)), toInt32(Double(0x85EB_CA6B)))
    h ^= ushr(h, 13)
    h = imul(h, toInt32(Double(0xC2B2_AE35)))
    return u32(h ^ ushr(h, 16)) / 4_294_967_296
}

/// A line of "text": words of a few pixels with gaps, `length` pixels long at most.
private func textAt(_ line: Int, _ x: Int, _ length: Int) -> Bool {
    if x >= length { return false }
    var at = 0
    var w = 0
    while at < length {
        let word = 1 + Int(floor(steadyHash(Double(line * 31 + w)) * 4))
        if x >= at && x < at + word { return true }
        at += word + 1
        w += 1
    }
    return false
}

/// Draws `app` into `out` (row by row, `w` by `h` colours).
private func paintScreen(_ app: DeskApp, _ clock: Double, _ w: Int, _ h: Int, _ out: inout [UInt32]) {
    func set(_ x: Int, _ y: Int, _ c: UInt32) { if x >= 0 && y >= 0 && x < w && y < h { out[y * w + x] = c } }
    func fill(_ c: UInt32) { for i in out.indices { out[i] = c } }
    let t = clock / 1000
    switch app {
    case .idle:
        // A screen saver: a dot drifting about a dark screen.
        fill(rgba("#10141c"))
        let x = Int(jsRound((sin(t * 0.7) * 0.5 + 0.5) * Double(w - 2)))
        let y = Int(jsRound((sin(t * 1.1 + 1) * 0.5 + 0.5) * Double(h - 2)))
        set(x, y, rgba("#5a9e7c"))
        set(x + 1, y, rgba("#5a9e7c"))
    case .terminal:
        // Lines of green and grey text scrolling up as he types, a prompt at the start of each
        // command and a blinking cursor at the end of the one he's on.
        fill(rgba("#12161d"))
        let rate = 9.0
        let typed = Int(floor(t * rate))
        func lineLen(_ i: Int) -> Int { 3 + Int(floor(steadyHash(Double(i)) * Double(w - 4))) }
        var line = 0
        var left = typed
        while left > lineLen(line) {
            left -= lineLen(line)
            line += 1
        }
        let rows = (h - 1) / 2
        for row in 0..<Swift.max(0, rows) {
            let i = line - (rows - 1 - row)
            if i < 0 { continue }
            let y = 1 + row * 2
            let len = i == line ? left : lineLen(i)
            let command = steadyHash(Double(i * 7)) < 0.4
            if command { set(0, y, rgba("#ffd84a")) }
            if w - 2 > 0 { for x in 0..<(w - 2) where textAt(i, x, len) { set(x + (command ? 2 : 0), y, command ? rgba("#e8e4da") : rgba("#7fe0a8")) } }
            if i == line && Int(floor(t * 2.5)) % 2 == 0 { set(Swift.min(w - 1, len + (command ? 2 : 0)), y, rgba("#e8e4da")) }
        }
    case .web:
        // A web page: the address bar, then a picture and paragraphs, scrolling slowly by.
        fill(rgba("#f4f1ea"))
        let scroll = Int(floor(t * 1.2))
        if h > 2 {
            for y in 2..<h {
                let row = y - 2 + scroll
                let block = row / 8
                let inBlock = row % 8
                let picture = steadyHash(Double(block * 13)) < 0.45
                for x in 0..<w {
                    if picture && inBlock < 5 && x >= 1 && x < Int(ceil(Double(w) * 0.55)) {
                        // A picture: sky over grass, with a sun.
                        let sun = x == 3 && inBlock == 1
                        set(x, y, sun ? rgba("#ffd84a") : inBlock < 3 ? rgba("#9cc8ee") : rgba("#7cbf6e"))
                    } else if inBlock % 2 == 1 && textAt(row, x - 1, w - 2) && x >= 1 {
                        set(x, y, row % 8 == 1 ? rgba("#4d6fd6") : rgba("#a7a196"))
                    }
                }
            }
        }
        // The address bar and the tabs.
        for x in 0..<w {
            set(x, 0, rgba("#5b6ee0"))
            set(x, 1, x > 1 && x < w - 2 ? rgba("#e9ecf8") : rgba("#5b6ee0"))
        }
    case .reels:
        // Short videos, one after another: a bright card in the middle of a dark screen,
        // flicked away upwards for the next, with a heart and a caption.
        fill(rgba("#0c0c11"))
        let every = REEL_MS / 1000
        let n = floor(t / every)
        let into = jsMod(t / every, 1)
        let swipe = into > 0.86 ? (into - 0.86) / 0.14 : 0
        let cw = Swift.max(5, Int(jsRound(Double(h) * 0.56)))
        let x0 = (w - cw) / 2
        let palettes = [("#ff8fa6", "#ffd84a"), ("#7fe0a8", "#5b6ee0"), ("#ffb36b", "#e2435a"), ("#9cc8ee", "#ffffff"), ("#c59cf0", "#ffd84a")]
        for (k, offset) in [(n, -Int(jsRound(swipe * Double(h)))), (n + 1, h - Int(jsRound(swipe * Double(h))))] {
            let pal = palettes[Int(floor(steadyHash(k) * Double(palettes.count)))]
            let bg = rgba(pal.0), blob = rgba(pal.1)
            let bounce = jsRound(sin(t * 6 + k) * 1)
            for y in 0..<h {
                let yy = y + offset
                if yy < 0 || yy >= h { continue }
                for x in x0..<(x0 + cw) {
                    let dx = Double(x) - (Double(x0) + Double(cw) / 2 - 0.5)
                    let dy = Double(y) - (Double(h) * 0.45 + bounce)
                    set(x, yy, dx * dx + dy * dy < Double(cw * cw) / 7 ? blob : bg)
                }
                // The caption.
                if y == h - 2 && x0 + 1 < x0 + cw - 2 { for x in (x0 + 1)..<(x0 + cw - 2) { set(x, yy, rgba("#ffffff")) } }
            }
        }
        // The heart, beside the card.
        let hx = x0 + cw + 1
        let hy = Int(jsRound(Double(h) * 0.55))
        for (x, y) in [(0, 0), (2, 0), (0, 1), (1, 1), (2, 1), (1, 2)] { set(hx + x, hy + y, rgba("#ff4d6d")) }
    }
}

// MARK: - The toy blocks

/// Each block's paint: the panel, a deeper shade of it, and the letter.
private let BLOCKS = [("#e8604f", "#b73d30", "#fff6e6"), ("#4593d8", "#2b69a8", "#fff6e6"), ("#f3b833", "#c58b14", "#fff6e6"), ("#5dba62", "#3a8a40", "#fff6e6")]

/// How much bigger the drawing's box is than the block, so its corners have room to tumble.
public let TOY_BOX = 1.5

private func lighten(_ hex: String) -> String {
    let v = Int(hex.dropFirst(), radix: 16) ?? 0
    func mix(_ c: Int) -> Int { Int(jsRound(Double(c) + Double(255 - c) * 0.35)) }
    return "#" + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map { String(format: "%02x", mix($0)) }.joined()
}

/// A pixel block: 9 pixels square, turned by whole pixels (nearest neighbour), so it stays pixel art.
public final class ToyDrawing {
    public let art: ColorGrid
    private let block: [[Int]]
    private let colours: [UInt32]
    private var shown = Double.nan

    public init(face: Int) {
        let N = Int(PIXEL_TOY)
        let S = Int(ceil(PIXEL_TOY * TOY_BOX))
        art = ColorGrid(S, S)
        let paint = BLOCKS[face % BLOCKS.count]
        // 1 outline, 2 panel, 3 lit edge, 4 shaded edge, 5 letter.
        colours = [0, rgba("#2a1f2d"), rgba(paint.0), rgba(lighten(paint.0)), rgba(paint.1), rgba(paint.2)]
        let glyph = Glyphs.named(BLOCK_LETTERS[face % BLOCK_LETTERS.count]).map { Array($0) }
        var rows: [[Int]] = []
        for y in 0..<N {
            var row: [Int] = []
            for x in 0..<N {
                let edge = x == 0 || y == 0 || x == N - 1 || y == N - 1
                let corner = (x == 0 || x == N - 1) && (y == 0 || y == N - 1)
                var c = corner ? 0 : edge ? 1 : y == 1 || x == 1 ? 3 : y == N - 2 || x == N - 2 ? 4 : 2
                // The letter in the middle, clear of the lit and shaded edges.
                let gx = x - 3, gy = y - 2
                if gy >= 0 && gy < glyph.count && gx >= 0 && gx < glyph[0].count && glyph[gy][gx] == "#" { c = 5 }
                row.append(c)
            }
            rows.append(row)
        }
        block = rows
    }

    /// Tumbles it over to `angle` degrees (clockwise), in 15° steps as a sprite would be.
    /// Returns whether the picture changed.
    @discardableResult
    public func draw(_ angle: Double) -> Bool {
        let step = jsRound(angle / 15) * 15
        if step == shown { return false }
        shown = step
        art.clear()
        let N = Double(PIXEL_TOY)
        let S = art.width
        let a = (-step * Double.pi) / 180
        let c = cos(a), s = sin(a)
        for y in 0..<S {
            for x in 0..<S {
                let dx = Double(x) + 0.5 - Double(S) / 2
                let dy = Double(y) + 0.5 - Double(S) / 2
                let u = Int(floor(dx * c - dy * s + N / 2))
                let v = Int(floor(dx * s + dy * c + N / 2))
                guard v >= 0 && v < block.count && u >= 0 && u < block[v].count else { continue }
                let idx = block[v][u]
                if idx != 0 { art.set(x, y, colours[idx]) }
            }
        }
        return true
    }
}
