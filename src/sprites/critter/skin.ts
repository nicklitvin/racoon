import type { Point } from '../../core/geometry';
import type { LegName } from './pose';
import { n, svgWriter } from '../svg';
import type { Build, Species } from './build';
import { HeadView, onDisc, onSphere, v3, type Disc, type V3 } from './head';
import { add, clamp, clamp01, curve, fmt, lerp, mixPt, scale, smooth, sub, tube, unit } from './kit';
import type { Point3, Shown } from './motion';
import { LEGS, type Pose } from './pose';
import { bodyAt, legJoints, spineFrame, uprightness, type Frame } from './rig';
import { DEPTH, ellipseOf, ellipsePath, type BodyView, type Ellipse } from './view';

/**
 * Draws a lifelike animal from a pose, seen from any side: the body is a solid built from
 * cross-sections along the spine and drawn by its true outline, legs hang from either side,
 * and the head is a little 3D model, all through the same camera. Parts that belong
 * together share one outline, drawn as a thick stroke behind their fill, so they read as a
 * single animal like an illustrator's drawing. Colours and line weight come from CSS, which
 * is how the art styles differ.
 */

interface Union {
  /** Outline copy, then the fills. */
  wrap: SVGElement;
  fill: SVGElement;
}

interface LegParts {
  group: SVGElement;
  upper: SVGElement;
  lower: SVGElement;
  foot: SVGElement;
  paw: SVGElement;
  toes: SVGElement;
}

interface EyeParts {
  open: SVGElement;
  white: SVGElement;
  clip: SVGElement;
  iris: SVGElement;
  pupil: SVGElement;
  glint: SVGElement;
  rim: SVGElement;
  shut: SVGElement;
}

/** One slice through the body: its centre, the spine's direction and "up" there, and its half depth and width. */
interface Section {
  a: number;
  p: Point;
  t: Point;
  up: Point;
  hh: number;
  w: number;
}

/** Where each part goes this frame, back to front. */
type Layer = 'far' | 'main' | 'front';

/** How far the camera looks down on the head. */
const HEAD_TILT = 18;
/** Slices through the body, rear to front. */
const SECTIONS = 22;

let ids = 0;

export interface Skin {
  svg: SVGSVGElement;
  figure: SVGElement;
  draw(shown: Shown): void;
}

