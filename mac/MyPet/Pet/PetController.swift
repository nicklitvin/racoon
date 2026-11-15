import AppKit
import Combine
import PetCore

/// Glue between the pet's logic (brain, animator, trackers, toy box) and the screen
/// (src/runtime/petRuntime.ts, toyLayer.ts and deskLayer.ts). Owns the pet's window and the
/// animation loop: every frame while anything moves, and a slow timer while he rests, so an
/// idle pet costs almost no CPU.
final class PetController {
    private let store: SettingsStore
    private let alarmie: AlarmieService
    private let panel: PetPanel
    private let view: PetView
    private var renderer: PetRenderer
    private var rendererType: PetType
    private var dressed = UNDRESSED
    private let brain: Brain
    private let animator = Animator(ANIMATIONS)
    private let cursorTracker = CursorActivityTracker()
    private let typingTracker = TypingActivityTracker()
    private var clickThrough: ClickThroughController!
    private let toybox = Toybox()
    private var settings: Settings
    private var subscriptions = Set<AnyCancellable>()

    /// The screen: its frame (screen coordinates), and the work area in page coordinates.
    private var screenFrame = NSRect.zero
    private var workArea = Rect(x: 0, y: 0, width: 0, height: 0)
    private var dpr: Double = 2

    private var cursor: Pt?
    private var lastHover: Pt?
    /// Brain-facing size: the part of the drawing above the feet.
    private var size = Size(width: 0, height: 0)
    /// How far the drawing reaches below the feet, in px.
    private var belowFeet = 0.0
    private var scale = 1.0
    private var lastDrawn = ""
    private var lastSaid: String?
    private var lastHidden = false
    /// Ground direction; starts three-quarters towards you.
    private var heading = 0.6
    private var headingTarget = 0.6
    private var snap: PetSnapshot?
    private var desk: Desk?

    private let petLayer = Imaging.pixelLayer()
    private var toyItems: [Int: ToyItem] = [:]
    private var deskDrawing: DeskDrawing?
    private let deskLayer = Imaging.pixelLayer()
    private var deskKey = ""
    private var deskPlace: Pt?
    private var deskAt = Pt.zero
    private var deskPress: DeskPress?

    private var timer: Timer?
    private var cursorTimer: Timer?
    private var frontTimer: Timer?
    private var lastTick = 0.0
    private var running = false
    private var petDrag: PetDrag?
    private var toyDrag: ToyDrag?
    private let keyboardPulse: PassthroughSubject<Void, Never>

    /// Longest gap between ticks while nothing moves. Brain timers have this granularity.
    private static let maxRestMs = 250.0
    /// Pointer travel that turns a press into a drag rather than a click.
    private static let dragThreshold = 4.0
    /// Pointer travel over him that counts as stroking.
    private static let strokePx = 3.0
    /// Once lifted, how long he takes to slide round in your grip until you hold him by the scruff.
    private static let scruffSettleMs = 220.0
    /// Screen size (longer side, px) that activity thresholds are tuned for.
    private static let referenceScreen = 1600.0
    /// The pointer catches his eye within this distance.
    private static let gazeRadius = 420.0
    /// Pet scale on screens much narrower than a desktop.
    private static let smallScreenScale = 0.8
    /// How many toy blocks lie about, and their size for drawings that don't say.
    private static let toyCount = 3
    private static let toySizeDefault = 16.0
    /// Picked up, a block is held this far above the floor (px).
    private static let toyLift = 26.0
    private static let toyDragPx = 3.0
    private static let flingWindowMs = 90.0
    private static let maxThrow = 1500.0
    /// Pointer travel that turns a press on the desk into picking it up, rather than a tap.
    private static let deskTapPx = 6.0
    /// Gap between the desk and the edges of the screen.
    private static let deskMargin = 18.0

    private struct PetDrag {
        var offset: Pt
        var start: Pt
        var pointer: Pt
        var moved: Bool
        var liftedAt: Double
    }

    private struct ToyDrag {
        var id: Int
        var start: Pt
        var moved: Bool
        var samples: [(t: Double, p: Pt)]
    }

    private struct DeskPress {
        var start: Pt
        var offset: Pt
        var lifted: Bool
    }

