import { DEG, clamp01 } from '../critter/kit';
import { ballRadius, bodyFrame, headCentre, legRoot, WATER_Y, type ChibiMark, type ChibiPose, type LegName } from '../chibi/pose';
import { hatItem, NECK_WIDTH, outfitItem, UNDRESSED, type Dress, type Paint, type Wearable } from '../outfits';
import { GLYPHS } from './glyphs';
import { C } from './palette';
import { capsule, ellipse, intersect, joinBoxes, polygon, Raster, tube, union, type Box, type Pt, type Sd } from './raster';
import type { PixelBuild, PixelSpecies } from './species';

/**
 * Draws a pixel-art pet from the same poses as the chibis: the same big head, bean body,
 * stubby legs and tail, but rasterised into a small grid of whole pixels with a one-pixel
 * outline, flat colours and a lit top edge, like a sprite from an old handheld game.
 */

/** The picture's size in pixels, where the feet are in it, and pixels per chibi drawing unit. */
export const PIXEL = { width: 64, height: 54, feetX: 32, feetY: 46, k: 0.5 };

/** Bands across the tail (from 0 at the root to 1 at the tip). */
export const TAIL_BANDS: Record<PixelSpecies, [number, number][]> = {
  raccoon: [
    [0.3, 0.42],
    [0.55, 0.67],
    [0.8, 1.01],
  ],
  cat: [
    [0.42, 0.5],
    [0.67, 0.75],
  ],
  otter: [],
  // A bunny's is all white, a cotton ball.
  bunny: [[0, 1.01]],
  hedgehog: [],
};

/**
 * Ears: pointed, round or long (a bunny's), their half width and height at the base, and
 * where on the head they sit (degrees, 90 = top).
 */
export const EARS: Record<PixelSpecies, { kind: 'point' | 'round' | 'long'; w: number; h: number; near: number; far: number }> = {
  cat: { kind: 'point', w: 6.4, h: 10.5, near: 58, far: 122 },
  raccoon: { kind: 'point', w: 6.6, h: 9.5, near: 56, far: 124 },
  otter: { kind: 'round', w: 3.6, h: 3.4, near: 42, far: 138 },
  bunny: { kind: 'long', w: 3.8, h: 25, near: 96, far: 120 },
  hedgehog: { kind: 'round', w: 2.4, h: 2.2, near: 84, far: 100 },
};

/** Where the eyes are on the face, far one first, in head radii. */
export const EYES: Record<PixelSpecies, [Pt, Pt]> = {
  raccoon: [{ x: -0.18, y: 0.04 }, { x: 0.4, y: 0.06 }],
  cat: [{ x: -0.18, y: 0.04 }, { x: 0.4, y: 0.06 }],
  otter: [{ x: -0.18, y: 0.04 }, { x: 0.4, y: 0.06 }],
  // A bunny's and a hedgehog's eyes are on the sides of their heads: side on, you see one.
  bunny: [{ x: -0.16, y: 0.02 }, { x: 0.2, y: -0.06 }],
  hedgehog: [{ x: 0.1, y: -0.02 }, { x: 0.4, y: -0.12 }],
};

/** Animals with an eye on each side of the head, rather than both at the front: side on, only the near one shows. */
const SIDE_EYED: ReadonlySet<PixelSpecies> = new Set(['bunny', 'hedgehog']);

/** Cheek tufts: [angle round the head, how far out]. */
const TUFTS: Record<PixelSpecies, [number, number][]> = {
  raccoon: [
    [205, 0.2],
    [335, 0.16],
  ],
  cat: [
    [205, 0.08],
    [330, 0.08],
  ],
  otter: [],
  bunny: [],
  hedgehog: [],
};

/** The palette slots for each of an item's paints. */
export const PAINT_SLOT = {
  hat: { main: C.hatMain, trim: C.hatTrim, accent: C.hatAccent },
  wear: { main: C.wearMain, trim: C.wearTrim, accent: C.wearAccent },
} satisfies Record<string, Record<Paint, number>>;

/** Samples a quadratic Bezier, for turning the chibi's curved markings into polygons. */
function quad(a: Pt, c: Pt, b: Pt, steps = 4): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  }
  return out;
}

/** A path of [start, (control, end)...] in head radii, as a polygon. */
function curvy(points: [number, number][], rx: number, ry: number): Pt[] {
  const p = points.map(([x, y]) => ({ x: x * rx, y: y * ry }));
  const out: Pt[] = [p[0]!];
  for (let i = 1; i + 1 < p.length; i += 2) out.push(...quad(out[out.length - 1]!, p[i]!, p[i + 1]!));
  return out;
}

/** Three-quarter views, for going diagonally: towards you (down the screen) or away (up it). */
export type Quarter = 'front' | 'back' | null;

/** In a three-quarter view the body is this much shorter, end on to you. */
export const QUARTER_SQUASH = 0.62;

/**
 * Draws the pet into `r` (cleared first) and returns the box round the figure itself, for
 * grabbing it. `facing` -1 mirrors it to face left; the marks over its head stay readable.
 * `quarter` turns him three-quarters towards you or away from you: his body foreshortened,
 * from the front his face turned out to you, from behind no face and his tail nearest you.
 */