export function createSkin(doc: Document, build: Build, className: string, label: string): Skin {
  const w = svgWriter(doc);
  const { make, set } = w;
  const id = `critter-${++ids}`;
  const { view: box } = build;
  const svg = make('svg', {
    class: `raccoon critter critter-${build.species} ${className}`,
    viewBox: `${box.x} ${box.y} ${box.width} ${box.height}`,
    role: 'img',
    'aria-label': label,
  }) as SVGSVGElement;
  const defs = make('defs', {}, svg);
  const shadow = make('ellipse', { class: 'k-shadow', cx: 0, cy: 0, rx: 20, ry: 2.4 }, svg);
  const species = build.species;
  const raccoon = species === 'raccoon';
  const cat = species === 'cat';
  const fox = species === 'fox';
  // Cats and foxes share almond eyes with slit pupils, and the cat's poses.
  const catlike = cat || fox;
  const water = build.swims ? makeWater() : null;
  const figure = make('g', { class: 'raccoon-figure' }, svg);
  const surface = water ? make('g', { class: 'k-surface' }, svg) : null;
  const waterline = surface ? make('path', { class: 'k-waterline' }, surface) : null;
  const bow = surface ? make('path', { class: 'k-bow' }, surface) : null;

  /**
   * A swimmer's own little patch of water, under it: a soft pool, rings spreading out from
   * it, and a wake behind as it goes. Whatever of the animal is under the surface is drawn
   * faded into the water, by a mask with the parts above the surface cut out of it.
   */
  function makeWater() {
    const group = make('g', { class: 'k-pond' }, svg);
    const gradient = make('radialGradient', { id: `${id}-pool` }, defs);
    make('stop', { offset: '0', class: 'k-pool-stop', 'stop-opacity': '0.5' }, gradient);
    make('stop', { offset: '0.55', class: 'k-pool-stop', 'stop-opacity': '0.3' }, gradient);
    make('stop', { offset: '1', class: 'k-pool-stop', 'stop-opacity': '0' }, gradient);
    const pool = make('ellipse', { class: 'k-pool', fill: `url(#${id}-pool)` }, group);
    const ripples = [0, 1, 2].map(() => make('ellipse', { class: 'k-ripple' }, group));
    const wake = make('path', { class: 'k-wake' }, group);
    const mask = make('mask', { id: `${id}-sea`, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: 800, height: 800 }, defs);
    // Grey shows what's under the water faintly; white is what's out of it.
    make('rect', { x: -400, y: -400, width: 800, height: 800, fill: '#5c5c5c' }, mask);
    const above = make('path', { fill: '#fff', stroke: '#fff', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, mask);
    return { group, pool, ripples, wake, above };
  }

  const union = (name: string, parent: Element): Union => {
    const wrap = make('g', { class: `k-union c-${name}` }, parent);
    make('use', { href: `#${id}-${name}`, class: 'k-outline' }, wrap);
    const fill = make('g', { id: `${id}-${name}` }, wrap);
    return { wrap, fill };
  };

  // Back to front: whatever is behind the body, the face when the head is behind it too,
  // the tail behind, the body with everything merged into its outline, contour lines, the
  // face, and whatever is held in front (a wrapped tail, raised paws).
  const far = union('far', figure);
  const faceBehind = make('g', {}, figure);
  const tailBack = union('tail', figure);
  const main = union('main', figure);
  const details = make('g', { class: 'k-details' }, figure);
  const faceInFront = make('g', {}, figure);
  const front = union('front', figure);
  const layers: Record<Layer, SVGElement> = { far: far.fill, main: main.fill, front: front.fill };
  // The first thing in front of everything: the tail when it's all in front, or else a copy
  // of it cut down to the stretch that comes round in front (a tail wrapped round the paws),
  // the rest staying behind the body. The cut goes straight across outline and fill alike,
  // over the same tail continuing behind, so there's no seam.
  const tailFrontSlot = make('g', {}, front.fill);
  const tailCut = make('clipPath', { id: `${id}-tailcut` }, defs);
  const tailCutPath = make('path', {}, tailCut);

  // Tail, with the raccoon's rings clipped to it; and the copy for the stretch in front.
  // Raccoons have four broad dark rings and a dark tip; a tabby cat has faint thin ones; a
  // fox's brush ends in a white tip; an otter's is plain.
  const ringCount = raccoon ? 4 : cat ? 6 : 0;
  const makeTail = (name: string) => {
    const group = make('g', {});
    const path = make('path', { id: `${id}-${name}`, class: 'k-p k-tailfur' }, group);
    const clip = make('clipPath', { id: `${id}-${name}clip` }, defs);
    make('use', { href: `#${id}-${name}` }, clip);
    const rings = make('g', { 'clip-path': `url(#${id}-${name}clip)`, class: 'k-rings' }, group);
    const ringPaths = Array.from({ length: ringCount }, () => make('path', { class: raccoon ? 'k-ring' : 'k-stripe' }, rings));
    const tip = raccoon || fox ? make('circle', { class: 'k-ringfill' }, rings) : null;
    return { group, path, ringPaths, tip };
  };
  const tails = [makeTail('tailpath'), makeTail('tailcopy')] as const;
  const tailGroup = tails[0].group;
  tailBack.fill.appendChild(tailGroup);
  const tailCopy = tails[1].group;
  set(tailCopy, 'clip-path', `url(#${id}-tailcut)`);

  const makeLeg = (): LegParts => {
    const group = make('g', {});
    // The upper leg is body fur; the lower leg and paw can be darker (raccoons) or white (socks).
    const upper = make('path', { class: 'k-p k-fur k-upper' }, group);
    const lower = make('path', { class: 'k-p k-legfur' }, group);
    const foot = make('path', { class: 'k-p k-legfur k-foot' }, group);
    const paw = make('path', { class: 'k-p k-legfur k-paw' }, group);
    const toes = make('path', { class: 'k-toes' }, group);
    return { group, upper, lower, foot, paw, toes };
  };
  const legs = {} as Record<LegName, LegParts>;
  for (const leg of LEGS) {
    legs[leg] = makeLeg();
    legs[leg].group.classList.add(leg.startsWith('front') ? 'k-leg-front' : 'k-leg-hind');
  }

  // The body: an outline from the silhouette of the slices, and the slices and ends
  // themselves (which fill it in when seen end-on). Then the markings, clipped to it.
  const body = make('g', {}, main.fill);
  const torsoSides = make('path', { id: `${id}-torso`, class: 'k-p k-fur' }, body);
  const torsoEnds = make('path', { id: `${id}-torsoends`, class: 'k-p k-fur' }, body);
  const torsoClip = make('clipPath', { id: `${id}-torsoclip` }, defs);
  make('use', { href: `#${id}-torso` }, torsoClip);
  make('use', { href: `#${id}-torsoends` }, torsoClip);
  const markings = make('g', { 'clip-path': `url(#${id}-torsoclip)` }, body);
  const backSides = make('path', { class: 'k-p k-backfur' }, markings);
  const backEnds = make('path', { class: 'k-p k-backfur' }, markings);
  // Tabby stripes over the back and flanks (transparent unless the coat has them).
  const stripes = cat ? [0, 1, 2, 3, 4, 5].map(() => make('path', { class: 'k-stripe' }, markings)) : [];
  // A paler chest.
  const belly = make('path', { class: 'k-p k-bellyfur' }, markings);
  // An otter's paler underside, which shows when it rolls over to float on its back.
  const underside = build.species === 'otter' ? [make('path', { class: 'k-p k-bellyfur' }, markings), make('path', { class: 'k-p k-bellyfur' }, markings)] : null;

  // Head and neck move as one, in front of the body or behind it.
  const headUnit = make('g', {}, main.fill);
  const neck = make('path', { class: 'k-p k-fur' }, headUnit);
  const headParts = make('g', {}, headUnit);
  const farEar = make('path', { class: 'k-p k-earfur' }, headParts);
  const skull = make('ellipse', { class: 'k-p k-headfur' }, headParts);
  const cheeks = [0, 1].map(() => make('ellipse', { class: 'k-p k-headfur' }, headParts));
  const ruffs = raccoon || fox ? [0, 1].map(() => make('path', { class: 'k-p k-cheekfur' }, headParts)) : [];
  const muzzle = make('ellipse', { class: 'k-p k-muzzlefur' }, headParts);
  const snout = raccoon || fox ? make('ellipse', { class: 'k-p k-muzzlefur' }, headParts) : null;
  const chin = make('ellipse', { class: 'k-p k-chinfur' }, headParts);
  const nearEar = make('path', { class: 'k-p k-earfur' }, headParts);
  const headClip = make('clipPath', { id: `${id}-headclip` }, defs);
  for (const part of [skull, ...cheeks, muzzle, ...(snout ? [snout] : []), chin]) {
    if (!part.id) part.id = `${id}-hp${headClip.childNodes.length}`;
    make('use', { href: `#${part.id}` }, headClip);
  }

  // Per leg: the line where it crosses the body side-on, and the line down its inner edge
  // that parts it from its partner when seen from in front or behind.
  const legLines = {} as Record<LegName, { along: SVGElement; inner: SVGElement }>;
  for (const leg of LEGS) legLines[leg] = { along: make('path', { class: 'k-contour' }, details), inner: make('path', { class: 'k-contour' }, details) };
  const neckLine = make('path', { class: 'k-contour k-soft' }, details);

  // Face. Eyes and markings are clipped to the head, so a far eye tucks behind the muzzle.
  const face = make('g', { class: 'k-face' }, faceInFront);
  const eyeLayer = make('g', { 'clip-path': `url(#${id}-headclip)` }, face);
  const farEarInner = make('path', { class: 'k-earinner' }, face);
  const nearEarInner = make('path', { class: 'k-earinner' }, face);
  const mask = raccoon ? [0, 1, 2].map(() => make('path', { class: 'k-mask' }, eyeLayer)) : [];
  const brows = raccoon ? [0, 1].map(() => make('path', { class: 'k-brow' }, eyeLayer)) : [];
  const eyes: EyeParts[] = [0, 1].map((i) => {
    const open = make('g', {}, eyeLayer);
    const clipId = `${id}-eye${i}`;
    const clip = make('path', {}, make('clipPath', { id: clipId }, defs));
    const white = make('path', { class: 'k-eyeball' }, open);
    const inner = make('g', { 'clip-path': `url(#${clipId})` }, open);
    const iris = make('ellipse', { class: 'k-iris' }, inner);
    const pupil = make('ellipse', { class: 'k-pupil' }, inner);
    const glint = make('circle', { class: 'k-glint' }, inner);
    const rim = make('path', { class: 'k-eyerim' }, open);
    const shut = make('path', { class: 'k-eyeshut' }, eyeLayer);
    return { open, white, clip, iris, pupil, glint, rim, shut };
  });
  const brow = cat ? [0, 1, 2].map(() => make('path', { class: 'k-stripe k-fine' }, eyeLayer)) : [];
  const nose = make('path', { class: 'k-nose' }, face);
  const mouth = make('path', { class: 'k-mouthline' }, face);
  const mouthOpen = make('path', { class: 'k-mouth' }, face);
  const tongue = make('path', { class: 'k-tongue' }, face);
  const whiskers = [0, 1, 2, 3, 4, 5].map(() => make('path', { class: 'k-whisker' }, face));

  const R = build.head.r;
  let muzzleBehind = false;
  /** The body's slices as last drawn, for working out where it meets the water. */
  let torso: { sections: Section[]; rearCap: number; frontCap: number } | null = null;

  function draw(shown: Shown): void {
    const { pose, flags, view } = shown;
    const frame = spineFrame(pose);

    // Whole-figure transforms: carried rotation about the scruff, and squash about the feet.
    const centre = view.at((pose.px + pose.sx) / 2, 0);
    const sx = 1 / Math.sqrt(pose.squash);
    const parts: string[] = [];
    if (Math.abs(pose.rot) > 0.01) parts.push(`rotate(${n(pose.rot)} ${n(shown.scruff.x)} ${n(shown.scruff.y)})`);
    if (Math.abs(pose.squash - 1) > 0.002) parts.push(`translate(${n(centre.x)} 0) scale(${n(sx)} ${n(pose.squash)}) translate(${n(-centre.x)} 0)`);
    set(figure, 'transform', parts.join(' '));

    drawShadow(pose, view, flags.noShadow || !!water);
    drawTorso(frame, pose, view);
    const legDepth = {} as Record<LegName, number>;
    for (const leg of LEGS) legDepth[leg] = drawLeg(leg, pose, view, frame);
    const head = new HeadView(view.at(pose.hx, pose.hy, shown.head.z), pose.hpitch, shown.head.yaw, pose.hroll, HEAD_TILT);
    drawNeck(frame, pose, view, head, shown);
    drawHead(head, pose);

    // Who's in front of whom, from how far towards you each part stands on the floor.
    const bodyDepth = view.towards((pose.px + pose.sx) / 2);
    const headDepth = view.towards(pose.hx, shown.head.z);
    const headBehind = headDepth < bodyDepth - 4;
    const placed: { el: SVGElement; layer: Layer; depth: number }[] = [];
    for (const leg of LEGS) {
      const depth = legDepth[leg];
      const ahead = depth > bodyDepth;
      // Rolled on his back, all four paws are up in the air, over his belly.
      const raised = (flags.pawUp && leg.startsWith('front') && depth > bodyDepth - 0.5) || pose.roll > 0.5;
      const layer: Layer = raised ? 'front' : ahead ? 'main' : 'far';
      placed.push({ el: legs[leg].group, layer, depth });
      legs[leg].group.classList.toggle('k-far-side', layer === 'far');
      // The thigh and shoulder are body: in shadow on the far side, not when just behind him.
      legs[leg].group.classList.toggle('k-far-upper', layer === 'far' && Math.abs(view.c) > 0.5);
    }
    placed.push({ el: headUnit, layer: headBehind ? 'far' : 'main', depth: headDepth });
    arrange(placed);
    const faceSlot = headBehind ? faceBehind : faceInFront;
    if (face.parentNode !== faceSlot) faceSlot.appendChild(face);

    placeTail(shown.tail, view, bodyDepth, flags.tailFront);
    drawTail(shown.tail, pose, view);

    drawContours(pose, view, frame, placed);
    if (water) drawWater(shown, frame, !flags.noShadow);
  }

  /**
   * Which stretches of the tail are in front of the body and which behind it: each piece is
   * drawn in its own layer, so a tail curled round in front of the paws doesn't show through
   * the body where it passes behind.
   */
  function placeTail(points: Point3[], view: BodyView, bodyDepth: number, wrapped: boolean): void {
    // In front once clear of the body's near side. A wrapped tail lies on the floor round
    // the paws, so it only has to clear the middle.
    const clear = bodyDepth + (wrapped ? 0 : build.stance.hip);
    const count = points.length;
    const ahead: boolean[] = [];
    for (let i = 0; i < count - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      ahead.push((view.towards(a.x, a.z) + view.towards(b.x, b.z)) / 2 > clear);
    }
    // The first segment or two leave the rump, inside the body: they go with the rest.
    const rest = ahead.slice(2);
    const all = rest.every(Boolean);
    const none = !rest.some(Boolean);
    const home = all ? tailFrontSlot : tailBack.fill;
    if (tailGroup.parentNode !== home) home.insertBefore(tailGroup, home.firstChild);
    if (all || none) {
      if (tailCopy.parentNode) tailCopy.remove();
      return;
    }
    if (tailCopy.parentNode !== tailFrontSlot) tailFrontSlot.appendChild(tailCopy);
    // Cover each stretch in front with a broad band cut square at its ends, rounded at the
    // joints in between so a bend isn't nicked.
    const pts = points.map((p) => view.at(p.x, p.y, p.z));
    const wide = (build.tail.base + 3) * 2.2;
    let d = '';
    for (let i = 2; i < count - 1; i++) {
      if (!ahead[i]) continue;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const along = unit(sub(b, a));
      const side = { x: -along.y * wide, y: along.x * wide };
      const corners = [add(a, side), add(b, side), sub(b, side), sub(a, side)];
      d += `M${corners.map(fmt).join('L')}Z`;
      if (i + 1 < count - 1 ? ahead[i + 1] : true) {
        d += `M${fmt({ x: b.x - wide, y: b.y })}a${n(wide)},${n(wide)} 0 1,0 ${n(wide * 2)},0a${n(wide)},${n(wide)} 0 1,0 ${n(-wide * 2)},0Z`;
      }
    }
    set(tailCutPath, 'd', d);
  }

  /** Puts each part in its layer, farthest first, touching the page only when something moves. */
  function arrange(placed: { el: SVGElement; layer: Layer; depth: number }[]): void {
    for (const layer of ['far', 'main', 'front'] as const) {
      const parent = layers[layer];
      const wanted = placed.filter((p) => p.layer === layer).sort((a, b) => a.depth - b.depth);
      // The body stays first in the main layer, and the tail's place first in front.
      const fixed = layer === 'main' || layer === 'front' ? 1 : 0;
      const current = Array.from(parent.children).slice(fixed) as SVGElement[];
      const same = current.length === wanted.length && current.every((el, i) => el === wanted[i]!.el);
      if (!same) for (const p of wanted) parent.appendChild(p.el);
    }
  }

  function drawShadow(pose: Pose, view: BodyView, hidden: boolean): void {
    const ys = [pose.fny, pose.ffy, pose.bny, pose.bfy];
    const lift = clamp01(-Math.max(...ys) / 16);
    set(shadow, 'display', hidden ? 'none' : 'inline');
    if (hidden) return;
    const rear = Math.min(pose.px, pose.bnx, pose.bfx) - 8;
    const fore = Math.max(pose.sx, pose.fnx, pose.ffx) + 6;
    const half = Math.max(8, (fore - rear) / 2) * (1 - lift * 0.4);
    const across = build.stance.hip * 2 + 2.5;
    const e = ellipseOf(view.at((rear + fore) / 2, 0), [view.vec(half, 0), view.vec(0, 0, across)]);
    set(shadow, 'cx', n(e.cx));
    set(shadow, 'cy', n(e.cy));
    set(shadow, 'rx', n(e.rx));
    set(shadow, 'ry', n(e.ry));
    set(shadow, 'transform', `rotate(${n(e.angle)} ${n(e.cx)} ${n(e.cy)})`);
    set(shadow, 'opacity', n(1 - lift * 0.7));
  }

  /** How thick the tail is all along it, root first. */
  function tailRadii(count: number, pose: Pose): number[] {
    const { tail } = build;
    const puff = 1 + pose.puff * (raccoon || fox ? 0.4 : 1.1);
    return Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1);
      // Cats' tails are even, thickening at the root where they grow out of the rump;
      // raccoons' are bushy, fullest a third of the way along; a fox's brush is fullest
      // half way and rounds off at the tip; an otter's tapers all the way, thick to thin.
      const base = raccoon
        ? lerp(tail.base * 0.75, tail.tip, t) + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 2
        : fox
          ? lerp(tail.base, tail.tip, t) + 2.4 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.8 - 0.6 * smooth((t - 0.9) / 0.1)
          : species === 'otter'
            ? tail.tip + (tail.base - tail.tip) * (1 - t) ** 1.2
            : lerp(tail.base, tail.tip, t) * (1 + 0.3 * smooth(1 - t / 0.2));
      return base * puff;
    });
  }

  /**
   * The tail's spine on screen, with a short stretch added at the root running on into the
   * body, so where it leaves the rump is always hidden inside the body, whichever way he's
   * seen from, instead of showing as a cut end.
   */
  function tailSpine(points: Point3[], view: BodyView, radii: number[]): { pts: Point[]; radii: number[] } {
    const pts = points.map((p) => view.at(p.x, p.y, p.z));
    const a = points[0]!;
    const b = points[1]!;
    const back = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    const k = (build.tail.base * 0.9) / back;
    const inside = view.at(a.x - (b.x - a.x) * k, a.y - (b.y - a.y) * k, a.z - (b.z - a.z) * k);
    return { pts: [inside, ...pts], radii: [radii[0]! * 0.85, ...radii] };
  }

  function drawTail(points: Point3[], pose: Pose, view: BodyView): void {
    const { tail } = build;
    const count = points.length;
    const pts = points.map((p) => view.at(p.x, p.y, p.z));
    const radii = tailRadii(count, pose);
    const spine = tailSpine(points, view, radii);
    const d = tube(spine.pts, spine.radii);
    const copies = tailCopy.parentNode ? tails : [tails[0]];
    for (const copy of copies) set(copy.path, 'd', d);
    // Rings: dark bands across the tail at even spacing, and a dark tip.
    tails[0].ringPaths.forEach((_, r) => {
      const at = raccoon ? 0.22 + r * 0.18 : 0.2 + r * 0.13;
      const i = Math.min(count - 2, Math.floor(at * (count - 1)));
      const f = at * (count - 1) - i;
      const c = mixPt(pts[i]!, pts[i + 1]!, f);
      const along = unit(sub(pts[i + 1]!, pts[i]!));
      const across = { x: -along.y * 9, y: along.x * 9 };
      const back = scale(along, -0.6);
      const band = `M${fmt(add(add(c, across), back))}L${fmt(sub(add(c, back), across))}`;
      // A band round a tail pointing at you is seen edge-on: thinner, not a smear.
      const foreshortened = clamp(Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) / tail.segment, 0.2, 1);
      const width = `stroke-width:${n((raccoon ? 3.4 : 1.7) * foreshortened)}px`;
      for (const copy of copies) {
        set(copy.ringPaths[r]!, 'd', band);
        set(copy.ringPaths[r]!, 'style', width);
      }
    });
    // The raccoon's dark tip; the fox's white one, a good stretch of the end of the brush.
    const tip = fox ? mixPt(pts[count - 2]!, pts[count - 1]!, 0.8) : pts[count - 1]!;
    for (const copy of copies) {
      if (!copy.tip) continue;
      set(copy.tip, 'cx', n(tip.x));
      set(copy.tip, 'cy', n(tip.y));
      set(copy.tip, 'r', n(fox ? tail.segment * 1.35 : radii[count - 1]! * 1.05));
    }
  }

  /**
   * Where a leg's upper part starts, inside the body: the shoulder blade or the top of the
   * thigh. Low enough that it never shows as a knob above the line of the back, even on the
   * far side, which the camera, looking down a little, sees higher up.
   */
  function limbTop(root: Point, frame: Frame, front: boolean): Point {
    return add(root, add(scale(frame.up, front ? 1.6 : -0.6), scale(frame.along, front ? -1.5 : 0.5)));
  }

  /** Draws a leg and returns how far towards you it stands. */
  function drawLeg(leg: LegName, pose: Pose, view: BodyView, frame: Frame): number {
    const parts = legs[leg];
    const j = legJoints(build, pose, leg);
    const front = leg.startsWith('front');
    const here = view.local(j.root.x);
    const [w0, w1, w2, w3] = limbWidths(leg, here);
    const root = view.pt(j.root, j.z.root);
    const mid = view.pt(j.mid, j.z.mid);
    const low = view.pt(j.low, j.z.low);
    const paw = view.pt(j.paw, j.z.paw);
    // Upper part starts inside the body: the shoulder blade or the top of the thigh. Rolled
    // on his back, with his paws in the air over his belly, it's down the side of the body,
    // and only the rest of the limb shows.
    const top = view.pt(limbTop(j.root, frame, front), j.z.root * 0.8);
    // Bend softly through each joint instead of kinking.
    set(parts.upper, 'd', pose.roll > 0.5 ? '' : tube([top, mixPt(root, mid, 0.35), mid], front ? [w0 * 0.8, w0, w1] : [w0 * 0.8, w0 * 0.98, w1]));
    const muscle = front ? [w1, w1 * 1.02, w2] : [w1, w1 * 1.05, w2];
    set(parts.lower, 'd', tube([mid, mixPt(mid, low, front ? 0.4 : 0.35), low], muscle));
    set(parts.foot, 'd', tube([low, paw], [w2, w3]));
    // The paw: a rounded pad, toes pointing on from the end of the hand or foot.
    const [pl, ph] = front ? build.pawFront : build.pawBack;
    const bone = unit(sub(j.paw, j.low));
    const toe = { x: bone.y, y: -bone.x };
    const up = { x: toe.y, y: -toe.x };
    const centreLocal = add(j.paw, add(scale(toe, pl * 0.45), scale(up, ph * 0.95)));
    const centre = view.pt(centreLocal, j.z.paw);
    const pad = ellipseOf(centre, [view.vec(toe.x * pl, toe.y * pl, 0, j.paw.x), view.vec(up.x * ph, up.y * ph, 0, j.paw.x), view.vec(0, 0, pl * 0.78, j.paw.x)]);
    set(parts.paw, 'd', ellipsePath(pad));
    // Two tiny toe lines on the side you see.
    const side = Math.sign(j.z.paw) || 1;
    const showing = view.local(j.paw.x).c * side;
    if (showing > 0.25) {
      const tipLocal = add(centreLocal, scale(toe, pl));
      const a = view.pt(add(tipLocal, add(scale(toe, -pl * 0.55), scale(up, ph * 0.1))), j.z.paw + side * pl * 0.3);
      const b = view.pt(add(tipLocal, add(scale(toe, -pl * 0.2), scale(up, ph * 0.05))), j.z.paw + side * pl * 0.3);
      const down = view.vec(up.x * -0.9, up.y * -0.9, 0, j.paw.x);
      set(parts.toes, 'd', `M${fmt(a)}l${n(down.x)},${n(down.y)}M${fmt(b)}l${n(down.x * 0.9)},${n(down.y * 0.9)}`);
      set(parts.toes, 'opacity', n(clamp01((showing - 0.25) * 3)));
    } else {
      set(parts.toes, 'd', '');
    }
    return view.towards(j.mid.x, j.z.mid);
  }

  /**
   * A leg's thickness as seen from this side. Legs are deeper front to back than they are
   * wide, the thigh most of all, so from in front or behind they're slimmer than in profile.
   */
  function limbWidths(leg: LegName, view: BodyView): [number, number, number, number] {
    const front = leg.startsWith('front');
    const widths = front ? build.frontWidth : build.backWidth;
    const flat = front ? [0.75, 0.85, 0.95, 1] : [0.55, 0.75, 0.95, 1];
    return widths.map((w, i) => w * Math.hypot(view.c, view.s * flat[i]!)) as [number, number, number, number];
  }

  /** A slice through the body `a` along the spine, with its middle `b` above the spine. */
  function slice(frame: Frame, pose: Pose, a: number, b: number): { p: Point; t: Point; up: Point } {
    const L = frame.length;
    const inside = clamp(a, 0, L);
    const base = bodyAt(frame, pose, inside, 0);
    const t = unit(sub(bodyAt(frame, pose, clamp(inside + 0.5, 0, L), 0), bodyAt(frame, pose, clamp(inside - 0.5, 0, L), 0)));
    const up = { x: t.y, y: -t.x };
    return { p: add(base, add(scale(t, a - inside), scale(up, b))), t, up };
  }

  /** The body: a solid round the spine, deeper at the ribs and rump, round at both ends. */
  function drawTorso(frame: Frame, pose: Pose, view: BodyView): void {
    const L = frame.length;
    // Upright (sitting up, standing on hind legs), a raccoon's hump straightens out.
    const upright = uprightness(frame);
    const spec = TORSO[build.species](L, pose, upright);
    const tops = spec.top;
    const bottoms = spec.bottom.slice().reverse();
    const girth = build.stance.girth * (1 + pose.puff * 0.15);
    // Rolled over, the belly is on top and the back underneath.
    const roll = clamp01(pose.roll);
    const flip = 1 - 2 * roll;
    const sectionAt = (a: number): Section => {
      const up = profile(tops, a);
      const down = profile(bottoms, a);
      const top = lerp(up, down, roll);
      const bottom = lerp(down, up, roll);
      const hh = (top + bottom) / 2;
      const s = slice(frame, pose, a, (top - bottom) / 2);
      return { a, ...s, hh, w: hh * girth };
    };
    const first = Math.max(tops[0]![0], bottoms[0]![0]);
    const last = Math.min(tops[tops.length - 1]![0], bottoms[bottoms.length - 1]![0]);
    const sections = Array.from({ length: SECTIONS }, (_, i) => sectionAt(lerp(first, last, i / (SECTIONS - 1))));
    const rearCap = Math.max(1.5, first - spec.rear[0]);
    const frontCap = Math.max(1.5, spec.front[0] - last);
    const shape = solid(sections, rearCap, frontCap, view, 3);
    set(torsoSides, 'd', shape.sides);
    set(torsoEnds, 'd', shape.ends);
    torso = { sections, rearCap, frontCap };

    // Darker fur along the back: a smaller solid along the top, inside the body.
    const ridge = sections.map((s) => ({ ...s, p: add(s.p, scale(s.up, s.hh * 0.66 * flip)), hh: s.hh * 0.42, w: s.w * 0.7 }));
    const back = solid(ridge, rearCap * 0.7, frontCap * 0.4, view, 0);
    set(backSides, 'd', back.sides);
    set(backEnds, 'd', back.ends);

    // Tabby stripes: bands round the body from the spine down each flank, drawn where they face you.
    stripes.forEach((stripe, i) => {
      const a0 = L * (-0.18 + 0.22 * i);
      const reach = 1.5 + (i % 2) * 0.4;
      const pts: Point[] = [];
      let best: Point[] = [];
      for (let k = 0; k <= 16; k++) {
        const th = lerp(-reach, reach, k / 16);
        const s = sectionAt(a0 + lerp(-1.8, 0.6, Math.abs(th) / reach));
        const c = Math.cos(th);
        const sn = Math.sin(th);
        const facing = view.local(s.p.x).facing(s.up.x * (c / s.hh), s.up.y * (c / s.hh), sn / s.w);
        if (facing > 0.1) {
          pts.push(view.pt(add(s.p, scale(s.up, s.hh * c)), s.w * sn));
          if (pts.length > best.length) best = pts.slice();
        } else {
          pts.length = 0;
        }
      }
      set(stripe, 'd', best.length > 1 ? curve(best) : '');
    });

    // A paler chest and throat: a patch on the front of the chest, showing as it turns to you.
    const chest = sections[SECTIONS - 1]!;
    const bibLocal = add(chest.p, add(scale(chest.t, frontCap * 0.3), scale(chest.up, -chest.hh * 0.42 * flip)));
    const at = chest.p.x;
    const bib = ellipseOf(view.pt(bibLocal), [
      view.vec(chest.t.x * frontCap * 1.1, chest.t.y * frontCap * 1.1, 0, at),
      view.vec(chest.up.x * chest.hh * 0.72, chest.up.y * chest.hh * 0.72, 0, at),
      view.vec(0, 0, chest.w * 0.8, at),
    ]);
    const towardsYou = view.local(at).facing(chest.t.x * 0.85 - chest.up.x * 0.5 * flip, chest.t.y * 0.85 - chest.up.y * 0.5 * flip, 0);
    set(belly, 'd', ellipsePath(bib));
    set(belly, 'opacity', n(clamp01((towardsYou + 0.5) / 0.3)));
    if (underside) {
      const pale = sections.map((s) => ({ ...s, p: add(s.p, scale(s.up, -s.hh * 0.5 * flip)), hh: s.hh * 0.62, w: s.w * 0.78 }));
      const under = solid(pale, rearCap * 0.6, frontCap * 0.8, view, 0);
      for (const [i, d] of [under.sides, under.ends].entries()) {
        set(underside[i]!, 'd', d);
        // Only shows rolled over: the right way up it's under the water anyway.
        set(underside[i]!, 'opacity', n(clamp01(roll * 1.6 - 0.2)));
      }
    }
  }

  /**
   * The outline of a solid made of slices: its two silhouette lines (where the surface turns
   * away from you) joined into one shape, plus the rounded ends and a few whole slices,
   * which give the outline when it's seen end-on.
   */
  function solid(sections: Section[], rearCap: number, frontCap: number, view: BodyView, every: number): { sides: string; ends: string } {
    const near: Point[] = [];
    const farSide: Point[] = [];
    for (const s of sections) {
      // The view direction in the animal's frame: towards you and up.
      const here = view.local(s.p.x);
      const upDot = s.up.x * here.s - s.up.y * DEPTH;
      const th = Math.atan2(-s.w * upDot, s.hh * here.c);
      const on = (angle: number) => view.pt(add(s.p, scale(s.up, s.hh * Math.cos(angle))), s.w * Math.sin(angle));
      near.push(on(th));
      farSide.push(on(th + Math.PI));
    }
    const sides = curve([...near, ...farSide.reverse()], true, 0.9);
    const ellipses: Ellipse[] = [];
    const cap = (s: Section, along: number) =>
      ellipseOf(view.pt(s.p), [view.vec(s.t.x * along, s.t.y * along, 0, s.p.x), view.vec(s.up.x * s.hh, s.up.y * s.hh, 0, s.p.x), view.vec(0, 0, s.w, s.p.x)]);
    ellipses.push(cap(sections[0]!, rearCap), cap(sections[sections.length - 1]!, frontCap));
    if (every > 0) {
      for (let i = every; i < sections.length - 1; i += every) ellipses.push(cap(sections[i]!, 0.6));
    }
    return { sides, ends: ellipses.map(ellipsePath).join('') };
  }

  function drawNeck(frame: Frame, pose: Pose, view: BodyView, head: HeadView, shown: Shown): void {
    const L = frame.length;
    const base = view.pt(bodyAt(frame, pose, L - 0.5, -0.5));
    // The neck meets the skull behind and below its centre, wherever the head has turned.
    const join = head.at(v3(-R * 0.25, -R * 0.35, 0));
    const middle = view.pt(mixPt(bodyAt(frame, pose, L - 0.5, -0.5), { x: pose.hx, y: pose.hy }, 0.5), shown.head.z * 0.6);
    const lift = { x: 0, y: -1.2 };
    const r0 = NECK[species];
    // Turned, the skin of the neck twists: it narrows a touch and folds on the inside of the turn.
    const turn = (shown.head.yaw - (view.yawAt(frame.s.x) * 180) / Math.PI) * (Math.PI / 180);
    const twist = Math.abs(Math.sin(turn));
    // An otter's neck is nearly as thick as its head.
    set(neck, 'd', tube([base, add(middle, lift), join], [r0, r0 * (0.86 - 0.06 * twist), R * (species === 'otter' ? 0.78 : 0.6)]));
    if (twist > 0.3 && catlike) {
      const dir = unit(sub(join, base));
      const across = { x: -dir.y, y: dir.x };
      const c = mixPt(add(middle, lift), join, 0.35);
      const r = r0 * 0.7;
      const bow = scale(dir, Math.sign(Math.sin(turn)) * r * 0.35);
      set(neckLine, 'd', curve([add(c, scale(across, r * 0.8)), add(c, bow), sub(c, scale(across, r * 0.5))]));
      set(neckLine, 'opacity', n(clamp01((twist - 0.3) * 2.5)));
    } else {
      set(neckLine, 'd', '');
    }
  }

  function drawContours(pose: Pose, view: BodyView, frame: Frame, placed: { el: SVGElement; layer: Layer; depth: number }[]): void {
    // Legs merged into the body's outline need lines of their own to read against fur of
    // the same colour. Side-on: the front edge of the nearer thigh where it crosses the
    // belly, and the back of the nearer elbow. From in front or behind: the inner edge of
    // each leg, which parts it from its partner.
    const sideOn = clamp01(Math.abs(view.c) * 1.6 - 0.2);
    const towardsBody = view.vec(frame.s.x - frame.p.x, frame.s.y - frame.p.y);
    const where = (leg: LegName) => placed.find((q) => q.el === legs[leg].group)!;
    for (const [a, b] of [
      ['backNear', 'backFar'],
      ['frontNear', 'frontFar'],
    ] as const) {
      for (const [leg, other] of [
        [a, b],
        [b, a],
      ] as const) {
        const lines = legLines[leg];
        const here = where(leg);
        if (here.layer !== 'main') {
          set(lines.along, 'd', '');
          set(lines.inner, 'd', '');
          continue;
        }
        const hind = leg.startsWith('back');
        const j = legJoints(build, pose, leg);
        const [w0, w1] = limbWidths(leg, view.local(j.root.x));
        const top = limbTop(j.root, frame, !hind);
        const down = hind ? 0.3 : 0.4;
        const spine = [
          view.pt(top, j.z.root * 0.8),
          view.pt(mixPt(j.root, j.mid, 0.35), lerp(j.z.root, j.z.mid, 0.35)),
          view.pt(j.mid, j.z.mid),
          view.pt(mixPt(j.mid, j.low, down), lerp(j.z.mid, j.z.low, down)),
        ];
        const radii = hind ? [w0 * 0.8, w0 * 0.98, w1, w1 * 1.04] : [w0 * 0.8, w0, w1, w1 * 1.02];
        const nearer = where(other).layer !== 'main' || here.depth >= where(other).depth;
        // Sitting or crouched, the knee folds right up and the shin runs back under the
        // thigh: the thigh then shows as a round haunch, its line running down the front of
        // it and round the knee, rather than on round the fold.
        const thigh = sub(j.mid, j.root);
        const shin = sub(j.low, j.mid);
        const folded = hind && (thigh.x * shin.x + thigh.y * shin.y) / ((Math.hypot(thigh.x, thigh.y) * Math.hypot(shin.x, shin.y)) || 1) < -0.3;
        if (nearer && sideOn > 0.02) {
          const d = folded ? haunch(spine.slice(0, 3), radii.slice(0, 3), towardsBody, 0.45) : edge(spine, radii, hind ? towardsBody : scale(towardsBody, -1), hind ? 0.45 : 0.55);
          set(lines.along, 'd', d);
          set(lines.along, 'opacity', n(sideOn));
        } else {
          set(lines.along, 'd', '');
        }
        if (sideOn < 0.98) {
          const partner = legJoints(build, pose, other);
          const inward = sub(view.pt(partner.mid, partner.z.mid), view.pt(j.mid, j.z.mid));
          set(lines.inner, 'd', edge(spine, radii, inward, 0.4));
          set(lines.inner, 'opacity', n(1 - sideOn));
        } else {
          set(lines.inner, 'd', '');
        }
      }
    }
  }

  /**
   * One edge of a limb (already on screen), from `from` (0..1 of the way along) to its end:
   * the side facing `side`. Used for contour lines that sit exactly on the limb's outline.
   */
  function edge(pts: Point[], radii: number[], side: Point, from: number): string {
    return curve(edgePoints(pts, radii, side, from));
  }

  /** The line down the front of a folded thigh, on round the knee at its end. */
  function haunch(pts: Point[], radii: number[], side: Point, from: number): string {
    const out = edgePoints(pts, radii, side, from);
    const last = pts.length - 1;
    const c = pts[last]!;
    const along = unit(sub(c, pts[last - 1]!));
    let nrm = { x: -along.y, y: along.x };
    if (nrm.x * side.x + nrm.y * side.y < 0) nrm = scale(nrm, -1);
    const r = radii[last]! * 0.97;
    for (const k of [0.2, 0.4, 0.6, 0.8]) {
      const a = k * Math.PI;
      out.push(add(c, add(scale(nrm, r * Math.cos(a)), scale(along, r * Math.sin(a)))));
    }
    return curve(out);
  }

  function edgePoints(pts: Point[], radii: number[], side: Point, from: number): Point[] {
    const out: Point[] = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const t = from + ((1 - from) * i) / (count - 1);
      const f = t * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const u = f - k;
      const c = mixPt(pts[k]!, pts[k + 1]!, u);
      const r = lerp(radii[k]!, radii[k + 1]!, u);
      const along = unit(sub(pts[k + 1]!, pts[k]!));
      let nrm = { x: -along.y, y: along.x };
      if (nrm.x * side.x + nrm.y * side.y < 0) nrm = scale(nrm, -1);
      out.push(add(c, scale(nrm, r * 0.97)));
    }
    return out;
  }
  function drawHead(head: HeadView, pose: Pose): void {
    const c = head.centre;
    const roll = pose.hroll;
    set(skull, 'cx', n(c.x));
    set(skull, 'cy', n(c.y));
    set(skull, 'rx', n(R));
    set(skull, 'ry', n(R * SKULL[species]));
    set(skull, 'transform', `rotate(${n(roll)} ${n(c.x)} ${n(c.y)})`);
    const blob = (el: SVGElement, at: V3, r: number, ry = r) => {
      const p = head.at(at);
      set(el, 'cx', n(p.x));
      set(el, 'cy', n(p.y));
      set(el, 'rx', n(r));
      set(el, 'ry', n(ry));
      set(el, 'transform', `rotate(${n(roll)} ${n(p.x)} ${n(p.y)})`);
    };
    // The face's solid parts: cheeks, muzzle (and a long snout), chin.
    const face = FACE[species];
    const [cf, cu, cs, crx, cry] = face.cheek;
    blob(cheeks[0]!, v3(R * cf, R * cu, R * cs), R * crx, R * cry);
    blob(cheeks[1]!, v3(R * cf, R * cu, -R * cs), R * crx, R * cry);
    const part = (el: SVGElement | null, spec?: [number, number, number, number]) => {
      if (el && spec) blob(el, v3(R * spec[0], R * spec[1], 0), R * spec[2], R * spec[3]);
    };
    part(muzzle, face.muzzle);
    part(snout, face.snout);
    part(chin, face.chin);
    // Fluffy cheek ruffs that stick out behind the jaw: a raccoon's grizzled ones, a fox's white ones.
    ruffs.forEach((ruff, i) => {
      const side = i === 0 ? 1 : -1;
      const pts = (fox ? FOX_RUFF : RACCOON_RUFF).map(([f, u, sd]) => head.at(v3(R * f, R * u, side * R * sd)));
      set(ruff, 'd', curve(pts, true, 0.6));
      // Pale cheek fur belongs to the face: from behind it would stick out like tusks.
      set(ruff, 'opacity', n(clamp01((head.vec(v3(1, 0, 0)).z + 0.55) / 0.3)));
    });

    drawEars(head, pose);
    // Seen from behind, the muzzle is round the far side of the skull.
    const forward = head.vec(v3(1, 0, 0)).z;
    const behind = forward < -0.25;
    if (behind !== muzzleBehind) {
      muzzleBehind = behind;
      for (const part of [muzzle, snout, chin]) {
        if (part) headParts.insertBefore(part, behind ? skull : headParts.lastChild);
      }
    }
    drawEyes(head, pose);
    drawMuzzleFeatures(head, pose, forward);
  }

  function drawEars(head: HeadView, pose: Pose): void {
    const shape = EARS[species];
    const at = (v: [number, number, number], s: number) => v3(R * v[0], R * v[1], s * R * v[2]);
    const ear = (side: 1 | -1, amount: number) => {
      const s = side;
      // Base on the skull; the tip swings forward when pricked and out and back when flat.
      const baseF = at(shape.baseF, s);
      const baseB = at(shape.baseB, s);
      const up = at(shape.up, s);
      const fwd = at(shape.fwd, s);
      const flat = at(shape.flat, s);
      const e = clamp(amount, -1, 1);
      const tip3 = e >= 0 ? lerpV(up, fwd, e) : lerpV(up, flat, -e);
      const f = head.at(baseF);
      const b = head.at(baseB);
      const t = head.at(tip3);
      // The ear is a cone, not a flat triangle: its back bulges out, so it never goes
      // paper-thin when seen edge-on. Outline = the hull of the projected cone.
      const baseMid = lerpV(baseF, baseB, 0.5);
      const out = normaliseV(v3(baseMid.f - R * 0.1, baseMid.u * 0.3, baseMid.s));
      const bulge = R * shape.bulge;
      const back3 = v3(baseMid.f + out.f * bulge, baseMid.u + out.u * bulge, baseMid.s + out.s * bulge);
      const ring: V3[] = [baseF, lerpV(baseF, back3, 0.6), back3, lerpV(back3, baseB, 0.4), baseB];
      const pts: Point[] = [t];
      for (const base of ring) {
        pts.push(head.at(base));
        // Sides bow out a little on the way up to the tip.
        const m = lerpV(base, tip3, shape.pointed ? 0.55 : 0.5);
        const away = normaliseV(v3(m.f, m.u - R * 0.5, m.s));
        pts.push(head.at(v3(m.f + away.f * shape.bow, m.u + away.u * shape.bow, m.s + away.s * shape.bow)));
      }
      const outline = curve(hull(pts), true, shape.pointed ? 0.5 : 1.1);
      // The opening faces forward and out: how much of it shows.
      const facing = head.vec(lerpV(v3(0.75, 0.1, s * 0.65), v3(-0.3, 0.2, s * 1), Math.max(0, -e))).z;
      const innerTip = mixPt(t, mixPt(f, b, 0.5), 0.2);
      const innerShape = curve([mixPt(f, b, 0.18), mixPt(mixPt(f, t, 0.6), innerTip, 0.4), innerTip, mixPt(b, innerTip, 0.45), mixPt(f, b, 0.75)], true, 0.6);
      return { outline, innerShape, facing, z: (f.z + b.z) / 2 };
    };
    const nearE = ear(1, pose.earN);
    const farE = ear(-1, pose.earF);
    set(nearEar, 'd', nearE.outline);
    set(farEar, 'd', farE.outline);
    set(nearEarInner, 'd', nearE.innerShape);
    set(farEarInner, 'd', farE.innerShape);
    set(nearEarInner, 'opacity', n(clamp01(nearE.facing * 2.2)));
    set(farEarInner, 'opacity', n(clamp01(farE.facing * 2.2)));
    // Whichever ear is nearer the viewer goes in front of the skull.
    const nearInFront = nearE.z >= farE.z;
    const first = nearInFront ? farEar : nearEar;
    const last = nearInFront ? nearEar : farEar;
    if (headParts.firstChild !== first) headParts.insertBefore(first, headParts.firstChild);
    if (headParts.lastChild !== last) headParts.appendChild(last);
  }

  function drawEyes(head: HeadView, pose: Pose): void {
    const spec = EYES[species];
    const wide = Math.max(0, -pose.lids);
    const lids = Math.max(0, pose.lids);
    const happy = clamp01(pose.happy);
    eyes.forEach((eye, i) => {
      const side = i === 0 ? 1 : -1;
      const centre = onSphere(v3(spec.at[0], spec.at[1], side * spec.at[2]), R * spec.depth);
      const normal = v3(spec.normal[0], spec.normal[1], side * spec.normal[2]);
      // Cat and fox eyes slant up at the outer corner.
      const disc = head.disc(centre, normal, side * spec.slant);
      if (!disc || disc.facing < 0.2) {
        set(eye.open, 'display', 'none');
        set(eye.shut, 'display', 'none');
        if (mask[i]) set(mask[i]!, 'display', 'none');
        if (brows[i]) set(brows[i]!, 'display', 'none');
        return;
      }
      // A far eye only just coming round the head fades in, rather than poking out as a blob.
      const fade = clamp01((disc.facing - 0.2) / 0.2);
      const rx = R * spec.size[0] * (1 + wide * 0.18);
      const ry = R * spec.size[1] * (1 + wide * 0.22);
      if (mask[i]) drawMask(mask[i]!, disc, side, fade);
      if (brows[i]) drawBrow(brows[i]!, head, side, fade);

      const open = 1 - lids;
      const closedBy = Math.max(lids, happy * 0.9);
      if (closedBy > 0.88) {
        set(eye.open, 'display', 'none');
        set(eye.shut, 'display', 'inline');
        set(eye.shut, 'opacity', n(fade));
        // Asleep: a gentle downward curve. Blissful: an upward one.
        const pts: Point[] = [];
        for (let s = 0; s <= 6; s++) {
          const x = -1 + s / 3;
          const y = happy > 0.5 ? 0.25 - 0.55 * (1 - x * x) : 0.05 + 0.4 * (1 - x * x);
          pts.push(onDisc(disc, x, y, rx, ry));
        }
        set(eye.shut, 'd', curve(pts));
        return;
      }
      set(eye.shut, 'display', 'none');
      set(eye.open, 'display', 'inline');
      set(eye.open, 'opacity', n(fade));
      // Open eye: an almond (cats, foxes) or a round bead (raccoons, otters), with the lids cutting it.
      const lidLine = (x: number) => -1 + 2 * (1 - open) + 0.35 * (1 - x * x) * (1 - open);
      const lowLine = (x: number) => 1 - 1.7 * happy * (1 - 0.35 * x * x);
      const pts: Point[] = [];
      const steps = 20;
      for (let s = 0; s < steps; s++) {
        const th = (s / steps) * Math.PI * 2;
        const x = Math.cos(th);
        let y = Math.sin(th) * (catlike ? 1 - 0.16 * x * x : 1);
        y = Math.max(y, lidLine(x));
        y = Math.min(y, lowLine(x));
        pts.push(onDisc(disc, x, y, rx, ry));
      }
      const shape = curve(pts, true, 0.9);
      set(eye.white, 'd', shape);
      set(eye.clip, 'd', shape);
      set(eye.rim, 'd', shape);
      const look = { x: clamp(pose.lookX, -1, 1) * 0.42, y: clamp(pose.lookY, -1, 1) * 0.3 };
      const irisC = onDisc(disc, look.x * 0.6, look.y * 0.6, rx, ry);
      // Iris fills most of the eye; the pupil is a slit in daylight and round when excited.
      const ir = catlike ? 0.92 : 1.05;
      setEllipse(eye.iris, irisC, disc, rx * ir, ry * ir);
      const pupilC = onDisc(disc, look.x, look.y, rx, ry);
      const pw = catlike ? lerp(0.16, 0.7, clamp01(pose.pupil)) : 0.7;
      const ph = catlike ? 0.86 : 0.72;
      setEllipse(eye.pupil, pupilC, disc, rx * pw, ry * ph);
      const g = onDisc(disc, look.x * 0.5 + 0.3, look.y * 0.5 - 0.35, rx, ry);
      set(eye.glint, 'cx', n(g.x));
      set(eye.glint, 'cy', n(g.y));
      set(eye.glint, 'r', n(R * (catlike ? 0.075 : 0.07) * (0.6 + 0.4 * disc.facing)));
    });
  }

  function setEllipse(el: SVGElement, c: Point, disc: Disc, rx: number, ry: number): void {
    // An ellipse lying on the head: drawn round and mapped with the disc's axes.
    set(el, 'cx', '0');
    set(el, 'cy', '0');
    set(el, 'rx', n(rx));
    set(el, 'ry', n(ry));
    set(el, 'transform', `matrix(${n(disc.across.x)} ${n(disc.across.y)} ${n(disc.down.x)} ${n(disc.down.y)} ${n(c.x)} ${n(c.y)})`);
  }

  function drawMask(el: SVGElement, disc: Disc, side: number, fade: number): void {
    // The raccoon's bandit mask: a dark patch round each eye, sweeping back and down the cheek.
    const pts = [
      onDisc(disc, -1.1, -0.55, R * 0.3, R * 0.3),
      onDisc(disc, 0.6, -0.95, R * 0.3, R * 0.3),
      onDisc(disc, 1.5, -0.45, R * 0.3, R * 0.3),
      onDisc(disc, 1.75, 0.55, R * 0.3, R * 0.3),
      onDisc(disc, 0.9, 1.45, R * 0.3, R * 0.3),
      onDisc(disc, -0.6, 1.0, R * 0.3, R * 0.3),
    ];
    void side;
    set(el, 'display', 'inline');
    set(el, 'opacity', n(fade));
    set(el, 'd', curve(pts, true, 0.9));
  }

  function drawBrow(el: SVGElement, head: HeadView, side: number, fade: number): void {
    const pts = [
      head.at(onSphere(v3(0.75, 0.42, side * 0.18), R)),
      head.at(onSphere(v3(0.55, 0.62, side * 0.4), R)),
      head.at(onSphere(v3(0.2, 0.5, side * 0.62), R)),
      head.at(onSphere(v3(0.45, 0.38, side * 0.5), R)),
    ];
    set(el, 'display', 'inline');
    set(el, 'opacity', n(fade));
    set(el, 'd', curve(pts, true, 0.8));
  }

  function drawMuzzleFeatures(head: HeadView, pose: Pose, forward: number): void {
    const nose3 = NOSE[species];
    // Nose, mouth and whiskers go round the back of the head with the face.
    const shows = clamp01((forward + 0.35) / 0.25);
    set(nose, 'opacity', n(shows));
    set(mouth, 'opacity', n(shows));
    // A tabby's forehead "M": three short stripes between the ears.
    brow.forEach((line, i) => {
      const side = (i - 1) * 0.2;
      set(line, 'd', curve([head.at(onSphere(v3(0.62, 0.55, side), R)), head.at(onSphere(v3(0.38, 0.85, side * 0.9), R)), head.at(onSphere(v3(0.05, 1, side * 0.8), R))]));
    });
    // The nose bridge stripe (raccoon) runs between the eyes down to the nose.
    if (mask[2]) {
      const pts = [
        head.at(onSphere(v3(0.6, 0.55, 0.1), R)),
        head.at(v3(R * 1.0, -R * 0.08, R * 0.12)),
        head.at(v3(R * 1.38, -R * 0.22, 0)),
        head.at(v3(R * 1.0, -R * 0.08, -R * 0.12)),
        head.at(onSphere(v3(0.6, 0.55, -0.1), R)),
      ];
      set(mask[2], 'd', curve(pts, true, 0.7));
      set(mask[2], 'opacity', n(shows));
    }
    const tipF = R * nose3.f;
    const tipU = R * nose3.u;
    const nw = R * nose3.w;
    const nl = head.at(v3(tipF - nw * 0.4, tipU + nw * 0.35, nw));
    const nr = head.at(v3(tipF - nw * 0.4, tipU + nw * 0.35, -nw));
    const nb = head.at(v3(tipF - nw * 0.2, tipU - nw * 0.8, 0));
    const nt = head.at(v3(tipF + (cat ? 0 : nw * 0.3), tipU + nw * 0.25, 0));
    set(nose, 'd', curve([nl, nt, nr, nb], true, cat ? 0.5 : fox ? 0.8 : 1));

    // Mouth: down from the nose, then curling out each side.
    const m0 = nb;
    const m1 = head.at(v3(tipF - R * 0.1, tipU - R * 0.24, 0));
    const ml = head.at(v3(tipF - R * 0.3, tipU - R * 0.3, R * 0.2));
    const mr = head.at(v3(tipF - R * 0.3, tipU - R * 0.3, -R * 0.2));
    const open = clamp01(pose.mouth);
    set(mouth, 'd', `M${fmt(m0)}L${fmt(m1)}M${fmt(ml)}Q${fmt(add(m1, { x: 0, y: 0.6 }))} ${fmt(m1)}Q${fmt(add(m1, { x: 0, y: 0.6 }))} ${fmt(mr)}`);
    if (open > 0.03) {
      const top = head.at(v3(tipF - R * 0.25, tipU - R * 0.32, 0));
      const jaw = head.at(v3(tipF - R * 0.35, tipU - R * 0.32 - R * 0.75 * open, 0));
      const back = head.at(v3(tipF - R * 0.75, tipU - R * 0.42 - R * 0.2 * open, R * 0.15));
      const front = head.at(v3(tipF - R * 0.05, tipU - R * 0.36 - R * 0.35 * open, 0));
      set(mouthOpen, 'd', curve([top, front, jaw, back], true, 0.8));
      set(mouthOpen, 'display', 'inline');
    } else {
      set(mouthOpen, 'display', 'none');
    }
    const tg = clamp01(pose.tongue);
    if (tg > 0.03) {
      const base = head.at(v3(tipF - R * 0.35, tipU - R * 0.42 - R * 0.4 * open, 0));
      const tip = head.at(v3(tipF + R * 0.05 * tg, tipU - R * 0.42 - R * 0.55 * open - R * 0.12 * tg, 0));
      set(tongue, 'd', tube([base, mixPt(base, tip, 0.5), tip], [R * 0.13, R * 0.15, R * 0.12]));
      set(tongue, 'display', 'inline');
    } else {
      set(tongue, 'display', 'none');
    }

    // Whiskers fan out from the muzzle; only the near ones show in profile.
    whiskers.forEach((whisker, i) => {
      const side = i < 3 ? 1 : -1;
      const row = i % 3;
      const root = v3(tipF - R * 0.28, tipU - R * 0.18 - row * R * 0.05, side * R * 0.24);
      const dirV = v3(0.35, 0.18 - row * 0.2, side * 1);
      const lenW = R * nose3.whiskers * (1 - row * 0.1);
      const a = head.at(root);
      const b = head.at(v3(root.f + dirV.f * lenW, root.u + dirV.u * lenW, root.s + dirV.s * lenW));
      const facing = head.vec(v3(0, 0, side)).z;
      const mid = add(mixPt(a, b, 0.5), { x: 0, y: 0.25 });
      set(whisker, 'd', `M${fmt(a)}Q${fmt(mid)} ${fmt(b)}`);
      set(whisker, 'opacity', n(clamp01(0.4 + facing) * shows));
    });
  }

  /**
   * The water round a swimmer: the pool and its rings, the wake, the bright line where the
   * water meets its fur, and the mask that shows what's under the surface through the
   * water. Out of the water (held up, peeking) there's none of it.
   */
  function drawWater(shown: Shown, frame: Frame, wet: boolean): void {
    if (!water || !surface || !waterline || !bow) return;
    set(water.group, 'display', wet ? 'inline' : 'none');
    set(surface, 'display', wet ? 'inline' : 'none');
    set(figure, 'mask', wet ? `url(#${id}-sea)` : 'none');
    if (!wet) return;
    const { pose, view, clock, drift } = shown;
    const mid = (pose.px + pose.sx) / 2;
    const half = Math.max(8, frame.length / 2);
    const across = build.stance.hip * 2;
    const onWater = (a: number, z: number, halfA: number, halfZ: number): Ellipse =>
      ellipseOf(view.at(a, 0, z), [view.vec(halfA, 0, 0, a), view.vec(0, 0, halfZ, a)]);
    // The near half of a ring on the water round something breaking the surface: the far
    // half is behind it.
    const ring = (a: number, z: number, r: number) => {
      const centre = view.towards(a, z);
      const pts: Point[] = [];
      let best: Point[] = [];
      for (let k = 0; k <= 24; k++) {
        const th = (Math.PI * 2 * k) / 24;
        const x = a + Math.cos(th) * r;
        const zz = z + Math.sin(th) * r;
        if (view.towards(x, zz) > centre - r * 0.15) {
          pts.push(view.at(x, 0, zz));
          if (pts.length > best.length) best = pts.slice();
        } else {
          pts.length = 0;
        }
      }
      return best.length > 1 ? curve(best) : '';
    };
    const place = (el: SVGElement, e: Ellipse, dx = 0, dy = 0) => {
      set(el, 'cx', n(e.cx + dx));
      set(el, 'cy', n(e.cy + dy));
      set(el, 'rx', n(e.rx));
      set(el, 'ry', n(e.ry));
      set(el, 'transform', `rotate(${n(e.angle)} ${n(e.cx + dx)} ${n(e.cy + dy)})`);
    };
    place(water.pool, onWater(mid, 0, half + 16, across + 12));

    // Rings spread out from where he was a moment ago, and fade as they go.
    const speed = Math.hypot(drift.x, drift.y);
    const period = 2.8;
    water.ripples.forEach((ring, i) => {
      const age = (clock / 1000 / period + i / water.ripples.length) % 1;
      const grow = age * period * 7;
      const e = onWater(mid, 0, half + 3 + grow, across + 1 + grow);
      place(ring, e, -drift.x * age * period, -drift.y * age * period * DEPTH);
      // Left far behind at speed, they're lost in his wake.
      const behind = clamp01(1 - (age * period * speed) / 90);
      set(ring, 'opacity', n(0.75 * (1 - age) ** 1.5 * clamp01(age * 6) * behind));
    });

    // The wake: a V spreading back from his chest at the angle every wake keeps.
    const moving = clamp01((speed - 8) / 40);
    if (moving > 0) {
      const at = pose.sx + 6;
      const length = Math.min(46, 10 + speed * 0.1);
      const spread = 0.36;
      const arm = (side: number) => {
        const bend = view.at(at - length * 0.5, 0, side * length * 0.5 * spread * 0.85);
        const end = view.at(at - length, 0, side * length * spread);
        return `M${fmt(view.at(at, 0, side * 2))}Q${fmt(bend)} ${fmt(end)}`;
      };
      set(water.wake, 'd', arm(1) + arm(-1));
      set(water.wake, 'opacity', n(moving * 0.9));
      // A ripple of water pushed up in front of his chest.
      const front = [-1, -0.5, 0, 0.5, 1].map((k) => view.at(at + 1.5 - Math.abs(k) * 2.5, 0, k * (across * 0.5 + 1.5)));
      set(bow, 'd', curve(front));
      set(bow, 'opacity', n(moving));
    } else {
      set(water.wake, 'd', '');
      set(bow, 'd', '');
    }

    // What shows above the water: the body's slices cut at the surface, and the head, neck,
    // legs and tail wherever they're out of it.
    let above = '';
    let line = '';
    const shape = (pts: Point[]) => {
      if (pts.length < 3) return;
      above += `M${clockwise(pts).map(fmt).join('L')}Z`;
    };
    const sections = torso ? withCaps(torso.sections, torso.rearCap, torso.frontCap) : [];
    let previous: Point[] | null = null;
    let shore: Point[] = [];
    const flushShore = () => {
      if (shore.length > 1) line += curve(shore);
      shore = [];
    };
    for (const sec of sections) {
      const arc = aboveWater(sec, view);
      if (arc) {
        shape(arc.pts);
        if (previous) shape([...previous, ...arc.pts.slice().reverse()]);
        if (arc.shore) shore.push(arc.shore);
        else flushShore();
      } else {
        flushShore();
      }
      previous = arc ? arc.pts : null;
    }
    flushShore();

    // Limbs: stretches out of the water, and a little ring where each one breaks the surface.
    const limb = (chain: Point3[], radii: number[], ring: ((a: number, z: number, r: number) => string) | null) => {
      for (let i = 0; i < chain.length - 1; i++) {
        let a = chain[i]!;
        let b = chain[i + 1]!;
        const ra = radii[i]!;
        const rb = radii[i + 1]!;
        if (a.y >= 0 && b.y >= 0) continue;
        if (a.y >= 0 || b.y >= 0) {
          const k = a.y / (a.y - b.y);
          const cross = { x: lerp(a.x, b.x, k), y: 0, z: lerp(a.z, b.z, k) };
          if (ring) line += ring(cross.x, cross.z, lerp(ra, rb, k) + 0.5);
          if (a.y >= 0) a = cross;
          else b = cross;
        }
        const pa = view.at(a.x, a.y, a.z);
        const pb = view.at(b.x, b.y, b.z);
        const along = unit(sub(pb, pa));
        const side = (r: number) => ({ x: -along.y * r, y: along.x * r });
        shape([add(pa, side(ra)), add(pb, side(rb)), sub(pb, side(rb)), sub(pa, side(ra))]);
        shape(disc(pb, rb));
        if (i === 0 || chain[i]!.y < 0) shape(disc(pa, ra));
      }
    };
    for (const leg of LEGS) {
      const j = legJoints(build, pose, leg);
      const [w0, w1, w2, w3] = limbWidths(leg, view.local(j.root.x));
      const [pl, ph] = leg.startsWith('front') ? build.pawFront : build.pawBack;
      limb(
        [
          { ...j.root, z: j.z.root },
          { ...j.mid, z: j.z.mid },
          { ...j.low, z: j.z.low },
          { ...j.paw, z: j.z.paw },
        ],
        [w0, w1, w2, Math.max(w3, (pl + ph) / 2)],
        ring,
      );
    }
    const neckBase = bodyAt(frame, pose, frame.length - 0.5, -0.5);
    const headAt = { x: pose.hx, y: pose.hy, z: shown.head.z };
    const r0 = NECK[species];
    limb([{ ...neckBase, z: 0 }, { x: lerp(neckBase.x, headAt.x, 0.5), y: lerp(neckBase.y, headAt.y, 0.5), z: headAt.z * 0.6 }, headAt], [r0, r0 * 0.9, R * 0.75], null);
    limb(shown.tail, tailRadii(shown.tail.length, pose), ring);

    // The head, with its ears and muzzle: whatever of a ball round it is above the water.
    const ball: Point[] = [];
    const reach = R * 1.35;
    for (let i = 0; i <= 8; i++) {
      const lat = -Math.PI / 2 + (Math.PI * i) / 8;
      for (let k = 0; k < 12; k++) {
        const lon = (Math.PI * 2 * k) / 12;
        const y = headAt.y - Math.sin(lat) * reach;
        if (y >= 0) continue;
        ball.push(view.at(headAt.x + Math.cos(lat) * Math.cos(lon) * reach, y, headAt.z + Math.cos(lat) * Math.sin(lon) * reach));
      }
    }
    if (Math.abs(headAt.y) < reach) {
      const rho = Math.sqrt(reach * reach - headAt.y * headAt.y);
      for (let k = 0; k < 16; k++) {
        const lon = (Math.PI * 2 * k) / 16;
        ball.push(view.at(headAt.x + Math.cos(lon) * rho, 0, headAt.z + Math.sin(lon) * rho));
      }
      // Where the chin is in the water, a ring round it.
      const chin = R * 0.75;
      if (headAt.y > -chin) line += ring(headAt.x + R * 0.3, headAt.z, Math.sqrt(chin * chin - headAt.y * headAt.y) + 0.5);
    }
    if (ball.length > 2) shape(hull(ball));

    set(water.above, 'd', above);
    set(waterline, 'd', line);
  }

  return { svg, figure, draw };
}

