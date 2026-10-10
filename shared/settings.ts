// User settings, shared by the Electron main process (which stores them) and the renderer.

/** The pets to choose from: raccoons in several art styles, and a cat. The first one is the default. */
export const RACCOON_TYPES = [
  'arena',
  'arena-low',
  'arena-top',
  'arena-cel',
  'cartoon',
  'plush',
  'classic',
  'raccoon-pixel',
  'raccoon-sketch',
  'raccoon-sticker',
  'raccoon-neon',
  'cat',
  'cat-tabby',
  'cat-siamese',
  'cat-kitten',
  'cat-chonk',
  'cat-hose',
  'cat-snappy',
  'cat-3d',
  'cat-3d-top',
  'cat-pixel',
  'cat-sketch',
  'cat-neon',
] as const;
export type RaccoonType = (typeof RACCOON_TYPES)[number];

export interface Settings {
  /** Which drawing of the raccoon to use. */
  raccoonType: RaccoonType;
  /** Opt-in: react to typing rhythm. Counts key presses only; see README "Privacy". Desktop only. */
  keyboardReactions: boolean;
  /** Start the desktop app when you log in. */
  launchAtLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  raccoonType: RACCOON_TYPES[0],
  keyboardReactions: false,
  launchAtLogin: false,
};

function isRaccoonType(value: unknown): value is RaccoonType {
  return (RACCOON_TYPES as readonly unknown[]).includes(value);
}

/** Turns anything (a parsed file, an IPC message) into valid settings, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    raccoonType: isRaccoonType(r.raccoonType) ? r.raccoonType : DEFAULT_SETTINGS.raccoonType,
    keyboardReactions: r.keyboardReactions === true,
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
