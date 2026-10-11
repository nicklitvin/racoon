import type { Point } from '../core/geometry';
import { CAT, bodyPoint, catPoseFor, headCentre, legRoot, smooth, spineLength, tailAngles, tailPoints, type CatPose } from './catPose';
import type { LegName } from './rig';
import { n, PX_PER_UNIT, svgWriter } from './svg';
import type { AnimationName, AnimationSpec, RaccoonFrame, RaccoonRenderer } from './types';

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
/** Eases out past the target and back: follow-through. */
const overshoot = (v: number) => {
  const x = clamp01(v) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};
const angleDiff = (from: number, to: number) => ((((to - from + 180) % 360) + 360) % 360) - 180;

/** A slightly oversized head reads as young and cute. */
const HEAD_SCALE = 1.1;

const LEGS: LegName[] = ['backFar', 'frontFar', 'backNear', 'frontNear'];

/** What's on screen: a pose with the tail stored as per-segment angles, so it can be eased smoothly. */
interface Shown {
  pose: CatPose;
  tail: number[];
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function mix(from: Shown, to: Shown, sinceMs: number): Shown {
  const w = (part: keyof typeof BLEND, ease: (v: number) => number = smooth) =>
    ease((sinceMs - BLEND[part].delay) / BLEND[part].duration);
  const body = w('body');
  const head = w('head');
  const ears = w('ears', overshoot);
  const tail = w('tail', overshoot);
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

/**
 * A sleek 2D black cat in a hand-drawn cartoon style. Poses come from `catPoseFor`;
 * this renderer adds what makes it feel animated rather than mechanical: each change
 * of animation is eased in part by part (body first, the tail last and overshooting),
 * eyelids close softly, and turning round is a quick squash-through flip instead of
 * an instant mirror.
 */
export function createBlackCat(doc: Document = document): RaccoonRenderer {
  const { make, set } = svgWriter(doc);
  const { view } = CAT;
  const svg = make('svg', {
    class: 'raccoon raccoon-cat',
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': 'black cat',
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

  const tail = make('path', { class: 'c-fur' }, squash);
  const makeLeg = (name: LegName) => {
    const cls = name.endsWith('Far') ? 'c-far' : 'c-fur';
    const group = make('g', {}, squash);
    // Near legs get a faint light edge so they read against the black body.
    const edge = name.endsWith('Near') ? make('path', { class: 'c-limb c-edge' }, group) : null;
    const upper = make('ellipse', { class: cls }, group);
    const limb = make('path', { class: `c-limb ${cls}` }, group);
    const paw = make('ellipse', { rx: 3.9, ry: 2.6, class: `${cls} ${edge ? 'c-paw-edge' : ''}` }, group);
    return { group, edge, upper, limb, paw };
  };
  const legs = {} as Record<LegName, ReturnType<typeof makeLeg>>;
  legs.backFar = makeLeg('backFar');
  legs.frontFar = makeLeg('frontFar');
  const body = make('path', { class: 'c-fur' }, squash);
  const bodySheen = make('path', { class: 'c-sheen' }, squash);
  legs.backNear = makeLeg('backNear');
  legs.frontNear = makeLeg('frontNear');

  const head = make('g', {}, squash);
  const farEar = make('path', { d: 'M-9,-5 Q-9.5,-17 -7,-23 Q-1,-17 2,-10 Z', class: 'c-far' }, head);
  make('ellipse', { cx: 0, cy: -1, rx: 13, ry: 11.5, class: 'c-fur' }, head);
  make('ellipse', { cx: 1.5, cy: 4, rx: 12.5, ry: 8, class: 'c-fur' }, head);
  make('ellipse', { cx: 10.5, cy: 3.4, rx: 6, ry: 4.4, class: 'c-fur' }, head);
  const nearEar = make('g', {}, head);
  make('path', { d: 'M-2,-9 Q1,-20 5,-25 Q9,-17 11,-7 Z', class: 'c-fur' }, nearEar);
  make('path', { d: 'M1,-10 Q3,-17 5,-20.5 Q7.5,-15 8.5,-9 Z', class: 'c-ear-inner' }, nearEar);
  make('ellipse', { cx: -4, cy: -7, rx: 6.5, ry: 2.8, transform: 'rotate(-20 -4 -7)', class: 'c-sheen' }, head);

  const eyes = [
    { x: 4.5, y: -2.5, rx: 4.4, ry: 5.4 },
    { x: 12.6, y: -2.8, rx: 2.9, ry: 5 },
  ].map(({ x, y, rx, ry }, i) => {
    const group = make('g', { transform: `translate(${x} ${y})` }, head);
    const clipId = `${irisId}-eye${i}`;
    const clip = make('clipPath', { id: clipId }, defs);
    make('ellipse', { rx, ry }, clip);
    const open = make('g', { 'clip-path': `url(#${clipId})` }, group);
    make('ellipse', { rx, ry, fill: `url(#${irisId})` }, open);
    const pupil = make('ellipse', { rx: 1, ry: ry * 0.82, class: 'c-pupil' }, open);
    const glint = make('circle', { r: Math.min(1.3, rx * 0.3), class: 'c-glint' }, open);
    const lid = make('rect', { x: -rx - 1, width: rx * 2 + 2, class: 'c-fur' }, open);
    const shut = make('path', { d: `M${-rx},0.3 Q0,${n(ry * 0.5)} ${rx},0.3`, class: 'c-line', display: 'none' }, group);
    return { group, open, pupil, glint, lid, shut, rx, ry, x, y };
  });
  make('path', { d: 'M14.5,-0.6 L17.6,-0.8 Q17.4,1.3 16.1,1.9 Q14.8,1.2 14.5,-0.6 Z', class: 'c-nose' }, head);
  const smile = make('path', { d: 'M16,2 Q16.2,4.2 14.2,4.6 M16,2 Q16.6,4 18.2,4', class: 'c-line' }, head);
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
    const rr = CAT.rump * pose.breathe;
    const rc = CAT.chest * pose.breathe;
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
    set(head, 'transform', `translate(${n(centre.x)} ${n(centre.y)}) rotate(${n(pose.head.angle)}) scale(${HEAD_SCALE})`);
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
      set(eye.group, 'transform', `translate(${eye.x} ${eye.y}) scale(${n(1 + wide * 0.6)})`);
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

  const flipProgress = () => clamp01((clock - flipAt) / FLIP_MS);

  const renderer: RaccoonRenderer = {
    element: svg,
    figure,
    baseSize: { width: view.width * PX_PER_UNIT, height: view.height * PX_PER_UNIT },
    anchor: { x: -view.x / view.width, y: -view.y / view.height },
    peekSink: CAT.peekSink * PX_PER_UNIT,
    turnsItself: true,
    animations: CAT_ANIMATIONS,

    setScale(scale) {
      set(svg, 'width', n(view.width * PX_PER_UNIT * scale));
      set(svg, 'height', n(view.height * PX_PER_UNIT * scale));
    },

    isSettling() {
      return clock - changedAt < BLEND_END_MS || flipProgress() < 1 || Math.abs(lids - lidTarget) > 0.02;
    },

    draw(frame) {
      const now = frame.clockMs ?? clock;
      const dt = Math.max(0, Math.min(100, now - clock));
      clock = now;
      const pose = catPoseFor(frame.animation, frame.timeMs, frame.keystrokes);
      const target: Shown = { pose, tail: tailAngles(pose) };

      if (frame.animation !== animation) {
        // Ease from whatever is on screen now, even mid-way through another change.
        from = shown;
        animation = frame.animation;
        changedAt = frame.clockMs === undefined ? -Infinity : clock;
      }
      shown = from ? mix(from, target, clock - changedAt) : target;

      lidTarget = frame.eyes === 'closed' || frame.eyes === 'blink' ? 1 : frame.eyes === 'wide' ? Math.min(pose.lids, -0.25) : pose.lids;
      lids = frame.clockMs === undefined ? lidTarget : lerp(lids, lidTarget, 1 - Math.exp(-dt / LID_MS));

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
