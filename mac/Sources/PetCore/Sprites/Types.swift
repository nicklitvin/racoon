import Foundation

// Sprite model (src/sprites/types.ts). Behaviour code only ever names an animation ("walk",
// "sleep", ...); how that animation looks is up to the renderer, so the art can change without
// touching any logic.

public enum AnimationName: String, CaseIterable {
    case idle, walk, run, jump
    /// A bounding leap mid-run, from sheer excitement.
    case leap
    case sit, groom, yawn, peek, sleep, chase, surprised, confused, dangle, happy
    /// Swatting a toy along the floor with a front paw.
    case bat
    /// Picking a toy up and flinging it.
    case toss
    /// Picking a toy up in both hands and standing up with it, to carry it off (raccoons).
    case lift
    /// Walking along on the hind legs, the toy held in both hands.
    case carry
    /// Throwing the toy he's carrying, from up on his hind legs, and dropping back onto all fours.
    case `throw`
    /// Sat at his desk typing away in a terminal, now and then stopping to think.
    case work
    /// At his desk browsing the web: a paw on the mouse, clicking and scrolling, reading.
    case browse
    /// At his desk watching reels: leant back, flicking the mouse for the next one, giggling.
    case reels
    /// Trying to get your attention: up on his toes, waving, bouncing.
    case attention
    /// Cross: stamping a foot, ears back, a scowl.
    case angry
    /// Creeping up on a toy, low to the ground, bottom wiggling, before a pounce.
    case stalk
    /// Nose down to a toy, having a good sniff at it.
    case sniff
    /// Walking along with the head down, nosing a toy along in front.
    case nudge
    /// Trotting along, head up and proud, with a toy in the mouth.
    case fetch
}

/// How toy blocks are drawn: painted, outlined like a cartoon, inked, or in pixels.
public enum ToyLook: String {
    case paint, chibi, ink, pixel
}

/// How the eyes are drawn. "open" eyes blink now and then.
public enum EyeStyle: String {
    case open, closed, wide
}

/// The eyes in one frame: as the animation has them, or mid-blink.
public enum Eyes: String {
    case open, closed, wide, blink
}

/// What moves the animation along: the clock, or key presses (used by "peek", so the eyes
/// follow your typing).
public enum FrameDriver {
    case time, keystrokes
}

public struct AnimationSpec {
    /// How many times per second the pose is redrawn. Resting animations use a low rate,
    /// so an idle raccoon costs almost no CPU.
    public var fps: Double
    /// Length of one cycle; a non-looping animation holds its final pose.
    public var durationMs: Double
    public var loop: Bool
    public var eyes: EyeStyle
    public var driver: FrameDriver = .time

    public init(fps: Double, durationMs: Double, loop: Bool, eyes: EyeStyle, driver: FrameDriver = .time) {
        self.fps = fps
        self.durationMs = durationMs
        self.loop = loop
        self.eyes = eyes
        self.driver = driver
    }
}

/// A change to an animation's timing for one drawing (only the fps, for the pixel pets).
public struct SpecChange {
    public var fps: Double?
    public var durationMs: Double?
    public init(fps: Double? = nil, durationMs: Double? = nil) {
        self.fps = fps
        self.durationMs = durationMs
    }
}

/// One moment of an animation: everything a renderer needs to draw the pet.
public struct PetFrame {
    public var animation: AnimationName
    /// Time into the animation, already stepped to the animation's fps.
    public var timeMs: Double
    /// Key presses seen while this animation played (keystroke-driven animations only).
    public var keystrokes: Int
    public var eyes: Eyes
    /// Direction he faces on the ground, in radians, screen axes: 0 = right, PI/2 = down
    /// the screen (towards you). Only used by renderers that turn themselves.
    public var heading: Double?
    /// Wall-clock time of this frame in ms, for renderers that ease between poses on their own.
    public var clockMs: Double?
    /// How fast he's moving on screen, px/s, so legs can keep pace with the ground.
    public var velocity: Pt?
    /// Where the pointer is relative to his feet, in screen px, if it's close enough to look at.
    public var gaze: Pt?

    public init(animation: AnimationName, timeMs: Double, keystrokes: Int = 0, eyes: Eyes = .open, heading: Double? = nil, clockMs: Double? = nil, velocity: Pt? = nil, gaze: Pt? = nil) {
        self.animation = animation
        self.timeMs = timeMs
        self.keystrokes = keystrokes
        self.eyes = eyes
        self.heading = heading
        self.clockMs = clockMs
        self.velocity = velocity
        self.gaze = gaze
    }
}

/// Draws the pet into pixels. All the pets on offer are pixel art: each draws into a small
/// raster of palette indices, which the app shows with every pixel blown up into a crisp
/// square. The feet are at `anchor` within the picture.
public protocol PetRenderer: AnyObject {
    /// The picture, as palette indices (0 transparent), and the colours of each index.
    var raster: Raster { get }
    /// RGBA colours for each palette index (index 0 is transparent).
    var colours: [UInt32] { get }
    /// Screen px per art pixel at the current scale (a whole number of device pixels).
    var cell: Double { get }
    /// The drawn figure, without empty space round it, in art pixels; used for hit-testing.
    var figure: Box? { get }
    /// Size of the picture in px at scale 1.
    var baseSize: Size { get }
    /// Where the feet are, as fractions of the picture's width and height.
    var anchor: Pt { get }
    /// How far the feet sink past the bottom edge while peeking, in px at scale 1, so the face shows over it.
    var peekSink: Double? { get }
    /// Draws `frame.heading` itself, so the page must not mirror it.
    var turnsItself: Bool { get }
    /// Timing changes for this drawing.
    var animations: [AnimationName: SpecChange] { get }
    /// True while the drawing is still moving on its own since the last `draw`.
    func isSettling() -> Bool
    /// Where he's held when picked up (the scruff), in px from his feet at the current scale.
    func holdPoint() -> Pt?
    /// How far in front of his feet a toy block sits (its middle) for him to swat or pick up, px at scale 1.
    var toyReach: Double? { get }
    /// Edge of a toy block to go with this drawing, px at scale 1.
    var toySize: Double? { get }
    var toyLook: ToyLook { get }
    /// Where a toy block he has hold of is (its middle), in px from his feet at the current scale.
    func toyPoint() -> Pt?
    /// Drawn in pixels: placed on whole screen pixels, so they stay crisp.
    var pixelated: Bool { get }
    /// Can pick a toy up in its hands and walk off with it on its hind legs (a raccoon).
    var carriesToys: Bool { get }
    /// Where his front paws rest on a keyboard while he types, from his feet facing right, px at scale 1.
    var deskReach: Pt? { get }
    /// Where a front paw rests on the mouse, browsing, from his feet facing right, px at scale 1.
    var mouseReach: Pt? { get }
    /// Puts a hat on him and something round his neck (or takes them off).
    func dress(_ dress: Dress)
    /// Floats this far off the ground (its shadow on the ground under it), px at scale 1.
    var hover: Double { get }
    /// A goose, and it acts like one.
    var goose: Bool { get }
    /// Draws its own marks over its head (z's asleep), so the page shouldn't add its own.
    var drawsMarks: Bool { get }
    /// The device's pixels per point (2 on a Retina screen), for whole-pixel sizes.
    func setScale(_ scale: Double, devicePixelRatio: Double)
    /// Cheap to call every tick: only draws again when something changed. Returns whether it did.
    @discardableResult func draw(_ frame: PetFrame) -> Bool
}