export function drawPixelPet(r: Raster, b: PixelBuild, p: ChibiPose, clock: number, facing: number, moving: number, scruff: Pt, dress: Dress = UNDRESSED, quarter: Quarter = null): Box | null {
  const { feetX: FX, feetY: FY, k: K } = PIXEL;
  const species = b.species;
  r.clear();

  // Carried, the whole figure swings about the scruff.
  const sw = p.swing * DEG;
  const cs = Math.cos(sw);
  const ss = Math.sin(sw);
  /** A point in drawing units to pixels. */
  const T = (u: Pt): Pt => {
    let { x, y } = u;
    if (sw) {
      const dx = x - scruff.x;
      const dy = y - scruff.y;
      x = scruff.x + dx * cs - dy * ss;
      y = scruff.y + dx * ss + dy * cs;
    }
    return { x: FX + x * K * squash, y: FY + y * K };
  };
  const squash = quarter ? QUARTER_SQUASH : 1;
  const behind = quarter === 'back';

  const frame = bodyFrame(b, p);
  const bodyAngle = -p.rot * DEG + sw;
  const wet = p.wet > 0.5;

  // --- The shadow, and the far side of the pond ---
  const lifted = clamp01(-p.lift / 26);
  const hidden = p.swing !== 0 || wet || p.paws.frontNear.y < -b.peekSink + 2;
  if (!hidden) {
    const at = T({ x: -2, y: 0.5 });
    const e = ellipse(at.x, at.y, (b.body.rx * squash + 7) * K * (1 - lifted * 0.6), 1.4);
    r.shape(e.sd, e.box, C.shadow, null);
  }
  // A hedgehog rolled up is just its spiky ball (it's still held by its middle).
  if (p.ball > 0.5) {
    const at = T({ x: frame.cx, y: frame.cy });
    const R = ballRadius(b);
    drawSpikyBall(r, at, R * K, p.sx, p.sy, p.roll, moving < 0.2);
    if (facing < 0) r.mirror(FX);
    const box = r.bounds((c) => c === C.shadow);
    drawMarks(r, p.mark, { x: FX + frame.cx * K * facing, y: FY + (frame.cy - R - 6) * K }, facing, clock);
    return box ? joinBoxes(box) : null;
  }
  const pond = { cx: -3 - moving * 4, rx: 34 + moving * 6, ry: 7 };
  if (wet) {
    const at = T({ x: pond.cx, y: WATER_Y });
    const e = ellipse(at.x, at.y, pond.rx * K, pond.ry * K);
    r.shape(e.sd, e.box, C.water, C.waterDark, { light: C.waterLight, dark: C.water });
    // In the water, whatever of it is under the surface is out of sight.
    r.clipBelow = Math.floor(FY + (WATER_Y + 1.6) * K);
  }

  // --- Tail ---
  const tailShape = () => {
    const root = frame.at(b.tail.root);
    const count = 12;
    const step = b.tail.length / count;
    const spine: Pt[] = [T(root)];
    let at = root;
    for (let i = 1; i <= count; i++) {
      const s = i / count;
      const a = (p.tailA + p.rot + p.tailCurl * s ** 1.4) * DEG;
      at = { x: at.x + Math.cos(a) * step, y: at.y - Math.sin(a) * step };
      spine.push(T(at));
    }
    const radii = spine.map((_, i) => Math.max(0.6, b.tail.radius(i / count) * p.tailPuff * K));
    return tube(spine, radii);
  };
  const drawTail = () => {
    if (b.tail.length <= 0) return;
    const t = tailShape();
    const bands = TAIL_BANDS[species];
    r.shape(t.sd, t.box, (x, y) => {
      const s = t.at(x, y);
      return bands.some(([a, z]) => s >= a && s < z) ? C.band : C.fur;
    }, C.outline);
  };
  // Going away from you, his tail is the nearest thing to you: it comes after his body.
  if (p.tailFront <= 0.5 && !behind) drawTail();

  // What he's wearing on his body, if anything.
  const clothes = outfitItem(dress.outfit)?.body ?? null;
  const covered = clothes?.covered === true;

  // --- Legs ---
  const raised = (leg: LegName) => (leg === 'frontNear' && p.pawUp > 0.5) || (leg === 'frontFar' && p.pawUp > 1.5);
  const drawLeg = (leg: LegName) => {
    const root = T(legRoot(b, p, leg));
    const paw = T({ x: p.paws[leg].x, y: p.paws[leg].y + p.lift });
    const front = leg.startsWith('front');
    const w = (b.legWidth / 2) * K * (species === 'bunny' && front ? 0.8 : 1);
    const far = leg.endsWith('Far');
    const c = capsule(root, paw, w);
    const colour = species === 'hedgehog' ? (far ? C.dark : C.furDark) : far ? C.far : C.fur;
    r.shape(c.sd, c.box, colour, C.outline);
    if (species === 'bunny' && !front) {
      // A big flat hind foot: along the floor from the heel, or trailing out behind in a hop.
      const air = clamp01(-(p.paws[leg].y + p.lift) / 3);
      const dx = paw.x - root.x;
      const dy = paw.y - root.y;
      const d = Math.hypot(dx, dy) || 1;
      const ax = 1 + (dx / d - 1) * air * 0.8;
      const ay = (dy / d) * air * 0.8;
      const a = Math.hypot(ax, ay) || 1;
      const length = 6.5 * K;
      const toe = { x: paw.x + (ax / a) * length, y: paw.y + (ay / a) * length };
      const foot = capsule({ x: paw.x - 0.5, y: paw.y }, toe, w, w * 0.8);
      r.shape(foot.sd, foot.box, colour, C.outline);
    }
    // Sleeves and trouser legs, down to the cuffs.
    if (clothes && clothes.sleeves > 0) {
      const k = clothes.sleeves;
      const cuff = { x: root.x + (paw.x - root.x) * k, y: root.y + (paw.y - root.y) * k };
      const sleeve = capsule(root, cuff, w + 0.5);
      r.shape(intersect(sleeve.sd, c.sd), sleeve.box, far ? C.wearDark : C.wearMain, null);
    }
  };
  for (const leg of ['backFar', 'frontFar'] as const) if (!raised(leg)) drawLeg(leg);
  for (const leg of ['backNear', 'frontNear'] as const) if (!raised(leg)) drawLeg(leg);

  // --- Body ---
  const bc = T({ x: frame.cx, y: frame.cy });
  const sx = Math.abs(p.sx);
  const sy = Math.abs(p.sy);
  const B = b.body;
  // A costume's spikes and far wing, behind the body.
  if (clothes?.spikes) drawSpikes(clothes.spikes);
  if (clothes?.wings) drawWing(clothes.wings, true);
  const body = ellipse(bc.x, bc.y, b.body.rx * sx * K * squash, b.body.ry * sy * K, bodyAngle);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  /** A marking on the body: an ellipse in the body's own frame, cut to the body. */
  const bodyMark = (lx: number, ly: number, rx: number, ry: number, colour: number) => {
    const at = T(frame.at({ x: lx, y: ly }));
    const e = ellipse(at.x, at.y, rx * sx * K * squash, ry * sy * K, bodyAngle);
    r.shape(intersect(e.sd, body.sd), e.box, colour, null);
  };
  // From behind, his tummy and chest are out of sight.
  if (!behind) bodyMark(B.rx * 0.2, B.ry * 0.62, B.rx * 0.78, B.ry * 0.55, C.belly);
  if (species === 'raccoon' && !behind) bodyMark(B.rx * 0.82, B.ry * 0.25, B.rx * 0.38, B.ry * 0.8, C.light);
  if (species === 'cat') {
    for (const x of [-0.45, -0.1, 0.25]) {
      const a = T(frame.at({ x: B.rx * x - 2, y: -B.ry - 1 }));
      const z = T(frame.at({ x: B.rx * x + 2, y: -B.ry * 0.4 }));
      const stripe = capsule(a, z, 0.5);
      r.shape(intersect(stripe.sd, body.sd), stripe.box, C.band, null);
    }
  }
  if (covered) dressBody();
  // A bunny's big round haunch shows all the time, sat or not.
  const bunny = species === 'bunny';
  if (p.haunch > 0.5 || bunny) {
    const rr = B.ry * (bunny ? 0.8 : 0.62);
    const at = T(frame.at(bunny ? { x: b.hip.x + 1.5, y: b.hip.y - 4 } : { x: b.hip.x + 2, y: b.hip.y - 2 }));
    const e = ellipse(at.x, at.y, rr * sx * K, rr * 0.9 * sy * K, bodyAngle);
    if (covered) r.shape(e.sd, e.box, C.wearMain, C.outline, { light: C.wearLight, dark: C.wearDark });
    else r.shape(e.sd, e.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  }
  if (clothes?.skirt) drawSkirt(clothes.skirt);
  if (clothes?.pack) {
    const pack = polygon([{ x: -B.rx * 0.6, y: -B.ry * 1.18 }, { x: B.rx * 0.12, y: -B.ry * 1.22 }, { x: B.rx * 0.18, y: -B.ry * 0.5 }, { x: -B.rx * 0.55, y: -B.ry * 0.42 }].map((q) => T(frame.at(q))));
    r.shape(pack.sd, pack.box, PAINT_SLOT.wear[clothes.pack], C.outline);
  }
  if (clothes?.wings) drawWing(clothes.wings, false);
  if (clothes?.cape) drawCape();

  /** Clothes over the body: the cloth, then stripes, a shirt front and buttons on it. */
  function dressBody(): void {
    if (!clothes) return;
    r.shape(body.sd, body.box, C.wearMain, null, { light: C.wearLight, dark: C.wearDark });
    const onBody = (sd: Sd, box: Box, colour: number) => r.shape(intersect(sd, body.sd), box, colour, null);
    if (clothes.bands) {
      const { paint, count, width } = clothes.bands;
      for (let i = 0; i < count; i++) {
        const x = B.rx * (-0.75 + (1.5 * (i + 0.5)) / count);
        const band = capsule(T(frame.at({ x, y: -B.ry - 2 })), T(frame.at({ x, y: B.ry + 2 })), Math.max(0.5, width * B.rx * sx * K));
        onBody(band.sd, band.box, PAINT_SLOT.wear[paint]);
      }
    }
    if (clothes.shirt) {
      const shirt = polygon([frame.at({ x: B.rx * 0.45, y: -B.ry * 1.1 }), frame.at({ x: B.rx * 1.2, y: -B.ry * 1.1 }), frame.at({ x: B.rx * 0.95, y: B.ry * 0.55 })].map(T));
      onBody(shirt.sd, shirt.box, C.wearTrim);
    }
    if (clothes.patch && !behind) {
      const at = T(frame.at({ x: B.rx * 0.3, y: B.ry * 0.45 }));
      const e = ellipse(at.x, at.y, B.rx * 0.55 * sx * K * squash, B.ry * 0.42 * sy * K, bodyAngle);
      onBody(e.sd, e.box, PAINT_SLOT.wear[clothes.patch]);
    }
    if (clothes.buttons) {
      r.dots([0.15, 0.5, 0.85].map((k) => {
        const at = T(frame.at({ x: B.rx * (0.62 + 0.1 * k), y: -B.ry * 0.35 + B.ry * 0.9 * k }));
        return { x: Math.floor(at.x), y: Math.floor(at.y) };
      }), C.wearAccent);
    }
    if (clothes.stars) sprinkle(PAINT_SLOT.wear[clothes.stars], [[-0.55, -0.35], [0.1, -0.55], [-0.15, 0.3]]);
  }

  /** Little + stars at these places on the body (in body radii). */
  function sprinkle(colour: number, at: [number, number][]): void {
    for (const [x, y] of at) {
      const q = T(frame.at({ x: B.rx * x, y: B.ry * y }));
      const c = { x: Math.floor(q.x), y: Math.floor(q.y) };
      r.dots([c, { x: c.x - 1, y: c.y }, { x: c.x + 1, y: c.y }, { x: c.x, y: c.y - 1 }, { x: c.x, y: c.y + 1 }], colour);
    }
  }

  /** Spikes standing up along his back, from his hips to his shoulders. */
  function drawSpikes({ paint, count }: { paint: Paint; count: number }): void {
    for (let i = 0; i < count; i++) {
      const x = -0.9 + (1.25 * (i + 0.5)) / count;
      const edge = (u: number) => -Math.sqrt(Math.max(0, 1 - u * u)) * 0.92;
      const w = 0.2;
      const spike = polygon(
        [
          { x: B.rx * (x - w), y: B.ry * edge(x - w) },
          { x: B.rx * (x - 0.08), y: B.ry * (edge(x) - 0.8) },
          { x: B.rx * (x + w), y: B.ry * edge(x + w) },
        ].map((q) => T(frame.at(q))),
      );
      r.shape(spike.sd, spike.box, PAINT_SLOT.wear[paint], C.outline);
    }
  }

  /** A little wing on his back, buzzing as he goes (slowly as he stands). */
  function drawWing(paint: Paint, far: boolean): void {
    const beat = moving > 0.1 ? Math.sin(clock / 35) * 0.5 : Math.sin(clock / 400) * 0.15;
    const root = T(frame.at({ x: -B.rx * (far ? 0.2 : 0.35), y: -B.ry * 1.0 }));
    const a = bodyAngle - (far ? 1.2 : 0.8) + beat;
    const len = B.rx * 0.75 * K;
    const at = { x: root.x - Math.cos(a) * len, y: root.y - Math.sin(a) * len };
    const wing = ellipse(at.x, at.y, len, B.rx * 0.38 * K, a);
    r.shape(wing.sd, wing.box, PAINT_SLOT.wear[paint], C.outline);
  }

  /** A tutu sticking out round his middle, or a robe hanging down to the floor. */
  function drawSkirt({ paint, style }: { paint: Paint; style: 'tutu' | 'robe' }): void {
    const colour = PAINT_SLOT.wear[paint];
    if (style === 'tutu') {
      const at = T(frame.at({ x: B.rx * 0.05, y: B.ry * 0.38 }));
      const e = ellipse(at.x, at.y, B.rx * 1.2 * sx * K * squash, B.ry * 0.42 * sy * K, bodyAngle);
      r.shape(e.sd, e.box, (x, y) => ((Math.floor(x) + Math.floor(y)) % 3 === 0 ? C.wearAccent : colour), C.outline);
      return;
    }
    // Down from his middle to just above his paws, a little wider at the hem.
    const hem = Math.max(-2.5, frame.cy - p.lift + B.ry * 0.9 + 1);
    const robe = polygon([
      T(frame.at({ x: -B.rx * 0.95, y: B.ry * 0.05 })),
      T(frame.at({ x: B.rx * 0.95, y: B.ry * 0.05 })),
      T({ x: frame.cx + B.rx * 1.05, y: hem + p.lift }),
      T({ x: frame.cx - B.rx * 1.1, y: hem + p.lift }),
    ]);
    r.shape(robe.sd, robe.box, colour, C.outline, { light: colour, dark: C.wearDark });
    sprinkle(C.wearTrim, [[0.45, 0.9], [-0.5, 1.15]]);
  }

  /** A cape over his back, flying out behind him as he goes. */
  function drawCape(): void {
    const fly = Math.min(1, moving) * (0.8 + 0.2 * Math.sin(clock / 120));
    const cape = polygon(
      [
        { x: B.rx * 0.55, y: -B.ry * 1.05 },
        { x: -B.rx * 0.5, y: -B.ry * 1.2 - fly * 2 },
        { x: -B.rx * (1.3 + 0.35 * fly), y: -B.ry * (0.45 + 0.6 * fly) },
        { x: -B.rx * (1.2 + 0.3 * fly), y: B.ry * (0.75 - 0.6 * fly) },
        { x: -B.rx * 0.35, y: B.ry * 0.05 },
        { x: B.rx * 0.35, y: -B.ry * 0.35 },
      ].map((q) => T(frame.at(q))),
    );
    r.shape(cape.sd, cape.box, C.wearMain, C.outline, { light: C.wearLight, dark: C.wearAccent });
  }
  if (p.tailFront > 0.5 || (behind && p.tailFront <= 0.5)) drawTail();

  // --- Head ---
  const H = b.head;
  const hc = headCentre(b, p);
  const th = -p.hrot * DEG;
  const hcos = Math.cos(th);
  const hsin = Math.sin(th);
  /** A point on the head (head units from its middle) in pixels. */
  const centre = T(hc);
  // The head is round whichever way he's turned: only where it is foreshortens, not its shape.
  const onHead = (l: Pt): Pt => {
    const lx = l.x * hcos - l.y * hsin;
    const ly = l.x * hsin + l.y * hcos;
    return { x: centre.x + (lx * cs - ly * ss) * K, y: centre.y + (lx * ss + ly * cs) * K };
  };
  const headAngle = th + sw;

  /** Something he's wearing, its units `size` head units across, placed at `origin` on the head. */
  const wear = (item: Wearable | null, origin: Pt, size: number, slots: Record<Paint, number>) => {
    if (!item) return;
    const at = (x: number, y: number) => onHead({ x: origin.x + x * size, y: origin.y + y * size });
    for (const s of item.shapes) {
      const shape = s.kind === 'poly' ? polygon(s.points.map(([x, y]) => at(x, y))) : (() => {
        const c = at(s.cx, s.cy);
        return ellipse(c.x, c.y, Math.max(0.6, s.rx * size * K), Math.max(0.6, s.ry * size * K), headAngle);
      })();
      r.shape(shape.sd, shape.box, slots[s.paint], C.outline);
    }
  };
  // Round his neck, under his chin: drawn before the head, so the chin comes over its top.
  wear(outfitItem(dress.outfit), { x: -H.rx * 0.05, y: H.ry * 1.06 }, H.rx * NECK_WIDTH, { main: C.wearMain, trim: C.wearTrim, accent: C.wearAccent });

  // Ears, behind the head.
  const ear = EARS[species];
  const drawEar = (deg: number, near: boolean) => {
    const at = { x: Math.cos(deg * DEG) * H.rx * 0.82, y: -Math.sin(deg * DEG) * H.ry * 0.82 };
    const outward = (deg - 90) * -0.55;
    const back = p.ears < 0 ? p.ears * 40 : p.ears * -8;
    const tilt = (outward - back * (near ? 1 : 0.8)) * DEG;
    const place = (l: Pt) => onHead({ x: at.x + l.x * Math.cos(tilt) - l.y * Math.sin(tilt), y: at.y + l.x * Math.sin(tilt) + l.y * Math.cos(tilt) });
    if (ear.kind === 'round') {
      const c = place({ x: 0, y: -0.6 });
      const e = ellipse(c.x, c.y, ear.w * K, ear.h * K, headAngle);
      r.shape(e.sd, e.box, near ? C.fur : C.far, C.outline);
      return;
    }
    if (ear.kind === 'long') {
      // Long and floppy, pink inside: up from the back of the head, laid back when he's
      // wary or tired, swinging back as he springs up and flopping on as he lands, the tip
      // bending over more the further it swings.
      const spine = longEar(H.rx, H.ry, ear.h, deg, near, p.ears, p.earFlap).map(onHead);
      const radii = spine.map((_, i) => ear.w * K * (0.5 + 0.55 * Math.sin(Math.PI * Math.min(1, (i / (spine.length - 1)) * 1.12))));
      const e = tube(spine, radii);
      r.shape(e.sd, e.box, near ? C.fur : C.far, C.outline);
      if (!behind && near) {
        const inside = tube(spine, radii.map((r) => r * 0.45));
        r.shape(intersect(inside.sd, e.sd), inside.box, (x, y) => (inside.at(x, y) > 0.15 && inside.at(x, y) < 0.88 ? C.inner : 0), null);
      }
      return;
    }
    const tri = (size: number, dx = 0, dy = 0) => polygon([{ x: -ear.w * size, y: 1.5 }, { x: -0.8 * size, y: -ear.h * size }, { x: ear.w * size, y: 1.5 }].map((q) => place({ x: q.x + dx, y: q.y + dy })));
    const outer = tri(1);
    r.shape(outer.sd, outer.box, near ? C.fur : C.far, C.outline);
    if (!behind) {
      const inner = tri(0.55);
      r.shape(intersect(inner.sd, outer.sd), inner.box, C.inner, null);
    }
  };
  // A hat or a hood goes on over the top of the head; a bunny's long ears poke up in front of it.
  const hatAt = ear.kind === 'long' ? { x: -H.rx * 0.32, y: -H.ry * 0.82 } : { x: -H.rx * 0.06, y: -H.ry * 0.9 };
  const dressHead = () => {
    wear(hoodOf(dress), hatAt, H.rx, PAINT_SLOT.wear);
    wear(hatItem(dress.hat), hatAt, H.rx, PAINT_SLOT.hat);
  };
  const earsThrough = ear.kind === 'long' && (hatItem(dress.hat) !== null || hoodOf(dress) !== null);
  // A hedgehog's ear peeks out from its spines, so it goes on after them.
  if (!earsThrough && species !== 'hedgehog') {
    drawEar(ear.far, false);
    drawEar(ear.near, true);
  }

  const rx = H.rx;
  const ry = H.ry;
  /**
   * A point on the face, with the face turned round towards where he's looking: everything
   * slides forward, the back of it most, so the near eye and the nose come round to the
   * front of the head.
   */
  const onFace = (l: Pt): Pt => {
    const back = 1 - 0.6 * clamp01((l.x / rx + 1) / 2);
    // Three-quarters towards you, his face is turned out to you: the features come in towards the middle.
    const out = quarter === 'front' ? 0.7 : 1;
    return onHead({ x: (l.x + p.turn * rx * 0.3 * back) * out, y: l.y });
  };

  // The head: round, with cheek tufts, a bunny's puffy muzzle, or a hedgehog's pointed snout.
  const skull = ellipse(centre.x, centre.y, H.rx * K, H.ry * K, headAngle);
  const tufts = TUFTS[species].map(([deg, out]) => {
    const point = (a: number, k: number) => onHead({ x: Math.cos(a * DEG) * H.rx * k, y: -Math.sin(a * DEG) * H.ry * k });
    return polygon([point(deg - 16, 0.96), point(deg, 1 + out), point(deg + 16, 0.96)]).sd;
  });
  const extra: { sd: Sd; box: Box }[] = [];
  if (species === 'bunny') {
    const m = onFace({ x: rx * 0.5, y: ry * 0.3 });
    extra.push(ellipse(m.x, m.y, rx * 0.62 * K, ry * 0.52 * K, headAngle));
  }
  if (species === 'hedgehog' && !behind) extra.push(capsule(onFace({ x: rx * 0.3, y: ry * 0.2 }), onFace(SNOUT_TIP(rx, ry)), ry * 0.62 * K, ry * 0.2 * K));
  const head = union(skull.sd, ...tufts, ...extra.map((e) => e.sd));
  const headBox = joinBoxes({ x0: skull.box.x0 - 3, y0: skull.box.y0 - 3, x1: skull.box.x1 + 3, y1: skull.box.y1 + 3 }, ...extra.map((e) => e.box));
  r.shape(head, headBox, C.fur, C.outline, { light: C.furLight, dark: C.fur });
  const eyeAt = EYES[species].map((e) => ({ x: e.x * rx, y: e.y * ry }));
  /** A marking on the face, cut to the head. */
  const faceMark = (sd: Sd, box: Box, colour: number) => r.shape(intersect(sd, head), box, colour, null);
  const faceEllipse = (x: number, y: number, ex: number, ey: number, colour: number) => {
    const at = onFace({ x, y });
    const e = ellipse(at.x, at.y, ex * K, ey * K, headAngle);
    faceMark(e.sd, e.box, colour);
  };
  const facePoly = (points: [number, number][], colour: number) => {
    const poly = polygon(curvy(points, rx, ry).map(onFace));
    faceMark(poly.sd, poly.box, colour);
  };
  // From behind, there's no face to see.
  if (!behind) {
    switch (species) {
      case 'raccoon':
        // White brows over the mask, one over each eye.
        faceEllipse(-rx * 0.26, -ry * 0.46, rx * 0.24, ry * 0.15, C.light);
        faceEllipse(rx * 0.5, -ry * 0.5, rx * 0.24, ry * 0.15, C.light);
        facePoly(
          [
            [-0.62, 0.12],
            [-0.3, -0.42],
            [0.1, -0.08],
            [0.45, -0.5],
            [0.95, -0.05],
            [0.7, 0.42],
            [0.35, 0.38],
            [0.1, 0.2],
            [-0.15, 0.4],
            [-0.5, 0.45],
            [-0.62, 0.12],
          ],
          C.dark,
        );
        faceEllipse(rx * 0.62, ry * 0.58, rx * 0.45, ry * 0.32, C.light);
        break;
      case 'cat':
        for (const x of [-0.18, 0.04, 0.26]) {
          const stripe = capsule(onFace({ x: rx * x, y: -ry * 1.05 }), onFace({ x: rx * x + 0.6, y: -ry * 0.62 }), 0.5);
          faceMark(stripe.sd, stripe.box, C.band);
        }
        faceEllipse(rx * 0.6, ry * 0.55, rx * 0.42, ry * 0.3, C.light);
        break;
      case 'otter':
        faceEllipse(rx * 0.42, ry * 0.5, rx * 0.72, ry * 0.42, C.light);
        break;
      case 'bunny':
        // A pale puff of a muzzle, and a pale chin under it.
        faceEllipse(rx * 0.72, ry * 0.36, rx * 0.4, ry * 0.32, C.light);
        faceEllipse(rx * 0.45, ry * 0.72, rx * 0.36, ry * 0.2, C.light);
        break;
      case 'hedgehog':
        // A paler cheek and snout.
        faceEllipse(rx * 0.75, ry * 0.42, rx * 0.65, ry * 0.36, C.light);
        break;
    }
    const nose =
      species === 'otter'
        ? { x: rx * 0.78, y: ry * 0.22 }
        : species === 'hedgehog'
          ? SNOUT_TIP(rx, ry)
          : species === 'bunny'
            ? { x: rx * 1.06, y: ry * 0.14 }
            : { x: rx * 0.8, y: ry * 0.3 };
    if (species === 'otter') {
      for (const dx of [-1.9, 1.9]) {
        const at = onFace({ x: nose.x + dx * 0.8 - 0.5, y: nose.y + 2.7 });
        const pad = ellipse(at.x, at.y, 1.3, 1.1);
        r.shape(pad.sd, pad.box, C.light, C.furDark);
      }
    }

    // Eyes.
    const pix = (l: Pt) => {
      const q = onFace(l);
      return { x: Math.floor(q.x), y: Math.floor(q.y) };
    };
    const look = { x: p.lookX > 0.5 ? 1 : p.lookX < -0.5 ? -1 : 0, y: p.lookY > 0.6 ? 1 : p.lookY < -0.7 ? -1 : 0 };
    const eye = (at: Pt) => {
      const { x, y } = pix(at);
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
          const wide = p.eyes === 'wide';
          const ex = x + (wide ? 0 : look.x);
          const ey = y + look.y;
          if (species === 'hedgehog' && !wide) {
            // Small and beady.
            r.dots([{ x: ex, y: ey }, { x: ex + 1, y: ey }, { x: ex, y: ey - 1 }], C.eye);
            r.set(ex + 1, ey - 1, C.glint);
            return;
          }
          if (species === 'bunny') {
            // Big, round and dark, with a shine at the top.
            for (const cx of [ex - 1, ex, ex + 1]) for (const cy of [ey - 1, ey, ey + 1]) if (wide || cx !== ex - 1 || cy !== ey + 1) r.set(cx, cy, C.eye);
            r.set(ex + 1, ey - 1, C.glint);
            return;
          }
          const cols = wide ? [ex - 1, ex, ex + 1] : [ex, ex + 1];
          const rows = wide ? [ey - 1, ey, ey + 1] : [ey - 1, ey, ey + 1];
          for (const cx of cols) for (const cy of rows) r.set(cx, cy, C.eye);
          r.set(cols[cols.length - 1]!, rows[0]!, C.glint);
        }
      }
    };
    for (const e of SIDE_EYED.has(species) ? eyeAt.slice(1) : eyeAt) eye(e);

    // Nose, mouth and blush.
    const n = pix(nose);
    if (species === 'hedgehog') {
      // A little shiny black button of a nose on the end of its snout.
      const at = pix(nose);
      r.dots([at, { x: at.x - 1, y: at.y }, { x: at.x, y: at.y + 1 }, { x: at.x - 1, y: at.y + 1 }], C.nose);
      r.set(at.x - 1, at.y, C.glint);
    } else if (species === 'bunny') {
      // A little pink nose, twitching now and then, over a split lip.
      const twitch = Math.sin(clock / 70) > 0 && clock % 2600 < 700 ? 1 : 0;
      r.dots([{ x: n.x - 1, y: n.y - twitch }, { x: n.x, y: n.y - twitch }, { x: n.x - 1, y: n.y + 1 - twitch }], C.nose);
      r.dots([{ x: n.x - 1, y: n.y + 2 }, { x: n.x - 2, y: n.y + 3 }], C.mouth);
    } else {
      const nostrils = species === 'otter' ? [{ x: n.x - 1, y: n.y }, n, { x: n.x + 1, y: n.y }, { x: n.x, y: n.y + 1 }] : [{ x: n.x - 1, y: n.y }, n];
      r.dots(nostrils, C.nose);
    }
    if (p.mouth > 0.12) {
      // Open under the nose.
      const h = 1 + Math.round(p.mouth * 2.5);
      for (let i = 1; i <= h; i++) r.dots([{ x: n.x - 1, y: n.y + i }, { x: n.x, y: n.y + i }], i === h && p.tongue > 0.25 ? C.tongue : C.mouth);
    }
    if (p.blush >= 0.6) {
      const near = pix({ x: rx * 0.62, y: ry * 0.42 });
      const far = pix({ x: -rx * 0.32, y: ry * 0.4 });
      r.dots([near, { x: near.x + 1, y: near.y }, far], C.blush);
    }
  }

  // A hedgehog's coat of spines, over its back and the top of its head, and its little
  // round ear peeking out of the front of it.
  if (species === 'hedgehog') {
    mantle();
    if (!earsThrough) drawEar(ear.near, true);
  }

  /**
   * A hedgehog's spines: a dome of spikes from its rump up over its back and the top of
   * its head to its brow, with a fringe along the front edge, and pale-tipped streaks down
   * them in two rows.
   */
  function mantle(): void {
    const cx = B.rx * 0.08;
    const cy = -B.ry * 0.12;
    const RX = B.rx * 1.1;
    const RY = B.ry * 1.2;
    const from = 208;
    const to = 24;
    const count = 12;
    const step = (to - from) / count;
    const round = (a: number, k: number): Pt => ({ x: cx + Math.cos(a * DEG) * RX * k, y: cy - Math.sin(a * DEG) * RY * k });
    const place = (l: Pt) => T(frame.at(l));
    const edge: Pt[] = [round(from, 0.95)];
    for (let i = 0; i < count; i++) edge.push(round(from + step * (i + 0.5), 1.17), round(from + step * (i + 1), 0.95));
    // Underneath: back along the brow and down behind the cheek, then along the flank.
    const under: Pt[] = [
      { x: B.rx * 0.68, y: B.ry * 0.05 },
      { x: B.rx * 0.3, y: B.ry * 0.38 },
      { x: -B.rx * 0.5, y: B.ry * 0.48 },
      { x: -B.rx * 0.98, y: B.ry * 0.32 },
    ];
    const coat = polygon([...edge, ...under].map(place));
    r.shape(coat.sd, coat.box, C.dark, C.outline, { light: C.band, dark: C.dark });
    for (let i = 0; i < count; i++) {
      const a = from + step * (i + 0.5);
      const streak = capsule(place(round(a, 0.62)), place(round(a, 1.06)), 0.45);
      r.shape(intersect(streak.sd, coat.sd), streak.box, C.band, null);
      if (i % 2 === 1) {
        const b2 = from + step * (i + 1);
        const inner = capsule(place(round(b2, 0.2)), place(round(b2, 0.55)), 0.45);
        r.shape(intersect(inner.sd, coat.sd), inner.box, C.band, null);
      }
    }
  }

  // A costume's hood, then a hat, over the ears and the top of the head.
  dressHead();
  if (earsThrough) {
    drawEar(ear.far, false);
    drawEar(ear.near, true);
  }

  // --- Paws raised in front, and an otter's shell ---
  for (const leg of ['frontFar', 'frontNear'] as const) if (raised(leg)) drawLeg(leg);
  if (p.shell > 0.5) {
    const chest = T(frame.at({ x: b.shoulder.x - 3, y: -B.ry * Math.sign(p.sy) * 1.05 }));
    const shell = ellipse(chest.x, chest.y - 0.8, 2.3, 1.7, bodyAngle - 10 * DEG);
    r.shape(shell.sd, shell.box, C.shell, C.outline, { light: C.shell, dark: C.shellDark });
  }

  // --- The near side of the pond, over whatever of it is under the surface ---
  if (wet) {
    r.clipBelow = Infinity;
    const crest: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const x = pond.cx - pond.rx + (pond.rx * 2 * i) / 16;
      const edge = Math.sqrt(Math.max(0, 1 - ((x - pond.cx) / pond.rx) ** 2));
      crest.push(T({ x, y: WATER_Y + 0.9 * Math.sin(x * 0.35 + clock / 260) * edge }));
    }
    const below: Pt[] = [];
    for (let i = 1; i < 16; i++) {
      const a = Math.PI * (i / 16);
      below.push(T({ x: pond.cx + Math.cos(a) * pond.rx, y: WATER_Y + Math.sin(a) * pond.ry }));
    }
    const front = polygon([...crest, ...below]);
    // Outlined only round the bottom, where it meets the dry ground, not across the swimmer.
    r.shape(front.sd, front.box, C.water, C.waterDark, { light: C.waterLight, dark: C.water }, (x, y) => r.get(Math.floor(x), Math.floor(y)) === 0);
    // A wake behind, and drops thrown up when it splashes.
    if (moving > 0.05) {
      const x0 = frame.cx - B.rx * 0.6;
      const w = (6 + moving * 8) * K;
      for (const [dx, dy, k] of [[-8, 2.6, 1], [-14, -1.6, 0.8], [-22, 1, 0.6]] as const) {
        const a = T({ x: x0 + dx, y: WATER_Y + dy });
        for (let i = 0; i < Math.round(w * k); i++) r.set(Math.floor(a.x) - i, Math.floor(a.y), C.waterLight);
      }
    }
    if (p.splash > 0.05) {
      for (let i = 0; i < 5; i++) {
        const age = (clock / 520 + i / 5) % 1;
        if (age > 0.85) continue;
        const at = T({ x: hc.x + 4 + (i - 2) * 2.2 * (1 + age), y: WATER_Y - p.splash * (5 + (i % 3)) * Math.sin(Math.PI * age) - 0.5 });
        r.stamp(['#'], at.x, at.y, C.waterLight, C.waterDark);
      }
    }
    // Bubbles coming up where it's gone under.
    if (p.bubbles > 0.05) {
      for (let i = 0; i < 3; i++) {
        const age = (clock / 700 + i / 3) % 1;
        const at = T({ x: frame.cx + (i - 1) * 5 + Math.sin(clock / 180 + i * 2), y: WATER_Y - 2.5 - age * 8 * p.bubbles });
        const bubble = ellipse(at.x, at.y, 1 + 0.5 * age, 1 + 0.5 * age);
        r.shape(bubble.sd, bubble.box, C.waterLight, C.waterDark);
      }
    }
  }

  if (facing < 0) r.mirror(FX);
  const box = r.bounds((c) => c === C.shadow);

  // --- Marks over the head, always the right way round ---
  drawMarks(r, p.mark, { x: FX + hc.x * K * facing, y: FY + (hc.y - H.ry - 6) * K }, facing, clock);
  return box ? joinBoxes(box) : null;
}

