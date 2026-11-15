import PetCore
import SwiftUI

/// Whether typing reactions are actually running, and what's in the way if not.
final class KeyboardModel: ObservableObject {
    @Published var listening = false
    @Published var allowed = true
    @Published var message: String?
}

/// The settings window (src/components/SettingsPanel.tsx): what the pet's up to, which pet,
/// what it wears, the desktop options, and talking to Alarmie when it's here. The version at
/// the top opens what's new, where beta pets are switched on.
struct SettingsView: View {
    @ObservedObject var store: SettingsStore
    @ObservedObject var alarmie: AlarmieService
    @ObservedObject var keyboard: KeyboardModel
    var recheckKeyboard: () -> Void
    @State private var showingNotes = false

    private var settings: Settings { store.settings }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if showingNotes {
                    PatchNotesView(beta: Binding(get: { settings.beta }, set: { on in store.update { $0.beta = on } }), back: { showingNotes = false })
                } else {
                    section("Mode") { modes }
                    section("Pet") { pets }
                    section("Hat", aside: hatLabel(settings.hat)) { hats }
                    section("Outfit", aside: outfitLabel(settings.outfit)) { outfits }
                    section("Desktop") { desktop }
                    if alarmie.status.available {
                        section("Alarmie") { alarmieRow }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 20)
        }
        .frame(width: 460)
        .frame(minHeight: 500, idealHeight: 780)
        .background(Theme.bg)
        .foregroundStyle(Theme.text)
        .onAppear { alarmie.refresh() }
    }

    private var header: some View {
        HStack {
            Text("My Pet").font(.system(size: 17, weight: .bold))
            Spacer()
            if !showingNotes {
                Button("v\(LATEST_PATCH_NOTE.date)") { showingNotes = true }
                    .buttonStyle(.plain)
                    .font(.system(size: 12.5))
                    .foregroundStyle(Theme.muted)
                    .help("What's new")
            }
        }
    }

    private func section<Content: View>(_ title: String, aside: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title.uppercased())
                    .font(.system(size: 11.5, weight: .semibold))
                    .tracking(0.7)
                    .foregroundStyle(Theme.muted)
                Spacer()
                if let aside { Text(aside).font(.system(size: 12.5, weight: .medium)) }
            }
            content()
        }
    }

    // MARK: - Mode

    private static let modeNames: [PetMode: String] = [.play: "Play", .work: "Work", .sleep: "Sleep", .hide: "Hide"]

    private var modes: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            ForEach(PetMode.allCases, id: \.self) { mode in
                let selected = mode == settings.mode
                Button {
                    store.update { $0.mode = mode }
                } label: {
                    VStack(spacing: 0) {
                        ModeScene(mode: mode, type: settings.raccoonType, dress: Dress(hat: settings.hat, outfit: settings.outfit))
                            .frame(height: 82)
                            .background(sceneBackground(mode))
                            .clipShape(RoundedRectangle(cornerRadius: 9))
                        Text(Self.modeNames[mode]!).font(.system(size: 12.5, weight: .semibold)).padding(.vertical, 6)
                    }
                    .padding(4)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.well))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
    }

    private func sceneBackground(_ mode: PetMode) -> some View {
        switch mode {
        case .play: return LinearGradient(colors: [Color(hex: "#dfe9f3"), Color(hex: "#b9c9a7")], startPoint: .top, endPoint: .bottom)
        case .work: return LinearGradient(colors: [Color(hex: "#f3e9dc"), Color(hex: "#e2d3bd")], startPoint: .top, endPoint: .bottom)
        case .sleep: return LinearGradient(colors: [Color(hex: "#2b3352"), Color(hex: "#474f73")], startPoint: .top, endPoint: .bottom)
        case .hide: return LinearGradient(colors: [Color(hex: "#eef1f4"), Color(hex: "#d8dde3")], startPoint: .top, endPoint: .bottom)
        }
    }

    // MARK: - Pet

    private var offered: [PetType] { PetType.allCases.filter { settings.beta || !BETA_TYPES.contains($0) } }

    private var pets: some View {
        let types = offered
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: types.count > 3 ? 4 : 3)
        return LazyVGrid(columns: columns, spacing: 8) {
            ForEach(types, id: \.self) { type in
                let selected = type == settings.raccoonType
                Button {
                    store.update { $0.raccoonType = type }
                } label: {
                    VStack(spacing: 4) {
                        PetPreview(type: type, pointsPerPixel: types.count > 3 ? 1.4 : 2)
                            .frame(height: types.count > 3 ? 64 : 92, alignment: .bottom)
                        Text(shortName(type)).font(.system(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: 12).fill(Theme.well))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected ? Theme.accent : .clear, lineWidth: 2))
                    .overlay(alignment: .topTrailing) {
                        if BETA_TYPES.contains(type) { BetaTag().padding(5) }
                    }
                }
                .buttonStyle(.plain)
                .help(PET_STYLES[type]!.label)
            }
        }
    }

    // MARK: - Hats and outfits

    private func hatLabel(_ hat: Hat) -> String { hat == .none ? "None" : HAT_ITEMS[hat]!.label }
    private func outfitLabel(_ outfit: Outfit) -> String { outfit == .none ? "None" : OUTFIT_ITEMS[outfit]!.label }

    private func wearGrid<T: Hashable>(_ options: [T], selected: T, item: @escaping (T) -> Wearable?, label: @escaping (T) -> String, pick: @escaping (T) -> Void) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
            ForEach(options, id: \.self) { id in
                Button {
                    pick(id)
                } label: {
                    WearIcon(item: item(id))
                        .frame(width: 34, height: 26)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.tile))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(id == selected ? Theme.accent : .clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .help(label(id))
                .accessibilityLabel(label(id))
            }
        }
    }

    private var hats: some View {
        wearGrid(Hat.allCases, selected: settings.hat, item: { hatItem($0) }, label: hatLabel) { hat in store.update { $0.hat = hat } }
    }

    private var outfits: some View {
        wearGrid(Outfit.allCases, selected: settings.outfit, item: { outfitItem($0) }, label: outfitLabel) { outfit in store.update { $0.outfit = outfit } }
    }

    // MARK: - Desktop

    private var desktop: some View {
        VStack(spacing: 0) {
            SwitchRow(label: "React to typing", isOn: Binding(get: { settings.keyboardReactions }, set: { on in store.update { $0.keyboardReactions = on } })) {
                DisclosureGroup("Counts key presses only, never which keys") {
                    Text("My Pet only notices that a key was pressed, and when, to work out your typing rate. It never reads which keys or characters you press, and never records, stores, logs or sends them anywhere. Timestamps older than a few seconds are thrown away, and nothing leaves your Mac. Counting stops completely when this is off.")
                        .font(.system(size: 12.5))
                        .foregroundStyle(Theme.muted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 6)
                }
                .font(.system(size: 12.5))
                .foregroundStyle(Theme.muted)
                if settings.keyboardReactions, !keyboard.listening, let message = keyboard.message {
                    Notice(message: message) {
                        if !keyboard.allowed {
                            Button("Open System Settings") { KeyboardMonitor.openPrivacySettings() }
                            Button("Check again") { recheckKeyboard() }
                        }
                    }
                }
            }
            Divider().overlay(Theme.wellStrong)
            SwitchRow(label: "Start at login", isOn: Binding(get: { settings.launchAtLogin }, set: { on in store.update { $0.launchAtLogin = on } })) { EmptyView() }
        }
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.well))
    }

    // MARK: - Alarmie

    private var alarmieRow: some View {
        SwitchRow(label: "Click your pet to talk to Alarmie", isOn: Binding(get: { settings.alarmieChat }, set: { on in store.update { $0.alarmieChat = on } })) {
            Text(alarmie.status.reachable
                ? "Click your pet and type (or press the mic) to ask Alarmie; the answer comes back in its speech bubble."
                : "Alarmie is here, but its live talk isn’t answering yet. Open Alarmie and turn live talk on.")
                .font(.system(size: 13))
                .foregroundStyle(alarmie.status.reachable ? Theme.ok : Theme.muted)
                .fixedSize(horizontal: false, vertical: true)
            EndpointField(value: settings.alarmieEndpoint) { endpoint in
                store.update { $0.alarmieEndpoint = endpoint }
                alarmie.refresh()
            }
        }
        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.well))
    }
}

