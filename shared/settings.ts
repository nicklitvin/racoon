// User settings, shared by the Electron main process (which stores them) and the renderer.

/**
 * The pets to choose from: a raccoon, a cat and an otter in pixel art. The first one is the
 * default. Anyone on a retired pet gets the nearest one still here (see `RETIRED`).
 */
export const RACCOON_TYPES = ['raccoon-pixel', 'cat-pixel', 'otter-pixel'] as const;
export type RaccoonType = (typeof RACCOON_TYPES)[number];

/** Hats to dress your pet up in. */
export const HATS = ['none', 'party', 'beanie', 'tophat', 'crown', 'cap', 'bow', 'nightcap', 'headphones'] as const;
export type Hat = (typeof HATS)[number];

/** What to wear: clothes, or just something round the neck. */
export const OUTFITS = ['none', 'suit', 'pajamas', 'sweater', 'cape', 'scarf', 'bowtie', 'bandana', 'collar'] as const;
export type Outfit = (typeof OUTFITS)[number];

/**
 * What the pet's up to, picked in the settings: playing about (its blocks, chasing the
 * pointer, watching you type), working at its desk, sleeping, or hiding off the screen.
 */
export const PET_MODES = ['play', 'work', 'sleep', 'hide'] as const;
export type PetMode = (typeof PET_MODES)[number];

export interface Settings {
  /** Which drawing of the raccoon to use. */
  raccoonType: RaccoonType;
  /** Opt-in: react to typing rhythm. Counts key presses only; see "Privacy" in docs/DEVELOPMENT.md. Desktop only. */
  keyboardReactions: boolean;
  /** Start the desktop app when you log in. */
  launchAtLogin: boolean;
  /** What the pet wears on its head, and round its neck. */
  hat: Hat;
  outfit: Outfit;
  mode: PetMode;
}

export const DEFAULT_SETTINGS: Settings = {
  raccoonType: RACCOON_TYPES[0],
  keyboardReactions: false,
  launchAtLogin: false,
  hat: 'none',
  outfit: 'none',
  mode: 'play',
};

function isRaccoonType(value: unknown): value is RaccoonType {
  return (RACCOON_TYPES as readonly unknown[]).includes(value);
}

/**
 * The nearest pet still here to a retired one: the same animal in pixel art (a fox gets the
 * cat, the nearest thing to one). The oldest retired pets (arena, cartoon, plush, classic,
 * cat) get the default.
 */
function retired(type: string): RaccoonType | null {
  if (/^raccoon-/.test(type)) return 'raccoon-pixel';
  if (/^(cat|fox)-/.test(type)) return 'cat-pixel';
  if (/^otter-/.test(type)) return 'otter-pixel';
  return null;
}

/** Turns anything (a parsed file, an IPC message) into valid settings, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    raccoonType: isRaccoonType(r.raccoonType)
      ? r.raccoonType
      : ((typeof r.raccoonType === 'string' && retired(r.raccoonType)) || DEFAULT_SETTINGS.raccoonType),
    keyboardReactions: r.keyboardReactions === true,
    launchAtLogin: r.launchAtLogin === true,
    hat: (HATS as readonly unknown[]).includes(r.hat) ? (r.hat as Hat) : DEFAULT_SETTINGS.hat,
    outfit: (OUTFITS as readonly unknown[]).includes(r.outfit) ? (r.outfit as Outfit) : DEFAULT_SETTINGS.outfit,
    // Before there were modes, work mode was a switch of its own.
    mode: (PET_MODES as readonly unknown[]).includes(r.mode) ? (r.mode as PetMode) : r.workMode === true ? 'work' : 'play',
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
