import { n, PX_PER_UNIT } from '../svg';
import type { AnimationName, AnimationSpec, RaccoonFrame, RaccoonRenderer } from '../types';
import { CHIBI_VIEW, createChibiSkin } from './draw';
import { blendPose, chibiPose, poseDistance, scruffPoint, toyHoldPoint, type ChibiPose } from './pose';
import { CHIBI_TOY, type ChibiBuild, type Pt } from './species';

/** Resting animations redraw often enough for the breathing and the floating marks to look smooth. */
export const TIMING: Partial<Record<AnimationName, Partial<AnimationSpec>>> = {
  idle: { fps: 20 },
  sit: { fps: 20 },
  groom: { fps: 30 },
  yawn: { fps: 30 },
  confused: { fps: 20 },
  sleep: { fps: 15 },
  happy: { fps: 30 },
  peek: { fps: 12 },
};

/** Which way you see him: side on, three-quarters towards you or away, or straight on. */
export type ChibiView = 'side' | 'frontQuarter' | 'backQuarter' | 'front' | 'back';

/** How steep a heading (0 across the screen, 1 straight up or down it) each view starts at. */
const QUARTER_FROM = 0.38;
const STRAIGHT_FROM = 0.9;
/** How far past a boundary he has to go to change view. */
const HOLD = 0.05;

/** The view for a heading, given the one he's in now. */
export function viewFor(heading: number, current: ChibiView): ChibiView {
  const sin = Math.sin(heading);
  const steep = Math.abs(sin);
  const level = current === 'side' ? 0 : current === 'frontQuarter' || current === 'backQuarter' ? 1 : 2;
  // Each boundary sits a little further away from the view he's in, so he has to go
  // clearly past it to change.
  const quarterFrom = QUARTER_FROM + (level === 0 ? HOLD : -HOLD);
  const straightFrom = STRAIGHT_FROM + (level === 2 ? -HOLD : HOLD);
  if (steep > straightFrom) return sin > 0 ? 'front' : 'back';
  if (steep > quarterFrom) return sin > 0 ? 'frontQuarter' : 'backQuarter';
  return 'side';
}

/** How long a change of animation takes to blend through, and a turn round to flip. */
const BLEND_MS = 240;
const FLIP_MS = 90;

/**
 * Where a chibi is between frames: how far round its stride it is (kept in step with the
 * ground, so paws don't slide), which way it faces, and the pose it's blending from.
 */
export class ChibiMotion {
  phase = 0;
  facing = 1;
  /** The drawn facing, from -1 to 1: it squashes through zero as he turns round. */
  flip = 1;
  pose: ChibiPose | null = null;
  moving = 0;
  /**
   * Which way you see him: side on, or (walking towards you down the screen, or away up it)
   * from the front or behind. Only drawings that have those views use it.
   */
  view: ChibiView = 'side';
  private clock = -1;
  private animation: AnimationName | null = null;
  private from: ChibiPose | null = null;
  private changedAt = 0;

  constructor(private readonly build: ChibiBuild) {}

  get settling(): boolean {
    return Math.abs(this.flip - this.facing) > 0.01 || (this.from !== null && this.clock - this.changedAt < BLEND_MS);
  }

