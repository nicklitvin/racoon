# Racoon

A raccoon that lives on your screen. It wanders all over your screen, sits down to groom and yawn, and when nothing is happening it goes for a nap: curled up right next to your mouse pointer if you've left it resting somewhere, or else somewhere out of the way. Now and then it gets the zoomies and dashes about, leaping as it goes. Shake your mouse and it jumps out and chases the cursor, leaping with excitement, pounces when the cursor stops, then sits looking confused. Click it to pet it, and stroke it to keep it happy. Get the cursor too close and it may run off or hide behind the edge of the screen. If you opt in, it also comes to watch you type, peeking up over the bottom edge with its eyes following your rhythm.

The pets are pixel art, drawn in chunky whole pixels like sprites from an old game: a raccoon, a ginger cat and an otter. You don't have to have the raccoon. The otter swims about your screen instead of walking, in its own little pixel pond: it paddles along with its head up, porpoises when it's excited, treads water to look about and floats on its back with its shell to rest.

(The code also has lifelike and 2D chibi drawings of a raccoon, cats, a fox and an otter, in `src/sprites/critter` and `src/sprites/chibi`. They aren't offered in the settings for now; the pixel pets move with the chibis' poses.)

A few wooden alphabet blocks lie about for your pet to play with. Now and then it goes over to one and swats it along the floor, or picks it up and flings it, then watches where it lands and goes after it. Running about, it kicks any block in its way. You can pick a block up and throw it yourself: your pet waits with its eyes on it while you hold it, and chases after it when you let go. (Click a block to flick it over.)

The settings have four **modes**, each a button:

- **Play** (the usual): it wanders about, plays with its blocks, chases the pointer when you shake the mouse, and watches you type.
- **Work**: a little desk appears in the bottom right corner with a computer on it, and your pet says "Work time!", sits down at it and works away for as long as work mode lasts: typing in a terminal, browsing the web, and every once in a while flicking through a few reels (giggling at the funny ones). Nothing distracts it, and tapping the desk gets you shushed. Drag it off its desk and it's cross ("Hey! I was working!") and stomps straight back.
- **Sleep**: it goes off somewhere cosy, curls up and sleeps. Pat it or move it and it goes back to sleep.
- **Hide**: it runs off the nearest edge of the screen and stays out of sight, until you pick another mode and it runs back on.

You can dress your pet up: in the settings, pick a hat (a party hat, beanie, top hat, crown, cap, bow, nightcap or headphones) and an outfit (a suit and tie, pajamas, a sweater, a superhero cape, a scarf, a bow tie, a bandana, or a collar and bell).

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
| Move the raccoon | Drag it: wherever you grab it, you end up holding it by the scruff |
| Pet it | Click it, then stroke it by moving the pointer over it to keep it purring |
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
    toys/toybox.ts        The toy blocks: flying, bouncing, tumbling, being held
    clickThrough.ts       Decides when the overlay should capture the mouse
    geometry.ts           Small geometry helpers
  sprites/                The art
    types.ts              Animation names, timing specs and the RaccoonRenderer interface
    animations.ts         Timing for every animation (fps, length, loop, eyes)
    index.ts              The pets the settings offer
    critter/              The lifelike raccoon, cat, fox and otter: rig, gaits, poses, motion, drawing
    chibi/                The flat 2D chibi pets: builds, poses and drawing
    pixel/                The pixel-art pets: a little rasteriser, palettes and drawing
    toys.ts               The toy blocks' drawings, one for each art style
    outfits.ts            Hats and neckwear, as shapes every art style draws its own way
    desk.ts               The work-mode desk in pixel art, built to fit the pet, and what's on its screen
    typing.ts             The rhythm of a pet typing (bursts of taps, pauses to think)
    archive/              Retired pets (3D arena, cartoon, plush, classic, cartoon cat)
  runtime/petRuntime.ts   Connects core logic to the DOM; runs the animation loop
  runtime/toyLayer.ts     Puts the toy blocks on the page; picking them up and throwing them
  runtime/deskLayer.ts    Puts the work-mode desk in the corner; taps on it
  host/                   "Where am I running?": Electron bridge or browser fallback
  components/             React: the pet page, the settings panel and its "What's new" notes
  lib/                    The version (the build date) and the patch notes
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
- **Click-through:** the window starts with `setIgnoreMouseEvents(true, { forward: true })`, so clicks pass straight through to whatever is underneath. Using the polled cursor position and forwarded mouse moves, the page asks the main process to capture the mouse only while the pointer is over the visible part of the raccoon or one of its toy blocks, and to release it as soon as the pointer leaves.

