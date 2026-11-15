import AppKit
import PetCore

/// Alarmie, on this Mac: finding it, and talking to its live talk (see docs/ALARMIE.md for what
/// the endpoint takes and gives back). Nothing goes to Alarmie except what you type into the
/// pet's bubble or say after pressing its mic.
final class AlarmieService: ObservableObject {
    @Published private(set) var status = AlarmieStatus.none
    private let store: SettingsStore

    /// How long the endpoint has to answer when we only want to know it's there.
    private static let pingSeconds = 1.5
    /// How long Alarmie has to answer a message.
    private static let replySeconds = 60.0

    init(store: SettingsStore) {
        self.store = store
    }

    /// Looks for Alarmie again: installed (Launch Services knows its bundle id or name), or its
    /// live talk answering (while it runs from source).
    func refresh() {
        let installed = Self.installed()
        let endpoint = store.settings.alarmieEndpoint
        Task { [weak self] in
            let reachable = await Self.answers(endpoint)
            await MainActor.run {
                let next = AlarmieStatus(installed: installed, reachable: reachable)
                if self?.status != next { self?.status = next }
            }
        }
    }

    private static func installed() -> Bool {
        let workspace = NSWorkspace.shared
        if Alarmie.bundleIDs.contains(where: { workspace.urlForApplication(withBundleIdentifier: $0) != nil }) { return true }
        let name = "\(Alarmie.appName).app"
        let places = ["/Applications", (NSHomeDirectory() as NSString).appendingPathComponent("Applications")]
        return places.contains { FileManager.default.fileExists(atPath: ($0 as NSString).appendingPathComponent(name)) }
    }

    /// Whether anything answers at the endpoint (any HTTP answer at all, even an error, counts).
    private static func answers(_ endpoint: String) async -> Bool {
        guard let url = URL(string: endpoint) else { return false }
        var request = URLRequest(url: url, timeoutInterval: pingSeconds)
        request.httpMethod = "GET"
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return response is HTTPURLResponse
        } catch {
            return false
        }
    }

    enum Outcome {
        case reply(String, conversationId: String?)
        case failed(String)
    }

    /// Sends what was typed (or said) and waits for Alarmie's answer.
    func send(_ message: String, conversationId: String?) async -> Outcome {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return .failed("Type something to say first.") }
        guard let url = URL(string: store.settings.alarmieEndpoint) else { return .failed("That isn’t an http:// or https:// address.") }
        var request = URLRequest(url: url, timeoutInterval: Self.replySeconds)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json, text/plain", forHTTPHeaderField: "Accept")
        request.httpBody = try? JSONSerialization.data(withJSONObject: liveTalkRequest(text, conversationId))
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return .failed("Alarmie answered with nothing to say.") }
            if !(200..<300).contains(http.statusCode) {
                let reason = HTTPURLResponse.localizedString(forStatusCode: http.statusCode).capitalized
                return .failed("Alarmie couldn’t answer (\(http.statusCode) \(reason)).")
            }
            let body = String(data: data, encoding: .utf8) ?? ""
            guard let reply = readReply(body, http.value(forHTTPHeaderField: "Content-Type")) else { return .failed("Alarmie answered with nothing to say.") }
            return .reply(reply.reply, conversationId: reply.conversationId)
        } catch let error as URLError where error.code == .timedOut {
            return .failed("Alarmie took too long to answer.")
        } catch {
            return .failed("Couldn’t reach Alarmie. Is it open, with live talk on?")
        }
    }
}
