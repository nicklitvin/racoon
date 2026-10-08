import type { DisplayInfo, HostBridge, Point } from '../../shared/ipc';
import type { KeyboardStatus, Settings } from '../../shared/settings';

export type { DisplayInfo, KeyboardStatus, Point, Settings };

/**
 * What the renderer needs from wherever it's running: the Electron overlay
 * window on the desktop, or a plain browser tab (the Vercel build).
 */
export interface Host extends HostBridge {
  kind: 'electron' | 'web';
}
