import type { Point } from '../../core/geometry';
import { n } from '../svg';

/** Small maths and path helpers for the lifelike animals. */

export const DEG = Math.PI / 180;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
/** Hermite ease in and out. */
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
/** Smoother ease (zero acceleration at the ends too). */
export const smoother = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const easeIn = (t: number) => clamp01(t) ** 3;
/** 0 → 1 → 0 over t in [0, 1], smooth at both ends. */
export const bump = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2);
/** Fraction of t in [a, b], eased. */
export const span = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
export const frac = (v: number) => v - Math.floor(v);
/**
 * A value through keyframes ([time, value], in time order), eased in and out between each
 * pair, and held before the first and after the last.
 */
export function keyed(t: number, keys: readonly (readonly [number, number])[]): number {
  let [t0, v0] = keys[0]!;
  if (t <= t0) return v0;
  for (const [t1, v1] of keys) {
    if (t <= t1) return t1 > t0 ? lerp(v0, v1, smooth((t - t0) / (t1 - t0))) : v1;
    [t0, v0] = [t1, v1];
  }
  return v0;
}
/** A sine wave with period `ms`, from -1 to 1. */
export const wave = (t: number, ms: number, phase = 0) => Math.sin((t / ms + phase) * Math.PI * 2);

export const pt = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const len = (a: Point) => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const mixPt = (a: Point, b: Point, t: number): Point => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const unit = (a: Point): Point => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
/** Unit vector at `deg` degrees, screen axes (0 = right, 90 = down). */
export const dir = (deg: number): Point => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });
export const angleOf = (a: Point) => Math.atan2(a.y, a.x) / DEG;
export const rotate = (p: Point, deg: number, about: Point = { x: 0, y: 0 }): Point => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const dx = p.x - about.x;
  const dy = p.y - about.y;
  return { x: about.x + dx * c - dy * s, y: about.y + dx * s + dy * c };
};
/** Shortest signed difference between two angles in degrees. */
export const angleDiff = (from: number, to: number) => ((((to - from + 180) % 360) + 360) % 360) - 180;

/**
 * Middle joint of a two-bone limb reaching from `root` to `end`. `bend` picks the side the
 * joint pokes out to (1 = clockwise of the root→end line on screen). Out of reach, the limb
 * straightens along the line.
 */
export function ik(root: Point, end: Point, upper: number, lower: number, bend: 1 | -1): Point {
  const dx = end.x - root.x;
  const dy = end.y - root.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d;
  const uy = dy / d;
  const reach = upper + lower;
  if (d >= reach * 0.999) return { x: root.x + ux * d * (upper / reach), y: root.y + uy * d * (upper / reach) };
  const a = (upper * upper - lower * lower + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, upper * upper - a * a));
  return { x: root.x + ux * a - uy * h * bend, y: root.y + uy * a + ux * h * bend };
}

/** A deterministic pseudo-random generator (mulberry32), so behaviour is reproducible in tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D noise in [-1, 1]: wobbles organically rather than looping. */
export function noise1(x: number, seed = 0): number {
  const hash = (i: number) => {
    let h = Math.imul(i ^ (seed * 0x9e3779b1), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967296) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}

const P = (p: Point) => `${n(p.x)},${n(p.y)}`;

/**
 * Smooth curve through points (Catmull-Rom as cubic Béziers). `closed` joins the ends.
 * `tension` 1 is standard; lower is tighter.
 */
export function curve(points: Point[], closed = false, tension = 1): string {
  const count = points.length;
  if (count < 2) return '';
  const at = (i: number) => (closed ? points[(i + count) % count]! : points[clamp(i, 0, count - 1)]!);
  let d = `M${P(points[0]!)}`;
  const segments = closed ? count : count - 1;
  const k = tension / 6;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k };
    const c2 = { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k };
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return closed ? `${d}Z` : d;
}

/**
 * Outline of a tube along `spine` with a radius per point: a limb, neck or tail that
 * tapers. Ends are rounded. Returned as a closed smooth path.
 */
export function tube(spine: Point[], radii: number[], capStart = true, capEnd = true): string {
  return curve(tubePoints(spine, radii, capStart, capEnd), true);
}

export function tubePoints(spine: Point[], radii: number[], capStart = true, capEnd = true): Point[] {
  const last = spine.length - 1;
  const left: Point[] = [];
  const right: Point[] = [];
  const normals: Point[] = [];
  spine.forEach((p, i) => {
    const a = spine[Math.max(0, i - 1)]!;
    const b = spine[Math.min(last, i + 1)]!;
    const t = unit(sub(b, a));
    const nrm = { x: -t.y, y: t.x };
    normals.push(t);
    const r = radii[i]!;
    left.push({ x: p.x + nrm.x * r, y: p.y + nrm.y * r });
    right.push({ x: p.x - nrm.x * r, y: p.y - nrm.y * r });
  });
  const out: Point[] = [...left];
  const tEnd = normals[last]!;
  const rEnd = radii[last]!;
  if (capEnd) out.push({ x: spine[last]!.x + tEnd.x * rEnd * 0.92, y: spine[last]!.y + tEnd.y * rEnd * 0.92 });
  out.push(...right.reverse());
  const tStart = normals[0]!;
  const rStart = radii[0]!;
  if (capStart) out.push({ x: spine[0]!.x - tStart.x * rStart * 0.92, y: spine[0]!.y - tStart.y * rStart * 0.92 });
  return out;
}

/** Points along a quadratic Bézier, for limbs that bend softly through their joint. */
export function quadPoints(a: Point, c: Point, b: Point, count: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

/** Resamples a polyline to `count` evenly spaced points. */
export function resample(points: Point[], count: number): Point[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + dist(points[i - 1]!, points[i]!));
  const total = lengths[lengths.length - 1]!;
  const out: Point[] = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < points.length - 1 && lengths[j]! < target) j++;
    const seg = lengths[j]! - lengths[j - 1]! || 1;
    out.push(mixPt(points[j - 1]!, points[j]!, (target - lengths[j - 1]!) / seg));
  }
  return out;
}

export { P as fmt };
