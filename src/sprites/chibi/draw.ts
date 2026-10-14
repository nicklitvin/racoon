import { clamp01, curve, DEG, fmt, lerp, tubePoints } from '../critter/kit';
import { drawWearable, hatItem, NECK_WIDTH, outfitItem, type Dress } from '../outfits';
import { n, svgWriter } from '../svg';
import { bodyFrame, headCentre, LEGS, legRoot, WATER_Y, type ChibiPose, type LegName } from './pose';
import type { ChibiBuild, Pt } from './species';

/** The drawing's box, in units from his feet. */
export const CHIBI_VIEW = { x: -64, y: -92, width: 128, height: 108 };

let ids = 0;

/** A closed blob through points round an ellipse, with tufts pulled out at some angles (degrees, 0 = forward, 90 = up). */
function blob(rx: number, ry: number, tufts: [angle: number, out: number][] = []): string {
  const pts: Pt[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * 360;
    let k = 1;
    for (const [at, out] of tufts) {
      const d = Math.abs(((a - at + 540) % 360) - 180);
      if (d < 18) k += out * (1 - d / 18) ** 2;
    }
    pts.push({ x: Math.cos(a * DEG) * rx * k, y: -Math.sin(a * DEG) * ry * k });
  }
  return curve(pts, true);
}

/** An ear: a rounded triangle, or a little half-round for an otter, its base on the head. */
function earPath(kind: 'cat' | 'fox' | 'raccoon' | 'otter', k: number): string {
  if (kind === 'otter') return `M${-3.6 * k},1 A${3.6 * k},${3.4 * k} 0 0 1 ${3.6 * k},1Z`;
  const [w, h, round] = kind === 'fox' ? [6, 13, 0.5] : kind === 'cat' ? [5.8, 9.5, 0.7] : [6, 8.5, 2.2];
  const tip = { x: -0.8 * k, y: -h * k };
  const l = { x: -w * k, y: 1.5 };
  const r = { x: w * k, y: 1.5 };
  const nearTip = (p: Pt, f: number) => ({ x: lerp(tip.x, p.x, f), y: lerp(tip.y, p.y, f) });
  const a = nearTip(l, round / h);
  const b = nearTip(r, round / h);
  return `M${fmt(l)}L${fmt(a)}Q${fmt(tip)} ${fmt(b)}L${fmt(r)}Z`;
}

const EAR_KIND: Record<ChibiBuild['species'], 'cat' | 'fox' | 'raccoon' | 'otter'> = {
  cat: 'cat',
  fox: 'fox',
  raccoon: 'raccoon',
  otter: 'otter',
};

/** Where on the head each ear sits (degrees round it, 90 = top) and how big it is. */
const EAR_AT: Record<ChibiBuild['species'], { near: number; far: number; size: number }> = {
  cat: { near: 58, far: 122, size: 1 },
  fox: { near: 62, far: 120, size: 1 },
  raccoon: { near: 56, far: 124, size: 1 },
  otter: { near: 42, far: 138, size: 1 },
};

