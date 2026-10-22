import { PLAY } from '../animations';
import { ChibiMotion, TIMING, type ChibiView } from '../chibi';
import type { ChibiPose } from '../chibi/pose';
import type { ChibiBuild, Pt } from '../chibi/species';
import { DEG, clamp01 } from '../critter/kit';
import { hatItem, outfitItem, type Dress, type Paint, type Wearable } from '../outfits';
import type { AnimationName, RaccoonRenderer } from '../types';
import { drawMarks, hoodOf, PAINT_SLOT, PIXEL } from './draw';
import { isFrontPiece } from './facing';
import { PIXEL_FPS, PIXEL_PX, PIXEL_TOY, pixelCanvas } from './index';
import { C, type Palette } from './palette';
import { capsule, ellipse, intersect, polygon, Raster, type Box, type Sd } from './raster';

/**
 * The puffball: a round pink blob with no neck, no tail and no ears, just a face, two
 * stubby arms and two big feet. It doesn't walk: it floats about a little off the floor,
 * puffed up, flapping its arms, and only comes down to sit, sleep or work at its desk.
 *
 * It moves to the same poses as the other pets (so it keeps time with the blocks, the desk
 * and your typing), but draws them its own way: the pose says what its face does, where a
 * paw is reaching and how it's squashed; where the ball goes is up to this drawing.
 */

/** Its radius, in drawing units. */
export const BLOB_R = 17;
/** How high it floats off the floor. */
const HOVER = 12;

/**
 * The build its poses come from. There's no body to speak of, so only the places that say
 * where its paws go matter: its reach to a block, its desk and its mouse.
 */
export const BLOB: ChibiBuild = {
  species: 'blob',
  body: { rx: 14, ry: 13, at: { x: 0, y: -17 } },
  head: { rx: BLOB_R, ry: BLOB_R, at: { x: 0, y: 0 } },
  shoulder: { x: 10, y: 4 },
  hip: { x: -8, y: 6 },
  farOffset: 3,
  legWidth: 6,
  stride: { walk: 3, walkCycle: 30, runCycle: 60 },
  tail: { root: { x: -14, y: 0 }, length: 1, radius: () => 0.5, angle: 180, curl: 0 },
  peekSink: 22,
  toyReach: 28,
  desk: { x: 19, y: -14 },
  mouse: { x: 29, y: -13 },
};

/** What it does sat (or lying) on the floor; everything else, it floats. */
const GROUNDED = new Set<AnimationName>(['sit', 'groom', 'yawn', 'sleep', 'peek', 'work', 'browse', 'reels', 'dangle']);
/** Getting about: puffed up, arms flapping. */
const TRAVELLING = new Set<AnimationName>(['walk', 'run', 'chase', 'carry', 'leap']);

export interface BlobState {
  animation: AnimationName;
  /** Time into the animation, ms. */
  t: number;
  clock: number;
  facing: number;
  view: ChibiView;
  moving: number;
  phase: number;
  /** How high it's floating now (it rises and settles gently). */
  hover: number;
}

/** How high it floats in an animation. */
export const hoverFor = (animation: AnimationName): number => (GROUNDED.has(animation) ? 0 : HOVER);

export interface BlobDrawn {
  box: Box | null;
  /** Where it's held (the top of its head) and where a block it has hold of is, from its feet, facing right. */
  scruff: Pt;
  toy: Pt;
}