### Behaviour

`Brain` (`src/core/behavior/brain.ts`) is a state machine with the modes **idle, walk, sit, sleep** and **react**. Reactions are **surprised, chase, pounce, confused, flee, hide, peek, dragged, petted, zoomies, play, nap** and **work**. While chasing or dashing about at full tilt, it leaps now and then (`motion.leapMs`, `motion.leapEvery`), flying straight on through each leap. At speed it steers like an animal, not a hovercraft: the direction it's running can only swing round so fast (the faster it goes, the wider the turn) and it slows down to turn sharply, so it runs round in curves to a cursor behind it instead of stopping and reversing.

- **Wandering:** the whole work area is the raccoon's world; there is no floor and no gravity. After each pause it picks something to do: walk to a random point anywhere on screen, sit and groom or yawn, or just turn round and look about. After about 3 calm minutes it goes for a nap (the **nap** reaction). If the pointer has been resting in one place for a few seconds (`wander.napByCursorAfterMs`: you're reading, say), it goes and lies down right next to it, on the side it's coming from, facing it; if the pointer then settles somewhere else before it gets there, it follows. Otherwise it picks somewhere sensible: curled up beside a toy block if one is nearby, or down at the bottom of the screen in the nearer corner, out of the way, facing into the room. There it yawns and falls asleep. Dropping it after a drag leaves it exactly where you let go.
- **Organic movement:** walks follow a gently curved path with ease-in-out speed, and each walk varies a little in distance, curve and top speed. Everything else (chasing, fleeing, pouncing) goes through velocity with limited acceleration ("arrive" steering). Nothing ever teleports; the tests check this on every simulated frame.
- **Tuning:** all timings and distances live in `DEFAULT_CONFIG` in `src/core/behavior/config.ts`, grouped by behaviour. For wandering: `wander.walkDistance`, `pauseMs`, `speedJitter`, `curve`, `sitChance`, `sitMs`, `lookAroundChance`, `zoomiesChance`, `zoomiesDashes`, `sleepAfterMs` and `napByCursorAfterMs`. These are developer settings, compiled in; they aren't in the user's `settings.json`.
- **Deterministic:** time only advances when `update(dt, world)` is called, and randomness is injected, so the tests replay exact scenarios.

### Toys

`Toybox` (`src/core/toys/toybox.ts`) holds the toy blocks, as plain data like the brain: each lies on the floor at a point, can be lifted off it, flies with gravity, bounces, slides and tumbles over a quarter turn for each side's length, and settles flat on a face. Two blocks never end up inside each other, and they bounce off the sides of the screen. It steps in time with the brain, so the tests replay games exactly.

