import { describe, expect, it } from 'vitest';
import { BETA_TYPES, DEFAULT_SETTINGS, HATS, normalizeSettings, OUTFITS, PET_MODES, RACCOON_TYPES } from '../shared/settings';

describe('normalizeSettings', () => {
  it('falls back to defaults for missing or broken input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ raccoonType: 'dragon' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps keyboard reactions off unless explicitly true', () => {
    expect(DEFAULT_SETTINGS.keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: 'yes' }).keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: 1 }).keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: true }).keyboardReactions).toBe(true);
  });

  it('starts in play mode, and keeps only modes there are', () => {
    expect(DEFAULT_SETTINGS.mode).toBe('play');
    for (const mode of PET_MODES) expect(normalizeSettings({ mode }).mode).toBe(mode);
    expect(normalizeSettings({ mode: 'party' }).mode).toBe('play');
  });

  it('offers the three pixel pets, and the puffball in beta, defaulting to the raccoon', () => {
    expect(RACCOON_TYPES).toEqual(['raccoon-pixel', 'cat-pixel', 'otter-pixel', 'blob-pixel']);
    expect(BETA_TYPES).toEqual(['blob-pixel']);
    expect(DEFAULT_SETTINGS.raccoonType).toBe('raccoon-pixel');
    for (const type of RACCOON_TYPES) expect(normalizeSettings({ raccoonType: type, beta: true }).raccoonType).toBe(type);
  });

  it('keeps beta off unless switched on, and only keeps a beta pet while it is', () => {
    expect(DEFAULT_SETTINGS.beta).toBe(false);
    expect(normalizeSettings({ beta: 'yes' }).beta).toBe(false);
    expect(normalizeSettings({ raccoonType: 'blob-pixel' }).raccoonType).toBe(DEFAULT_SETTINGS.raccoonType);
    expect(normalizeSettings({ raccoonType: 'blob-pixel', beta: true })).toMatchObject({ raccoonType: 'blob-pixel', beta: true });
    // Switching beta off again takes the puffball away.
    const on = normalizeSettings({ raccoonType: 'blob-pixel', beta: true });
    expect(normalizeSettings({ ...on, beta: false }).raccoonType).toBe(DEFAULT_SETTINGS.raccoonType);
    // The other pets don't care.
    expect(normalizeSettings({ raccoonType: 'otter-pixel', beta: false }).raccoonType).toBe('otter-pixel');
  });

  it('moves anyone on a retired pet to the default', () => {
    for (const retired of ['arena', 'cartoon', 'plush', 'classic', 'cat']) {
      expect(normalizeSettings({ raccoonType: retired }).raccoonType).toBe(DEFAULT_SETTINGS.raccoonType);
    }
  });

  it('moves anyone on a pet no longer offered to the same animal in pixel art', () => {
    for (const old of ['raccoon-storybook', 'raccoon-sketch', 'raccoon-chibi', 'raccoon-pixel-handheld']) {
      expect(normalizeSettings({ raccoonType: old }).raccoonType, old).toBe('raccoon-pixel');
    }
    for (const old of ['cat-storybook', 'cat-shadow', 'cat-chibi-tuxedo', 'cat-pixel-black']) {
      expect(normalizeSettings({ raccoonType: old }).raccoonType, old).toBe('cat-pixel');
    }
    for (const old of ['otter-storybook', 'otter-sketch', 'otter-chibi']) expect(normalizeSettings({ raccoonType: old }).raccoonType, old).toBe('otter-pixel');
    // No pixel fox: the cat is the nearest thing.
    for (const old of ['fox-storybook', 'fox-arctic', 'fox-chibi', 'fox-pixel']) expect(normalizeSettings({ raccoonType: old }).raccoonType, old).toBe('cat-pixel');
    // Not fooled by names that only look like one.
    expect(normalizeSettings({ raccoonType: 'constructor' }).raccoonType).toBe(DEFAULT_SETTINGS.raccoonType);
  });

  it('dresses the pet in nothing to start with, and keeps only hats and outfits there are', () => {
    expect(DEFAULT_SETTINGS.hat).toBe('none');
    expect(DEFAULT_SETTINGS.outfit).toBe('none');
    for (const hat of HATS) expect(normalizeSettings({ hat }).hat).toBe(hat);
    for (const outfit of OUTFITS) expect(normalizeSettings({ outfit }).outfit).toBe(outfit);
    expect(normalizeSettings({ hat: 'sombrero', outfit: 42 })).toMatchObject({ hat: 'none', outfit: 'none' });
  });

  it('carries over the old work mode switch as work mode', () => {
    expect(normalizeSettings({ workMode: true }).mode).toBe('work');
    expect(normalizeSettings({ workMode: false, toys: false }).mode).toBe('play');
    // A mode, once there is one, wins.
    expect(normalizeSettings({ workMode: true, mode: 'sleep' }).mode).toBe('sleep');
  });

  it('drops unknown and retired keys', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, extra: 1, size: 2, speed: 1.5, sensitivity: 2 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