export function createChibiSkin(doc: Document, build: ChibiBuild, className: string, label: string) {
  const { make, set } = svgWriter(doc);
  const id = `chibi-${++ids}`;
  const species = build.species;
  const B = build.body;
  const H = build.head;
  const view = CHIBI_VIEW;

  const svg = make('svg', {
    class: `raccoon chibi chibi-${species} ${className}`,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': label,
  }) as SVGSVGElement;
  const defs = make('defs', {}, svg);
  const shadow = make('ellipse', { class: 'c-shadow', cx: 0, cy: 0.5, rx: 22, ry: 2.6 }, svg);
  // Everything that turns round with him; the marks over his head stay the right way round.
  const flip = make('g', {}, svg);
  const pondBack = build.swims ? make('g', { class: 'c-pond' }, flip) : null;
  const figure = make('g', { class: 'raccoon-figure' }, flip);
  const pondFront = build.swims ? make('g', { class: 'c-pond c-pond-front' }, flip) : null;
  const marks = make('g', { class: 'c-marks' }, svg);

  // Back to front: tail behind, far legs, near legs, body, a tail brought round in front,
  // the head, then a paw raised in front of the face.
  const tailBehind = make('g', {}, figure);
  const legsFar = make('g', { class: 'c-far' }, figure);
  const legsNear = make('g', {}, figure);
  const bodyGroup = make('g', {}, figure);
  const tailInFront = make('g', {}, figure);
  // What he wears round his neck: over his chest, under his chin.
  const neckGroup = make('g', { class: 'c-outfit' }, figure);
  const neckwear = make('g', {}, neckGroup);
  const headGroup = make('g', {}, figure);
  const front = make('g', {}, figure);

  // --- Tail ---
  const tail = make('g', { class: 'c-tail' }, tailBehind);
  const tailFill = make('path', { id: `${id}-tail`, class: 'c-fur c-tail-fur' }, tail);
  const tailClip = make('clipPath', { id: `${id}-tailclip` }, defs);
  make('use', { href: `#${id}-tail` }, tailClip);
  const tailBands = make('path', { class: species === 'fox' ? 'c-tip' : 'c-band', 'clip-path': `url(#${id}-tailclip)` }, tail);
  const tailLine = make('path', { class: 'c-line' }, tail);

  // --- Legs ---
  const legs = {} as Record<LegName, { group: SVGElement; edge: SVGElement; fill: SVGElement; sock: SVGElement }>;
  for (const leg of LEGS) {
    const group = make('g', { class: `c-leg c-${leg.startsWith('front') ? 'fore' : 'hind'}` }, leg.endsWith('Far') ? legsFar : legsNear);
    const w = build.legWidth;
    const edge = make('path', { class: 'c-limb-edge', 'stroke-width': n(w + 2.6) }, group);
    const fill = make('path', { class: 'c-limb', 'stroke-width': n(w) }, group);
    const sock = make('path', { class: 'c-limb c-sock', 'stroke-width': n(w) }, group);
    legs[leg] = { group, edge, fill, sock };
  }

  // --- Body ---
  // Body and head are each drawn twice from one shape: filled, then outlined over their markings.
  make('ellipse', { id: `${id}-body`, rx: B.rx, ry: B.ry }, defs);
  make('use', { href: `#${id}-body`, class: 'c-fur' }, bodyGroup);
  const bodyClip = make('clipPath', { id: `${id}-bodyclip` }, defs);
  make('use', { href: `#${id}-body` }, bodyClip);
  const bodyMarks = make('g', { 'clip-path': `url(#${id}-bodyclip)` }, bodyGroup);
  make('ellipse', { class: 'c-belly', cx: B.rx * 0.2, cy: B.ry * 0.62, rx: B.rx * 0.78, ry: B.ry * 0.55 }, bodyMarks);
  if (species === 'cat') {
    for (const x of [-0.45, -0.1, 0.25]) {
      make('path', { class: 'c-stripe', d: `M${n(B.rx * x - 2)},${n(-B.ry - 1)} Q${n(B.rx * x)},${n(-B.ry * 0.45)} ${n(B.rx * x + 2.5)},${n(-B.ry * 0.35)}` }, bodyMarks);
    }
  }
  if (species === 'fox' || species === 'raccoon') {
    make('ellipse', { class: 'c-chest', cx: B.rx * 0.82, cy: B.ry * 0.25, rx: B.rx * 0.38, ry: B.ry * 0.8 }, bodyMarks);
  }
  make('use', { href: `#${id}-body`, class: 'c-outline' }, bodyGroup);
  const haunch = make('path', { class: 'c-fur c-line' }, bodyGroup);

  // --- Head ---
  const kind = EAR_KIND[species];
  const earAt = EAR_AT[species];
  const ear = (deg: number, cls: string) => {
    const at = { x: Math.cos(deg * DEG) * H.rx * 0.82, y: -Math.sin(deg * DEG) * H.ry * 0.82 };
    const g = make('g', { class: cls }, headGroup);
    const tilt = make('g', {}, g);
    make('path', { class: 'c-fur c-line', d: earPath(kind, earAt.size) }, tilt);
    make('path', { class: 'c-ear-inner', d: earPath(kind, earAt.size * 0.55) }, tilt);
    // A fox's ears are black at the tips: the same shape, smaller, sharing the tip.
    if (kind === 'fox') make('path', { class: 'c-tip-dark c-line', d: earPath(kind, earAt.size * 0.42), transform: 'translate(-0.46 -7.54)' }, tilt);
    return { g, tilt, at, deg };
  };
  const earFar = ear(earAt.far, 'c-ear c-ear-far');
  const earNear = ear(earAt.near, 'c-ear');
  const headTufts: Record<string, [number, number][]> = {
    raccoon: [
      [205, 0.2],
      [335, 0.16],
    ],
    fox: [
      [212, 0.22],
      [322, 0.2],
    ],
    cat: [
      [205, 0.08],
      [330, 0.08],
    ],
    otter: [],
  };
  make('path', { id: `${id}-head`, d: blob(H.rx, H.ry, headTufts[species]) }, defs);
  make('use', { href: `#${id}-head`, class: 'c-fur' }, headGroup);
  const headClip = make('clipPath', { id: `${id}-headclip` }, defs);
  make('use', { href: `#${id}-head` }, headClip);
  const face = make('g', { 'clip-path': `url(#${id}-headclip)` }, headGroup);
  const rx = H.rx;
  const ry = H.ry;
  // Eyes, nose: in head units, for a face turned three-quarters towards you.
  const eyeNear = { x: rx * 0.4, y: ry * 0.06 };
  const eyeFar = { x: -rx * 0.18, y: ry * 0.04 };
  const nose =
    species === 'fox'
      ? { x: rx * 0.98, y: ry * 0.3 }
      : species === 'otter'
        ? { x: rx * 0.78, y: ry * 0.22 }
        : { x: rx * 0.8, y: ry * 0.3 };
  switch (species) {
    case 'raccoon':
      // The bandit mask, the pale brows over it, and a white muzzle.
      make('ellipse', { class: 'c-light', cx: rx * 0.15, cy: -ry * 0.42, rx: rx * 0.75, ry: ry * 0.22 }, face);
      make('path', { class: 'c-mask', d: `M${n(-rx * 0.62)},${n(ry * 0.12)} Q${n(-rx * 0.3)},${n(-ry * 0.42)} ${n(rx * 0.1)},${n(-ry * 0.08)} Q${n(rx * 0.45)},${n(-ry * 0.5)} ${n(rx * 0.95)},${n(-ry * 0.05)} Q${n(rx * 0.7)},${n(ry * 0.42)} ${n(rx * 0.35)},${n(ry * 0.38)} Q${n(rx * 0.1)},${n(ry * 0.2)} ${n(-rx * 0.15)},${n(ry * 0.4)} Q${n(-rx * 0.5)},${n(ry * 0.45)} ${n(-rx * 0.62)},${n(ry * 0.12)}Z` }, face);
      make('ellipse', { class: 'c-light', cx: rx * 0.62, cy: ry * 0.58, rx: rx * 0.45, ry: ry * 0.32 }, face);
      break;
    case 'fox':
      // White cheeks and muzzle.
      make('path', { class: 'c-light', d: `M${n(-rx * 1.1)},${n(ry * 0.35)} Q${n(-rx * 0.4)},${n(ry * 0.18)} ${n(rx * 0.12)},${n(ry * 0.36)} Q${n(rx * 0.6)},${n(ry * 0.1)} ${n(rx * 1.2)},${n(ry * 0.18)} L${n(rx * 1.2)},${n(ry * 1.2)} L${n(-rx * 1.1)},${n(ry * 1.2)}Z` }, face);
      break;
    case 'cat':
      for (const x of [-0.18, 0.04, 0.26]) {
        make('path', { class: 'c-stripe', d: `M${n(rx * x)},${n(-ry * 1.05)} L${n(rx * x + 0.6)},${n(-ry * 0.62)}` }, face);
      }
      make('ellipse', { class: 'c-light', cx: rx * 0.6, cy: ry * 0.55, rx: rx * 0.42, ry: ry * 0.3 }, face);
      break;
    case 'otter':
      make('ellipse', { class: 'c-light', cx: rx * 0.42, cy: ry * 0.5, rx: rx * 0.72, ry: ry * 0.42 }, face);
      break;
  }
  make('use', { href: `#${id}-head`, class: 'c-outline' }, headGroup);
  if (species === 'fox') {
    // A short pointed snout poking out of the cheek.
    make('path', { class: 'c-light c-line', d: `M${n(rx * 0.55)},${n(ry * 0.06)} Q${n(rx * 0.95)},${n(ry * 0.04)} ${n(rx * 1.12)},${n(ry * 0.28)} Q${n(rx * 0.95)},${n(ry * 0.56)} ${n(rx * 0.55)},${n(ry * 0.55)}` }, headGroup);
  }
  if (species === 'otter') {
    for (const dx of [-1.9, 1.9]) make('circle', { class: 'c-light c-line-soft', cx: n(nose.x + dx * 0.8 - 0.5), cy: n(nose.y + 2.7), r: 2.3 }, headGroup);
  }

  const blushNear = make('ellipse', { class: 'c-blush', cx: n(rx * 0.62), cy: n(ry * 0.42), rx: 3, ry: 1.7 }, headGroup);
  const blushFar = make('ellipse', { class: 'c-blush', cx: n(-rx * 0.32), cy: n(ry * 0.4), rx: 2.2, ry: 1.5 }, headGroup);

  const makeEye = (at: Pt, k: number) => {
    const g = make('g', { transform: `translate(${n(at.x)} ${n(at.y)}) scale(${k} 1)` }, headGroup);
    const open = make('g', {}, g);
    const white = make('ellipse', { class: 'c-eye-white', rx: 3.5, ry: 4 }, open);
    const pupil = make('g', {}, open);
    const ball = make('ellipse', { class: 'c-eye', rx: 2.6, ry: 3.3 }, pupil);
    make('circle', { class: 'c-glint', cx: 0.85, cy: -1.25, r: 1.05 }, pupil);
    make('circle', { class: 'c-glint', cx: -0.8, cy: 1.2, r: 0.5 }, pupil);
    const shut = make('path', { class: 'c-lid' }, g);
    return { open, white, pupil, ball, shut };
  };
  const eyes = [makeEye(eyeFar, 0.8), makeEye(eyeNear, 1)];

  make('path', { class: 'c-nose', d: `M${n(nose.x - 1.8)},${n(nose.y - 0.9)} Q${n(nose.x)},${n(nose.y - 1.6)} ${n(nose.x + 1.8)},${n(nose.y - 0.9)} Q${n(nose.x + 0.6)},${n(nose.y + 1.4)} ${n(nose.x)},${n(nose.y + 1.4)} Q${n(nose.x - 0.6)},${n(nose.y + 1.4)} ${n(nose.x - 1.8)},${n(nose.y - 0.9)}Z` }, headGroup);
  const mouthClosed = make('path', { class: 'c-mouth-line', d: `M${n(nose.x - 2.6)},${n(nose.y + 2.2)} Q${n(nose.x - 1.3)},${n(nose.y + 3.4)} ${n(nose.x)},${n(nose.y + 1.6)} Q${n(nose.x + 1.3)},${n(nose.y + 3.4)} ${n(nose.x + 2.4)},${n(nose.y + 2.2)}` }, headGroup);
  const mouthOpen = make('g', {}, headGroup);
  const mouthHole = make('ellipse', { class: 'c-mouth', cx: n(nose.x - 0.4) }, mouthOpen);
  const tongue = make('ellipse', { class: 'c-tongue', cx: n(nose.x - 0.4) }, mouthOpen);
  if (species !== 'fox') {
    const wx = nose.x + 2;
    const wy = nose.y + 1.6;
    make('path', { class: 'c-whisker', d: `M${n(wx)},${n(wy - 0.6)} l7,-2.2 M${n(wx + 0.3)},${n(wy + 0.8)} l7.4,0.2 M${n(wx)},${n(wy + 2.1)} l6.6,2.2` }, headGroup);
  }

  // A hat, on top of everything else on his head.
  const hat = make('g', { class: 'c-outfit', transform: `translate(${n(-rx * 0.06)} ${n(-ry * 0.9)}) scale(${n(rx)})` }, headGroup);

  // --- A paw raised to the face or over the screen edge, and an otter's shell ---
  const raisedFarEdge = make('path', { class: 'c-limb-edge', 'stroke-width': n(build.legWidth + 2.6) }, front);
  const raisedFarFill = make('path', { class: 'c-limb c-far-limb', 'stroke-width': n(build.legWidth) }, front);
  const raisedEdge = make('path', { class: 'c-limb-edge', 'stroke-width': n(build.legWidth + 2.6) }, front);
  const raisedFill = make('path', { class: 'c-limb', 'stroke-width': n(build.legWidth) }, front);
  const shell = make('g', { class: 'c-shell' }, front);
  make('path', { class: 'c-shell-fill c-line', d: 'M-4.2,1.6 Q-4.6,-3.2 0,-4.4 Q4.6,-3.2 4.2,1.6 Q0,3 -4.2,1.6Z' }, shell);
  make('path', { class: 'c-shell-ribs', d: 'M0,2.3 L0,-4.1 M-2.2,2.1 L-1.5,-3.6 M2.2,2.1 L1.5,-3.6' }, shell);

  // --- The pond ---
  const pond = pondBack && pondFront ? makePond() : null;
  function makePond() {
    // In the water, whatever of him is under the surface is out of sight.
    const above = make('clipPath', { id: `${id}-above` }, defs);
    make('rect', { x: view.x, y: view.y - 40, width: view.width, height: WATER_Y + 1.6 - view.y + 40 }, above);
    const back = make('ellipse', { class: 'c-water', cx: -2, cy: WATER_Y }, pondBack!);
    const ripples = [0, 1].map(() => make('ellipse', { class: 'c-ripple' }, pondBack!));
    const water = make('path', { class: 'c-water c-water-front' }, pondFront!);
    const crest = make('path', { class: 'c-crest' }, pondFront!);
    const wake = make('path', { class: 'c-wake' }, pondFront!);
    const drops = [0, 1, 2, 3, 4].map(() => make('circle', { class: 'c-drop' }, pondFront!));
    return { back, ripples, water, crest, wake, drops };
  }

  // --- Marks over the head ---
  const markText = (cls: string) => make('text', { class: `c-mark ${cls}`, 'text-anchor': 'middle' }, marks);
  const zs = [0, 1, 2].map(() => markText('c-z'));
  for (const z of zs) z.textContent = 'z';
  const alarm = markText('c-alarm');
  alarm.textContent = '!';
  const puzzled = markText('c-puzzled');
  puzzled.textContent = '?';
  const hearts = [0, 1, 2].map(() => make('path', { class: 'c-heart', d: 'M0,1.6 C-3.6,-1 -2.2,-4 0,-2.3 C2.2,-4 3.6,-1 0,1.6Z' }, marks));

  /** The tail's centre line from root to tip. */
  function tailSpine(p: ChibiPose): Pt[] {
    const frame = bodyFrame(build, p);
    const root = frame.at(build.tail.root);
    const count = 12;
    const step = build.tail.length / count;
    const pts: Pt[] = [root];
    let at = root;
    for (let i = 1; i <= count; i++) {
      const s = i / count;
      const a = (p.tailA + p.rot + p.tailCurl * s ** 1.4) * DEG;
      at = { x: at.x + Math.cos(a) * step, y: at.y - Math.sin(a) * step };
      pts.push(at);
    }
    return pts;
  }

  /** A band across the tail between `a` and `b` (0 root, 1 tip), wider than the tail: it's cut to it. */
  function tailStrip(spine: Pt[], radii: number[], a: number, b: number): string {
    const last = spine.length - 1;
    const i0 = Math.round(a * last);
    const i1 = Math.round(b * last);
    const pts = tubePoints(spine.slice(i0, i1 + 1), radii.slice(i0, i1 + 1).map((r) => r * 1.6 + 1), false, i1 === last);
    return `M${pts.map(fmt).join('L')}Z`;
  }

  function drawTail(p: ChibiPose): void {
    const spine = tailSpine(p);
    const radii = spine.map((_, i) => build.tail.radius(i / (spine.length - 1)) * p.tailPuff);
    const d = curve(tubePoints(spine, radii, true, true), true);
    set(tailFill, 'd', d);
    set(tailLine, 'd', d);
    let bands = '';
    if (species === 'raccoon') for (const [a, b] of [[0.3, 0.42], [0.55, 0.67], [0.8, 1]] as const) bands += tailStrip(spine, radii, a, b);
    if (species === 'fox') bands = tailStrip(spine, radii, 0.75, 1);
    if (species === 'cat') for (const [a, b] of [[0.42, 0.5], [0.67, 0.75]] as const) bands += tailStrip(spine, radii, a, b);
    set(tailBands, 'd', bands);
    const parent = p.tailFront > 0.5 ? tailInFront : tailBehind;
    if (tail.parentNode !== parent) parent.appendChild(tail);
  }

  function limb(edge: SVGElement, fill: SVGElement, from: Pt, to: Pt): void {
    const d = `M${fmt(from)}L${fmt(to)}`;
    set(edge, 'd', d);
    set(fill, 'd', d);
  }

  function drawLegs(p: ChibiPose): void {
    for (const leg of LEGS) {
      const parts = legs[leg];
      const root = legRoot(build, p, leg);
      const paw = { x: p.paws[leg].x, y: p.paws[leg].y + p.lift };
      // A paw up at the face or both up on the screen edge come round in front of him.
      const raised = (leg === 'frontNear' && p.pawUp > 0.5) || (leg === 'frontFar' && p.pawUp > 1.5);
      set(parts.group, 'display', raised ? 'none' : 'inline');
      if (raised) {
        if (leg === 'frontNear') limb(raisedEdge, raisedFill, root, paw);
        else limb(raisedFarEdge, raisedFarFill, root, paw);
        continue;
      }
      limb(parts.edge, parts.fill, root, paw);
      // Stockings: the lower half of a fox's leg is dark.
      if (species === 'fox') limb(parts.sock, parts.sock, { x: lerp(root.x, paw.x, 0.55), y: lerp(root.y, paw.y, 0.55) }, paw);
      else set(parts.sock, 'd', '');
    }
    set(raisedEdge, 'display', p.pawUp > 0.5 ? 'inline' : 'none');
    set(raisedFill, 'display', p.pawUp > 0.5 ? 'inline' : 'none');
    set(raisedFarEdge, 'display', p.pawUp > 1.5 ? 'inline' : 'none');
    set(raisedFarFill, 'display', p.pawUp > 1.5 ? 'inline' : 'none');
  }

  function drawBody(p: ChibiPose): void {
    const frame = bodyFrame(build, p);
    set(bodyGroup, 'transform', `translate(${n(frame.cx)} ${n(frame.cy)}) rotate(${n(-p.rot)}) scale(${n(p.sx)} ${n(p.sy)})`);
    // The haunch: the round of the thigh when he sits.
    const hip = build.hip;
    const r = B.ry * 0.62;
    set(haunch, 'd', p.haunch > 0.05 ? `M${n(hip.x + 2 - r)},${n(hip.y - 2)}a${n(r)},${n(r * 0.9)} 0 1 1 ${n(r * 2)},0a${n(r)},${n(r * 0.9)} 0 1 1 ${n(-r * 2)},0Z` : '');
    set(haunch, 'opacity', n(clamp01(p.haunch)));
  }

  function drawHead(p: ChibiPose): void {
    const h = headCentre(build, p);
    set(headGroup, 'transform', `translate(${n(h.x)} ${n(h.y)}) rotate(${n(-p.hrot)})`);
    // Ears turn back as they flatten and forward as they prick.
    for (const e of [earNear, earFar]) {
      const outward = (e.deg - 90) * -0.55;
      const back = p.ears < 0 ? p.ears * 40 : p.ears * -8;
      set(e.tilt, 'transform', `translate(${n(e.at.x)} ${n(e.at.y)}) rotate(${n(outward - back * (e === earNear ? 1 : 0.8))})`);
    }
    const lx = p.lookX * 0.9;
    const ly = p.lookY * 0.7;
    for (const eye of eyes) {
      const shut = p.eyes !== 'open' && p.eyes !== 'wide';
      set(eye.open, 'display', shut ? 'none' : 'inline');
      set(eye.white, 'display', p.eyes === 'wide' ? 'inline' : 'none');
      set(eye.ball, 'rx', p.eyes === 'wide' ? '2' : '2.6');
      set(eye.ball, 'ry', p.eyes === 'wide' ? '2.5' : '3.3');
      set(eye.pupil, 'transform', `translate(${n(lx)} ${n(ly)})`);
      const lid = p.eyes === 'happy' ? 'M-2.8,1.2 Q0,-2.6 2.8,1.2' : p.eyes === 'closed' ? 'M-2.8,0 Q0,2.4 2.8,0' : 'M-2.8,0.6 L2.8,0.6';
      set(eye.shut, 'd', shut ? lid : '');
    }
    const open = p.mouth > 0.04;
    set(mouthClosed, 'display', open ? 'none' : 'inline');
    set(mouthOpen, 'display', open ? 'inline' : 'none');
    if (open) {
      set(mouthHole, 'cy', n(nose.y + 3 + p.mouth * 1.6));
      set(mouthHole, 'rx', n(1.4 + p.mouth * 1.6));
      set(mouthHole, 'ry', n(0.8 + p.mouth * 2.6));
      set(tongue, 'cy', n(nose.y + 3.6 + p.mouth * 2.8));
      set(tongue, 'rx', n(1.2 + p.mouth * 0.8));
      set(tongue, 'ry', n(0.4 + p.tongue * 1.4));
    }
    set(blushNear, 'opacity', n(p.blush));
    set(blushFar, 'opacity', n(p.blush * 0.8));
  }

  /** The collar sits under his chin, turned with his head. */
  function drawNeck(p: ChibiPose): void {
    if (!neckwear.firstChild) return;
    const h = headCentre(build, p);
    const th = -p.hrot * DEG;
    const l = { x: -rx * 0.05, y: ry * 1.06 };
    const at = { x: h.x + l.x * Math.cos(th) - l.y * Math.sin(th), y: h.y + l.x * Math.sin(th) + l.y * Math.cos(th) };
    set(neckGroup, 'transform', `translate(${n(at.x)} ${n(at.y)}) rotate(${n(-p.hrot)}) scale(${n(NECK_WIDTH * rx)})`);
  }

  function drawExtras(p: ChibiPose): void {
    const frame = bodyFrame(build, p);
    const chest = frame.at({ x: build.shoulder.x - 3, y: -B.ry * Math.sign(p.sy) * 1.05 });
    set(shell, 'display', p.shell > 0.5 ? 'inline' : 'none');
    set(shell, 'transform', `translate(${n(chest.x)} ${n(chest.y - 1.5)}) rotate(${n(-p.rot - 10)})`);
  }

  function drawPond(p: ChibiPose, clock: number, moving: number): void {
    if (!pond || !pondBack || !pondFront) return;
    const wet = p.wet > 0.5;
    set(pondBack, 'display', wet ? 'inline' : 'none');
    set(pondFront, 'display', wet ? 'inline' : 'none');
    set(figure, 'clip-path', wet ? `url(#${id}-above)` : 'none');
    if (!wet) return;
    const rx = 34 + moving * 6;
    const ry = 7;
    const cx = -3 - moving * 4;
    set(pond.back, 'cx', n(cx));
    set(pond.back, 'rx', n(rx));
    set(pond.back, 'ry', n(ry));
    // The near half of the pond, over whatever of him is under the surface, its edge rippling.
    const top: Pt[] = [];
    for (let i = 0; i <= 16; i++) {
      const x = cx - rx + (rx * 2 * i) / 16;
      const edge = Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
      top.push({ x, y: WATER_Y + 0.7 * Math.sin(x * 0.35 + clock / 260) * edge });
    }
    const crest = curve(top);
    set(pond.water, 'd', `${crest}A${n(rx)},${n(ry)} 0 0 1 ${n(cx - rx)},${n(WATER_Y)}Z`);
    set(pond.crest, 'd', crest);
    // Rings spreading out over the pond.
    pond.ripples.forEach((ring, i) => {
      const age = (clock / 2400 + i / 2) % 1;
      set(ring, 'cx', n(cx + 4));
      set(ring, 'cy', n(WATER_Y));
      set(ring, 'rx', n(12 + age * (rx - 12)));
      set(ring, 'ry', n(2.2 + age * (ry - 2.2)));
      set(ring, 'opacity', n((1 - age) * 0.8));
    });
    // A wake behind when he swims, and drops thrown up when he splashes.
    const head = headCentre(build, p);
    if (moving > 0.05) {
      const x0 = bodyFrame(build, p).cx - B.rx * 0.6;
      const w = 6 + moving * 8;
      set(pond.wake, 'd', `M${n(x0 - 8)},${n(WATER_Y + 2.6)} l${n(-w)},0.8 M${n(x0 - 14)},${n(WATER_Y - 1.6)} l${n(-w * 0.8)},-0.6 M${n(x0 - 22)},${n(WATER_Y + 1)} l${n(-w * 0.6)},0.4`);
      set(pond.wake, 'opacity', n(clamp01(moving)));
    } else {
      set(pond.wake, 'd', '');
    }
    pond.drops.forEach((drop, i) => {
      const age = (clock / 520 + i / 5) % 1;
      const out = p.splash > 0.05 ? p.splash : 0;
      const x = head.x + 4 + (i - 2) * 2.2 * (1 + age);
      const y = WATER_Y - out * (5 + i % 3) * Math.sin(Math.PI * age) - 0.5;
      set(drop, 'cx', n(x));
      set(drop, 'cy', n(y));
      set(drop, 'r', n(0.7 + (i % 2) * 0.35));
      set(drop, 'opacity', n(out > 0 ? clamp01(out) * (1 - age) : 0));
    });
  }

  function drawMarks(p: ChibiPose, clock: number, facing: number): void {
    const head = headCentre(build, p);
    const top = { x: head.x * facing, y: head.y - H.ry - 6 };
    const show = (el: Element, on: boolean) => set(el, 'display', on ? 'inline' : 'none');
    zs.forEach((z, i) => {
      const age = (clock / 2400 + i / 3) % 1;
      show(z, p.mark === 'zzz');
      set(z, 'x', n(top.x + facing * (6 + age * 10)));
      set(z, 'y', n(top.y + 4 - age * 14));
      set(z, 'font-size', n(5 + age * 4));
      set(z, 'opacity', n(Math.sin(Math.PI * age)));
    });
    show(alarm, p.mark === 'alarm');
    set(alarm, 'x', n(top.x + facing * 9));
    set(alarm, 'y', n(top.y - 1));
    show(puzzled, p.mark === 'puzzled');
    set(puzzled, 'x', n(top.x + facing * 9));
    set(puzzled, 'y', n(top.y - 1 + Math.sin(clock / 300)));
    hearts.forEach((heart, i) => {
      const age = (clock / 1500 + i / 3) % 1;
      show(heart, p.mark === 'hearts');
      const x = top.x + facing * (4 + i * 5) + Math.sin(age * 6 + i) * 1.5;
      const y = top.y + 6 - age * 16;
      set(heart, 'transform', `translate(${n(x)} ${n(y)}) scale(${n(0.8 + age * 0.5)})`);
      set(heart, 'opacity', n(Math.sin(Math.PI * age)));
    });
  }

  return {
    svg,
    figure,
    dress(d: Dress): void {
      const style = { line: '#2b2630', width: 1.1 };
      drawWearable(doc, hat, hatItem(d.hat), rx, style);
      drawWearable(doc, neckwear, outfitItem(d.outfit), NECK_WIDTH * rx, style);
    },
    draw(p: ChibiPose, clock: number, facing: number, moving: number, scruff: Pt): void {
      set(flip, 'transform', `scale(${n(facing)} 1)`);
      set(figure, 'transform', p.swing ? `rotate(${n(p.swing)} ${n(scruff.x)} ${n(scruff.y)})` : '');
      drawTail(p);
      drawLegs(p);
      drawBody(p);
      drawHead(p);
      drawNeck(p);
      drawExtras(p);
      drawPond(p, clock, moving);
      drawMarks(p, clock, Math.sign(facing) || 1);
      const lift = clamp01(-p.lift / 26);
      const hidden = p.swing !== 0 || p.wet > 0.5 || p.paws.frontNear.y < -build.peekSink + 2;
      set(shadow, 'display', hidden ? 'none' : 'inline');
      set(shadow, 'rx', n((B.rx + 7) * (1 - lift * 0.6)));
      set(shadow, 'cx', n(-2 * facing));
      set(shadow, 'opacity', n(1 - lift * 0.7));
    },
  };
}
