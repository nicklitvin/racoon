import { ANIMATIONS } from './animations';
import { poseFor } from './pose';
import { legRoot, legRotation, RIG, type LegName, type Pose } from './rig';
import { n, PX_PER_UNIT, svgWriter } from './svg';
import type { RaccoonFrame, RaccoonRenderer } from './types';

/** How far back in time the "trailing" parts (tail tip, head, ears) look, in ms. */
const LAG_MS = 90;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Tail balls from root to tip: position along the tail (0..1), radius, colour. */
const TAIL_BALLS: [s: number, r: number, cls: string][] = [
  [0, 7.5, 'r-fur'],
  [0.17, 8.2, 'r-dark'],
  [0.34, 8.4, 'r-fur'],
  [0.51, 7.9, 'r-dark'],
  [0.67, 7, 'r-fur'],
  [0.83, 5.6, 'r-dark'],
  [1, 3.8, 'r-dark'],
];
/** The tail's straight line in tail coordinates (pointing left and up), before it curls. */
const TAIL_FROM = { x: -2, y: -1 };
const TAIL_TO = { x: -30, y: -19 };

/** Eye centres in head coordinates (far eye, near eye). */
const EYES = [
  { x: 10.5, y: -6.5 },
  { x: 20, y: -6.5 },
];

/** Proportions that set the round raccoons apart. Colours live in CSS, keyed on `className`. */
interface Build {
  className: string;
  /** Head size; a bigger head reads as younger and cuter. */
  head: number;
  /** Torso width and height. */
  bodyX: number;
  bodyY: number;
  /** Tail fluff. */
  tail: number;
  eyes: number;
}

export type CartoonVariant = 'cartoon' | 'plush';

const BUILDS: Record<CartoonVariant, Build> = {
  cartoon: { className: 'raccoon-cartoon', head: 1, bodyX: 1, bodyY: 1, tail: 1, eyes: 1 },
  // A chibi plushie: big head, bean body, huge eyes, extra fluffy tail.
  plush: { className: 'raccoon-cartoon raccoon-plush', head: 1.22, bodyX: 1.08, bodyY: 1.14, tail: 1.2, eyes: 1.4 },
};

/** The same animation a moment earlier, for secondary motion. Wraps around loops. */
function laggedPose(frame: RaccoonFrame): Pose {
  const spec = ANIMATIONS[frame.animation];
  const t = frame.timeMs - LAG_MS;
  const earlier = spec.loop ? ((t % spec.durationMs) + spec.durationMs) % spec.durationMs : Math.max(0, t);
  return poseFor(frame.animation, earlier, frame.keystrokes);
}

/**
 * The "cartoon" raccoon: chubby, round shapes and noodle legs, plus secondary motion
 * so he feels soft rather than rigid. The tail, head and ears trail the body a little,
 * and the body squashes and stretches as he bounces. That motion comes from comparing
 * the pose with the same animation a moment earlier, so drawing stays a pure function
 * of the frame. Uses the same skeleton and poses as the classic raccoon.
 */
