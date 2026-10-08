import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../shared/settings';

describe('normalizeSettings', () => {
  it('falls back to defaults for missing or broken input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ size: 'big', speed: NaN })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps keyboard reactions off unless explicitly true', () => {
    expect(DEFAULT_SETTINGS.keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: 'yes' }).keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: 1 }).keyboardReactions).toBe(false);
    expect(normalizeSettings({ keyboardReactions: true }).keyboardReactions).toBe(true);
  });

  it('clamps numbers into their ranges', () => {
    const s = normalizeSettings({ sensitivity: 99, size: 0, speed: 1.5 });
    expect(s.sensitivity).toBe(2);
    expect(s.size).toBe(0.5);
    expect(s.speed).toBe(1.5);
  });

  it('drops unknown keys', () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, extra: 1 })).toEqual(DEFAULT_SETTINGS);
  });
});
