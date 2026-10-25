// Updates from the GitHub Releases page: what's out there, and whether it's newer than
// the build that's running. Shared by the main process (which does the checking and
// downloading) and the settings (which show it). Free of Node, Electron and DOM.

/** Where releases come from. */
export const RELEASE_REPO = 'nicklitvin/racoon';
export const LATEST_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`;
/** Only downloads from this repo's own releases are ever fetched. */
const DOWNLOAD_PREFIX = `https://github.com/${RELEASE_REPO}/releases/download/`;

/** What the running build was made from, stamped in at build time. */
export interface BuildStamp {
  /** Git commit, or '' if unknown. */
  commit: string;
  /** ISO time it was built, or '' if unknown. */
  time: string;
}

/** The download for this computer from the latest release. */
export interface ReleaseBuild {
  /** "My Pet v0.1.0". */
  name: string;
  /** The commit it was built from, or '' if the release doesn't say. */
  commit: string;
  /** When the download was uploaded (ISO): when this build came out. */
  time: string;
  /** The download itself. */
  fileName: string;
  url: string;
  size: number;
}

export type UpdateState =
  /** Not checked yet. */
  | 'idle'
  | 'checking'
  /** Running the latest. */
  | 'current'
  /** A newer build is out. */
  | 'available'
  | 'downloading'
  /** Downloaded; the installer is starting (Windows), or open for you to drag in (Mac). */
  | 'installing'
  | 'error'
  /** Updates don't work here (a browser tab, or a development build). */
  | 'unsupported';

export interface UpdateStatus {
  state: UpdateState;
  /** The newer build, when there is one. */
  release: ReleaseBuild | null;
  /** Downloading: how far along, 0 to 1. */
  progress: number;
  /** When it last checked (ISO), if it has. */
  checkedAt: string | null;
  /** What went wrong, or what to do next, in words. */
  message: string | null;
}

export const INITIAL_UPDATE_STATUS: UpdateStatus = { state: 'idle', release: null, progress: 0, checkedAt: null, message: null };

/** The download for each platform, by file name. Linux isn't built. */
const DOWNLOAD_FOR: Record<string, (name: string) => boolean> = {
  win32: (name) => name.toLowerCase().endsWith('.exe'),
  darwin: (name) => name.toLowerCase().endsWith('.dmg'),
};

const SHA = /^[0-9a-f]{40}$/i;

/**
 * Reads GitHub's "latest release" reply: the download for `platform` and what it was built
 * from. Null if there isn't one (none for this platform, or the release is mid-upload).
 */
export function readRelease(json: unknown, platform: string): ReleaseBuild | null {
  if (!json || typeof json !== 'object') return null;
  const release = json as Record<string, unknown>;
  const wanted = DOWNLOAD_FOR[platform];
  if (!wanted || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find((a: unknown): a is Record<string, unknown> => {
    if (!a || typeof a !== 'object') return false;
    const { name, state, browser_download_url: url } = a as Record<string, unknown>;
    return typeof name === 'string' && wanted(name) && state === 'uploaded' && typeof url === 'string' && url.startsWith(DOWNLOAD_PREFIX);
  });
  if (!asset) return null;
  const target = typeof release.target_commitish === 'string' ? release.target_commitish : '';
  // The release workflow also says which commit in its notes ("Built from <sha>.").
  const fromBody = typeof release.body === 'string' ? /Built from ([0-9a-f]{40})/i.exec(release.body)?.[1] : undefined;
  const commit = SHA.test(target) ? target : (fromBody ?? '');
  return {
    name: typeof release.name === 'string' && release.name ? release.name : String(release.tag_name ?? 'New version'),
    commit: commit.toLowerCase(),
    time: String(asset.updated_at ?? release.published_at ?? ''),
    fileName: String(asset.name),
    url: String(asset.browser_download_url),
    size: typeof asset.size === 'number' ? asset.size : 0,
  };
}

/**
 * Whether `release` is newer than the build running. Every push to main rebuilds the same
 * version's release, so the version number doesn't say: the commit does. Built from the
 * same commit, it's the same. Otherwise, it's newer if it came out after this build was
 * made (a build you made yourself since then is newer than the release, not older).
 */
export function isNewer(release: ReleaseBuild, build: BuildStamp): boolean {
  if (release.commit && build.commit && release.commit === build.commit.toLowerCase()) return false;
  const released = Date.parse(release.time);
  const built = Date.parse(build.time);
  if (Number.isNaN(released)) return false;
  if (Number.isNaN(built)) return true;
  return released > built;
}
