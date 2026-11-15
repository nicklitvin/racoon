import Foundation

// The pet's behaviour (src/core/behavior/brain.ts): a state machine plus a little motion. No
// AppKit, no timers: time only moves when `update` is called, and all randomness comes from
// the injected `random`, so tests are fully deterministic.
//
// He roams the whole screen; there is no floor and no gravity. Walks follow gently curved
// paths with eased speed, and everything else is velocity-based with limited acceleration, so
// he never teleports.

/// Top-level states of the behaviour state machine.
public enum Mode: String {
    case idle, walk, sit, sleep, react
}

/// What the pet is reacting to, while in the "react" mode.
public enum Reaction: String {
    case surprised, chase, pounce, confused, flee, hide, peek, dragged, petted, zoomies, play, nap, work, away, talk
}

/// Talking to Alarmie through him: listening while you type to it, thinking while it answers,
/// and saying its answer.
public enum TalkPhase: String {
    case listen, think, answer
}

/// Little symbol drawn above the pet's head. Only sleep shows one.
public enum Emote: String {
    case none = "", z
}

public struct Desk: Equatable {
    public var seat: Pt
    public var facing: Double
    public var screen: Pt
    public init(seat: Pt, facing: Double, screen: Pt) {
        self.seat = seat
        self.facing = facing
        self.screen = screen
    }
}

/// Everything the brain knows about the outside world, refreshed every tick.
public struct WorldInput {
    /// Where the pet may roam. He can walk anywhere inside it; peeking happens at its bottom edge.
    public var bounds: Rect
    /// Current sprite size in px.
    public var size: Size
    /// Cursor position, or nil when it's off this screen.
    public var cursor: Pt?
    /// The cursor has been moving fast or erratically for a while.
    public var cursorExcited = false
    /// How long since the cursor last moved, in ms.
    public var cursorStillMs = Double.infinity
    /// The user is in a sustained stretch of typing (opt-in feature).
    public var typingActive = false
    /// How far the drawing reaches below his feet, in px.
    public var footroom: Double?
    /// How far his feet go past the bottom edge while peeking.
    public var peekDepth: Double?
    /// How far in front of his feet a toy sits for him to swat it or pick it up, px.
    public var toyReach: Double?
    /// He can pick a toy up in his hands and walk off with it on his hind legs (a raccoon).
    public var carries = false
    /// His desk, in work mode.
    public var desk: Desk?
    /// What he's up to (from the settings).
    public var mode: PetMode = .play
    /// A goose, and a horrible one.
    public var goose = false

    public init(bounds: Rect, size: Size, cursor: Pt? = nil, cursorExcited: Bool = false, cursorStillMs: Double = .infinity, typingActive: Bool = false, footroom: Double? = nil, peekDepth: Double? = nil, toyReach: Double? = nil, carries: Bool = false, desk: Desk? = nil, mode: PetMode = .play, goose: Bool = false) {
        self.bounds = bounds
        self.size = size
        self.cursor = cursor
        self.cursorExcited = cursorExcited
        self.cursorStillMs = cursorStillMs
        self.typingActive = typingActive
        self.footroom = footroom
        self.peekDepth = peekDepth
        self.toyReach = toyReach
        self.carries = carries
        self.desk = desk
        self.mode = mode
        self.goose = goose
    }
}

public struct PetSnapshot {
    /// Feet position (bottom centre of the sprite).
    public var position: Pt
    public var velocity: Pt
    public var facing: Double
    public var mode: Mode
    public var reaction: Reaction?
    /// Sub-phase of multi-step reactions.
    public var phase: String?
    public var animation: AnimationName
    public var emote: Emote
    /// Nothing is moving; the caller can tick less often.
    public var resting: Bool
    /// Standing still, the way he wants to face on the floor (radians), or nil to leave it be.
    public var aim: Double?
    /// Something he's keeping his eyes on (a toy), screen px; nil to look at the pointer.
    public var lookAt: Pt?
    /// What he's saying, in a speech bubble, if anything.
    public var say: String?
    /// What's on his computer screen while he's at it (work mode), or nil for the screen saver.
    public var screen: DeskTask?
    /// Gone off the screen altogether (hide mode): nothing of him to draw.
    public var hidden: Bool
}

/// The state machine's state. One class holds the fields of every kind of state (as the
/// TypeScript's union does): only the ones for its mode and reaction mean anything.
final class BrainState {
    var mode: Mode
    var reaction: Reaction?
    var phase = ""
    var until = 0.0
    // walk
    var from = Pt.zero, via = Pt.zero, to = Pt.zero, elapsed = 0.0, duration = 0.0
    // sit
    var activity = "rest", then: Mode = .idle
    // surprised
    var next: Reaction = .confused
    // pounce, flee, zoomies, away
    var target = Pt.zero
    var dashes = 0
    // hide
    var edge = 1.0, targetX = 0.0, giveUpAt = 0.0
    // peek
    var sink = 0.0, begs = 0
    // petted, talk
    var resume: BrainState?
    // play
    var toy = 0, side = 1.0, started = 0.0, turns = 0
    var excited = false, done = false, mayPounce = false
    var landing: Pt?, landingAt = -Double.infinity
    var dest: Pt?
    var stalk = false, mayCharge = false, sniffed = false, nudges = 0, hook = false
    // work
    var task: DeskTask = .terminal, taskUntil = -1.0
    // nap
    var spot = Pt.zero, cross = 0.0, face = 1.0, cursorAt: Pt?

    init(_ mode: Mode, _ reaction: Reaction? = nil) {
        self.mode = mode
        self.reaction = reaction
    }

    func copy() -> BrainState {
        let s = BrainState(mode, reaction)
        s.phase = phase; s.until = until; s.from = from; s.via = via; s.to = to; s.elapsed = elapsed; s.duration = duration
        s.activity = activity; s.then = then; s.next = next; s.target = target; s.dashes = dashes; s.edge = edge; s.targetX = targetX
        s.giveUpAt = giveUpAt; s.sink = sink; s.begs = begs; s.resume = resume; s.toy = toy; s.side = side; s.started = started
        s.turns = turns; s.excited = excited; s.done = done; s.mayPounce = mayPounce; s.landing = landing; s.landingAt = landingAt
        s.dest = dest; s.stalk = stalk; s.mayCharge = mayCharge; s.sniffed = sniffed; s.nudges = nudges; s.hook = hook
        s.task = task; s.taskUntil = taskUntil; s.spot = spot; s.cross = cross; s.face = face; s.cursorAt = cursorAt
        return s
    }

    func `is`(_ r: Reaction) -> Bool { mode == .react && reaction == r }
}

private let SUBSTEP_S = 1.0 / 60
private let MAX_FRAME_MS = 1000.0
/// How much of the sprite drops below the bottom edge while peeking.
public let PEEK_SINK = 0.45
/// Peak speed of an ease-in-out-sine move is this many times its average speed.
private let EASE_PEAK = Double.pi / 2
/// How long one pat keeps him happy; each further pat restarts it.
private let PETTED_MS = 2200.0
/// Stroking him keeps him happy at least this much longer.
private let STROKED_MS = 900.0
/// Zoomies run this much faster than a run.
private let ZOOMIES_SPEED = 1.3
/// Getting to a toy, he gives up after this long.
private let GO_MS = 12_000.0
/// How long he watches where a toy went before going after it.
private let WATCH_MS = Range(350, 900)
/// Carrying a toy somewhere, he gives up and throws it from wherever he's got to after this.
private let CARRY_MS = 7000.0
/// Going off for a nap, he lies down wherever he's got to after this.
private let NAP_GO_MS = 20_000.0
/// The pointer has to move this far for him to pick a new spot next to it.
private let NAP_CURSOR_MOVED = 60.0
/// Off to his desk, he gives up if he can't get there in this long.
private let DESK_GO_MS = 20_000.0
/// How long he's cross for, taken away from his work or woken up.
private let ANGRY_MS = 1700.0
/// His desk put down somewhere new, he's cross this much longer before going over to it.
private let DESK_DROPPED_MS = 700.0
/// How long he says something for.
private let SAY_MS = 2200.0
/// How he sits at the computer for each thing he does at it.
private let TASK_ANIMATION: [DeskTask: AnimationName] = [.terminal: .work, .web: .browse, .reels: .reels]

/// A goose: how likely it honks at nothing when it's deciding what to do next, and for how long.
private let GOOSE_HONK_CHANCE = 0.2
private let GOOSE_HONK_MS = 1300.0
/// How likely a goose goes for the pointer when it comes near (instead of running off).
private let GOOSE_CHARGE_CHANCE = 0.7
/// At a block, how likely a goose snatches it and runs off with it.
private let GOOSE_STEAL_CHANCE = 0.55
/// How far a goose runs off with a block, px.
private let GOOSE_STEAL_DISTANCE = Range(260, 460)
/// Honking as it goes, every so often.
private let GOOSE_HONK_EVERY = Range(1300, 2600)

