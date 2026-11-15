import Foundation
import PetCore

/// The settings, kept as JSON in the app's Application Support folder (inside its sandbox
/// container), saved a moment after each change. Everything that shows or acts on a setting
/// watches `settings`.
final class SettingsStore: ObservableObject {
    @Published private(set) var settings: Settings
    /// The keyboard permission prompt has been shown once; never show it again unasked.
    private(set) var keyboardPromptShown: Bool
    private let file: URL
    private var saveWork: DispatchWorkItem?

    init() {
        let folder = (FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory()))
            .appendingPathComponent("My Pet", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        file = folder.appendingPathComponent("settings.json")
        var raw: [String: Any] = [:]
        if let data = try? Data(contentsOf: file), let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { raw = parsed }
        settings = Settings.normalized(raw["settings"])
        keyboardPromptShown = isTrueValue(raw["keyboardPromptShown"])
    }

    /// Changes some settings (made valid as they go in), and saves them shortly.
    func update(_ change: (inout Settings) -> Void) {
        var next = settings
        change(&next)
        next = Settings.normalized(next.dictionary)
        if next == settings { return }
        settings = next
        scheduleSave()
    }

    func markKeyboardPromptShown() {
        keyboardPromptShown = true
        scheduleSave()
    }

    /// Writes any pending change now (on quit).
    func flush() {
        guard let work = saveWork else { return }
        work.cancel()
        saveWork = nil
        write()
    }

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.saveWork = nil
            self?.write()
        }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
    }

    private func write() {
        let body: [String: Any] = ["settings": settings.dictionary, "keyboardPromptShown": keyboardPromptShown]
        guard let data = try? JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted, .sortedKeys]) else { return }
        // Written to a temporary file and moved into place, so a crash mid-write can't leave a broken file.
        try? data.write(to: file, options: .atomic)
    }
}

private func isTrueValue(_ value: Any?) -> Bool {
    guard let n = value as? NSNumber else { return false }
    return n === (kCFBooleanTrue as NSNumber)
}
