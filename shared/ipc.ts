// Contract between the Electron main process and the renderer.
// Imported by both sides; keep it free of Node, Electron and DOM dependencies.

import type { AlarmieStatus, ChatResult } from './alarmie';
import type { KeyboardStatus, Settings } from './settings';
import type { UpdateStatus } from './update';

export const IPC = {
  getDisplay: 'racoon:get-display',
  displayChanged: 'racoon:display-changed',
  setInteractive: 'racoon:set-interactive',
  cursor: 'racoon:cursor',
  desktopSwitching: 'racoon:desktop-switching',
  keyPulse: 'racoon:key-pulse',
  getSettings: 'racoon:get-settings',
  updateSettings: 'racoon:update-settings',
  settingsChanged: 'racoon:settings-changed',
  getKeyboardStatus: 'racoon:get-keyboard-status',
  keyboardStatusChanged: 'racoon:keyboard-status-changed',
  recheckKeyboardAccess: 'racoon:recheck-keyboard-access',
  openKeyboardPrivacySettings: 'racoon:open-keyboard-privacy-settings',
  getUpdateStatus: 'racoon:get-update-status',
  updateStatusChanged: 'racoon:update-status-changed',
  checkForUpdate: 'racoon:check-for-update',
  installUpdate: 'racoon:install-update',
  openReleasesPage: 'racoon:open-releases-page',
  getAlarmie: 'racoon:get-alarmie',
  alarmieChanged: 'racoon:alarmie-changed',
  openChat: 'racoon:open-chat',
  sendChat: 'racoon:send-chat',
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
  /** The OS is switching virtual desktop (true), and has finished (false): the pet keeps out of sight meanwhile. */
  onDesktopSwitching(listener: (switching: boolean) => void): Unsubscribe;
  /** Fires once per key press while keyboard reactions are on. Carries no data at all. */
  onKeyPulse(listener: () => void): Unsubscribe;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  onSettingsChanged(listener: (settings: Settings) => void): Unsubscribe;
  getKeyboardStatus(): Promise<KeyboardStatus>;
  onKeyboardStatusChanged(listener: (status: KeyboardStatus) => void): Unsubscribe;
  recheckKeyboardAccess(): Promise<KeyboardStatus>;
  openKeyboardPrivacySettings(): void;
  /** Newer builds on the GitHub Releases page: looking for one, and installing it. */
  getUpdateStatus(): Promise<UpdateStatus>;
  onUpdateStatusChanged(listener: (status: UpdateStatus) => void): Unsubscribe;
  checkForUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<UpdateStatus>;
  openReleasesPage(): void;
  /** Whether Alarmie is on this Mac to talk to (never on other systems). Looks again each time. */
  getAlarmie(): Promise<AlarmieStatus>;
  onAlarmieChanged(listener: (status: AlarmieStatus) => void): Unsubscribe;
  /** The pet was clicked with the Alarmie chat on: opens the chat beside him (`beside`, on the pet's page). */
  openChat(beside: Rect): void;
  /** Sends a line of the chat to Alarmie's live talk and resolves with its answer. */
  sendChat(message: string, conversationId: string | null): Promise<ChatResult>;
}