/// What a goose says instead: it only honks (or hisses).
public func honk(_ text: String, _ now: Double) -> String {
    if text.hasPrefix("Shh") { return "Hssss!" }
    if text.contains("?") && !text.contains("!") { return "Honk?" }
    let loud = ["HONK!", "HONK HONK!", "HONK!!"]
    return loud[Int(jsMod(floor(now / 997), Double(loud.count)))]
}

/// Play phases he has hold of the block through.
private let HOLDING: Set<String> = ["toss", "grab", "fetch", "lift", "carry", "throw"]
/// Nearer a block than this, he heads straight for it rather than running round in a curve.
private let CURVE_FROM = 200.0
/// Getting to a block, he slows down only this close to it beyond braking in time to stop, px.
private let ARRIVE_RADIUS = 12.0
/// He leaps only when he's headed this straight for where he's going.
private let LEAP_AIM = 0.97
/// Creeping up on a block, he gives up creeping and pounces after this long.
private let STALK_MS = 5000.0
/// Bottom wiggling, about to pounce.
private let WIGGLE_MS = 650.0
/// A good sniff at a block.
private let SNIFF_MS = Range(900, 1700)
/// Nosing a block along, he gives up after this long; and how hard each push is, px/s.
private let NUDGE_MS = 9000.0
private let NUDGE_SPEED = Range(210, 290)
/// Typing: how long he asks you to play, and how long he watches before asking again.
private let BEG_MS = 2800.0
private let WATCH_TYPING_MS = Range(14_000, 22_000)
/// What he says to get you to stop typing and play, one after another.
private let BEG_LINES = [
    "Ooh, typing? Play with me instead!",
    "Psst… play with me?",
    "So much typing… is it play time yet?",
    "Throw me a block?",
    "I’m bored! Play with me!",
]

private func dist(_ a: Toy, _ b: Pt) -> Double { hypot(a.x - b.x, a.y - b.y) }
private func length(_ v: Pt) -> Double { hypot(v.x, v.y) }

/// Limits for the feet position that keep the whole sprite inside the bounds.
private struct Area {
    var minX: Double, maxX: Double, minY: Double, maxY: Double
}

public final class Brain {
    var state: BrainState
    private var pos: Pt
    private var vel = Pt.zero
    private var facing = 1.0
    private var now = 0.0
    private var calmMs = 0.0
    private var cursorWasNear = false
    private var speedScale = 1.0
    private var dragTarget: Pt?
    /// He was asleep (or about to be) when you picked him up.
    private var wokenByDrag = false
    /// You're carrying his desk about.
    private var deskHeld = false
    /// A goose on the attack honks again at this time.
    private var nextHonkAt = 0.0
    /// In the air in an excited leap until this time, and when the next one may come.
    private var leapUntil = 0.0
    private var nextLeapAt = 0.0
    private var input: WorldInput
    /// The mode he was last in, to tell when it changes.
    private var mode: PetMode
    private var speech: (text: String, until: Double)?
    private let random: Random
    private let config: BehaviorConfig
    /// The toy blocks he plays with. They move in step with him.
    public let toys: Toybox

    public init(_ initial: WorldInput, random: @escaping Random = systemRandom, config: BehaviorConfig = DEFAULT_CONFIG, toys: Toybox = Toybox()) {
        input = initial
        self.random = random
        self.config = config
        self.toys = toys
        mode = initial.mode
        let b = initial.bounds
        pos = Pt(x: b.x + b.width / 2, y: b.y + b.height)
        let s = BrainState(.idle)
        s.until = 1500
        state = s
    }

    /// Movement speed multiplier from settings (1 = default).
    public func setSpeed(_ scale: Double) { speedScale = scale }

    public func update(_ dtMs: Double, _ input: WorldInput) -> PetSnapshot {
        self.input = input
        var remaining = Swift.min(Swift.max(dtMs, 0), MAX_FRAME_MS) / 1000
        while remaining > 1e-9 {
            let dt = Swift.min(SUBSTEP_S, remaining)
            step(dt)
            remaining -= dt
        }
        return snapshot()
    }

    // MARK: - Direct manipulation

    public func grab() {
        let s = state
        if reaction != .dragged { wokenByDrag = s.mode == .sleep || (s.mode == .sit && s.then == .sleep) || reaction == .nap }
        if input.goose && reaction != .dragged { speak("Put me down!") }
        state = BrainState(.react, .dragged)
        dragTarget = pos
        vel = .zero
        calmMs = 0
    }

    public func dragTo(_ feet: Pt) {
        if reaction != .dragged { return }
        dragTarget = clampToArea(feet)
    }

    /// Lets go: he settles exactly where he was dropped. In work mode he's cross at being taken
    /// away from his work, and goes back to it. Woken up (or in sleep mode), he's cross at that,
    /// and then lies down to sleep again right there.
    public func release() {
        if reaction != .dragged { return }
        dragTarget = nil
        vel = .zero
        if mode == .work {
            startWork(false)
            state.phase = "angry"
            state.until = now + ANGRY_MS
            speak("Hey! I was working!")
            return
        }
        if mode == .sleep || wokenByDrag {
            wokenByDrag = false
            speak("Hey! I was sleeping!")
            let s = BrainState(.react, .nap)
            s.spot = pos
            s.face = facing
            s.cursorAt = nil
            s.cross = now + ANGRY_MS
            s.until = now + NAP_GO_MS
            state = s
            return
        }
        // Put down, a goose turns on the hand that held it.
        if input.goose && mode == .play {
            honkAt()
            return
        }
        idle(1000, 2500)
    }

    /// A click or tap on the pet: a pat. He sits and enjoys it. Busy at his desk, he enjoys it
    /// and gets back to work.
    public func poke() {
        let s = state
        if reaction == .dragged || reaction == .away { return }
        calmMs = 0
        // A goose doesn't want patting: it honks, and goes for your pointer.
        if input.goose && mode == .play && reaction != .chase && reaction != .pounce {
            honkAt()
            return
        }
        if input.goose { speak("Honk!") }
        let resume = s.is(.work) ? s : s.is(.petted) ? s.resume : nil
        let next = BrainState(.react, .petted)
        next.until = now + PETTED_MS
        next.resume = resume
        state = next
    }

    /// Talking to Alarmie through him: he stops where he is, turned to you, and listens while
    /// you type (`listen`), thinks while Alarmie answers (`think`), and says the answer
    /// (`answer`). Nil ends the talk: back to whatever he was doing (his desk, in work mode).
    public func talk(_ phase: TalkPhase?) {
        let s = state
        guard let phase else {
            if !s.is(.talk) { return }
            if let resume = s.resume, input.desk != nil {
                let back = resume.copy()
                back.phase = "go"
                back.until = now + DESK_GO_MS
                state = back
            } else {
                idle(1500, 3000)
            }
            return
        }
        if s.is(.talk) {
            s.phase = phase.rawValue
            return
        }
        if reaction == .dragged || reaction == .away { return }
        speak(nil)
        calmMs = 0
        let next = BrainState(.react, .talk)
        next.phase = phase.rawValue
        next.resume = s.is(.work) ? s : s.is(.petted) ? s.resume : nil
        state = next
    }

    /// Talking to Alarmie through him, and at which point of it.
    public var talking: TalkPhase? { state.is(.talk) ? TalkPhase(rawValue: state.phase) : nil }

    /// The pointer moving over him while he's being petted: he enjoys it for longer.
    public func stroke() {
        if state.is(.petted) { state.until = Swift.max(state.until, now + STROKED_MS) }
    }

    /// A tap on his desk while he's working at it gets you shushed.
    public func deskTapped() {
        if busyWorking { speak("Shh! Working.") }
    }

    /// You've picked his desk up: sat at it (or on his way), he's cross, and waits to see where it goes.
    public func deskLifted() {
        deskHeld = true
        let s = state
        if !s.is(.work) || (s.phase != "type" && s.phase != "go") { return }
        vel = .zero
        s.phase = "angry"
        s.until = .infinity
        speak("Hey! I need to work!")
    }

    /// You've put his desk down somewhere else: off he goes to it, to get back to work.
    public func deskDropped() {
        deskHeld = false
        let s = state
        if s.is(.work) && s.phase == "angry" && s.until == .infinity { s.until = now + DESK_DROPPED_MS }
    }

    /// You threw one of his toys (or dropped it): he's off after it, unless he's asleep, in
    /// your hand or busy watching you type.
    public func toyThrown(_ id: Int) {
        let s = state
        let r = reaction
        if mode != .play || s.mode == .sleep || r == .dragged || r == .peek || r == .hide || r == .talk || toys.get(id) == nil { return }
        if s.is(.play) && s.toy == id {
            playPhase(s, "go", GO_MS)
            s.excited = true
            s.turns = Swift.max(s.turns, 1)
            return
        }
        startPlay(id, true)
    }

