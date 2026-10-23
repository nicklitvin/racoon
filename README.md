# My Pet

A little pixel-art pet that lives on your screen: a raccoon, a ginger cat or an otter (or, in beta, a floating puffball: switch it on in the patch notes). It wanders about, naps next to your mouse pointer, plays with its toy blocks, chases the cursor when you shake the mouse, and (if you let it) peeks up to watch you type.

## Download

**[Get the latest version from Releases →](https://github.com/nicklitvin/racoon/releases/latest)**

| Your computer | Download |
| --- | --- |
| Windows | `My-Pet-Windows.exe`: open it and your pet appears. |
| Mac (Apple silicon, M1 and later) | `My-Pet-Mac.dmg` |

The app isn't code-signed yet, so the first time you open it:

- **Windows:** if you see "Windows protected your PC", click **More info → Run anyway**.
- **Mac:** open the `.dmg` and drag My Pet to Applications. macOS blocks it at first (it may even say it's "damaged"). Run `xattr -cr "/Applications/My Pet.app"` in Terminal, or try to open it once, then click **Open Anyway** in **System Settings → Privacy & Security**.

My Pet has no taskbar or Dock icon: look for it in the system tray (Windows) or the menu bar (Mac).

## Using it

| To | Do this |
| --- | --- |
| Move your pet | Drag it |
| Pet it | Click it, then stroke it with the pointer |
| Play | Pick up a toy block and throw it: your pet chases after it |
| Open settings | Double-click your pet, or use the tray menu |
| Quit | Tray menu → Quit |

In the settings you can pick your pet, give it a hat and an outfit (or a whole costume: a dino, a bee, an astronaut, a knight, a wizard or a ballerina), and choose a **mode**:

- **Play:** it wanders, plays with its blocks, chases the pointer and watches you type.
- **Work:** it sits at a little desk in the corner and works away (typing, browsing, the odd reel). Drag it off and it stomps straight back, cross.
- **Sleep:** it curls up somewhere cosy and sleeps.
- **Hide:** it runs off the screen until you want it back.

It sits in a transparent layer above your windows, and clicks go straight through to whatever is underneath, except on the pet and its blocks.

## Privacy

"React to typing" is **off by default**. When it's on, My Pet only counts *that* a key was pressed, to work out how fast you're typing. It never reads which keys you press, and never records, stores or sends anything. Nothing leaves your computer. On a Mac this needs the Accessibility permission, which My Pet asks for once when you switch it on. The details, and how the code guarantees this, are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#privacy-how-the-keyboard-code-guarantees-it).

## Web version

The same pet also runs in a browser tab (`npm run dev:web`), ready to deploy to Vercel.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # desktop app, with hot reload
npm run dev:web    # browser version at http://localhost:5173
npm test           # unit tests
npm run dist:win   # My-Pet-Windows.exe in release/
```

Releases are automatic: every push to `main` that changes the app builds the Windows and Mac apps on GitHub's machines and updates the release for the version in `package.json` (`v0.1.0`). To start a new release, bump `version` in `package.json`.

How it all works, the project layout, adding animations, packaging and the testing checklist: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.
