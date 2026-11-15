import AppKit
import PetCore

/// Talking to Alarmie through the pet: his speech bubble with a box to type in and a mic. You
/// type (or press the mic and say it: the words come into the box as you talk), press Enter,
/// and he thinks (dots in the bubble, his head tilting); Alarmie's answer comes back in the same
/// bubble, with the box under it to answer back. Escape, the ×, or clicking somewhere else puts
/// it away. The conversation carries on until the bubble closes.
final class TalkBubbleView: NSView, NSTextFieldDelegate {
    /// Where the talk is at, for the pet to act it out (nil: it's over).
    var onPhase: (TalkPhase?) -> Void = { _ in }
    /// The bubble needs the keyboard (true) while it's open, and lets it go after.
    var onKeyboard: (Bool) -> Void = { _ in }
    /// Its size changed (where to catch the mouse moves with it).
    var onChange: () -> Void = {}

    private let alarmie: AlarmieService
    private let dictation = Dictation()
    private let said = NSTextField(wrappingLabelWithString: "")
    private let saidScroll = NSScrollView()
    private let input = NSTextField()
    private let mic = NSButton()
    private let close = NSButton()
    private let dots = ThinkingDots()
    private(set) var phase: TalkPhase?
    private var conversation: String?
    private var asking = 0
    private var closeTimer: Timer?
    private var errored = false
    /// The bubble goes over his head unless there's no room, then under him.
    private(set) var below = false
    /// Where its tail points: his head (or his feet, below him), in the window.
    private var tip = NSPoint.zero

    static let width: CGFloat = 248
    private static let ink = NSColor(srgbRed: 0x2b / 255, green: 0x26 / 255, blue: 0x30 / 255, alpha: 1)
    private static let paper = NSColor(srgbRed: 1, green: 0xfd / 255, blue: 0xf8 / 255, alpha: 1)
    private static let well = NSColor(srgbRed: 0xf1 / 255, green: 0xee / 255, blue: 0xe6 / 255, alpha: 1)
    private static let errorInk = NSColor(srgbRed: 0xa3 / 255, green: 0x32 / 255, blue: 0x2a / 255, alpha: 1)
    /// How long an answer stays up once you've gone back to something else: long enough to read.
    private static let readMin = 6.0, readPerChar = 0.06, readMax = 30.0