/** Draws the puffball into `r` (cleared first). */
export function drawBlob(r: Raster, p: ChibiPose, s: BlobState, dress: Dress): BlobDrawn {
  const { feetX: FX, feetY: FY, k: K } = PIXEL;
  const R = BLOB_R;
  r.clear();
  const { animation: a, clock, t } = s;
  const travelling = TRAVELLING.has(a);
  const fast = a === 'run' || a === 'chase';
  const side = s.view === 'side';
  const behind = s.view === 'back' || s.view === 'backQuarter';
  const straight = s.view === 'front' || s.view === 'back';
  // How far round to the front its face is: side on, it looks the way it's going.
  const faceShift = side ? 0.3 : s.view === 'frontQuarter' ? 0.15 : 0;
  const item = outfitItem(dress.outfit);
  const clothes = item?.body ?? null;

  // --- Where the ball is, and how squashed ---
  // Getting about, it puffs itself up.
  const puff = travelling ? 1 + 0.07 * Math.min(1, s.moving + 0.3) : 1;
  let sx = Math.abs(p.sx) * puff;
  let sy = Math.abs(p.sy) * puff;
  if (a === 'sleep') {
    sx *= 1.12;
    sy *= 0.86;
  }
  const rx = R * sx;
  const ry = R * sy;
  const bob = Math.sin(clock / 520) * 2.2 * (s.hover / HOVER);
  const c: Pt = a === 'peek' ? { x: 0, y: -BLOB.peekSink - R * 0.3 } : { x: 0, y: -ry - s.hover - bob + Math.min(0, p.lift) };
  const bottom = c.y + ry;
  // Leaning into it as it goes, and tipping its face up and down with its head.
  const tilt = (-p.hrot * 0.5 + (fast ? 10 : travelling ? 5 : 0)) * DEG;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // Held up, the whole of it swings about the top of its head.
  const sw = p.swing * DEG;
  const top = { x: c.x, y: c.y - ry };
  const T = (u: Pt): Pt => {
    let { x, y } = u;
    if (sw) {
      const dx = x - top.x;
      const dy = y - top.y;
      x = top.x + dx * Math.cos(sw) - dy * Math.sin(sw);
      y = top.y + dx * Math.sin(sw) + dy * Math.cos(sw);
    }
    return { x: FX + x * K, y: FY + y * K };
  };
  /** A point on the ball, from its middle (before it's tipped), in pixels. */
  const on = (x: number, y: number): Pt => T({ x: c.x + x * ct - y * st, y: c.y + x * st + y * ct });
  /** A point on its edge, `deg` round from the front (90 is the top), `k` of the way out. */
  const rim = (deg: number, k = 1): Pt => ({ x: Math.cos(deg * DEG) * rx * k, y: -Math.sin(deg * DEG) * ry * k });
  const angle = tilt + sw;
  const centre = T(c);
  const ball = ellipse(centre.x, centre.y, rx * K, ry * K, angle);

  // --- Its shadow on the floor, smaller the higher it floats ---
  if (a !== 'peek' && a !== 'dangle') {
    const high = clamp01((s.hover - p.lift) / 40);
    const at = T({ x: 0, y: 0.5 });
    const e = ellipse(at.x, at.y, (rx * 0.8 + 3) * K * (1 - high * 0.6), 1.4);
    r.shape(e.sd, e.box, C.shadow, null);
  }

  // --- Arms: stubs on its sides, flapping as it floats along, reaching out for things ---
  const flap = travelling ? Math.sin(clock / (fast ? 55 : 110)) : 0;
  let near: Pt = rim(-25 + flap * 40, 0.95);
  let far: Pt = rim(205 - flap * 40, 1);
  let farInFront = false;
  /** An arm out towards `to` (from its feet, in drawing units), as far as it stretches. */
  const reach = (to: Pt): Pt => {
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(d, R * 1.32) / d;
    // Back into the ball's own (untipped) frame.
    const x = dx * k;
    const y = dy * k;
    return { x: x * ct + y * st, y: -x * st + y * ct };
  };
  const wave = (ms: number) => Math.sin((t / ms) * Math.PI * 2);
  switch (a) {
    case 'bat':
      if (p.pawUp > 0.5) near = reach({ x: p.paws.frontNear.x, y: p.paws.frontNear.y + p.lift });
      break;
    case 'work':
    case 'browse':
      near = reach(p.paws.frontNear);
      far = reach(p.paws.frontFar);
      break;
    case 'reels':
      near = reach(p.paws.frontNear);
      far = rim(-60, 0.7);
      break;
    case 'peek':
      // Paws up on the edge of the screen, either side of its face.
      near = { x: R * 0.62, y: R * 0.3 };
      far = { x: -R * 0.55, y: R * 0.3 };
      farInFront = true;
      break;
    case 'groom': {
      // Rubbing its face.
      const stroke = wave(1000);
      near = { x: faceShift * R + R * 0.3 + stroke * R * 0.08, y: R * 0.12 - stroke * R * 0.1 };
      break;
    }
    case 'attention':
      near = rim(55 + 25 * wave(300), 1.15);
      break;
    case 'happy':
    case 'jump':
    case 'leap':
    case 'surprised':
      near = rim(35 + (a === 'happy' ? 18 * wave(300) : 0), 1.02);
      far = rim(145 - (a === 'happy' ? 18 * wave(300) : 0), 1.02);
      break;
    case 'yawn': {
      // A big stretch.
      const open = clamp01(p.mouth);
      near = rim(-25 + 75 * open, 1.02);
      far = rim(205 - 75 * open, 1.02);
      break;
    }
    case 'dangle':
      near = rim(-5 + 10 * wave(1300), 1.02);
      far = rim(185 - 10 * wave(1300), 1.02);
      break;
    case 'angry':
      near = rim(-40 + 15 * wave(400), 0.95);
      break;
    case 'sleep':
      near = rim(-50, 0.8);
      break;
  }

  // --- Feet: sat on the floor, or dangling under it as it floats ---
  const footRx = R * 0.42;
  const footRy = R * 0.22;
  let nearFoot: Pt;
  let farFoot: Pt | null;
  let toes = 0;
  if (a === 'peek') {
    nearFoot = { x: c.x + R * 0.3, y: bottom };
    farFoot = null;
  } else if (a === 'sleep') {
    nearFoot = { x: c.x + R * 0.55, y: -footRy };
    farFoot = null;
  } else if (GROUNDED.has(a) && a !== 'dangle') {
    const forward = a === 'work' || a === 'browse' || a === 'reels' ? 0.45 : 0.3;
    nearFoot = { x: c.x + R * forward, y: -footRy };
    farFoot = { x: c.x - R * 0.28, y: -footRy };
  } else {
    // Hanging down, toes first, kicking a little as it goes.
    const kick = travelling ? Math.sin(s.phase * Math.PI * 2) * R * 0.12 : Math.sin(clock / 700) * R * 0.04;
    nearFoot = { x: c.x + R * 0.22 + kick, y: bottom + R * 0.04 };
    farFoot = { x: c.x - R * 0.24 - kick, y: bottom - R * 0.02 };
    toes = 0.35;
  }
  const footOnesie = clothes?.onesie && clothes.sleeves >= 1;
  const drawFoot = (at: Pt, isFar: boolean) => {
    const q = T(at);
    const e = ellipse(q.x, q.y, footRx * K, footRy * K, toes + sw);
    r.shape(e.sd, e.box, footOnesie ? C.wearDark : isFar ? C.band : C.dark, C.outline);
  };
  const sleeved = (clothes?.sleeves ?? 0) >= 0.5;
  const drawArm = (l: Pt, isFar: boolean) => {
    const q = on(l.x, l.y);
    const e = ellipse(q.x, q.y, R * 0.3 * K, R * 0.22 * K, angle);
    r.shape(e.sd, e.box, sleeved ? (isFar ? C.wearDark : C.wearMain) : isFar ? C.far : C.fur, C.outline);
  };

  // --- Behind it: a cape, a pack, spikes, the far wing, the far foot and arm ---
  const wear = (paint: Paint) => PAINT_SLOT.wear[paint];
  if (clothes?.cape && !behind) drawCape();
  if (clothes?.pack && !behind) {
    const x0 = side ? -1.12 : -0.45;
    const x1 = side ? -0.62 : 0.45;
    const pack = polygon([on(R * x0, -R * 0.45), on(R * x1, -R * 0.55), on(R * x1, R * 0.45), on(R * x0, R * 0.4)]);
    r.shape(pack.sd, pack.box, wear(clothes.pack), C.outline);
  }
  if (clothes?.spikes && !behind) {
    // Down its back side on, or up along the top of its head from the front.
    const { count } = clothes.spikes;
    for (let i = 0; i < count; i++) {
      const deg = side ? 98 + (100 * (i + 0.5)) / count : 62 + (56 * (i + 0.5)) / count;
      const spike = polygon([on(...xy(rim(deg - 11, 0.94))), on(...xy(rim(deg, 1.3))), on(...xy(rim(deg + 11, 0.94)))]);
      r.shape(spike.sd, spike.box, wear(clothes.spikes.paint), C.outline);
    }
  }
  if (clothes?.wings) {
    if (side) drawWing(clothes.wings, 128);
    else if (!behind) for (const deg of [30, 150]) drawWing(clothes.wings, deg);
  }
  if (farFoot) drawFoot(farFoot, true);
  if (!farInFront) drawArm(far, true);

  // --- The ball ---
  r.shape(ball.sd, ball.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  const face = { x: faceShift * R + p.lookX * R * 0.05, y: -R * 0.08 + p.lookY * R * 0.05 };

  // --- Clothes on it: all over but its face in a onesie, or else its bottom half ---
  const coverTop = R * 0.3;
  let cover: Sd | null = null;
  if (clothes?.covered) {
    if (clothes.onesie) cover = ball.sd;
    else {
      // Below a line across it, tipped with it.
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const line = coverTop * K;
      cover = intersect(ball.sd, (x, y) => line - ((x - centre.x) * nx + (y - centre.y) * ny));
    }
    const area = cover;
    const paint = (sd: Sd, box: Box, colour: number) => r.shape(intersect(sd, area), box, colour, null);
    r.shape(area, ball.box, C.wearMain, null, { light: C.wearLight, dark: C.wearDark });
    if (clothes.bands) {
      const { count, width } = clothes.bands;
      const from = clothes.onesie ? -0.15 : 0.42;
      for (let i = 0; i < count; i++) {
        const y = R * (from + ((0.95 - from) * (i + 0.5)) / count);
        const band = capsule(on(-R * 1.2, y), on(R * 1.2, y), Math.max(0.5, width * R * K));
        paint(band.sd, band.box, wear(clothes.bands.paint));
      }
    }
    if (clothes.patch && !behind) {
      const q = on(face.x * 0.6 + R * 0.05, R * 0.58);
      const e = ellipse(q.x, q.y, R * 0.42 * K, R * 0.3 * K, angle);
      paint(e.sd, e.box, wear(clothes.patch));
    }
    if (clothes.shirt && !behind) {
      const shirt = polygon([on(face.x - R * 0.22, coverTop - 1), on(face.x + R * 0.22, coverTop - 1), on(face.x, coverTop + R * 0.4)]);
      paint(shirt.sd, shirt.box, C.wearTrim);
    }
    if (clothes.buttons && !behind) r.dots([0.42, 0.62, 0.82].map((k) => floor(on(face.x + R * 0.04, R * k))), C.wearAccent);
    if (clothes.stars) stars(C.wearTrim, [[-0.5, 0.5], [0.35, 0.72], [-0.1, 0.85]]);
    if (clothes.onesie && !behind) {
      // The hood's opening, round its face.
      const q = on(face.x, face.y);
      const hole = ellipse(q.x, q.y, R * 0.6 * K, R * 0.48 * K, angle);
      r.shape(intersect(hole.sd, ball.sd), hole.box, C.fur, C.wearDark, undefined, (x, y) => ball.sd(x, y) <= 0);
    }
  }
  if (clothes?.spikes && behind) {
    for (let i = 0; i < clothes.spikes.count; i++) {
      const y = R * (-0.75 + (1.4 * i) / clothes.spikes.count);
      const spike = polygon([on(-R * 0.2, y + R * 0.28), on(0, y - R * 0.12), on(R * 0.2, y + R * 0.28)]);
      r.shape(spike.sd, spike.box, wear(clothes.spikes.paint), C.outline);
    }
  }
  if (clothes?.pack && behind) {
    const pack = polygon([on(-R * 0.45, -R * 0.5), on(R * 0.45, -R * 0.5), on(R * 0.45, R * 0.45), on(-R * 0.45, R * 0.45)]);
    r.shape(pack.sd, pack.box, wear(clothes.pack), C.outline);
  }
  if (clothes?.wings && behind) for (const deg of [30, 150]) drawWing(clothes.wings, deg);
  if (clothes?.cape && behind) drawCape();

  // --- Something round its middle (it has no neck): a belt of a scarf, a tie hanging down ---
  if (item && !clothes?.onesie) {
    const oy = clothes?.covered ? coverTop + R * 0.05 : R * 0.45;
    for (const shape of item.shapes) {
      if (behind && isFrontPiece(shape)) continue;
      // What hangs at the front (a tie, a bow, a bell) comes in under its face.
      const dx = isFrontPiece(shape) ? (straight ? -0.85 : -0.55) : 0;
      const at = (x: number, y: number) => on(face.x * 0.5 + (x + dx) * R * 0.82, oy + y * R * 0.4);
      const sh =
        shape.kind === 'poly'
          ? polygon(shape.points.map(([x, y]) => at(x, y)))
          : (() => {
              const q = at(shape.cx, shape.cy);
              return ellipse(q.x, q.y, Math.max(0.6, shape.rx * R * 0.82 * K), Math.max(0.6, shape.ry * R * 0.4 * K), angle);
            })();
      r.shape(intersect(sh.sd, ball.sd), sh.box, wear(shape.paint), C.outline, undefined, (x, y) => ball.sd(x, y) <= 0);
    }
  }

  // --- A skirt ---
  if (clothes?.skirt) {
    const colour = wear(clothes.skirt.paint);
    if (clothes.skirt.style === 'tutu') {
      const q = on(0, R * 0.55);
      const e = ellipse(q.x, q.y, rx * 1.22 * K, R * 0.26 * K, angle);
      r.shape(e.sd, e.box, (x, y) => ((Math.floor(x) + Math.floor(y)) % 3 === 0 ? C.wearAccent : colour), C.outline);
    } else {
      const robe = polygon([on(-rx * 0.95, coverTop), on(rx * 0.95, coverTop), T({ x: c.x + rx * 1.12, y: bottom + R * 0.15 }), T({ x: c.x - rx * 1.12, y: bottom + R * 0.15 })]);
      r.shape(robe.sd, robe.box, colour, C.outline, { light: colour, dark: C.wearDark });
      if (clothes.stars) stars(C.wearTrim, [[-0.55, 0.75], [0.5, 0.95]]);
    }
  }
  drawFoot(nearFoot, false);

  // --- Its face ---
  if (!behind) drawFace();

  // --- A costume's hood, then a hat, on top ---
  wearOn(hoodOf(dress), PAINT_SLOT.wear);
  wearOn(hatItem(dress.hat), PAINT_SLOT.hat);

  // --- In front: the near wing and arm, and both paws on the edge peeking ---
  if (clothes?.wings && side) drawWing(clothes.wings, 140);
  if (farInFront) drawArm(far, true);
  drawArm(near, false);

  if (s.facing < 0) r.mirror(FX);
  const box = r.bounds((v) => v === C.shadow);
  drawMarks(r, p.mark, { x: FX + c.x * K * s.facing, y: FY + (c.y - ry - 4) * K }, s.facing, clock);

  return {
    box,
    scruff: { x: c.x - R * 0.15, y: c.y - ry * 0.95 },
    // A block it's picked up, it holds in its mouth.
    toy: { x: c.x + rx * 0.9 + 6, y: c.y + R * 0.25 },
  };

  function drawFace(): void {
    const eye = (lx: number) => {
      const { x, y } = floor(on(face.x + lx, face.y));
      switch (p.eyes) {
        case 'closed':
          r.dots([{ x: x - 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }, { x: x + 2, y }], C.eye);
          return;
        case 'happy':
          r.dots([{ x: x - 1, y: y + 1 }, { x, y }, { x: x + 1, y }, { x: x + 2, y: y + 1 }], C.eye);
          return;
        case 'blink':
          r.dots([{ x: x - 1, y: y + 1 }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }, { x: x + 2, y: y + 1 }], C.eye);
          return;
        default: {
          // Tall ovals, a white glint at the top and a blue shine at the bottom.
          const wide = p.eyes === 'wide';
          const cols = wide ? [x - 1, x, x + 1] : [x, x + 1];
          const rows = wide ? [y - 3, y - 2, y - 1, y, y + 1] : [y - 2, y - 1, y, y + 1];
          for (const cx of cols) for (const cy of rows) r.set(cx, cy, cy === rows[rows.length - 1] ? C.inner : C.eye);
          r.set(cols[0]!, rows[0]!, C.glint);
        }
      }
    };
    const apart = R * 0.17;
    eye(apart);
    eye(-apart * (side ? 0.85 : 1));

    // Pink cheeks, always.
    const cheeks = p.blush >= 0.6 ? 3 : 2;
    for (const lx of [R * 0.38, -R * 0.36 * (side ? 0.9 : 1)]) {
      const q = floor(on(face.x + lx, face.y + R * 0.2));
      for (let i = 0; i < cheeks; i++) r.set(q.x + i - 1, q.y, C.blush);
    }

    // The mouth: a little smile, a puffed-up "o", or wide open (a yawn, or breathing in a block).
    const m = floor(on(face.x + R * 0.02, face.y + R * 0.27));
    let open = p.mouth;
    const tossing = a === 'toss' || a === 'lift' || a === 'throw';
    if (tossing) open = t < PLAY.tossGrabMs ? clamp01(t / (PLAY.tossGrabMs * 0.6)) : t < PLAY.tossReleaseMs ? 0 : p.mouth;
    if (open > 0.15) {
      const w = 0.8 + open * 2.2;
      const h = 0.7 + open * 2.6;
      const mouth = ellipse(m.x + 0.5, m.y + 0.5 + h * 0.4, w, h);
      r.shape(mouth.sd, mouth.box, C.mouth, null);
      const tongue = ellipse(m.x + 0.5, m.y + 0.5 + h * 0.9, w * 0.65, h * 0.4);
      r.shape(intersect(tongue.sd, mouth.sd), tongue.box, C.tongue, null);
    } else if (travelling || (tossing && t < PLAY.tossReleaseMs)) {
      r.dots([m, { x: m.x + 1, y: m.y }], C.mouth);
    } else {
      r.dots([{ x: m.x - 1, y: m.y }, { x: m.x, y: m.y + 1 }, { x: m.x + 1, y: m.y + 1 }, { x: m.x + 2, y: m.y }], C.mouth);
    }
  }

  /** Something it wears on its head, in hat units: its head is the whole ball. */
  function wearOn(worn: Wearable | null, slots: Record<Paint, number>): void {
    if (!worn) return;
    const ox = -R * 0.04;
    const oy = -ry * 0.92;
    for (const sh of worn.shapes) {
      const shape =
        sh.kind === 'poly'
          ? polygon(sh.points.map(([x, y]) => on(ox + x * R, oy + y * R)))
          : (() => {
              const q = on(ox + sh.cx * R, oy + sh.cy * R);
              return ellipse(q.x, q.y, Math.max(0.6, sh.rx * R * K), Math.max(0.6, sh.ry * R * K), angle);
            })();
      r.shape(shape.sd, shape.box, slots[sh.paint], C.outline);
    }
  }

  /** A little wing at `deg` round its edge, buzzing as it goes. */
  function drawWing(paint: Paint, deg: number): void {
    const beat = travelling ? Math.sin(clock / 35) * 0.45 : Math.sin(clock / 400) * 0.12;
    const out = deg > 90 ? -1 : 1;
    const a0 = deg * DEG + out * beat;
    const base = rim(deg, 0.8);
    const len = R * 0.5;
    const q = on(base.x + Math.cos(a0) * len, base.y - Math.sin(a0) * len);
    const e = ellipse(q.x, q.y, len * K, R * 0.27 * K, angle - a0);
    r.shape(e.sd, e.box, wear(paint), C.outline);
  }

  /** A cape: behind it, flying out as it goes; from behind, over its back. */
  function drawCape(): void {
    const fly = Math.min(1, s.moving) * (0.8 + 0.2 * Math.sin(clock / 120));
    const cape = side
      ? polygon([on(R * 0.2, -ry * 0.85), on(-R * 0.55, -ry * 0.95), on(-R * (1.3 + 0.4 * fly), -R * (0.1 + 0.5 * fly)), on(-R * (1.15 + 0.3 * fly), R * (0.95 - 0.5 * fly)), on(-R * 0.2, R * 0.9)])
      : polygon([on(-R * 0.75, -ry * 0.6), on(R * 0.75, -ry * 0.6), on(R * 1.12, R * 1.0), on(-R * 1.12, R * 1.0)]);
    r.shape(cape.sd, cape.box, C.wearMain, C.outline, { light: C.wearLight, dark: C.wearAccent });
  }

  /** Little + stars at these places on the ball (in radii from its middle). */
  function stars(colour: number, at: [number, number][]): void {
    for (const [x, y] of at) {
      const q = floor(on(x * R, y * R));
      r.dots([q, { x: q.x - 1, y: q.y }, { x: q.x + 1, y: q.y }, { x: q.x, y: q.y - 1 }, { x: q.x, y: q.y + 1 }], colour);
    }
  }
}

