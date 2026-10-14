// User settings, shared by the Electron main process (which stores them) and the renderer.

/**
 * The pets to choose from: raccoons, cats, foxes and otters in a few art styles, 2D chibi
 * versions of each, and pixel-art ones. The first one is the default. Retired types
 * (arena, cartoon, plush, classic, cat) fall back to it.
 */
export const RACCOON_TYPES = [
  'raccoon-storybook',
  'raccoon-sketch',
  'cat-storybook',
  'cat-sketch',
  'cat-shadow',
  'fox-storybook',
  'fox-arctic',
  'fox-sketch',
  'otter-storybook',
  'otter-sketch',
  'raccoon-chibi',
  'cat-chibi',
  'cat-chibi-tuxedo',
  'fox-chibi',
  'otter-chibi',
  'raccoon-pixel',
  'cat-pixel',
  'otter-pixel',
] as const;
export type RaccoonType = (typeof RACCOON_TYPES)[number];

export interface Settings {
  /** Which drawing of the raccoon to use. */
  raccoonType: RaccoonType;
  /** Opt-in: react to typing rhythm. Counts key presses only; see README "Privacy". Desktop only. */
  keyboardReactions: boolean;
  /** Start the desktop app when you log in. */
  launchAtLogin: boolean;
  /** A few toy blocks lying about for the pet to play with (and for you to throw for it). */
  toys: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  raccoonType: RACCOON_TYPES[0],
  keyboardReactions: false,
  launchAtLogin: false,
  toys: true,
};

function isRaccoonType(value: unknown): value is RaccoonType {
  return (RACCOON_TYPES as readonly unknown[]).includes(value);
}

/** Pets that have since been retired, and the nearest one still here. */
const RETIRED: Record<string, RaccoonType> = {
  'cat-pixel-black': 'cat-pixel',
  'fox-pixel': 'fox-chibi',
  'raccoon-pixel-handheld': 'raccoon-pixel',
};

/** Turns anything (a parsed file, an IPC message) into valid settings, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    raccoonType: isRaccoonType(r.raccoonType)
      ? r.raccoonType
      : typeof r.raccoonType === 'string' && Object.hasOwn(RETIRED, r.raccoonType)
        ? RETIRED[r.raccoonType]!
        : DEFAULT_SETTINGS.raccoonType,
    keyboardReactions: r.keyboardReactions === true,
    launchAtLogin: r.launchAtLogin === true,
    toys: r.toys !== false,
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
