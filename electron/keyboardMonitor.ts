/**
 * Counts key presses system-wide, for the opt-in typing reactions.
 *
 * PRIVACY: the hook's event object is never read. The listener below takes no
 * parameters, so the key code, character, modifiers and timing details are never
 * looked at, stored, logged or sent anywhere. Each press only produces an empty
 * "pulse" for the pet window. The hook is not loaded at all until the user turns
 * the feature on, and it's stopped again as soon as they turn it off.
 */

type UiohookModule = typeof import('uiohook-napi');

export class KeyboardMonitor {
  private hook: UiohookModule['uIOhook'] | null = null;
  private running = false;
  private readonly onKeyDown = () => this.onPress();

  constructor(private readonly onPress: () => void) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Starts counting. Returns an error message if the hook couldn't start. */
  start(): string | null {
    if (this.running) return null;
    try {
      // Loaded lazily: the native hook only exists in memory while the feature is on.
      this.hook ??= (require('uiohook-napi') as UiohookModule).uIOhook;
      this.hook.on('keydown', this.onKeyDown);
      this.hook.start();
      this.running = true;
      return null;
    } catch (error) {
      this.hook?.off('keydown', this.onKeyDown);
      return error instanceof Error ? error.message : String(error);
    }
  }

  stop(): void {
    if (!this.running || !this.hook) return;
    this.hook.off('keydown', this.onKeyDown);
    try {
      this.hook.stop();
    } catch {
      // Already stopped.
    }
    this.running = false;
  }
}