/** A body slice's ring, where it's out of the water, on screen, and its waterline on the side nearer you. */
function aboveWater(s: Section, view: BodyView): { pts: Point[]; shore: Point | null } | null {
  // Height of the ring at angle th round it is s.p.y + k cos(th); out of the water above 0.
  const k = s.up.y * s.hh;
  let lo = -Math.PI;
  let hi = Math.PI;
  let cut = false;
  if (Math.abs(k) < 1e-6) {
    if (s.p.y >= 0) return null;
  } else {
    const c = -s.p.y / k;
    if (k < 0) {
      if (c >= 1) return null;
      if (c > -1) {
        hi = Math.acos(c);
        lo = -hi;
        cut = true;
      }
    } else {
      if (c <= -1) return null;
      if (c < 1) {
        lo = Math.acos(c);
        hi = Math.PI * 2 - lo;
        cut = true;
      }
    }
  }
  const on = (th: number) => view.pt(add(s.p, scale(s.up, s.hh * Math.cos(th))), s.w * Math.sin(th));
  // Through the points where the surface turns away from you, so the outline isn't cut short.
  const here = view.local(s.p.x);
  const edge = Math.atan2(-s.w * (s.up.x * here.s - s.up.y * DEPTH), s.hh * here.c);
  const angles: number[] = [];
  for (let i = 0; i <= 16; i++) angles.push(lerp(lo, hi, i / 16));
  for (const th of [edge, edge + Math.PI, edge - Math.PI, edge + Math.PI * 2]) if (th > lo && th < hi) angles.push(th);
  angles.sort((a, b) => a - b);
  const pts = angles.map(on);
  let shore: Point | null = null;
  if (cut) {
    const a = on(lo) as Point & { z: number };
    const b = on(hi) as Point & { z: number };
    shore = a.z > b.z ? a : b;
  }
  return { pts, shore };
}