  update(frame: RaccoonFrame, unitsPerPx: number): ChibiPose {
    const clock = frame.clockMs ?? frame.timeMs;
    const dt = this.clock < 0 ? 0 : Math.min(0.1, Math.max(0, (clock - this.clock) / 1000));
    this.clock = clock;

    // Facing: the way he's heading, held while he goes straight up or down the screen.
    const heading = frame.heading ?? 0;
    const cos = Math.cos(heading);
    if (frame.animation !== 'dangle' && Math.abs(cos) > 0.2) this.facing = cos < 0 ? -1 : 1;
    // Going up or down the screen, you see him from behind or in front, and going diagonally,
    // three-quarters. Each view holds until he's clearly going another way, so it doesn't
    // flicker between two on a heading halfway between them.
    const walking = frame.animation === 'walk' || frame.animation === 'run' || frame.animation === 'chase' || frame.animation === 'leap';
    this.view = walking ? viewFor(heading, this.view) : 'side';
    const turn = dt / (FLIP_MS / 1000);
    this.flip = this.flip < this.facing ? Math.min(this.facing, this.flip + turn) : Math.max(this.facing, this.flip - turn);

    // The stride follows the ground he covers.
    const v = frame.velocity ?? { x: 0, y: 0 };
    const speed = Math.hypot(v.x, v.y) * unitsPerPx;
    const { stride } = this.build;
    const cycle = frame.animation === 'walk' || frame.animation === 'carry' ? stride.walkCycle : stride.runCycle;
    const locomotion = frame.animation === 'walk' || frame.animation === 'carry' || frame.animation === 'run' || frame.animation === 'chase' || frame.animation === 'leap';
    if (locomotion) this.phase = (this.phase + (Math.max(speed, cycle * 1.2) * dt) / cycle) % 1;
    this.moving += ((locomotion ? Math.min(1.5, speed / 60) : 0) - this.moving) * Math.min(1, dt * 6);

    const gaze: Pt | null = frame.gaze ? { x: frame.gaze.x * unitsPerPx * this.facing, y: frame.gaze.y * unitsPerPx } : null;
    const target = chibiPose(this.build, {
      animation: frame.animation,
      t: frame.timeMs,
      clock,
      phase: this.phase,
      keystrokes: frame.keystrokes,
      eyes: frame.eyes,
      gaze,
    });

    if (frame.animation !== this.animation) {
      this.from = this.pose;
      this.changedAt = clock;
      this.animation = frame.animation;
    }
    const k = (clock - this.changedAt) / BLEND_MS;
    const pose = this.from && k < 1 ? blendPose(this.from, target, k * k * (3 - 2 * k)) : target;
    if (k >= 1 || poseDistance(pose, target) < 0.01) this.from = null;
    this.pose = pose;
    return pose;
  }
}

export function createChibi(doc: Document, build: ChibiBuild, className: string, label: string): RaccoonRenderer {
  const skin = createChibiSkin(doc, build, className, label);
  const motion = new ChibiMotion(build);
  const view = CHIBI_VIEW;
  let scale = 1;
  let scruff: Pt | null = null;
  let toy: Pt | null = null;
  return {
    element: skin.svg,
    figure: skin.figure,
    baseSize: { width: view.width * PX_PER_UNIT, height: view.height * PX_PER_UNIT },
    anchor: { x: -view.x / view.width, y: -view.y / view.height },
    peekSink: build.peekSink * PX_PER_UNIT,
    // It flips itself round, so it can make a little show of turning.
    turnsItself: true,
    animations: TIMING,
    isSettling: () => motion.settling,
    holdPoint: () => (scruff ? { x: scruff.x * motion.facing * PX_PER_UNIT * scale, y: scruff.y * PX_PER_UNIT * scale } : null),
    toyReach: build.toyReach * PX_PER_UNIT,
    toySize: CHIBI_TOY * PX_PER_UNIT,
    toyLook: 'chibi',
    carriesToys: build.species === 'raccoon',
    deskReach: { x: build.desk.x * PX_PER_UNIT, y: build.desk.y * PX_PER_UNIT },
    mouseReach: { x: build.mouse.x * PX_PER_UNIT, y: build.mouse.y * PX_PER_UNIT },
    drawsMarks: true,
    toyPoint: () => (toy ? { x: toy.x * motion.facing * PX_PER_UNIT * scale, y: toy.y * PX_PER_UNIT * scale } : null),
    dress(d) {
      skin.dress(d);
    },
    setScale(next) {
      scale = next;
      skin.svg.setAttribute('width', n(view.width * PX_PER_UNIT * scale));
      skin.svg.setAttribute('height', n(view.height * PX_PER_UNIT * scale));
    },
    draw(frame) {
      const pose = motion.update(frame, 1 / (PX_PER_UNIT * scale));
      scruff = scruffPoint(build, pose);
      toy = toyHoldPoint(build, pose);
      skin.draw(pose, frame.clockMs ?? frame.timeMs, motion.flip, motion.moving, scruff);
    },
  };
}