export function createCartoonRaccoon(doc: Document = document, variant: CartoonVariant = 'cartoon'): RaccoonRenderer {
  const { make, set } = svgWriter(doc);
  const build = BUILDS[variant];

  const { view } = RIG;
  const svg = make('svg', {
    class: `raccoon ${build.className}`,
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': 'raccoon',
  });
  // A soft shadow on the ground. It stays put when he hops, which sells the jump.
  const shadow = make('ellipse', { cx: 0, cy: 0, rx: 30, ry: 2.6, class: 'r-shadow' }, svg);
  const figure = make('g', { class: 'raccoon-figure' }, svg);
  const body = make('g', {}, figure);

  // Back to front: tail, far legs, near legs, body, head, then any paw raised to the face.
  const tail = make('g', {}, body);
  const tailBalls = TAIL_BALLS.map(([, r, cls]) => make('circle', { r, class: cls }, tail));

  const legs = {} as Record<LegName, { group: SVGElement; bone: SVGElement; paw: SVGElement }>;
  const makeLeg = (name: LegName, cls: string) => {
    const group = make('g', {}, body);
    const bone = make('path', { class: `r-noodle ${cls}` }, group);
    const paw = make('ellipse', { rx: 5.2, ry: 3.4, class: cls }, group);
    legs[name] = { group, bone, paw };
  };
  makeLeg('backFar', 'r-leg-far');
  makeLeg('frontFar', 'r-leg-far');
  makeLeg('backNear', 'r-leg');
  makeLeg('frontNear', 'r-leg');

  const torso = make('g', {}, body);
  make('circle', { cx: -17, cy: -25, r: 13, class: 'r-fur' }, torso);
  make('ellipse', { cx: -2, cy: -28, rx: 26, ry: 15, class: 'r-fur' }, torso);
  make('circle', { cx: 13, cy: -27, r: 12.5, class: 'r-fur' }, torso);
  make('ellipse', { cx: 1, cy: -18, rx: 17, ry: 5.5, class: 'r-fur-light' }, torso);
  make('ellipse', { cx: -6, cy: -38, rx: 15, ry: 3.6, class: 'r-sheen' }, torso);

  const head = make('g', {}, body);
  const farEar = make('path', { d: 'M-2,-13 C-4,-28 7,-32 10,-18 Z', class: 'r-dark' }, head);
  make('ellipse', { cx: 9, cy: -7, rx: 17, ry: 14.5, class: 'r-fur' }, head);
  make('ellipse', { cx: 4, cy: 2.5, rx: 8, ry: 5.5, class: 'r-light' }, head);
  const nearEar = make('g', {}, head);
  make('path', { d: 'M5,-15 C4,-31 18,-33 20,-16 Z', class: 'r-fur' }, nearEar);
  make('path', { d: 'M8.5,-16 C8.5,-27 16,-28 17,-17 Z', class: 'r-ear-pink' }, nearEar);
  make('ellipse', { cx: 15, cy: -14, rx: 11, ry: 4, class: 'r-light' }, head);
  // Bandit mask: a band across the face with a round patch around each eye.
  make('ellipse', { cx: 15.5, cy: -6.5, rx: 13.5, ry: 5.2, class: 'r-dark' }, head);
  for (const { x, y } of EYES) make('circle', { cx: x, cy: y + 0.6, r: 5.4, class: 'r-dark' }, head);
  make('ellipse', { cx: 22.5, cy: 2.5, rx: 10, ry: 6.5, class: 'r-light' }, head);
  make('ellipse', { cx: 18.5, cy: 4.2, rx: 3, ry: 1.6, class: 'r-blush' }, head);
  make('ellipse', { cx: 31, cy: -0.5, rx: 3.5, ry: 2.7, class: 'r-dark' }, head);
  make('circle', { cx: 31.8, cy: -1.5, r: 0.85, class: 'r-light' }, head);
  const smile = make('path', { d: 'M24.5,5.4 Q27,7.6 29.8,5', class: 'r-line' }, head);
  const mouth = make('ellipse', { cx: 26.5, cy: 6.8, rx: 2.8, ry: 0, class: 'r-mouth', display: 'none' }, head);

  const eyes = EYES.map(({ x, y }) => {
    const group = make('g', { transform: `translate(${x} ${y})` }, head);
    const open = make('g', {}, group);
    make('circle', { r: 3.6, class: 'r-eye' }, open);
    const pupil = make('g', {}, open);
    make('circle', { r: 2.5, class: 'r-pupil' }, pupil);
    make('circle', { cx: 0.9, cy: -0.9, r: 0.9, class: 'r-glint' }, pupil);
    make('circle', { cx: -0.8, cy: 0.9, r: 0.4, class: 'r-glint' }, pupil);
    const lid = make('path', { d: 'M-3,-0.4 Q0,2.4 3,-0.4', class: 'r-lid', display: 'none' }, group);
    return { open, pupil, lid };
  });

  // A paw raised above the shoulder (grooming) is moved here so it shows in front of the face.
  const raised = make('g', {}, body);

  const renderer: RaccoonRenderer = {
    element: svg,
    figure,
    baseSize: { width: view.width * PX_PER_UNIT, height: view.height * PX_PER_UNIT },

    setScale(scale) {
      set(svg, 'width', n(view.width * PX_PER_UNIT * scale));
      set(svg, 'height', n(view.height * PX_PER_UNIT * scale));
    },

    draw(frame: RaccoonFrame) {
      const pose = poseFor(frame.animation, frame.timeMs, frame.keystrokes);
      const prev = laggedPose(frame);
      const { hip, neck, tailRoot, scruff } = RIG;
      // Positive while moving down. Drives squash, stretch and the trailing parts.
      const dy = pose.y - prev.y;
      const dPitch = pose.pitch - prev.pitch;

      set(figure, 'transform', `rotate(${n(pose.swing)} ${scruff.x} ${scruff.y}) translate(0 ${n(pose.y)})`);
      set(body, 'transform', `rotate(${n(pose.pitch)} ${hip.x} ${hip.y})`);

      const stretch = clamp(-dy * 0.016, -0.08, 0.08);
      const sy = pose.breathe * (1 + stretch) * build.bodyY;
      const sx = (1 - stretch * 0.6) * build.bodyX;
      set(torso, 'transform', `translate(0 -13) scale(${n(sx)} ${n(sy)}) translate(0 13)`);

      const dangling = frame.animation === 'dangle';
      const lift = clamp(-pose.y / 24, 0, 0.6);
      set(shadow, 'display', dangling ? 'none' : 'inline');
      set(shadow, 'rx', n(30 * (1 - lift)));
      set(shadow, 'opacity', n(1 - lift));

      for (const name of Object.keys(legs) as LegName[]) {
        const leg = legs[name];
        const root = legRoot(name);
        const { angle } = pose.legs[name];
        const length = Math.max(4, pose.legs[name].length);
        const front = name.startsWith('front');
        // A soft knee: front legs bow back, back legs forward, more so mid-stride.
        const bend = (front ? -1.6 : 1.6) - clamp(angle, -60, 60) * 0.07;
        const end = length - 2.8;
        set(leg.group, 'transform', `translate(${root.x} ${root.y}) rotate(${n(legRotation(pose, name))})`);
        set(leg.bone, 'd', `M0,0 Q${n(bend * 2)},${n(end / 2)} 0,${n(end)}`);
        // Counter-rotated so the paw stays flat on screen, toes forward.
        set(leg.paw, 'cx', '1.2');
        set(leg.paw, 'cy', n(end - 0.6));
        set(leg.paw, 'transform', `rotate(${n(angle)} 0 ${n(end)})`);
        const parent = name === 'frontNear' && angle > 90 ? raised : body;
        if (leg.group.parentNode !== parent) {
          if (parent === raised) raised.appendChild(leg.group);
          else body.insertBefore(leg.group, torso);
        }
      }

      // The tail curls against its own movement and the body's bounce, so the tip trails.
      const curl = clamp(5 + (pose.tail.angle - prev.tail.angle) * 0.35 - dy * 0.9 + dPitch * 0.2, -9, 14);
      const mid = { x: (TAIL_FROM.x + TAIL_TO.x) / 2, y: (TAIL_FROM.y + TAIL_TO.y) / 2 };
      const along = { x: TAIL_TO.x - TAIL_FROM.x, y: TAIL_TO.y - TAIL_FROM.y };
      const len = Math.hypot(along.x, along.y);
      const ctrl = { x: mid.x + (-along.y / len) * curl * 2, y: mid.y + (along.x / len) * curl * 2 };
      TAIL_BALLS.forEach(([s], i) => {
        const u = 1 - s;
        set(tailBalls[i]!, 'cx', n(u * u * TAIL_FROM.x + 2 * u * s * ctrl.x + s * s * TAIL_TO.x));
        set(tailBalls[i]!, 'cy', n(u * u * TAIL_FROM.y + 2 * u * s * ctrl.y + s * s * TAIL_TO.y));
      });
      set(tail, 'transform', `translate(${tailRoot.x} ${tailRoot.y}) rotate(${n(pose.tail.angle)}) scale(${n(pose.tail.puff * build.tail)})`);

      // The head is heavy: it trails pitch changes and nods with the bounce.
      const headAngle = pose.head.angle - dPitch * 0.35 + clamp(dy * 1.2, -6, 6);
      set(head, 'transform', `translate(${n(neck.x + pose.head.x)} ${n(neck.y + pose.head.y)}) rotate(${n(headAngle)}) scale(${build.head})`);
      const flop = clamp(-dy * 3, -14, 14);
      set(nearEar, 'transform', `rotate(${n(-pose.ears * 40 + flop)} 12.5 -15)`);
      set(farEar, 'transform', `rotate(${n(-pose.ears * 40 + flop)} 4 -14)`);

      const yawning = pose.mouth > 0.02;
      set(mouth, 'display', yawning ? 'inline' : 'none');
      set(mouth, 'ry', n(pose.mouth * 3.4));
      set(smile, 'display', yawning ? 'none' : 'inline');

      const shut = frame.eyes === 'closed' || frame.eyes === 'blink';
      const eyeScale = (frame.eyes === 'wide' ? 1.25 : 1) * build.eyes;
      for (const eye of eyes) {
        set(eye.open, 'display', shut ? 'none' : 'inline');
        set(eye.lid, 'display', shut ? 'inline' : 'none');
        set(eye.open, 'transform', `scale(${eyeScale})`);
        set(eye.pupil, 'transform', `translate(${n(pose.look.x * 1.1)} ${n(pose.look.y * 1.1)})`);
      }
    },
  };
  renderer.setScale(1);
  return renderer;
}
