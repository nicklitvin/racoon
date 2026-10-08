import { macPlatform } from './mac';
import type { PlatformAdapter } from './types';
import { windowsPlatform } from './windows';

const genericPlatform: PlatformAdapter = {
  configureApp() {},
  configureWindow(win) {
    win.setAlwaysOnTop(true);
  },
};

export const platform: PlatformAdapter =
  process.platform === 'win32' ? windowsPlatform : process.platform === 'darwin' ? macPlatform : genericPlatform;

export type { PlatformAdapter };
