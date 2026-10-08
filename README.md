# Racoon

A raccoon that lives on your screen. It wanders, floats, and reacts to what you're doing, without getting in the way of your work.

It runs two ways from one codebase:

- **Desktop** (Electron): a transparent, click-through overlay above all your windows. Windows first; macOS-specific code is isolated so it can follow.
- **Web** (Vite): the same raccoon in a browser tab, deployable to Vercel or any static host.

> **Status:** Stage 1 of 4 is done: the scaffold and the transparent click-through window. The sprite system, behaviour state machine, and activity reactions come next.

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev        # desktop app with hot reload for the UI
npm run dev:web    # browser version at http://localhost:5173
npm test           # unit tests
```

To quit the desktop app, right-click the raccoon icon in the system tray (Windows) or menu bar (macOS) and choose **Quit**. The app has no taskbar or Dock entry on purpose.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Electron. UI changes hot-reload; changes in `electron/` need a restart. |
| `npm run dev:web` | Browser-only dev server. |
| `npm run build` | Builds the web bundle (`dist/`) and the Electron main/preload (`dist-electron/`). |
| `npm start` | Production build, then runs it in Electron. |
| `npm run build:web` | Web bundle only; this is what Vercel runs. |
| `npm run typecheck` | Type-checks the renderer and the Electron code. |
| `npm test` | Vitest unit tests. |

## Project structure

```
electron/            Electron main process (Node side)
  main.ts            Window creation, click-through toggling, tray, display-change handling
  preload.ts         Exposes a small, typed API to the page as window.racoonHost
  platform/          Everything OS-specific, behind one PlatformAdapter interface
    windows.ts       App user model id, 'screen-saver' z-order level
    mac.ts           Hides the Dock icon, shows on all Spaces and over full-screen apps
shared/
  ipc.ts             IPC channel names and types shared by main, preload and renderer
src/                 Renderer (React), runs in Electron and in a browser
  core/              Plain TypeScript logic, no React or DOM: geometry, click-through decisions
                     (the behaviour state machine and activity tracking will live here)
  host/              "Where am I running?": the Electron bridge or a browser-tab fallback
  components/        React components that draw the raccoon
  App.tsx            Wires the host, the core logic and the components together
tests/               Vitest unit tests for src/core
scripts/             Dev runner and the esbuild bundler for electron/
assets/              Tray icon
```

The rule that keeps it portable: **`src/core` never imports React, the DOM, or Electron**, and **only `electron/platform/` checks `process.platform`**.

## How the overlay window works

- The window is frameless, transparent, always on top, hidden from the taskbar, and **never takes focus** (`focusable: false`, shown with `showInactive()`), so it can't steal focus from the app you're typing in.
- It covers the whole primary display. The raccoon walks on the **work area** floor, which sits above the taskbar or Dock. Changes to resolution, scaling, or attached monitors re-fit the window and keep the raccoon on screen.
- **Click-through:** the window starts with `setIgnoreMouseEvents(true, { forward: true })`. Clicks go to whatever is underneath, but mouse *moves* are still forwarded to the page. When the pointer comes within a few pixels of the raccoon, the page asks the main process to capture the mouse so you can drag it. Moving away hands the mouse back. This logic lives in `src/core/clickThrough.ts` and is unit-tested.

## Web version and Vercel

`npm run build:web` produces a static site in `dist/`. `vercel.json` is already set up: import the GitHub repo in Vercel and deploy, with no extra settings needed. It skips downloading the Electron binary during the Vercel install, since the web build doesn't need it.

In the browser, the page is the raccoon's world. Click-through and global input monitoring aren't possible there, so those features only affect the desktop app.

## Testing stage 1

1. `npm run dev`. The raccoon appears at the bottom centre of your screen with no window around it.
2. Click and type in the apps behind it. Nothing should be blocked, and focus should stay where it was.
3. Hover over the raccoon: the cursor becomes a grab hand. Drag it anywhere on screen.
4. Change display scaling or resolution. The raccoon stays visible.
5. Quit from the tray icon.

## Roadmap

- [x] Stage 1: scaffold, transparent click-through window, web build
- [ ] Stage 2: ASCII sprite system (idle, walk, run, jump, sit, peek, sleep, chase, surprised), blinking and tail wag
- [ ] Stage 3: behaviour state machine with tests (wander, float, sit, sleep, react)
- [ ] Stage 4: cursor reactions and the opt-in keyboard activity feature, settings panel, packaging
