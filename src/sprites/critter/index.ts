import { PX_PER_UNIT, n } from '../svg';
import type { Point } from '../../core/geometry';
import type { AnimationName, AnimationSpec, RaccoonRenderer, ToyLook } from '../types';
import type { Act, ActInput } from './act';
import { CRITTER_TOY, type Build } from './build';
import { Motion, type Shown } from './motion';
import { createSkin, mouthAt } from './skin';

/**
 * Lifelike animals keep moving a little all the time (breathing, glances, a tail tip), so
 * resting animations redraw more often than the cartoon ones.
 */
const TIMING: Partial<Record<AnimationName, Partial<AnimationSpec>>> = {
  idle: { fps: 15 },
  sit: { fps: 15 },
  groom: { fps: 30 },
  yawn: { fps: 30 },
  confused: { fps: 20 },
  sleep: { fps: 8 },
  happy: { fps: 30 },
  peek: { fps: 12 },
};

let seeds = 0;

/**
 * Where a toy block he's holding is (its middle), drawing units from his feet: a raccoon
 * holds it in his hands, anyone else in their jaws, hanging just under them.
 */
function heldToy(build: Build, shown: Shown): Point {
  const { pose, view } = shown;
  if (build.species === 'raccoon') {
    const hands = view.at((pose.fnx + pose.ffx) / 2, (pose.fny + pose.ffy) / 2, 0);
    return { x: hands.x, y: hands.y - CRITTER_TOY * 0.1 };
  }
  const mouth = mouthAt(build, shown);
  return { x: mouth.x, y: mouth.y + CRITTER_TOY * 0.38 };
}

export function createCritter(
  doc: Document,
  build: Build,
  actor: (input: ActInput) => Act,
  className: string,
  label: string,
  toyLook: ToyLook = 'paint',
): RaccoonRenderer {
  const skin = createSkin(doc, build, className, label);
  const motion = new Motion(build, actor, 7 + ++seeds * 31);
  const { view } = build;
  let scale = 1;
  let scruff: { x: number; y: number } | null = null;
  let toy: Point | null = null;
  let lastShown: Shown | null = null;
  return {
    element: skin.svg,
    figure: skin.figure,
    baseSize: { width: view.width * PX_PER_UNIT, height: view.height * PX_PER_UNIT },
    anchor: { x: -view.x / view.width, y: -view.y / view.height },
    peekSink: build.peekSink * PX_PER_UNIT,
    turnsItself: true,
    animations: TIMING,
    isSettling: () => motion.settling,
    holdPoint: () => (scruff ? { x: scruff.x * PX_PER_UNIT * scale, y: scruff.y * PX_PER_UNIT * scale } : null),
    toyReach: build.toyReach * PX_PER_UNIT,
    toySize: CRITTER_TOY * PX_PER_UNIT,
    toyLook,
    carriesToys: build.species === 'raccoon',
    deskReach: { x: build.desk.x * PX_PER_UNIT, y: build.desk.y * PX_PER_UNIT },
    toyPoint: () => (toy ? { x: toy.x * PX_PER_UNIT * scale, y: toy.y * PX_PER_UNIT * scale } : null),
    dress(d) {
      skin.dress(d);
      // Redrawn now, so the new hat is in place even while he rests.
      if (lastShown) skin.draw(lastShown);
    },
    setScale(next) {
      scale = next;
      skin.svg.setAttribute('width', n(view.width * PX_PER_UNIT * scale));
      skin.svg.setAttribute('height', n(view.height * PX_PER_UNIT * scale));
    },
    draw(frame) {
      const shown = motion.update(frame, 1 / (PX_PER_UNIT * scale));
      lastShown = shown;
      scruff = shown.scruff;
      toy = heldToy(build, shown);
      skin.draw(shown);
    },
  };
}
