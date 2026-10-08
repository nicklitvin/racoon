import type { App, BrowserWindow } from 'electron';
import type { KeyboardAccess } from '../../shared/settings';

/**
 * Everything that differs between operating systems lives behind this interface.
 * main.ts only talks to the adapter, so adding macOS or Linux support means
 * filling in an adapter, not editing the main process.
 */
export interface PlatformAdapter {
  /** App-level setup that must run before the window exists (Dock, app id). */
  configureApp(app: App): void;
  /** Window-level setup for the pet overlay: z-order level, workspace visibility. */
  configureWindow(win: BrowserWindow): void;
  /** Shows a normal window (settings) and brings it to the front. */
  presentWindow(app: App, win: BrowserWindow): void;
  /**
   * Whether a plain click on the tray icon opens settings. On Windows the menu is on
   * right-click, so left-click is free; on macOS any click opens the menu.
   */
  trayClickOpensSettings: boolean;
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
