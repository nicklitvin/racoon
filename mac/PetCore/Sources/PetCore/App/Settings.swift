import Foundation

// User settings (shared/settings.ts). Stored as JSON in the app's container, read back through
// `normalized`, which turns anything into valid settings.

/// The pets to choose from, in pixel art: a raccoon, a cat and an otter, and in beta a bunny,
/// a hedgehog, the goose and the floaties. The first one is the default.
public enum PetType: String, CaseIterable, Codable {
    case raccoonPixel = "raccoon-pixel"
    case catPixel = "cat-pixel"
    case otterPixel = "otter-pixel"
    case bunnyPixel = "bunny-pixel"
    case hedgehogPixel = "hedgehog-pixel"
    case goosePixel = "goose-pixel"
    case blipFloaty = "blip-floaty"
    case mochiFloaty = "mochi-floaty"
    case emberFloaty = "ember-floaty"
}

/// Pets still being tried out: only offered (and only kept) with `beta` switched on.
public let BETA_TYPES: [PetType] = [.bunnyPixel, .hedgehogPixel, .goosePixel, .blipFloaty, .mochiFloaty, .emberFloaty]

/// Hats to dress your pet up in.
public enum Hat: String, CaseIterable, Codable {
    case none, party, beanie, tophat, crown, cap, bow, nightcap, headphones, wizard, cowboy, chef, pirate, viking, santa, propeller, graduate, flowers, sombrero, beret
}

/// What to wear: a whole costume, clothes, or just something round the neck.
public enum Outfit: String, CaseIterable, Codable {
    case none, dino, bee, astronaut, knight, robe, tutu, suit, pajamas, sweater, cape, scarf, bowtie, bandana, collar
}

/// What the pet's up to: playing about, working at its desk, sleeping, or hiding off the screen.
public enum PetMode: String, CaseIterable, Codable {
    case play, work, sleep, hide
}

/// Strictly `true` (as JSON's true, not 1), as the TypeScript's `=== true`.
func isTrue(_ value: Any?) -> Bool {
    if let b = value as? Bool, !(value is NSNumber) { return b }
    guard let n = value as? NSNumber else { return false }
    return n === (kCFBooleanTrue as NSNumber)
}

public struct Settings: Equatable, Codable {
    /// Which pet.
    public var raccoonType: PetType
    /// Opt-in: react to typing rhythm. Counts key presses only, never which keys.
    public var keyboardReactions: Bool
    /// Start the app when you log in.
    public var launchAtLogin: Bool
    /// What the pet wears on its head, and round its neck.
    public var hat: Hat
    public var outfit: Outfit
    public var mode: PetMode
    /// Opt-in: try out the pets still in beta (switched on from the patch notes).
    public var beta: Bool
    /// Opt-in, with Alarmie on this Mac: clicking the pet opens a chat with Alarmie's live talk.
    public var alarmieChat: Bool
    /// Where Alarmie's live talk listens (see docs/ALARMIE.md).
    public var alarmieEndpoint: String

    public init(raccoonType: PetType = .raccoonPixel, keyboardReactions: Bool = false, launchAtLogin: Bool = false, hat: Hat = .none, outfit: Outfit = .none, mode: PetMode = .play, beta: Bool = false, alarmieChat: Bool = false, alarmieEndpoint: String = ALARMIE_DEFAULT_ENDPOINT) {
        self.raccoonType = raccoonType
        self.keyboardReactions = keyboardReactions
        self.launchAtLogin = launchAtLogin
        self.hat = hat
        self.outfit = outfit
        self.mode = mode
        self.beta = beta
        self.alarmieChat = alarmieChat
        self.alarmieEndpoint = alarmieEndpoint
    }

    public static let defaults = Settings()

    /// The nearest pet on offer to one that isn't: the same animal in pixel art (a fox gets the
    /// cat, the nearest thing to one). Anything else gets the default.
    static func nearest(_ type: String) -> PetType? {
        if type.hasPrefix("raccoon-") { return .raccoonPixel }
        if type.hasPrefix("cat-") || type.hasPrefix("fox-") { return .catPixel }
        if type.hasPrefix("otter-") { return .otterPixel }
        return nil
    }

    /// Turns anything (a parsed file) into valid settings, falling back to defaults.
    public static func normalized(_ raw: Any?) -> Settings {
        let r = raw as? [String: Any] ?? [:]
        let beta = isTrue(r["beta"])
        let asked = r["raccoonType"] as? String ?? ""
        let type = PetType(rawValue: asked)
        let offered = type != nil && (beta || !BETA_TYPES.contains(type!))
        var mode = PetMode.play
        if let m = r["mode"] as? String, let parsed = PetMode(rawValue: m) { mode = parsed } else if isTrue(r["workMode"]) { mode = .work }
        return Settings(
            raccoonType: offered ? type! : (nearest(asked) ?? defaults.raccoonType),
            keyboardReactions: isTrue(r["keyboardReactions"]),
            launchAtLogin: isTrue(r["launchAtLogin"]),
            hat: (r["hat"] as? String).flatMap(Hat.init(rawValue:)) ?? defaults.hat,
            outfit: (r["outfit"] as? String).flatMap(Outfit.init(rawValue:)) ?? defaults.outfit,
            mode: mode,
            beta: beta,
            alarmieChat: isTrue(r["alarmieChat"]),
            alarmieEndpoint: cleanEndpoint(r["alarmieEndpoint"]) ?? defaults.alarmieEndpoint
        )
    }

    /// As a JSON-ready dictionary, the same shape the Electron app stores.
    public var dictionary: [String: Any] {
        [
            "raccoonType": raccoonType.rawValue,
            "keyboardReactions": keyboardReactions,
            "launchAtLogin": launchAtLogin,
            "hat": hat.rawValue,
            "outfit": outfit.rawValue,
            "mode": mode.rawValue,
            "beta": beta,
            "alarmieChat": alarmieChat,
            "alarmieEndpoint": alarmieEndpoint,
        ]
    }
}