/** The body's slices with rounded ends added at the rump and chest, for its outline in the water. */
function withCaps(sections: Section[], rearCap: number, frontCap: number): Section[] {
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const end = (s: Section, along: number, k: number): Section => {
    const f = Math.sqrt(Math.max(0, 1 - k * k));
    return { ...s, a: s.a + along * k, p: add(s.p, scale(s.t, along * k)), hh: s.hh * Math.max(0.15, f), w: s.w * Math.max(0.15, f) };
  };
  return [end(first, -rearCap, 0.95), end(first, -rearCap, 0.7), ...sections, end(last, frontCap, 0.7), end(last, frontCap, 0.95)];
}

/** A small round shape as a polygon. */
function disc(c: Point, r: number): Point[] {
  return Array.from({ length: 10 }, (_, i) => ({ x: c.x + Math.cos((i / 10) * Math.PI * 2) * r, y: c.y + Math.sin((i / 10) * Math.PI * 2) * r }));
}

/** A polygon wound clockwise on screen, so any number of them fill as one shape. */
function clockwise(pts: Point[]): Point[] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area < 0 ? pts.slice().reverse() : pts;
}


function normaliseV(v: V3): V3 {
  const l = Math.hypot(v.f, v.u, v.s) || 1;
  return { f: v.f / l, u: v.u / l, s: v.s / l };
}

