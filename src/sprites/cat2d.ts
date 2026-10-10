import type { Point } from '../core/geometry';
import { ANIMATIONS } from './animations';
import { CAT, bodyPoint, catPoseFor, headCentre, legRoot, smooth, spineLength, tailAngles, tailPoints, type CatPose } from './catPose';
import type { LegName } from './rig';
import { n, PX_PER_UNIT, svgWriter } from './svg';
import { ANIMATION_NAMES, type AnimationName, type AnimationSpec, type RaccoonFrame, type RaccoonRenderer } from './types';

/**
 * How each part eases into a new animation: a delay and a duration in ms. Parts start
 * one after another (body, then head, then ears and tail), and the ears and tail
 * overshoot and settle back. That staggering is what makes the motion feel fluid and
 * hand-animated rather than switched.
 */
const BLEND = {
  body: { delay: 0, duration: 220 },
  head: { delay: 40, duration: 260 },
  ears: { delay: 70, duration: 320 },
  tail: { delay: 90, duration: 460 },
} as const;
const BLEND_END_MS = Math.max(...Object.values(BLEND).map((b) => b.delay + b.duration));
/** Turning round: a quick squash-through flip. */
const FLIP_MS = 190;

/** How a breed moves. 1 is the black cat's smooth, Disney-ish feel. */
export interface CatMotion {
  /** Scales how long changes take to ease in; 0 snaps straight to the new pose. */
  blend: number;
  /** How far the ears and tail swing past their target: 0 none, 1 normal, 2 a lot. */
  overshoot: number;
  /** Hop on every footfall while walking or running, in units. */
  bounce: number;
  /** Bobbing up and down even while standing about (rubber-hose style), in units. */
  idleBob: number;
  /** Draw everything at 12 fps, "on twos", like limited TV animation. */
  onTwos: boolean;
}

export interface CatBuild {
  label: string;
  /** Palette class; colours live in CSS. */
  className: string;
  head: number;
  /** Body thickness. */
  body: number;
  eyes: number;
  /** Muscly thighs and shoulders; off for noodle legs. */
  thighs: boolean;
  stripes: boolean;
  motion: CatMotion;
}

const SMOOTH: CatMotion = { blend: 1, overshoot: 1, bounce: 0, idleBob: 0, onTwos: false };

export const CAT_BREEDS = {
  black: { label: 'black cat', className: 'cat-black', head: 1.1, body: 1, eyes: 1, thighs: true, stripes: false, motion: SMOOTH },
  tabby: {
    label: 'tabby cat',
    className: 'cat-tabby',
    head: 1.1,
    body: 1.05,
    eyes: 1,
    thighs: true,
    stripes: true,
    motion: { ...SMOOTH, bounce: 0.8 },
  },
  // Elegant and unhurried: long, soft eases and hardly any wobble.
  siamese: {
    label: 'siamese cat',
    className: 'cat-siamese',
    head: 1.02,
    body: 0.92,
    eyes: 1,
    thighs: true,
    stripes: false,
    motion: { ...SMOOTH, blend: 1.6, overshoot: 0.5 },
  },
  // Springy and over-excited: hops along, everything jiggles.
  kitten: {
    label: 'kitten',
    className: 'cat-kitten',
    head: 1.38,
    body: 0.95,
    eyes: 1.2,
    thighs: true,
    stripes: false,
    motion: { ...SMOOTH, blend: 0.8, overshoot: 2.2, bounce: 2.6 },
  },
  // Big and lazy: slow to get going, a waddle in the walk.
  chonk: {
    label: 'chonky tuxedo cat',
    className: 'cat-chonk',
    head: 1.15,
    body: 1.42,
    eyes: 0.95,
    thighs: true,
    stripes: false,
    motion: { ...SMOOTH, blend: 1.9, overshoot: 0.4, bounce: 0.7 },
  },
  // 1930s rubber-hose cartoon: noodle legs, white gloves, a constant bounce, on twos.
  hose: {
    label: 'rubber-hose cat',
    className: 'cat-hose',
    head: 1.25,
    body: 0.95,
    eyes: 1.25,
    thighs: false,
    stripes: false,
    motion: { blend: 0.7, overshoot: 2.6, bounce: 4, idleBob: 1.8, onTwos: true },
  },
  // Limited animation: snaps between key poses at 12 fps with no easing at all.
  snappy: {
    label: 'white cat',
    className: 'cat-white',
    head: 1.18,
    body: 1,
    eyes: 1.1,
    thighs: true,
    stripes: false,
    motion: { blend: 0, overshoot: 0, bounce: 0, idleBob: 0, onTwos: true },
  },
} satisfies Record<string, CatBuild>;

