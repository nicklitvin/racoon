# Racoon

A raccoon that lives on your screen. It wanders all over your screen, sits down to groom and yawn, and naps when nothing is happening. Shake your mouse and it jumps out and chases the cursor, pounces when the cursor stops, then sits looking confused. Get the cursor too close and it may run off or hide behind the edge of the screen. If you opt in, it also comes to watch you type, peeking up over the bottom edge with its eyes following your rhythm.

It runs two ways from one codebase:

- **Desktop** (Electron + React + TypeScript): a transparent, click-through overlay above all your windows. Built for Windows first; everything OS-specific is behind one adapter, and the macOS adapter is already written.
- **Web** (Vite): the same raccoon in a browser tab, ready to deploy to Vercel.

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev        # desktop app, with hot reload for the UI
npm run dev:web    # browser version at http://localhost:5173
npm test           # unit tests
```

**Using the desktop app**

| Action | How |
| --- | --- |
| Move the raccoon | Drag it |
| Startle it | Click it |
| Open settings | Double-click it, left-click the tray icon (Windows), or tray menu > Settings… |
| Hide it for a while | Tray menu > uncheck *Show raccoon* |
| Quit | Tray menu > Quit |

The app has no taskbar or Dock entry on purpose; it lives in the system tray (Windows) or menu bar (macOS).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + Electron. UI changes hot-reload; changes in `electron/` need a restart. |
| `npm run dev:web` | Browser-only dev server. |
| `npm run build` | Web bundle (`dist/`) + Electron main/preload (`dist-electron/`). |
| `npm start` | Production build, run in Electron. |
| `npm run build:web` | Web bundle only. This is what Vercel runs. |
| `npm run dist:win` | Windows installer and portable `.exe` in `release/`. |
| `npm run dist:mac` | macOS `.dmg` (must run on a Mac; see below). |
| `npm run typecheck` | Type-checks the renderer and the Electron code. |
| `npm test` | Vitest unit tests (state machine, activity tracking, sprites, settings, click-through). |

## Project structure

```
electron/                 Electron main process (Node side)
  main.ts                 Pet overlay window, click-through, settings window, tray, IPC, startup
  preload.ts              Exposes a small, typed API to the page as window.racoonHost
  cursorMonitor.ts        Polls screen.getCursorScreenPoint() at 40 Hz, sends only changes
  keyboardMonitor.ts      Opt-in key-press counter (uiohook-napi). Never reads which key.
  settingsStore.ts        Settings as JSON in the app's user-data folder
  platform/               Everything OS-specific, behind one PlatformAdapter interface
    windows.ts            App id, z-order level, tray behaviour
    mac.ts                Hidden Dock icon, all Spaces, Accessibility/Input Monitoring permission
shared/                   Used by both the main process and the page
  ipc.ts                  IPC channel names and the HostBridge API type
  settings.ts             Settings type, defaults, ranges and validation
src/                      The page (React). Runs in Electron and in a browser
  core/                   Plain TypeScript: no React, no DOM, no Electron. All unit-tested
    behavior/brain.ts     The behaviour state machine and movement
    behavior/config.ts    Tuning for every behaviour (wander timings, speeds, thresholds)
    behavior/motion.ts    Steering, easing, Bezier paths, seeded random numbers
    activity/cursor.ts    Rolling-window cursor speed, path length, erratic-ness
    activity/typing.ts    Rolling-window typing rate (timestamps only)
    animator.ts           Keeps each animation's clock and handles blinking
    clickThrough.ts       Decides when the overlay should capture the mouse
    geometry.ts           Small geometry helpers
  sprites/                The art
    types.ts              Animation names, timing specs and the RaccoonRenderer interface
    animations.ts         Timing for every animation (fps, length, loop, eyes)
    rig.ts                The skeleton: joint positions and the kinematics poses use
    pose.ts               Every animation as a pure function of time -> pose
    svgRaccoon.ts         The SVG renderer: builds the drawing once, applies poses
  runtime/petRuntime.ts   Connects core logic to the DOM; runs the animation loop
  host/                   "Where am I running?": Electron bridge or browser fallback
  components/             React: the pet page and the settings panel