/// An on/off row: the name, a switch, and maybe more under it.
struct SwitchRow<Extra: View>: View {
    let label: String
    @Binding var isOn: Bool
    @ViewBuilder var extra: () -> Extra

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: $isOn) { Text(label).font(.system(size: 14, weight: .medium)) }
                .toggleStyle(.switch)
                .tint(Theme.accent)
            extra()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

/// Something in the way, and what to do about it.
struct Notice<Actions: View>: View {
    let message: String
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).font(.system(size: 13)).fixedSize(horizontal: false, vertical: true)
            HStack { actions() }
        }
        .padding(10)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.noticeBg))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.noticeBorder))
    }
}

/// Where Alarmie's live talk is: changed when you leave the box or press Return.
struct EndpointField: View {
    let value: String
    let onChange: (String) -> Void
    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        DisclosureGroup("Connection") {
            VStack(alignment: .leading, spacing: 6) {
                Text("Live talk address").font(.system(size: 12.5))
                TextField("", text: $draft)
                    .textFieldStyle(.roundedBorder)
                    .focused($focused)
                    .onSubmit(commit)
                    .onChange(of: focused) { now in if !now { commit() } }
                if cleanEndpoint(draft) == nil {
                    Text("That isn’t an http:// or https:// address.").font(.system(size: 12.5))
                }
                if value != ALARMIE_DEFAULT_ENDPOINT {
                    Button("Back to the usual address") { onChange(ALARMIE_DEFAULT_ENDPOINT) }.buttonStyle(.link)
                }
            }
            .padding(.top, 6)
        }
        .font(.system(size: 12.5))
        .foregroundStyle(Theme.muted)
        .onAppear { draft = value }
        .onChange(of: value) { draft = $0 }
    }

    private func commit() {
        if let endpoint = cleanEndpoint(draft), endpoint != value { onChange(endpoint) }
    }
}

