import { shell, systemPreferences } from 'electron';
import type { PlatformAdapter } from './types';

const PRIVACY_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';

export const macPlatform: PlatformAdapter = {
  configureApp(app) {
    // No Dock icon; the app is controlled from the menu bar icon.
    app.dock?.hide();
  },
  configureWindow(win) {
    win.setAlwaysOnTop(true, 'floating');
    // Follow the user across Spaces and stay visible over full-screen apps.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  },
  trayClickOpensSettings: false,
  presentWindow(app, win) {
    win.show();
    // A Dock-less app has to explicitly take focus for its window to come forward.
    app.focus({ steal: true });
    win.focus();
  },
  keyboardAccess: {
    // The global key hook needs the Accessibility permission (macOS also lists it under
    // Input Monitoring). Passing false checks without prompting.
    check: () => (systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'),
    // Passing true shows the system prompt if access hasn't been granted yet.
    request: () => (systemPreferences.isTrustedAccessibilityClient(true) ? 'granted' : 'denied'),
    deniedMessage:
      'macOS has not allowed Racoon to notice key presses. Open System Settings > Privacy & Security > ' +
      'Accessibility (and Input Monitoring, if Racoon is listed there), switch Racoon on, then click "Check again". ' +
      'Everything else keeps working without it.',
    openSettings() {
      void shell.openExternal(PRIVACY_PANE);
    },
  },
};
