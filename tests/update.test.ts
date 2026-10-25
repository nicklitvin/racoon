import { describe, expect, it } from 'vitest';
import { isNewer, readRelease, type ReleaseBuild } from '../shared/update';

const SHA = '0c66391f282f4c4fe9d905b0d1f39afeffc3dd95';
const OTHER = '020bb8d0000000000000000000000000000000aa';
const DL = 'https://github.com/nicklitvin/racoon/releases/download/v0.1.0/';

/** GitHub's reply for the latest release, the way the release workflow makes it. */
function latest(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.1.0',
    name: 'My Pet v0.1.0',
    target_commitish: SHA,
    body: `Built from ${SHA}.\n\n## Download`,
    published_at: '2026-10-22T05:28:33Z',
    assets: [
      { name: 'My-Pet-Mac.dmg', state: 'uploaded', size: 115864698, updated_at: '2026-10-23T18:47:54Z', browser_download_url: `${DL}My-Pet-Mac.dmg` },
      { name: 'My-Pet-Windows.exe', state: 'uploaded', size: 103014818, updated_at: '2026-10-23T18:47:54Z', browser_download_url: `${DL}My-Pet-Windows.exe` },
    ],
    ...overrides,
  };
}

describe('reading the latest release', () => {
  it('finds the download for this computer, and what it was built from', () => {
    expect(readRelease(latest(), 'win32')).toEqual({
      name: 'My Pet v0.1.0',
      commit: SHA,
      time: '2026-10-23T18:47:54Z',
      fileName: 'My-Pet-Windows.exe',
      url: `${DL}My-Pet-Windows.exe`,
      size: 103014818,
    });
    expect(readRelease(latest(), 'darwin')?.fileName).toBe('My-Pet-Mac.dmg');
    expect(readRelease(latest(), 'linux')).toBeNull();
  });

  it('takes the commit from the notes when the release only names a branch', () => {
    expect(readRelease(latest({ target_commitish: 'main' }), 'win32')?.commit).toBe(SHA);
    expect(readRelease(latest({ target_commitish: 'main', body: '' }), 'win32')?.commit).toBe('');
  });

  it('ignores a download that is still uploading, or one from anywhere else', () => {
    const uploading = latest();
    (uploading.assets[1] as Record<string, unknown>).state = 'starter';
    expect(readRelease(uploading, 'win32')).toBeNull();
    const elsewhere = latest();
    (elsewhere.assets[1] as Record<string, unknown>).browser_download_url = 'https://example.com/My-Pet-Windows.exe';
    expect(readRelease(elsewhere, 'win32')).toBeNull();
    expect(readRelease(latest({ assets: [] }), 'win32')).toBeNull();
    expect(readRelease(null, 'win32')).toBeNull();
    expect(readRelease({ message: 'Not Found' }, 'win32')).toBeNull();
  });
});

describe('whether the release is newer', () => {
  const release = readRelease(latest(), 'win32') as ReleaseBuild;

  it('is the same build when it was made from the same commit', () => {
    expect(isNewer(release, { commit: SHA, time: '2026-10-23T18:40:00Z' })).toBe(false);
    expect(isNewer(release, { commit: SHA.toUpperCase(), time: '' })).toBe(false);
  });

  it('is newer when it came out after this build was made from another commit', () => {
    expect(isNewer(release, { commit: OTHER, time: '2026-10-22T09:00:00Z' })).toBe(true);
  });

  it("isn't, against a build you made yourself since", () => {
    expect(isNewer(release, { commit: OTHER, time: '2026-10-24T09:00:00Z' })).toBe(false);
  });

  it('is, against a build that never said what it was (from before updates)', () => {
    expect(isNewer(release, { commit: '', time: '' })).toBe(true);
  });

  it("isn't, when the release doesn't say when it came out", () => {
    expect(isNewer({ ...release, time: '' }, { commit: OTHER, time: '2026-10-22T09:00:00Z' })).toBe(false);
  });
});
