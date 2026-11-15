import Foundation

// The colours a pixel pet is drawn in (src/sprites/pixel/palette.ts). Every pixel is one of
// these: the picture is stored as palette slots, and a coat is just a palette.

public let SLOTS = [
    "outline", "fur", "furLight", "furDark",
    /** The far legs and ear, a shade darker. */
    "far", "belly",
    /** Pale markings: a muzzle, cheeks, a white chest. */
    "light",
    /** Dark markings: a raccoon's mask. */
    "dark",
    /** Tail rings and tabby stripes. */
    "band",
    "inner", "eye", "glint", "nose", "blush", "mouth", "tongue", "water", "waterLight", "waterDark",
    "shell", "shellDark", "shadow", "mark", "heart", "alarm",
    /** Whatever he's wearing: a hat's colours, then the neckwear's. Set from the item. */
    "hatMain", "hatTrim", "hatAccent", "wearMain", "wearTrim", "wearAccent",
    /** Clothes' lit and shaded edges, from the main colour. */
    "wearLight", "wearDark",
]

/// A palette: a colour (CSS: `#rrggbb` or `rgba(...)`) for each slot.
public typealias Palette = [String: String]

/// The palette index of each slot (0 is transparent).
public enum C {
    public static let outline = 1
    public static let fur = 2
    public static let furLight = 3
    public static let furDark = 4
    public static let far = 5
    public static let belly = 6
    public static let light = 7
    public static let dark = 8
    public static let band = 9
    public static let inner = 10
    public static let eye = 11
    public static let glint = 12
    public static let nose = 13
    public static let blush = 14
    public static let mouth = 15
    public static let tongue = 16
    public static let water = 17
    public static let waterLight = 18
    public static let waterDark = 19
    public static let shell = 20
    public static let shellDark = 21
    public static let shadow = 22
    public static let mark = 23
    public static let heart = 24
    public static let alarm = 25
    public static let hatMain = 26
    public static let hatTrim = 27
    public static let hatAccent = 28
    public static let wearMain = 29
    public static let wearTrim = 30
    public static let wearAccent = 31
    public static let wearLight = 32
    public static let wearDark = 33

    /// A slot's index by name.
    public static func of(_ slot: String) -> Int { (SLOTS.firstIndex(of: slot) ?? -1) + 1 }
}

private let SHARED: Palette = [
    "glint": "#ffffff",
    "blush": "#ff8fa6",
    "mouth": "#7a2f3a",
    "tongue": "#ff9aae",
    "water": "#5fb4e6",
    "waterLight": "#d4f1ff",
    "waterDark": "#2f7fb8",
    "shell": "#f6c0ae",
    "shellDark": "#c9806f",
    "shadow": "rgba(20, 16, 30, 0.24)",
    "mark": "#dfe8ff",
    "heart": "#ff6f91",
    "alarm": "#ffd23f",
    "hatMain": "#000000",
    "hatTrim": "#000000",
    "hatAccent": "#000000",
    "wearMain": "#000000",
    "wearTrim": "#000000",
    "wearAccent": "#000000",
    "wearLight": "#000000",
    "wearDark": "#000000",
]

private func coat(_ own: Palette) -> Palette { SHARED.merging(own) { _, mine in mine } }

public enum PixelCoat: String {
    case raccoon, ginger, otter, bunny, hedgehog
}

public let PIXEL_COATS: [PixelCoat: Palette] = [
    .raccoon: coat([
        "outline": "#211f29", "fur": "#8f919e", "furLight": "#b3b5c1", "furDark": "#6d6f7c", "far": "#71737f", "belly": "#c6c8d0",
        "light": "#efebe3", "dark": "#34343e", "band": "#34343e", "inner": "#4a4650", "eye": "#121017", "nose": "#211f29",
    ]),
    .ginger: coat([
        "outline": "#4a2516", "fur": "#f3a04e", "furLight": "#ffc67f", "furDark": "#d27a30", "far": "#d5813a", "belly": "#fbe3c2",
        "light": "#fff4e4", "dark": "#8a4420", "band": "#c9651f", "inner": "#f4a7b3", "eye": "#2a1712", "nose": "#e8768b",
    ]),
    .otter: coat([
        "outline": "#2b1a12", "fur": "#9a6a45", "furLight": "#ba8a5c", "furDark": "#7a5233", "far": "#7c5436", "belly": "#d9bc98",
        "light": "#ecd9bf", "dark": "#5a3b25", "band": "#6e4a2f", "inner": "#6e4a2f", "eye": "#140c09", "nose": "#2b1a12",
    ]),
    /** A sandy bunny with a white tail (`band`) and pink inside its ears. */
    .bunny: coat([
        "outline": "#3d2a20", "fur": "#c8a98c", "furLight": "#e3c8ab", "furDark": "#a8876a", "far": "#ad8c6f", "belly": "#f3e6d6",
        "light": "#fbf4ea", "dark": "#7a5a44", "band": "#ffffff", "inner": "#f5a8b8", "eye": "#24160f", "nose": "#f07890",
    ]),
    /** A hedgehog: a pale face and tummy, and dark spines (`dark`) streaked lighter (`band`). */
    .hedgehog: coat([
        "outline": "#2e1d14", "fur": "#d2ae86", "furLight": "#e8c9a2", "furDark": "#b08b63", "far": "#b08b66", "belly": "#efdcc0",
        "light": "#f4e6cf", "dark": "#5b4130", "band": "#a0805f", "inner": "#8a6a50", "eye": "#140c09", "nose": "#2b1a12",
    ]),
]

private func hexValue(_ hex: String) -> Int {
    let digits = hex.dropFirst().prefix(6)
    return Int(digits, radix: 16) ?? 0
}

/// A colour mixed `k` of the way towards white (k > 0) or black (k < 0).
public func shade(_ hex: String, _ k: Double) -> String {
    let v = hexValue(hex)
    func mix(_ c: Int) -> Int {
        let c = Double(c)
        return Int(jsRound(k > 0 ? c + (255 - c) * k : c * (1 + k)))
    }
    return "#" + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map { String(format: "%02x", mix($0)) }.joined()
}

/// The palette as packed RGBA words (bytes R, G, B, A in memory: ABGR as a little-endian
/// 32-bit word), straight (not premultiplied) alpha. Slot 0 is transparent.
public func rgbaTable(_ palette: Palette) -> [UInt32] {
    var table = [UInt32](repeating: 0, count: SLOTS.count + 1)
    for (i, slot) in SLOTS.enumerated() {
        let (r, g, b, a) = parseColour(palette[slot] ?? "#000000")
        table[i + 1] = (UInt32(a) << 24) | (UInt32(b) << 16) | (UInt32(g) << 8) | UInt32(r)
    }
    return table
}

/// A CSS colour (`#rrggbb` or `rgb(a)(...)`) as 0..255 channels.
public func parseColour(_ colour: String) -> (Int, Int, Int, Int) {
    if colour.hasPrefix("#") {
        let v = hexValue(colour)
        return ((v >> 16) & 255, (v >> 8) & 255, v & 255, 255)
    }
    var parts: [Double] = [0, 0, 0, 1]
    if let open = colour.firstIndex(of: "("), let close = colour.firstIndex(of: ")") {
        parts = colour[colour.index(after: open)..<close].split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? 0 }
    }
    func at(_ i: Int, _ fallback: Double) -> Double { i < parts.count ? parts[i] : fallback }
    return (Int(at(0, 0)), Int(at(1, 0)), Int(at(2, 0)), Int(jsRound(at(3, 1) * 255)))
}
