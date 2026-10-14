import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, HATS, normalizeSettings, OUTFITS, RACCOON_TYPES } from '../shared/settings';

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

  it('puts the toy blocks out unless they were switched off', () => {
    expect(DEFAULT_SETTINGS.toys).toBe(true);
    expect(normalizeSettings({}).toys).toBe(true);
    expect(normalizeSettings({ toys: false }).toys).toBe(false);
  });

  it('accepts every pet type, defaulting to the storybook raccoon', () => {
    expect(DEFAULT_SETTINGS.raccoonType).toBe('raccoon-storybook');
    for (const type of RACCOON_TYPES) expect(normalizeSettings({ raccoonType: type }).raccoonType).toBe(type);
  });

  it('moves anyone on a retired pet to the default', () => {
    for (const retired of ['arena', 'cartoon', 'plush', 'classic', 'cat']) {
      expect(normalizeSettings({ raccoonType: retired }).raccoonType).toBe(DEFAULT_SETTINGS.raccoonType);
    }
  });

  it('moves anyone on a retired pixel pet to the nearest one still here', () => {
    expect(normalizeSettings({ raccoonType: 'cat-pixel-black' }).raccoonType).toBe('cat-pixel');
    expect(normalizeSettings({ raccoonType: 'raccoon-pixel-handheld' }).raccoonType).toBe('raccoon-pixel');
    expect(normalizeSettings({ raccoonType: 'fox-pixel' }).raccoonType).toBe('fox-chibi');
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

  it('keeps work mode off unless switched on', () => {
    expect(DEFAULT_SETTINGS.workMode).toBe(false);
    expect(normalizeSettings({ workMode: 'yes' }).workMode).toBe(false);
    expect(normalizeSettings({ workMode: true }).workMode).toBe(true);
  });

  it('drops unknown and retired keys', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, extra: 1, size: 2, speed: 1.5, sensitivity: 2 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});
