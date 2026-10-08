import type { PlatformAdapter } from './types';

export const macPlatform: PlatformAdapter = {
  configureApp(app) {
    // No Dock icon; the app is controlled from the menu bar tray icon.
    app.dock?.hide();
  },
  configureWindow(win) {
    win.setAlwaysOnTop(true, 'floating');
    // Follow the user across Spaces and stay visible over full-screen apps.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  },
};