    // MARK: - Simulation

    private var bottom: Double { input.bounds.y + input.bounds.height }
    private var center: Pt { Pt(x: pos.x, y: pos.y - input.size.height / 2) }
    var reaction: Reaction? { state.mode == .react ? state.reaction : nil }

    private var area: Area {
        let b = input.bounds, size = input.size
        return Area(minX: b.x + size.width / 2, maxX: b.x + b.width - size.width / 2, minY: b.y + size.height, maxY: bottom - (input.footroom ?? 0))
    }

    private func step(_ dt: Double) {
        now += dt * 1000
        followMode()
        handleStimuli(dt)
        think(dt)
        integrate(dt)
        updateFacing()
        toys.step(dt)
        kickToys()
        // Whatever he's doing now, if it isn't throwing or carrying the block he has, he drops it.
        let held = toys.heldBy(.pet)
        let s = state
        let holding = s.is(.play) && HOLDING.contains(s.phase) && s.toy == held?.id
        if let held, !holding { toys.release(held.id, .pet, Velocity3(x: 0, y: 0, z: 0)) }
    }

    private func handleStimuli(_ dt: Double) {
        let cursor = input.cursor
        let s = state
        let r = reaction
        // Only playing does he chase the pointer, watch you type, or run off from it. Working,
        // sleeping or hiding, nothing distracts him (except being picked up, or a pat); nor
        // while he's talking to Alarmie for you.
        if mode != .play || r == .talk {
            calmMs = 0
            cursorWasNear = cursor.map { dist($0, center) < config.reactions.fleeRadius } ?? false
            return
        }
        let alreadyChasing = r == .chase || r == .pounce || r == .dragged || (s.is(.surprised) && s.next == .chase)

        if input.cursorExcited && cursor != nil && !alreadyChasing {
            surprise(.chase)
            return
        }

        let napping = s.is(.nap)
        let calm = s.mode != .react || napping
        if input.typingActive && calm {
            let peek = BrainState(.react, .peek)
            peek.phase = "approach"
            state = peek
            return
        }

        let near = cursor.map { dist($0, center) < config.reactions.fleeRadius } ?? false
        let skittish = s.mode == .idle || s.mode == .walk || s.mode == .sit
        if input.goose {
            if near && !cursorWasNear && skittish && random() < GOOSE_CHARGE_CHANCE { honkAt() }
        } else if near && !cursorWasNear && skittish && random() < config.reactions.fleeChance, let cursor {
            flee(cursor)
        }
        cursorWasNear = near

        if s.mode == .react && !napping { calmMs = 0 } else if s.mode != .sleep { calmMs += dt * 1000 }
    }

