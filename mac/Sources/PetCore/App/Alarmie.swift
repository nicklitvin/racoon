import Foundation

// Talking to Alarmie's live talk (shared/alarmie.ts): the same contract as the Electron app.
// docs/ALARMIE.md describes it for Alarmie's side.

/// Where Alarmie's live talk listens unless the settings say otherwise.
public let ALARMIE_DEFAULT_ENDPOINT = "http://127.0.0.1:4318/live-talk"

/// Longest endpoint the settings keep.
private let MAX_ENDPOINT_LENGTH = 300
/// Longest message sent in one go, and longest reply shown.
public let MAX_MESSAGE_LENGTH = 4000

public enum Alarmie {
    /// What it's called, and its bundle ids, to find it on the Mac.
    public static let appName = "Alarmie"
    public static let bundleIDs = ["com.nicklitvin.alarmie", "com.nicklitvin.Alarmie"]
}

public struct AlarmieStatus: Equatable {
    /// Alarmie's app is installed.
    public var installed: Bool
    /// Its live talk answered at the endpoint.
    public var reachable: Bool
    /// Clicking the pet can open the chat.
    public var available: Bool { installed || reachable }

    public init(installed: Bool, reachable: Bool) {
        self.installed = installed
        self.reachable = reachable
    }

    public static let none = AlarmieStatus(installed: false, reachable: false)
}

/// One line of the chat.
public struct ChatMessage: Identifiable, Equatable {
    public enum From { case me, alarmie }
    public let id = UUID()
    public var from: From
    public var text: String
    public init(from: From, text: String) {
        self.from = from
        self.text = text
    }
}

/// A usable http(s) endpoint, trimmed, or nil.
public func cleanEndpoint(_ raw: Any?) -> String? {
    guard let s = raw as? String else { return nil }
    let value = s.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.isEmpty || value.count > MAX_ENDPOINT_LENGTH { return nil }
    guard let url = URL(string: value), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https", url.host != nil else { return nil }
    return value
}

/// What's sent to the endpoint, as JSON.
public func liveTalkRequest(_ message: String, _ conversationId: String?) -> [String: Any] {
    [
        "message": String(message.prefix(MAX_MESSAGE_LENGTH)),
        "conversationId": conversationId.map { $0 as Any } ?? NSNull(),
        "client": "my-pet",
    ]
}

public struct Reply: Equatable {
    public var reply: String
    public var conversationId: String?
}

/// Alarmie's answer, from the body of its response: JSON with `reply` (or `message` or `text`)
/// and maybe a `conversationId`, or else the plain text of the body.
public func readReply(_ body: String, _ contentType: String?) -> Reply? {
    let text = body.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty { return nil }
    let json = (contentType ?? "").lowercased().contains("json") || text.hasPrefix("{")
    if json, let data = text.data(using: .utf8), let parsed = try? JSONSerialization.jsonObject(with: data), let object = parsed as? [String: Any] {
        let reply = [object["reply"], object["message"], object["text"]]
            .compactMap { $0 as? String }
            .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        guard let reply else { return nil }
        let id = object["conversationId"] ?? object["conversation_id"]
        var conversation: String?
        if let s = id as? String, !s.isEmpty { conversation = s } else if let n = id as? NSNumber, !(id is Bool) { conversation = n.stringValue }
        return Reply(reply: String(reply.trimmingCharacters(in: .whitespacesAndNewlines).prefix(MAX_MESSAGE_LENGTH)), conversationId: conversation)
    }
    return Reply(reply: String(text.prefix(MAX_MESSAGE_LENGTH)), conversationId: nil)
}
