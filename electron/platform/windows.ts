import type { PlatformAdapter } from './types';

export const windowsPlatform: PlatformAdapter = {
  configureApp(app) {
    // Groups the taskbar button and notifications under a stable identity (the installer's shortcuts use it too).
    app.setAppUserModelId('com.nicklitvin.racoon');
  },
  configureWindow(win) {
    // 'screen-saver' keeps the pet above normal always-on-top windows such as the taskbar.
    win.setAlwaysOnTop(true, 'screen-saver');
  },
  presentWindow(_app, win) {
    win.show();
    win.focus();
  },
  keyboardAccess: {
    // Windows has no permission gate for a low-level keyboard hook.
    check: () => 'granted',
    request: () => 'granted',
    deniedMessage: '',
    openSettings() {},
  },
};
