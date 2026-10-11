import type { Point } from '../../core/geometry';
import type { LegName } from '../rig';
import { n, svgWriter } from '../svg';
import type { Build } from './build';
import { HeadView, onDisc, onSphere, v3, type Disc, type V3 } from './head';
import { add, clamp, clamp01, curve, fmt, lerp, mixPt, scale, sub, tube, unit } from './kit';
import type { Shown } from './motion';
import { LEGS, type Pose } from './pose';
import { bodyAt, legJoints, spineFrame, type Frame } from './rig';

/**
 * Draws a lifelike animal from a pose. Every part is a smooth tapered shape; parts that
 * belong together (body, near legs, head) share one outline, drawn as a thick stroke
 * behind their fill, so they read as a single animal like an illustrator's drawing.
 * Colours and line weight come from CSS, which is how the art styles differ.
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
  toes: SVGElement | null;
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
  const { view } = build;
  const svg = make('svg', {
    class: `raccoon critter critter-${build.species} ${className}`,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': label,
  }) as SVGSVGElement;
  const defs = make('defs', {}, svg);
  const turn = make('g', {}, svg);
  const shadow = make('ellipse', { class: 'k-shadow', cx: 0, cy: 0, rx: 20, ry: 2.4 }, turn);
  const figure = make('g', { class: 'raccoon-figure' }, turn);

  const union = (name: string, parent: Element): Union => {
    const wrap = make('g', { class: `k-union c-${name}` }, parent);
    make('use', { href: `#${id}-${name}`, class: 'k-outline' }, wrap);
    const fill = make('g', { id: `${id}-${name}` }, wrap);
    return { wrap, fill };
  };

  const far = union('far', figure);
  const tailBack = union('tail', figure);
  const main = union('main', figure);
  const details = make('g', { class: 'k-details' }, figure);
  const face = make('g', { class: 'k-face' }, figure);
  const front = union('front', figure);

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
  const tailTip = build.species === 'raccoon' ? make('circle', { class: 'k-ringfill' }, rings) : null;

  const makeLeg = (leg: LegName, parent: Element): LegParts => {
    const farLeg = leg.endsWith('Far');
    const tone = farLeg ? 'k-p k-farfur' : 'k-p k-legfur';
    const group = make('g', {}, parent);
    // The upper leg is body fur; the lower leg and paw can be darker (raccoons) or white (socks).
    const upper = make('path', { class: `${farLeg ? 'k-p k-farfur' : 'k-p k-fur'} k-upper` }, group);
    const lower = make('path', { class: tone }, group);
    const foot = make('path', { class: `${tone} k-foot` }, group);
    const paw = make('path', { class: `${tone} k-paw` }, group);
    const toes = farLeg ? null : make('path', { class: 'k-toes' }, group);
    return { group, upper, lower, foot, paw, toes };
  };
  const legs = {} as Record<LegName, LegParts>;
  legs.backFar = makeLeg('backFar', far.fill);
  legs.frontFar = makeLeg('frontFar', far.fill);

  // Main body: torso, neck, near legs, head.
  const torso = make('path', { class: 'k-p k-fur' }, main.fill);
  const backFur = make('path', { class: 'k-p k-backfur' }, main.fill);
  const belly = make('path', { class: 'k-p k-bellyfur' }, main.fill);
  // Tabby stripes over the back and flank (transparent unless the coat has them).
  const stripes = raccoon ? [] : [0, 1, 2, 3, 4, 5].map(() => make('path', { class: 'k-stripe' }, main.fill));
  const neck = make('path', { class: 'k-p k-fur' }, main.fill);
  legs.backNear = makeLeg('backNear', main.fill);
  const headParts = make('g', {}, main.fill);
  legs.frontNear = makeLeg('frontNear', main.fill);
  const farEar = make('path', { class: 'k-p k-earfur' }, headParts);
  const skull = make('ellipse', { class: 'k-p k-headfur' }, headParts);
  const cheeks = [0, 1].map(() => make('ellipse', { class: 'k-p k-headfur' }, headParts));
  const ruffs = build.species === 'raccoon' ? [0, 1].map(() => make('path', { class: 'k-p k-cheekfur' }, headParts)) : [];
  const muzzle = make('ellipse', { class: 'k-p k-muzzlefur' }, headParts);
  const snout = build.species === 'raccoon' ? make('ellipse', { class: 'k-p k-muzzlefur' }, headParts) : null;
  const chin = make('ellipse', { class: 'k-p k-muzzlefur' }, headParts);
  const nearEar = make('path', { class: 'k-p k-earfur' }, headParts);
  const headClip = make('clipPath', { id: `${id}-headclip` }, defs);
  for (const part of [skull, ...cheeks, muzzle, ...(snout ? [snout] : []), chin]) {
    if (!part.id) part.id = `${id}-hp${headClip.childNodes.length}`;
    make('use', { href: `#${part.id}` }, headClip);
  }

  // Belly and chest markings, clipped to the torso.
  const torsoClip = make('clipPath', { id: `${id}-torsoclip` }, defs);
  const torsoClipPath = make('path', {}, torsoClip);
  const thighLine = make('path', { class: 'k-contour' }, details);
  const elbowLine = make('path', { class: 'k-contour' }, details);
  const neckLine = make('path', { class: 'k-contour k-soft' }, details);

  // Face. Eyes and markings are clipped to the head, so a far eye tucks behind the muzzle.
  const eyeLayer = make('g', { 'clip-path': `url(#${id}-headclip)` }, face);
  const farEarInner = make('path', { class: 'k-earinner' }, face);
  const nearEarInner = make('path', { class: 'k-earinner' }, face);
  const mask = build.species === 'raccoon' ? [0, 1, 2].map(() => make('path', { class: 'k-mask' }, eyeLayer)) : [];
  const brows = build.species === 'raccoon' ? [0, 1].map(() => make('path', { class: 'k-brow' }, eyeLayer)) : [];
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

  let tailInFront = false;
  let pawInFront = false;

  const R = build.head.r;

  function draw(shown: Shown): void {
    const { pose, flags, turn: tr } = shown;
    const frame0 = spineFrame(pose);
    const cx = (pose.px + pose.sx) / 2;
    const k = tr.squeeze;
    const sq = (p: Point): Point => ({ x: cx + (p.x - cx) * k, y: p.y });

    // Whole-figure transforms: mirroring for the side he faces, squash, carried rotation.
    set(turn, 'transform', tr.side < 0 ? 'scale(-1 1)' : '');
    const sx = 1 / Math.sqrt(pose.squash);
    const parts: string[] = [];
    if (pose.rot) parts.push(`rotate(${n(pose.rot)} ${n(pose.rotX)} ${n(pose.rotY)})`);
    if (Math.abs(pose.squash - 1) > 0.002) parts.push(`translate(${n(cx)} 0) scale(${n(sx)} ${n(pose.squash)}) translate(${n(-cx)} 0)`);
    set(figure, 'transform', parts.join(' '));

    // Layering that switches: tail wrapped in front, a paw raised in front of the face.
    if (flags.tailFront !== tailInFront) {
      tailInFront = flags.tailFront;
      (tailInFront ? front.fill : tailBack.fill).appendChild(tailGroup);
    }
    if (flags.pawUp !== pawInFront) {
      pawInFront = flags.pawUp;
      if (pawInFront) front.fill.insertBefore(legs.frontNear.group, front.fill.firstChild);
      else main.fill.insertBefore(legs.frontNear.group, headParts.nextSibling);
    }

    drawShadow(pose, flags.noShadow, sq);
    drawTail(shown.tail.map(sq), pose);
    for (const leg of LEGS) drawLeg(leg, pose, sq);
    drawTorso(frame0, pose, sq);
    const head = new HeadView(sq({ x: pose.hx, y: pose.hy }), pose.hpitch, pose.hyaw, pose.hroll);
    drawNeck(frame0, pose, sq, head);
    drawContours(pose, sq);
    drawHead(head, pose);
  }

  function drawShadow(pose: Pose, hidden: boolean, sq: (p: Point) => Point): void {
    const ys = LEGS.map((leg) => pose[leg === 'frontNear' ? 'fny' : leg === 'frontFar' ? 'ffy' : leg === 'backNear' ? 'bny' : 'bfy']);
    const lift = clamp01(-Math.max(...ys) / 16);
    set(shadow, 'display', hidden ? 'none' : 'inline');
    const left = sq({ x: Math.min(pose.px, pose.bnx) - 8, y: 0 });
    const right = sq({ x: Math.max(pose.sx, pose.fnx) + 6, y: 0 });
    set(shadow, 'cx', n((left.x + right.x) / 2));
    set(shadow, 'rx', n(Math.max(8, (right.x - left.x) / 2) * (1 - lift * 0.4)));
    set(shadow, 'opacity', n(1 - lift * 0.7));
  }

  function drawTail(points: Point[], pose: Pose): void {
    const { tail } = build;
    const count = points.length;
    const puff = 1 + pose.puff * (build.species === 'cat' ? 1.1 : 0.4);
    const radii = points.map((_, i) => {
      const t = i / (count - 1);
      // Cats' tails are even; raccoons' are bushy, fullest a third of the way along.
      const base = build.species === 'raccoon' ? lerp(tail.base * 0.75, tail.tip, t) + Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * 2 : lerp(tail.base, tail.tip, t);
      return base * puff;
    });
    set(tailPath, 'd', tube(points, radii));
    // Rings: dark bands across the tail at even spacing, and a dark tip.
    ringPaths.forEach((ring, r) => {
      const at = raccoon ? 0.22 + r * 0.18 : 0.2 + r * 0.13;
      const i = Math.min(count - 2, Math.floor(at * (count - 1)));
      const f = at * (count - 1) - i;
      const c = mixPt(points[i]!, points[i + 1]!, f);
      const along = unit(sub(points[i + 1]!, points[i]!));
      const across = { x: -along.y * 9, y: along.x * 9 };
      const back = scale(along, -0.6);
      set(ring, 'd', `M${fmt(add(add(c, across), back))}L${fmt(sub(add(c, back), across))}`);
    });
    if (tailTip) {
      const tip = points[count - 1]!;
      set(tailTip, 'cx', n(tip.x));
      set(tailTip, 'cy', n(tip.y));
      set(tailTip, 'r', n(radii[count - 1]! * 1.05));
    }
  }

  function drawLeg(leg: LegName, pose: Pose, sq: (p: Point) => Point): void {
    const parts = legs[leg];
    const j = legJoints(build, pose, leg);
    const front = leg.startsWith('front');
    const [w0, w1, w2, w3] = front ? build.frontWidth : build.backWidth;
    const frame = spineFrame(pose);
    const root = sq(j.root);
    const mid = sq(j.mid);
    const low = sq(j.low);
    const paw = sq(j.paw);
    // Upper part starts inside the body: the shoulder blade or the top of the thigh.
    const top = sq(add(j.root, add(scale(frame.up, front ? 3.2 : 2.6), scale(frame.along, front ? -1.5 : 0.5))));
    // Bend softly through each joint instead of kinking.
    const upperSpine = [top, mixPt(root, mid, 0.35), mid];
    set(parts.upper, 'd', tube(upperSpine, front ? [w0 * 0.8, w0, w1] : [w0 * 0.8, w0 * 0.98, w1]));
    const muscle = front ? [w1, w1 * 1.02, w2] : [w1, w1 * 1.05, w2];
    set(parts.lower, 'd', tube([mid, mixPt(mid, low, front ? 0.4 : 0.35), low], muscle));
    set(parts.foot, 'd', tube([low, paw], [w2, w3]));
    // The paw: toes point forward from the end of the foot, turning with it.
    const [pl, ph] = front ? build.pawFront : build.pawBack;
    const bone = unit(sub(j.paw, j.low));
    const toe = unit(sub(sq(add(j.paw, { x: bone.y, y: -bone.x })), paw));
    const up = { x: toe.y, y: -toe.x };
    const centre = add(paw, add(scale(toe, pl * 0.45), scale(up, ph * 0.95)));
    const heel = add(centre, scale(toe, -pl));
    const tip = add(centre, scale(toe, pl));
    const topP = add(centre, scale(up, ph));
    const bottom = add(centre, scale(up, -ph));
    set(parts.paw, 'd', curve([heel, mixPt(heel, topP, 0.6), topP, mixPt(topP, tip, 0.7), tip, mixPt(tip, bottom, 0.5), bottom], true));
    if (parts.toes) {
      // Two tiny toe lines on the near paws.
      const a = add(tip, add(scale(toe, -pl * 0.55), scale(up, ph * 0.1)));
      const b = add(tip, add(scale(toe, -pl * 0.2), scale(up, ph * 0.05)));
      set(parts.toes, 'd', `M${fmt(a)}l${n(up.x * -0.9)},${n(up.y * -0.9)}M${fmt(b)}l${n(up.x * -0.8)},${n(up.y * -0.8)}`);
    }
  }

  /** Body outline: a tube round the spine, fatter at the ribs and rump, round at both ends. */
  function drawTorso(frame: Frame, pose: Pose, sq: (p: Point) => Point): Point[] {
    const L = frame.length;
    // Upright (sitting up, standing on hind legs), a raccoon's hump straightens out.
    const upright = clamp01((-Math.sin((frame.angle * Math.PI) / 180) - 0.5) / 0.4);
    const spec = TORSO[build.species](L, pose, upright);
    const at = (a: number, b: number) => {
      // Squeeze the spine for turning but keep the rounded ends and the depth of the body.
      const inside = clamp(a, 0, L);
      const base = sq(bodyAt(frame, pose, inside, 0));
      const nextA = clamp(inside + 0.5, 0, L);
      const prevA = clamp(inside - 0.5, 0, L);
      const t = unit(sub(sq(bodyAt(frame, pose, nextA, 0)), sq(bodyAt(frame, pose, prevA, 0))));
      const nrm = { x: t.y, y: -t.x };
      return add(base, add(scale(t, a - inside), scale(nrm, b)));
    };
    const top = spec.top.map(([a, b]) => at(a, b));
    const bottom = spec.bottom.map(([a, b]) => at(a, -b));
    const outline = [at(spec.rear[0], spec.rear[1]), ...top, at(spec.front[0], spec.front[1]), ...bottom];
    const d = curve(outline, true);
    set(torso, 'd', d);
    set(torsoClipPath, 'd', d);
    // A paler chest: a bib from the throat down between the front legs.
    const bib = [at(L + 6.2, -1.5), at(L + 4.5, -6.5), at(L + 0.5, -9.4 - pose.breath), at(L - 4, -8.5), at(L - 1, -4), at(L + 3, 1)];
    set(belly, 'd', curve(bib, true));
    set(belly, 'clip-path', `url(#${id}-torsoclip)`);
    // Darker fur along the back.
    const ridge = spec.top.map(([a, b]) => at(a, b + 1));
    const inner = spec.top.slice().reverse().map(([a, b]) => at(a, b - 4.2));
    set(backFur, 'd', curve([...ridge, ...inner], true));
    set(backFur, 'clip-path', `url(#${id}-torsoclip)`);
    stripes.forEach((stripe, i) => {
      const a = L * (-0.18 + 0.22 * i);
      const depth = 6.2 + (i % 2) * 1.6;
      set(stripe, 'd', curve([at(a + 0.6, 9), at(a, 4), at(a - 1.2, 9 - depth - 1), at(a - 2.4, 9 - depth - 3.5)]));
      set(stripe, 'clip-path', `url(#${id}-torsoclip)`);
    });
    return outline;
  }

  function drawNeck(frame: Frame, pose: Pose, sq: (p: Point) => Point, head: HeadView): void {
    const L = frame.length;
    const base = sq(bodyAt(frame, pose, L - 0.5, -0.5));
    // The neck meets the skull behind and below its centre.
    const join = head.at(v3(-R * 0.25, -R * 0.35, 0));
    const middle = mixPt(base, join, 0.5);
    const lift = { x: 0, y: -1.2 };
    const r0 = build.species === 'raccoon' ? 7.6 : 6.9;
    set(neck, 'd', tube([base, add(middle, lift), join], [r0, r0 * 0.86, R * 0.6]));
    set(neckLine, 'd', '');
  }

  function drawContours(pose: Pose, sq: (p: Point) => Point): void {
    // The edge of the near thigh where it crosses the belly, and the back of the near elbow,
    // so the near legs read against the body in the same colour.
    const frame = spineFrame(pose);
    const back = legJoints(build, pose, 'backNear');
    const [w0, w1] = build.backWidth;
    const thighTop = add(back.root, add(scale(frame.up, 2.6), scale(frame.along, 0.5)));
    const towardBody = sub(frame.s, frame.p);
    set(thighLine, 'd', edge([thighTop, mixPt(back.root, back.mid, 0.35), back.mid, mixPt(back.mid, back.low, 0.3)], [w0 * 0.8, w0 * 0.98, w1, w1 * 1.04], towardBody, 0.45, sq));

    if (!pawInFront) {
      const fr = legJoints(build, pose, 'frontNear');
      const [f0, f1] = build.frontWidth;
      const shoulderTop = add(fr.root, add(scale(frame.up, 3.2), scale(frame.along, -1.5)));
      const awayFromBody = sub(frame.p, frame.s);
      const spine = [shoulderTop, mixPt(fr.root, fr.mid, 0.35), fr.mid, mixPt(fr.mid, fr.low, 0.4)];
      set(elbowLine, 'd', edge(spine, [f0 * 0.8, f0, f1, f1 * 1.02], awayFromBody, 0.55, sq));
    } else {
      set(elbowLine, 'd', '');
    }
  }

  /**
   * One edge of a limb, from `from` (0..1 of the way along) to its end: the side facing
   * `side`. Used for contour lines that sit exactly on the limb's outline.
   */
  function edge(spine: Point[], radii: number[], side: Point, from: number, sq: (p: Point) => Point): string {
    const pts = spine.map(sq);
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
      });
    }

    drawEars(head, pose);
    drawEyes(head, pose);
    drawMuzzleFeatures(head, pose);
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

  function drawMuzzleFeatures(head: HeadView, pose: Pose): void {
    const cat = build.species === 'cat';
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
      set(whisker, 'opacity', n(clamp01(0.4 + facing)));
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