    private func think(_ dt: Double) {
        let s = state
        let m = config.motion
        let k = speedScale
        let cursor = input.cursor
        let size = input.size

        switch s.mode {
        case .idle:
            brake(dt)
            if now >= s.until { decide() }
            return
        case .walk:
            s.elapsed += dt * 1000
            let progress = Swift.min(1, s.elapsed / s.duration)
            let next = quadraticBezier(s.from, s.via, s.to, easeInOutSine(progress))
            vel = Pt(x: (next.x - pos.x) / dt, y: (next.y - pos.y) / dt)
            pos = next
            if progress >= 1 {
                vel = .zero
                pause()
            }
            return
        case .sit:
            brake(dt)
            if now >= s.until {
                if s.then == .sleep { state = BrainState(.sleep) } else { pause() }
            }
            return
        case .sleep:
            brake(dt)
            return
        case .react:
            break
        }

        switch s.reaction! {
        case .surprised:
            brake(dt)
            if now < s.until { return }
            if s.next == .chase {
                let chase = BrainState(.react, .chase)
                chase.until = now + config.reactions.chaseMaxMs
                state = chase
                nextLeapAt = now + 600 + random() * 900
            } else {
                idle(1000, 2500)
            }

        case .chase:
            guard let cursor, now < s.until else {
                confused()
                return
            }
            if input.goose && now >= nextHonkAt {
                speak("HONK!", 900)
                nextHonkAt = now + pick(GOOSE_HONK_EVERY, random)
            }
            // Mid-leap he flies straight on.
            if leaping { return }
            let target = pounceTarget(cursor)
            vel = steer(target, m.chaseSpeed * k, m.chaseAccel * k, dt, 80)
            maybeLeap(target, m.chaseSpeed * k)
            if input.cursorStillMs >= config.reactions.pounceAfterStillMs {
                let pounce = BrainState(.react, .pounce)
                pounce.target = pounceTarget(cursor)
                pounce.until = now + 900
                state = pounce
            }

        case .pounce:
            // A pounce is one quick lunge at the spot, not a run: straight there.
            vel = steer(s.target, m.pounceSpeed * k, m.chaseAccel * 1.6 * k, dt, 40, false)
            if (dist(pos, s.target) < 4 && length(vel) < 30) || now >= s.until { confused() }

        case .confused:
            brake(dt)
            if now >= s.until { idle(1000, 2500) }

        case .petted:
            brake(dt)
            if now < s.until { return }
            if let resume = s.resume, input.desk != nil {
                // Back to work.
                let back = resume.copy()
                back.phase = "go"
                back.until = now + DESK_GO_MS
                state = back
            } else {
                idle(1500, 3000)
            }

        case .work:
            work(s, dt)

        case .away:
            away(s, dt)

        case .talk:
            brake(dt)

        case .zoomies:
            if leaping { return }
            let top = m.runSpeed * ZOOMIES_SPEED * k
            let last = s.dashes <= 1
            vel = steer(s.target, top, m.runAccel * k, dt, last ? 70 : 10)
            let left = dist(pos, s.target)
            maybeLeap(s.target, top, last ? m.runAccel * k : nil)
            if !last && left < 40 {
                // Swerve off somewhere new without stopping.
                s.target = dashTarget()
                s.dashes -= 1
            } else if last && left < 4 && length(vel) < 10 {
                pause()
            }

        case .play:
            play(s, dt)

        case .nap:
            if now < s.cross {
                // Woken up: cross about it first.
                brake(dt)
                return
            }
            // The pointer has settled somewhere else: he goes and lies down next to it there.
            if let at = s.cursorAt, let cursor, dist(cursor, at) > NAP_CURSOR_MOVED && input.cursorStillMs >= 800 {
                let spot = napSpot()
                s.spot = spot.spot
                s.face = spot.face
                s.cursorAt = spot.cursorAt
            }
            vel = steer(s.spot, m.walkSpeed * 1.3 * k, m.accel * 1.5 * k, dt, 50)
            if (dist(pos, s.spot) < 5 && length(vel) < 15) || now >= s.until { settleDown(s.face) }

        case .flee:
            vel = steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 50)
            if dist(s.target, pos) < 4 && length(vel) < 10 {
                idle(1500, 3000)
                if let cursor { facing = cursor.x < pos.x ? -1 : 1 }
            }

        case .hide:
            if s.phase == "in" || s.phase == "out" {
                let speed = s.phase == "in" ? m.runSpeed : m.walkSpeed
                let accel = s.phase == "in" ? m.runAccel : m.accel
                let target = Pt(x: s.targetX, y: pos.y)
                vel = steer(target, speed * k, accel * k, dt, 50)
                if abs(s.targetX - pos.x) < 4 && length(vel) < 10 {
                    if s.phase == "out" {
                        idle(1000, 2500)
                    } else {
                        s.phase = "wait"
                        s.until = now + 3000 + random() * 3000
                        s.giveUpAt = now + 12_000
                    }
                }
                return
            }
            brake(dt)
            let cursorClose = cursor.map { dist($0, center) < 220 } ?? false
            if (now >= s.until && !cursorClose) || now >= s.giveUpAt {
                let a = area
                let step = size.width * 0.3 + random() * 150
                s.phase = "out"
                s.targetX = clampRange(s.edge < 0 ? a.minX + step : a.maxX - step, a.minX, a.maxX)
            }

        case .peek:
            // Measured from the lowest spot he can stand on, so it ends up past the real edge.
            let floor = area.maxY
            let depth = (input.footroom ?? 0) + (input.peekDepth ?? size.height * PEEK_SINK)
            if s.phase == "approach" {
                if !input.typingActive {
                    idle(800, 2000)
                    return
                }
                // Down to the bottom of the screen, in the middle, where you'll see him.
                let b = input.bounds
                let target = Pt(x: clampRange(b.x + b.width / 2, area.minX, area.maxX), y: floor)
                vel = steer(target, m.runSpeed * 0.6 * k, m.runAccel * k, dt, 60)
                if dist(pos, target) < 3 && length(vel) < 12 {
                    vel = .zero
                    beg(s)
                }
                return
            }
            if s.phase == "beg" {
                // Waving at you to come and play.
                vel = .zero
                if now >= s.until { s.phase = input.typingActive ? "sink" : "rise" }
                return
            }
            if !input.typingActive && s.phase != "rise" { s.phase = "rise" }
            if s.phase == "sink" {
                s.sink = approach(s.sink, depth, 110 * dt)
                if s.sink >= depth {
                    s.phase = "watch"
                    s.until = now + pick(WATCH_TYPING_MS, random)
                }
            } else if s.phase == "watch" {
                s.sink = depth
                // Still at it: up he comes to ask again.
                if now >= s.until { s.phase = "up" }
            } else if s.phase == "up" {
                s.sink = approach(s.sink, 0, 140 * dt)
                if s.sink <= 0 { beg(s) }
            } else {
                s.sink = approach(s.sink, 0, 140 * dt)
                if s.sink <= 0 {
                    if s.begs > 0 { speak("Yay! Play time!") }
                    idle(800, 2000)
                }
            }
            pos = Pt(x: pos.x, y: floor + s.sink)
            vel = .zero

        case .dragged:
            guard let target = dragTarget else { return }
            let instant = Pt(x: (target.x - pos.x) / dt, y: (target.y - pos.y) / dt)
            vel = Pt(x: vel.x * 0.7 + instant.x * 0.3, y: vel.y * 0.7 + instant.y * 0.3)
            pos = target
        }
    }

    private func integrate(_ dt: Double) {
        let s = state
        // Walks, drags and peeks place him directly; everything else moves by velocity.
        if s.mode == .walk { return }
        if s.is(.dragged) || (s.is(.peek) && s.phase != "approach") { return }

        pos = Pt(x: pos.x + vel.x * dt, y: pos.y + vel.y * dt)
        // Off the screen and back, nothing holds him in.
        if s.is(.away) { return }
        let clamped = clampToArea(pos, s.is(.hide))
        if clamped.x != pos.x { vel.x = 0 }
        if clamped.y != pos.y { vel.y = 0 }
        pos = clamped
    }

    /// Keeps the whole sprite inside the bounds, or allows half of it past the sides while hiding.
    private func clampToArea(_ p: Pt, _ allowSides: Bool = false) -> Pt {
        let a = area
        let slack = allowSides ? input.size.width * 0.5 : 0
        return Pt(x: clampRange(p.x, a.minX - slack, a.maxX + slack), y: clampRange(p.y, a.minY, a.maxY))
    }

    private func updateFacing() {
        let s = state
        let b = input.bounds
        if (s.is(.chase) || s.is(.pounce)), let cursor = input.cursor {
            if abs(cursor.x - pos.x) > 4 { facing = cursor.x < pos.x ? -1 : 1 }
            return
        }
        if s.is(.hide) && s.phase == "wait" {
            facing = pos.x < b.x + b.width / 2 ? 1 : -1
            return
        }
        if s.is(.peek) && s.phase != "approach" { return }
        if s.is(.play) && s.phase != "go" {
            let toy = toys.get(s.toy)
            if s.phase == "carry" || s.phase == "fetch" || s.phase == "charge" || s.phase == "nudge" {
                if abs(vel.x) > 12 { facing = vel.x < 0 ? -1 : 1 }
            } else if ["pounce", "bat", "toss", "grab", "lift", "throw"].contains(s.phase) || toy == nil {
                facing = s.side
            } else if let toy, abs(toy.x - pos.x) > 6 {
                facing = toy.x < pos.x ? -1 : 1
            }
            return
        }
        if abs(vel.x) > 12 { facing = vel.x < 0 ? -1 : 1 }
    }

    /// Steers towards `target` with the speed and acceleration measured over the floor, so
    /// dashing up or down the screen is as quick as across it looks. On the move he runs round
    /// in curves (see `steerArc`) unless `arc` is false.
    private func steer(_ target: Pt, _ maxSpeed: Double, _ accel: Double, _ dt: Double, _ slowRadius: Double, _ arc: Bool = true) -> Pt {
        let k = config.wander.floorDepth
        func flat(_ p: Pt) -> Pt { Pt(x: p.x, y: p.y / k) }
        let v = (arc ? steerArc : steer2d)(flat(pos), flat(vel), flat(target), maxSpeed, accel, dt, slowRadius)
        return Pt(x: v.x, y: v.y * k)
    }

    private var leaping: Bool { now < leapUntil }

    /// Bursting with excitement mid-run, he leaps now and then: only at full tilt, and only with
    /// room ahead to land before he gets where he's going.
    private func maybeLeap(_ target: Pt, _ topSpeed: Double, _ accel: Double? = nil) {
        let leapMs = config.motion.leapMs
        let speed = length(vel)
        if now < nextLeapAt || speed < topSpeed * 0.6 { return }
        let left = dist(pos, target)
        let flight = speed * 1.1 * (leapMs / 1000)
        if let accel {
            if left < 1 || (vel.x * (target.x - pos.x) + vel.y * (target.y - pos.y)) / (speed * left) < LEAP_AIM { return }
            if left < flight + pow(speed * 1.1, 2) / (2 * accel * 0.8) { return }
        } else {
            if left < flight * 0.64 { return }
        }
        leapUntil = now + leapMs
        nextLeapAt = leapUntil + pick(config.motion.leapEvery, random)
        // The spring of the push-off.
        vel = Pt(x: vel.x * 1.1, y: vel.y * 1.1)
    }

    private func brake(_ dt: Double) { vel = brake2d(vel, config.motion.runAccel * dt) }

    /// Where his feet go so that the cursor ends up in the middle of him.
    private func pounceTarget(_ cursor: Pt) -> Pt { clampToArea(Pt(x: cursor.x, y: cursor.y + input.size.height * 0.45)) }

    // MARK: - Transitions

    private func idle(_ minMs: Double, _ maxMs: Double) {
        let s = BrainState(.idle)
        s.until = now + minMs + random() * (maxMs - minMs)
        state = s
    }

    /// A pause between activities, per the wander config.
    private func pause() { idle(config.wander.pauseMs.min, config.wander.pauseMs.max) }

    private func sit(_ activity: String, _ duration: Double, then: Mode) {
        let s = BrainState(.sit)
        s.activity = activity
        s.until = now + duration
        s.then = then
        state = s
    }

    private func decide() {
        let w = config.wander
        if calmMs >= w.sleepAfterMs {
            nap()
            return
        }
        if input.goose && random() < GOOSE_HONK_CHANCE {
            speak("HONK!", GOOSE_HONK_MS)
            sit("honk", GOOSE_HONK_MS, then: .idle)
            return
        }
        let r = random()
        if r < w.sitChance {
            let roll = random()
            let activity = roll < 0.45 ? "groom" : roll < 0.6 ? "yawn" : "rest"
            let duration = activity == "yawn" ? 2200 : pick(w.sitMs, random)
            sit(activity, duration, then: .idle)
        } else if r < w.sitChance + w.lookAroundChance {
            facing = facing == 1 ? -1 : 1
            pause()
        } else if r < w.sitChance + w.lookAroundChance + w.zoomiesChance {
            zoomies()
        } else if r < w.sitChance + w.lookAroundChance + w.zoomiesChance + w.playChance, let toy = favouriteToy() {
            startPlay(toy.id, false)
        } else {
            startWalk()
        }
    }

    /// Picks a random point some distance away, anywhere on screen, and sets off along a
    /// gently curved path to it.
    private func startWalk() {
        let w = config.wander
        let a = area
        var to = pos
        var distance = 0.0
        for _ in 0..<8 {
            let angle = random() * Double.pi * 2
            distance = pick(w.walkDistance, random)
            to = Pt(x: pos.x + cos(angle) * distance, y: pos.y + sin(angle) * distance)
            if to.x >= a.minX && to.x <= a.maxX && to.y >= a.minY && to.y <= a.maxY { break }
        }
        to = clampToArea(to)
        distance = dist(pos, to)
        if distance < w.walkDistance.min / 2 {
            // Not enough room to go anywhere worthwhile (tiny screen).
            pause()
            return
        }
        let bow = (random() * 2 - 1) * w.curve * distance
        let normal = Pt(x: -(to.y - pos.y) / distance, y: (to.x - pos.x) / distance)
        let via = clampToArea(Pt(x: (pos.x + to.x) / 2 + normal.x * bow, y: (pos.y + to.y) / 2 + normal.y * bow))
        let topSpeed = config.motion.walkSpeed * (1 + (random() * 2 - 1) * w.speedJitter) * speedScale
        // Ground covered, not screen distance: up and down the screen is towards and away from you.
        let ground = hypot(to.x - pos.x, (to.y - pos.y) / w.floorDepth)
        let s = BrainState(.walk)
        s.from = pos
        s.via = via
        s.to = to
        s.duration = (ground / (topSpeed / EASE_PEAK)) * 1000
        state = s
    }

    /// A burst of mad energy: a few dashes about the screen, swerving and leaping as he goes.
    private func zoomies() {
        let dashes = Int(jsRound(pick(config.wander.zoomiesDashes, random)))
        let s = BrainState(.react, .zoomies)
        s.target = dashTarget()
        s.dashes = dashes
        state = s
        nextLeapAt = now + 300 + random() * 500
    }

    /// Somewhere well away to dash to, off in a different direction from the way he's going.
    private func dashTarget() -> Pt {
        let heading = length(vel) > 20 ? atan2(vel.y, vel.x) : random() * Double.pi * 2
        var best = pos
        var bestRoom = -1.0
        for _ in 0..<8 {
            // A swerve of 60 to 150 degrees either way.
            let swerve = (Double.pi / 3 + random() * Double.pi * 0.5) * (random() < 0.5 ? -1 : 1)
            let angle = heading + swerve
            let reach = 250 + random() * 350
            let to = clampToArea(Pt(x: pos.x + cos(angle) * reach, y: pos.y + sin(angle) * reach * config.wander.floorDepth))
            let room = dist(to, pos)
            if room > bestRoom {
                best = to
                bestRoom = room
            }
            if room > 200 { break }
        }
        return best
    }

    private func surprise(_ next: Reaction) {
        calmMs = 0
        let s = BrainState(.react, .surprised)
        s.until = now + 450
        s.next = next
        state = s
    }

    /// A goose has had enough of you: a honk, and it goes for the pointer.
    private func honkAt() {
        speak("HONK!")
        surprise(.chase)
        nextHonkAt = now + pick(GOOSE_HONK_EVERY, random)
    }

    private func confused() {
        let s = BrainState(.react, .confused)
        s.until = now + 2500 + random() * 1500
        state = s
    }

    private func flee(_ cursor: Pt) {
        let c = center
        let away = Pt(x: c.x - cursor.x, y: c.y - cursor.y)
        let l = length(away)
        let awayLength = l == 0 ? 1 : l
        let run = 220 + random() * 260
        let target = clampToArea(Pt(x: pos.x + (away.x / awayLength) * run, y: pos.y + (away.y / awayLength) * run))
        if dist(target, pos) < run * 0.5 {
            // Cornered: duck behind the side edge he was running towards.
            let a = area
            let edge: Double = away.x < 0 ? -1 : 1
            let offscreen = input.size.width * 0.3
            let s = BrainState(.react, .hide)
            s.edge = edge
            s.phase = "in"
            s.targetX = edge < 0 ? a.minX - offscreen : a.maxX + offscreen
            state = s
            return
        }
        let s = BrainState(.react, .flee)
        s.target = target
        state = s
    }

    // MARK: - Modes

    /// Keeps him to the mode picked in the settings. Whatever he's doing, in work mode he goes
    /// back to his desk, in sleep mode back to sleep, and in hide mode off the screen; and when
    /// the mode changes, he changes what he's doing to suit.
    private func followMode() {
        let newMode = input.mode
        let changed = newMode != mode
        mode = newMode
        let s = state
        let r = reaction
        if r == .dragged { return }
        // Talking to Alarmie, he stays to hear it out (unless he's to go off the screen).
        if r == .talk && newMode != .hide { return }
        let away = s.is(.away) ? s : nil
        if newMode == .hide {
            if away == nil || away!.phase == "back" { leave() }
            return
        }
        if let away {
            if away.phase != "back" { comeBack(away) }
            return
        }
        let sleepy = s.mode == .sleep || (s.mode == .sit && s.then == .sleep) || r == .nap
        if newMode == .work {
            if r != .work && r != .petted { startWork(changed) }
            return
        }
        if newMode == .sleep {
            if !sleepy && r != .petted { nap() }
            return
        }
        // Back to play: up from his desk, or awake with a stretch and a yawn.
        if changed && r == .work {
            speak(nil)
            pause()
        } else if changed && sleepy {
            sit("yawn", 2200, then: .idle)
        }
    }

    /// Sat at his desk, or on his way to it: not to be distracted.
    private var busyWorking: Bool { state.is(.work) }

    /// Something else to do at the computer: never the same thing again straight away.
    private func nextTask(_ current: DeskTask) -> DeskTask {
        let tasks = config.work.tasks
        let others = DeskTask.allCases.filter { $0 != current }
        let total = others.reduce(0) { $0 + tasks[$1]!.weight }
        var roll = random() * total
        for t in others {
            roll -= tasks[t]!.weight
            if roll <= 0 { return t }
        }
        return others[others.count - 1]
    }

    private func speak(_ text: String?, _ ms: Double = SAY_MS) {
        var said = text
        if let t = said, input.goose { said = honk(t, now) }
        speech = said.map { ($0, now + ms) }
    }

    /// You're typing away: he waves at you, and asks you to play with him instead.
    private func beg(_ s: BrainState) {
        s.phase = "beg"
        s.until = now + BEG_MS
        speak(BEG_LINES[s.begs % BEG_LINES.count], BEG_MS)
        s.begs += 1
    }

    /// Off to his desk, saying it's work time if he's only just been told.
    private func startWork(_ announce: Bool) {
        calmMs = 0
        vel = .zero
        if announce { speak("Work time!") }
        let s = BrainState(.react, .work)
        s.phase = announce ? "announce" : "go"
        s.until = now + (announce ? 1200 : DESK_GO_MS)
        s.task = .terminal
        s.taskUntil = -1
        state = s
    }

    private func work(_ s: BrainState, _ dt: Double) {
        let m = config.motion
        let w = config.work
        let k = speedScale
        guard let desk = input.desk else {
            // No desk to go to (yet): he waits.
            brake(dt)
            return
        }
        switch s.phase {
        case "announce", "angry":
            brake(dt)
            if now >= s.until {
                s.phase = "go"
                s.until = now + DESK_GO_MS
            }
        case "go":
            vel = steer(desk.seat, m.runSpeed * 0.75 * k, m.runAccel * k, dt, 50)
            if dist(pos, desk.seat) < 4 && length(vel) < 15 {
                vel = .zero
                facing = desk.facing
                if s.taskUntil < 0 {
                    s.task = .terminal
                    s.taskUntil = now + pick(w.tasks[.terminal]!.ms, random)
                }
                s.phase = "type"
            } else if now >= s.until {
                // Stuck: he tries again.
                s.until = now + DESK_GO_MS
            }
        case "type":
            // Sat still at the keyboard.
            vel = .zero
            facing = desk.facing
            if dist(pos, desk.seat) > 6 {
                // The desk moved (the screen changed): over to it again.
                s.phase = "go"
                s.until = now + DESK_GO_MS
                return
            }
            // Over to another tab now and then: some terminal, some browsing, a few reels.
            if now >= s.taskUntil {
                s.task = nextTask(s.task)
                s.taskUntil = now + pick(w.tasks[s.task]!.ms, random)
            }
        default:
            break
        }
    }

    /// Hide mode: off he runs, by the nearer side of the screen.
    private func leave() {
        let b = input.bounds, size = input.size
        speak(nil)
        let side: Double = pos.x < b.x + b.width / 2 ? -1 : 1
        let x = side < 0 ? b.x - size.width : b.x + b.width + size.width
        let s = BrainState(.react, .away)
        s.phase = "leave"
        s.side = side
        s.target = Pt(x: x, y: pos.y)
        state = s
    }

    /// Out of hiding: he runs back on from the side he went off by.
    private func comeBack(_ s: BrainState) {
        let a = area
        let inset = input.size.width * 0.8 + random() * 150
        s.phase = "back"
        s.target = clampToArea(Pt(x: s.side < 0 ? a.minX + inset : a.maxX - inset, y: pos.y))
        // Waiting just off the edge.
        let b = input.bounds, size = input.size
        pos = Pt(x: s.side < 0 ? b.x - size.width * 0.6 : b.x + b.width + size.width * 0.6, y: pos.y)
    }

    private func away(_ s: BrainState, _ dt: Double) {
        let m = config.motion
        let k = speedScale
        switch s.phase {
        case "leave":
            vel = steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 20, false)
            let b = input.bounds, size = input.size
            let off = s.side < 0 ? pos.x < b.x - size.width * 0.6 : pos.x > b.x + b.width + size.width * 0.6
            if off {
                s.phase = "gone"
                vel = .zero
            }
        case "gone":
            vel = .zero
        case "back":
            vel = steer(s.target, m.runSpeed * k, m.runAccel * k, dt, 50, false)
            if dist(pos, s.target) < 5 && length(vel) < 15 { idle(800, 2000) }
        default:
            break
        }
    }

    // MARK: - Naps

    /// Nothing's happened for a while: he goes off somewhere to curl up and sleep. Told to sleep
    /// (sleep mode), he lies down right where he is.
    private func nap() {
        let spot = mode == .sleep ? napHere() : napSpot()
        if dist(pos, spot.spot) < 12 {
            settleDown(spot.face)
            return
        }
        let s = BrainState(.react, .nap)
        s.spot = spot.spot
        s.face = spot.face
        s.cursorAt = spot.cursorAt
        s.cross = 0
        s.until = now + NAP_GO_MS
        state = s
    }

    /// Lying down where he is: where he'd come to a stop, if he's on the move.
    private func napHere() -> (spot: Pt, face: Double, cursorAt: Pt?) {
        (clampToArea(Pt(x: pos.x + vel.x * 0.25, y: pos.y + vel.y * 0.25)), facing, nil)
    }

    /// Lying down for a nap: a yawn, then sleep.
    private func settleDown(_ face: Double) {
        vel = .zero
        facing = face
        sit("yawn", 2200, then: .sleep)
    }

    /// Where to nap. With the pointer resting somewhere, right next to it, facing it, on the side
    /// he's coming from. Otherwise curled up with a toy block if one is nearby, or else wherever
    /// he fancies, a few steps from where he is.
    private func napSpot() -> (spot: Pt, face: Double, cursorAt: Pt?) {
        let size = input.size, b = input.bounds
        let a = area
        func inside(_ p: Pt) -> Bool { p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height }
        if let cursor = input.cursor, inside(cursor), input.cursorStillMs >= config.wander.napByCursorAfterMs {
            // Lying down, his nose ends up just short of the pointer.
            let gap = size.width * 0.45
            let y = cursor.y + size.height * 0.2
            var side: Double = pos.x < cursor.x ? -1 : 1
            var spot = clampToArea(Pt(x: cursor.x + side * gap, y: y))
            // No room on that side (against an edge): the other side.
            if abs(spot.x - cursor.x) < gap * 0.6 {
                side = side == 1 ? -1 : 1
                spot = clampToArea(Pt(x: cursor.x + side * gap, y: y))
            }
            return (spot, side == 1 ? -1 : 1, cursor)
        }
        var toy: Toy?
        for t in toys.toys where t.holder == nil && toys.isResting(t) && dist(t, pos) < 320 && (toy == nil || dist(t, pos) < dist(toy!, pos)) { toy = t }
        if let toy {
            let side: Double = pos.x < toy.x ? 1 : -1
            let spot = clampToArea(Pt(x: toy.x - side * toyReach * 1.2, y: toy.y))
            return (spot, toy.x < spot.x ? -1 : 1, nil)
        }
        let angle = random() * Double.pi * 2
        let far = size.width * (0.4 + random() * 1.2)
        let spot = clampToArea(Pt(x: pos.x + cos(angle) * far, y: pos.y + sin(angle) * far * 0.6))
        // Facing into the screen, not the wall.
        return (spot, spot.x < (a.minX + a.maxX) / 2 ? 1 : -1, nil)
    }

    // MARK: - Play

    /// The block he'd go and play with: the nearest one nobody's holding.
    private func favouriteToy() -> Toy? {
        var best: Toy?
        var bestDistance = Double.infinity
        for toy in toys.toys where toy.holder == nil {
            let d = dist(toy, pos)
            if d < bestDistance {
                best = toy
                bestDistance = d
            }
        }
        return best
    }

    private func startPlay(_ id: Int, _ excited: Bool) {
        let p = config.play
        let toy = toys.get(id)
        let s = BrainState(.react, .play)
        s.toy = id
        s.phase = "go"
        s.side = toy.map { $0.x < pos.x ? -1 : 1 } ?? 1
        s.started = now
        s.until = now + GO_MS
        s.turns = Int(jsRound(pick(p.turns, random)))
        s.excited = excited
        s.done = false
        s.mayPounce = random() < p.pounceChance
        s.landing = nil
        s.landingAt = -.infinity
        s.dest = nil
        s.stalk = random() < p.stalkChance
        s.mayCharge = random() < p.chargeChance
        s.sniffed = false
        s.nudges = 0
        s.hook = false
        state = s
        if excited { nextLeapAt = now + 300 + random() * 600 }
    }

    /// At the block: what to do with it this time.
    private func pickMove(_ s: BrainState) {
        let p = config.play
        let carries = input.carries
        // A goose is mostly after making off with it.
        if input.goose && random() < GOOSE_STEAL_CHANCE {
            playPhase(s, "grab", PLAY.tossMs)
            return
        }
        if random() < p.tossChance {
            if carries && random() < p.carryChance { playPhase(s, "lift", PLAY.liftMs) } else { playPhase(s, "toss", PLAY.tossMs) }
            return
        }
        let bat = p.moves.bat, nudge = p.moves.nudge, fetch = p.moves.fetch
        // All excited, or having had a sniff already, he doesn't stop to sniff it.
        let sniff = s.excited || s.sniffed ? 0 : p.moves.sniff
        var roll = random() * (bat + sniff + nudge + fetch)
        roll -= bat
        if roll < 0 { playPhase(s, "bat", PLAY.batMs); return }
        roll -= sniff
        if roll < 0 {
            s.sniffed = true
            playPhase(s, "sniff", pick(SNIFF_MS, random))
            return
        }
        roll -= nudge
        if roll < 0 { startNudging(s); return }
        if carries { playPhase(s, "lift", PLAY.liftMs) } else { playPhase(s, "grab", PLAY.tossMs) }
    }

    private func startNudging(_ s: BrainState) {
        s.nudges = Int(jsRound(pick(config.play.nudges, random)))
        playPhase(s, "nudge", NUDGE_MS)
    }

    /// Straight at it at full tilt, through it and out the other side, kicking it on.
    private func charge(_ s: BrainState, _ toy: Toy) {
        let dx = toy.x - pos.x
        let dy = toy.y - pos.y
        let h = hypot(dx, dy)
        let d = h == 0 ? 1 : h
        s.dest = clampToArea(Pt(x: toy.x + (dx / d) * 160, y: toy.y + (dy / d) * 160))
        playPhase(s, "charge", 4000)
        nextLeapAt = now + 200
    }

    private func playPhase(_ s: BrainState, _ phase: String, _ ms: Double) {
        s.phase = phase
        s.started = now
        s.until = now + ms
        s.done = false
    }

    private var toyReach: Double { input.toyReach ?? input.size.width / 3 }

    /// Where he stands to play with a block at `at`: beside it, facing it, on the floor he can reach.
    private func playSpot(_ s: BrainState, _ at: Pt) -> Pt {
        let reach = toyReach
        let a = area
        // He plays with it from whichever side of it is nearer him, so he never goes round it.
        let here = abs(pos.x - (at.x - s.side * reach))
        let there = abs(pos.x - (at.x + s.side * reach))
        if there + reach * 0.5 < here { s.side = s.side == 1 ? -1 : 1 }
        // Against a wall, he plays from the open side.
        if at.x - s.side * reach < a.minX || at.x - s.side * reach > a.maxX { s.side = s.side == 1 ? -1 : 1 }
        return clampToArea(Pt(x: at.x - s.side * reach, y: at.y))
    }

    /// The block is where his paw or mouth will be, in front of him.
    private func toyInReach(_ s: BrainState, _ toy: Toy) -> Bool {
        let reach = toyReach
        let front = pos.x + s.side * reach
        return toy.holder == nil && toy.z < toys.size && abs(toy.x - front) < reach * 0.7 && abs(toy.y - pos.y) < Swift.max(14, reach * 0.4)
    }

    private func play(_ s: BrainState, _ dt: Double) {
        let m = config.motion
        let p = config.play
        let k = speedScale
        guard let toy = toys.get(s.toy) else {
            pause()
            return
        }
        let elapsed = now - s.started
        let depth = config.wander.floorDepth

        switch s.phase {
        case "go":
            if toy.holder == .user {
                playPhase(s, "wait", p.waitMs)
                return
            }
            if now >= s.until {
                pause()
                return
            }
            if leaping { return }
            let resting = toys.isResting(toy)
            // Still flying or sliding: he heads for where it will stop.
            if !resting && now - s.landingAt > 120 {
                s.landing = toys.landing(toy.id)
                s.landingAt = now
            }
            let at = resting ? Pt(x: toy.x, y: toy.y) : (s.landing ?? Pt(x: toy.x, y: toy.y))
            let spot = playSpot(s, at)
            let away = dist(pos, spot)
            let fast = s.excited || !resting
            let top = (fast ? m.chaseSpeed : away > 260 ? m.runSpeed : m.walkSpeed * 1.6) * k
            let accel = (fast ? m.chaseAccel : away > 260 ? m.runAccel : m.accel * 2) * k
            // Close in, straight for it; he pulls up in a few quick steps.
            vel = steer(spot, top, accel, dt, ARRIVE_RADIUS, away > CURVE_FROM)
            if fast { maybeLeap(spot, top, accel) }
            if !resting { return }
            if s.mayCharge && away > 280 {
                s.mayCharge = false
                charge(s, toy)
                return
            }
            // A pounce is a lunge forwards: only at a spot ahead of him, across the floor.
            let ahead = (spot.x - pos.x) * s.side > abs(spot.y - pos.y)
            if s.mayPounce && ahead && away > 70 && away < 240 && abs(spot.y - pos.y) < 60 {
                playPhase(s, s.stalk ? "stalk" : "pounce", s.stalk ? STALK_MS : 900)
                return
            }
            if away < 4 && length(vel) < 45 {
                vel = .zero
                // Stuck in against the edge of the screen, out of reach: he hooks it out with a paw.
                if !toyInReach(s, toy) {
                    s.side = toy.x < pos.x ? -1 : 1
                    s.hook = true
                    playPhase(s, "bat", PLAY.batMs)
                } else {
                    pickMove(s)
                }
            }

        case "stalk":
            // Creeping up on it, low down; then still, bottom wiggling; and a pounce.
            if !toys.isResting(toy) {
                playPhase(s, "go", GO_MS)
                return
            }
            let spot = playSpot(s, Pt(x: toy.x, y: toy.y))
            if !s.done && dist(pos, spot) > 80 {
                vel = steer(spot, m.walkSpeed * 0.45 * k, m.accel * k, dt, 30, false)
            } else {
                if !s.done {
                    s.done = true
                    s.until = now + WIGGLE_MS
                }
                brake(dt)
            }
            if now >= s.until {
                s.mayPounce = false
                playPhase(s, "pounce", 900)
            }

        case "charge":
            if leaping { return }
            let dest = s.dest ?? Pt(x: toy.x, y: toy.y)
            let top = m.chaseSpeed * k
            vel = steer(dest, top, m.chaseAccel * k, dt, 40, false)
            maybeLeap(dest, top, m.chaseAccel * k)
            // On through it, pulling up on the far side.
            if (dist(pos, dest) < 6 && length(vel) < 30) || now >= s.until { playPhase(s, "watch", pick(WATCH_MS, random)) }

        case "sniff":
            brake(dt)
            if now < s.until { return }
            // Then: a swat, a push along the floor, or not interested after all.
            let roll = random()
            if roll < 0.45 { playPhase(s, "bat", PLAY.batMs) } else if roll < 0.75 { startNudging(s) } else { pause() }

        case "nudge":
            if let holder = toy.holder {
                playPhase(s, holder == .user ? "wait" : "go", holder == .user ? p.waitMs : GO_MS)
                return
            }
            // Up behind it, a push with his nose, and after it again.
            let spot = playSpot(s, Pt(x: toy.x, y: toy.y))
            vel = steer(spot, m.walkSpeed * 1.25 * k, m.accel * 2 * k, dt, 20, false)
            if toyInReach(s, toy) && hypot(toy.vx, toy.vy) < 40 {
                if s.nudges <= 0 {
                    playPhase(s, "watch", pick(WATCH_MS, random))
                    return
                }
                s.nudges -= 1
                let speed = pick(NUDGE_SPEED, random)
                toys.hit(toy.id, Velocity3(x: s.side * speed, y: (random() * 2 - 1) * speed * 0.15 * depth, z: 40), s.side * 240)
            }
            if now >= s.until { playPhase(s, "watch", pick(WATCH_MS, random)) }

        case "grab":
            // Picks it up in his mouth, to trot off with it.
            brake(dt)
            if !s.done && elapsed >= PLAY.tossGrabMs {
                if toyInReach(s, toy) { toys.hold(toy.id, .pet) }
                s.done = true
            }
            if elapsed < PLAY.tossGrabMs + 160 { return }
            if toy.holder == .pet {
                if input.goose {
                    // Got it! Off with it, away from you.
                    s.dest = stealTo()
                    speak("HONK!", 1200)
                } else {
                    s.dest = carryTo(s, p.fetchDistance)
                }
                playPhase(s, "fetch", CARRY_MS)
            } else {
                playPhase(s, "watch", pick(WATCH_MS, random))
            }

        case "fetch":
            if toy.holder != .pet {
                playPhase(s, toy.holder == .user ? "wait" : "go", toy.holder == .user ? p.waitMs : GO_MS)
                return
            }
            let dest = s.dest ?? pos
            // A goose legs it.
            let goose = input.goose
            vel = steer(dest, (goose ? m.runSpeed * 0.9 : m.walkSpeed * 1.4) * k, (goose ? m.runAccel : m.accel * 1.5) * k, dt, 40)
            if (dist(pos, dest) < 6 && length(vel) < 15) || now >= s.until {
                // Drops it, and has a look at it.
                vel = .zero
                toys.release(toy.id, .pet, Velocity3(x: facing * 40, y: 0, z: 60))
                playPhase(s, "watch", pick(WATCH_MS, random))
            }

        case "pounce":
            let spot = playSpot(s, Pt(x: toy.x, y: toy.y))
            vel = steer(spot, m.pounceSpeed * k, m.chaseAccel * 1.6 * k, dt, 40, false)
            if (dist(pos, spot) < 4 && length(vel) < 30) || now >= s.until {
                // Landed by it: give it a swat.
                s.mayPounce = false
                playPhase(s, "bat", PLAY.batMs)
            }

        case "bat":
            brake(dt)
            if !s.done && elapsed >= PLAY.batHitMs {
                s.done = true
                if s.hook && toy.holder == nil && toy.z <= 0 {
                    // Out from the wall, back past him.
                    s.hook = false
                    let speed = pick(p.batSpeed, random)
                    toys.hit(toy.id, Velocity3(x: -s.side * speed, y: (random() * 2 - 1) * speed * 0.3 * depth, z: pick(p.batLift, random)), -s.side * 400)
                } else if toyInReach(s, toy) {
                    let speed = pick(p.batSpeed, random)
                    let v = Velocity3(x: s.side * speed, y: (random() * 2 - 1) * speed * 0.35 * depth, z: pick(p.batLift, random))
                    toys.hit(toy.id, v, s.side * (360 + random() * 420))
                }
            }
            if now >= s.until { playPhase(s, "watch", pick(WATCH_MS, random)) }

        case "toss":
            brake(dt)
            if !s.done && elapsed >= PLAY.tossGrabMs {
                // Picks it up, if it's still there.
                if toyInReach(s, toy) { toys.hold(toy.id, .pet) }
                s.done = true
            }
            if elapsed >= PLAY.tossReleaseMs && toy.holder == .pet {
                let speed = pick(p.tossSpeed, random)
                let v = Velocity3(x: s.side * speed, y: (random() * 2 - 1) * speed * 0.3 * depth, z: pick(p.tossLift, random))
                toys.release(toy.id, .pet, v, s.side * (420 + random() * 480))
            }
            if now >= s.until { playPhase(s, "watch", pick(WATCH_MS, random)) }

        case "lift":
            brake(dt)
            if !s.done && elapsed >= PLAY.liftGrabMs {
                if toyInReach(s, toy) { toys.hold(toy.id, .pet) }
                s.done = true
            }
            if now < s.until { return }
            if toy.holder == .pet {
                // Off with it, somewhere to throw it from.
                s.dest = carryTo(s)
                playPhase(s, "carry", CARRY_MS)
            } else {
                // Missed it, or you took it.
                playPhase(s, "watch", pick(WATCH_MS, random))
            }

        case "carry":
            if toy.holder != .pet {
                // You've taken it off him.
                playPhase(s, toy.holder == .user ? "wait" : "go", toy.holder == .user ? p.waitMs : GO_MS)
                return
            }
            let dest = s.dest ?? pos
            // A careful toddle: on two legs, he's slower than on four.
            vel = steer(dest, m.walkSpeed * 0.85 * k, m.accel * k, dt, 40)
            if (dist(pos, dest) < 5 && length(vel) < 12) || now >= s.until {
                vel = .zero
                s.side = facing
                playPhase(s, "throw", PLAY.throwMs)
            }

        case "throw":
            brake(dt)
            if elapsed >= PLAY.throwReleaseMs && toy.holder == .pet {
                let speed = pick(p.tossSpeed, random)
                let v = Velocity3(x: s.side * speed, y: (random() * 2 - 1) * speed * 0.3 * depth, z: pick(p.tossLift, random))
                toys.release(toy.id, .pet, v, s.side * (420 + random() * 480))
            }
            if now >= s.until { playPhase(s, "watch", pick(WATCH_MS, random)) }

        case "watch":
            brake(dt)
            if now < s.until { return }
            s.turns -= 1
            if s.turns <= 0 {
                pause()
                return
            }
            s.mayPounce = random() < p.pounceChance
            s.stalk = random() < p.stalkChance
            s.mayCharge = random() < p.chargeChance
            playPhase(s, "go", GO_MS)

        case "wait":
            // You've picked it up: he waits for you to throw it, eyes on it.
            brake(dt)
            if toy.holder != .user {
                s.excited = toy.thrownBy == .user
                playPhase(s, "go", GO_MS)
            } else if now >= s.until {
                confused()
            }

        default:
            break
        }
    }

    /// Somewhere to carry a block off to: a little way along the floor, mostly across the
    /// screen, whichever way there's more room.
    private func carryTo(_ s: BrainState, _ carryDistance: Range? = nil) -> Pt {
        let range = carryDistance ?? config.play.carryDistance
        let a = area
        let roomAhead = s.side > 0 ? a.maxX - pos.x : pos.x - a.minX
        let roomBehind = s.side > 0 ? pos.x - a.minX : a.maxX - pos.x
        // Mostly on the way he's facing, unless there's no room that way.
        let way = roomAhead >= range.min || roomAhead >= roomBehind ? s.side : -s.side
        let along = pick(range, random)
        let across = (random() * 2 - 1) * along * 0.4 * config.wander.floorDepth
        return clampToArea(Pt(x: pos.x + way * along, y: pos.y + across))
    }

    /// Where a goose runs off to with a block: well away, the other way from the pointer.
    private func stealTo() -> Pt {
        let cursor = input.cursor
        let awayAngle = cursor.map { atan2(pos.y - $0.y, pos.x - $0.x) } ?? random() * Double.pi * 2
        var best = pos
        var bestRoom = -1.0
        for _ in 0..<6 {
            let angle = awayAngle + (random() * 2 - 1) * 0.9
            let far = pick(GOOSE_STEAL_DISTANCE, random)
            let to = clampToArea(Pt(x: pos.x + cos(angle) * far, y: pos.y + sin(angle) * far * config.wander.floorDepth))
            let room = dist(to, pos) + (cursor.map { dist(to, $0) * 0.5 } ?? 0)
            if room > bestRoom {
                best = to
                bestRoom = room
            }
        }
        return best
    }

    /// Charging about, he sends flying any block in his way (not the one he's playing with).
    private func kickToys() {
        let speed = length(vel)
        if speed < config.play.kickSpeed * speedScale { return }
        let s = state
        // Not the one he's playing with, unless he's charging through it on purpose.
        let target = s.is(.play) && s.phase != "charge" ? s.toy : nil
        let radius = Swift.max(toys.size, input.size.width * 0.16)
        let depth = config.wander.floorDepth
        for toy in toys.toys {
            if toy.id == target || toy.holder != nil || toy.z > toys.size * 0.5 { continue }
            let dx = toy.x - pos.x
            let dy = (toy.y - pos.y) / depth
            let d = hypot(dx, dy)
            if d > radius { continue }
            // On along the way he's going, and off to whichever side it was.
            let side = d > 0 ? Pt(x: dx / d, y: (dy / d) * depth) : .zero
            let v = Velocity3(x: vel.x * 1.15 + side.x * 90, y: vel.y * 1.15 + side.y * 90, z: 140 + speed * 0.2)
            toys.hit(toy.id, v, jsSign(vel.x == 0 ? 1 : vel.x) * (300 + speed * 0.6))
        }
    }

    // MARK: - Output

    private func moving(_ speed: Double) -> AnimationName {
        speed > config.motion.walkSpeed * 1.5 ? .run : speed > 25 ? .walk : .idle
    }

    private func snapshot() -> PetSnapshot {
        let s = state
        let speed = length(vel)
        var animation: AnimationName = .idle
        var emote = Emote.none
        var phase: String?

        switch s.mode {
        case .idle:
            animation = speed > 25 ? .walk : .idle
        case .walk:
            animation = speed > config.motion.walkSpeed * 1.5 ? .run : speed < 8 ? .idle : .walk
        case .sit:
            animation = s.activity == "rest" ? .sit : s.activity == "honk" ? .attention : AnimationName(rawValue: s.activity) ?? .sit
        case .sleep:
            animation = .sleep
            emote = .z
        case .react:
            switch s.reaction! {
            case .surprised: animation = .surprised
            case .chase: animation = leaping ? .leap : .chase
            case .pounce: animation = .jump
            case .confused: animation = .confused
            case .flee: animation = .run
            case .hide:
                phase = s.phase
                animation = s.phase == "in" ? .run : s.phase == "out" ? .walk : .idle
            case .peek:
                phase = s.phase
                animation = s.phase == "beg" ? .attention : s.phase != "approach" ? .peek : moving(speed)
            case .dragged: animation = .dangle
            case .petted: animation = .happy
            case .zoomies:
                animation = leaping ? .leap : speed > config.motion.walkSpeed * 1.5 ? .chase : speed > 25 ? .walk : .idle
            case .play:
                phase = s.phase
                animation = playAnimation(s, speed)
            case .nap:
                animation = now < s.cross ? .angry : moving(speed)
            case .work:
                phase = s.phase
                animation = s.phase == "announce" ? .attention : s.phase == "angry" ? .angry : s.phase == "type" ? TASK_ANIMATION[s.task]! : moving(speed)
            case .away:
                phase = s.phase
                animation = s.phase == "gone" ? .idle : .run
            case .talk:
                // Sat listening, looking at you; his head tilting one way and the other, thinking.
                phase = s.phase
                animation = s.phase == "think" ? .confused : .sit
            }
        }

        let settled = s.mode == .idle || s.mode == .sit || s.mode == .sleep || (s.mode == .react && (
            s.reaction == .confused ||
            (s.reaction == .peek && s.phase == "watch") ||
            (s.reaction == .hide && s.phase == "wait") ||
            (s.reaction == .work && s.phase == "type") ||
            s.reaction == .talk ||
            (s.reaction == .away && s.phase == "gone")))

        var aim: Double?
        var lookAt: Pt?
        if s.is(.play) {
            let toy = toys.get(s.toy)
            if ["pounce", "bat", "toss", "lift", "throw"].contains(s.phase) {
                aim = s.side > 0 ? 0 : Double.pi
            } else if let toy, s.phase != "go" && s.phase != "carry" && dist(toy, pos) > 8 {
                aim = atan2(toy.y - pos.y, toy.x - pos.x)
            }
            // Eyes on the block, except while it's in his mouth.
            if let toy, toy.holder != .pet { lookAt = Pt(x: toy.x, y: toy.y - toy.z - toys.size / 2) }
        }
        let desk = input.desk
        if s.is(.work), let desk, s.phase == "type" {
            // Square on to the desk, eyes on the screen.
            aim = desk.facing > 0 ? 0 : Double.pi
            lookAt = desk.screen
        }
        let cross = (s.is(.work) && (s.phase == "announce" || s.phase == "angry")) || (s.is(.nap) && now < s.cross)
        if cross && speed < 25 {
            // Saying it to you: turned three-quarters towards you, never with his back to you.
            aim = facing > 0 ? 0.6 : Double.pi - 0.6
        }
        // Watching you carry his desk off.
        if s.is(.work) && s.phase == "angry" && deskHeld, let desk { lookAt = desk.screen }
        if s.is(.peek) && s.phase == "beg" { aim = facing > 0 ? 0.6 : Double.pi - 0.6 }
        // Talking with you, turned three-quarters towards you.
        if s.is(.talk) && speed < 25 { aim = facing > 0 ? 0.6 : Double.pi - 0.6 }
        let say = speech.flatMap { now < $0.until ? $0.text : nil }
        let screen: DeskTask? = s.is(.work) && s.phase == "type" && desk != nil ? s.task : nil

        return PetSnapshot(
            position: pos,
            velocity: vel,
            facing: facing,
            mode: s.mode,
            reaction: reaction,
            phase: phase,
            animation: animation,
            emote: emote,
            resting: settled && speed <= 1,
            aim: aim,
            lookAt: lookAt,
            say: say,
            screen: screen,
            hidden: s.is(.away) && s.phase == "gone"
        )
    }

    private func playAnimation(_ s: BrainState, _ speed: Double) -> AnimationName {
        let walk = config.motion.walkSpeed
        switch s.phase {
        case "go": return leaping ? .leap : speed > walk * 1.5 ? (s.excited ? .chase : .run) : speed > 25 ? .walk : .idle
        case "pounce": return .jump
        case "charge": return leaping ? .leap : speed > walk * 1.5 ? .chase : speed > 25 ? .walk : .idle
        case "stalk": return .stalk
        case "sniff": return .sniff
        case "nudge": return .nudge
        case "grab": return .toss
        case "fetch": return speed > 8 ? .fetch : .idle
        case "bat": return .bat
        case "toss": return .toss
        case "lift": return .lift
        case "carry": return .carry
        case "throw": return .throw
        default: return speed > 25 ? .walk : .idle
        }
    }
}