const xy = (p: Pt): [number, number] => [p.x, p.y];
const floor = (p: Pt): Pt => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

/** The puffball's renderer. */
export function createBlob(doc: Document, palette: Palette, className: string, label: string): RaccoonRenderer {
  const { width: W, height: H, feetX, feetY, k: K } = PIXEL;
  const view = pixelCanvas(doc, palette, className, label);
  const motion = new ChibiMotion(BLOB);
  let scruff: Pt | null = null;
  let toy: Pt | null = null;
  let hover = HOVER;
  let target = HOVER;
  let lastClock = -1;
  let shownTick = NaN;
  let shownFacing = 0;
  let shownView = '';
  view.onChange = () => void (shownTick = NaN);
  view.sizeTo();

  return {
    element: view.root,
    figure: view.figure,
    baseSize: { width: W * PIXEL_PX, height: H * PIXEL_PX },
    anchor: { x: feetX / W, y: feetY / H },
    peekSink: BLOB.peekSink * K * PIXEL_PX,
    turnsItself: true,
    pixelated: true,
    // Floating, it bobs about even standing still.
    animations: { ...TIMING, idle: { fps: 24 }, sit: { fps: 20 } },
    isSettling: () => motion.settling || Math.abs(hover - target) > 0.2,
    holdPoint: () => (scruff ? { x: scruff.x * motion.facing * K * view.cell, y: scruff.y * K * view.cell } : null),
    toyReach: BLOB.toyReach * K * PIXEL_PX,
    toySize: PIXEL_TOY * PIXEL_PX,
    toyLook: 'pixel',
    carriesToys: false,
    deskReach: { x: BLOB.desk.x * K * PIXEL_PX, y: BLOB.desk.y * K * PIXEL_PX },
    mouseReach: { x: BLOB.mouse.x * K * PIXEL_PX, y: BLOB.mouse.y * K * PIXEL_PX },
    drawsMarks: true,
    toyPoint: () => (toy ? { x: toy.x * motion.facing * K * view.cell, y: toy.y * K * view.cell } : null),
    dress: (d) => view.dress(d),
    setScale(next) {
      view.scale = next;
      view.sizeTo();
    },
    draw(frame) {
      const pose = motion.update(frame, 1 / (K * view.cell));
      const clock = frame.clockMs ?? frame.timeMs;
      // It rises off the floor and settles back onto it gently, never in a jump.
      target = hoverFor(frame.animation);
      const dt = lastClock < 0 ? 1 : Math.min(0.1, Math.max(0, (clock - lastClock) / 1000));
      lastClock = clock;
      hover += (target - hover) * Math.min(1, dt * 5);
      const tick = Math.floor(clock / (1000 / PIXEL_FPS));
      if (tick === shownTick && motion.facing === shownFacing && motion.view === shownView) return;
      shownTick = tick;
      shownFacing = motion.facing;
      shownView = motion.view;
      const drawn = drawBlob(
        view.raster,
        pose,
        { animation: frame.animation, t: frame.timeMs, clock, facing: motion.facing, view: motion.view, moving: motion.moving, phase: motion.phase, hover },
        view.dressed,
      );
      scruff = drawn.scruff;
      toy = drawn.toy;
      view.paint(drawn.box);
    },
  };
}