export type CatBreed = keyof typeof CAT_BREEDS;
/** Eyelids close and open over roughly this long. */
const LID_MS = 30;

/** The cat redraws resting animations at film rate, so even sitting about looks smooth. */
const CAT_ANIMATIONS: Partial<Record<AnimationName, Partial<AnimationSpec>>> = {
  idle: { fps: 24 },
  sit: { fps: 24 },
  groom: { fps: 24 },
  yawn: { fps: 24 },
  confused: { fps: 24 },
  sleep: { fps: 12 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Eases out past the target and back: follow-through. `amount` 0 is a plain ease. */
const overshoot = (v: number, amount: number) => {
  const x = clamp01(v) - 1;
  return smooth(v) + amount * (1 + 2.4 * x * x * x + 1.4 * x * x - smooth(v));
};
const angleDiff = (from: number, to: number) => ((((to - from + 180) % 360) + 360) % 360) - 180;

const LEGS: LegName[] = ['backFar', 'frontFar', 'backNear', 'frontNear'];

/** What's on screen: a pose with the tail stored as per-segment angles, so it can be eased smoothly. */
interface Shown {
  pose: CatPose;
  tail: number[];
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function mix(from: Shown, to: Shown, sinceMs: number, motion: CatMotion): Shown {
  const w = (part: keyof typeof BLEND, ease: (v: number) => number = smooth) =>
    motion.blend <= 0 ? 1 : ease((sinceMs - BLEND[part].delay * motion.blend) / (BLEND[part].duration * motion.blend));
  const swing = (v: number) => overshoot(v, motion.overshoot);
  const body = w('body');
  const head = w('head');
  const ears = w('ears', swing);
  const tail = w('tail', swing);
  const a = from.pose;
  const b = to.pose;
  const paws = {} as CatPose['paws'];
  for (const leg of LEGS) paws[leg] = lerpPoint(a.paws[leg], b.paws[leg], body);
  return {
    pose: {
      hip: lerpPoint(a.hip, b.hip, body),
      chest: lerpPoint(a.chest, b.chest, body),
      arch: lerp(a.arch, b.arch, body),
      breathe: lerp(a.breathe, b.breathe, body),
      squash: lerp(a.squash, b.squash, body),
      paws,
      rotate: lerp(a.rotate, b.rotate, body),
      pivot: lerpPoint(a.pivot, b.pivot, body),
      head: { x: lerp(a.head.x, b.head.x, head), y: lerp(a.head.y, b.head.y, head), angle: lerp(a.head.angle, b.head.angle, head) },
      look: lerpPoint(a.look, b.look, head),
      pupil: lerp(a.pupil, b.pupil, head),
      mouth: lerp(a.mouth, b.mouth, head),
      lids: b.lids,
      ears: lerp(a.ears, b.ears, ears),
      tail: { ...b.tail, puff: lerp(a.tail.puff, b.tail.puff, tail) },
    },
    tail: to.tail.map((angle, i) => {
      const start = from.tail[i] ?? angle;
      return start + angleDiff(start, angle) * tail;
    }),
  };
}

/** Smooth closed path through points (a ribbon's outline), using midpoints as on-curve points. */
function smoothPath(points: Point[]): string {
  const mid = (p: Point, q: Point) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const count = points.length;
  let d = '';
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    const m = mid(p, points[(i + 1) % count]!);
    if (i === 0) d += `M${n(mid(points[count - 1]!, p).x)},${n(mid(points[count - 1]!, p).y)}`;
    d += `Q${n(p.x)},${n(p.y)} ${n(m.x)},${n(m.y)}`;
  }
  return `${d}Z`;
}

/** Elbow or knee for a two-part leg; stretches like rubber if the paw is out of reach. */
function joint(root: Point, paw: Point, upper: number, lower: number, bend: 1 | -1): Point {
  const dx = paw.x - root.x;
  const dy = paw.y - root.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d;
  const uy = dy / d;
  if (d >= upper + lower) return { x: root.x + ux * d * (upper / (upper + lower)), y: root.y + uy * d * (upper / (upper + lower)) };
  const a = (upper * upper - lower * lower + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  return { x: root.x + ux * a - uy * h * bend, y: root.y + uy * a + ux * h * bend };
}

let gradientIds = 0;

/** Bounces a pose: a hop on every footfall, squashing on landing and stretching in the air. */
function bounced(pose: CatPose, frame: RaccoonFrame, motion: CatMotion): CatPose {
  const gait = frame.animation === 'walk' ? 600 : frame.animation === 'run' ? 340 : frame.animation === 'chase' ? 300 : 0;
  const resting = frame.animation === 'idle' || frame.animation === 'sit' || frame.animation === 'happy';
  if (gait && motion.bounce) {
    const up = Math.abs(Math.sin((2 * Math.PI * frame.timeMs) / gait));
    const lift = motion.bounce * up;
    const paws = {} as CatPose['paws'];
    for (const leg of LEGS) paws[leg] = { x: pose.paws[leg].x, y: pose.paws[leg].y - lift };
    return {
      ...pose,
      hip: { x: pose.hip.x, y: pose.hip.y - lift },
      chest: { x: pose.chest.x, y: pose.chest.y - lift },
      paws,
      squash: pose.squash * (1 + 0.025 * motion.bounce * (up * 2 - 1)),
    };
  }
  if (resting && motion.idleBob) {
    // Only the body bobs; the legs flex to keep the paws planted.
    const down = Math.abs(Math.sin((2 * Math.PI * frame.timeMs) / 700));
    const bob = motion.idleBob * down;
    return {
      ...pose,
      hip: { x: pose.hip.x, y: pose.hip.y + bob },
      chest: { x: pose.chest.x, y: pose.chest.y + bob * 1.2 },
      squash: pose.squash * (1 - 0.02 * motion.idleBob * down),
    };
  }
  return pose;
}

/**
 * A 2D cartoon cat. Poses come from `catPoseFor`; this renderer adds what makes it feel
 * animated rather than mechanical: each change of animation is eased in part by part
 * (body first, the tail last and overshooting), eyelids close softly, and turning round
 * is a quick squash-through flip instead of an instant mirror. Breeds change the
 * colours, proportions and how springy or snappy all of that is.
 */
export function createCat(doc: Document = document, breed: CatBreed = 'black'): RaccoonRenderer {
  const { make, set } = svgWriter(doc);
  const { view } = CAT;
  const build: CatBuild = CAT_BREEDS[breed];
  const { motion } = build;
  const svg = make('svg', {
    class: `raccoon raccoon-cat ${build.className}`,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': build.label,
  });
  const irisId = `cat-iris-${++gradientIds}`;
  const defs = make('defs', {}, svg);
  const iris = make('radialGradient', { id: irisId, cx: '0.45', cy: '0.6', r: '0.65' }, defs);
  make('stop', { offset: '0', class: 'c-iris-in' }, iris);
  make('stop', { offset: '0.7', class: 'c-iris' }, iris);
  make('stop', { offset: '1', class: 'c-iris-out' }, iris);

  const turn = make('g', {}, svg);
  const shadow = make('ellipse', { cx: 0, cy: 0, rx: 26, ry: 2.6, class: 'r-shadow' }, turn);
  const figure = make('g', { class: 'raccoon-figure' }, turn);
  const squash = make('g', {}, figure);

  const tail = make('path', { class: 'c-tail' }, squash);
  const tailRings = make('path', { class: 'c-stripe', display: build.stripes ? 'inline' : 'none' }, squash);
  const makeLeg = (name: LegName) => {
    const near = name.endsWith('Near');
    const cls = near ? 'c-leg' : 'c-far';
    const group = make('g', {}, squash);
    // Near legs get a faint edge so they read against the body.
    const edge = near ? make('path', { class: 'c-limb c-edge' }, group) : null;
    const upper = make('ellipse', { class: cls, display: build.thighs ? 'inline' : 'none' }, group);
    const limb = make('path', { class: `c-limb ${cls}` }, group);
    const paw = make('ellipse', { rx: 3.9, ry: 2.6, class: near ? 'c-paw c-paw-edge' : 'c-paw-far' }, group);
    return { group, edge, upper, limb, paw };
  };
  const legs = {} as Record<LegName, ReturnType<typeof makeLeg>>;
  legs.backFar = makeLeg('backFar');
  legs.frontFar = makeLeg('frontFar');
  const body = make('path', { class: 'c-body' }, squash);
  // A pale chest patch for the breeds that have one (transparent otherwise).
  const bib = make('ellipse', { class: 'c-bib' }, squash);
  const bodyStripes = make('path', { class: 'c-stripe', display: build.stripes ? 'inline' : 'none' }, squash);
  const bodySheen = make('path', { class: 'c-sheen' }, squash);
  legs.backNear = makeLeg('backNear');
  legs.frontNear = makeLeg('frontNear');

  const head = make('g', {}, squash);
  const farEar = make('path', { d: 'M-9,-5 Q-9.5,-17 -7,-23 Q-1,-17 2,-10 Z', class: 'c-ear-far' }, head);
  make('ellipse', { cx: 0, cy: -1, rx: 13, ry: 11.5, class: 'c-head' }, head);
  make('ellipse', { cx: 1.5, cy: 4, rx: 12.5, ry: 8, class: 'c-head' }, head);
  make('ellipse', { cx: 10.5, cy: 3.4, rx: 6, ry: 4.4, class: 'c-muzzle' }, head);
  if (build.stripes) {
    // The tabby "M" on the forehead.
    make('path', { d: 'M-7,-8 Q-6,-6 -4.5,-4.5 M-2.5,-11 Q-1.5,-8 -0.5,-6 M2,-11.5 Q2.6,-9 3,-7', class: 'c-stripe' }, head);
  }
  const nearEar = make('g', {}, head);
  make('path', { d: 'M-2,-9 Q1,-20 5,-25 Q9,-17 11,-7 Z', class: 'c-ear' }, nearEar);
  make('path', { d: 'M1,-10 Q3,-17 5,-20.5 Q7.5,-15 8.5,-9 Z', class: 'c-ear-inner' }, nearEar);
  make('ellipse', { cx: -4, cy: -7, rx: 6.5, ry: 2.8, transform: 'rotate(-20 -4 -7)', class: 'c-sheen' }, head);

  const eyes = [
    { x: 4.5, y: -2.5, rx: 4.4, ry: 5.4 },
    { x: 12.6, y: -2.8, rx: 2.9, ry: 5 },
  ].map(({ x, y, rx, ry }, i) => {
    const group = make('g', {}, head);
    const clipId = `${irisId}-eye${i}`;
    const clip = make('clipPath', { id: clipId }, defs);
    make('ellipse', { rx, ry }, clip);
    const open = make('g', { 'clip-path': `url(#${clipId})` }, group);
    make('ellipse', { rx, ry, fill: `url(#${irisId})` }, open);
    const pupil = make('ellipse', { rx: 1, ry: ry * 0.82, class: 'c-pupil' }, open);
    const glint = make('circle', { r: Math.min(1.3, rx * 0.3), class: 'c-glint' }, open);
    const lid = make('rect', { x: -rx - 1, width: rx * 2 + 2, class: 'c-head' }, open);
    const shut = make('path', { d: `M${-rx},0.3 Q0,${n(ry * 0.5)} ${rx},0.3`, class: 'c-line', display: 'none' }, group);
    return { group, open, pupil, glint, lid, shut, rx, ry, x, y };
  });
  make('path', { d: 'M14.5,-0.6 L17.6,-0.8 Q17.4,1.3 16.1,1.9 Q14.8,1.2 14.5,-0.6 Z', class: 'c-nose' }, head);
  const smile = make('path', { d: 'M16,2 Q16.2,4.2 14.2,4.6 M16,2 Q16.6,4 18.2,4', class: 'c-line c-smile' }, head);
  const mouth = make('g', { display: 'none' }, head);
  const mouthHole = make('ellipse', { cx: 14.8, cy: 4.8, rx: 2.8, ry: 1, class: 'c-mouth' }, mouth);
  const tongue = make('ellipse', { cx: 14.6, cy: 5.6, rx: 1.8, ry: 0.8, class: 'c-tongue' }, mouth);
  const whiskers = make('g', {}, head);
  for (const [y1, x2, y2] of [
    [2.2, 25.5, -0.8],
    [3.2, 26.5, 3],
    [4.2, 25, 6.6],
  ] as const) {
    make('path', { d: `M15,${y1} Q${n((15 + x2) / 2)},${n((y1 + y2) / 2 - 0.8)} ${x2},${y2}`, class: 'c-whisker' }, whiskers);
  }

  let shown: Shown | null = null;
  let from: Shown | null = null;
  let animation: AnimationName | null = null;
  let changedAt = 0;
  let clock = 0;
  let lids = 0;
  let lidTarget = 0;
  let facing = 1;
  let flipFrom = 1;
  let flipAt = -Infinity;

  const drawLeg = (pose: CatPose, name: LegName) => {
    const leg = legs[name];
    const front = name.startsWith('front');
    const root = legRoot(pose, name);
    const paw = pose.paws[name];
    const [upper, lower] = front ? CAT.frontLeg : CAT.backLeg;
    // Elbows point back, knees forward.
    const knee = joint(root, { x: paw.x, y: paw.y - 2 }, upper, lower, front ? 1 : -1);
    const end = { x: paw.x, y: paw.y - 2 };
    // A curve that passes through the joint, so legs bend softly instead of kinking.
    const c = { x: 2 * knee.x - (root.x + end.x) / 2, y: 2 * knee.y - (root.y + end.y) / 2 };
    const d = `M${n(root.x)},${n(root.y)} Q${n(c.x)},${n(c.y)} ${n(end.x)},${n(end.y)}`;
    set(leg.limb, 'd', d);
    if (leg.edge) set(leg.edge, 'd', d);
    // The thigh or shoulder: a muscle shape from the hip to the knee.
    const mid = { x: (root.x + knee.x) / 2, y: (root.y + knee.y) / 2 };
    const deg = (Math.atan2(knee.y - root.y, knee.x - root.x) * 180) / Math.PI;
    set(leg.upper, 'cx', n(mid.x));
    set(leg.upper, 'cy', n(mid.y));
    set(leg.upper, 'rx', n(Math.hypot(knee.x - root.x, knee.y - root.y) / 2 + (front ? 3 : 5)));
    set(leg.upper, 'ry', front ? '3.6' : '6.5');
    set(leg.upper, 'transform', `rotate(${n(deg)} ${n(mid.x)} ${n(mid.y)})`);
    set(leg.paw, 'cx', n(paw.x + 1.2));
    set(leg.paw, 'cy', n(paw.y - 1.8));
  };

  const drawBody = (pose: CatPose) => {
    const L = spineLength(pose);
    const rr = CAT.rump * pose.breathe * build.body;
    const rc = CAT.chest * pose.breathe * build.body;
    const k = 0.55;
    const arch = pose.arch * 1.33;
    const p = (a: number, b: number) => {
      const q = bodyPoint(pose, a, b);
      return `${n(q.x)},${n(q.y)}`;
    };
    set(
      body,
      'd',
      `M${p(0, rr)}` +
        `C${p(-k * rr, rr)} ${p(-rr, k * rr)} ${p(-rr, 0)}` +
        `C${p(-rr, -k * rr)} ${p(-k * rr, -rr)} ${p(0, -rr)}` +
        `C${p(L * 0.35, -rr - arch)} ${p(L * 0.65, -rc - arch)} ${p(L, -rc)}` +
        `C${p(L + k * rc, -rc)} ${p(L + rc, -k * rc)} ${p(L + rc, 0)}` +
        `C${p(L + rc, k * rc)} ${p(L + k * rc, rc)} ${p(L, rc)}` +
        // A slightly tucked-up belly gives the sleek cat waist.
        `C${p(L * 0.62, rc * 0.7)} ${p(L * 0.38, rr * 0.7)} ${p(0, rr)}Z`,
    );
    const bibAt = bodyPoint(pose, L + rc * 0.45, rc * 0.35);
    set(bib, 'cx', n(bibAt.x));
    set(bib, 'cy', n(bibAt.y));
    set(bib, 'rx', n(rc * 0.62));
    set(bib, 'ry', n(rc * 0.72));
    if (build.stripes) {
      // Stripes run down from the spine, following the arch of the back.
      let d = '';
      for (const s of [-0.25, 0.1, 0.3, 0.5, 0.7]) {
        const a = s * L;
        const t = clamp01(s);
        const r = lerp(rr, rc, t);
        const top = -r - arch * 3 * t * (1 - t) * 0.9 + 1;
        d += `M${p(a, top)}Q${p(a + 2.5, top + r * 0.5)} ${p(a + 1.2, -r * 0.1)}`;
      }
      set(bodyStripes, 'd', d);
    }
    // A soft rim of light along the back, so the shape reads even though it's all black.
    set(
      bodySheen,
      'd',
      `M${p(-rr * 0.5, -rr * 0.72)}C${p(L * 0.35, -rr - arch * 0.85)} ${p(L * 0.65, -rc - arch * 0.85)} ${p(L + rc * 0.2, -rc * 0.78)}` +
        `C${p(L * 0.65, -rc * 0.55 - arch * 0.8)} ${p(L * 0.35, -rr * 0.55 - arch * 0.8)} ${p(-rr * 0.5, -rr * 0.72)}Z`,
    );
  };

  const drawTail = (pose: CatPose, angles: number[]) => {
    const points = tailPoints(pose, angles);
    // A ribbon that tapers from the root to a rounded tip.
    const left: Point[] = [];
    const right: Point[] = [];
    const last = points.length - 1;
    points.forEach((pt, i) => {
      const a = points[Math.max(0, i - 1)]!;
      const b = points[Math.min(last, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const w = lerp(3.6, 2, i / last) * pose.tail.puff;
      left.push({ x: pt.x + nx * w, y: pt.y + ny * w });
      right.push({ x: pt.x - nx * w, y: pt.y - ny * w });
    });
    const tip = points[last]!;
    const before = points[last - 1]!;
    const tl = Math.hypot(tip.x - before.x, tip.y - before.y) || 1;
    const cap = { x: tip.x + ((tip.x - before.x) / tl) * 2.4 * pose.tail.puff, y: tip.y + ((tip.y - before.y) / tl) * 2.4 * pose.tail.puff };
    set(tail, 'd', smoothPath([...left, cap, ...right.reverse()]));
    if (build.stripes) {
      // Rings round the tail.
      let d = '';
      for (const i of [3, 5, 7, 9]) d += `M${n(left[i]!.x)},${n(left[i]!.y)}L${n(right[last - i]!.x)},${n(right[last - i]!.y)}`;
      set(tailRings, 'd', d);
    }
  };

  const draw = (pose: CatPose, tailAnglesNow: number[], frame: RaccoonFrame) => {
    const cx = (pose.hip.x + pose.chest.x) / 2;
    const sx = 1 / pose.squash ** 0.7;
    set(squash, 'transform', `translate(${n(cx)} 0) scale(${n(sx)} ${n(pose.squash)}) translate(${n(-cx)} 0)`);
    set(figure, 'transform', pose.rotate ? `rotate(${n(pose.rotate)} ${n(pose.pivot.x)} ${n(pose.pivot.y)})` : '');

    const lowest = Math.max(...LEGS.map((leg) => pose.paws[leg].y));
    const lift = clamp01(-lowest / 14);
    const hidden = frame.animation === 'dangle' || frame.animation === 'peek';
    set(shadow, 'display', hidden ? 'none' : 'inline');
    set(shadow, 'cx', n(cx + 2));
    set(shadow, 'rx', n(26 * sx * (1 - lift * 0.5)));
    set(shadow, 'opacity', n(1 - lift * 0.6));

    drawTail(pose, tailAnglesNow);
    drawBody(pose);
    for (const leg of LEGS) drawLeg(pose, leg);

    const centre = headCentre(pose);
    set(head, 'transform', `translate(${n(centre.x)} ${n(centre.y)}) rotate(${n(pose.head.angle)}) scale(${build.head})`);
    set(farEar, 'transform', `rotate(${n(-pose.ears * 50)} -4 -8)`);
    set(nearEar, 'transform', `rotate(${n(-pose.ears * 45)} 4 -9)`);
    set(whiskers, 'transform', `rotate(${n(pose.ears * 8 + pose.mouth * 10)} 15 3)`);

    // A paw raised to the face (grooming) goes in front of the head.
    const raised = pose.paws.frontNear.y < -14 && headCentre(pose).y < pose.chest.y;
    const nearFront = legs.frontNear.group;
    if (raised && nearFront.nextSibling !== null) squash.appendChild(nearFront);
    if (!raised && nearFront.nextSibling !== head) squash.insertBefore(nearFront, head);

    const open = pose.mouth > 0.04;
    set(mouth, 'display', open ? 'inline' : 'none');
    set(smile, 'display', open ? 'none' : 'inline');
    set(mouthHole, 'ry', n(0.6 + pose.mouth * 3.4));
    set(mouthHole, 'cy', n(4.4 + pose.mouth * 1.6));
    set(tongue, 'cy', n(4.6 + pose.mouth * 4.2));

    const wide = Math.max(0, -lids);
    for (const eye of eyes) {
      set(eye.group, 'transform', `translate(${eye.x} ${eye.y}) scale(${n((1 + wide * 0.6) * build.eyes)})`);
      const shut = lids > 0.85;
      set(eye.open, 'display', shut ? 'none' : 'inline');
      set(eye.shut, 'display', shut ? 'inline' : 'none');
      const px = pose.look.x * eye.rx * 0.38;
      const py = pose.look.y * eye.ry * 0.3;
      set(eye.pupil, 'cx', n(px));
      set(eye.pupil, 'cy', n(py));
      set(eye.pupil, 'rx', n(eye.rx * (0.18 + 0.5 * pose.pupil)));
      set(eye.glint, 'cx', n(px + eye.rx * 0.32));
      set(eye.glint, 'cy', n(py - eye.ry * 0.42));
      const lidY = -eye.ry - 1 + (eye.ry * 2 + 1) * Math.max(0, lids);
      set(eye.lid, 'y', n(-eye.ry - 2));
      set(eye.lid, 'height', n(Math.max(0, lidY + eye.ry + 2)));
    }
  };

  const flipMs = FLIP_MS * Math.min(1, motion.blend);
  const flipProgress = () => (flipMs <= 0 ? 1 : clamp01((clock - flipAt) / flipMs));
  const blendEnd = BLEND_END_MS * motion.blend;
  const animations: Partial<Record<AnimationName, Partial<AnimationSpec>>> = motion.onTwos
    ? Object.fromEntries(ANIMATION_NAMES.map((name) => [name, { fps: Math.min(12, ANIMATIONS[name].fps) }]))
    : CAT_ANIMATIONS;

  const renderer: RaccoonRenderer = {
    element: svg,
    figure,
    baseSize: { width: view.width * PX_PER_UNIT, height: view.height * PX_PER_UNIT },
    anchor: { x: -view.x / view.width, y: -view.y / view.height },
    peekSink: CAT.peekSink * PX_PER_UNIT,
    turnsItself: true,
    animations,

    setScale(scale) {
      set(svg, 'width', n(view.width * PX_PER_UNIT * scale));
      set(svg, 'height', n(view.height * PX_PER_UNIT * scale));
    },

    isSettling() {
      return clock - changedAt < blendEnd || flipProgress() < 1 || Math.abs(lids - lidTarget) > 0.02;
    },

    draw(frame) {
      const now = frame.clockMs ?? clock;
      const dt = Math.max(0, Math.min(100, now - clock));
      clock = now;
      const pose = bounced(catPoseFor(frame.animation, frame.timeMs, frame.keystrokes), frame, motion);
      const target: Shown = { pose, tail: tailAngles(pose) };

      if (frame.animation !== animation) {
        // Ease from whatever is on screen now, even mid-way through another change.
        from = shown;
        animation = frame.animation;
        changedAt = frame.clockMs === undefined ? -Infinity : clock;
      }
      shown = from ? mix(from, target, clock - changedAt, motion) : target;

      lidTarget = frame.eyes === 'closed' || frame.eyes === 'blink' ? 1 : frame.eyes === 'wide' ? Math.min(pose.lids, -0.25) : pose.lids;
      const snap = frame.clockMs === undefined || motion.blend <= 0;
      lids = snap ? lidTarget : lerp(lids, lidTarget, 1 - Math.exp(-dt / LID_MS));

      // Turning round: a quick cartoon turn. He squeezes narrow and tall with a little hop,
      // pops round at the middle, and springs back out, rather than mirroring instantly.
      const heading = frame.heading ?? 0;
      const across = Math.cos(heading);
      const want = across > 0.2 ? 1 : across < -0.2 ? -1 : facing;
      if (want !== facing) {
        // Turning back mid-flip carries on from the side he's showing now.
        flipFrom = smooth(flipProgress()) < 0.5 ? flipFrom : facing;
        facing = want;
        flipAt = frame.clockMs === undefined ? -Infinity : clock;
      }
      const f = smooth(flipProgress());
      const squeeze = Math.sin(Math.PI * f);
      const side = f < 0.5 ? flipFrom : facing;
      const hop = -3 * squeeze;
      set(turn, 'transform', `translate(0 ${n(hop)}) scale(${n(side * (1 - 0.6 * squeeze))} ${n(1 + 0.08 * squeeze)})`);

      draw(shown.pose, shown.tail, frame);
    },
  };
  renderer.setScale(1);
  return renderer;
}