The brain plays with them (the **play** reaction): after a pause it sometimes picks the nearest block (`wander.playChance`), goes to stand beside it facing it (or pounces from a little way off), and either swats it (the `bat` animation) or picks it up and throws it (`toss`). It watches where it went, then goes after it for another turn, a few times (`play.turns`). Running fast, it kicks any other block in its way. The moment a swat lands, and when a toss picks the block up and lets go, are in `PLAY` (`src/sprites/animations.ts`); both the brain and every drawing time their moves by it. While a block is in its mouth (or a raccoon's hands), the drawing says where that is (`toyPoint()` on the renderer), and the block is carried there.

A raccoon can also take it for a walk. Drawings that can hold a block in their hands say so (`carriesToys` on the renderer), and then a throw is sometimes (`play.carryChance`) a carry instead: he picks the block up in both hands and stands up with it hugged to his chest (`lift`), toddles off a little way on his hind legs (`carry`, `play.carryDistance`), and throws it from there, up over his head and away (`throw`). The pick-up and the let-go are in `PLAY` too. Take the block off him while he's carrying it and he waits for you to throw it.

You can play too: `ToyLayer` (`src/runtime/toyLayer.ts`) puts a block in your hand when you press on it, and throws it with the pointer's speed when you let go (flung up the screen it goes up into the air). The brain hears about it (`toyThrown`) and chases after it, to where it will land. Holding a block, you have the pet's attention: it waits, watching it, until you throw it. Tuning is in `DEFAULT_CONFIG.play`.

### Dressing up

`src/sprites/outfits.ts` describes each hat and outfit as a few plain shapes (polygons and ellipses) with three colours. Hats are drawn in head units (the head's half-width is 1, the origin the crown of the head) and what's worn at the neck (a tie, a collar) in neck units, so one description fits every animal and every size. Clothes also say how they cover the body (`body`): the body and how far down the legs, stripes round it, a shirt front, buttons, or a cape over the back that flies out behind as he runs. Each renderer draws them its own way through `dress()`:

- The lifelike pets put the hat on the crown of their 3D head and turn it with the head (`placeOutfit` in `critter/skin.ts`), and wrap the collar across the neck between body and head, so the head comes over its top.
- The chibis draw the hat inside the head group and the neckwear just under the chin.
- The pixel pets rasterise the same shapes, with the item's colours in palette slots of their own, and dress the body too. (Only they dress the body for now: the others wear just the neck part of clothes.)

The settings panel lists them with a little picture of each, drawn from the same shapes (`wearableIcon`).

### Modes

The brain is told the mode (`WorldInput.mode`, from the settings) and keeps to it (`followMode` in `brain.ts`): whatever he's doing, in work mode he goes back to his desk, in sleep mode back to sleep, and in hide mode off the screen; and when the mode changes he changes what he's doing to suit (back to play from work, he gets up; from sleep, he wakes with a yawn). Only in play mode does he chase the pointer, watch you type or run off from the pointer; the blocks are only out in play mode, and the desk only in work mode.

**Hide** is the **away** reaction: he runs off the nearer side (nothing holds him on the screen now), and once he's off it he's gone (`PetSnapshot.hidden`: the page hides him altogether, so nothing of him catches the mouse) until the mode changes, when he runs back on from the same side.

**Work**: `DeskLayer` (`src/runtime/deskLayer.ts`) puts a desk in the bottom right corner, built to fit the pet: each drawing says where its paws come down when it types (`deskReach` on the renderer) and where one goes on the mouse (`mouseReach`), and the keyboard and mouse go just there. The brain is told where the desk is (`WorldInput.desk`: the seat, which way he faces, the screen). The **work** reaction:

1. **announce**: "Work time!" in a speech bubble (`PetSnapshot.say`), waving (the `attention` animation), when you've just picked work mode.
2. **go**: over to the desk.
3. **type**: sat at it, eyes on the screen, for as long as work mode lasts. He switches between tasks (`work.tasks`): typing in the terminal (the `work` animation), browsing the web with a paw on the mouse (`browse`), and now and then a few reels, leant back flicking the mouse for the next one (`reels`). He always starts in the terminal and never does the same thing twice in a row; reels are the rarest and shortest. The snapshot says what's on the screen (`PetSnapshot.screen`). Nothing distracts him, and taps on the desk get "Shh! Working." A pat, and he enjoys it and goes back to work. He counts as resting, so the page ticks slowly all the while.
4. **angry**: dragged off his desk and let go, he's cross (the `angry` animation: stamping, ears back, a red anger mark over his head) and says so, then goes straight back to it.

The desk (`src/sprites/desk.ts`) is pixel art on a small canvas. Its monitor faces out, with the depth of its case showing behind, so you can see what's on the screen while he works at it; he turns his face round to it (`turn` in the chibi pose: the eyes, nose and markings slide round towards the way he faces), with his eyes on the screen. What's on the screen is drawn into it a few times a second: a terminal with commands and output scrolling up and a blinking cursor, a web page with pictures and paragraphs scrolling by, reels flicked away upwards one after another in time with his paw (`REEL_MS`), or a screen saver when nobody's at it.

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

Every pet is the same rig in `src/sprites/critter/`, drawn as inline SVG:

- `build.ts` holds each animal's proportions, stance and gaits.
- `catAct.ts`, `raccoonAct.ts`, `foxAct.ts` and `otterAct.ts` give a pose for every animation, based on how the real animal holds itself. A pose is plain numbers: hips, shoulders, head, where each paw is, the tail's shape, ears, eyes and mouth. Legs are worked out from where the paws are, so a paw can stay planted.
  - The fox moves like a cat, so `foxAct` takes the cat's poses, scaled to its longer legs, and changes how it carries its tail.
  - The otter (`swims: true` in its build) lives in water: the floor is the surface of a pond. Swimming, only its head and back are out of the water, and its paws paddle below. Its rests are on its back (`roll` in the pose turns the body over). Running and chasing, it swims with its whole body, and its excited leaps are porpoising arcs.
- `motion.ts` makes the movement continuous:
  - Animations blend into each other.
  - He faces the way he's going on the floor, including up and down the screen. On the move his body follows the path, bent along its curves; turning on the spot, the shoulders lead, the hips follow and he steps round.
  - Paws advance by the ground actually covered, so they never skate.
  - Legs never stretch past their length: the shoulder blade slides to reach, and the wrist or heel tips up.
  - The tail is a chain of springs with a mind of its own: every so often it picks something to do (hold still, swish across to the other side and back, settle at a new angle, flick its tip), and each swing runs from the base to the tip. Wrapped round the paws, it lies along the floor round his side.
  - Carried, he hangs from the scruff and swings like a pendulum.
  - Glances, ear flicks and blinks.
  - The head turns on the neck to look at the pointer. The eyes keep up with it; the head holds still through small movements and swings after bigger ones a beat behind.
- `view.ts` is the camera. The screen is a floor seen from a little above, so a step towards you shows lower on the screen. The brain uses the same idea (`wander.floorDepth`), so walking up or down the screen goes at the same pace on the floor as walking across it.
- `skin.ts` draws the pose from any side. The body is a solid built from slices along the spine, drawn by its true outline. Legs hang from either side, and parts are layered by how near you they are. The head is a small 3D model; each species' face, ears and eyes are in small tables at the end of the file. For a swimmer, it also draws the water, laid over the animal: a pool sized to reach round everything under the surface (and what shows through it from deep down), spreading rings and a wake. Whatever is out of the water is cut out of the pool along the animal's own outline, so what's under the surface is seen through the water.

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
3. Add a `case` to `catAct()`, `raccoonAct()` and `otterAct()` (the fox follows the cat), and to the chibis' poses (which the pixel pets share; see below). Start from `stand()`, `sit()` or `curl()` (for the otter, `swim()`, `onBack()` or `tread()`) and change what moves. Pose him facing right; when you see him from his other side, his left and right paws swap automatically.
4. Pick it in `Brain.snapshot()` (`src/core/behavior/brain.ts`).

TypeScript points out anything missing. `tests/critter.test.ts` checks every animation for bad numbers, that planted paws never slide in any walking direction, that he faces the way he walks, peeks with his paws on the edge, and hangs below his scruff when carried. For the otter it checks that it swims at the surface with its paws below it, floats on its back to rest, and porpoises clear of the water.

The art styles are just CSS, the `look-*` and `coat-*` classes in `src/styles.css`.

**The chibis** (`src/sprites/chibi/`) are a separate, simpler renderer: flat side-on shapes rather than the 3D rig.

- `species.ts` holds each one's proportions: body, head, where the legs join, tail shape and stride.
- `pose.ts` gives a pose for every animation in plain numbers (body, head, paws, tail, ears, eyes, mouth, and floating marks like z's and hearts). The otter has its own set: swimming, treading water, floating on its back and porpoising.
- `index.ts` keeps them moving: the stride advances by the ground covered, animations blend into each other, and turning round it flips through side-on.
- `draw.ts` draws the pose with bold outlines; coats are the `chibi-coat-*` classes in `src/styles.css`.

To add an animation for them too, add a `case` to `walkerPose()` and `otterPose()` in `chibi/pose.ts`. `tests/chibi.test.ts` checks every animation for bad numbers, that it stays in its box, its paws stay planted and step in diagonal pairs, it turns to face the way it goes, peeks over the edge, hangs from its scruff, and that the otter swims, floats on its back and porpoises.

**The pixel pets** (`src/sprites/pixel/`) move exactly like the chibis (the same poses and motion), but each picture is drawn into a 64 by 54 pixel canvas and blown up, each pixel a whole number of screen pixels across, so it stays crisp.

- `raster.ts` is a tiny rasteriser: shapes are signed distance functions sampled at each pixel's centre, filled with one palette colour and ringed with a one-pixel outline. Nothing is anti-aliased.
- `draw.ts` draws a chibi pose with it: the same parts in the same order, with a lit top edge on the body and head, two-by-three pixel eyes with a glint, and pixel z's, hearts, "!" and "?".
- Walking and running, he faces the way he's going in any of eight directions, as sprites in old games have a picture for each way they face. `facing.ts` draws him from the front and from behind, for going straight down and up the screen: from the front his face, his front legs stepping towards you and his tail out to one side; from behind the back of his head, and his tail nearest you (a cat's curled up, a raccoon's hanging down). Going diagonally, `draw.ts` turns him three-quarters (`quarter`): his body foreshortened, his face turned out to you from the front, and from behind no face and his tail nearest you; the page mirrors each for the other side. `ChibiMotion.view` says which (`viewFor`), each view holding until he's clearly going another way, so it doesn't flicker on a heading between two. Standing still or doing anything else, he's side on.
- `species.ts` has their builds: the chibis' builds, but with an even bigger head on a smaller, rounder body and a smaller tail, which is what a sprite this small needs to read as cute rather than squat.
- `palette.ts` holds each coat as a palette.
- `index.ts` is the renderer. It draws a new picture 12 times a second, like an old game, and the page places it on whole screen pixels.

`tests/pixel.test.ts` checks the outlines are closed, that every animation is drawn whole inside the canvas, facing left mirrors facing right, the marks show, and nothing of a swimming otter shows under the water.

**Another art style:** behaviour code only ever names animations, and the page only talks to the `RaccoonRenderer` interface (`src/sprites/types.ts`). To swap the art, write another renderer and add it to `RACCOON_STYLES` in `src/sprites/index.ts`; nothing in `src/core` changes. The retired renderers in `src/sprites/archive/` still work: to bring one back, give it a type in `shared/settings.ts` and an entry in `RACCOON_STYLES`.

## Version and patch notes

The version is the date of the build, stamped in by `vite.config.mts` (`__BUILD_DATE__`), and shows at the bottom of the settings panel. Clicking it opens "What's new", the hand-written notes in `src/lib/patchNotes.ts`. When you ship something worth noticing, add an entry at the top, written for someone watching their pet rather than reading the code.

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
2. Leave it alone for a minute: it walks all over the screen (not just along the bottom) with smooth starts and stops, sits, grooms and yawns. Leave it for about 3 minutes with the cursor resting in one place: it walks over, lies down next to the cursor and falls asleep ("z Z"). With the cursor off to one side of the screen instead, it naps by a toy block or in a bottom corner.
3. Shake the mouse hard for a couple of seconds: "!", then it chases the cursor. Stop: it pounces, then sits with "?".
4. Move the cursor slowly onto it: it often runs away; near a screen edge it hides behind the edge and peeks back out.
5. Drag it and let go: it dangles while held and stays where you drop it. Click it: it startles.
6. Settings (double-click it): change size and speed and watch them apply live. Turn on "React to typing" and type steadily for a few seconds: it peeks over the bottom edge and its eyes follow your typing. Stop typing: it comes back out after about 5 seconds.
7. Change display scaling or resolution: it stays on screen.
8. Settings: pick a hat and an outfit: your pet wears them straight away. Pick **Work**: "Work time!", a desk appears in the bottom right corner and it goes and works at it, switching between the terminal, the web and reels every minute or so. Tap the desk: "Shh! Working." Drag it off: it's cross and goes back. Pick **Sleep**: it curls up and sleeps, whatever the mouse does. Pick **Hide**: it runs off the screen, and clicks go straight through where it was. Pick **Play**: it runs back on, and the blocks are back.
9. Toy blocks: wait a while and it goes over to a block, swats it or throws it, and goes after it. A raccoon sometimes picks it up and walks off with it on his hind legs, then throws it. Pick a block up: it watches it. Throw it: it chases after it. Click a block: it flips over. Clicks next to a block still go through to the window behind.
10. Quit from the tray icon.
