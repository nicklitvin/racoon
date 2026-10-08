import { poseFor } from './pose';
import { legRoot, legRotation, RIG, type LegName } from './rig';
import { n, PX_PER_UNIT, svgWriter } from './svg';
import type { RaccoonFrame, RaccoonRenderer } from './types';

/** Ring segments of the tail, root to tip, in tail coordinates (the tail points left and up). */
const TAIL_RINGS: [x: number, y: number, r: number, cls: string][] = [
  [-3, -1, 7, 'r-fur'],
  [-10, -3, 6.8, 'r-dark'],
  [-17, -6, 6.4, 'r-fur'],
  [-23, -10, 5.8, 'r-dark'],
  [-28, -15, 5, 'r-fur'],
  [-31.5, -19, 3.6, 'r-dark'],
];

/** Eye centres in head coordinates (far eye, near eye). */
const EYES = [
  { x: 10, y: -5.5 },
  { x: 19, y: -5.5 },
];

/**
 * The "classic" raccoon drawn as inline SVG. The shapes are built once; each draw only updates
 * transforms and a few attributes from the current pose, and skips anything unchanged.
 * Colours come from CSS classes (see styles.css), so themes can restyle him.
 */
export function createSvgRaccoon(doc: Document = document): RaccoonRenderer {
  const { make, set } = svgWriter(doc);

  const { view } = RIG;
  const svg = make('svg', {
    class: 'raccoon raccoon-classic',
    viewBox: `${view.x} ${view.y} ${view.width} ${view.height}`,
    role: 'img',
    'aria-label': 'raccoon',
  });
  const figure = make('g', { class: 'raccoon-figure' }, svg);
  const body = make('g', {}, figure);

  const legs = {} as Record<LegName, { group: SVGElement; bone: SVGElement }>;
  const makeLeg = (name: LegName, cls: string) => {
    const group = make('g', {}, body);
    const bone = make('rect', { x: -4, y: 0, width: 8, height: RIG.legLength, rx: 4, class: cls }, group);
    legs[name] = { group, bone };
  };

  // Back to front: far legs, tail, body, head, near legs (so a grooming paw shows in front of the face).
  makeLeg('backFar', 'r-leg-far');
  makeLeg('frontFar', 'r-leg-far');

  const tail = make('g', {}, body);
  for (const [x, y, r, cls] of TAIL_RINGS) make('circle', { cx: x, cy: y, r, class: cls }, tail);

  const torso = make('g', {}, body);
  make('ellipse', { cx: -3, cy: -28, rx: 27, ry: 13, class: 'r-fur' }, torso);
  make('ellipse', { cx: 0, cy: -19.5, rx: 18, ry: 4.5, class: 'r-fur-light' }, torso);

  const head = make('g', {}, body);
  const farEar = make('polygon', { points: '-1,-13 3,-26 9,-15', class: 'r-dark' }, head);
  make('ellipse', { cx: 8, cy: -6, rx: 15, ry: 12.5, class: 'r-fur' }, head);
  const nearEar = make('g', {}, head);
  make('polygon', { points: '6,-14 13,-27 19,-13', class: 'r-fur' }, nearEar);
  make('polygon', { points: '9,-15 13,-23 16,-14.5', class: 'r-ear-inner' }, nearEar);
  make('ellipse', { cx: 14, cy: -10.5, rx: 10, ry: 3.6, class: 'r-light' }, head);
  make('ellipse', { cx: 14.5, cy: -5.5, rx: 11.5, ry: 4.6, class: 'r-dark' }, head);
  make('ellipse', { cx: 21, cy: 2, rx: 8.5, ry: 5, class: 'r-light' }, head);
  make('ellipse', { cx: 28.5, cy: 0, rx: 2.6, ry: 2, class: 'r-dark' }, head);
  const mouth = make('ellipse', { cx: 22, cy: 6, rx: 2.6, ry: 0, class: 'r-mouth', display: 'none' }, head);

  const eyes = EYES.map(({ x, y }) => {
    const group = make('g', { transform: `translate(${x} ${y})` }, head);
    const open = make('g', {}, group);
    make('circle', { r: 2.7, class: 'r-eye' }, open);
    const pupil = make('g', {}, open);
    make('circle', { r: 1.8, class: 'r-pupil' }, pupil);
    make('circle', { cx: 0.6, cy: -0.6, r: 0.6, class: 'r-glint' }, pupil);
    const lid = make('path', { d: 'M-2.6,-0.3 Q0,1.8 2.6,-0.3', class: 'r-lid', display: 'none' }, group);
    return { open, pupil, lid };
  });

  makeLeg('backNear', 'r-leg');
  makeLeg('frontNear', 'r-leg');

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
      const { hip, neck, tailRoot, scruff } = RIG;

      set(figure, 'transform', `rotate(${n(pose.swing)} ${scruff.x} ${scruff.y}) translate(0 ${n(pose.y)})`);
      set(body, 'transform', `rotate(${n(pose.pitch)} ${hip.x} ${hip.y})`);
      set(torso, 'transform', `translate(0 -15) scale(1 ${n(pose.breathe)}) translate(0 15)`);

      for (const name of Object.keys(legs) as LegName[]) {
        const root = legRoot(name);
        set(legs[name].group, 'transform', `translate(${root.x} ${root.y}) rotate(${n(legRotation(pose, name))})`);
        set(legs[name].bone, 'height', n(Math.max(2, pose.legs[name].length)));
      }

      set(tail, 'transform', `translate(${tailRoot.x} ${tailRoot.y}) rotate(${n(pose.tail.angle)}) scale(${n(pose.tail.puff)})`);
      set(head, 'transform', `translate(${n(neck.x + pose.head.x)} ${n(neck.y + pose.head.y)}) rotate(${n(pose.head.angle)})`);
      set(nearEar, 'transform', `rotate(${n(-pose.ears * 40)} 12 -14)`);
      set(farEar, 'transform', `rotate(${n(-pose.ears * 40)} 5 -14)`);

      set(mouth, 'display', pose.mouth > 0.02 ? 'inline' : 'none');
      set(mouth, 'ry', n(pose.mouth * 3));

      const shut = frame.eyes === 'closed' || frame.eyes === 'blink';
      const eyeScale = frame.eyes === 'wide' ? 1.3 : 1;
      for (const eye of eyes) {
        set(eye.open, 'display', shut ? 'none' : 'inline');
        set(eye.lid, 'display', shut ? 'inline' : 'none');
        set(eye.open, 'transform', `scale(${eyeScale})`);
        set(eye.pupil, 'transform', `translate(${n(pose.look.x * 0.9)} ${n(pose.look.y * 0.9)})`);
      }
    },
  };
  renderer.setScale(1);
  return renderer;
}
