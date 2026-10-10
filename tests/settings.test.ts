import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings, RACCOON_TYPES } from '../shared/settings';

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

  it('accepts every raccoon type, defaulting to the 3D one', () => {
    expect(DEFAULT_SETTINGS.raccoonType).toBe('arena');
    for (const type of RACCOON_TYPES) expect(normalizeSettings({ raccoonType: type }).raccoonType).toBe(type);
  });

  it('drops unknown and retired keys', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, extra: 1, size: 2, speed: 1.5, sensitivity: 2 })).toEqual(
      DEFAULT_SETTINGS,
    );
  });
});

describe('pet registry', () => {
  it('offers a drawing for every type, with raccoons and cats to choose from', async () => {
    const { RACCOON_STYLES } = await import('../src/sprites');
    for (const type of RACCOON_TYPES) expect(RACCOON_STYLES[type]?.label, type).toBeTruthy();
    const species = new Set(RACCOON_TYPES.map((type) => RACCOON_STYLES[type].species));
    expect([...species].sort()).toEqual(['cat', 'raccoon']);
  });
});
