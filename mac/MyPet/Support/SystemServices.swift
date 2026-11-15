import AppKit
import CoreGraphics
import ServiceManagement

/// Counts key presses for typing reactions, only while you've switched them on. A listen-only
/// event tap: it hears *that* a key went down and when, never which key, and passes nothing on
/// but an empty pulse. macOS asks for Input Monitoring permission first.
final class KeyboardMonitor {
    private var tap: CFMachPort?
    private var source: CFRunLoopSource?
    private let pulse: () -> Void

    init(pulse: @escaping () -> Void) {
        self.pulse = pulse
    }

    /// Whether macOS lets the app listen for key presses (never shows a prompt).
    static var allowed: Bool { CGPreflightListenEventAccess() }

    /// Shows the system prompt (callers make sure this happens at most once).
    @discardableResult
    static func requestAccess() -> Bool { CGRequestListenEventAccess() }

    static func openPrivacySettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent") { NSWorkspace.shared.open(url) }
    }

    var listening: Bool { tap != nil }

    /// Starts listening; returns nil, or what went wrong.
    func start() -> String? {
        if tap != nil { return nil }
        let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
        let me = Unmanaged.passUnretained(self).toOpaque()
        guard let tap = CGEvent.tapCreate(tap: .cgSessionEventTap, place: .headInsertEventTap, options: .listenOnly, eventsOfInterest: mask, callback: { _, type, event, refcon in
            if type == .keyDown, let refcon {
                // An empty pulse: the event itself is never looked at.
                let monitor = Unmanaged<KeyboardMonitor>.fromOpaque(refcon).takeUnretainedValue()
                DispatchQueue.main.async { monitor.pulse() }
            } else if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput, let refcon {
                let monitor = Unmanaged<KeyboardMonitor>.fromOpaque(refcon).takeUnretainedValue()
                if let tap = monitor.tap { CGEvent.tapEnable(tap: tap, enable: true) }
            }
            return Unmanaged.passUnretained(event)
        }, userInfo: me) else {
            return "macOS didn’t allow it"
        }
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
        self.tap = tap
        self.source = source
        return nil
    }

    func stop() {
        if let tap { CGEvent.tapEnable(tap: tap, enable: false) }
        if let source { CFRunLoopRemoveSource(CFRunLoopGetMain(), source, .commonModes) }
        tap = nil
        source = nil
    }
}

/// Starting the app when you log in (Login Items, through Service Management).
enum LoginItem {
    static func apply(_ on: Bool) {
        let service = SMAppService.mainApp
        do {
            if on, service.status != .enabled { try service.register() }
            if !on, service.status == .enabled { try service.unregister() }
        } catch {
            NSLog("My Pet: couldn’t change the login item: \(error.localizedDescription)")
        }
    }

    /// Opened by macOS at login, rather than by you.
    static var launchedAtLogin: Bool {
        guard let event = NSAppleEventManager.shared().currentAppleEvent else { return false }
        return event.eventID == AEEventID(kAEOpenApplication) && event.paramDescriptor(forKeyword: AEKeyword(keyAEPropData))?.enumCodeValue == OSType(keyAELaunchedAsLogInItem)
    }
}
