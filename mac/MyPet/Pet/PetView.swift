import AppKit

/// The pet's window's content: the drawings (pet, toy blocks, desk) in layers, his speech
/// bubble and his Alarmie bubble over them, and the mouse, passed to the controller. Flipped,
/// so its points are the page's: from the top left of the screen, y down, like the core's.
final class PetView: NSView {
    /// Where the drawings go (a layer-hosting view: its layers are all ours).
    let sprites = SpriteHost()
    let speech = SpeechBubbleView(frame: .zero)
    let talk: TalkBubbleView
    /// The talk bubble's tail.
    private let talkTail = TailView()
    weak var controller: PetController?

    init(frame: NSRect, talk: TalkBubbleView) {
        self.talk = talk
        super.init(frame: frame)
        wantsLayer = true
        sprites.frame = bounds
        sprites.autoresizingMask = [.width, .height]
        addSubview(sprites)
        addSubview(speech)
        addSubview(talkTail)
        addSubview(talk)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    /// Puts the talk bubble's tail where it points, after the bubble has moved.
    func placeTail() {
        talkTail.isHidden = talk.isHidden
        if !talk.isHidden {
            talkTail.below = talk.below
            talkTail.frame = talk.tailRect
        }
    }

    private func page(_ event: NSEvent) -> NSPoint { convert(event.locationInWindow, from: nil) }

    override func mouseDown(with event: NSEvent) { controller?.mouseDown(at: page(event), time: event.timestamp * 1000) }
    override func mouseDragged(with event: NSEvent) { controller?.mouseDragged(to: page(event), time: event.timestamp * 1000) }
    override func mouseUp(with event: NSEvent) { controller?.mouseUp(at: page(event), time: event.timestamp * 1000) }
    override func mouseMoved(with event: NSEvent) { controller?.mouseMoved(to: page(event)) }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseMoved, .activeAlways, .inVisibleRect], owner: self))
    }
}

/// A view that only hosts layers, and never takes the mouse (the pet view under it does).
final class SpriteHost: NSView {
    let root = CALayer()

    override init(frame: NSRect) {
        super.init(frame: frame)
        root.actions = ["sublayers": NSNull(), "bounds": NSNull(), "position": NSNull()]
        layer = root
        wantsLayer = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    /// A page rect (y down from the top) in the layer's own coordinates (y up from the bottom).
    func layerRect(_ r: CGRect) -> CGRect { CGRect(x: r.minX, y: bounds.height - r.maxY, width: r.width, height: r.height) }
}

/// The little triangle under (or over) the talk bubble, pointing at the pet.
private final class TailView: NSView {
    var below = false { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
    override func draw(_ dirtyRect: NSRect) {
        let ink = NSColor(srgbRed: 0x2b / 255, green: 0x26 / 255, blue: 0x30 / 255, alpha: 1)
        let paper = NSColor(srgbRed: 1, green: 0xfd / 255, blue: 0xf8 / 255, alpha: 1)
        ink.setFill()
        bounds.fill()
        paper.setFill()
        (below ? NSRect(x: 2, y: 2, width: bounds.width - 4, height: bounds.height - 2) : NSRect(x: 2, y: 0, width: bounds.width - 4, height: bounds.height - 2)).fill()
    }
}
