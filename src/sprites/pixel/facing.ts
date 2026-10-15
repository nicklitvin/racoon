import { WATER_Y, type ChibiPose } from '../chibi/pose';
import { hatItem, NECK_WIDTH, outfitItem, type Dress, type Shape, type Wearable } from '../outfits';
import { EARS, PAINT_SLOT, PIXEL, TAIL_BANDS } from './draw';
import { C } from './palette';
import { capsule, ellipse, intersect, joinBoxes, polygon, Raster, tube, union, type Box, type Pt } from './raster';
import type { PixelBuild } from './species';

/**
 * The pixel pets walking towards you (down the screen) or away from you (up it), the way
 * sprites in old games have a picture for each way they can face: from the front, his face
 * looking where he's going, his front legs stepping towards you and his tail waving behind;
 * from behind, the back of his head and his tail up in front of you.
 *
 * Drawn from the same build as the side view, in the same units: x across the screen, y
 * down, the feet on the floor at 0.
 */

export type View = 'front' | 'back';

export interface Walking {
  /** How far round the stride he is, 0..1. */
  phase: number;
  /** 0 standing .. 1 walking .. 1.5 flat out. */
  moving: number;
  /** Running (a bigger, bouncier stride). */
  running: boolean;
  /** Which way he last faced side on: the tail and the hat lean to that side. */
  side: number;
}

