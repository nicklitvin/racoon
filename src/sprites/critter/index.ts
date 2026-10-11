import { PX_PER_UNIT, n } from '../svg';
import type { AnimationName, AnimationSpec, RaccoonRenderer } from '../types';
import type { Act, ActInput } from './act';
import type { Build } from './build';
import { Motion } from './motion';
import { createSkin } from './skin';

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

export function createCritter(
  doc: Document,
  build: Build,
  actor: (input: ActInput) => Act,
  className: string,
  label: string,
): RaccoonRenderer {
  const skin = createSkin(doc, build, className, label);
  const motion = new Motion(build, actor, 7 + ++seeds * 31);
  const { view } = build;
  let scale = 1;
  let scruff: { x: number; y: number } | null = null;
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
    setScale(next) {
      scale = next;
      skin.svg.setAttribute('width', n(view.width * PX_PER_UNIT * scale));
      skin.svg.setAttribute('height', n(view.height * PX_PER_UNIT * scale));
    },
    draw(frame) {
      const shown = motion.update(frame, 1 / (PX_PER_UNIT * scale));
      scruff = shown.scruff;
      skin.draw(shown);
    },
  };
}
