export interface TypingTrackerOptions {
  /** Higher = reacts to slower typing. 1 is the default. */
  sensitivity?: number;
}

const WINDOW_MS = 5000;
/** Key presses per second that count as typing, at sensitivity 1. */
const MIN_RATE = 2;
/** How long the rate must hold before the raccoon comes to watch. */
const SUSTAIN_MS = 2500;
/** Quiet time after which typing counts as stopped. */
const STOP_AFTER_MS = 5000;

/**
 * Typing rate over a rolling window.
 *
 * Privacy: the only input is the *time* of a key press. This class never sees,
 * stores or forwards which key was pressed, and it only keeps timestamps from
 * the last few seconds.
 */
export class TypingActivityTracker {
  private presses: number[] = [];
  private lastPressAt = -Infinity;
  private rateSince: number | null = null;
  private active = false;
  private sensitivity: number;

  constructor(options: TypingTrackerOptions = {}) {
    this.sensitivity = options.sensitivity ?? 1;
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  keyDown(t: number): void {
    this.presses.push(t);
    this.lastPressAt = t;
    this.prune(t);
  }

  evaluate(t: number): void {
    this.prune(t);
    if (this.active) {
      if (t - this.lastPressAt >= STOP_AFTER_MS) this.active = false;
      return;
    }
    if (this.rate() * this.sensitivity >= MIN_RATE) {
      this.rateSince ??= t;
      if (t - this.rateSince >= SUSTAIN_MS) this.active = true;
    } else {
      this.rateSince = null;
    }
  }

  /** Key presses per second over the window. */
  rate(): number {
    return this.presses.length / (WINDOW_MS / 1000);
  }

  /** True while the user is in a sustained stretch of typing. */
  get isActive(): boolean {
    return this.active;
  }

  idleFor(t: number): number {
    return t - this.lastPressAt;
  }

  /** Forgets everything, e.g. when the feature is switched off. */
  reset(): void {
    this.presses = [];
    this.lastPressAt = -Infinity;
    this.rateSince = null;
    this.active = false;
  }

  /** Number of timestamps currently held (exposed for the privacy tests). */
  get retained(): number {
    return this.presses.length;
  }

  private prune(t: number): void {
    const cutoff = t - WINDOW_MS;
    let drop = 0;
    while (drop < this.presses.length && this.presses[drop]! < cutoff) drop++;
    if (drop) this.presses.splice(0, drop);
  }
}
