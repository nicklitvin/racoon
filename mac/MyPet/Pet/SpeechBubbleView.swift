import AppKit

/// What the pet says (the brain's `say`): a little pixel-edged bubble over his head, fading in
/// and out, keeping the last words as it fades.
final class SpeechBubbleView: NSView {
    private let label = NSTextField(labelWithString: "")
    private(set) var shown = false
    private static let ink = NSColor(srgbRed: 0x2b / 255, green: 0x26 / 255, blue: 0x30 / 255, alpha: 1)
    private static let paper = NSColor(srgbRed: 1, green: 0xfd / 255, blue: 0xf8 / 255, alpha: 1)

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        alphaValue = 0
        label.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .bold)
        label.textColor = Self.ink
        label.alignment = .center
        label.lineBreakMode = .byClipping
        addSubview(label)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// Shows `text` with the bubble's tail at `tip` (its bottom middle), or hides it (nil).
    func say(_ text: String?, tip: NSPoint) {
        if let text {
            label.stringValue = text
            label.sizeToFit()
            let size = NSSize(width: label.frame.width + 20, height: label.frame.height + 10 + 6)
            frame = NSRect(x: (tip.x - size.width / 2).rounded(), y: (tip.y - size.height).rounded(), width: size.width, height: size.height)
            label.frame = NSRect(x: 10, y: 4, width: label.frame.width, height: label.frame.height)
            needsDisplay = true
        }
        let show = text != nil
        if show == shown { return }
        shown = show
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.18
            animator().alphaValue = show ? 1 : 0
        }
    }

    /// Moves it with him, keeping its tail at `tip`.
    func move(tip: NSPoint) {
        guard shown else { return }
        let origin = NSPoint(x: (tip.x - frame.width / 2).rounded(), y: (tip.y - frame.height).rounded())
        if origin != frame.origin { setFrameOrigin(origin) }
    }

    override func draw(_ dirtyRect: NSRect) {
        // A pixel box: square corners with the outline stepped in at each, and a tail below.
        let body = NSRect(x: 2, y: 2, width: bounds.width - 4, height: bounds.height - 10)
        Self.ink.setFill()
        NSRect(x: body.minX, y: body.minY - 2, width: body.width, height: body.height + 4).fill()
        NSRect(x: body.minX - 2, y: body.minY, width: body.width + 4, height: body.height).fill()
        Self.paper.setFill()
        body.fill()
        // The tail.
        let mid = (bounds.width / 2).rounded()
        Self.ink.setFill()
        NSRect(x: mid - 4, y: body.maxY, width: 8, height: 6).fill()
        Self.paper.setFill()
        NSRect(x: mid - 2, y: body.maxY - 2, width: 4, height: 6).fill()
    }
}
