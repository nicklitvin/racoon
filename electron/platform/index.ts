import { macPlatform } from './mac';
import type { PlatformAdapter } from './types';
import { windowsPlatform } from './windows';

const genericPlatform: PlatformAdapter = {
  configureApp() {},
  configureWindow(win) {
    win.setAlwaysOnTop(true);
  },
  raiseWindow(win) {
    win.moveTop();
  },
  keepInFront(win) {
    // No telling what's stacked above it here, so it just goes back in front now and then.
    const timer = setInterval(() => !win.isDestroyed() && win.moveTop(), 3000);
    return () => clearInterval(timer);
  },
  presentWindow(_app, win) {
    win.show();
    win.focus();
  },
  keyboardAccess: {
    check: () => 'granted',
    request: () => 'granted',
    deniedMessage: '',
    openSettings() {},
  },
};

export const platform: PlatformAdapter =
  process.platform === 'win32' ? windowsPlatform : process.platform === 'darwin' ? macPlatform : genericPlatform;

export type { PlatformAdapter };
