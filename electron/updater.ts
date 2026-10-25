import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  INITIAL_UPDATE_STATUS,
  isNewer,
  LATEST_RELEASE_API,
  readRelease,
  RELEASES_PAGE,
  type BuildStamp,
  type UpdateStatus,
} from '../shared/update';

declare const __BUILD_COMMIT__: string | undefined;
declare const __BUILD_TIME__: string | undefined;

/** What this build was made from (stamped by scripts/build-electron.mjs). */
const BUILD: BuildStamp = {
  commit: typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '',
  time: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
};

/** A first look shortly after it starts, then every few hours while it's open. */
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 4 * 60 * 60_000;

/**
 * Keeps an eye on the GitHub Releases page for a newer build, and when you say so,
 * downloads it and installs it: on Windows the installer runs by itself (closing this
 * copy, putting the new one in its place and starting it); on a Mac the disk image
 * opens for you to drag the new app into Applications.
 */
export class Updater {
  private status: UpdateStatus = { ...INITIAL_UPDATE_STATUS };
  private timer: NodeJS.Timeout | undefined;
  private busy = false;

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  /** Only installed builds update themselves (a development build would install over the real one). */
  get supported(): boolean {
    return app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');
  }

  get current(): UpdateStatus {
    return this.supported ? this.status : { ...INITIAL_UPDATE_STATUS, state: 'unsupported' };
  }

  start(): void {
    if (!this.supported) return;
    this.timer = setTimeout(() => void this.check(true), FIRST_CHECK_MS);
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  /** Looks for a newer build. `quiet` (the automatic checks) doesn't report a failure. */
  async check(quiet = false): Promise<UpdateStatus> {
    if (!this.supported) return this.current;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.check(true), CHECK_EVERY_MS);
    // Mid-download or about to install, a newer check has nothing to add.
    if (this.busy || this.status.state === 'downloading' || this.status.state === 'installing') return this.status;
    this.busy = true;
    if (!quiet) this.set({ state: 'checking', message: null });
    try {
      const response = await net.fetch(LATEST_RELEASE_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'My-Pet-updater' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub is busy, try again later' : `GitHub said ${response.status}`);
      const release = readRelease(await response.json(), process.platform);
      const checkedAt = new Date().toISOString();
      if (release && isNewer(release, BUILD)) this.set({ state: 'available', release, progress: 0, checkedAt, message: null });
      else this.set({ state: 'current', release: null, progress: 0, checkedAt, message: null });
    } catch (error) {
      // Offline, say: the automatic checks just try again later.
      if (!quiet) this.set({ state: 'error', message: `Couldn't check for updates (${reason(error)}).` });
    } finally {
      this.busy = false;
    }
    return this.status;
  }

  /** Downloads the newer build and installs it. */
  async install(): Promise<UpdateStatus> {
    const release = this.status.release;
    if (!this.supported || !release || this.busy || this.status.state === 'downloading' || this.status.state === 'installing') return this.current;
    this.busy = true;
    this.set({ state: 'downloading', progress: 0, message: null });
    try {
      const file = await this.download(release.url, release.fileName, release.size);
      this.set({ state: 'installing', progress: 1 });
      if (process.platform === 'win32') {
        // Silent, and started again once it's in (--force-run). The installer closes this
        // copy itself (build/installer.nsh), but quitting first saves the settings cleanly.
        const installer = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' });
        installer.on('error', (error) => this.set({ state: 'error', message: `Couldn't start the installer (${reason(error)}).` }));
        installer.unref();
        setTimeout(() => app.quit(), 800);
      } else {
        const error = await shell.openPath(file);
        if (error) throw new Error(error);
        this.set({ message: 'Drag My Pet into Applications to replace the old one, then open it again.' });
      }
    } catch (error) {
      this.set({ state: 'available', progress: 0, message: `Couldn't download the update (${reason(error)}). Try again, or get it from the Releases page.` });
    } finally {
      this.busy = false;
    }
    return this.status;
  }

  openReleasesPage(): void {
    void shell.openExternal(RELEASES_PAGE);
  }

  /** Into a folder of its own in temp, reporting progress as it goes, checked for size. */
  private async download(url: string, fileName: string, size: number): Promise<string> {
    const dir = path.join(app.getPath('temp'), 'My-Pet-Update');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, path.basename(fileName));
    const response = await net.fetch(url, { headers: { 'User-Agent': 'My-Pet-updater' }, cache: 'no-store' });
    if (!response.ok || !response.body) throw new Error(`GitHub said ${response.status}`);
    const total = Number(response.headers.get('content-length')) || size;
    const out = createWriteStream(file);
    const finished = new Promise<void>((resolve, reject) => {
      out.on('finish', resolve);
      out.on('error', reject);
    });
    const reader = response.body.getReader();
    let got = 0;
    let shown = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.byteLength;
        if (!out.write(value)) await new Promise((resolve) => out.once('drain', resolve));
        const progress = total > 0 ? Math.min(1, got / total) : 0;
        if (progress - shown >= 0.01) {
          shown = progress;
          this.set({ progress });
        }
      }
    } finally {
      out.end();
      await finished;
    }
    const { size: written } = await stat(file);
    if (size > 0 && written !== size) throw new Error('the download was incomplete');
    return file;
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