    private final class ToyItem {
        let drawing: ToyDrawing
        let shadow = CAShapeLayer()
        let block = Imaging.pixelLayer()
        init(face: Int) { drawing = ToyDrawing(face: face) }
    }

    init(store: SettingsStore, alarmie: AlarmieService, keyboardPulse: PassthroughSubject<Void, Never>) {
        self.store = store
        self.alarmie = alarmie
        self.keyboardPulse = keyboardPulse
        settings = store.settings
        rendererType = settings.raccoonType
        renderer = createPet(rendererType)
        let screen = NSScreen.screens.first ?? NSScreen.main!
        panel = PetPanel(frame: screen.frame)
        let talk = TalkBubbleView(alarmie: alarmie)
        view = PetView(frame: NSRect(origin: .zero, size: screen.frame.size), talk: talk)
        panel.contentView = view
        // Placeholder until the first layout says where the screen is.
        brain = Brain(WorldInput(bounds: Rect(x: 0, y: 0, width: screen.frame.width, height: screen.frame.height), size: Size(width: 100, height: 100)), toys: toybox)
        view.controller = self
        clickThrough = ClickThroughController { [weak self] on in self?.setInteractive(on) }
        view.sprites.root.addSublayer(deskLayer)
        view.sprites.root.addSublayer(petLayer)
        deskLayer.isHidden = true
        petLayer.zPosition = 2

        talk.onPhase = { [weak self] phase in
            self?.brain.talk(phase)
            self?.wake()
        }
        talk.onKeyboard = { [weak self] on in self?.setTalking(on) }
        talk.onChange = { [weak self] in
            guard let self else { return }
            if let cursor = self.cursor { self.updateHover(cursor) }
            self.view.placeTail()
            self.wake()
        }

        renderer.dress(Dress(hat: settings.hat, outfit: settings.outfit))
        dressed = Dress(hat: settings.hat, outfit: settings.outfit)
        animator.setSpecs(specsFor(renderer))
        layout()

        store.$settings.dropFirst().receive(on: DispatchQueue.main).sink { [weak self] in self?.setSettings($0) }.store(in: &subscriptions)
        keyboardPulse.receive(on: DispatchQueue.main).sink { [weak self] in self?.keyPulse() }.store(in: &subscriptions)
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            self?.layout()
            self?.wake()
        }
    }

    func start() {
        guard !running else { return }
        running = true
        panel.orderFrontRegardless()
        lastTick = now()
        // The pointer, 40 times a second: where it is says when to catch the mouse, and what he does.
        cursorTimer = Timer(timeInterval: 1.0 / 40, repeats: true) { [weak self] _ in self?.pollCursor() }
        RunLoop.main.add(cursorTimer!, forMode: .common)
        // Back in front now and then, over anything that put itself on top since.
        frontTimer = Timer(timeInterval: 3, repeats: true) { [weak self] _ in self?.panel.orderFrontRegardless() }
        RunLoop.main.add(frontTimer!, forMode: .common)
        requestFrame()
    }

    func stop() {
        running = false
        timer?.invalidate()
        cursorTimer?.invalidate()
        frontTimer?.invalidate()
        view.talk.closeBubble()
        panel.orderOut(nil)
    }

    private func now() -> Double { CACurrentMediaTime() * 1000 }

    // MARK: - Settings and the screen

    private func setSettings(_ next: Settings) {
        settings = next
        if !next.alarmieChat { view.talk.closeBubble() }
        if !next.keyboardReactions { typingTracker.reset() }
        applySettings()
        syncToys()
        syncDesk()
        wake()
    }

    /// Swaps in the drawing for the chosen pet, in what he's wearing. Behaviour carries on untouched.
    private func applySettings() {
        let dress = Dress(hat: settings.hat, outfit: settings.outfit)
        if settings.raccoonType == rendererType {
            if dress != dressed {
                dressed = dress
                renderer.dress(dress)
                lastDrawn = ""
            }
            return
        }
        renderer = createPet(settings.raccoonType)
        rendererType = settings.raccoonType
        dressed = dress
        renderer.dress(dress)
        animator.setSpecs(specsFor(renderer))
        lastDrawn = ""
        applyScale()
        syncDesk()
    }

    /// Fits the window to the main screen, and everything in it to the work area (the screen
    /// less the menu bar and the Dock, whose top edge is his floor).
    private func layout() {
        let screen = NSScreen.screens.first ?? NSScreen.main!
        screenFrame = screen.frame
        dpr = Double(screen.backingScaleFactor)
        panel.setFrame(screenFrame, display: true)
        view.frame = NSRect(origin: .zero, size: screenFrame.size)
        let visible = screen.visibleFrame
        workArea = Rect(x: visible.minX - screenFrame.minX, y: screenFrame.maxY - visible.maxY, width: visible.width, height: visible.height)
        let longest = Swift.max(workArea.width, workArea.height)
        cursorTracker.setSensitivity(Swift.min(3, Swift.max(1, Self.referenceScreen / longest)))
        applyScale()
        // Toys lie on the same floor he walks on, low enough on it for him to reach.
        let top = Swift.min(size.height * 0.6, workArea.height / 2)
        toybox.setBounds(Rect(x: workArea.x, y: workArea.y + top, width: workArea.width, height: workArea.height - top))
        syncToys()
        syncDesk()
    }

    private func applyScale() {
        scale = workArea.width < 600 ? Self.smallScreenScale : 1
        renderer.setScale(scale, devicePixelRatio: dpr)
        let base = renderer.baseSize
        let anchor = renderer.anchor
        let height = base.height * scale
        size = Size(width: base.width * scale, height: height * anchor.y)
        belowFeet = height * (1 - anchor.y)
        let toySize = (renderer.toySize ?? Self.toySizeDefault) * scale
        if abs(toySize - toybox.size) > 0.01 {
            toybox.size = toySize
            // Drawn again at the new size.
            for item in toyItems.values {
                item.block.removeFromSuperlayer()
                item.shadow.removeFromSuperlayer()
            }
            toyItems.removeAll()
        }
        lastDrawn = ""
    }

    /// Puts the toy blocks out in play mode, and tidies them away otherwise.
    private func syncToys() {
        if settings.mode != .play {
            toybox.clear()
            renderToys(snap?.position ?? .zero)
            return
        }
        if !toybox.toys.isEmpty { return }
        // Scattered on the floor near where he starts out, at the bottom in the middle.
        let b = toybox.bounds
        let middle = b.x + b.width / 2
        let bottom = b.y + b.height
        let spots = [Pt(x: middle - 150, y: bottom - 40), Pt(x: middle + 120, y: bottom - 70), Pt(x: middle + 175, y: bottom - 22)]
        for i in 0..<Self.toyCount { toybox.add(i, spots[i % spots.count]) }
    }

    // MARK: - Input

    private func pollCursor() {
        let mouse = NSEvent.mouseLocation
        let p: Pt? = screenFrame.contains(mouse) ? Pt(x: Double(mouse.x - screenFrame.minX), y: Double(screenFrame.maxY - mouse.y)) : nil
        if p == cursor && p != nil { return }
        let t = now()
        cursor = p
        cursorTracker.addSample(t, p)
        if let p { updateHover(p) } else { clickThrough.pointerLeft() }
        // While resting we tick slowly; wake up early only when the cursor matters right now.
        if isResting(), let p, cursorTracker.isFrantic(t) || isNearPet(p, DEFAULT_CONFIG.reactions.fleeRadius * 1.5) { wake() }
    }

    private func keyPulse() {
        guard settings.keyboardReactions else { return }
        typingTracker.keyDown(now())
        animator.keystroke()
        if snap?.animation == .peek { wake() }
    }

    func mouseMoved(to p: NSPoint) { updateHover(Pt(x: Double(p.x), y: Double(p.y))) }

    func mouseDown(at point: NSPoint, time: Double) {
        let p = Pt(x: Double(point.x), y: Double(point.y))
        // A block (in front of everything else when you have it).
        if let id = toyAt(p), toybox.hold(id, .user) {
            toyDrag = ToyDrag(id: id, start: p, moved: false, samples: [(time, p)])
            carryToy(p)
            clickThrough.dragStarted()
            wake()
            return
        }
        // Him.
        if let rect = hitRect(), pointInRect(p, inflate(rect, 6)), let snap {
            let feet = snap.position
            petDrag = PetDrag(offset: Pt(x: p.x - feet.x, y: p.y - feet.y), start: p, pointer: p, moved: false, liftedAt: 0)
            clickThrough.dragStarted()
            return
        }
        // His desk.
        if let rect = deskRect(), pointInRect(p, rect) {
            deskPress = DeskPress(start: p, offset: Pt(x: deskAt.x - p.x, y: deskAt.y - p.y), lifted: false)
            clickThrough.dragStarted()
        }
    }

    func mouseDragged(to point: NSPoint, time: Double) {
        let p = Pt(x: Double(point.x), y: Double(point.y))
        if var drag = toyDrag {
            if hypot(p.x - drag.start.x, p.y - drag.start.y) >= Self.toyDragPx { drag.moved = true }
            drag.samples.append((time, p))
            while drag.samples.count > 2 && time - drag.samples[0].t > Self.flingWindowMs { drag.samples.removeFirst() }
            toyDrag = drag
            carryToy(p)
            wake()
            return
        }
        if var drag = petDrag {
            drag.pointer = p
            if !drag.moved && hypot(p.x - drag.start.x, p.y - drag.start.y) >= Self.dragThreshold {
                drag.moved = true
                drag.liftedAt = now()
                brain.grab()
            }
            petDrag = drag
            if drag.moved {
                dragToPointer(now())
                wake()
            }
            return
        }
        if var press = deskPress {
            if !press.lifted {
                if hypot(p.x - press.start.x, p.y - press.start.y) <= Self.deskTapPx { return }
                press.lifted = true
                brain.deskLifted()
                wake()
            }
            deskPress = press
            deskPlace = Pt(x: p.x + press.offset.x, y: p.y + press.offset.y)
            syncDesk()
            wake()
        }
    }

    func mouseUp(at point: NSPoint, time: Double) {
        let p = Pt(x: Double(point.x), y: Double(point.y))
        if let drag = toyDrag {
            toyDrag = nil
            if !drag.moved {
                // A click: it flips up into the air and tumbles over.
                let way: Double = Bool.random() ? -1 : 1
                toybox.release(drag.id, .user, Velocity3(x: 0, y: 0, z: 0))
                toybox.hit(drag.id, Velocity3(x: way * 40, y: 0, z: 460), way * 360, .user)
            } else {
                let first = drag.samples[0]
                let dt = Swift.max(16, time - first.t) / 1000
                var vx = (p.x - first.p.x) / dt
                var vy = (p.y - first.p.y) / dt
                let speed = hypot(vx, vy)
                if speed > Self.maxThrow {
                    vx *= Self.maxThrow / speed
                    vy *= Self.maxThrow / speed
                }
                // Flung up the screen it goes up into the air; down the screen, it skims along the floor towards you.
                let v = vy < 0 ? Velocity3(x: vx, y: vy * 0.2, z: 120 - vy * 0.85) : Velocity3(x: vx, y: vy * 0.7, z: 120)
                toybox.release(drag.id, .user, v, vx * 0.9)
            }
            brain.toyThrown(drag.id)
            clickThrough.dragEnded(p, grabRects())
            wake()
            return
        }
        if let drag = petDrag {
            petDrag = nil
            if drag.moved {
                brain.release()
            } else if view.talk.isOpen || (settings.alarmieChat && alarmie.status.available) {
                // A click with the Alarmie chat on: his bubble opens to talk to Alarmie through him
                // (or, open already, takes the keyboard back).
                view.talk.open()
            } else {
                brain.poke()
            }
            wake()
            clickThrough.dragEnded(p, grabRects())
            return
        }
        if let press = deskPress {
            deskPress = nil
            if press.lifted {
                // Where it ended up, kept on the screen.
                deskPlace = deskAt
                brain.deskDropped()
            } else {
                brain.deskTapped()
                // A little jolt, so you can see it felt the tap.
                let jolt = CABasicAnimation(keyPath: "position.y")
                jolt.byValue = -2
                jolt.duration = 0.1
                jolt.autoreverses = true
                deskLayer.add(jolt, forKey: "tap")
            }
            clickThrough.dragEnded(p, grabRects())
            wake()
        }
    }

    /// Carries him with the pointer. Lifted, he's always held by the scruff: wherever you
    /// grabbed him, he slides round in your grip until the scruff is under the pointer.
    private func dragToPointer(_ t: Double) {
        guard let drag = petDrag, drag.moved else { return }
        var offset = drag.offset
        if let hold = renderer.holdPoint() {
            let u = Swift.min(1, (t - drag.liftedAt) / Self.scruffSettleMs)
            let k = u * u * (3 - 2 * u)
            offset = Pt(x: drag.offset.x + (hold.x - drag.offset.x) * k, y: drag.offset.y + (hold.y - drag.offset.y) * k)
        }
        brain.dragTo(Pt(x: drag.pointer.x - offset.x, y: drag.pointer.y - offset.y))
    }

    /// Holds the block with its middle under the pointer, its shadow on the floor below.
    private func carryToy(_ p: Pt) {
        guard let drag = toyDrag else { return }
        toybox.moveHeld(drag.id, Pt(x: p.x, y: p.y + toybox.size / 2 + Self.toyLift), Self.toyLift)
    }

    /// Everything on the page you can pick up or tap: him, his toys, his desk, and his bubble.
    private func grabRects() -> [Rect] {
        var out: [Rect] = []
        if let rect = hitRect() { out.append(rect) }
        out.append(contentsOf: toyRects().map(\.rect))
        if let desk = deskRect() { out.append(desk) }
        if view.talk.isOpen {
            let f = view.talk.frame.insetBy(dx: -12, dy: -12)
            out.append(Rect(x: Double(f.minX), y: Double(f.minY), width: Double(f.width), height: Double(f.height)))
        }
        return out
    }

    private func updateHover(_ p: Pt) {
        let rect = hitRect()
        let targets = grabRects()
        // Nothing to grab (he's hidden behind an edge, and no toys): never hold the mouse.
        if !targets.isEmpty { clickThrough.pointerMoved(p, targets) } else { clickThrough.pointerLeft() }
        // Stroking him after a pat (the pointer moving over him) keeps him purring.
        let last = lastHover
        lastHover = p
        if let rect, pointInRect(p, rect), let last, petDrag == nil, hypot(p.x - last.x, p.y - last.y) >= Self.strokePx { brain.stroke() }
    }

    private func setInteractive(_ on: Bool) {
        if on { panel.orderFrontRegardless() }
        panel.ignoresMouseEvents = !on
    }

    /// The bubble opened (it needs the keyboard) or closed (it lets it go).
    private func setTalking(_ on: Bool) {
        panel.allowsKey = on && settings.alarmieChat
        if panel.allowsKey {
            panel.makeKeyAndOrderFront(nil)
        } else if panel.isKeyWindow {
            panel.resignKey()
        }
    }

    // MARK: - The loop

    private func tick() {
        timer = nil
        guard running else { return }
        let t = now()
        let dt = t - lastTick
        lastTick = t

        cursorTracker.evaluate(t)
        typingTracker.evaluate(t)
        // The scruff moves as he settles into hanging, even with the pointer still.
        dragToPointer(t)
        let snap = brain.update(dt, worldInput(t))
        self.snap = snap
        animator.play(snap.animation)
        animator.update(dt)
        headingTarget = targetHeading(heading, HeadingInput(velocity: snap.velocity, facing: snap.facing, animation: snap.animation, aim: snap.aim))
        heading = turnTowards(heading, headingTarget, dt)
        render(snap, t)
        carryHeldToy(snap)
        renderToys(snap.position)
        // Picked up, or gone off the screen, he's stopped talking: the bubble goes.
        if view.talk.isOpen && brain.talking == nil { view.talk.closeBubble() }
        if let cursor { updateHover(cursor) }
        schedule()
    }

    private func schedule() {
        guard running else { return }
        if isResting() {
            let delay = Swift.min(Self.maxRestMs, Swift.max(16, animator.msUntilChange()))
            setTimer(delay / 1000)
        } else {
            requestFrame()
        }
    }

    private func requestFrame() {
        if timer == nil { setTimer(1.0 / 60) }
    }

    private func setTimer(_ seconds: Double) {
        timer?.invalidate()
        let t = Timer(timeInterval: seconds, repeats: false) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    /// Switches from the slow resting timer back to per-frame updates.
    private func wake() {
        guard running else { return }
        if let timer, timer.fireDate.timeIntervalSinceNow <= 1.0 / 60 { return }
        setTimer(1.0 / 60)
    }

    private func isResting() -> Bool {
        let turning = renderer.turnsItself && isTurning(heading, headingTarget)
        let toysStill = toybox.settled && toyDrag == nil && deskPress?.lifted != true
        return petDrag == nil && !turning && toysStill && !renderer.isSettling() && (snap?.resting ?? false)
    }

    private func worldInput(_ t: Double) -> WorldInput {
        WorldInput(
            bounds: workArea,
            size: size,
            cursor: cursor,
            cursorExcited: cursorTracker.isExcited(t),
            cursorStillMs: cursorTracker.stillFor(t),
            typingActive: settings.keyboardReactions && typingTracker.isActive,
            footroom: belowFeet,
            peekDepth: renderer.peekSink.map { $0 * scale },
            toyReach: renderer.toyReach.map { $0 * scale },
            carries: renderer.carriesToys,
            desk: desk,
            mode: settings.mode,
            goose: renderer.goose
        )
    }

    // MARK: - Drawing

    private func render(_ snap: PetSnapshot, _ t: Double) {
        let gaze: Pt?
        if let look = snap.lookAt { gaze = Pt(x: look.x - snap.position.x, y: look.y - snap.position.y) } else { gaze = gazeAt(snap.position) }
        let frame = PetFrame(animation: animator.animation, timeMs: animator.time, keystrokes: animator.keystrokes, eyes: animator.eyes, heading: heading, clockMs: t, velocity: snap.velocity, gaze: gaze)
        let key = "\(frame.animation)|\(frame.timeMs)|\(frame.keystrokes)|\(frame.eyes)|\(String(format: "%.3f", heading))"
        if key != lastDrawn || renderer.isSettling() {
            if renderer.draw(frame), let image = Imaging.image(of: renderer) { petLayer.contents = image }
            lastDrawn = key
        }

        // Pixel art sits on whole screen pixels, so it stays crisp.
        let cell = renderer.cell
        let w = Double(renderer.raster.width) * cell
        let h = Double(renderer.raster.height) * cell
        let anchor = renderer.anchor
        let x = jsRound((snap.position.x - anchor.x * w) * dpr) / dpr
        let y = jsRound((snap.position.y - anchor.y * h) * dpr) / dpr
        let rect = CGRect(x: x, y: y, width: w, height: h)
        // Clipped to the work area, as the page's stage clips him past its edges.
        petLayer.frame = view.sprites.layerRect(rect)
        petLayer.isHidden = snap.hidden
        lastHidden = snap.hidden

        if let drawing = deskDrawing, drawing.show(snap.screen.map { DeskApp(rawValue: $0.rawValue) ?? .idle } ?? .idle, t) {
            deskLayer.contents = Imaging.image(of: drawing.art)
        }
        setDeskDepth(snap.position)

        // His speech bubble, over his head.
        let head = NSPoint(x: rect.midX, y: rect.minY + rect.height * 0.12)
        if snap.say != lastSaid {
            view.speech.say(snap.say, tip: head)
            lastSaid = snap.say
        } else {
            view.speech.move(tip: head)
        }
        // His Alarmie bubble, over his head or under his feet.
        if view.talk.isOpen {
            let screen = NSRect(x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height)
            view.talk.place(head: head, feet: NSPoint(x: rect.midX, y: rect.minY + rect.height * anchor.y + 4), area: screen)
            view.placeTail()
        }
    }

    /// A toy block in his mouth or hands goes where the drawing says they are.
    private func carryHeldToy(_ snap: PetSnapshot) {
        guard let toy = toybox.heldBy(.pet) else { return }
        let at = renderer.toyPoint() ?? Pt(x: snap.facing * size.width * 0.3, y: -size.height * 0.4)
        let floor = snap.position.y + 1
        let bottom = snap.position.y + at.y + toybox.size / 2
        toybox.moveHeld(toy.id, Pt(x: snap.position.x + at.x, y: floor), floor - bottom)
    }

    /// Places every block, given where the pet's feet are.
    private func renderToys(_ petFeet: Pt) {
        let present = Set(toybox.toys.map(\.id))
        for (id, item) in toyItems where !present.contains(id) {
            item.block.removeFromSuperlayer()
            item.shadow.removeFromSuperlayer()
            toyItems[id] = nil
        }
        let s = toybox.size
        for toy in toybox.toys {
            let item = toyItems[toy.id] ?? addToy(toy)
            // Nearer you than the pet, it's in front of him; in his mouth or your hand, always.
            let front = toy.holder != nil || toy.y >= petFeet.y - 2
            let z: CGFloat = toy.holder == .user ? 4 : front ? 3 : 1
            let air = Swift.min(1, toy.z / 160)
            let shadowSize = CGSize(width: s * 1.15 * (1 - air * 0.55), height: s * 0.42 * (1 - air * 0.55))
            item.shadow.frame = view.sprites.layerRect(CGRect(x: toy.x - shadowSize.width / 2, y: toy.y - shadowSize.height / 2, width: shadowSize.width, height: shadowSize.height))
            item.shadow.path = hexagon(item.shadow.bounds.size)
            item.shadow.opacity = Float(1 - air * 0.6)
            item.shadow.zPosition = z - 0.5
            let box = s * TOY_BOX
            item.block.frame = view.sprites.layerRect(CGRect(x: toy.x - box / 2, y: toy.y - toy.z - s / 2 - box / 2, width: box, height: box))
            item.block.zPosition = z
            if item.drawing.draw(toy.angle) { item.block.contents = Imaging.image(of: item.drawing.art) }
        }
    }

    private func addToy(_ toy: Toy) -> ToyItem {
        let item = ToyItem(face: toy.face)
        item.shadow.fillColor = NSColor(srgbRed: 20 / 255, green: 16 / 255, blue: 30 / 255, alpha: 0.22).cgColor
        item.shadow.actions = Imaging.noAnimations.merging(["path": NSNull() as CAAction]) { $1 }
        view.sprites.root.addSublayer(item.shadow)
        view.sprites.root.addSublayer(item.block)
        item.drawing.draw(toy.angle)
        item.block.contents = Imaging.image(of: item.drawing.art)
        toyItems[toy.id] = item
        return item
    }

    /// A pixel shadow: a flat hexagon.
    private func hexagon(_ size: CGSize) -> CGPath {
        let w = size.width, h = size.height
        let path = CGMutablePath()
        path.addLines(between: [CGPoint(x: w * 0.15, y: 0), CGPoint(x: w * 0.85, y: 0), CGPoint(x: w, y: h / 2), CGPoint(x: w * 0.85, y: h), CGPoint(x: w * 0.15, y: h), CGPoint(x: 0, y: h / 2)])
        path.closeSubpath()
        return path
    }

    /// The blocks on screen (page coordinates), for deciding when to take the mouse.
    private func toyRects() -> [(id: Int, rect: Rect)] {
        let s = toybox.size
        return toybox.toys.map { toy in
            let box = s * TOY_BOX
            let r = Rect(x: toy.x - box / 2, y: toy.y - toy.z - s / 2 - box / 2, width: box, height: box)
            return (toy.id, Rect(x: r.x + r.width * 0.15, y: r.y + r.height * 0.15, width: r.width * 0.7, height: r.height * 0.7))
        }
    }

    /// The block under the pointer, nearest you first.
    private func toyAt(_ p: Pt) -> Int? {
        let byDepth = toybox.toys.sorted { ($0.holder != nil ? 1 : 0, $0.y) > ($1.holder != nil ? 1 : 0, $1.y) }
        let rects = Dictionary(uniqueKeysWithValues: toyRects().map { ($0.id, $0.rect) })
        return byDepth.first { rects[$0.id].map { pointInRect(p, $0) } ?? false }?.id
    }

    /// The pointer relative to his feet, when it's near enough to catch his eye.
    private func gazeAt(_ feet: Pt) -> Pt? {
        guard let c = cursor else { return nil }
        let dx = c.x - feet.x, dy = c.y - feet.y
        return hypot(dx, dy) < Self.gazeRadius ? Pt(x: dx, y: dy) : nil
    }

    /// The visible part of the pet: the drawn figure, clipped to the work area.
    private func hitRect() -> Rect? {
        if lastHidden { return nil }
        guard let figure = renderer.figure else { return nil }
        let f = view.sprites.layerRect(petLayer.frame)
        let cell = renderer.cell
        let left = Swift.max(Double(f.minX) + figure.x0 * cell, workArea.x)
        let top = Swift.max(Double(f.minY) + figure.y0 * cell, workArea.y)
        let right = Swift.min(Double(f.minX) + figure.x1 * cell, workArea.x + workArea.width)
        let bottom = Swift.min(Double(f.minY) + figure.y1 * cell, workArea.y + workArea.height)
        if right <= left || bottom <= top { return nil }
        return Rect(x: left, y: top, width: right - left, height: bottom - top)
    }

    private func isNearPet(_ p: Pt, _ radius: Double) -> Bool {
        guard let rect = hitRect() else { return false }
        let cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2
        return hypot(p.x - cx, p.y - cy) < radius + Swift.max(rect.width, rect.height) / 2
    }

    // MARK: - The desk

    /// Puts his desk out in work mode, built to fit him, or puts it away.
    private func syncDesk() {
        guard settings.mode == .work else {
            if deskPress?.lifted == true { brain.deskDropped() }
            deskPress = nil
            deskDrawing = nil
            deskKey = ""
            deskLayer.isHidden = true
            desk = nil
            return
        }
        let reach = renderer.deskReach ?? Pt(x: size.width * 0.3, y: -size.height * 0.35)
        let mouse = renderer.mouseReach ?? Pt(x: reach.x + size.height * 0.15, y: reach.y)
        let r = Pt(x: reach.x * scale, y: reach.y * scale)
        let m = Pt(x: mouse.x * scale, y: mouse.y * scale)
        let pixel = PIXEL_PX * scale
        let unit = size.height
        let key = String(format: "%.1f|%.1f|%.1f|%.1f|%.3f", unit, r.x, r.y, m.x, pixel)
        if key != deskKey || deskDrawing == nil {
            deskKey = key
            let drawing = DeskDrawing(unit: unit, keysTop: -r.y, mouseDx: m.x - r.x, pixel: pixel)
            drawing.show(.idle, now())
            deskDrawing = drawing
            deskLayer.contents = Imaging.image(of: drawing.art)
        }
        desk = putDesk(reach: r, unit: unit)
    }

    /// Stands it where you put it (kept on the screen, with room for him at it), or in its
    /// bottom right corner; says where he sits at it there.
    private func putDesk(reach: Pt, unit: Double) -> Desk? {
        guard let d = deskDrawing else { return nil }
        let b = workArea
        let floor = b.y + b.height - belowFeet
        let corner = Pt(x: b.x + b.width - Self.deskMargin - d.width, y: floor)
        let want = deskPlace ?? corner
        let minSeatX = b.x + size.width / 2
        let minLeft = Swift.max(b.x + Self.deskMargin, minSeatX - d.keyboardX + reach.x)
        let minFloor = b.y + Swift.max(d.height - d.below, unit) + Self.deskMargin
        let left = jsRound(Swift.min(Swift.max(want.x, minLeft), corner.x))
        let base = jsRound(Swift.min(Swift.max(want.y, minFloor), floor))
        deskAt = Pt(x: left, y: base)
        let top = base - d.height + d.below
        deskLayer.frame = view.sprites.layerRect(CGRect(x: left, y: top, width: d.width, height: d.height))
        deskLayer.isHidden = false
        let keys = left + d.keyboardX
        return Desk(seat: Pt(x: keys - reach.x, y: base), facing: 1, screen: Pt(x: left + d.screen.x, y: base - d.screen.y))
    }

    /// In front of him or behind, by which of them is nearer you; in your hand, in front of everything.
    private func setDeskDepth(_ petFeet: Pt) {
        guard deskDrawing != nil else { return }
        deskLayer.zPosition = deskPress?.lifted == true ? 4 : petFeet.y < deskAt.y - 3 ? 3 : 1
    }

    private func deskRect() -> Rect? {
        guard deskDrawing != nil, !deskLayer.isHidden else { return nil }
        let f = view.sprites.layerRect(deskLayer.frame)
        return Rect(x: Double(f.minX), y: Double(f.minY), width: Double(f.width), height: Double(f.height))
    }
}
