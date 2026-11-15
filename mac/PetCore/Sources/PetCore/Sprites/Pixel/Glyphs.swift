/// Little bitmaps for pixel art: '#' is a pixel, '.' is empty.
public enum Glyphs {
    public static let A = [".#.", "#.#", "###", "#.#", "#.#"]
    public static let B = ["##.", "#.#", "##.", "#.#", "##."]
    public static let C = [".##", "#..", "#..", "#..", ".##"]
    public static let D = ["##.", "#.#", "#.#", "#.#", "##."]
    public static let z = ["###", "..#", ".#.", "#..", "###"]
    public static let bang = ["#", "#", "#", ".", "#"]
    public static let question = ["##.", "..#", ".#.", "...", ".#."]
    public static let heart = [".#.#.", "#####", ".###.", "..#.."]
    /// A cross little vein, as cartoons have over an angry head.
    public static let angry = ["##.##", "#...#", ".....", "#...#", "##.##"]

    /// A glyph by its name in the TypeScript (`GLYPHS[name]`).
    public static func named(_ name: String) -> [String] {
        switch name {
        case "A": return A
        case "B": return B
        case "C": return C
        case "D": return D
        case "z": return z
        case "!": return bang
        case "?": return question
        case "heart": return heart
        case "angry": return angry
        default: return []
        }
    }
}

/// The letters on the toy blocks, in order.
public let BLOCK_LETTERS = ["A", "B", "C", "D"]