/** Convex hull of points (monotone chain), anticlockwise on screen. */
function hull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const crossZ = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && crossZ(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function lerpV(a: V3, b: V3, t: number): V3 {
  return { f: lerp(a.f, b.f, t), u: lerp(a.u, b.u, t), s: lerp(a.s, b.s, t) };
}

type Triple = [number, number, number];

/** Neck thickness where it leaves the shoulders, units. */
const NECK: Record<Species, number> = { cat: 6.9, raccoon: 7.6, fox: 6.3, otter: 6.6 };
/** Height of the skull as a fraction of its length: an otter's is broad and flat. */
const SKULL: Record<Species, number> = { cat: 0.9, raccoon: 0.88, fox: 0.86, otter: 0.8 };

/**
 * The solid parts of each face, in head radii (forward, up, out to the side): cheeks
 * [f, u, s, rx, ry], then muzzle, snout and chin [f, u, rx, ry] on the middle line.
 */
const FACE: Record<Species, { cheek: [number, number, number, number, number]; muzzle: [number, number, number, number]; snout?: [number, number, number, number]; chin: [number, number, number, number] }> = {
  cat: { cheek: [0.12, -0.36, 0.5, 0.6, 0.52], muzzle: [0.74, -0.3, 0.4, 0.34], chin: [0.58, -0.56, 0.26, 0.2] },
  raccoon: { cheek: [-0.05, -0.3, 0.6, 0.66, 0.56], muzzle: [0.78, -0.36, 0.44, 0.38], snout: [1.22, -0.36, 0.26, 0.24], chin: [0.6, -0.6, 0.3, 0.22] },
  // A long, narrow snout, white along its underside.
  fox: { cheek: [0.08, -0.3, 0.5, 0.56, 0.48], muzzle: [0.82, -0.3, 0.42, 0.31], snout: [1.28, -0.36, 0.28, 0.2], chin: [0.95, -0.5, 0.42, 0.15] },
  // A broad, blunt muzzle with fat whisker pads, and a pale chin.
  otter: { cheek: [0.1, -0.3, 0.55, 0.62, 0.5], muzzle: [0.74, -0.3, 0.5, 0.36], chin: [0.58, -0.58, 0.36, 0.22] },
};

/** Cheek ruffs, in head radii (forward, up, out), for the near side. */
const RACCOON_RUFF: Triple[] = [
  [0.15, -0.05, 0.8],
  [-0.55, -0.35, 0.95],
  [-0.35, -0.55, 0.8],
  [-0.75, -0.62, 0.75],
  [-0.1, -0.75, 0.6],
];
const FOX_RUFF: Triple[] = [
  [0.42, -0.42, 0.56],
  [-0.2, -0.4, 0.8],
  [-0.62, -0.6, 0.74],
  [-0.32, -0.88, 0.56],
  [0.38, -0.74, 0.44],
];

/**
 * Ears, in head radii (forward, up, out) for the near one: where the base meets the skull
 * at the front and back, and where the tip goes upright, pricked and laid flat. `bulge`
 * rounds the back of the cone; `bow` (units) bows its sides; pointed ears are cut sharp.
 */
const EARS: Record<Species, { baseF: Triple; baseB: Triple; up: Triple; fwd: Triple; flat: Triple; bulge: number; bow: number; pointed: boolean }> = {
  cat: { baseF: [0.32, 0.74, 0.4], baseB: [-0.4, 0.62, 0.66], up: [-0.02, 1.62, 0.7], fwd: [0.22, 1.55, 0.62], flat: [-0.75, 1, 1.25], bulge: 0.3, bow: 0.35, pointed: true },
  raccoon: { baseF: [0.12, 0.74, 0.5], baseB: [-0.55, 0.5, 0.68], up: [-0.25, 1.28, 0.8], fwd: [0, 1.26, 0.74], flat: [-0.75, 0.9, 1.1], bulge: 0.3, bow: 1.6, pointed: false },
  // Big and tall, always up.
  fox: { baseF: [0.3, 0.72, 0.36], baseB: [-0.48, 0.55, 0.72], up: [-0.1, 2.02, 0.8], fwd: [0.16, 1.96, 0.72], flat: [-0.95, 1.15, 1.4], bulge: 0.32, bow: 0.4, pointed: true },
  // Little round ones, low on the sides of the head.
  otter: { baseF: [-0.12, 0.52, 0.72], baseB: [-0.55, 0.3, 0.8], up: [-0.42, 0.86, 0.98], fwd: [-0.34, 0.86, 0.95], flat: [-0.62, 0.66, 1.02], bulge: 0.14, bow: 0.55, pointed: false },
};

/**
 * Eyes: direction from the centre of the skull and how deep they sit (fraction of the
 * radius), which way they face, how far they slant up at the outer corner (degrees), and
 * their size in head radii.
 */
const EYES: Record<Species, { at: Triple; depth: number; normal: Triple; slant: number; size: [number, number] }> = {
  cat: { at: [0.7, 0.12, 0.48], depth: 0.97, normal: [0.82, 0.1, 0.56], slant: -10, size: [0.29, 0.26] },
  raccoon: { at: [0.66, 0.16, 0.5], depth: 0.98, normal: [0.78, 0.14, 0.6], slant: 0, size: [0.21, 0.2] },
  fox: { at: [0.74, 0.2, 0.42], depth: 0.97, normal: [0.86, 0.18, 0.48], slant: -16, size: [0.26, 0.2] },
  // Small, dark and set high, to see out of the water while the rest of it is under.
  otter: { at: [0.64, 0.36, 0.45], depth: 0.98, normal: [0.72, 0.4, 0.56], slant: 0, size: [0.165, 0.16] },
};

/** The nose: how far forward and up its tip is and its half width, in head radii; and whisker length. */
const NOSE: Record<Species, { f: number; u: number; w: number; whiskers: number }> = {
  cat: { f: 1.06, u: -0.14, w: 0.15, whiskers: 1.2 },
  raccoon: { f: 1.5, u: -0.3, w: 0.17, whiskers: 0.9 },
  fox: { f: 1.54, u: -0.34, w: 0.13, whiskers: 0.8 },
  otter: { f: 1.16, u: -0.12, w: 0.21, whiskers: 1.2 },
};

interface TorsoSpec {
  rear: [number, number];
  front: [number, number];
  /** Along the top, rear to front: [along, height above the spine]. */
  top: [number, number][];
  /** Along the bottom, front to rear: [along, depth below the spine]. */
  bottom: [number, number][];
  /** How much of the underside is pale, by position along. */
  bellyDepth: (a: number) => number;
}

const TORSO: Record<Species, (L: number, pose: Pose, upright: number) => TorsoSpec> = {
  cat: (L, pose) => {
    const br = pose.breath;
    const puff = pose.puff * 1.5;
    return {
      // The rump rounds off and runs smoothly down into the root of the tail.
      rear: [-12.4, 0.2],
      front: [L + 6.6, -2.2],
      top: [
        [-10.4, 2.6 + puff * 0.5],
        [-8, 4.5 + puff],
        [-4.5, 6.5 + puff],
        [2.5, 7.1 + puff],
        [L * 0.33, 6.5 + puff],
        [L * 0.6, 6.4 + puff],
        [L - 2.5, 7.1 + pose.scapN * 2 + puff],
        [L + 2.5, 6 + puff * 0.5],
      ],
      bottom: [
        [L + 4.8, 6.8 + br * 0.5],
        [L + 0.5, 9.6 + br],
        [L * 0.68, 10.1 + br * 0.6 + puff * 0.5],
        [L * 0.38, 9.2 + puff * 0.5],
        [L * 0.12, 8.8],
        [-3.5, 7.6],
        [-7.6, 5.6],
        [-10.4, 1.4],
      ],
      bellyDepth: (a) => (a > L * 0.5 ? 2.2 : 1.4),
    };
  },
  raccoon: (L, pose, upright) => {
    const br = pose.breath;
    const puff = pose.puff * 2;
    const hump = 1 - 0.35 * upright;
    return {
      rear: [-10.5, 1.5],
      front: [L + 6, -2],
      top: [
        [-8.5, 7 * hump + puff],
        [-4.5, 10 * hump + puff],
        [1.5, 11.2 * hump + puff],
        [L * 0.3, 10.5 * hump + puff],
        [L * 0.58, 9 * hump + puff],
        [L - 2, 8 * hump + puff],
        [L + 2.5, 6.6 + puff * 0.5],
      ],
      bottom: [
        [L + 4.5, 6.5 + br * 0.5],
        [L + 0.5, 9.4 + br + upright * 1.5],
        [L * 0.68, 11 + br * 0.6 + upright * 2],
        [L * 0.38, 11.4 + upright * 2],
        [L * 0.1, 10.4 + upright],
        [-4, 8.6],
        [-8.5, 5.6],
      ],
      bellyDepth: () => 2.4,
    };
  },
  // A fox: a deep chest and a tucked-up waist, slimmer than a cat.
  fox: (L, pose) => {
    const br = pose.breath;
    const puff = pose.puff * 1.5;
    return {
      rear: [-12.6, 0.4],
      front: [L + 7, -2.4],
      top: [
        [-10.6, 2.8 + puff * 0.5],
        [-8, 4.6 + puff],
        [-4.5, 6.2 + puff],
        [2.5, 6.6 + puff],
        [L * 0.35, 6 + puff],
        [L * 0.62, 6.2 + puff],
        [L - 2.5, 7.2 + pose.scapN * 2 + puff],
        [L + 2.5, 6.2 + puff * 0.5],
      ],
      bottom: [
        [L + 5, 7.2 + br * 0.5],
        [L + 0.5, 10.4 + br],
        [L * 0.7, 10.2 + br * 0.6 + puff * 0.5],
        [L * 0.42, 8.2 + puff * 0.5],
        [L * 0.15, 7.4],
        [-3.5, 7.2],
        [-7.6, 5.4],
        [-10.4, 1.4],
      ],
      bellyDepth: () => 1.8,
    };
  },
  // An otter: a long, even tube, round at the rump and running smoothly into the neck.
  otter: (L, pose) => {
    const br = pose.breath;
    const puff = pose.puff * 1.2;
    return {
      rear: [-13, 0.4],
      front: [L + 6.5, -0.6],
      top: [
        [-11, 3.4 + puff * 0.5],
        [-7, 5.2 + puff],
        [-1, 6.1 + puff],
        [L * 0.4, 6.4 + puff],
        [L * 0.75, 6.1 + puff],
        [L - 0.5, 5.8 + puff],
        [L + 3, 5.3 + puff * 0.5],
      ],
      bottom: [
        [L + 4.5, 4.8 + br * 0.4],
        [L + 0.5, 6 + br * 0.8],
        [L * 0.65, 6.6 + br * 0.6],
        [L * 0.3, 6.5 + br * 0.3],
        [-1, 6],
        [-7, 4.8],
        [-11, 2.6],
      ],
      bellyDepth: () => 2,
    };
  },
};

/** A smooth curve through [along, value] points (Catmull-Rom), held level past either end. */
function profile(points: [number, number][], a: number): number {
  const last = points.length - 1;
  if (a <= points[0]![0]) return points[0]![1];
  if (a >= points[last]![0]) return points[last]![1];
  let i = 0;
  while (i < last - 1 && a > points[i + 1]![0]) i++;
  const [a0, v0] = points[i]!;
  const [a1, v1] = points[i + 1]!;
  const span = a1 - a0 || 1;
  const slope = (j: number) => {
    const [pa, pv] = points[Math.max(0, j - 1)]!;
    const [na, nv] = points[Math.min(last, j + 1)]!;
    return (nv - pv) / (na - pa || 1);
  };
  const t = (a - a0) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  const m0 = slope(i) * span;
  const m1 = slope(i + 1) * span;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
}
