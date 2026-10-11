import type { Point } from '../../core/geometry';
import type { LegName } from './pose';
import { n, svgWriter } from '../svg';
import type { Build } from './build';
import { HeadView, onDisc, onSphere, v3, type Disc, type V3 } from './head';
import { add, clamp, clamp01, curve, fmt, lerp, mixPt, scale, sub, tube, unit } from './kit';
import type { Point3, Shown } from './motion';
import { LEGS, type Pose } from './pose';
import { bodyAt, legJoints, spineFrame, type Frame } from './rig';
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
  const figure = make('g', { class: 'raccoon-figure' }, svg);

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

  // Tail, with the raccoon's rings clipped to it.
  const tailGroup = make('g', {}, tailBack.fill);
  const tailPath = make('path', { id: `${id}-tailpath`, class: 'k-p k-tailfur' }, tailGroup);
  const tailClip = make('clipPath', { id: `${id}-tailclip` }, defs);
  make('use', { href: `#${id}-tailpath` }, tailClip);
  const rings = make('g', { 'clip-path': `url(#${id}-tailclip)`, class: 'k-rings' }, tailGroup);
  // Raccoons have four broad dark rings and a dark tip; a tabby cat has faint thin ones.
  const raccoon = build.species === 'raccoon';
  const ringCount = raccoon ? 4 : 6;
  const ringPaths = Array.from({ length: ringCount }, () => make('path', { class: raccoon ? 'k-ring' : 'k-stripe' }, rings));
  const tailTip = raccoon ? make('circle', { class: 'k-ringfill' }, rings) : null;

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
  for (const leg of LEGS) legs[leg] = makeLeg();

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
  const stripes = raccoon ? [] : [0, 1, 2, 3, 4, 5].map(() => make('path', { class: 'k-stripe' }, markings));
  // A paler chest.
  const belly = make('path', { class: 'k-p k-bellyfur' }, markings);

  // Head and neck move as one, in front of the body or behind it.
  const headUnit = make('g', {}, main.fill);
  const neck = make('path', { class: 'k-p k-fur' }, headUnit);
  const headParts = make('g', {}, headUnit);
  const farEar = make('path', { class: 'k-p k-earfur' }, headParts);
  const skull = make('ellipse', { class: 'k-p k-headfur' }, headParts);
  const cheeks = [0, 1].map(() => make('ellipse', { class: 'k-p k-headfur' }, headParts));
  const ruffs = raccoon ? [0, 1].map(() => make('path', { class: 'k-p k-cheekfur' }, headParts)) : [];
  const muzzle = make('ellipse', { class: 'k-p k-muzzlefur' }, headParts);
  const snout = raccoon ? make('ellipse', { class: 'k-p k-muzzlefur' }, headParts) : null;
  const chin = make('ellipse', { class: 'k-p k-muzzlefur' }, headParts);
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
  const brow = raccoon ? [] : [0, 1, 2].map(() => make('path', { class: 'k-stripe k-fine' }, eyeLayer));
  const nose = make('path', { class: 'k-nose' }, face);
  const mouth = make('path', { class: 'k-mouthline' }, face);
  const mouthOpen = make('path', { class: 'k-mouth' }, face);
  const tongue = make('path', { class: 'k-tongue' }, face);
  const whiskers = [0, 1, 2, 3, 4, 5].map(() => make('path', { class: 'k-whisker' }, face));

  const R = build.head.r;
  let muzzleBehind = false;

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

    drawShadow(pose, view, flags.noShadow);
    drawTorso(frame, pose, view);
    const legDepth = {} as Record<LegName, number>;
    for (const leg of LEGS) legDepth[leg] = drawLeg(leg, pose, view, frame);
    const head = new HeadView(view.at(pose.hx, pose.hy, shown.head.z), pose.hpitch, shown.head.yaw, pose.hroll, HEAD_TILT);
    drawNeck(frame, pose, view, head, shown);
    drawHead(head, pose);
    drawTail(shown.tail, pose, view);

    // Who's in front of whom, from how far towards you each part stands on the floor.
    const bodyDepth = view.towards((pose.px + pose.sx) / 2);
    const headDepth = view.towards(pose.hx, shown.head.z);
    const headBehind = headDepth < bodyDepth - 4;
    const placed: { el: SVGElement; layer: Layer; depth: number }[] = [];
    for (const leg of LEGS) {
      const depth = legDepth[leg];
      const ahead = depth > bodyDepth;
      const raised = flags.pawUp && leg.startsWith('front') && depth > bodyDepth - 0.5;
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

    const tailDepth = shown.tail.slice(2).reduce((sum, p) => sum + view.towards(p.x, p.z), 0) / Math.max(1, shown.tail.length - 2);
    const tailHome = flags.tailFront || tailDepth > bodyDepth + 4 ? front.fill : tailBack.fill;
    if (tailGroup.parentNode !== tailHome) tailHome.insertBefore(tailGroup, tailHome.firstChild);

    drawContours(pose, view, frame, placed);
  }

  /** Puts each part in its layer, farthest first, touching the page only when something moves. */
  function arrange(placed: { el: SVGElement; layer: Layer; depth: number }[]): void {
    for (const layer of ['far', 'main', 'front'] as const) {
      const parent = layers[layer];
      const wanted = placed.filter((p) => p.layer === layer).sort((a, b) => a.depth - b.depth);
      // The body stays first in the main layer; a wrapped tail stays first in front.
      const fixed = layer === 'main' ? 1 : layer === 'front' && tailGroup.parentNode === parent ? 1 : 0;
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

  function drawTail(points: Point3[], pose: Pose, view: BodyView): void {
    const { tail } = build;
    const count = points.length;
    const pts = points.map((p) => view.at(p.x, p.y, p.z));
    const puff = 1 + pose.puff * (raccoon ? 0.4 : 1.1);
    const radii = points.map((_, i) => {
      const t = i / (count - 1);
      // Cats' tails are even; raccoons' are bushy, fullest a third of the way along.
      const base = raccoon ? lerp(tail.base * 0.75, tail.tip, t) + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 2 : lerp(tail.base, tail.tip, t);
      return base * puff;
    });
    set(tailPath, 'd', tube(pts, radii));
    // Rings: dark bands across the tail at even spacing, and a dark tip.
    ringPaths.forEach((ring, r) => {
      const at = raccoon ? 0.22 + r * 0.18 : 0.2 + r * 0.13;
      const i = Math.min(count - 2, Math.floor(at * (count - 1)));
      const f = at * (count - 1) - i;
      const c = mixPt(pts[i]!, pts[i + 1]!, f);
      const along = unit(sub(pts[i + 1]!, pts[i]!));
      const across = { x: -along.y * 9, y: along.x * 9 };
      const back = scale(along, -0.6);
      set(ring, 'd', `M${fmt(add(add(c, across), back))}L${fmt(sub(add(c, back), across))}`);
      // A band round a tail pointing at you is seen edge-on: thinner, not a smear.
      const foreshortened = clamp(Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y) / tail.segment, 0.2, 1);
      set(ring, 'style', `stroke-width:${n((raccoon ? 3.4 : 1.7) * foreshortened)}px`);
    });
    if (tailTip) {
      const tip = pts[count - 1]!;
      set(tailTip, 'cx', n(tip.x));
      set(tailTip, 'cy', n(tip.y));
      set(tailTip, 'r', n(radii[count - 1]! * 1.05));
    }
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
    // Upper part starts inside the body: the shoulder blade or the top of the thigh.
    const top = view.pt(add(j.root, add(scale(frame.up, front ? 3.2 : 2.6), scale(frame.along, front ? -1.5 : 0.5))), j.z.root * 0.8);
    // Bend softly through each joint instead of kinking.
    set(parts.upper, 'd', tube([top, mixPt(root, mid, 0.35), mid], front ? [w0 * 0.8, w0, w1] : [w0 * 0.8, w0 * 0.98, w1]));
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
    const upright = clamp01((-Math.sin((frame.angle * Math.PI) / 180) - 0.5) / 0.4);
    const spec = TORSO[build.species](L, pose, upright);
    const tops = spec.top;
    const bottoms = spec.bottom.slice().reverse();
    const girth = build.stance.girth * (1 + pose.puff * 0.15);
    const sectionAt = (a: number): Section => {
      const top = profile(tops, a);
      const bottom = profile(bottoms, a);
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

    // Darker fur along the back: a smaller solid along the top, inside the body.
    const ridge = sections.map((s) => ({ ...s, p: add(s.p, scale(s.up, s.hh * 0.66)), hh: s.hh * 0.42, w: s.w * 0.7 }));
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
    const bibLocal = add(chest.p, add(scale(chest.t, frontCap * 0.3), scale(chest.up, -chest.hh * 0.42)));
    const at = chest.p.x;
    const bib = ellipseOf(view.pt(bibLocal), [
      view.vec(chest.t.x * frontCap * 1.1, chest.t.y * frontCap * 1.1, 0, at),
      view.vec(chest.up.x * chest.hh * 0.72, chest.up.y * chest.hh * 0.72, 0, at),
      view.vec(0, 0, chest.w * 0.8, at),
    ]);
    const towardsYou = view.local(at).facing(chest.t.x * 0.85 - chest.up.x * 0.5, chest.t.y * 0.85 - chest.up.y * 0.5, 0);
    set(belly, 'd', ellipsePath(bib));
    set(belly, 'opacity', n(clamp01((towardsYou + 0.5) / 0.3)));
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
    const r0 = raccoon ? 7.6 : 6.9;
    // Turned, the skin of the neck twists: it narrows a touch and folds on the inside of the turn.
    const turn = (shown.head.yaw - (view.yawAt(frame.s.x) * 180) / Math.PI) * (Math.PI / 180);
    const twist = Math.abs(Math.sin(turn));
    set(neck, 'd', tube([base, add(middle, lift), join], [r0, r0 * (0.86 - 0.06 * twist), R * 0.6]));
    if (twist > 0.3 && !raccoon) {
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
        const top = add(j.root, add(scale(frame.up, hind ? 2.6 : 3.2), scale(frame.along, hind ? 0.5 : -1.5)));
        const down = hind ? 0.3 : 0.4;
        const spine = [
          view.pt(top, j.z.root * 0.8),
          view.pt(mixPt(j.root, j.mid, 0.35), lerp(j.z.root, j.z.mid, 0.35)),
          view.pt(j.mid, j.z.mid),
          view.pt(mixPt(j.mid, j.low, down), lerp(j.z.mid, j.z.low, down)),
        ];
        const radii = hind ? [w0 * 0.8, w0 * 0.98, w1, w1 * 1.04] : [w0 * 0.8, w0, w1, w1 * 1.02];
        const nearer = where(other).layer !== 'main' || here.depth >= where(other).depth;
        if (nearer && sideOn > 0.02) {
          set(lines.along, 'd', edge(spine, radii, hind ? towardsBody : scale(towardsBody, -1), hind ? 0.45 : 0.55));
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
    return curve(out);
  }
  function drawHead(head: HeadView, pose: Pose): void {
    const c = head.centre;
    const roll = pose.hroll;
    set(skull, 'cx', n(c.x));
    set(skull, 'cy', n(c.y));
    set(skull, 'rx', n(R));
    set(skull, 'ry', n(R * (build.species === 'raccoon' ? 0.88 : 0.9)));
    set(skull, 'transform', `rotate(${n(roll)} ${n(c.x)} ${n(c.y)})`);
    const blob = (el: SVGElement, at: V3, r: number, ry = r) => {
      const p = head.at(at);
      set(el, 'cx', n(p.x));
      set(el, 'cy', n(p.y));
      set(el, 'rx', n(r));
      set(el, 'ry', n(ry));
      set(el, 'transform', `rotate(${n(roll)} ${n(p.x)} ${n(p.y)})`);
    };
    if (build.species === 'cat') {
      blob(cheeks[0]!, v3(R * 0.12, -R * 0.36, R * 0.5), R * 0.6, R * 0.52);
      blob(cheeks[1]!, v3(R * 0.12, -R * 0.36, -R * 0.5), R * 0.6, R * 0.52);
      blob(muzzle, v3(R * 0.74, -R * 0.3, 0), R * 0.4, R * 0.34);
      blob(chin, v3(R * 0.58, -R * 0.56, 0), R * 0.26, R * 0.2);
    } else {
      blob(cheeks[0]!, v3(-R * 0.05, -R * 0.3, R * 0.6), R * 0.66, R * 0.56);
      blob(cheeks[1]!, v3(-R * 0.05, -R * 0.3, -R * 0.6), R * 0.66, R * 0.56);
      blob(muzzle, v3(R * 0.78, -R * 0.36, 0), R * 0.44, R * 0.38);
      if (snout) blob(snout, v3(R * 1.22, -R * 0.36, 0), R * 0.26, R * 0.24);
      blob(chin, v3(R * 0.6, -R * 0.6, 0), R * 0.3, R * 0.22);
      // Fluffy cheek ruffs that stick out behind the jaw.
      ruffs.forEach((ruff, i) => {
        const side = i === 0 ? 1 : -1;
        const pts = [
          head.at(v3(R * 0.15, -R * 0.05, side * R * 0.8)),
          head.at(v3(-R * 0.55, -R * 0.35, side * R * 0.95)),
          head.at(v3(-R * 0.35, -R * 0.55, side * R * 0.8)),
          head.at(v3(-R * 0.75, -R * 0.62, side * R * 0.75)),
          head.at(v3(-R * 0.1, -R * 0.75, side * R * 0.6)),
        ];
        set(ruff, 'd', curve(pts, true, 0.6));
        // Pale cheek fur belongs to the face: from behind it would stick out like tusks.
        set(ruff, 'opacity', n(clamp01((head.vec(v3(1, 0, 0)).z + 0.55) / 0.3)));
      });
    }

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
    const cat = build.species === 'cat';
    const ear = (side: 1 | -1, amount: number) => {
      const s = side;
      // Base on the skull; the tip swings forward when pricked and out and back when flat.
      const baseF = cat ? v3(R * 0.32, R * 0.74, s * R * 0.4) : v3(R * 0.12, R * 0.74, s * R * 0.5);
      const baseB = cat ? v3(-R * 0.4, R * 0.62, s * R * 0.66) : v3(-R * 0.55, R * 0.5, s * R * 0.68);
      const up = cat ? v3(-R * 0.02, R * 1.62, s * R * 0.7) : v3(-R * 0.25, R * 1.28, s * R * 0.8);
      const fwd = cat ? v3(R * 0.22, R * 1.55, s * R * 0.62) : v3(R * 0.0, R * 1.26, s * R * 0.74);
      const flat = cat ? v3(-R * 0.75, R * 1.0, s * R * 1.25) : v3(-R * 0.75, R * 0.9, s * R * 1.1);
      const e = clamp(amount, -1, 1);
      const tip3 = e >= 0 ? lerpV(up, fwd, e) : lerpV(up, flat, -e);
      const f = head.at(baseF);
      const b = head.at(baseB);
      const t = head.at(tip3);
      // The ear is a cone, not a flat triangle: its back bulges out, so it never goes
      // paper-thin when seen edge-on. Outline = the hull of the projected cone.
      const baseMid = lerpV(baseF, baseB, 0.5);
      const out = normaliseV(v3(baseMid.f - R * 0.1, baseMid.u * 0.3, baseMid.s));
      const bulge = R * (cat ? 0.3 : 0.3);
      const back3 = v3(baseMid.f + out.f * bulge, baseMid.u + out.u * bulge, baseMid.s + out.s * bulge);
      const ring: V3[] = [baseF, lerpV(baseF, back3, 0.6), back3, lerpV(back3, baseB, 0.4), baseB];
      const pts: Point[] = [t];
      for (const base of ring) {
        pts.push(head.at(base));
        // Sides bow out a little on the way up to the tip.
        const m = lerpV(base, tip3, cat ? 0.55 : 0.5);
        const away = normaliseV(v3(m.f, m.u - R * 0.5, m.s));
        const bow = cat ? 0.35 : 1.6;
        pts.push(head.at(v3(m.f + away.f * bow, m.u + away.u * bow, m.s + away.s * bow)));
      }
      const outline = curve(hull(pts), true, cat ? 0.5 : 1.1);
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
    const cat = build.species === 'cat';
    const wide = Math.max(0, -pose.lids);
    const lids = Math.max(0, pose.lids);
    const happy = clamp01(pose.happy);
    eyes.forEach((eye, i) => {
      const side = i === 0 ? 1 : -1;
      const centre = cat ? onSphere(v3(0.7, 0.12, side * 0.48), R * 0.97) : onSphere(v3(0.66, 0.16, side * 0.5), R * 0.98);
      const normal = cat ? v3(0.82, 0.1, side * 0.56) : v3(0.78, 0.14, side * 0.6);
      // Cat eyes slant up at the outer corner.
      const disc = head.disc(centre, normal, cat ? side * -10 : 0);
      if (!disc || disc.facing < 0.2) {
        set(eye.open, 'display', 'none');
        set(eye.shut, 'display', 'none');
        if (mask[i]) set(mask[i]!, 'display', 'none');
        if (brows[i]) set(brows[i]!, 'display', 'none');
        return;
      }
      // A far eye only just coming round the head fades in, rather than poking out as a blob.
      const fade = clamp01((disc.facing - 0.2) / 0.2);
      const rx = (cat ? R * 0.29 : R * 0.21) * (1 + wide * 0.18);
      const ry = (cat ? R * 0.26 : R * 0.2) * (1 + wide * 0.22);
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
      // Open eye: an almond (cats) or a round bead (raccoons), with the lids cutting it.
      const lidLine = (x: number) => -1 + 2 * (1 - open) + 0.35 * (1 - x * x) * (1 - open);
      const lowLine = (x: number) => 1 - 1.7 * happy * (1 - 0.35 * x * x);
      const pts: Point[] = [];
      const steps = 20;
      for (let s = 0; s < steps; s++) {
        const th = (s / steps) * Math.PI * 2;
        const x = Math.cos(th);
        let y = Math.sin(th) * (cat ? 1 - 0.16 * x * x : 1);
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
      const ir = cat ? 0.92 : 1.05;
      setEllipse(eye.iris, irisC, disc, rx * ir, ry * ir);
      const pupilC = onDisc(disc, look.x, look.y, rx, ry);
      const pw = cat ? lerp(0.16, 0.7, clamp01(pose.pupil)) : 0.7;
      const ph = cat ? 0.86 : 0.72;
      setEllipse(eye.pupil, pupilC, disc, rx * pw, ry * ph);
      const g = onDisc(disc, look.x * 0.5 + 0.3, look.y * 0.5 - 0.35, rx, ry);
      set(eye.glint, 'cx', n(g.x));
      set(eye.glint, 'cy', n(g.y));
      set(eye.glint, 'r', n(R * (cat ? 0.075 : 0.07) * (0.6 + 0.4 * disc.facing)));
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
    const cat = build.species === 'cat';
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
    if (!cat && mask[2]) {
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
    const tipF = cat ? R * 1.06 : R * 1.5;
    const tipU = cat ? -R * 0.14 : -R * 0.3;
    const nw = cat ? R * 0.15 : R * 0.17;
    const nl = head.at(v3(tipF - nw * 0.4, tipU + nw * 0.35, nw));
    const nr = head.at(v3(tipF - nw * 0.4, tipU + nw * 0.35, -nw));
    const nb = head.at(v3(tipF - nw * 0.2, tipU - nw * 0.8, 0));
    const nt = head.at(v3(tipF + (cat ? 0 : nw * 0.3), tipU + nw * 0.25, 0));
    set(nose, 'd', curve([nl, nt, nr, nb], true, cat ? 0.5 : 1));

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
      const lenW = (cat ? R * 1.2 : R * 0.9) * (1 - row * 0.1);
      const a = head.at(root);
      const b = head.at(v3(root.f + dirV.f * lenW, root.u + dirV.u * lenW, root.s + dirV.s * lenW));
      const facing = head.vec(v3(0, 0, side)).z;
      const mid = add(mixPt(a, b, 0.5), { x: 0, y: 0.25 });
      set(whisker, 'd', `M${fmt(a)}Q${fmt(mid)} ${fmt(b)}`);
      set(whisker, 'opacity', n(clamp01(0.4 + facing) * shows));
    });
  }


  return { svg, figure, draw };
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

const TORSO: Record<Build['species'], (L: number, pose: Pose, upright: number) => TorsoSpec> = {
  cat: (L, pose) => {
    const br = pose.breath;
    const puff = pose.puff * 1.5;
    return {
      rear: [-9.6, 0.5],
      front: [L + 6.6, -2.2],
      top: [
        [-7.6, 4.8 + puff],
        [-3.4, 6.9 + puff],
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
        [-7.4, 4.8],
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