/**
 * A hedgehog rolled up: a ball of spikes `R` pixels round (squashed by `sx` and `sy`) turned
 * `roll` degrees, with its pale tummy tucked in at the bottom and, at rest, the tip of its
 * snout peeking out.
 */
export function drawSpikyBall(r: Raster, at: Pt, R: number, sx: number, sy: number, roll: number, peeking: boolean): void {
  const count = 12;
  const point = (deg: number, k: number): Pt => ({ x: at.x + Math.cos(deg * DEG) * R * k * sx, y: at.y - Math.sin(deg * DEG) * R * k * sy });
  const outline: Pt[] = [];
  for (let i = 0; i < count * 2; i++) outline.push(point(-roll + (i * 180) / count, i % 2 ? 1.16 : 0.9));
  const ball = polygon(outline);
  r.shape(ball.sd, ball.box, C.dark, C.outline, { light: C.band, dark: C.dark });
  // The tummy and face tucked in, turning with the ball.
  const tummy = point(-roll - 55, 0.42);
  const t = ellipse(tummy.x, tummy.y, R * 0.5 * sx, R * 0.38 * sy, (-roll - 55) * -DEG);
  r.shape(intersect(t.sd, ball.sd), t.box, C.fur, null);
  for (let i = 0; i < count; i++) {
    const a = -roll + ((i * 2 + 1) * 180) / count;
    const streak = capsule(point(a, 0.5), point(a, 0.95), 0.45);
    r.shape(intersect(streak.sd, ball.sd), streak.box, C.band, null);
  }
  if (peeking) {
    const tip = point(-28, 0.92);
    const snout = ellipse(tip.x, tip.y, R * 0.3, R * 0.22);
    r.shape(snout.sd, snout.box, C.light, C.outline);
    r.dots([{ x: Math.floor(tip.x + R * 0.26), y: Math.floor(tip.y) }], C.nose);
  }
}

