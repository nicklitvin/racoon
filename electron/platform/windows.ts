import type { PlatformAdapter } from './types';

export const windowsPlatform: PlatformAdapter = {
  configureApp(app) {
    // Groups notifications and the tray entry under a stable identity.
    app.setAppUserModelId('com.nicklitvin.racoon');
  },
  configureWindow(win) {
    // 'screen-saver' keeps the pet above normal always-on-top windows such as the taskbar.
    win.setAlwaysOnTop(true, 'screen-saver');
  },
};
