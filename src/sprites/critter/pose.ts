import type { Point } from '../../core/geometry';

/** The four legs: near is his right side, far his left. */
export type LegName = 'frontNear' | 'frontFar' | 'backNear' | 'backFar';

/**
 * A pose for the lifelike animals: plain numbers only, so any two poses can be eased into
 * each other generically. The animal faces right with the ground at y = 0 and negative y
 * up, in drawing units.
 *
 * Legs are given by where the paw is and how the last bone (hand or foot) leans; the rig
 * works out elbows, knees and hocks from that, so feet can stay planted on the ground.
 */
export const POSE_KEYS = [
  // Hip and shoulder joints, and how much the spine bows up between them.
  'px',
  'py',
  'sx',
  'sy',
  'arch',
  /** 0..1 chest rise with each breath. */
  'breath',
  /**
   * Centre of the head, and its turn: pitch nods down, yaw turns the face towards you (as
   * seen side-on: whichever way he's facing, 90 shows you his face), roll tilts.
   */
  'hx',
  'hy',
  'hpitch',
  'hyaw',
  'hroll',
  /** Extra turn of the head on the neck towards his own right side, degrees (looking at something). */
  'hturn',
  // Paws: position and the lean of the hand or foot bone (degrees from upright, + = joint behind paw).
  'fnx',
  'fny',
  'fna',
  'ffx',
  'ffy',
  'ffa',
  'bnx',
  'bny',
  'bna',
  'bfx',
  'bfy',
  'bfa',
  /** Front and hind paws set wider apart than the shoulders and hips (sideways, each way). */
  'fspread',
  'bspread',
  /** Tail at rest: base direction (screen degrees, 180 = straight back), bend per segment, extra curl at the tip. */
  'tailA',
  'tailBend',
  'tailCurl',
  /** Extra bend per segment near the base only (a tail that drops then runs along the floor). */
  'tailKink',
  /** 0 floppy .. 1 held stiffly in its rest shape. */
  'tailStiff',
  /** The tail curving round his near side (sitting, curled up), -1..1; also its sideways sway. */
  'tailSide',
  /** Fur standing on end (fright), 0..1. */
  'puff',
  /** Ears: 0 upright, 1 pricked forward, -1 flat back. */
  'earN',
  'earF',
  /** Upper eyelids 0 open .. 1 shut; negative is wide-eyed. */
  'lids',
  /** Happy squint (lower lids up, eyes curve into smiles), 0..1. */
  'happy',
  'lookX',
  'lookY',
  /** Pupil size 0 slit .. 1 round. */
  'pupil',
  'mouth',
  'tongue',
  /** Shoulder blades riding up above the back as the front legs take weight. */
  'scapN',
  'scapF',
  /** Whole body rotation about the scruff, screen degrees (being carried). */
  'rot',
  /** Vertical squash (< 1) and stretch (> 1) about the feet, for landings and leaps. */
  'squash',
] as const;

export type PoseKey = (typeof POSE_KEYS)[number];
export type Pose = Record<PoseKey, number>;

/** Things that switch rather than ease. */
export interface PoseFlags {
  /** The tail wraps round in front of the legs (sitting, curled up asleep). */
  tailFront: boolean;
  /** The near front paw is raised in front of the face (grooming, washing, peeking). */
  pawUp: boolean;
  /** Draw no shadow: the animal is off the ground or behind an edge. */
  noShadow: boolean;
}

export const LEGS: readonly LegName[] = ['backFar', 'frontFar', 'backNear', 'frontNear'];

export const PAW_KEYS: Record<LegName, [PoseKey, PoseKey, PoseKey]> = {
  frontNear: ['fnx', 'fny', 'fna'],
  frontFar: ['ffx', 'ffy', 'ffa'],
  backNear: ['bnx', 'bny', 'bna'],
  backFar: ['bfx', 'bfy', 'bfa'],
};

export function paw(pose: Pose, leg: LegName): Point & { a: number } {
  const [x, y, a] = PAW_KEYS[leg];
  return { x: pose[x], y: pose[y], a: pose[a] };
}

export function setPaw(pose: Pose, leg: LegName, x: number, y: number, a?: number): void {
  const [kx, ky, ka] = PAW_KEYS[leg];
  pose[kx] = x;
  pose[ky] = y;
  if (a !== undefined) pose[ka] = a;
}

export function blankPose(): Pose {
  const pose = {} as Pose;
  for (const key of POSE_KEYS) pose[key] = 0;
  pose.squash = 1;
  pose.pupil = 0.5;
  return pose;
}

export const clonePose = (pose: Pose): Pose => ({ ...pose });
