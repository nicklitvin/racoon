import { ANIMATIONS } from './animations';
import { poseFor } from './pose';
import { RIG, toWorld, type LegName, type Pose } from './rig';
import { n, PX_PER_UNIT, svgWriter } from './svg';
import type { RaccoonFrame, RaccoonRenderer } from './types';

/**
 * The "arena" raccoon: a chunky toy seen from above at an angle, like the units in
 * Clash Royale. He's modelled as shaded 3D balls (plus a few flat "decals" for his face)
 * and drawn with a tilted orthographic camera, so he can face any direction on the
 * ground. The same skeleton and poses drive him as the side-view raccoons: a pose is
 * a side view of the body, so it's lifted into 3D by adding sideways offsets, then
 * turned to `frame.heading` and projected.
 */

/** Camera elevation above the ground, in degrees. 90 would be straight down. */
const CAMERA_DEG = 52;
const SIN_E = Math.sin((CAMERA_DEG * Math.PI) / 180);
const COS_E = Math.cos((CAMERA_DEG * Math.PI) / 180);
const DEG = Math.PI / 180;

/** He turns around the middle of his body (in side-view x), not his front feet. */
const PIVOT_X = -2;
/** A big head reads as cute and keeps the face visible from above. */
const HEAD_SCALE = 1.12;
/** Sideways distance of the legs from the spine. */
const HIP_WIDTH = 7.5;
const OUTLINE = 1.7;

/** Drawing box in units around the feet. Wide and deep enough for him facing any way. */
const VIEW = { x: -74, y: -96, width: 148, height: 158 };

/** A point or direction in the raccoon's own 3D space: forward, left-to-right (towards you when facing right), up. */
interface V3 {
  f: number;
  l: number;
  u: number;
}
/** Projected: screen position and how close to the camera it is. */
interface Projected {
  x: number;
  y: number;
  depth: number;
}

const v3 = (f: number, l: number, u: number): V3 => ({ f, l, u });
const add = (a: V3, b: V3): V3 => ({ f: a.f + b.f, l: a.l + b.l, u: a.u + b.u });
const scale = (a: V3, k: number): V3 => ({ f: a.f * k, l: a.l * k, u: a.u * k });
const norm = (a: V3): V3 => scale(a, 1 / (Math.hypot(a.f, a.l, a.u) || 1));
const cross = (a: V3, b: V3): V3 => ({ f: a.l * b.u - a.u * b.l, l: a.u * b.f - a.f * b.u, u: a.f * b.l - a.l * b.f });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rotates in the side-view plane, matching the rig (positive turns the nose down). */
function pitchBy(v: V3, degrees: number): V3 {
  const c = Math.cos(degrees * DEG);
  const s = Math.sin(degrees * DEG);
  // Side view has y pointing down, so u = -y.
  const x = v.f;
  const y = -v.u;
  return { f: x * c - y * s, l: v.l, u: -(x * s + y * c) };
}

/** Ball colours. Each gets a shaded gradient. */
const SHADES = ['fur', 'dark', 'light', 'leg', 'pink'] as const;
type Shade = (typeof SHADES)[number];
const SHADE_VAR: Record<Shade, string> = {
  fur: '--r-fur',
  dark: '--r-dark',
  light: '--r-light',
  leg: '--r-leg',
  pink: '--r-ear-pink',
};

/** Tail balls from root to tip: position along the tail (0..1), radius, colour. */
const TAIL_BALLS: [s: number, r: number, shade: Shade][] = [
  [0.02, 7, 'fur'],
  [0.18, 7.8, 'dark'],
  [0.34, 8.2, 'fur'],
  [0.5, 7.8, 'dark'],
  [0.66, 7, 'fur'],
  [0.82, 5.8, 'dark'],
  [0.97, 4, 'dark'],
];

/** Body balls in side-view coordinates (feet at 0, y down). */
const BODY_BALLS: [x: number, y: number, r: number, shade: Shade][] = [
  [-16, -27, 15, 'fur'],
  [-3, -30, 16.5, 'fur'],
  [9, -28, 14.5, 'fur'],
  [16, -23, 8, 'light'],
];

const LEGS: [LegName, side: number, front: boolean][] = [
  ['frontNear', 1, true],
  ['frontFar', -1, true],
  ['backNear', 1, false],
  ['backFar', -1, false],
];

/** The skull, in head coordinates (around the neck, before HEAD_SCALE). */
const SKULL = { c: v3(9, 0, 8), r: 16 };
const MUZZLE = { c: v3(23, 0, 1), r: 8 };

