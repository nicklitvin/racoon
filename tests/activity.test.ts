import { describe, expect, it } from 'vitest';
import { CursorActivityTracker } from '../src/core/activity/cursor';
import { TypingActivityTracker } from '../src/core/activity/typing';

/** Feeds the tracker 60 Hz samples from `path(t)` for `ms`, evaluating each tick. */
function drive(tracker: CursorActivityTracker, from: number, ms: number, path: (t: number) => { x: number; y: number }) {
  for (let t = from; t < from + ms; t += 16) {
    tracker.addSample(t, path(t));
    tracker.evaluate(t);
  }
  return from + ms;
}

describe('CursorActivityTracker', () => {
  it('measures speed and path length over the window', () => {
    const tracker = new CursorActivityTracker({ windowMs: 1000 });
    // 500 px/s to the right.
    const end = drive(tracker, 0, 2000, (t) => ({ x: t * 0.5, y: 100 }));
    expect(tracker.speed(end)).toBeGreaterThan(450);
    expect(tracker.speed(end)).toBeLessThan(550);
    expect(tracker.pathLength).toBeGreaterThan(450);
  });

  it('does not get excited by normal mouse use', () => {
    const tracker = new CursorActivityTracker();
    const end = drive(tracker, 0, 5000, (t) => ({ x: 200 + t * 0.3, y: 300 }));
    expect(tracker.isExcited(end)).toBe(false);
  });

  it('gets excited by sustained fast movement, but not by a single flick', () => {
    const tracker = new CursorActivityTracker();
    const fast = (t: number) => ({ x: 800 + Math.sin(t / 150) * 600, y: 400 });
    let t = drive(tracker, 0, 700, fast);
    expect(tracker.isExcited(t)).toBe(false);
    t = drive(tracker, t, 2500, fast);
    expect(tracker.isExcited(t)).toBe(true);
  });

  it('treats zig-zagging as erratic even at moderate speed', () => {
    const tracker = new CursorActivityTracker();
    // Shakes back and forth 100px every 120ms: ~850 px/s, lots of reversals.
    const shake = (t: number) => ({ x: 500 + (Math.floor(t / 120) % 2) * 100, y: 300 + (t % 120) * 0.05 });
    const end = drive(tracker, 0, 3000, shake);
    expect(tracker.turns).toBeGreaterThanOrEqual(4);
    expect(tracker.isExcited(end)).toBe(true);
  });

  it('calms down and reports stillness once the cursor stops', () => {
    const tracker = new CursorActivityTracker();
    let t = drive(tracker, 0, 3000, (t) => ({ x: 800 + Math.sin(t / 150) * 600, y: 400 }));
    expect(tracker.isExcited(t)).toBe(true);
    const last = tracker.latest!;
    for (let i = 0; i < 90; i++, t += 16) tracker.evaluate(t);
    expect(tracker.stillFor(t)).toBeGreaterThan(1000);
    expect(tracker.isExcited(t)).toBe(false);
    expect(tracker.latest).toEqual(last);
  });

  it('higher sensitivity reacts to gentler movement', () => {
    // Smooth sweeps averaging ~950 px/s: brisk, but below the default "fast" threshold.
    const path = (t: number) => ({ x: 800 + Math.sin(t / 300) * 450, y: 400 });
    const normal = new CursorActivityTracker({ sensitivity: 1 });
    const keen = new CursorActivityTracker({ sensitivity: 2 });
    expect(normal.isExcited(drive(normal, 0, 4000, path))).toBe(false);
    expect(keen.isExcited(drive(keen, 0, 4000, path))).toBe(true);
  });

  it('forgets everything when the cursor leaves the screen', () => {
    const tracker = new CursorActivityTracker();
    drive(tracker, 0, 500, (t) => ({ x: t, y: 0 }));
    tracker.addSample(600, null);
    expect(tracker.latest).toBeNull();
    expect(tracker.speed(600)).toBe(0);
  });
});

describe('TypingActivityTracker', () => {
  function type(tracker: TypingActivityTracker, from: number, ms: number, keysPerSecond: number) {
    const gap = 1000 / keysPerSecond;
    let t = from;
    for (; t < from + ms; t += gap) {
      tracker.keyDown(t);
      tracker.evaluate(t);
    }
    return t;
  }

  it('becomes active after a few seconds of steady typing', () => {
    const tracker = new TypingActivityTracker();
    let t = type(tracker, 0, 2000, 5);
    expect(tracker.isActive).toBe(false);
    t = type(tracker, t, 4000, 5);
    expect(tracker.isActive).toBe(true);
    expect(tracker.rate()).toBeGreaterThanOrEqual(4);
  });

  it('ignores the odd key press', () => {
    const tracker = new TypingActivityTracker();
    type(tracker, 0, 20_000, 0.5);
    expect(tracker.isActive).toBe(false);
  });

  it('stops being active after typing pauses', () => {
    const tracker = new TypingActivityTracker();
    let t = type(tracker, 0, 8000, 6);
    expect(tracker.isActive).toBe(true);
    t += 3000;
    tracker.evaluate(t);
    expect(tracker.isActive).toBe(true);
    t += 3000;
    tracker.evaluate(t);
    expect(tracker.isActive).toBe(false);
  });

  it('only keeps recent timestamps, and nothing else', () => {
    const tracker = new TypingActivityTracker();
    type(tracker, 0, 60_000, 8);
    // 5s window at 8 keys/s.
    expect(tracker.retained).toBeLessThanOrEqual(41);
    // The only way in is keyDown(timestamp): there is no parameter for key identity.
    expect(tracker.keyDown.length).toBe(1);
  });

  it('reset forgets all activity', () => {
    const tracker = new TypingActivityTracker();
    type(tracker, 0, 8000, 6);
    tracker.reset();
    expect(tracker.isActive).toBe(false);
    expect(tracker.retained).toBe(0);
  });
});
