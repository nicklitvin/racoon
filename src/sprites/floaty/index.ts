import { TIMING } from '../chibi';
import { PIXEL } from '../pixel/draw';
import { pixelCanvas, PIXEL_FPS, PIXEL_PX, PIXEL_TOY } from '../pixel';
import type { Pt } from '../pixel/raster';
import type { RaccoonRenderer } from '../types';
import { bodyCentre, drawFloaty, floatyPose, HOVER, keyboardReach, type FloatyPose } from './draw';
import { FLOATIES, FLOATY_COATS, type FloatyKind } from './kinds';

export { FLOATIES, type FloatyKind } from './kinds';

/** How quickly it eases into a new pose, per second (bigger is quicker). */
const EASE_RATE = 9;

/**
 * A floaty: a little blob that floats about instead of walking, in pixels like the pixel
 * pets. It goes everywhere they go and does everything they do, its own way: bobbing
 * along, waving its floating hands, typing at its desk with them.
 */
export function createFloaty(doc: Document, kind: FloatyKind, label: string): RaccoonRenderer {
  const { width: W, height: H, feetX, feetY } = PIXEL;
  const build = FLOATIES[kind];
  const view = pixelCanvas(doc, FLOATY_COATS[kind], `floaty floaty-${kind}`, label);
  /** Where it's got to, easing between poses. */
  let shown: Pick<FloatyPose, 'hover' | 'sx' | 'sy' | 'tilt' | 'shift'> | null = null;
  let settling = false;
  let lastClock = NaN;
  let shownTick = NaN;
  let top: Pt | null = null;
  let held: Pt | null = null;
  let dir = 1;
  view.onChange = () => void (shownTick = NaN);
  view.sizeTo();

  const px = (art: number) => art * view.cell;
  const keys = keyboardReach(build);

  return {
    element: view.root,
    figure: view.figure,
    baseSize: { width: W * PIXEL_PX, height: H * PIXEL_PX },
    anchor: { x: feetX / W, y: feetY / H },
    // Peeking, it sinks until only its eyes and hands are over the edge.
    peekSink: build.R * 1.05 * PIXEL_PX,
    turnsItself: true,
    pixelated: true,
    animations: { ...TIMING, work: { fps: 20 }, browse: { fps: 20 }, reels: { fps: 20 } },
    isSettling: () => settling,
    holdPoint: () => (top ? { x: px(top.x - feetX), y: px(top.y - feetY) } : null),
    toyReach: (build.R * build.wide + 4) * PIXEL_PX,
    toySize: PIXEL_TOY * PIXEL_PX,
    toyLook: 'pixel',
    deskReach: { x: keys.x * PIXEL_PX, y: keys.y * PIXEL_PX },
    mouseReach: { x: (keys.x + 7) * PIXEL_PX, y: keys.y * PIXEL_PX },
    drawsMarks: true,
    hover: HOVER * PIXEL_PX,
    toyPoint: () => (held ? { x: px(held.x - feetX), y: px(held.y - feetY) } : null),
    dress: (d) => view.dress(d),
    setScale(next) {
      view.scale = next;
      view.sizeTo();
    },
    draw(frame) {
      const clock = frame.clockMs ?? frame.timeMs;
      const v = frame.velocity ?? { x: 0, y: 0 };
      const heading = frame.heading ?? 0.6;
      const target = floatyPose(build, frame.animation, frame.timeMs, clock, frame.eyes, heading, Math.hypot(v.x, v.y), frame.keystrokes);
      // Eases from pose to pose rather than jumping.
      const dt = Number.isNaN(lastClock) ? 1 : Math.min(0.25, Math.max(0, (clock - lastClock) / 1000));
      lastClock = clock;
      const k = 1 - Math.exp(-EASE_RATE * dt);
      if (!shown) shown = { hover: target.hover, sx: target.sx, sy: target.sy, tilt: target.tilt, shift: target.shift };
      let far = 0;
      for (const key of ['hover', 'sx', 'sy', 'tilt', 'shift'] as const) {
        shown[key] += (target[key] - shown[key]) * k;
        far = Math.max(far, Math.abs(target[key] - shown[key]) * (key === 'hover' || key === 'shift' ? 1 : 20));
      }
      settling = far > 0.3;
      const pose = { ...target, ...shown };
      // A new picture only every so often, like an old game, but at once when it turns round.
      const tick = Math.floor(clock / (1000 / PIXEL_FPS));
      const facing = Math.cos(heading) < 0 ? -1 : 1;
      if (tick === shownTick && facing === dir) return;
      shownTick = tick;
      dir = facing;
      const drawn = drawFloaty(view.raster, build, pose, clock, view.dressed);
      // Held up by the top of its head; a block in its hands, between them.
      const c = bodyCentre(build, pose);
      top = { x: feetX + c.x * facing, y: feetY + c.y - build.R * pose.sy };
      held = drawn.hands ? { x: (drawn.hands[0].x + drawn.hands[1].x) / 2, y: Math.min(drawn.hands[0].y, drawn.hands[1].y) - 2 } : null;
      view.paint(drawn.box);
    },
  };
}
