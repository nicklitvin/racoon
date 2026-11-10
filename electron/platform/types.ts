import type { App, BrowserWindow } from 'electron';
import type { KeyboardAccess } from '../../shared/settings';

/**
 * Everything that differs between operating systems lives behind this interface.
 * main.ts only talks to the adapter, so adding macOS or Linux support means
 * filling in an adapter, not editing the main process.
 */
export interface PlatformAdapter {
  /** App-level setup that must run before the window exists (app id). */
  configureApp(app: App): void;
  /** Window-level setup for the pet overlay: z-order level, workspace visibility. */
  configureWindow(win: BrowserWindow): void;
  /**
   * Calls `onSwitch` whenever the OS switches virtual desktop, where the pet's window would be
   * slid away with the old desktop instead of staying put. Returns a function that stops
   * watching, or null where there's nothing to watch (macOS keeps it on every Space already).
   */
  watchDesktopSwitches?(onSwitch: () => void): (() => void) | null;
  /**
   * Puts the pet's window back in front of other always-on-top windows (an app that made
   * itself always on top since), without taking focus from the app you're using.
   */
  raiseWindow(win: BrowserWindow): void;
  /** Shows a normal window (the main window) and brings it to the front. */
  presentWindow(app: App, win: BrowserWindow): void;
  keyboardAccess: {
    /** Current permission state. Never shows a prompt. */
    check(): KeyboardAccess;
    /** May show the OS permission prompt. Callers make sure this happens at most once. */
    request(): KeyboardAccess;
    /** What to tell the user when access is denied. */
    deniedMessage: string;
    /** Opens the OS privacy settings page where access is granted, if there is one. */
    openSettings(): void;
  };
}
