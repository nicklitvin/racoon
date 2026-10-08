import type { App, BrowserWindow } from 'electron';

/**
 * Everything that differs between operating systems lives behind this interface.
 * main.ts only talks to the adapter, so adding macOS or Linux support means
 * filling in an adapter, not editing the main process.
 */
export interface PlatformAdapter {
  /** App-level setup that must run before the window exists (Dock, app id). */
  configureApp(app: App): void;
  /** Window-level setup: z-order level, workspace visibility. */
  configureWindow(win: BrowserWindow): void;
}