/** Side-to-side tail wag, in units. */
function tailSway(frame: RaccoonFrame): number {
  const spec = ANIMATIONS[frame.animation];
  // A whole number of wags per loop, so looping animations don't jump.
  const wags = Math.max(1, Math.round(spec.durationMs / 1400));
  const period = spec.loop ? spec.durationMs / wags : 1400;
  const amount = frame.animation === 'sleep' ? 1 : frame.animation === 'dangle' ? 2 : 4;
  return amount * Math.sin((2 * Math.PI * frame.timeMs) / period);
}

let instances = 0;

export function createArenaRaccoon(doc: Document = document): RaccoonRenderer {
  const { make, set } = svgWriter(doc);
  const id = `arena${++instances}`;

  const svg = make('svg', {
    class: 'raccoon raccoon-arena',
    viewBox: `${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`,
    role: 'img',
    'aria-label': 'raccoon',
  });

  // Light comes from the upper left: each ball gets a highlight there and darkens towards its rim.
  const defs = make('defs', {}, svg);
  for (const shade of SHADES) {
    const grad = make('radialGradient', { id: `${id}-${shade}`, cx: 0.4, cy: 0.36, r: 0.68, fx: 0.34, fy: 0.27 }, defs);
    const base = `var(${SHADE_VAR[shade]})`;
    make('stop', { offset: 0, style: `stop-color: color-mix(in srgb, ${base}, white 38%)` }, grad);
    make('stop', { offset: 0.5, style: `stop-color: ${base}` }, grad);
    make('stop', { offset: 1, style: `stop-color: color-mix(in srgb, ${base}, black 32%)` }, grad);
  }
  const fillOf = (shade: Shade) => `url(#${id}-${shade})`;

  const shadow = make('ellipse', { cx: 0, cy: 0, rx: 34, ry: 19, class: 'r-shadow' }, svg);
  const figure = make('g', { class: 'raccoon-figure' }, svg);
  // Every outline is drawn behind every fill, so only the silhouette gets a dark edge.
  const outlines = make('g', { class: 'r3-outline' }, figure);
  const fills = make('g', {}, figure);

  /** Something drawn in the fill layer, re-sorted back to front each frame. */
  interface Drawn {
    el: SVGElement;
    depth: number;
    index: number;
  }
  const drawn: Drawn[] = [];
  const track = (el: SVGElement): Drawn => {
    const d = { el, depth: 0, index: drawn.length };
    drawn.push(d);
    return d;
  };

  const ball = (shade: Shade) => ({
    fill: track(make('circle', { fill: fillOf(shade) }, fills)),
    edge: make('circle', {}, outlines),
  });
  const stick = () => ({
    fill: track(make('line', { class: 'r3-leg' }, fills)),
    edge: make('line', { class: 'r3-stick-edge' }, outlines),
  });
  /** A flat shape lying on a surface: a unit circle mapped by a matrix. */
  const decal = (cls: string) => ({ fill: track(make('circle', { r: 1, class: cls }, fills)) });

  const tail = TAIL_BALLS.map(([, , shade]) => ball(shade));
  const legs = LEGS.map(() => ({ bone: stick(), paw: ball('leg') }));
  const body = BODY_BALLS.map(([, , , shade]) => ball(shade));
  const skull = ball('fur');
  const cheeks = [ball('light'), ball('light')];
  const muzzle = ball('light');
  const nose = ball('dark');
  const ears = [0, 1].map(() => ({ outer: ball('fur'), inner: decal('r-ear-pink') }));
  const face = {
    brows: [decal('r-light'), decal('r-light')],
    bridge: decal('r-dark'),
    masks: [decal('r-dark'), decal('r-dark')],
    whites: [decal('r-eye'), decal('r-eye')],
    pupils: [decal('r-pupil'), decal('r-pupil')],
    glints: [decal('r-light'), decal('r-light')],
    lids: [decal('r-light'), decal('r-light')],
    mouth: decal('r-mouth'),
  };

  let order = '';

  const renderer: RaccoonRenderer = {
    element: svg,
    figure,
    baseSize: { width: VIEW.width * PX_PER_UNIT, height: VIEW.height * PX_PER_UNIT },
    anchor: { x: -VIEW.x / VIEW.width, y: -VIEW.y / VIEW.height },
    turnsItself: true,

    setScale(k) {
      set(svg, 'width', n(VIEW.width * PX_PER_UNIT * k));
      set(svg, 'height', n(VIEW.height * PX_PER_UNIT * k));
    },

    draw(frame: RaccoonFrame) {
      const pose: Pose = poseFor(frame.animation, frame.timeMs, frame.keystrokes);
      const heading = frame.heading ?? 0;
      const ch = Math.cos(heading);
      const sh = Math.sin(heading);
      const bodyTurn = pose.pitch + pose.swing;
      const headTurn = pose.head.angle + bodyTurn;

      // ---- Space conversions ----
      const fromSide = (x: number, y: number, l: number): V3 => v3(x - PIVOT_X, l, -y);
      const bodyPoint = (x: number, y: number, l: number): V3 => {
        const w = toWorld({ x, y }, pose);
        return fromSide(w.x, w.y, l);
      };
      const headPoint = (p: V3): V3 => {
        const r = pitchBy(scale(p, HEAD_SCALE), pose.head.angle);
        return bodyPoint(RIG.neck.x + pose.head.x + r.f, RIG.neck.y + pose.head.y - r.u, r.l);
      };
      const headVec = (v: V3): V3 => pitchBy(scale(v, HEAD_SCALE), headTurn);
      /** Ground and screen axes: X right, G down the screen (towards you), Z up. */
      const project = (p: V3): Projected => {
        const X = p.f * ch - p.l * sh;
        const G = p.f * sh + p.l * ch;
        return { x: X, y: G * SIN_E - p.u * COS_E, depth: G * COS_E + p.u * SIN_E };
      };
      /** How much a surface with normal `nrm` faces the camera (dot product with the view direction). */
      const facingCamera = (nrm: V3) => project(nrm).depth;

      // ---- Drawing helpers ----
      const placeBall = (b: ReturnType<typeof ball>, p: V3, r: number) => {
        const q = project(p);
        set(b.fill.el, 'cx', n(q.x));
        set(b.fill.el, 'cy', n(q.y));
        set(b.fill.el, 'r', n(r));
        set(b.edge, 'cx', n(q.x));
        set(b.edge, 'cy', n(q.y));
        set(b.edge, 'r', n(r + OUTLINE));
        b.fill.depth = q.depth;
      };
      /** A flat ellipse at `c` spanned by the 3D half-axes `a` and `b`. */
      const placeDecal = (
        d: ReturnType<typeof decal>,
        c: V3,
        a: V3,
        b: V3,
        depth: number,
        show: boolean,
      ) => {
        set(d.fill.el, 'display', show ? 'inline' : 'none');
        d.fill.depth = depth;
        if (!show) return;
        const q = project(c);
        const pa = project(a);
        const pb = project(b);
        set(d.fill.el, 'transform', `matrix(${n(pa.x)} ${n(pa.y)} ${n(pb.x)} ${n(pb.y)} ${n(q.x)} ${n(q.y)})`);
      };

      // ---- Shadow: stays on the ground, shrinks and fades as he leaves it ----
      const lift = clamp(-pose.y / 24, 0, 0.6);
      set(shadow, 'display', frame.animation === 'dangle' ? 'none' : 'inline');
      set(shadow, 'transform', `scale(1 ${n(SIN_E)}) rotate(${n(heading / DEG)})`);
      set(shadow, 'rx', n(36 * (1 - lift * 0.5)));
      set(shadow, 'ry', n(20 * (1 - lift * 0.5)));
      set(shadow, 'opacity', n(1 - lift));

      // ---- Body ----
      BODY_BALLS.forEach(([x, y, r], i) => placeBall(body[i]!, bodyPoint(x, y, 0), r * (0.5 + pose.breathe * 0.5)));

      // ---- Legs: a stubby stick and a round paw ----
      LEGS.forEach(([name, side, front], i) => {
        const base = front ? RIG.shoulder : RIG.hip;
        const root = toWorld(base, pose);
        const { angle, length } = pose.legs[name];
        const a = angle * DEG;
        const paw = { x: root.x + Math.sin(a) * length, y: root.y + Math.cos(a) * length };
        const l = side * HIP_WIDTH;
        const from = project(fromSide(root.x, root.y, l));
        const to = project(fromSide(paw.x, paw.y - 3, l));
        const { bone, paw: pawBall } = legs[i]!;
        for (const el of [bone.fill.el, bone.edge]) {
          set(el, 'x1', n(from.x));
          set(el, 'y1', n(from.y));
          set(el, 'x2', n(to.x));
          set(el, 'y2', n(to.y));
        }
        bone.fill.depth = (from.depth + to.depth) / 2 - 0.5;
        placeBall(pawBall, fromSide(paw.x + 1.5, paw.y - 3.6, l), 4.6);
      });

      // ---- Tail: a chain of ringed balls that sways side to side ----
      const sway = tailSway(frame);
      const curl = 5;
      TAIL_BALLS.forEach(([s, r], i) => {
        const u = 1 - s;
        // A gentle upward curve from the root (side-view tail coordinates, pointing back and up).
        const x = u * u * -2 + 2 * u * s * (-16 - curl) + s * s * -30;
        const y = u * u * -1 + 2 * u * s * (-10 - curl * 1.6) + s * s * -19;
        const c = Math.cos(pose.tail.angle * DEG);
        const sn = Math.sin(pose.tail.angle * DEG);
        const puff = pose.tail.puff;
        const tx = RIG.tailRoot.x + (x * c - y * sn) * puff;
        const ty = RIG.tailRoot.y + (x * sn + y * c) * puff;
        placeBall(tail[i]!, bodyPoint(tx, ty, sway * s ** 1.4), r * puff);
      });

      // ---- Head ----
      placeBall(skull, headPoint(SKULL.c), SKULL.r * HEAD_SCALE);
      placeBall(muzzle, headPoint(MUZZLE.c), MUZZLE.r * HEAD_SCALE);
      placeBall(nose, headPoint(v3(30.5, 0, 3)), 3.2 * HEAD_SCALE);
      [-1, 1].forEach((side, i) => placeBall(cheeks[i]!, headPoint(v3(13, side * 11, 1)), 7 * HEAD_SCALE));
      const skullDepth = skull.fill.depth;

      /** A decal lying on the skull, centred where `dir` (head space) meets its surface. */
      const onSkull = (
        d: ReturnType<typeof decal>,
        dir: V3,
        r: number,
        layer: number,
        squash = 1,
        offset: { a: number; b: number } = { a: 0, b: 0 },
        visible = true,
      ) => {
        const nrm = norm(dir);
        const ta = norm(cross(nrm, v3(0, 0, 1)));
        const tb = cross(ta, nrm);
        const local = add(add(SKULL.c, scale(nrm, SKULL.r + layer * 0.15)), add(scale(ta, offset.a), scale(tb, offset.b)));
        const worldN = headVec(nrm);
        const show = visible && facingCamera(worldN) > 0.05 * HEAD_SCALE;
        placeDecal(d, headPoint(local), headVec(scale(ta, r)), headVec(scale(tb, r * squash)), skullDepth + 0.1 + layer * 0.01, show);
      };

      const shut = frame.eyes === 'closed' || frame.eyes === 'blink';
      const eyeSize = frame.eyes === 'wide' ? 1.2 : 1;
      onSkull(face.bridge, v3(0.95, 0, 0.3), 4.6, 2);
      [-1, 1].forEach((side, i) => {
        const dir = v3(0.8, 0.4 * side, 0.42);
        onSkull(face.brows[i]!, v3(0.55, 0.42 * side, 0.74), 4.8, 1);
        onSkull(face.masks[i]!, dir, 6.4, 3);
        onSkull(face.whites[i]!, dir, 3.9 * eyeSize, 4, 1, undefined, !shut);
        // Both eyes look the same way: "a" runs across the face, "b" up it.
        const look = { a: pose.look.x * 1.3, b: -pose.look.y * 1.3 };
        onSkull(face.pupils[i]!, dir, 2.7 * eyeSize, 5, 1, look, !shut);
        onSkull(face.glints[i]!, dir, 0.95, 6, 1, { a: look.a + 0.9, b: look.b + 1 }, !shut);
        onSkull(face.lids[i]!, dir, 3.4, 4, 0.28, { a: 0, b: -0.5 }, shut);
      });

      // Ears: round bobbles on top of the head with a pink inside, folding back when flattened.
      [-1, 1].forEach((side, i) => {
        const back = pose.ears;
        const c = v3(3 - back * 4, side * 9.5, 20 - back * 4);
        const { outer, inner } = ears[i]!;
        const r = 5.6;
        placeBall(outer, headPoint(c), r * HEAD_SCALE);
        const dir = norm(v3(0.85 - back * 0.6, side * 0.45, 0.25));
        const ta = norm(cross(dir, v3(0, 0, 1)));
        const tb = cross(ta, dir);
        placeDecal(
          inner,
          headPoint(add(c, scale(dir, r + 0.1))),
          headVec(scale(ta, 3.2)),
          headVec(scale(tb, 3.8)),
          outer.fill.depth + 0.1,
          facingCamera(headVec(dir)) > 0.1,
        );
      });

      // Yawning mouth, on the underside of the muzzle.
      const mouthDir = norm(v3(0.75, 0, -0.62));
      const mta = norm(cross(mouthDir, v3(0, 0, 1)));
      const mtb = cross(mta, mouthDir);
      const mouthAt = add(MUZZLE.c, scale(mouthDir, MUZZLE.r + 0.2));
      placeDecal(
        face.mouth,
        headPoint(mouthAt),
        headVec(scale(mta, 2.8)),
        headVec(scale(mtb, 3.2 * pose.mouth)),
        muzzle.fill.depth + 0.1,
        pose.mouth > 0.03 && facingCamera(headVec(mouthDir)) > 0,
      );

      // ---- Back to front ----
      const sorted = [...drawn].sort((a, b) => a.depth - b.depth);
      const key = sorted.map((d) => d.index).join(',');
      if (key !== order) {
        for (const d of sorted) fills.appendChild(d.el);
        order = key;
      }
    },
  };
  renderer.setScale(1);
  return renderer;
}
