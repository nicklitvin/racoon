// User settings, shared by the Electron main process (which stores them) and the renderer.

export interface Settings {
  /** How easily cursor and typing activity trigger reactions. 1 = default. */
  sensitivity: number;
  /** Opt-in: react to typing rhythm. Counts key presses only; see README "Privacy". */
  keyboardReactions: boolean;
  /** Raccoon size multiplier. */
  size: number;
  /** Movement speed multiplier. */
  speed: number;
  /** Start the desktop app when you log in. */
  launchAtLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  keyboardReactions: false,
  size: 1,
  speed: 1,
  launchAtLogin: false,
};

export const SETTING_RANGES = {
  sensitivity: { min: 0.5, max: 2, step: 0.1 },
  size: { min: 0.5, max: 2.5, step: 0.1 },
  speed: { min: 0.5, max: 2, step: 0.1 },
} as const;

function rangedNumber(value: unknown, key: keyof typeof SETTING_RANGES): number {
  const { min, max } = SETTING_RANGES[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, value));
}

/** Turns anything (a parsed file, an IPC message) into valid settings, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    sensitivity: rangedNumber(r.sensitivity, 'sensitivity'),
    keyboardReactions: r.keyboardReactions === true,
    size: rangedNumber(r.size, 'size'),
    speed: rangedNumber(r.speed, 'speed'),
    launchAtLogin: r.launchAtLogin === true,
  };
}

/** Whether the app may listen for key presses (system permission, not the user's opt-in). */
export type KeyboardAccess = 'granted' | 'denied' | 'unsupported';

export interface KeyboardStatus {
  /** The user's opt-in setting. */
  enabled: boolean;
  /** Key press counting is actually running. */
  listening: boolean;
  access: KeyboardAccess;
  /** Human-readable explanation when something is in the way. */
  message: string | null;
}