/** Where a hedgehog's snout ends, in head units, for a head `rx` by `ry`. */
const SNOUT_TIP = (rx: number, ry: number): Pt => ({ x: rx * 1.3, y: ry * 0.4 });

/**
 * The spine of a long ear (a bunny's) `h` long, in drawing units from the middle of a head
 * `rx` by `ry`: from its root at `deg` round the head (90 = top), up and a little back, laid
 * back by `ears` below 0 and swung back by `flap` degrees, bending over more towards the tip
 * the further it swings.
 */
export function longEar(rx: number, ry: number, h: number, deg: number, near: boolean, ears: number, flap: number): Pt[] {
  let at: Pt = { x: Math.cos(deg * DEG) * rx * 0.6, y: -Math.sin(deg * DEG) * ry * 0.6 };
  const lay = (ears < 0 ? -ears * 50 : -ears * 6) + flap * (near ? 1 : 0.85);
  const bend = 14 + Math.max(0, flap) * 0.6;
  const count = 7;
  const out: Pt[] = [at];
  for (let i = 1; i <= count; i++) {
    const s = i / count;
    const a = (104 + (near ? 0 : 8) + lay + bend * s ** 1.6) * DEG;
    at = { x: at.x + Math.cos(a) * (h / count), y: at.y - Math.sin(a) * (h / count) };
    out.push(at);
  }
  return out;
}