tests/                    Vitest unit tests
scripts/                  Dev runner and esbuild bundling for electron/
assets/                   Tray icon (used at runtime)
build/                    App icon (used by the packager)
```

Two rules keep this portable and testable: **`src/core` never imports React, the DOM or Electron**, and **only `electron/platform/` branches on the operating system**.

## How it works

### The overlay window

- Frameless, transparent, always on top, no taskbar or Dock entry, and **never focusable** (`focusable: false`, shown with `showInactive()`), so it can't take focus from the app you're typing in.
- It covers the whole primary display. The raccoon's world is the display's **work area**, so it walks along the top of the taskbar or Dock. Changes to resolution, scaling or connected monitors re-fit the window, and the raccoon is kept on screen.
- **Click-through:** the window starts with `setIgnoreMouseEvents(true, { forward: true })`, so clicks pass straight through to whatever is underneath. Using the polled cursor position and forwarded mouse moves, the page asks the main process to capture the mouse only while the pointer is over the visible part of the raccoon, and to release it as soon as the pointer leaves.

### Behaviour

`Brain` (`src/core/behavior/brain.ts`) is a state machine with the modes **idle, walk, sit, sleep** and **react**. Reactions are **surprised, chase, pounce, confused, flee, hide, peek** and **dragged**.

- **Wandering:** the whole work area is the raccoon's world; there is no floor and no gravity. After each pause it picks something to do: walk to a random point anywhere on screen, sit and groom or yawn, or just turn round and look about. After about 3 calm minutes it yawns and falls asleep. Dropping it after a drag leaves it exactly where you let go.
- **Organic movement:** walks follow a gently curved path with ease-in-out speed, and each walk varies a little in distance, curve and top speed. Everything else (chasing, fleeing, pouncing) goes through velocity with limited acceleration ("arrive" steering). Nothing ever teleports; the tests check this on every simulated frame.
- **Tuning:** all timings and distances live in `DEFAULT_CONFIG` in `src/core/behavior/config.ts`, grouped by behaviour. For wandering: `wander.walkDistance`, `pauseMs`, `speedJitter`, `curve`, `sitChance`, `sitMs`, `lookAroundChance` and `sleepAfterMs`. These are developer settings, compiled in; they aren't in the user's `settings.json`.
- **Deterministic:** time only advances when `update(dt, world)` is called, and randomness is injected, so the tests replay exact scenarios.

### Reactions to the cursor

`CursorActivityTracker` keeps a 1-second rolling window of cursor samples and measures speed, path length and sharp direction changes. When movement stays fast, or fast-and-zig-zagging, for about 1.5 seconds (scaled by the sensitivity setting), the raccoon jumps out with a "!" and chases the cursor. When the cursor stops it pounces, lands, and sits with a "?". A cursor that gets close may make it run away, or hide behind the screen edge if it's cornered, peeking back out once the coast is clear.

### Reactions to typing (opt-in)

When typing has been steady for a few seconds, the raccoon goes to the bottom edge and peeks up over it. Its eyes move with each key press. About 5 seconds after you stop, it climbs back out and carries on. See **Privacy** below for exactly what is measured.

### Performance

The page doesn't re-render React per frame; the runtime writes a CSS transform, and the SVG renderer only touches the attributes that changed. While the raccoon moves it updates at the display's refresh rate (60 fps). While it rests (sitting, sleeping, idling, watching) it drops to a slow timer of at most 4 ticks per second, and resting animations only change pose 4–10 times a second. Cursor polling only sends updates when the cursor actually moves.

Measured on the development machine (Windows 10, 12 cores): about **0.3% of one core while resting** (~0.03% of total CPU), and 6–10% of one core while walking (~0.5–0.8% of total CPU). Almost all of the moving cost is the GPU compositing a full-screen transparent window.

## Privacy: keyboard reactions

Keyboard reactions are **off by default**, and nothing related to the keyboard is loaded until you switch them on in settings.

**What is measured:** only *that* a key was pressed, and when.

**What is never measured:** which key, which character, modifier keys, or anything you type. Nothing is recorded, stored, logged or transmitted.

How the code guarantees it:

- `electron/keyboardMonitor.ts`: the uiohook `keydown` listener takes **no parameters**, so the event object (key code, character) is never read. Each press becomes an empty IPC message with no payload.
- `electron/preload.ts` drops any payload on that channel anyway; the page only ever learns "a key was pressed".
- `src/core/activity/typing.ts` accepts nothing but a timestamp, keeps only the last 5 seconds of timestamps, and clears them when the feature is switched off.
- The native hook is loaded on first use and stopped when you turn the feature off, hide the raccoon, or quit. Settings are saved locally in `settings.json` in the app's user-data folder, and the app makes no network requests.

In the browser build, typing reactions are always on, since there's no system-wide hook: the page only counts key presses made while its tab is focused, and never reads which key.

**macOS:** listening for key presses system-wide needs the Accessibility permission (macOS may also list Racoon under Input Monitoring). The system prompt is shown **at most once**, right after you switch the feature on. If access is denied, the settings panel explains what to do, with buttons to open System Settings and to check again. It never re-prompts by itself, and everything else keeps working.

## Adding or changing animations

The raccoon is inline SVG, drawn by `createSvgRaccoon()` in `src/sprites/svgRaccoon.ts`. It's built from simple shapes hung off a small skeleton (`src/sprites/rig.ts`): hip, shoulders, neck, tail root and four legs. An animation is a pure function from time to a `Pose` (body pitch and bounce, leg angles, head and tail angles, where the eyes look, ears, mouth) in `src/sprites/pose.ts`; the renderer turns a pose into SVG transforms. The drawing faces right and is mirrored when the raccoon faces left. Colours are CSS variables (`--r-fur`, `--r-dark`, ...) in `src/styles.css`.

To add an animation:

1. Add the name to `ANIMATION_NAMES` in `src/sprites/types.ts`.
2. Give it timing in `src/sprites/animations.ts`:
   ```ts
   wave: { fps: 30, durationMs: 800, loop: true, eyes: 'open' },
   ```
   - `fps`: how often the pose is redrawn. Keep it low (4–10) for resting animations so they stay cheap.
   - `loop: false` holds the final pose.
   - `eyes`: `'open'` (blinks now and then), `'closed'` or `'wide'`.
   - `driver: 'keystrokes'`: driven by key presses instead of time (used by `peek`).
3. Add a `case` to `poseFor()` in `src/sprites/pose.ts`. Start from `standing()` or `sitting(t)` and change what moves. `plantedLeg()` sizes a leg so its paw just reaches the ground.
4. Pick it in `Brain.snapshot()` (`src/core/behavior/brain.ts`).

TypeScript points out anything missing. `npm test` checks every pose for bad numbers, keeps it inside the drawing's box, and checks that standing and sitting paws stay on the ground.

**Another art style:** behaviour code only ever names animations, and the page only talks to the `RaccoonRenderer` interface (`src/sprites/types.ts`). To swap the art, write another renderer and create it in `PetRuntime` instead of `createSvgRaccoon()`; nothing in `src/core` changes.

## Building and packaging

### Windows

```bash
npm run dist:win
```

This produces `release/Racoon-Setup-<version>.exe` (a one-click per-user installer) and `release/Racoon-Portable-<version>.exe` (no install). The keyboard hook (`uiohook-napi`) ships prebuilt N-API binaries, so packaging needs no C++ toolchain (`npmRebuild` is off). The builds are **unsigned**, so Windows SmartScreen will warn on first run until you sign them with a code-signing certificate (set `CSC_LINK` / `CSC_KEY_PASSWORD`).

"Start when I log in" uses Electron's login-item API and only takes effect in the installed app, not in `npm run dev`.

### macOS

Build on a Mac (electron-builder can't produce a signed `.dmg` from Windows):

```bash
npm install
npm run dist:mac   # release/Racoon-<version>-arm64.dmg and -x64.dmg
```

Already handled:

- `LSUIElement` keeps the app out of the Dock and the app switcher; the window shows on all Spaces and over full-screen apps.
- The keyboard permission flow is in `electron/platform/mac.ts` (see **Privacy**).
- Prebuilt `uiohook-napi` binaries for arm64 and x64 are included.

To distribute to others:

- **Sign and notarize**, otherwise Gatekeeper blocks the app and the Accessibility permission won't stick between builds. Set `CSC_LINK`/`CSC_KEY_PASSWORD` for a Developer ID certificate and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarization, then add `"notarize": true` and `"hardenedRuntime": true` under `build.mac`.
- Each newly signed build may need the Accessibility permission granted again during development.
- Test the overlay on a Mac: the window level (`floating`), menu-bar height and notch handling are configured but haven't been run on macOS yet.

## Web version and Vercel

`npm run build:web` produces a static site in `dist/`, and `vercel.json` is ready: import the GitHub repo in Vercel and deploy with no extra settings. The install step skips downloading Electron, since the web build doesn't need it.

In the browser, the page is the raccoon's whole world. Wandering, chasing, pouncing, fleeing, hiding, dragging and settings all work. Click-through isn't possible in a page, and typing reactions are always on but only count key presses inside the tab. Settings are kept in `localStorage`.

## Testing checklist

1. `npm run dev`. The raccoon appears at the bottom of the screen with no window around it. Click and type in the apps behind it: nothing is blocked and focus doesn't move.
2. Leave it alone for a minute: it walks all over the screen (not just along the bottom) with smooth starts and stops, sits, grooms and yawns. Leave it for about 3 minutes and it falls asleep ("z Z").
3. Shake the mouse hard for a couple of seconds: "!", then it chases the cursor. Stop: it pounces, then sits with "?".
4. Move the cursor slowly onto it: it often runs away; near a screen edge it hides behind the edge and peeks back out.
5. Drag it and let go: it dangles while held and stays where you drop it. Click it: it startles.
6. Settings (double-click it): change size and speed and watch them apply live. Turn on "React to typing" and type steadily for a few seconds: it peeks over the bottom edge and its eyes follow your typing. Stop typing: it comes back out after about 5 seconds.
7. Change display scaling or resolution: it stays on screen.
8. Quit from the tray icon.
