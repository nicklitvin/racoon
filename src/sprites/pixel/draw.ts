import { DEG, clamp01 } from '../critter/kit';
import { bodyFrame, headCentre, legRoot, WATER_Y, type ChibiPose, type LegName } from '../chibi/pose';
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
const TAIL_BANDS: Record<PixelSpecies, [number, number][]> = {
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
};

/** Ears: half width and height at the base, and where on the head they sit (degrees, 90 = top). */
const EARS: Record<PixelSpecies, { w: number; h: number; near: number; far: number }> = {
  cat: { w: 6.4, h: 10.5, near: 58, far: 122 },
  raccoon: { w: 6.6, h: 9.5, near: 56, far: 124 },
  otter: { w: 3.6, h: 3.4, near: 42, far: 138 },
};

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
};

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

/**
 * Draws the pet into `r` (cleared first) and returns the box round the figure itself, for
 * grabbing it. `facing` -1 mirrors it to face left; the marks over its head stay readable.
 */
export function drawPixelPet(r: Raster, b: PixelBuild, p: ChibiPose, clock: number, facing: number, moving: number, scruff: Pt): Box | null {
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
    return { x: FX + x * K, y: FY + y * K };
  };

  const frame = bodyFrame(b, p);
  const bodyAngle = -p.rot * DEG + sw;
  const wet = p.wet > 0.5;

  // --- The shadow, and the far side of the pond ---
  const lifted = clamp01(-p.lift / 26);
  const hidden = p.swing !== 0 || wet || p.paws.frontNear.y < -b.peekSink + 2;
  if (!hidden) {
    const at = T({ x: -2, y: 0.5 });
    const e = ellipse(at.x, at.y, (b.body.rx + 7) * K * (1 - lifted * 0.6), 1.4);
    r.shape(e.sd, e.box, C.shadow, null);
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
    const t = tailShape();
    const bands = TAIL_BANDS[species];
    r.shape(t.sd, t.box, (x, y) => {
      const s = t.at(x, y);
      return bands.some(([a, z]) => s >= a && s < z) ? C.band : C.fur;
    }, C.outline);
  };
  if (p.tailFront <= 0.5) drawTail();

  // --- Legs ---
  const raised = (leg: LegName) => (leg === 'frontNear' && p.pawUp > 0.5) || (leg === 'frontFar' && p.pawUp > 1.5);
  const drawLeg = (leg: LegName) => {
    const root = T(legRoot(b, p, leg));
    const paw = T({ x: p.paws[leg].x, y: p.paws[leg].y + p.lift });
    const w = (b.legWidth / 2) * K;
    const far = leg.endsWith('Far');
    const c = capsule(root, paw, w);
    r.shape(c.sd, c.box, far ? C.far : C.fur, C.outline);
  };
  for (const leg of ['backFar', 'frontFar'] as const) if (!raised(leg)) drawLeg(leg);
  for (const leg of ['backNear', 'frontNear'] as const) if (!raised(leg)) drawLeg(leg);

  // --- Body ---
  const bc = T({ x: frame.cx, y: frame.cy });
  const sx = Math.abs(p.sx);
  const sy = Math.abs(p.sy);
  const body = ellipse(bc.x, bc.y, b.body.rx * sx * K, b.body.ry * sy * K, bodyAngle);
  r.shape(body.sd, body.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  /** A marking on the body: an ellipse in the body's own frame, cut to the body. */
  const bodyMark = (lx: number, ly: number, rx: number, ry: number, colour: number) => {
    const at = T(frame.at({ x: lx, y: ly }));
    const e = ellipse(at.x, at.y, rx * sx * K, ry * sy * K, bodyAngle);
    r.shape(intersect(e.sd, body.sd), e.box, colour, null);
  };
  const B = b.body;
  bodyMark(B.rx * 0.2, B.ry * 0.62, B.rx * 0.78, B.ry * 0.55, C.belly);
  if (species === 'raccoon') bodyMark(B.rx * 0.82, B.ry * 0.25, B.rx * 0.38, B.ry * 0.8, C.light);
  if (species === 'cat') {
    for (const x of [-0.45, -0.1, 0.25]) {
      const a = T(frame.at({ x: B.rx * x - 2, y: -B.ry - 1 }));
      const z = T(frame.at({ x: B.rx * x + 2, y: -B.ry * 0.4 }));
      const stripe = capsule(a, z, 0.5);
      r.shape(intersect(stripe.sd, body.sd), stripe.box, C.band, null);
    }
  }
  if (p.haunch > 0.5) {
    const rr = B.ry * 0.62;
    const at = T(frame.at({ x: b.hip.x + 2, y: b.hip.y - 2 }));
    const e = ellipse(at.x, at.y, rr * sx * K, rr * 0.9 * sy * K, bodyAngle);
    r.shape(e.sd, e.box, C.fur, C.outline, { light: C.furLight, dark: C.furDark });
  }
  if (p.tailFront > 0.5) drawTail();

  // --- Head ---
  const H = b.head;
  const hc = headCentre(b, p);
  const th = -p.hrot * DEG;
  const hcos = Math.cos(th);
  const hsin = Math.sin(th);
  /** A point on the head (head units from its middle) in pixels. */
  const onHead = (l: Pt): Pt => T({ x: hc.x + l.x * hcos - l.y * hsin, y: hc.y + l.x * hsin + l.y * hcos });
  const headAngle = th + sw;
  const centre = T(hc);

  // Ears, behind the head.
  const ear = EARS[species];
  const drawEar = (deg: number, near: boolean) => {
    const at = { x: Math.cos(deg * DEG) * H.rx * 0.82, y: -Math.sin(deg * DEG) * H.ry * 0.82 };
    const outward = (deg - 90) * -0.55;
    const back = p.ears < 0 ? p.ears * 40 : p.ears * -8;
    const tilt = (outward - back * (near ? 1 : 0.8)) * DEG;
    const place = (l: Pt) => onHead({ x: at.x + l.x * Math.cos(tilt) - l.y * Math.sin(tilt), y: at.y + l.x * Math.sin(tilt) + l.y * Math.cos(tilt) });
    if (species === 'otter') {
      const c = place({ x: 0, y: -0.6 });
      const e = ellipse(c.x, c.y, ear.w * K, ear.h * K, headAngle);
      r.shape(e.sd, e.box, near ? C.fur : C.far, C.outline);
      return;
    }
    const tri = (size: number, dx = 0, dy = 0) => polygon([{ x: -ear.w * size, y: 1.5 }, { x: -0.8 * size, y: -ear.h * size }, { x: ear.w * size, y: 1.5 }].map((q) => place({ x: q.x + dx, y: q.y + dy })));
    const outer = tri(1);
    r.shape(outer.sd, outer.box, near ? C.fur : C.far, C.outline);
    const inner = tri(0.55);
    r.shape(intersect(inner.sd, outer.sd), inner.box, C.inner, null);
  };
  drawEar(ear.far, false);
  drawEar(ear.near, true);

  // The head: round, with cheek tufts.
  const skull = ellipse(centre.x, centre.y, H.rx * K, H.ry * K, headAngle);
  const tufts = TUFTS[species].map(([deg, out]) => {
    const point = (a: number, k: number) => onHead({ x: Math.cos(a * DEG) * H.rx * k, y: -Math.sin(a * DEG) * H.ry * k });
    return polygon([point(deg - 16, 0.96), point(deg, 1 + out), point(deg + 16, 0.96)]).sd;
  });
  const head = tufts.length ? union(skull.sd, ...tufts) : skull.sd;
  const headBox = { x0: skull.box.x0 - 3, y0: skull.box.y0 - 3, x1: skull.box.x1 + 3, y1: skull.box.y1 + 3 };
  r.shape(head, headBox, C.fur, C.outline, { light: C.furLight, dark: C.fur });
  const rx = H.rx;
  const ry = H.ry;
  /** A marking on the face, cut to the head. */
  const faceMark = (sd: Sd, box: Box, colour: number) => r.shape(intersect(sd, head), box, colour, null);
  const faceEllipse = (x: number, y: number, ex: number, ey: number, colour: number) => {
    const at = onHead({ x, y });
    const e = ellipse(at.x, at.y, ex * K, ey * K, headAngle);
    faceMark(e.sd, e.box, colour);
  };
  const facePoly = (points: [number, number][], colour: number) => {
    const poly = polygon(curvy(points, rx, ry).map(onHead));
    faceMark(poly.sd, poly.box, colour);
  };
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
        const stripe = capsule(onHead({ x: rx * x, y: -ry * 1.05 }), onHead({ x: rx * x + 0.6, y: -ry * 0.62 }), 0.5);
        faceMark(stripe.sd, stripe.box, C.band);
      }
      faceEllipse(rx * 0.6, ry * 0.55, rx * 0.42, ry * 0.3, C.light);
      break;
    case 'otter':
      faceEllipse(rx * 0.42, ry * 0.5, rx * 0.72, ry * 0.42, C.light);
      break;
  }
  const nose = species === 'otter' ? { x: rx * 0.78, y: ry * 0.22 } : { x: rx * 0.8, y: ry * 0.3 };
  if (species === 'otter') {
    for (const dx of [-1.9, 1.9]) {
      const at = onHead({ x: nose.x + dx * 0.8 - 0.5, y: nose.y + 2.7 });
      const pad = ellipse(at.x, at.y, 1.3, 1.1);
      r.shape(pad.sd, pad.box, C.light, C.furDark);
    }
  }

  // Eyes.
  const pix = (l: Pt) => {
    const q = onHead(l);
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
        const cols = wide ? [ex - 1, ex, ex + 1] : [ex, ex + 1];
        const rows = wide ? [ey - 1, ey, ey + 1] : [ey - 1, ey, ey + 1];
        for (const cx of cols) for (const cy of rows) r.set(cx, cy, C.eye);
        r.set(cols[cols.length - 1]!, rows[0]!, C.glint);
      }
    }
  };
  eye({ x: -rx * 0.18, y: ry * 0.04 });
  eye({ x: rx * 0.4, y: ry * 0.06 });

  // Nose, mouth and blush.
  const n = pix(nose);
  r.dots(species === 'otter' ? [{ x: n.x - 1, y: n.y }, n, { x: n.x + 1, y: n.y }, { x: n.x, y: n.y + 1 }] : [{ x: n.x - 1, y: n.y }, n], C.nose);
  if (p.mouth > 0.12) {
    const h = 1 + Math.round(p.mouth * 2.5);
    for (let i = 1; i <= h; i++) r.dots([{ x: n.x - 1, y: n.y + i }, { x: n.x, y: n.y + i }], i === h && p.tongue > 0.25 ? C.tongue : C.mouth);
  }
  if (p.blush >= 0.6) {
    const near = pix({ x: rx * 0.62, y: ry * 0.42 });
    const far = pix({ x: -rx * 0.32, y: ry * 0.4 });
    r.dots([near, { x: near.x + 1, y: near.y }, far], C.blush);
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
  }

  if (facing < 0) r.mirror(FX);
  const box = r.bounds((c) => c === C.shadow);

  // --- Marks over the head, always the right way round ---
  const top = { x: FX + hc.x * K * facing, y: FY + (hc.y - H.ry - 6) * K };
  const f = facing < 0 ? -1 : 1;
  switch (p.mark) {
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
  }
  return box ? joinBoxes(box) : null;
}