export function drawPixelFacing(r: Raster, b: PixelBuild, p: ChibiPose, view: View, walk: Walking, clock: number, dress: Dress): Box | null {
  const { feetX: FX, feetY: FY, k: K } = PIXEL;
  r.clear();
  const species = b.species;
  const front = view === 'front';
  const swims = b.swims === true;

  // A step: each pair of diagonal legs lifts in turn, and the body bobs up over each.
  const u = walk.phase * Math.PI * 2;
  const stride = walk.running ? 4.5 : 3;
  const step = (offset: number) => Math.max(0, Math.sin(u + offset)) * stride * Math.min(1, walk.moving);
  const bob = -Math.abs(Math.sin(u)) * (walk.running ? 1.8 : 1) * Math.min(1, walk.moving);
  const lift = p.lift + bob;
  const T = (x: number, y: number): Pt => ({ x: FX + x * K, y: FY + (y + lift) * K });
  const sway = Math.sin(u) * (walk.running ? 1.5 : 1) * Math.min(1, walk.moving);

  const B = b.body;
  const H = b.head;
  // Seen end on, the body is round.
  const bodyR = B.ry * 1.05;
  const bodyY = swims ? WATER_Y + 1.5 : B.at.y;
  const headY = (swims ? WATER_Y - 2 : B.at.y) + (swims ? -H.ry * 0.95 : b.head.at.y) + p.hy * 0.5;
  const clothes = outfitItem(dress.outfit)?.body ?? null;
  const covered = clothes?.covered === true;

  // --- Shadow, and the far side of the pond ---
  if (!swims) {
    const s = ellipse(FX, FY + 0.5 * K, (bodyR + 6) * K * (1 - Math.min(0.6, -p.lift / 40)), 1.4);
    r.shape(s.sd, s.box, C.shadow, null);
  } else {
    const pond = ellipse(FX, FY + WATER_Y * K, 24 * K, 6 * K);
    r.shape(pond.sd, pond.box, C.water, C.waterDark, { light: C.waterLight, dark: C.water });
    r.clipBelow = Math.floor(FY + (WATER_Y + 1.6) * K);
  }

  // --- The tail: from the front, sticking out behind him to one side; from behind, the
  // nearest thing to you: a cat's up in a curl, a raccoon's hanging down in its rings ---
  const drawTail = () => {
    const count = 10;
    const length = b.tail.length * 0.9;
    const cat = species === 'cat';
    const base = front ? { x: B.ry * 0.55, y: bodyY - B.ry * 0.15 } : { x: B.ry * 0.1, y: bodyY + B.ry * (cat ? 0.1 : 0.35) };
    const spine: Pt[] = [T(base.x, base.y)];
    let at = base;
    const start = front ? (cat ? 5 : 15) : cat ? 70 : -75;
    const curl = cat ? 80 : species === 'raccoon' ? (front ? 20 : 8) : 10;
    for (let i = 1; i <= count; i++) {
      const s = i / count;
      const a = ((start + curl * s ** 1.3 + sway * 12) * Math.PI) / 180;
      at = { x: at.x + Math.cos(a) * (length / count) * walk.side, y: at.y - Math.sin(a) * (length / count) };
      spine.push(T(at.x, at.y));
    }
    const radii = spine.map((_, i) => Math.max(0.6, b.tail.radius(i / count) * K));
    const t = tube(spine, radii);
    const bands = TAIL_BANDS[species];
    r.shape(t.sd, t.box, (x, y) => (bands.some(([a, z]) => t.at(x, y) >= a && t.at(x, y) < z) ? C.band : C.fur), C.outline);
  };
  if (front && !swims) drawTail();

  // --- A cape: from the front, behind him; from behind, it's what you see ---
  const drawCape = (behind: boolean) => {
    const w = bodyR * (behind ? 1.25 : 1.15);
    const flap = Math.sin(clock / 140) * Math.min(1, walk.moving) * 1.2;
    const cape = polygon([T(-bodyR * 0.7, bodyY - bodyR * 1.05), T(bodyR * 0.7, bodyY - bodyR * 1.05), T(w + flap, bodyY + bodyR * 0.9), T(-w - flap, bodyY + bodyR * 0.9)]);
    r.shape(cape.sd, cape.box, C.wearMain, C.outline, { light: C.wearLight, dark: C.wearAccent });
  };
  if (clothes?.cape && front) drawCape(true);

  // --- Legs: the far pair behind, out to the sides, the near pair in front ---
  const leg = (x: number, raise: number, far: boolean) => {
    const root = T(x * 0.9, bodyY + bodyR * 0.2);
    const paw = T(x, -raise - lift);
    const c = capsule(root, paw, (b.legWidth / 2) * K * (far ? 0.9 : 1));
    r.shape(c.sd, c.box, far ? C.far : C.fur, C.outline);
    if (clothes && clothes.sleeves > 0) {
      const k = clothes.sleeves;
      const cuff = { x: root.x + (paw.x - root.x) * k, y: root.y + (paw.y - root.y) * k };
      const sleeve = capsule(root, cuff, (b.legWidth / 2) * K + 0.5);
      r.shape(intersect(sleeve.sd, c.sd), sleeve.box, far ? C.wearDark : C.wearMain, null);
    }
  };
  if (!swims) {
    const out = bodyR * 0.72;
    const near = bodyR * 0.42;
    leg(-out, step(Math.PI), true);
    leg(out, step(0), true);
    leg(-near, step(0), false);
    leg(near, step(Math.PI), false);
  }

  // --- Body ---
  const bodyC = T(0, bodyY);
  const body = ellipse(bodyC.x, bodyC.y, bodyR * K, bodyR * K * 0.95);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  if (front) {
    // A paler chest and tummy.
    const chest = ellipse(bodyC.x, bodyC.y + bodyR * 0.25 * K, bodyR * 0.55 * K, bodyR * 0.62 * K);
    r.shape(intersect(chest.sd, body.sd), chest.box, species === 'raccoon' ? C.light : C.belly, null);
  }
  if (covered && clothes) {
    r.shape(body.sd, body.box, C.wearMain, null, { light: C.wearLight, dark: C.wearDark });
    if (front && clothes.shirt) {
      const shirt = polygon([T(-bodyR * 0.4, bodyY - bodyR), T(bodyR * 0.4, bodyY - bodyR), T(0, bodyY + bodyR * 0.35)]);
      r.shape(intersect(shirt.sd, body.sd), shirt.box, C.wearTrim, null);
    }
    if (clothes.bands) {
      const { paint, count, width } = clothes.bands;
      for (let i = 0; i < count; i++) {
        const y = bodyY - bodyR * 0.6 + (bodyR * 1.3 * (i + 0.5)) / count;
        const band = capsule(T(-bodyR - 2, y), T(bodyR + 2, y), Math.max(0.5, width * B.rx * K * 0.6));
        r.shape(intersect(band.sd, body.sd), band.box, PAINT_SLOT.wear[paint], null);
      }
    }
    if (front && clothes.buttons) r.dots([0.1, 0.4, 0.7].map((k) => ({ x: Math.floor(bodyC.x), y: Math.floor(bodyC.y + (k - 0.3) * bodyR * K) })), C.wearAccent);
  }
  if (clothes?.cape && !front) drawCape(false);
  // From behind, a raccoon's tail hangs down over its back legs; a cat's comes up after its head.
  if (!front && !swims && species !== 'cat') drawTail();

  // --- Head ---
  const hc = T(0, headY);
  const at = (x: number, y: number): Pt => ({ x: hc.x + x * K, y: hc.y + y * K });

  // Round the neck: centred on the chest from the front, round the back from behind.
  const neck = outfitItem(dress.outfit);
  if (neck) wear(neck, { x: 0, y: H.ry * 1.02 }, H.rx * NECK_WIDTH, PAINT_SLOT.wear, true);

  // Ears, both up on top.
  const ear = EARS[species];
  for (const side of [-1, 1]) {
    const deg = 90 - (90 - ear.near) * side;
    const base = { x: Math.cos((deg * Math.PI) / 180) * H.rx * 0.82, y: -Math.sin((deg * Math.PI) / 180) * H.ry * 0.82 };
    const tilt = ((90 - deg) * 0.55 * Math.PI) / 180;
    const place = (x: number, y: number) => at(base.x + x * Math.cos(tilt) - y * Math.sin(tilt), base.y + x * Math.sin(tilt) + y * Math.cos(tilt));
    if (species === 'otter') {
      const c = place(0, -0.6);
      const e = ellipse(c.x, c.y, ear.w * K, ear.h * K);
      r.shape(e.sd, e.box, C.fur, C.outline);
      continue;
    }
    const tri = (k: number) => polygon([place(-ear.w * k, 1.5), place(0, -ear.h * k), place(ear.w * k, 1.5)]);
    const outer = tri(1);
    r.shape(outer.sd, outer.box, C.fur, C.outline);
    if (front) {
      const inner = tri(0.55);
      r.shape(intersect(inner.sd, outer.sd), inner.box, C.inner, null);
    }
  }

  // The head: round, with a cheek tuft either side.
  const skull = ellipse(hc.x, hc.y, H.rx * K, H.ry * K);
  const tuft = species === 'otter' ? null : (dir: number) => polygon([at(dir * H.rx * 0.92, H.ry * 0.25), at(dir * H.rx * (species === 'raccoon' ? 1.18 : 1.07), H.ry * 0.5), at(dir * H.rx * 0.8, H.ry * 0.62)]).sd;
  const head = tuft ? union(skull.sd, tuft(-1), tuft(1)) : skull.sd;
  const headBox = { x0: skull.box.x0 - 3, y0: skull.box.y0 - 3, x1: skull.box.x1 + 3, y1: skull.box.y1 + 3 };
  r.shape(head, headBox, C.fur, C.outline, { light: C.furLight, dark: C.fur });
  const mark = (cx: number, cy: number, rx: number, ry: number, colour: number) => {
    const c = at(cx, cy);
    const e = ellipse(c.x, c.y, rx * K, ry * K);
    r.shape(intersect(e.sd, head), e.box, colour, null);
  };
  const rx = H.rx;
  const ry = H.ry;

  if (front) {
    // The face, square on.
    switch (species) {
      case 'raccoon':
        for (const s of [-1, 1]) mark(s * rx * 0.33, -ry * 0.44, rx * 0.24, ry * 0.15, C.light);
        for (const s of [-1, 1]) mark(s * rx * 0.34, ry * 0.04, rx * 0.3, ry * 0.22, C.dark);
        mark(0, -ry * 0.02, rx * 0.2, ry * 0.12, C.dark);
        mark(0, ry * 0.5, rx * 0.42, ry * 0.3, C.light);
        break;
      case 'cat':
        for (const x of [-0.18, 0, 0.18]) {
          const stripe = capsule(at(rx * x, -ry * 1.05), at(rx * x, -ry * 0.62), 0.5);
          r.shape(intersect(stripe.sd, head), stripe.box, C.band, null);
        }
        mark(0, ry * 0.52, rx * 0.38, ry * 0.28, C.light);
        break;
      case 'otter':
        mark(0, ry * 0.48, rx * 0.52, ry * 0.36, C.light);
        break;
    }
    const pix = (x: number, y: number) => {
      const q = at(x, y);
      return { x: Math.floor(q.x), y: Math.floor(q.y) };
    };
    for (const s of [-1, 1]) {
      const { x, y } = pix(s * rx * 0.33 - (s < 0 ? 1 / K : 0), ry * 0.04);
      switch (p.eyes) {
        case 'closed':
          r.dots([{ x: x - 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }, { x: x + 2, y }], C.eye);
          break;
        case 'happy':
          r.dots([{ x: x - 1, y: y + 1 }, { x, y }, { x: x + 1, y }, { x: x + 2, y: y + 1 }], C.eye);
          break;
        case 'blink':
          r.dots([{ x: x - 1, y: y + 1 }, { x, y: y + 1 }, { x: x + 1, y: y + 1 }, { x: x + 2, y: y + 1 }], C.eye);
          break;
        default: {
          const wide = p.eyes === 'wide';
          const cols = wide ? [x - 1, x, x + 1] : [x, x + 1];
          for (const cx of cols) for (const cy of [y - 1, y, y + 1]) r.set(cx, cy, C.eye);
          r.set(cols[cols.length - 1]!, y - 1, C.glint);
        }
      }
    }
    const n = pix(0, ry * 0.32);
    r.dots(species === 'otter' ? [{ x: n.x - 1, y: n.y }, n, { x: n.x + 1, y: n.y }, { x: n.x, y: n.y + 1 }] : [{ x: n.x - 1, y: n.y }, n], C.nose);
    if (p.mouth > 0.12) {
      const h = 1 + Math.round(p.mouth * 2.5);
      for (let i = 1; i <= h; i++) r.dots([{ x: n.x - 1, y: n.y + i }, { x: n.x, y: n.y + i }], C.mouth);
    }
    if (p.blush >= 0.6) {
      const a = pix(-rx * 0.6, ry * 0.42);
      const z = pix(rx * 0.6, ry * 0.42);
      r.dots([a, { x: a.x - 1, y: a.y }, z, { x: z.x + 1, y: z.y }], C.blush);
    }
  }

  // A hat on top.
  wear(hatItem(dress.hat), { x: -H.rx * 0.0, y: -H.ry * 0.9 }, H.rx, PAINT_SLOT.hat, false);

  if (!front && species === 'cat') drawTail();

  // --- The near side of the pond ---
  if (swims) {
    r.clipBelow = Infinity;
    const crest: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -24 + (48 * i) / 12;
      crest.push({ x: FX + x * K, y: FY + (WATER_Y + 0.8 * Math.sin(x * 0.4 + clock / 260)) * K });
    }
    const below: Pt[] = [];
    for (let i = 1; i < 12; i++) {
      const a = Math.PI * (i / 12);
      below.push({ x: FX + Math.cos(a) * 24 * K, y: FY + (WATER_Y + Math.sin(a) * 6) * K });
    }
    const near = polygon([...crest, ...below]);
    r.shape(near.sd, near.box, C.water, C.waterDark, { light: C.waterLight, dark: C.water }, (x, y) => r.get(Math.floor(x), Math.floor(y)) === 0);
    // Ripples out to either side as it swims.
    if (walk.moving > 0.05) {
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) r.set(Math.round(FX + s * (10 + i) * K * 1.6), Math.round(FY + (WATER_Y + 1) * K), C.waterLight);
    }
  }

  if (walk.side < 0) r.mirror(FX);
  const box = r.bounds((c) => c === C.shadow);
  return box ? joinBoxes(box) : null;

  /**
   * Something he's wearing, seen from the front or behind. Neckwear made for the side view
   * keeps its band across the neck; what hangs at its front (a tie, a bell) comes round to
   * the middle.
   */
  function wear(item: Wearable | null, origin: Pt, size: number, slots: Record<'main' | 'trim' | 'accent', number>, neckwear: boolean): void {
    if (!item) return;
    for (const s of item.shapes) {
      if (neckwear && !front && isFrontPiece(s)) continue;
      const dx = neckwear && isFrontPiece(s) ? -0.85 : 0;
      const place = (x: number, y: number) => at(origin.x + (x + dx) * size, origin.y + y * size);
      const shape =
        s.kind === 'poly'
          ? polygon(s.points.map(([x, y]) => place(x, y)))
          : (() => {
              const c = place(s.cx, s.cy);
              return ellipse(c.x, c.y, Math.max(0.6, s.rx * size * K), Math.max(0.6, s.ry * size * K));
            })();
      r.shape(shape.sd, shape.box, slots[s.paint], C.outline);
    }
  }
}

/** A piece of neckwear that hangs at the front (a tie, a bell, a bow), rather than going round. */
function isFrontPiece(s: Shape): boolean {
  if (s.kind === 'ellipse') return s.cx > 0.2;
  const xs = s.points.map(([x]) => x);
  return Math.min(...xs) > 0;
}
