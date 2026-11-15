import AppKit
import Combine
import PetCore
import SwiftUI

/// My Pet: a pixel pet that wanders about your screen, plays, works at its desk, naps, and talks
/// to Alarmie for you. The app's window is the settings, in the Dock like any other app; the pet
/// is out for as long as the app runs.
@main
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private let store = SettingsStore()
    private lazy var alarmie = AlarmieService(store: store)
    private let keyboardModel = KeyboardModel()
    private let keyPulse = PassthroughSubject<Void, Never>()
    private lazy var keyboardMonitor = KeyboardMonitor { [weak self] in self?.keyPulse.send(()) }
    private var pet: PetController?
    private var window: NSWindow?
    private var subscriptions = Set<AnyCancellable>()
    /// Set once the app is really quitting, so closing the window doesn't ask.
    private var quitting = false
    private var asking = false
    private var lastSettings: Settings?

    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let pet = PetController(store: store, alarmie: alarmie, keyboardPulse: keyPulse)
        self.pet = pet
        pet.start()
        makeWindow()
        // Opened at login, it starts out of the way: just the pet, the window in the Dock.
        if LoginItem.launchedAtLogin {
            window?.orderFront(nil)
            window?.miniaturize(nil)
        } else {
            showWindow()
        }
        lastSettings = store.settings
        // Fix up the login item to match the setting.
        LoginItem.apply(store.settings.launchAtLogin)
        syncKeyboard(prompt: false)
        alarmie.refresh()
        store.$settings.receive(on: DispatchQueue.main).sink { [weak self] next in self?.settingsChanged(next) }.store(in: &subscriptions)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWindow()
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        // Coming back from System Settings is the natural moment to notice a newly granted permission.
        if store.settings.keyboardReactions && !keyboardModel.listening { syncKeyboard(prompt: false) }
        alarmie.refresh()
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        quitting = true
        return .terminateNow
    }

    func applicationWillTerminate(_ notification: Notification) {
        keyboardMonitor.stop()
        pet?.stop()
        store.flush()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    // MARK: - The window

    private func makeWindow() {
        let content = SettingsView(store: store, alarmie: alarmie, keyboard: keyboardModel) { [weak self] in self?.syncKeyboard(prompt: false) }
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 780), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "My Pet"
        window.contentView = NSHostingView(rootView: content)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("Settings")
        self.window = window
    }

    @objc func showWindow() {
        guard let window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Closing the window asks first: quit (the pet goes too), or only hide the window and
    /// leave the pet out.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if quitting { return true }
        askBeforeClosing()
        return false
    }

    private func askBeforeClosing() {
        guard let window, !asking else { return }
        asking = true
        let alert = NSAlert()
        alert.messageText = "Quit My Pet?"
        alert.informativeText = "Quitting puts your pet away until you open My Pet again. Hide the window instead to keep your pet out. You can open it again from the Dock."
        alert.addButton(withTitle: "Hide window")
        alert.addButton(withTitle: "Quit")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { [weak self] response in
            self?.asking = false
            switch response {
            case .alertFirstButtonReturn: window.orderOut(nil)
            case .alertSecondButtonReturn: NSApp.terminate(nil)
            default: break
            }
        }
    }

    // MARK: - Settings

    private func settingsChanged(_ next: Settings) {
        let previous = lastSettings ?? next
        lastSettings = next
        if previous.keyboardReactions != next.keyboardReactions { syncKeyboard(prompt: next.keyboardReactions) }
        if previous.launchAtLogin != next.launchAtLogin { LoginItem.apply(next.launchAtLogin) }
        if previous.alarmieEndpoint != next.alarmieEndpoint { alarmie.refresh() }
    }

    /// Starts or stops counting key presses to match the setting. The permission prompt is shown
    /// at most once, and only right after you switch it on; after that it only checks quietly.
    private func syncKeyboard(prompt: Bool) {
        guard store.settings.keyboardReactions else {
            keyboardMonitor.stop()
            keyboardModel.listening = false
            keyboardModel.message = nil
            return
        }
        var allowed = KeyboardMonitor.allowed
        if !allowed && prompt && !store.keyboardPromptShown {
            store.markKeyboardPromptShown()
            allowed = KeyboardMonitor.requestAccess()
        }
        keyboardModel.allowed = allowed
        guard allowed else {
            keyboardMonitor.stop()
            keyboardModel.listening = false
            keyboardModel.message = "macOS hasn’t allowed My Pet to notice key presses. Open System Settings > Privacy & Security > Input Monitoring, switch My Pet on, then click “Check again”. Everything else keeps working without it."
            return
        }
        let error = keyboardMonitor.start()
        keyboardModel.listening = error == nil
        keyboardModel.message = error.map { "Couldn’t start counting key presses (\($0)). Everything else keeps working." }
    }

    // MARK: - Menus

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About My Pet", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let settings = appMenu.addItem(withTitle: "Settings…", action: #selector(showWindow), keyEquivalent: ",")
        settings.target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide My Pet", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit My Pet", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        // Copy and paste in the bubble and the address box.
        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = main
    }
}