    init(alarmie: AlarmieService) {
        self.alarmie = alarmie
        super.init(frame: NSRect(x: 0, y: 0, width: Self.width, height: 60))
        wantsLayer = true
        isHidden = true

        said.font = NSFont.systemFont(ofSize: 13)
        said.textColor = Self.ink
        said.isSelectable = true
        said.drawsBackground = false
        saidScroll.documentView = said
        saidScroll.drawsBackground = false
        saidScroll.hasVerticalScroller = true
        saidScroll.autohidesScrollers = true
        saidScroll.borderType = .noBorder
        addSubview(saidScroll)

        input.font = NSFont.systemFont(ofSize: 13)
        input.textColor = Self.ink
        input.backgroundColor = Self.well
        input.drawsBackground = true
        input.isBordered = false
        input.focusRingType = .none
        input.usesSingleLineMode = false
        input.cell?.wraps = true
        input.cell?.isScrollable = false
        input.maximumNumberOfLines = 4
        input.delegate = self
        input.placeholderString = "Ask Alarmie…"
        addSubview(input)

        mic.bezelStyle = .regularSquare
        mic.isBordered = false
        mic.wantsLayer = true
        mic.layer?.backgroundColor = Self.ink.cgColor
        mic.contentTintColor = Self.paper
        mic.image = NSImage(systemSymbolName: "mic.fill", accessibilityDescription: "Speak")
        mic.toolTip = "Speak to Alarmie"
        mic.target = self
        mic.action = #selector(micPressed)
        addSubview(mic)

        close.bezelStyle = .regularSquare
        close.isBordered = false
        close.wantsLayer = true
        close.layer?.backgroundColor = Self.paper.cgColor
        close.layer?.borderColor = Self.ink.cgColor
        close.layer?.borderWidth = 2
        close.attributedTitle = NSAttributedString(string: "×", attributes: [.font: NSFont.boldSystemFont(ofSize: 13), .foregroundColor: Self.ink])
        close.setAccessibilityLabel("Close")
        close.target = self
        close.action = #selector(closePressed)
        addSubview(close)

        addSubview(dots)

        NotificationCenter.default.addObserver(self, selector: #selector(windowResigned), name: NSWindow.didResignKeyNotification, object: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override var isFlipped: Bool { true }

    var isOpen: Bool { phase != nil }

    /// Opens the bubble to type in, or (open already) puts the cursor back in it.
    func open() {
        closeTimer?.invalidate()
        if phase == nil {
            conversation = nil
            said.stringValue = ""
            input.stringValue = ""
            errored = false
            setPhase(.listen)
        }
        onKeyboard(true)
        if phase != .think { focusInput() }
    }

    /// Puts the bubble away; the talk is over.
    func closeBubble() {
        guard phase != nil else { return }
        closeTimer?.invalidate()
        dictation.cancel()
        setRecording(false)
        asking += 1
        window?.makeFirstResponder(nil)
        setPhase(nil)
        onKeyboard(false)
    }

    /// Keeps it beside his head as he moves: its tail at `head` (above him) or `feet` (below
    /// him, when there's no room above), slid along to stay on the screen inside `area`.
    func place(head: NSPoint, feet: NSPoint, area: NSRect) {
        guard phase != nil else { return }
        let h = frame.height
        below = head.y - h - 10 < area.minY + 8
        tip = below ? feet : head
        var x = tip.x - Self.width / 2
        x = Swift.min(Swift.max(x, area.minX + 8), area.maxX - 8 - Self.width)
        let y = below ? tip.y + 10 : tip.y - h - 10
        let origin = NSPoint(x: x.rounded(), y: y.rounded())
        if origin != frame.origin {
            setFrameOrigin(origin)
            needsDisplay = true
        }
    }

    // MARK: - Layout and drawing

    private func layoutParts() {
        let pad: CGFloat = 10
        let inner = Self.width - pad * 2
        var y: CGFloat = 8
        saidScroll.isHidden = phase != .answer
        dots.isHidden = phase != .think
        input.isHidden = phase == .think
        mic.isHidden = phase == .think
        if phase == .answer {
            said.preferredMaxLayoutWidth = inner - 14
            let size = said.sizeThatFits(NSSize(width: inner - 14, height: .greatestFiniteMagnitude))
            let maxH = (NSScreen.main?.visibleFrame.height ?? 800) * 0.4
            let h = Swift.min(size.height, maxH)
            said.frame = NSRect(x: 0, y: 0, width: inner - 14, height: size.height)
            saidScroll.frame = NSRect(x: pad, y: y, width: inner, height: h)
            y += h + 6
        }
        if phase == .think {
            dots.frame = NSRect(x: pad, y: y, width: 40, height: 14)
            y += 18
        } else {
            let fit = input.sizeThatFits(NSSize(width: inner - 32, height: 96))
            let h = Swift.min(96, Swift.max(22, fit.height + 6))
            input.frame = NSRect(x: pad, y: y, width: inner - 32, height: h)
            mic.frame = NSRect(x: pad + inner - 26, y: y + h - 26, width: 26, height: 26)
            y += h
        }
        let height = y + 8
        close.frame = NSRect(x: Self.width - 9, y: -9, width: 18, height: 18)
        if abs(frame.height - height) > 0.5 {
            // Grows upwards over his head, downwards under him.
            let top = below ? frame.minY : frame.maxY - height
            frame = NSRect(x: frame.minX, y: top, width: Self.width, height: height)
            onChange()
        }
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        let body = bounds.insetBy(dx: 2, dy: 2)
        Self.ink.setFill()
        NSRect(x: body.minX, y: body.minY - 2, width: body.width, height: body.height + 4).fill()
        NSRect(x: body.minX - 2, y: body.minY, width: body.width + 4, height: body.height).fill()
        Self.paper.setFill()
        body.fill()
    }

    /// Draws the tail into the superview's space: called by the pet view after it lays out.
    var tailRect: NSRect {
        let x = Swift.min(Swift.max(tip.x, frame.minX + 12), frame.maxX - 12)
        return below ? NSRect(x: x - 3, y: frame.minY - 8, width: 6, height: 8) : NSRect(x: x - 3, y: frame.maxY, width: 6, height: 8)
    }

    // MARK: - Phases

    private func setPhase(_ next: TalkPhase?) {
        phase = next
        isHidden = next == nil
        input.isEnabled = next != .think
        mic.isEnabled = next != .think
        input.placeholderString = next == .answer ? "Reply…" : "Ask Alarmie…"
        said.textColor = errored ? Self.errorInk : Self.ink
        if next == .think { dots.start() } else { dots.stop() }
        onPhase(next)
        layoutParts()
        onChange()
    }

    private func focusInput() {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.phase != nil, self.phase != .think else { return }
            self.window?.makeFirstResponder(self.input)
        }
    }

    // MARK: - Typing

    func controlTextDidChange(_ obj: Notification) { layoutParts() }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
        if selector == #selector(NSResponder.cancelOperation(_:)) {
            // Escape while speaking stops without sending; otherwise it puts the bubble away.
            if dictation.running {
                dictation.cancel()
                setRecording(false)
            } else {
                closeBubble()
            }
            return true
        }
        if selector == #selector(NSResponder.insertNewline(_:)) {
            if NSApp.currentEvent?.modifierFlags.contains(.shift) == true {
                textView.insertNewlineIgnoringFieldEditor(nil)
                return true
            }
            if dictation.running { dictation.stop() }
            send()
            return true
        }
        return false
    }

    @objc private func closePressed() { closeBubble() }

    @objc private func windowResigned(_ note: Notification) {
        guard note.object as? NSWindow === window, phase != nil else { return }
        // Gone to another app. A box with nothing typed in it goes away; anything typed waits
        // for you to come back to it; an answer stays up long enough to read.
        if dictation.running { return }
        if phase == .listen && input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { closeBubble() }
        else if phase == .answer { closeAfterReading() }
    }

    private func closeAfterReading() {
        closeTimer?.invalidate()
        let seconds = Swift.min(Self.readMax, Swift.max(Self.readMin, Double(said.stringValue.count) * Self.readPerChar))
        closeTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            guard let self, self.phase == .answer, self.window?.isKeyWindow != true else { return }
            self.closeBubble()
        }
    }

    // MARK: - The mic

    @objc private func micPressed() {
        if dictation.running {
            dictation.stop()
            return
        }
        Dictation.prepare { [weak self] problem in
            guard let self, self.phase != nil, self.phase != .think else { return }
            if let problem {
                self.showError(problem)
                return
            }
            let before = self.input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            self.setRecording(true)
            self.dictation.start(words: { [weak self] heard in
                guard let self else { return }
                self.input.stringValue = before.isEmpty ? heard : before + " " + heard
                self.layoutParts()
            }, ended: { [weak self] problem in
                guard let self else { return }
                self.setRecording(false)
                if let problem { self.showError(problem) }
            })
        }
    }

    private func setRecording(_ on: Bool) {
        mic.layer?.backgroundColor = (on ? NSColor(srgbRed: 0xd2 / 255, green: 0x3a / 255, blue: 0x3a / 255, alpha: 1) : Self.ink).cgColor
        mic.setAccessibilityLabel(on ? "Stop listening" : "Speak")
        if phase != nil { input.placeholderString = on ? "Listening… press the mic again to stop" : phase == .answer ? "Reply…" : "Ask Alarmie…" }
        if on { focusInput() }
    }

    /// Something went wrong before Alarmie was even asked: said in the bubble, which stays open.
    private func showError(_ message: String) {
        guard let current = phase else { return }
        said.stringValue = message
        errored = true
        setPhase(current == .think ? .answer : (current == .listen ? .answer : current))
        focusInput()
    }

    // MARK: - Asking Alarmie

    private func send() {
        let text = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, phase != nil, phase != .think else { return }
        closeTimer?.invalidate()
        asking += 1
        let ask = asking
        errored = false
        said.stringValue = ""
        setPhase(.think)
        let conversation = self.conversation
        Task { [weak self] in
            guard let outcome = await self?.alarmie.send(text, conversationId: conversation) else { return }
            await MainActor.run {
                guard let self, ask == self.asking, self.phase == .think else { return }
                switch outcome {
                case let .reply(reply, id):
                    self.conversation = id ?? self.conversation
                    self.said.stringValue = reply
                    self.input.stringValue = ""
                    self.errored = false
                case let .failed(message):
                    // What you typed stays in the box, to send again.
                    self.said.stringValue = message
                    self.errored = true
                }
                self.setPhase(.answer)
                if self.window?.isKeyWindow == true { self.focusInput() } else { self.closeAfterReading() }
            }
        }
    }
}

/// Three dots bobbing, while Alarmie thinks.
private final class ThinkingDots: NSView {
    private var layersMade = false

    func start() {
        wantsLayer = true
        guard let layer, !layersMade else { return }
        layersMade = true
        for i in 0..<3 {
            let dot = CALayer()
            dot.backgroundColor = NSColor(srgbRed: 0x2b / 255, green: 0x26 / 255, blue: 0x30 / 255, alpha: 1).cgColor
            dot.frame = CGRect(x: CGFloat(i) * 11, y: 4, width: 6, height: 6)
            let bob = CAKeyframeAnimation(keyPath: "opacity")
            bob.values = [0.3, 1, 0.3, 0.3]
            bob.keyTimes = [0, 0.4, 0.8, 1]
            bob.duration = 1
            bob.repeatCount = .infinity
            bob.beginTime = CACurrentMediaTime() + Double(i) * 0.15
            dot.add(bob, forKey: "bob")
            layer.addSublayer(dot)
        }
    }

    func stop() {}
}
