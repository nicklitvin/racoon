# My Pet for Mac (Swift)

The Mac App Store version of My Pet, in Swift: the same pets, behaviour, toys, desk, hats and outfits as the Electron app, and the same Alarmie bubble, as a native AppKit app.

## What's where

```
mac/
  MyPet.xcodeproj         The Xcode project (one app target, "MyPet"; the scheme is shared)
  MyPet-Info.plist        Info.plist: mic and speech recognition prompts, local networking for Alarmie
  MyPet.entitlements      App Sandbox, outgoing connections (Alarmie), audio input (the mic)
  MyPet/                  The app (every file in here is in the target: Xcode 16 folder sync)
    App/AppDelegate.swift   Start-up, menus, the settings window (closing it asks first), keyboard opt-in
    Pet/PetPanel.swift      The pet's window: transparent, over every app, on every Space
    Pet/PetController.swift The animation loop and everything on screen (port of src/runtime/*)
    Pet/PetView.swift       The layers the pet, toys and desk are shown in; the mouse
    Pet/SpeechBubbleView    What he says
    Alarmie/                The Alarmie bubble, talking to its endpoint, dictation for the mic
    Settings/               The settings window (SwiftUI), its pictures and colours
    Support/                Settings storage, pixel images, key-press counting, login item
    Assets.xcassets         The app icon
  PetCore/                A Swift package with everything that isn't AppKit, tested with `swift test`
    Sources/PetCore/Core      The behaviour (Brain), motion, the toy blocks' physics, trackers
    Sources/PetCore/Sprites   Every pet's drawing, in pixels, ported from src/sprites
    Sources/PetCore/App       Settings, the Alarmie contract, the patch notes
    Tests/PetCoreTests        Tests for the drawing, the behaviour and the settings
```

The behaviour and the drawing are ported line for line from the TypeScript, with JavaScript's rounding (`jsRound`, `jsMod`) where it differs from Swift's, so every pixel lands where the Electron app puts it.

## Running it

1. Open `mac/MyPet.xcodeproj` in Xcode 16 or later (macOS 13+ to run).
2. Select the **MyPet** target > **Signing & Capabilities**, and pick your team. The bundle id is `com.nicklitvin.mypet`; change it there if you need to.
3. Run (⌘R). The settings window opens and the pet comes out at the bottom of the screen.

`swift test` in `mac/PetCore` runs the package's tests. GitHub Actions (`.github/workflows/mac-app.yml`) builds the package, runs its tests and builds the app on every push that touches `mac/`.

## Things to check by hand

These can't be checked on CI (no screen there):

- **The pet:** wanders, sits, naps after a few quiet minutes, chases a shaken pointer, runs from a close one. Dragging him lifts him by the scruff; letting go drops him there; a click pats him.
- **Clicks go through** everywhere except over the pet, his blocks, his desk and his bubble.
- **Toys:** drag a block and throw it (he chases it), click one to flip it.
- **Modes:** Work puts his desk in the bottom right (drag it elsewhere; he follows, cross), Sleep, Hide.
- **Every pet, hat and outfit** in the settings, and the beta pets (switched on from What's new).
- **React to typing:** switch it on, allow Input Monitoring when macOS asks; type for a few seconds and he comes to the bottom of the screen and peeks.
- **Start at login:** shows under System Settings > General > Login Items.
- **Closing the settings window** asks: Hide window (the pet stays; the Dock icon brings it back), Quit, Cancel.
- **Alarmie:** with Alarmie installed or its endpoint answering, the settings show the Alarmie section. Click the pet and a bubble opens to type in: he sits and listens; after Enter, he tilts his head while it thinks; the answer comes back in the bubble with room to reply. The mic asks for microphone and speech recognition access, then types what you say into the box as you talk. Escape, the ×, or clicking elsewhere closes it.

To try Alarmie without Alarmie, run the stand-in from `docs/ALARMIE.md` (`node fake-alarmie.js`), which answers on `127.0.0.1:4318`.

## Publishing to the Mac App Store

1. **Apple Developer Program** membership on your Apple ID (developer.apple.com).
2. **App Store Connect** (appstoreconnect.apple.com) > Apps > **+** > New App: platform macOS, name "My Pet" (or whatever's free), bundle id `com.nicklitvin.mypet` (register it under Certificates, IDs & Profiles first if it isn't listed), SKU of your choice.
3. In Xcode: set **Version** (MARKETING_VERSION, e.g. 1.0) and **Build** (CURRENT_PROJECT_VERSION, raise it for every upload) on the target's General tab.
4. **Product > Archive** (with "Any Mac" as the destination). When it's done the Organizer opens: **Distribute App > App Store Connect > Upload**. Xcode signs it for the App Store with your team.
5. Back in App Store Connect: fill in the description, keywords, a support URL, a privacy policy URL, the age rating, screenshots (at least one, 1280×800 or larger), and the **App Privacy** answers. My Pet collects nothing; what you type or say to Alarmie goes to Alarmie on your own Mac, not to a server of yours. Pick the uploaded build, then **Submit for Review**.

**Notes for review:** a reviewer won't have Alarmie, so the Alarmie section stays hidden for them; say so in the review notes, and that typing reactions use Input Monitoring only to count key presses (never which keys) when the user switches it on.

## Differences from the Electron app

- **No built-in updater:** the App Store updates it.
- **The mic** turns speech into text on the Mac (Apple's speech recognition) and sends the words to Alarmie, so Alarmie only ever gets `message` from this app, never `audio`.
- **No virtual desktop handling:** the pet's window is on every Space and doesn't slide with them, so there's nothing to hide.
- **Patch notes** come from `src/lib/patchNotes.ts`: after adding one, run `node scripts/swift-patch-notes.mjs` to update `PatchNotes.swift`.
- **Alarmie's bundle id:** if it isn't `com.nicklitvin.alarmie`, change `Alarmie.bundleIDs` in `PetCore/Sources/PetCore/App/Alarmie.swift`.
