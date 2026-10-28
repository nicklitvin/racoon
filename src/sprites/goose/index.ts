import { TIMING, viewWhile, type ChibiView } from '../chibi';
import { PIXEL } from '../pixel/draw';
import { pixelCanvas, PIXEL_FPS, PIXEL_PX, PIXEL_TOY } from '../pixel';
import { PIXEL_COATS, type Palette } from '../pixel/palette';
import type { Pt } from '../pixel/raster';
import type { RaccoonRenderer } from '../types';
import { drawGoose, drawGooseFacing, GOOSE_QUARTER, goosePose, KEYBOARD, type GoosePose } from './draw';

/** A white goose with an orange beak and feet (`band`, and `dark` for the far foot and under its beak). */
export const GOOSE_COAT: Palette = {
  ...PIXEL_COATS.raccoon,
  outline: '#2c2a33',
  fur: '#f7f5ef',
  furLight: '#ffffff',
  furDark: '#d3d0c8',
  far: '#c4c0b6',
  belly: '#e4e1d9',
  light: '#ffffff',
  band: '#f59a2c',
  dark: '#c9681c',
  eye: '#17141c',
  mouth: '#7a2f3a',
};

/** How quickly it moves into a new pose, per second (bigger is quicker). */
const EASE_RATE = 16;
/** The parts of a pose that move smoothly from one to the next. */
const EASED = ['lift', 'tilt', 'bow', 'nod', 'beak', 'wing'] as const;
/** Peeking, its feet go this far below the edge: only its neck and head show over it. */
const PEEK_SINK = 21;

/**
 * The goose: in pixels like the pixel pets, and up to no good. It waddles about with its
 * neck up, goes for your pointer with its wings out, honking, and runs off with the blocks.
 * Its own ways of doing things are in the brain (`WorldInput.goose`); this draws them.
 */
export function createGoose(doc: Document, label: string): RaccoonRenderer {
  const { width: W, height: H, feetX, feetY } = PIXEL;
  const view = pixelCanvas(doc, GOOSE_COAT, 'goose', label);
  let shown: (Pick<GoosePose, (typeof EASED)[number]> & { head: Pt }) | null = null;
  let settling = false;
  let lastClock = NaN;
  let shownTick = NaN;
  let back: Pt | null = null;
  let tip: Pt | null = null;
  let dir = 1;
  /** Which way you see it: side on, or going up or down the screen from behind or in front (or three-quarters, diagonally). */
  let turned: ChibiView = 'side';
  view.onChange = () => void (shownTick = NaN);
  view.sizeTo();

  const px = (art: number) => art * view.cell;

  return {
    element: view.root,
    figure: view.figure,
    baseSize: { width: W * PIXEL_PX, height: H * PIXEL_PX },
    anchor: { x: feetX / W, y: feetY / H },
    peekSink: PEEK_SINK * PIXEL_PX,
    turnsItself: true,
    pixelated: true,
    animations: { ...TIMING, work: { fps: 20 }, browse: { fps: 20 }, reels: { fps: 20 }, attention: { fps: 30 } },
    isSettling: () => settling,
    // Picked up by the back, between its wings.
    holdPoint: () => (back ? { x: px(back.x - feetX), y: px(back.y - feetY) } : null),
    toyReach: 17 * PIXEL_PX,
    toySize: PIXEL_TOY * PIXEL_PX,
    toyLook: 'pixel',
    deskReach: { x: KEYBOARD.x * PIXEL_PX, y: KEYBOARD.y * PIXEL_PX },
    mouseReach: { x: (KEYBOARD.x + 7) * PIXEL_PX, y: KEYBOARD.y * PIXEL_PX },
    drawsMarks: true,
    goose: true,
    // A block hangs from its beak by one edge.
    toyPoint: () => (tip ? { x: px(tip.x - feetX + dir * 1), y: px(tip.y - feetY + PIXEL_TOY / 2 - 1) } : null),
    dress: (d) => view.dress(d),
    setScale(next) {
      view.scale = next;
      view.sizeTo();
    },
    draw(frame) {
      const clock = frame.clockMs ?? frame.timeMs;
      const v = frame.velocity ?? { x: 0, y: 0 };
      const heading = frame.heading ?? 0.6;
      const target = goosePose(frame.animation, frame.timeMs, clock, frame.eyes, Math.hypot(v.x, v.y), frame.keystrokes);
      // Moves from pose to pose rather than jumping.
      const dt = Number.isNaN(lastClock) ? 1 : Math.min(0.25, Math.max(0, (clock - lastClock) / 1000));
      lastClock = clock;
      const k = 1 - Math.exp(-EASE_RATE * dt);
      if (!shown) shown = { lift: target.lift, tilt: target.tilt, bow: target.bow, nod: target.nod, beak: target.beak, wing: target.wing, head: { ...target.head } };
      let far = Math.hypot(target.head.x - shown.head.x, target.head.y - shown.head.y);
      shown.head.x += (target.head.x - shown.head.x) * k;
      shown.head.y += (target.head.y - shown.head.y) * k;
      for (const key of EASED) {
        shown[key] += (target[key] - shown[key]) * k;
        far = Math.max(far, Math.abs(target[key] - shown[key]) * (key === 'lift' || key === 'bow' ? 1 : 10));
      }
      settling = far > 0.3;
      const pose: GoosePose = { ...target, ...shown, head: { ...shown.head } };
      // Facing the way it's going, held while it goes straight up or down the screen; and
      // going up or down, seen from behind or in front (three-quarters going diagonally).
      const facing = frame.animation !== 'dangle' && Math.abs(Math.cos(heading)) > 0.2 ? (Math.cos(heading) < 0 ? -1 : 1) : dir;
      const seen = viewWhile(frame.animation, heading, turned);
      // A new picture only every so often, like an old game, but at once when it turns.
      const tick = Math.floor(clock / (1000 / PIXEL_FPS));
      if (tick === shownTick && facing === dir && seen === turned) return;
      shownTick = tick;
      dir = facing;
      turned = seen;
      const drawn =
        turned === 'front' || turned === 'back'
          ? drawGooseFacing(view.raster, pose, turned, dir, clock, view.dressed)
          : drawGoose(view.raster, pose, dir, clock, view.dressed, turned === 'side' ? 1 : GOOSE_QUARTER);
      back = drawn.back;
      tip = drawn.tip;
      view.paint(drawn.box);
    },
  };
}