struct BetaTag: View {
    var body: some View {
        Text("Beta")
            .font(.system(size: 9.5, weight: .bold))
            .padding(.horizontal, 5)
            .padding(.vertical, 1.5)
            .background(Capsule().fill(Theme.accent))
            .foregroundStyle(Theme.accentText)
    }
}

/// What's changed, newest first, under the switch to try beta pets (src/components/PatchNotes.tsx).
struct PatchNotesView: View {
    @Binding var beta: Bool
    let back: () -> Void

    private static let input: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let output: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .long
        f.timeStyle = .none
        return f
    }()

    private func format(_ iso: String) -> String { Self.input.date(from: iso).map(Self.output.string(from:)) ?? iso }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Button("← Back", action: back).buttonStyle(.link)
                Text("What’s new").font(.system(size: 15, weight: .bold))
                Text("Running v\(LATEST_PATCH_NOTE.date)").font(.system(size: 13)).foregroundStyle(Theme.muted)
            }
            Toggle(isOn: $beta) {
                HStack(spacing: 6) {
                    Text("Try beta pets").font(.system(size: 14, weight: .medium))
                    BetaTag()
                }
            }
            .toggleStyle(.switch)
            .tint(Theme.accent)
            ForEach(PATCH_NOTES) { note in
                VStack(alignment: .leading, spacing: 4) {
                    Text(format(note.date)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                    HStack(spacing: 6) {
                        Text(note.title).font(.system(size: 14, weight: .semibold))
                        if note.beta { BetaTag() }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(note.changes, id: \.self) { change in
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text("•")
                                Text(change).fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.system(size: 13))
                        }
                    }
                }
            }
        }
    }
}
