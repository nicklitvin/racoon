import AppKit
import SwiftUI

/// The settings' colours (src/styles.css), light and dark.
enum Theme {
    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
        })
    }

    static let bg = dynamic(0xf6f4ef, 0x1c1c21)
    static let surface = dynamic(0xffffff, 0x26262d)
    static let text = dynamic(0x24232a, 0xecebf0)
    static let muted = dynamic(0x615f6b, 0xa9a7b3)
    static let border = dynamic(0xdcd8ce, 0x3a3a44)
    static let accent = dynamic(0x5b6b3a, 0xa3b86c)
    static let accentText = dynamic(0xffffff, 0x1c1c21)
    static let noticeBg = dynamic(0xfff4e0, 0x3a2f1c)
    static let noticeBorder = dynamic(0xe8c27a, 0x8a6a2c)
    static let ok = dynamic(0x3f7a3a, 0x8fc486)
    /// A faint wash of the text colour: raised controls on either background.
    static let well = text.opacity(0.06)
    static let wellStrong = text.opacity(0.11)
    static let tile = dynamic(0xf4f1ea, 0x302f37)
}
