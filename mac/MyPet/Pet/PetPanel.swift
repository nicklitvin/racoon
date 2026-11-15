import AppKit

/// The pet's window: borderless, transparent, over every app and on every Space, covering the
/// main screen. It lets clicks through except over the pet, his toys, his desk and his bubbles
/// (`ignoresMouseEvents`, switched as the pointer comes and goes), and never takes the keyboard
/// from the app you're using, except while his Alarmie bubble is open for you to type in. A
/// non-activating panel, so even then the app you were in stays the active one.
final class PetPanel: NSPanel {
    /// The bubble's open: the panel may take the keyboard.
    var allowsKey = false

    init(frame: NSRect) {
        super.init(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        // Over normal windows and other apps' floating ones.
        level = .statusBar
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        ignoresMouseEvents = true
        isMovable = false
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        becomesKeyOnlyIfNeeded = true
        animationBehavior = .none
    }

    override var canBecomeKey: Bool { allowsKey }
    override var canBecomeMain: Bool { false }
}
