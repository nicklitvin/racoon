// Contract between the Electron main process and the renderer.
// Imported by both sides; keep it free of Node, Electron and DOM dependencies.

import type { KeyboardStatus, Settings } from './settings';

export const IPC = {
  getDisplay: 'racoon:get-display',
  displayChanged: 'racoon:display-changed',
  setInteractive: 'racoon:set-interactive',
  cursor: 'racoon:cursor',
  keyPulse: 'racoon:key-pulse',
  getSettings: 'racoon:get-settings',
  updateSettings: 'racoon:update-settings',
  settingsChanged: 'racoon:settings-changed',
  getKeyboardStatus: 'racoon:get-keyboard-status',
  keyboardStatusChanged: 'racoon:keyboard-status-changed',
  recheckKeyboardAccess: 'racoon:recheck-keyboard-access',
  openKeyboardPrivacySettings: 'racoon:open-keyboard-privacy-settings',
  openSettings: 'racoon:open-settings',
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

type Unsubscribe = () => void;

/** API the preload script exposes on `window.racoonHost`. */
export interface HostBridge {
  platform: string;
  getDisplay(): Promise<DisplayInfo>;
  onDisplayChanged(listener: (display: DisplayInfo) => void): Unsubscribe;
  setInteractive(interactive: boolean): void;
  /** Cursor position relative to the pet window, or null when it's on another display. */
  onCursor(listener: (cursor: Point | null) => void): Unsubscribe;
  /** Fires once per key press while keyboard reactions are on. Carries no data at all. */
  onKeyPulse(listener: () => void): Unsubscribe;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  onSettingsChanged(listener: (settings: Settings) => void): Unsubscribe;
  getKeyboardStatus(): Promise<KeyboardStatus>;
  onKeyboardStatusChanged(listener: (status: KeyboardStatus) => void): Unsubscribe;
  recheckKeyboardAccess(): Promise<KeyboardStatus>;
  openKeyboardPrivacySettings(): void;
  openSettings(): void;
}
