import type { DisplayInfo } from '../../shared/ipc';

export type { DisplayInfo };

/**
 * What the renderer needs from wherever it's running: the Electron overlay
 * window on the desktop, or a plain browser tab (the Vercel build).
 */
export interface Host {
  kind: 'electron' | 'web';
  platform: string;
  getDisplay(): Promise<DisplayInfo>;
  onDisplayChanged(listener: (display: DisplayInfo) => void): () => void;
  /** Capture the mouse (true) or let clicks pass through to windows below (false). */
  setInteractive(interactive: boolean): void;
}
