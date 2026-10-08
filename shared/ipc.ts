// Contract between the Electron main process and the renderer.
// Imported by both sides; keep it free of Node, Electron and DOM dependencies.

export const IPC = {
  getDisplay: 'racoon:get-display',
  displayChanged: 'racoon:display-changed',
  setInteractive: 'racoon:set-interactive',
} as const;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The area the pet lives in, in CSS pixels relative to the pet window. */
export interface DisplayInfo {
  width: number;
  height: number;
  /** Usable area (excludes the taskbar / Dock / menu bar). Its bottom edge is the "floor". */
  workArea: Rect;
  scaleFactor: number;
}

/** API the preload script exposes on `window.racoonHost`. */
export interface HostBridge {
  platform: string;
  getDisplay(): Promise<DisplayInfo>;
  onDisplayChanged(listener: (display: DisplayInfo) => void): () => void;
  setInteractive(interactive: boolean): void;
}