/** A costume's hood, as something to wear (in hat units), or null. */
export function hoodOf(dress: Dress): Wearable | null {
  const item = outfitItem(dress.outfit);
  return item?.hood ? { ...item, shapes: item.hood } : null;
}

/** The marks that float over his head (z's asleep, hearts, a ! or a ?), from `top`, the right way round whichever way he faces. */
export function drawMarks(r: Raster, mark: ChibiMark, top: Pt, facing: number, clock: number): void {
  const K = PIXEL.k;
  const f = facing < 0 ? -1 : 1;
  switch (mark) {
    case 'zzz':
      for (let i = 0; i < 3; i++) {
        const age = (clock / 2400 + i / 3) % 1;
        if (Math.sin(Math.PI * age) < 0.3) continue;
        r.stamp(GLYPHS.z, top.x + f * (6 + age * 10) * K, top.y + (4 - age * 14) * K, C.mark, C.outline);
      }
      break;
    case 'alarm':
      r.stamp(GLYPHS['!'], top.x + f * 9 * K, top.y - 3, C.alarm, C.outline);
      break;
    case 'puzzled':
      r.stamp(GLYPHS['?'], top.x + f * 9 * K, top.y - 3 + Math.round(Math.sin(clock / 300)), C.mark, C.outline);
      break;
    case 'hearts':
      for (let i = 0; i < 3; i++) {
        const age = (clock / 1500 + i / 3) % 1;
        if (Math.sin(Math.PI * age) < 0.25) continue;
        r.stamp(GLYPHS.heart, top.x + f * (4 + i * 5 + Math.sin(age * 6 + i) * 1.5) * K, top.y + (6 - age * 16) * K, C.heart, C.outline);
      }
      break;
    case 'angry': {
      // Throbbing.
      const big = Math.sin(clock / 120) > 0;
      r.stamp(GLYPHS.angry, top.x + f * (8 + (big ? 0 : 1)) * K, top.y - 2, C.heart, big ? C.outline : null);
      break;
    }
  }
}
