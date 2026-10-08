import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, type Settings } from '../shared/settings';

interface StoredData {
  settings: Settings;
  /** The macOS keyboard permission prompt has been shown once; never show it again unasked. */
  keyboardPromptShown: boolean;
}

/** Settings persisted as JSON in the app's user-data folder. */
export class SettingsStore {
  private data: StoredData;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly file: string) {
    this.data = this.load();
  }

  get settings(): Settings {
    return this.data.settings;
  }

  get keyboardPromptShown(): boolean {
    return this.data.keyboardPromptShown;
  }

  update(patch: unknown): Settings {
    const safePatch = patch && typeof patch === 'object' ? patch : {};
    this.data.settings = normalizeSettings({ ...this.data.settings, ...safePatch });
    this.scheduleSave();
    return this.data.settings;
  }

  markKeyboardPromptShown(): void {
    this.data.keyboardPromptShown = true;
    this.scheduleSave();
  }

  /** Writes any pending change immediately (on quit). */
  flush(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.write();
  }

  private load(): StoredData {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<StoredData>;
      return { settings: normalizeSettings(raw.settings), keyboardPromptShown: raw.keyboardPromptShown === true };
    } catch {
      return { settings: normalizeSettings(undefined), keyboardPromptShown: false };
    }
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.write();
    }, 300);
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // Write-then-rename so a crash mid-write can't leave a corrupt file.
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (error) {
      console.error('Racoon: could not save settings', error);
    }
  }
}
